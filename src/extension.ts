import * as vscode from 'vscode';
import { SimulatorPanel } from './panel';
import { HelpPanel } from './help';
import { promptLibraryUpdates } from './updates';
import { upgradeFirmware, checkFirmwareUpdate } from './firmware';
import { saveDefaultLayout } from './layout';

export function activate(context: vscode.ExtensionContext): void {
  // Vue de la barre d'activité : cliquer l'icône Kablix ouvre DIRECTEMENT le
  // simulateur (panneau éditeur) et rend la main au volet Explorateur, pour que
  // le volet Kablix (quasi vide) n'occupe pas la barre latérale.
  const homeView = vscode.window.createTreeView('kablix.home', {
    treeDataProvider: {
      getChildren: () => [],
      getTreeItem: (item: vscode.TreeItem) => item,
    },
  });
  // Garde-fou de démarrage : on ignore les changements de visibilité des
  // premières ~1,2 s (la restauration de session peut faire transiter le volet
  // hidden→visible sans action de l'utilisateur, ce qui rouvrait le simulateur
  // au lancement).
  let startupSettled = false;
  const startupTimer = setTimeout(() => {
    startupSettled = true;
  }, 1200);
  context.subscriptions.push(
    homeView,
    new vscode.Disposable(() => clearTimeout(startupTimer)),
    homeView.onDidChangeVisibility((e) => {
      if (!e.visible || !startupSettled) return;
      SimulatorPanel.createOrShow(context);
      // Rebascule sur l'Explorateur : le volet Kablix ne reste pas affiché.
      void vscode.commands.executeCommand('workbench.view.explorer');
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
    vscode.commands.registerCommand('kablix.upgradePicoFirmware', () => {
      void upgradeFirmware(context);
    }),
    vscode.commands.registerCommand('kablix.openHelp', () => {
      HelpPanel.createOrShow();
    }),
    vscode.commands.registerCommand('kablix.saveDefaultLayout', () => {
      void saveDefaultLayout(context);
    })
  );

  // Double-clic sur un .projix dans l'explorateur : éditeur personnalisé
  // « relais » — l'onglet ouvre le projet dans le simulateur Kablix puis se
  // referme aussitôt (le .projix est une archive ZIP, illisible en texte).
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'kablix.projix',
      {
        openCustomDocument: (uri: vscode.Uri) => ({ uri, dispose: () => undefined }),
        resolveCustomEditor: (
          document: vscode.CustomDocument,
          webviewPanel: vscode.WebviewPanel
        ) => {
          webviewPanel.webview.html = '<!doctype html><html><body></body></html>';
          const panel = SimulatorPanel.createOrShow(context);
          void panel.openProject(document.uri);
          // Fermeture différée : l'onglet relais doit être résolu avant d'être fermé.
          setTimeout(() => webviewPanel.dispose(), 0);
        },
      },
      { supportsMultipleEditorsPerDocument: false }
    )
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

  const checkFirmwareOnStartup = vscode.workspace
    .getConfiguration('kablix')
    .get<boolean>('checkFirmwareUpdatesOnStartup', false);
  if (checkFirmwareOnStartup) {
    void checkFirmwareUpdate(context, true);
  }

  // Restauration au démarrage : rouvre le dernier projet (.projix) ouvert à la
  // fermeture, dans le simulateur — comme un onglet VS Code classique. Les
  // autres onglets texte (le fichier de code inclus) sont restaurés nativement
  // par VS Code. Opt-out via le réglage `kablix.restoreLastProjectOnStartup`.
  const restoreProject = vscode.workspace
    .getConfiguration('kablix')
    .get<boolean>('restoreLastProjectOnStartup', true);
  if (restoreProject) {
    const last = SimulatorPanel.lastProjectUri(context);
    if (last) {
      void vscode.workspace.fs.stat(last).then(
        () => {
          const panel = SimulatorPanel.createOrShow(context);
          void panel.openProject(last);
        },
        () => undefined // dernier projet déplacé/supprimé : rien à rouvrir
      );
    }
  }
}

export function deactivate(): void {
  SimulatorPanel.dispose();
}
