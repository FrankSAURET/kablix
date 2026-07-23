import * as vscode from 'vscode';

/**
 * PROTOTYPE JETABLE — validation du « point ● modifié » natif de VS Code.
 *
 * But : voir si un CustomEditor donne le vrai point natif sur la croix de
 * fermeture (comme un fichier texte), Ctrl+S natif et le prompt « enregistrer
 * les modifications ? » à la fermeture — ce qu'un WebviewPanel classique
 * (SimulatorPanel) NE peut PAS avoir.
 *
 * N'utilise PAS la vraie webview Kablix : contenu HTML minimal avec un bouton
 * « modifier » qui appelle onDidChangeCustomDocument → VS Code doit alors
 * afficher le ● natif tout seul.
 *
 * À supprimer après décision. Activé par la commande `kablix.protoCustomEditor`.
 */

const VIEW_TYPE = 'kablix.protoCustomEditor';

/** Document custom minimal : juste un compteur de modifications en mémoire. */
class ProtoDocument implements vscode.CustomDocument {
  public edits = 0;
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {}
}

class ProtoProvider implements vscode.CustomEditorProvider<ProtoDocument> {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<vscode.CustomDocumentEditEvent<ProtoDocument>>();
  // VS Code écoute cet event : chaque émission marque le document « dirty »
  // (point ● natif) et alimente la pile undo/redo.
  public readonly onDidChangeCustomDocument = this.onDidChangeEmitter.event;

  openCustomDocument(uri: vscode.Uri): ProtoDocument {
    return new ProtoDocument(uri);
  }

  resolveCustomEditor(document: ProtoDocument, panel: vscode.WebviewPanel): void {
    panel.webview.options = { enableScripts: true };
    panel.webview.html = /* html */ `
      <!doctype html><html><body style="font-family:sans-serif;padding:1rem">
        <h2>Prototype CustomEditor</h2>
        <p>Fichier : ${document.uri.fsPath.split(/[\\/]/).pop()}</p>
        <p>Clique « Modifier » → l'onglet doit afficher le point ● natif
           (sur la croix de fermeture), Ctrl+S doit sauvegarder, fermer doit
           proposer d'enregistrer.</p>
        <button id="edit">Modifier</button>
        <pre id="log"></pre>
        <script>
          const vs = acquireVsCodeApi();
          document.getElementById('edit').onclick = () => vs.postMessage({ type: 'edit' });
          window.addEventListener('message', e => {
            document.getElementById('log').textContent += e.data.text + '\\n';
          });
        </script>
      </body></html>`;

    panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'edit') {
        document.edits++;
        // Déclenche le ● natif + entrée undo. undo/redo sont fournis pour
        // que la pile VS Code soit cohérente ; ici on ne fait qu'incrémenter.
        this.onDidChangeEmitter.fire({
          document,
          label: 'Modifier',
          undo: () => { document.edits--; },
          redo: () => { document.edits++; },
        });
      }
    });
  }

  // Ctrl+S : VS Code appelle ceci. On simule une écriture (le ● natif disparaît
  // automatiquement au retour de la promesse).
  saveCustomDocument(document: ProtoDocument): Thenable<void> {
    vscode.window.setStatusBarMessage(`Proto: saved (${document.edits} edits)`, 3000);
    return Promise.resolve();
  }
  saveCustomDocumentAs(document: ProtoDocument, target: vscode.Uri): Thenable<void> {
    vscode.window.setStatusBarMessage(`Proto: saved as ${target.fsPath}`, 3000);
    return Promise.resolve();
  }
  revertCustomDocument(): Thenable<void> {
    return Promise.resolve();
  }
  backupCustomDocument(
    _document: ProtoDocument,
    context: vscode.CustomDocumentBackupContext
  ): Thenable<vscode.CustomDocumentBackup> {
    return Promise.resolve({ id: context.destination.toString(), delete: () => {} });
  }
}

/** Enregistre le prototype + une commande pour l'ouvrir sur un fichier bidon. */
export function registerProtoCustomEditor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new ProtoProvider(), {
      supportsMultipleEditorsPerDocument: false,
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kablix.protoCustomEditor', async () => {
      // Crée/ouvre un fichier bidon dans le scratchpad du workspace pour avoir
      // un URI réel à ouvrir dans le CustomEditor.
      const folders = vscode.workspace.workspaceFolders;
      const base = folders?.length ? folders[0].uri : vscode.Uri.file('.');
      const uri = vscode.Uri.joinPath(base, 'proto-test.kxproto');
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode('proto'));
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    })
  );
}
