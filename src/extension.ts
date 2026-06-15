import * as vscode from 'vscode';
import { SimulatorPanel } from './panel';
import { HelpPanel } from './help';
import { promptLibraryUpdates } from './updates';

export function activate(context: vscode.ExtensionContext): void {
  // Vue de la barre d'activité : un écran d'accueil (viewsWelcome) avec ses
  // boutons. On n'ouvre JAMAIS le simulateur automatiquement — ni au lancement,
  // ni quand le volet (re)devient visible : la visibilité change aussi lors de
  // la restauration de session au démarrage, ce qui rouvrait le panneau. Le
  // simulateur s'ouvre uniquement sur clic d'un bouton d'accueil ou d'une
  // commande Kablix.
  const homeView = vscode.window.createTreeView('kablix.home', {
    treeDataProvider: {
      getChildren: () => [],
      getTreeItem: (item: vscode.TreeItem) => item,
    },
  });
  context.subscriptions.push(homeView);

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
