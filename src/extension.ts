import * as vscode from 'vscode';
import { SimulatorPanel } from './panel';
import { HelpPanel } from './help';
import { promptLibraryUpdates } from './updates';
import { upgradeFirmware, checkFirmwareUpdate } from './firmware';
import { saveDefaultLayout, applyDefaultLayout } from './layout';
import { registerProjixEditor, ProjixEditorProvider } from './projix-editor';
import { associateProjix, promptProjixAssociationOnFirstRun } from './associate';

const l10n = vscode.l10n;

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
      // Icône Kablix : révèle l'atelier .projix actif s'il y en a un, sinon en
      // ouvre un nouveau (document untitled). On NE rebascule PAS sur
      // l'Explorateur (ça volait le focus au .projix → applyDefaultLayout, qui
      // attend `panel.active`, ne se posait jamais quand un dossier était ouvert,
      // et rouvrait la sidebar que le layout veut fermer). On se contente de
      // fermer la sidebar Kablix : le layout du .projix (explorateur fermé +
      // grille 1/3-2/3) fait le reste. reveal() ferme aussi la sidebar.
      const active = SimulatorPanel.active();
      if (active) {
        // reveal() rend le groupe du .projix actif → applyDefaultLayout peut
        // reposer la grille sur le BON groupe. `force` : un clic sur l'icône est
        // une action explicite, on rétablit la disposition Kablix même si elle a
        // déjà été posée cette session (ex. explorateur rouvert entre-temps).
        active.reveal();
        setTimeout(() => void applyDefaultLayout(context, true), 80);
      } else {
        // Nouveau projet : resolveCustomEditor pose déjà le layout à panel.active.
        // On force en plus (clic icône = action explicite) au cas où la
        // disposition aurait déjà été consommée cette session.
        void openNewProjix().then(() =>
          setTimeout(() => void applyDefaultLayout(context, true), 120)
        );
      }
    })
  );

  // Éditeur personnalisé des projets .projix : l'onglet EST le document, d'où le
  // point ● « non enregistré » NATIF, Ctrl+S natif et le prompt de fermeture natif.
  registerProjixEditor(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('kablix.openSimulator', () => {
      void openNewProjix();
    }),
    vscode.commands.registerCommand('kablix.compileAndRun', () => {
      void SimulatorPanel.active()?.compileActiveFile();
    }),
    vscode.commands.registerCommand('kablix.loadWorkspaceArtifact', () => {
      void SimulatorPanel.active()?.loadWorkspaceArtifact();
    }),
    vscode.commands.registerCommand('kablix.saveProject', () => {
      // Enregistrement natif de l'onglet .projix actif (Ctrl+S).
      void vscode.commands.executeCommand('workbench.action.files.save');
    }),
    vscode.commands.registerCommand('kablix.openProject', () => {
      void openProjixViaDialog(context);
    }),
    vscode.commands.registerCommand('kablix.exportWokwiDiagram', () => {
      SimulatorPanel.active()?.requestWokwiExport();
    }),
    vscode.commands.registerCommand('kablix.importWokwiDiagram', () => {
      void SimulatorPanel.active()?.importWokwiDiagram();
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
    }),
    vscode.commands.registerCommand('kablix.associateProjix', () => {
      void associateProjix(context);
    })
  );

  // Première activation (Windows) : propose une seule fois d'associer les .projix.
  void promptProjixAssociationOnFirstRun(context);

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

  // Restauration au démarrage : les onglets .projix (CustomEditor) sont désormais
  // restaurés NATIVEMENT par VS Code (comme n'importe quel onglet d'éditeur), y
  // compris les modifications non enregistrées via le hot-exit. Plus besoin de
  // rouvrir manuellement le dernier projet — ce serait un doublon.
}

/** Compteur d'untitled pour donner une URI DISTINCTE à chaque « nouveau projet »
 *  (même URI ⇒ VS Code révèle l'onglet existant au lieu d'en ouvrir un autre). */
let untitledCounter = 0;

/** Colonne cible du simulateur : 2/3 droite (le code va à gauche). */
const SIM_COLUMN = vscode.ViewColumn.Two;

/**
 * Ouvre un nouveau projet Kablix : un document .projix « untitled » dans
 * l'éditeur personnalisé, dans un NOUVEL onglet à droite. Le point ● natif
 * apparaît dès la première modification ; Ctrl+S propose l'emplacement.
 */
async function openNewProjix(): Promise<void> {
  // URI untitled unique : sans le suffixe, rouvrir « nouveau projet » ne ferait
  // que révéler l'onglet déjà ouvert.
  const suffix = untitledCounter === 0 ? '' : ` ${untitledCounter + 1}`;
  untitledCounter++;
  const name = l10n.t('New project') + suffix + '.projix';
  const uri = vscode.Uri.parse('untitled:' + name);
  await vscode.commands.executeCommand(
    'vscode.openWith',
    uri,
    ProjixEditorProvider.viewType,
    SIM_COLUMN
  );
}

/** « Ouvrir un projet » : dialogue de fichier puis ouverture dans l'éditeur .projix
 *  (colonne 2/3 droite). */
async function openProjixViaDialog(_context: vscode.ExtensionContext): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { [l10n.t('Kablix project')]: ['projix'] },
    title: l10n.t('Open a Kablix project'),
  });
  if (!picked || picked.length === 0) return;
  // Si l'onglet actif est un « nouveau projet » vierge (untitled jamais modifié),
  // on ouvre le fichier À SA PLACE (même colonne, puis fermeture de l'onglet vide)
  // plutôt que d'empiler un onglet de plus.
  const activeSession = SimulatorPanel.active();
  const pristine =
    activeSession && activeSession.isPristineUntitled() ? activeSession : undefined;
  const column = pristine?.getViewColumn() ?? SIM_COLUMN;
  await vscode.commands.executeCommand(
    'vscode.openWith',
    picked[0],
    ProjixEditorProvider.viewType,
    column
  );
  // Ferme l'onglet vierge remplacé (après l'ouverture réussie du fichier).
  pristine?.closeTab();
}

export function deactivate(): void {
  SimulatorPanel.dispose();
}
