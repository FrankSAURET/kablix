import * as vscode from 'vscode';
import { SimulatorPanel } from './panel';
import { buildWebviewHtml } from './webview-html';
import { applyDefaultLayout, lockSimulatorGroup } from './layout';
import { unpackProject } from './projix';

const l10n = vscode.l10n;

/**
 * Représentation canonique d'un schéma .projix pour comparer DEUX enregistrements
 * indépendamment des identifiants : les ids des composants et des fils sont
 * régénérés à chaque chargement (uid), donc un même schéma sauvé deux fois porte
 * des ids différents. On remappe les ids sur leur INDEX (l'ordre est conservé)
 * puis on sérialise ; deux schémas identiques donnent la même chaîne.
 */
function canonicalDiagram(diagram: unknown): string {
  const d = (diagram ?? {}) as {
    parts?: Array<{ id?: string; [k: string]: unknown }>;
    wires?: Array<{ id?: string; a?: { partId?: string }; b?: { partId?: string }; [k: string]: unknown }>;
    camera?: unknown;
    customParts?: unknown;
  };
  const parts = d.parts ?? [];
  const idIndex = new Map<string, number>();
  parts.forEach((p, i) => {
    if (typeof p.id === 'string') idIndex.set(p.id, i);
  });
  const remapPart = (partId?: string): number =>
    partId !== undefined && idIndex.has(partId) ? idIndex.get(partId)! : -1;
  const normParts = parts.map((p) => {
    const { id: _id, ...rest } = p;
    return rest;
  });
  const normWires = (d.wires ?? []).map((w) => {
    const { id: _id, a, b, ...rest } = w;
    return {
      ...rest,
      a: { ...(a ?? {}), partId: remapPart(a?.partId) },
      b: { ...(b ?? {}), partId: remapPart(b?.partId) },
    };
  });
  // La CAMÉRA (zoom/position) est volontairement EXCLUE : un zoom ne marque pas
  // le projet « modifié » (cf. onCameraChange), il ne doit donc pas faire réapparaître
  // le ● à la réouverture. customParts fait partie du schéma (inclus).
  return JSON.stringify({ parts: normParts, wires: normWires, customParts: d.customParts ?? null });
}

/**
 * Éditeur personnalisé des projets Kablix (`.projix`). Remplace le WebviewPanel
 * singleton historique : l'onglet EST le document .projix, ce qui donne le VRAI
 * point ● « non enregistré » NATIF de VS Code (sur la croix de fermeture),
 * Ctrl+S natif et le prompt de fermeture natif — impossibles avec un
 * WebviewPanel classique.
 *
 * Chaque document ouvre sa propre session SimulatorPanel (via createForHost),
 * qui garde toute la logique métier (simulation, débogage, exports, pont
 * réseau…). L'adaptateur SimulatorHost traduit le « non enregistré » interne en
 * event onDidChangeCustomDocument (→ ● natif).
 */

/** Document .projix : juste l'URI + un miroir de l'état « modifié » de la
 *  session, pour que VS Code sache s'il reste des modifications. */
class ProjixDocument implements vscode.CustomDocument {
  public session: SimulatorPanel | undefined;
  /** URI d'un backup hot-exit à recharger au lieu du fichier disque (undefined
   *  en ouverture normale). */
  public backupUri: vscode.Uri | undefined;
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {
    // La session est disposée via le onDidDispose du WebviewPanel (resolve).
  }
}

export class ProjixEditorProvider implements vscode.CustomEditorProvider<ProjixDocument> {
  public static readonly viewType = 'kablix.projix';

  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<vscode.CustomDocumentEditEvent<ProjixDocument>>();
  /** VS Code écoute cet event : chaque émission marque le document « modifié »
   *  (● natif) et alimente la pile undo/redo. */
  public readonly onDidChangeCustomDocument = this.onDidChangeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext
  ): ProjixDocument {
    const doc = new ProjixDocument(uri);
    // Hot-exit : VS Code fournit l'ID du backup à recharger (schéma non
    // enregistré sauvé par backupCustomDocument). On le mémorise pour que
    // resolveCustomEditor charge ce backup plutôt que le fichier disque.
    doc.backupUri = openContext.backupId
      ? vscode.Uri.parse(openContext.backupId)
      : undefined;
    return doc;
  }

  async resolveCustomEditor(
    document: ProjixDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const extensionUri = this.context.extensionUri;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'dist'),
        vscode.Uri.joinPath(extensionUri, 'media'),
      ],
    };
    panel.webview.html = buildWebviewHtml(panel.webview, extensionUri);

    // Adaptateur hôte. Le point ● « non enregistré » NATIF est piloté par la
    // pile d'edits du CustomEditor : chaque édition utilisateur (onDocEdit) empile
    // un edit ; Ctrl+Z/Y natifs de VS Code appellent undo/redo, relayés à la
    // webview qui exécute le vrai historique. La pile VS Code reste ainsi le
    // reflet exact de « modifié depuis le dernier enregistrement ».
    const session = SimulatorPanel.createForHost(
      {
        get webview() {
          return panel.webview;
        },
        get viewColumn() {
          return panel.viewColumn;
        },
        reveal: (column, preserveFocus) => panel.reveal(column, preserveFocus),
        dispose: () => panel.dispose(),
        onDidDispose: (listener, thisArgs, disposables) =>
          panel.onDidDispose(listener, thisArgs, disposables),
        // Colonne gérée par VS Code : pas d'équivalent onDidChangeViewState utile.
        onDidChangeViewState: () => undefined,
        // Le ● est piloté par onDocEdit + la pile d'edits, pas par le titre.
        setDirtyIndicator: () => undefined,
        onDocEdit: () => {
          this.onDidChangeEmitter.fire({
            document,
            label: l10n.t('Edit'),
            undo: () => document.session?.postUndo(),
            redo: () => document.session?.postRedo(),
          });
        },
      },
      this.context
    );
    document.session = session;
    session.bindDocument(document.uri);

    // Priorité au backup hot-exit (schéma non enregistré restauré par VS Code) ;
    // sinon le fichier .projix sur disque ; untitled sans backup = atelier vide.
    const source = document.backupUri ?? document.uri;
    if (source.scheme !== 'untitled') {
      try {
        const bytes = await vscode.workspace.fs.readFile(source);
        if (bytes.length > 0) await session.loadProjixBytes(bytes, document.uri);
      } catch {
        // fichier illisible / vide : atelier vide (l'utilisateur repart de zéro).
      }
    }
    // Restauré depuis un backup = potentiellement des modifications non
    // enregistrées → point ●. MAIS VS Code écrit un backup hot-exit de CHAQUE
    // onglet à la fermeture, même propre : un projet sauvé avant de quitter
    // revenait donc marqué « à enregistrer ». On ne remet le ● que si le backup
    // DIFFÈRE réellement du fichier disque (untitled : toujours, pas de disque).
    if (document.backupUri && (await this.backupDiffersFromDisk(document))) {
      setTimeout(() => session.markDirtyFromRestore(), 0);
    }

    // Disposition par défaut à la première ouverture de la session : explorateur
    // fermé, grille 1/3 code · 2/3 simulateur, groupe du simulateur verrouillé
    // (le code ouvert ensuite va à gauche). Idempotent/session (applyDefaultLayout).
    //
    // Comme en v163 (constructeur du panel singleton), le layout DOIT être posé
    // quand le groupe du .projix est le groupe ACTIF — sinon setEditorLayout est
    // écrasé (grille figée à 50/50) et lockEditorGroup verrouille le mauvais
    // groupe. En CustomEditor le panneau n'est pas actif dès resolveCustomEditor :
    // on attend donc `panel.active` (ou on agit tout de suite s'il l'est déjà).
    const layout = () => {
      void applyDefaultLayout(this.context).then(() => lockSimulatorGroup());
    };
    if (panel.active) {
      setTimeout(layout, 80);
    } else {
      const once = panel.onDidChangeViewState(() => {
        if (!panel.active) return;
        once.dispose();
        setTimeout(layout, 80);
      });
    }
  }

  /** Le backup hot-exit reflète-t-il des modifications non enregistrées ?
   *  - untitled : oui (aucun fichier disque de référence) ;
   *  - fichier .projix : seulement si le SCHÉMA du backup diffère de celui sur
   *    disque. VS Code sauve un backup de CHAQUE onglet à la fermeture (même
   *    propre) ; comparer les octets bruts ne marche pas (le manifeste porte un
   *    `createdAt` horodaté et le zip des dates → toujours différents), on compare
   *    donc le schéma décodé et normalisé (ids régénérés au chargement ignorés). */
  private async backupDiffersFromDisk(document: ProjixDocument): Promise<boolean> {
    if (!document.backupUri) return false;
    if (document.uri.scheme === 'untitled') return true;
    try {
      const [backup, disk] = await Promise.all([
        vscode.workspace.fs.readFile(document.backupUri),
        vscode.workspace.fs.readFile(document.uri),
      ]);
      const [pb, pd] = await Promise.all([unpackProject(backup), unpackProject(disk)]);
      const diff =
        canonicalDiagram(pb.diagram) !== canonicalDiagram(pd.diagram) ||
        pb.manifest.board !== pd.manifest.board;
      return diff;
    } catch {
      // Décodage impossible (fichier déplacé/supprimé, archive illisible) : on
      // conserve le backup (● affiché) plutôt que de perdre des modifications.
      return true;
    }
  }

  /** Ctrl+S natif : demande le schéma courant à la session et écrit le .projix. */
  async saveCustomDocument(
    document: ProjixDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.session?.saveToDocument(document.uri);
  }

  async saveCustomDocumentAs(
    document: ProjixDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.session?.saveToDocument(destination);
  }

  async revertCustomDocument(document: ProjixDocument): Promise<void> {
    // Recharge le contenu du disque dans la webview (annule les modifications).
    if (document.uri.scheme === 'untitled') return;
    const bytes = await vscode.workspace.fs.readFile(document.uri);
    await document.session?.loadProjixBytes(bytes, document.uri);
  }

  async backupCustomDocument(
    document: ProjixDocument,
    backup: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    // Hot-exit : écrit le schéma courant dans le fichier de backup fourni SANS
    // en faire la cible d'enregistrement (oneShot) — sinon les Ctrl+S/saves
    // suivants viseraient le backup (nom perdu, « enregistrer sous »).
    await document.session?.saveToDocument(backup.destination, true);
    return {
      id: backup.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(backup.destination);
        } catch {
          // déjà supprimé : rien à faire
        }
      },
    };
  }
}

/** Enregistre l'éditeur .projix. */
export function registerProjixEditor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ProjixEditorProvider.viewType,
      new ProjixEditorProvider(context),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );
}
