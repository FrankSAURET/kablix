import * as vscode from 'vscode';
import { SimulatorPanel, chooseSvgEditor, useSvgEditorMemory } from './panel';
import { GuidePanel, SHOW_GUIDE } from './guide';
import { promptLibraryUpdates } from './updates';
import { upgradeFirmware, checkFirmwareUpdate } from './firmware';
import { saveDefaultLayout, applyDefaultLayout, kablixColumn } from './layout';
import { registerProjixEditor, ProjixEditorProvider } from './projix-editor';
import { associateProjix, promptProjixAssociationOnFirstRun } from './associate';
import { promptRecommendedExtensions } from './recommend';
import { PartHelpPanel, SHOW_PART_HELP } from './partHelp';
import { ComponentManagerPanel } from './componentManager';
import { openNewProjix, openOrRevealProjix } from './openproject';
import { KompixLibrary } from './kompixLibrary';
import { PicoUploader } from './picoUploader';

const l10n = vscode.l10n;

/** Fenêtre de démarrage pendant laquelle un volet Kablix visible est mis sur le
 *  compte de la restauration de session, pas d'un clic de l'utilisateur. Mesurée
 *  depuis le lancement du processus hôte, pas depuis `activate()`. */
const STARTUP_GRACE_MS = 3000;

export function activate(context: vscode.ExtensionContext): void {
  // Filet du choix de l'éditeur SVG : VS Code n'inscrit les réglages d'une
  // extension qu'au chargement de la fenêtre, si bien qu'un `.vsix` installé et
  // utilisé dans la foulée refuse l'écriture de `kablix.svgEditorPath`. La
  // mémoire de l'extension, elle, accepte toujours.
  useSvgEditorMemory(context.globalState);

  // Bibliothèque de composants .kompix (global, partagée).
  const kompixLibrary = new KompixLibrary(context);
  SimulatorPanel.library = kompixLibrary;
  // Lance le scan asynchrone en arrière-plan (pas de blocage).
  void kompixLibrary.start().catch((err) => {
    console.error('Erreur initialisation bibliothèque kompix:', err);
  });

  // Gestionnaire d'upload Pico (détection des ports, transfert REPL).
  const picoUploader = new PicoUploader(context);
  void picoUploader.start().catch((err) => {
    console.error('Erreur initialisation PicoUploader:', err);
  });
  // Vue de la barre d'activité : cliquer l'icône Kablix ouvre DIRECTEMENT le
  // simulateur (panneau éditeur) et rend la main au volet Explorateur, pour que
  // le volet Kablix (quasi vide) n'occupe pas la barre latérale.
  const homeView = vscode.window.createTreeView('kablix.home', {
    treeDataProvider: {
      getChildren: () => [],
      getTreeItem: (item: vscode.TreeItem) => item,
    },
  });
  // Garde-fou de démarrage : la restauration de session peut faire transiter le
  // volet hidden→visible sans action de l'utilisateur, ce qui rouvrirait le
  // simulateur au lancement. L'extension s'activant PARESSEUSEMENT (plus
  // d'`onStartupFinished`), `activate()` ne tourne plus forcément au démarrage :
  // le repère n'est donc pas l'instant d'activation mais l'âge du processus hôte
  // (`process.uptime()`), qui, lui, démarre bien avec la fenêtre.
  const sinceWindowStart = process.uptime() * 1000;
  let startupSettled = sinceWindowStart >= STARTUP_GRACE_MS;
  const startupTimer = startupSettled
    ? undefined
    : setTimeout(() => {
        startupSettled = true;
      }, STARTUP_GRACE_MS - sinceWindowStart);
  // Anti-doublon : le cas « déjà visible à l'activation » (ci-dessous) et
  // l'événement de visibilité peuvent tomber ensemble sur un même clic.
  let lastOpen = 0;
  const openWorkshop = (): void => {
    if (!startupSettled || Date.now() - lastOpen < 500) return;
    lastOpen = Date.now();
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
      // Atelier existant révélé, ou nouveau projet à défaut. On force en plus le
      // layout (clic icône = action explicite) au cas où la disposition aurait
      // déjà été consommée cette session.
      void openOrRevealProjix(context).then(() =>
        setTimeout(() => void applyDefaultLayout(context, true), 120)
      );
    }
  };
  context.subscriptions.push(
    homeView,
    new vscode.Disposable(() => {
      clearTimeout(startupTimer);
      picoUploader.dispose();
    }),
    homeView.onDidChangeVisibility((e) => {
      if (e.visible) openWorkshop();
    })
  );
  // Activation paresseuse : c'est le clic sur l'icône qui allume l'extension, et
  // VS Code rend le volet visible AVANT d'appeler `activate()`. La transition
  // hidden→visible est donc déjà passée quand le listener ci-dessus se pose : sans
  // ce rattrapage, le premier clic n'ouvrirait rien. Le tick laisse VS Code
  // renseigner `homeView.visible`, tout juste créée.
  setTimeout(() => {
    if (homeView.visible) openWorkshop();
  }, 50);

  // Éditeur personnalisé des projets .projix : l'onglet EST le document, d'où le
  // point ● « non enregistré » NATIF, Ctrl+S natif et le prompt de fermeture natif.
  registerProjixEditor(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('kablix.openSimulator', () => {
      void openNewProjix(context);
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
    vscode.commands.registerCommand('kablix.saveProjectSmart', () => {
      // Ctrl+S sur un onglet .projix : MÊME chemin que le bouton « Enregistrer »
      // de l'atelier (saveSmart) — un projet untitled avec un fichier de code
      // associé propose le nom du code, tout le reste retombe sur le Ctrl+S natif.
      // Le `when` du raccourci ne teste plus QUE `activeCustomEditorId` : la
      // condition `resourceScheme == 'untitled'` qui l'accompagnait ne se
      // vérifiait pas sur un .projix untitled (signalé par Frank : Ctrl+S
      // proposait « Nouveau projet.projix » alors que le bouton Enregistrer
      // proposait bien le nom du code). Le tri se fait ici, dans saveSmart, qui
      // sait déjà distinguer untitled + code du reste.
      const panel = SimulatorPanel.active();
      if (panel) {
        panel.saveSmart(false);
      } else {
        void vscode.commands.executeCommand('workbench.action.files.save');
      }
    }),
    vscode.commands.registerCommand('kablix.openProject', () => {
      void openProjixViaDialog(context);
    }),
    vscode.commands.registerCommand('kablix.exportWokwiDiagram', () => {
      SimulatorPanel.active()?.requestWokwiExport();
    }),
    vscode.commands.registerCommand('kablix.exportPartsCsv', () => {
      SimulatorPanel.active()?.requestPartsCsv();
    }),
    vscode.commands.registerCommand('kablix.importWokwiDiagram', () => {
      void SimulatorPanel.active()?.importWokwiDiagram();
    }),
    vscode.commands.registerCommand('kablix.checkLibraryUpdates', () => {
      // Vérification manuelle : affiche aussi la notification « à jour », et
      // ignore les versions refusées (l'utilisateur redemande explicitement).
      void promptLibraryUpdates(context, false);
    }),
    vscode.commands.registerCommand('kablix.upgradePicoFirmware', () => {
      void upgradeFirmware(context);
    }),
    vscode.commands.registerCommand('kablix.openHelp', () => {
      void GuidePanel.show(context.extensionUri);
    }),
    vscode.commands.registerCommand('kablix.saveDefaultLayout', () => {
      void saveDefaultLayout(context);
    }),
    vscode.commands.registerCommand('kablix.rearrangeLayout', () => {
      // Icône « réarranger » : rétablit la disposition Kablix mémorisée (côté +
      // ratio). Force = action explicite, même si déjà posée cette session.
      void applyDefaultLayout(context, true);
    }),
    vscode.commands.registerCommand('kablix.associateProjix', () => {
      void associateProjix(context);
    }),
    // Éditeur SVG des retouches du créateur de composants : demandé à la
    // première retouche, changeable ensuite par cette commande.
    vscode.commands.registerCommand('kablix.chooseSvgEditor', () => {
      void chooseSvgEditor();
    }),
    vscode.commands.registerCommand('kablix.openComponentsFolder', () => {
      const folder = vscode.Uri.file(kompixLibrary.getLibraryPath?.() ?? context.globalStorageUri.fsPath);
      // revealFileInOS et pas openExternal : openExternal sur une URI « file: »
      // passe par le navigateur et n'ouvre pas l'explorateur de fichiers.
      void vscode.commands.executeCommand('revealFileInOS', folder);
    }),
    vscode.commands.registerCommand('kablix.openComponentManager', () => {
      void ComponentManagerPanel.show(context.extensionUri, kompixLibrary);
    }),
    vscode.commands.registerCommand('kablix.recommendedExtensions', () => {
      void promptRecommendedExtensions(context, true);
    }),
    // Navigation d'une fiche d'aide à l'autre (liens `[texte](alim.md)` d'une
    // fiche). Commande interne : pas déclarée dans contributes.commands, donc
    // absente de la palette ; seule la webview d'aide l'appelle (command URI).
    vscode.commands.registerCommand(SHOW_PART_HELP, (type: unknown) => {
      if (typeof type === 'string' && /^[a-z0-9-]+$/i.test(type)) {
        void PartHelpPanel.show(context.extensionUri, type);
      }
    }),
    // Navigation d'un guide à l'autre (liens entre USAGE.md et les guides
    // annexes). Commande interne, comme SHOW_PART_HELP.
    vscode.commands.registerCommand(SHOW_GUIDE, (name: unknown) => {
      if (typeof name === 'string' && /^[a-z0-9_-]+$/i.test(name)) {
        void GuidePanel.show(context.extensionUri, name);
      }
    }),
    // Bouton ⇧ de l'onglet d'un fichier Python : envoie le programme sur la carte
    // Pico branchée. Le fichier ouvert y devient `main.py` (c'est ce que
    // MicroPython exécute au démarrage) et seuls les modules qu'il importe
    // l'accompagnent — pas tous les .py du dossier.
    vscode.commands.registerCommand('kablix.uploadToPico', async (fileUri?: vscode.Uri) => {
      // Le clic sur le bouton ne passe pas d'URI : c'est le fichier de l'onglet.
      const target = fileUri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!target || !/\.py$/i.test(target)) {
        void vscode.window.showErrorMessage(l10n.t('Open a Python file (.py) first.'));
        return;
      }
      // Le fichier doit exister sur le disque : un onglet jamais enregistré n'a
      // rien à envoyer, et ses modules importés ne sont pas résolvables.
      if (vscode.window.activeTextEditor?.document.isDirty) {
        await vscode.window.activeTextEditor.document.save();
      }
      await picoUploader.upload(target);
    }),
    // Même bouton, mais grisé : aucune carte n'est branchée. Il ne fait que le
    // dire — sans lui, le clic sur l'icône éteinte ne donnerait aucun signe.
    vscode.commands.registerCommand('kablix.uploadToPicoOffline', () => {
      void vscode.window.showWarningMessage(
        l10n.t(
          'No Pico board detected. Plug one in over USB — the button lights up on its own.'
        )
      );
    })
  );

  // Première activation (Windows) : propose une seule fois d'associer les .projix.
  void promptProjixAssociationOnFirstRun(context);

  // Première activation : propose une seule fois les extensions conseillées
  // (téléversement sur la vraie carte, gestion des cartes et bibliothèques).
  // Ensuite, seule la commande « Extensions conseillées » les rappelle.
  void promptRecommendedExtensions(context);

  // Vérification au démarrage, opt-in et non bloquante (silence si à jour).
  const checkOnStartup = vscode.workspace
    .getConfiguration('kablix')
    .get<boolean>('checkUpdatesOnStartup', false);
  if (checkOnStartup) {
    void promptLibraryUpdates(context, true);
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

/** « Ouvrir un projet » : dialogue de fichier puis ouverture dans l'éditeur .projix
 *  (colonne Kablix mémorisée). */
async function openProjixViaDialog(context: vscode.ExtensionContext): Promise<void> {
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
  const column = pristine?.getViewColumn() ?? kablixColumn(context);
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
