import * as vscode from 'vscode';
import { SimulatorPanel } from './panel';
import { HelpPanel } from './help';
import { promptLibraryUpdates } from './updates';

export function activate(context: vscode.ExtensionContext): void {
  // Vue de la barre d'activité : cliquer l'icône Kablix ouvre le simulateur.
  const homeView = vscode.window.createTreeView('kablix.home', {
    treeDataProvider: {
      getChildren: () => [],
      getTreeItem: (item: vscode.TreeItem) => item,
    },
  });
  // On n'ouvre pas le simulateur au lancement (si VS Code restaure le volet
  // Kablix au démarrage) ; seulement sur un clic ultérieur sur l'icône. Un court
  // délai laisse passer la restauration initiale du volet.
  let startupSettled = false;
  const startupTimer = setTimeout(() => {
    startupSettled = true;
  }, 2000);
  context.subscriptions.push(
    homeView,
    new vscode.Disposable(() => clearTimeout(startupTimer)),
    homeView.onDidChangeVisibility((e) => {
      if (e.visible && startupSettled) SimulatorPanel.createOrShow(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kablix.openSimulator', () => {
      SimulatorPanel.createOrShow(context);
    }),
    vscode.commands.registerCommand('kablix.compileAndRun', () => {
      const panel = SimulatorPanel.createOrShow(context);
      void panel.compileActiveFile();
    }),
    vscode.commands.registerCommand('kablix.loadWorkspaceArtifact', () => {
      const panel = SimulatorPanel.createOrShow(context);
      void panel.loadWorkspaceArtifact();
    }),
    vscode.commands.registerCommand('kablix.saveProject', () => {
      // Révèle le panneau puis demande le schéma à la webview (→ 'saveProject').
      const panel = SimulatorPanel.createOrShow(context);
      panel.requestSaveProject();
    }),
    vscode.commands.registerCommand('kablix.openProject', () => {
      const panel = SimulatorPanel.createOrShow(context);
      void panel.openProject();
    }),
    vscode.commands.registerCommand('kablix.exportWokwiDiagram', () => {
      // Révèle le panneau puis demande le schéma converti (→ 'wokwiExport').
      const panel = SimulatorPanel.createOrShow(context);
      panel.requestWokwiExport();
    }),
    vscode.commands.registerCommand('kablix.importWokwiDiagram', () => {
      const panel = SimulatorPanel.createOrShow(context);
      void panel.importWokwiDiagram();
    }),
    vscode.commands.registerCommand('kablix.checkLibraryUpdates', () => {
      // Vérification manuelle : affiche aussi la notification « à jour ».
      void promptLibraryUpdates(false);
    }),
    vscode.commands.registerCommand('kablix.openHelp', () => {
      HelpPanel.createOrShow();
    })
  );

  // Empêche VS Code de rouvrir le panneau du simulateur au lancement : un
  // panneau restauré est immédiatement fermé (l'utilisateur le rouvre via
  // l'icône Kablix ou la commande).
  if (vscode.window.registerWebviewPanelSerializer) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(SimulatorPanel.viewType, {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
          panel.dispose();
        },
      })
    );
  }

  // Vérification au démarrage, opt-in et non bloquante (silence si à jour).
  const checkOnStartup = vscode.workspace
    .getConfiguration('kablix')
    .get<boolean>('checkUpdatesOnStartup', false);
  if (checkOnStartup) {
    void promptLibraryUpdates(true);
  }
}

export function deactivate(): void {
  SimulatorPanel.dispose();
}
