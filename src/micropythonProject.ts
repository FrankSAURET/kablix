// Distinguer un programme MicroPython d'un programme Python ordinaire.
//
// VS Code donne le même langage (`python`) aux deux : rien dans l'éditeur ne
// les sépare. Le critère retenu est celui de l'extension MicroPico — un fichier
// `.micropico` à la racine du projet, au contenu fixe :
//
//     { "info": "This file is just used to identify a project folder." }
//
// Un `.py` est MicroPython si et seulement si un tel fichier existe dans son
// dossier ou dans un dossier parent (sans remonter au-dessus du dossier de
// travail). Un `.micropico` au contenu différent ne compte pas.
//
// Le résultat est publié en contexte (`kablix.micropythonFiles`, liste d'URI)
// pour les `when` de package.json : boutons Envoyer/Arrêter de la carte affichés,
// triangle « Exécuter le fichier Python » masqué.
import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Clé de contexte : URI (chaînes) des fichiers MicroPython visibles. */
export const MICROPYTHON_FILES_CONTEXT = 'kablix.micropythonFiles';

/** Nom et contenu attendu du fichier qui marque un projet MicroPython. */
const MARKER = '.micropico';
const MARKER_INFO = 'This file is just used to identify a project folder.';

/** Le dossier contient-il un `.micropico` valide ? */
function hasMarker(dir: string): boolean {
  const file = join(dir, MARKER);
  if (!existsSync(file)) return false;
  try {
    const json = JSON.parse(readFileSync(file, 'utf-8')) as { info?: unknown };
    return json.info === MARKER_INFO;
  } catch {
    return false; // JSON illisible : pas un marqueur
  }
}

/**
 * Un fichier `.py` appartient-il à un projet MicroPython ? Remonte du dossier
 * du fichier jusqu'à la racine du dossier de travail (ou du disque, hors
 * dossier de travail).
 */
export function isMicroPythonFile(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file' || !/\.py$/i.test(uri.fsPath)) return false;
  const root = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  let dir = dirname(uri.fsPath);
  for (;;) {
    if (hasMarker(dir)) return true;
    if (root && dir.toLowerCase() === root.toLowerCase()) return false;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * Tient à jour le contexte : à chaque changement d'onglets visibles, et quand
 * un `.micropico` apparaît, change ou disparaît. Une liste plutôt qu'un booléen :
 * avec deux éditeurs côte à côte, chaque onglet garde ses propres boutons.
 */
export function watchMicroPythonFiles(): vscode.Disposable {
  let last = '';
  const refresh = (): void => {
    const uris = new Set<string>();
    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri;
      if (isMicroPythonFile(uri)) uris.add(uri.toString());
    }
    const list = [...uris].sort();
    const key = list.join('\n');
    if (key === last) return;
    last = key;
    void vscode.commands.executeCommand('setContext', MICROPYTHON_FILES_CONTEXT, list);
  };

  // Triangle « Exécuter le fichier Python » (extension Python, menu
  // `editor/title/run`) : son `when` exige `shellExecutionSupported`, clé globale
  // de VS Code. La passer à faux est le SEUL moyen de le masquer depuis une autre
  // extension. Effet de bord mesuré dans VS Code : les tâches de `tasks.json` sont
  // ignorées tant qu'elle est fausse — d'où le réglage pour s'en passer, et le
  // retour à vrai dès que l'onglet actif n'est plus un programme MicroPython.
  let runHidden = false;
  const refreshRunButton = (): void => {
    const editor = vscode.window.activeTextEditor;
    const hide =
      vscode.workspace.getConfiguration('kablix').get<boolean>('hidePythonRunButton', true) &&
      !!editor &&
      isMicroPythonFile(editor.document.uri);
    if (hide === runHidden) return;
    runHidden = hide;
    void vscode.commands.executeCommand('setContext', 'shellExecutionSupported', !hide);
  };

  const watcher = vscode.workspace.createFileSystemWatcher(`**/${MARKER}`);
  // Le contenu change aussi le verdict : forcer le recalcul complet.
  const recompute = (): void => {
    last = '\0';
    refresh();
    refreshRunButton();
  };
  refresh();
  refreshRunButton();
  return vscode.Disposable.from(
    watcher,
    watcher.onDidCreate(recompute),
    watcher.onDidChange(recompute),
    watcher.onDidDelete(recompute),
    vscode.window.onDidChangeVisibleTextEditors(refresh),
    vscode.window.onDidChangeActiveTextEditor(refreshRunButton),
    vscode.workspace.onDidChangeWorkspaceFolders(recompute),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('kablix.hidePythonRunButton')) refreshRunButton();
    }),
    // Désactivation de l'extension : rendre la clé à VS Code.
    new vscode.Disposable(() => {
      if (runHidden) void vscode.commands.executeCommand('setContext', 'shellExecutionSupported', true);
    })
  );
}
