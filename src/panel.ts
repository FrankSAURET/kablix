import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const l10n = vscode.l10n;
import { buildWebviewHtml } from './webview-html';
import {
  compile,
  loadArtifact,
  loadPythonProgram,
  loadMicropythonRepl,
  CompileFailed,
  type Board,
  type CompileResult,
  type ToolPaths,
} from './compiler';
import {
  packProject,
  unpackProject,
  PROJIX_FORMAT_VERSION,
  type ProjixManifest,
  type ProjixDebugVars,
} from './projix';
import { resolveMicropythonFirmware, FirmwareCancelled } from './firmware';
import { PartHelpPanel } from './partHelp';
import { codeColumn, moveEditorToColumn, textTabColumn } from './layout';
import { defaultAppsDirPath, detectSvgEditor, svgEditorLaunch } from './svgEditorDetect';

const ARTIFACT_EXTS = ['.hex', '.uf2', '.elf', '.bin'];

/** Vrai pour une carte de la famille AVR (Arduino : Uno / Nano / Mega). */
function isAvrBoard(board: Board): boolean {
  return board === 'uno' || board === 'nano' || board === 'mega';
}

/** Nom de fichier sans dossier ni extension (ex. « C:\…\Projet.projix » → « Projet »). */
function baseNameNoExt(fsPath: string): string {
  const name = fsPath.split(/[\\/]/).pop() ?? fsPath;
  return name.replace(/\.[^.]+$/, '');
}

/**
 * Dossier où le système range ses applications : la fenêtre de choix s'ouvre
 * là plutôt que dans le dernier dossier visité (souvent le projet).
 */
function defaultAppsDir(): vscode.Uri | undefined {
  const dir = defaultAppsDirPath();
  return dir ? vscode.Uri.file(dir) : undefined;
}

/**
 * Deux chemins désignent-ils le même fichier ? Windows ignore la casse et
 * accepte les deux séparateurs : `C:\Program Files\Inkscape\bin\inkscape.exe`
 * et `c:/Program Files/inkscape/bin/inkscape.exe` sont le même exécutable.
 */
function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => {
    const clean = p.trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? clean.toLowerCase() : clean;
  };
  return !!a.trim() && norm(a) === norm(b);
}

/** Clé du repli : le choix de l'éditeur SVG gardé par l'extension elle-même. */
const SVG_EDITOR_KEY = 'kablix.svgEditorPath';

/**
 * Mémoire globale de l'extension, confiée par `activate`. Elle sert de FILET au
 * réglage : elle, on peut toujours y écrire.
 */
let svgEditorMemory: vscode.Memento | undefined;

/** Branche le filet du choix de l'éditeur SVG (appelé une fois, à l'activation). */
export function useSvgEditorMemory(memory: vscode.Memento): void {
  svgEditorMemory = memory;
}

/**
 * Écrit le chemin retenu dans `kablix.svgEditorPath` (réglage utilisateur) et
 * VÉRIFIE la relecture : une écriture refusée (réglage verrouillé par une
 * stratégie, profil en lecture seule) doit se voir, sinon Kablix redemande
 * l'éditeur à chaque retouche sans qu'on sache pourquoi.
 *
 * Trois pièges faisaient crier « impossible d'enregistrer » alors que le réglage
 * ÉTAIT bien écrit (retour de Frank, v2026.7.250) :
 *   - on relisait la valeur EFFECTIVE, qu'un réglage de dossier ou de workspace
 *     masque : c'est `inspect().globalValue`, la valeur écrite, qui fait foi ;
 *   - on comparait les chemins au caractère près, alors que Windows ignore la
 *     casse et mélange `\` et `/` ;
 *   - on relisait trop tôt : le modèle de configuration se met à jour un tick
 *     après la promesse, d'où une deuxième chance avant de conclure.
 *
 * Restait un cas où l'écriture échoue SANS que rien ne soit cassé (retour de
 * Frank, v2026.7.255) : « kablix.svgEditorPath n'est pas une configuration
 * inscrite ». VS Code n'enregistre les réglages d'une extension qu'au
 * chargement de la fenêtre — installer un `.vsix` puis s'en servir tout de
 * suite laisse donc le réglage inconnu jusqu'au redémarrage suivant. D'où le
 * FILET : le choix est d'abord rangé dans la mémoire de l'extension, où rien ne
 * peut le refuser, et l'inscription est retentée au prochain démarrage
 * (`resolveSvgEditor`). Plus rien à signaler à l'utilisateur tant que le filet
 * a fait son office.
 */
async function rememberSvgEditor(fsPath: string): Promise<boolean> {
  // Le filet d'abord : quoi qu'il advienne du réglage, le choix est retenu.
  void svgEditorMemory?.update(SVG_EDITOR_KEY, fsPath);
  let cause = '';
  try {
    await vscode.workspace
      .getConfiguration('kablix')
      .update('svgEditorPath', fsPath, vscode.ConfigurationTarget.Global);
  } catch (err) {
    cause = err instanceof Error ? err.message : String(err);
  }
  for (let essai = 0; essai < 2; essai++) {
    const ecrit =
      vscode.workspace.getConfiguration('kablix').inspect<string>('svgEditorPath')?.globalValue ??
      '';
    if (samePath(ecrit, fsPath)) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  if (svgEditorMemory) {
    // Le choix est sauf, l'utilisateur n'a rien à faire : une popup ne servirait
    // qu'à l'inquiéter. La trace reste dans le journal de l'extension.
    console.warn(`Kablix : réglage svgEditorPath non écrit (${cause || 'refus silencieux'}) —` +
      ' le choix est gardé par l’extension et sera réinscrit au prochain démarrage.');
    return true;
  }
  const message = l10n.t(
    'Kablix: could not save the SVG editor in the settings (kablix.svgEditorPath).'
  );
  const bouton = l10n.t('Open settings');
  void vscode.window
    .showWarningMessage(cause ? `${message} ${cause}` : message, bouton)
    .then((choix) => {
      if (choix === bouton) {
        void vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'kablix.svgEditorPath'
        );
      }
    });
  return false;
}

/**
 * Demande l'application qui ouvrira les dessins SVG et la retient dans le
 * réglage `kablix.svgEditorPath`. Sans elle, Windows affiche sa fenêtre
 * « Comment voulez-vous ouvrir ce fichier ? » à chaque retouche, même quand
 * une application est associée aux SVG dans le système.
 */
export async function chooseSvgEditor(): Promise<string | null> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    // macOS : une application est un dossier (.app), sans quoi rien n'est cliquable.
    canSelectFolders: process.platform === 'darwin',
    openLabel: l10n.t('Use this editor'),
    title: l10n.t('Choose the SVG editor'),
    defaultUri: defaultAppsDir(),
    filters:
      process.platform === 'win32'
        ? { [l10n.t('Applications')]: ['exe', 'com', 'bat', 'cmd'] }
        : undefined,
  });
  const fsPath = picked?.[0]?.fsPath;
  if (!fsPath) return null;
  await rememberSvgEditor(fsPath);
  vscode.window.showInformationMessage(l10n.t('Kablix: SVG editor set to {0}', fsPath));
  return fsPath;
}

/**
 * Chemin de l'éditeur SVG à employer : réglage déjà retenu, sinon celui que le
 * système associe aux .svg (Inkscape neuf fois sur dix) — trouvé tout seul et
 * retenu sans rien demander —, sinon la fenêtre de choix.
 */
async function resolveSvgEditor(): Promise<string> {
  const config = vscode.workspace.getConfiguration('kablix');
  const saved = (config.get<string>('svgEditorPath') ?? '').trim();
  if (saved && existsSync(saved)) return saved;
  if (!saved) {
    // Choix gardé par le filet quand le réglage n'était pas encore inscrit
    // (extension installée sans rechargement de fenêtre) : on le reprend, et
    // c'est l'occasion de l'inscrire pour de bon — la fenêtre a redémarré
    // depuis, le réglage existe maintenant.
    const filet = (svgEditorMemory?.get<string>(SVG_EDITOR_KEY) ?? '').trim();
    if (filet && existsSync(filet)) {
      await rememberSvgEditor(filet);
      return filet;
    }
  }
  if (saved) {
    // Application déplacée ou désinstallée : on en cherche une autre plutôt
    // que d'échouer en silence.
    vscode.window.showWarningMessage(l10n.t('Kablix: SVG editor not found ({0}).', saved));
  }
  const detected = await detectSvgEditor();
  if (detected) {
    // Trouvé : on l'inscrit dans les réglages, où il reste modifiable.
    await rememberSvgEditor(detected);
    return detected;
  }
  // Rien d'associé, rien d'installé aux emplacements connus : c'est la seule
  // situation où l'on dérange l'utilisateur, et on ouvre DIRECTEMENT le
  // sélecteur de fichiers (un message à boutons se referme tout seul).
  return (await chooseSvgEditor()) ?? '';
}

/** Ouvre un fichier dans l'éditeur SVG retenu (trouvé ou choisi au premier appel). */
async function openInSvgEditor(uri: vscode.Uri): Promise<void> {
  const exe = await resolveSvgEditor();
  if (exe) {
    const fallback = (): void => {
      void vscode.env.openExternal(uri);
    };
    try {
      // Paquet .app de macOS, script .bat de Windows ou exécutable ordinaire :
      // la ligne de lancement n'est pas la même.
      const { cmd, args } = svgEditorLaunch(exe, uri.fsPath);
      // Processus détaché : l'éditeur survit à la fermeture de VS Code, et son
      // écriture du fichier est ce que la surveillance guette.
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      child.on('error', () => {
        vscode.window.showWarningMessage(l10n.t('Kablix: could not start {0}.', exe));
        fallback();
      });
      child.unref();
      return;
    } catch {
      fallback();
      return;
    }
  }
  // Repli : application par défaut du système, puis éditeur de VS Code.
  const opened = await vscode.env.openExternal(uri);
  if (!opened) await vscode.commands.executeCommand('vscode.open', uri);
}

/** Requête du pont réseau Pico W (forme miroir de NetRequest côté webview). */
interface NetBridgeRequest {
  id: number;
  m?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}
const CUSTOM_PARTS_KEY = 'kablix.customParts';
/** Préréglages de modèles de simulation importés dans le créateur (.json). */
const SIM_MODELS_KEY = 'kablix.simModels';
const UI_STATE_KEY = 'kablix.uiState';
/** Dernière colonne d'éditeur du simulateur (rouvert au même endroit). */
const LAST_COLUMN_KEY = 'kablix.lastColumn';
/** Chemin du dernier .projix ouvert/enregistré (rouvert au démarrage). */
const LAST_PROJECT_KEY = 'kablix.lastProject';
/** ≤ v2026.7.193 : masquages rangés dans l'état global, par programme. Lu en
 *  REPLI uniquement (migration) — les réglages vivent désormais dans le .projix. */
const HIDDEN_VARS_KEY = 'kablix.hiddenVars';

/**
 * Gère le panneau webview du simulateur. Un seul panneau est ouvert à la fois ;
 * un nouvel appel le révèle au lieu d'en créer un second.
 */
/**
 * Enveloppe hôte de l'atelier. Deux implémentations :
 *  - `WebviewPanel` natif de VS Code (panneau historique, point ● simulé dans le
 *    titre), qui satisfait déjà cette interface ;
 *  - un adaptateur `CustomEditor` (ProjixEditorProvider) qui traduit le point ●
 *    en état « modifié » NATIF de l'onglet (onDidChangeCustomDocument).
 * `setDirtyIndicator` centralise l'affichage du « non enregistré » : le titre
 * pour le WebviewPanel, l'event dirty natif pour le CustomEditor.
 */
export interface SimulatorHost {
  readonly webview: vscode.Webview;
  readonly viewColumn: vscode.ViewColumn | undefined;
  reveal(column?: vscode.ViewColumn, preserveFocus?: boolean): void;
  dispose(): void;
  onDidDispose(listener: () => void, thisArgs: unknown, disposables: vscode.Disposable[]): void;
  onDidChangeViewState(
    listener: () => void,
    thisArgs: unknown,
    disposables: vscode.Disposable[]
  ): void;
  /** Titre de base (sans le ●) + état « non enregistré » : l'hôte choisit le rendu. */
  setDirtyIndicator(dirty: boolean, baseTitle: string): void;
  /** Le .projix ouvert a été SUPPRIMÉ du disque : son nom est barré dans l'onglet
   *  de VS Code (demande de Frank). L'hôte choisit le rendu — l'onglet d'un
   *  éditeur de TEXTE est barré nativement par VS Code, celui d'un éditeur
   *  personnalisé ne l'est pas. */
  setDeletedIndicator?(deleted: boolean): void;
  /** Édition utilisateur signalée par la webview : le CustomEditor empile un edit
   *  (point ● natif + Ctrl+Z natif). Optionnel (le WebviewPanel legacy l'ignore). */
  onDocEdit?(): void;
}

/**
 * Texte BARRÉ dans un titre d'onglet. Un titre d'onglet est du texte brut : ni
 * balise, ni style. Le seul barré possible est typographique — un « combining
 * long stroke overlay » (U+0336) posé après chaque caractère, qui trace le trait
 * dans la police elle-même. Les espaces sont laissés tranquilles (le trait
 * flotterait tout seul entre deux mots).
 */
export function strikeThroughText(text: string): string {
  const STROKE = '̶';
  return [...text].map((ch) => (ch === ' ' ? ch : ch + STROKE)).join('');
}

export class SimulatorPanel {
  public static readonly viewType = 'kablix.simulator';
  private static current: SimulatorPanel | undefined;
  /** Dernière session ayant interagi (onglet .projix actif) : cible des
   *  commandes globales (Enregistrer, Import/Export Wokwi…) en mode CustomEditor. */
  private static lastActive: SimulatorPanel | undefined;

  /** Session de l'atelier actuellement au premier plan (CustomEditor), sinon le
   *  panneau singleton historique s'il existe. undefined si rien n'est ouvert. */
  public static active(): SimulatorPanel | undefined {
    return SimulatorPanel.lastActive ?? SimulatorPanel.current;
  }

  /** Révèle l'onglet de cette session (sans le déplacer). */
  public reveal(): void {
    this.panel.reveal(undefined, false);
  }

  /** Ferme l'onglet de cette session (utilisé pour remplacer un onglet
   *  « nouveau projet » vierge par un fichier qu'on vient d'ouvrir). */
  public closeTab(): void {
    this.panel.dispose();
  }

  /** Ctrl+Z / Ctrl+Y natifs du CustomEditor : relaie l'annulation/rétablissement
   *  à la pile d'historique de la webview (qui exécute le vrai undo/redo). */
  public postUndo(): void {
    this.post({ type: 'undo' });
  }
  public postRedo(): void {
    this.post({ type: 'redo' });
  }

  /** Restauration hot-exit depuis un backup : le schéma chargé n'est PAS aligné
   *  sur le disque → remet le point ● « non enregistré » (webview + pile VS Code). */
  public markDirtyFromRestore(): void {
    this.markProjectDirty();
  }

  /** Marque le projet « non enregistré » depuis l'hôte : point ● natif (edit
   *  empilé dans le CustomEditor), titre et état de la webview alignés. Sert aux
   *  changements qui ne passent pas par le schéma — restauration hot-exit,
   *  réglages du panneau de débogage (v203). */
  private markProjectDirty(): void {
    this.projectDirty = true;
    this.updateTitle();
    this.post({ type: 'setDirty', dirty: true });
    this.panel.onDocEdit?.();
  }


  /** URI du document lié (fichier .projix ou untitled). */
  public getDocumentUri(): vscode.Uri | undefined {
    return this.documentUri;
  }

  /** Le projet a-t-il des modifications non enregistrées ? (backup hot-exit) */
  public isProjectDirty(): boolean {
    return this.projectDirty;
  }

  /** Colonne d'éditeur où vit cet onglet (pour rouvrir un fichier à sa place). */
  public getViewColumn(): vscode.ViewColumn | undefined {
    return this.panel.viewColumn;
  }

  /** Onglet « nouveau projet » vierge : untitled ET jamais modifié. Un tel onglet
   *  peut être remplacé par l'ouverture d'un fichier (au lieu d'un nouvel onglet). */
  public isPristineUntitled(): boolean {
    return this.documentUri?.scheme === 'untitled' && !this.projectDirty;
  }

  private readonly panel: SimulatorHost;
  private readonly extensionUri: vscode.Uri;
  private readonly context: vscode.ExtensionContext;
  private readonly disposables: vscode.Disposable[] = [];
  private currentBoard: Board = 'uno';
  /** Nom de base du projet (sans extension) : dernier .projix enregistré/ouvert, pour nommer l'export SVG. */
  private projectBaseName: string | undefined;
  /** Chemin complet du .projix courant (ouvert ou enregistré) : cible du bouton
   *  Enregistrer, qui écrit directement sans boîte de dialogue. */
  private projectUri: vscode.Uri | undefined;
  /** Modifications du schéma non encore enregistrées (signalées par la webview) :
   *  ● dans le titre de l'onglet tant que c'est vrai, garde-fou avant d'ouvrir un
   *  autre projet. */
  private projectDirty = false;
  /** Dernier schéma reçu de la webview tant que le projet est « sale » : sert à
   *  proposer un enregistrement si l'onglet est fermé sans avoir enregistré. */
  private pendingDiagram: unknown;
  private pendingBoard: Board | undefined;
  /** L'utilisateur a choisi « Continuer sans enregistrer » : la prochaine
   *  fermeture ne rouvre plus (évite une boucle de réouverture). Remis à false
   *  dès qu'une nouvelle modification survient (le projet redevient à protéger). */
  private discardAccepted = false;
  /** État transféré à un panneau rouvert après une fermeture « modifications non
   *  enregistrées » : le nouveau panneau recharge ce schéma et propose de l'enregistrer. */
  private static pendingReopen:
    | {
        diagram: unknown;
        board: Board | undefined;
        projectUri: vscode.Uri | undefined;
        projectBaseName: string | undefined;
        codeFileUri: vscode.Uri | undefined;
      }
    | undefined;
  /** Fichier source actuellement chargé dans le simulateur (.py ou source C ; pas les artefacts). */
  private currentSourceUri: vscode.Uri | undefined;
  /** Fichier de code choisi explicitement (chip du canvas) ; sinon le fichier actif sert. */
  private codeFileUri: vscode.Uri | undefined;
  /** Référence de fichier de code d'un .projix ouvert mais INTROUVABLE sur ce
   *  poste : ▶ refuse alors de compiler l'éditeur actif à la place (on
   *  compilerait le fichier d'un AUTRE projet sans que l'utilisateur le voie). */
  private missingCodeFileRef: string | undefined;
  /** Fichier de code d'un projet qui vient d'être chargé, à MONTRER dès que la
   *  disposition est posée (voir revealPendingCodeFile). */
  private pendingCodeReveal: vscode.Uri | undefined;
  /** Décoration de la ligne en pause (créée à la demande, détruite avec le panneau). */
  private debugLineDecoration: vscode.TextEditorDecorationType | undefined;
  /** Dessins du créateur ouverts dans l'éditeur SVG du système (surveillés). */
  private svgWatches = new Map<
    'ext' | 'int',
    { uri: vscode.Uri; mtime: number; timer: ReturnType<typeof setInterval> }
  >();
  /**
   * Signature de la dernière compilation réussie (chemin + date de modification
   * + carte). Permet à ▶ de ne recompiler que si le source a changé.
   */
  private lastCompiled: { path: string; mtime: number; board: Board } | undefined;

  /**
   * Colonne d'ouverture. On rouvre dans la dernière colonne utilisée (si elle
   * existe encore) pour retrouver l'emplacement — et donc, autant que possible,
   * la taille — du dernier affichage ; sinon, un nouveau groupe à droite.
   * (La taille en pixels d'un éditeur webview n'est pas réglable par l'API
   * d'extension : VS Code gère la disposition des groupes.)
   */
  private static targetColumn(context: vscode.ExtensionContext): vscode.ViewColumn {
    const groups = vscode.window.tabGroups.all;
    const maxCol = groups.length === 0 ? 1 : Math.max(...groups.map((g) => g.viewColumn)) + 1;
    const saved = context.globalState.get<number>(LAST_COLUMN_KEY);
    if (saved && saved >= 1 && saved <= maxCol) return saved as vscode.ViewColumn;
    if (groups.length === 0) return vscode.ViewColumn.One;
    return Math.min(maxCol, 9) as vscode.ViewColumn;
  }

  public static createOrShow(context: vscode.ExtensionContext): SimulatorPanel {
    if (SimulatorPanel.current) {
      // Déjà ouvert : on le révèle là où il est (sans le déplacer).
      SimulatorPanel.current.panel.reveal(undefined, false);
      return SimulatorPanel.current;
    }

    const column = SimulatorPanel.targetColumn(context);

    const extensionUri = context.extensionUri;
    const panel = vscode.window.createWebviewPanel(
      SimulatorPanel.viewType,
      l10n.t('Kablix — Simulator'),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );

    SimulatorPanel.current = new SimulatorPanel(wrapWebviewPanel(panel), context);
    return SimulatorPanel.current;
  }

  /** Instancie une session pilotée par un hôte quelconque (WebviewPanel ou
   *  CustomEditor). Utilisé par le ProjixEditorProvider. */
  public static createForHost(host: SimulatorHost, context: vscode.ExtensionContext): SimulatorPanel {
    return new SimulatorPanel(host, context);
  }

  public static dispose(): void {
    SimulatorPanel.current?.panel.dispose();
  }

  /**
   * Chemin du dernier .projix ouvert/enregistré (pour le rouvrir au démarrage),
   * ou undefined si aucun projet n'a encore été enregistré/ouvert. Le fichier
   * peut avoir été déplacé/supprimé depuis : l'appelant vérifie son existence.
   */
  public static lastProjectUri(context: vscode.ExtensionContext): vscode.Uri | undefined {
    const p = context.globalState.get<string>(LAST_PROJECT_KEY);
    return p ? vscode.Uri.file(p) : undefined;
  }

  /** Mémorise le .projix courant comme « dernier projet » (rouvert au démarrage). */
  private rememberLastProject(uri: vscode.Uri): void {
    void this.context.globalState.update(LAST_PROJECT_KEY, uri.fsPath);
  }

  // --- Façade CustomEditor (ProjixEditorProvider) -----------------------------

  /** Résout la sauvegarde en cours demandée par le CustomEditor (Ctrl+S natif). */
  private pendingSaveResolve: (() => void) | undefined;

  /** Cible d'écriture directe imposée par le CustomEditor (l'URI du document) :
   *  quand elle est posée, Enregistrer n'ouvre jamais de boîte de dialogue. */
  private documentUri: vscode.Uri | undefined;

  /** Le CustomEditor lie la session à un fichier .projix (ou untitled) : écriture
   *  directe dans ce fichier, sans dialogue. Untitled → dialogue au 1er save. */
  public bindDocument(uri: vscode.Uri): void {
    this.documentUri = uri;
    if (uri.scheme !== 'untitled') {
      this.projectUri = uri;
      this.projectBaseName = baseNameNoExt(uri.fsPath);
    }
  }

  /** Charge un .projix déjà lu en octets (ouverture par le CustomEditor). */
  public async loadProjixBytes(bytes: Uint8Array, uri: vscode.Uri): Promise<void> {
    await this.openProjectFromBytes(bytes, uri);
  }

  /** Écriture ponctuelle vers une cible qui NE devient PAS la cible courante
   *  (utilisé pour le backup hot-exit du CustomEditor). */
  private oneShotTarget: vscode.Uri | undefined;

  /** Drapeau « modifications non enregistrées » à graver dans le PROCHAIN backup
   *  hot-exit (manifest.dirtyAtExit) : posé par saveToDocument(oneShot), consommé
   *  par buildProjixBytes. undefined = enregistrement normal (pas de drapeau). */
  private backupDirtyFlag: boolean | undefined;

  /** Save d'un untitled nommé d'après le code : après écriture réussie, il faut
   *  remplacer l'onglet untitled par le vrai fichier (ouverture + fermeture). */
  private pendingReopenAfterSave = false;

  /** Un enregistrement doit-il court-circuiter le save natif pour proposer le nom
   *  du fichier de code ? Vrai si le document est ENCORE untitled et qu'un code
   *  est associé — sinon (fichier .projix déjà nommé, ou aucun code) le save
   *  natif de VS Code convient. */
  private shouldSaveUntitledWithCodeName(): boolean {
    return (
      this.documentUri?.scheme === 'untitled' &&
      this.codeFileUri !== undefined
    );
  }

  /** Enregistrement « intelligent » d'un onglet .projix (bouton Enregistrer ou
   *  Ctrl+S). Untitled + code associé → save maison (nom par défaut = celui du
   *  code) puis remplacement de l'onglet untitled par le vrai fichier. Sinon →
   *  save natif de VS Code (le nom est déjà connu ou n'a pas de code à proposer). */
  public saveSmart(saveAs = false): void {
    if (this.shouldSaveUntitledWithCodeName()) {
      this.pendingReopenAfterSave = true;
      // saveAs importe peu ici : untitled ⇒ dialogue de toute façon.
      void saveAs;
      this.post({ type: 'requestSaveProject' });
    } else {
      void vscode.commands.executeCommand(
        saveAs ? 'workbench.action.files.saveAs' : 'workbench.action.files.save'
      );
    }
  }

  /** Ctrl+S natif du CustomEditor : demande le schéma à la webview puis écrit le
   *  .projix. La promesse se résout quand l'écriture est confirmée.
   *  `oneShot` : écrit vers `target` sans en faire la cible permanente (backup).
   *  `backupDirty` : état ● au moment du backup, gravé dans le manifest. */
  public saveToDocument(target?: vscode.Uri, oneShot = false, backupDirty?: boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      this.pendingSaveResolve = resolve;
      if (oneShot) {
        this.oneShotTarget = target;
        this.backupDirtyFlag = backupDirty;
      } else if (target) {
        this.documentUri = target;
      }
      // La webview renvoie le schéma via le message 'saveProject' (voir onMessage).
      this.post({ type: 'requestSaveProject' });
    });
  }

  /**
   * Lancement de la simulation : le schéma doit être sur le disque, comme le
   * fichier de code (demande de Frank — on ne simule pas une version périmée).
   * Le code, lui, est enregistré par `compileActiveFile` (`doc.save()`).
   *
   * On passe par le save **natif** de VS Code plutôt que d'écrire nous-mêmes :
   * sans lui, l'onglet garderait son point ● et proposerait « enregistrer sous »
   * à la fermeture. Un projet **jamais enregistré** (untitled, sans nom) est
   * laissé tel quel : ouvrir une boîte de dialogue bloquerait le ▶.
   */
  private async saveProjectBeforeRun(): Promise<void> {
    if (!this.projectDirty) return;
    const doc = this.documentUri;
    if (doc && doc.scheme !== 'untitled') {
      try {
        // L'URI en argument évite de dépendre de l'onglet ACTIF (le ▶ peut venir
        // d'un raccourci alors que le curseur est dans le fichier de code).
        await vscode.commands.executeCommand('workbench.action.files.save', doc);
      } catch {
        // Fichier verrouillé, disque plein… : on lance quand même la simulation.
      }
      return;
    }
    // Panneau ouvert hors CustomEditor mais .projix déjà nommé : écriture directe.
    if (!doc && this.projectUri && this.pendingDiagram !== undefined) {
      await this.saveProject(this.pendingDiagram, this.pendingBoard);
    }
  }

  /**
   * Compile ou charge le fichier actif selon son type :
   *   .py → firmware MicroPython du workspace + injection du script ;
   *   .hex/.uf2/.elf/.bin → artefact chargé directement ;
   *   sinon → compilation via la toolchain locale pour la carte courante.
   */
  public async compileActiveFile(onlyIfChanged = false): Promise<void> {
    await this.saveProjectBeforeRun();
    // Fichier choisi explicitement (chip du canvas) en priorité, sinon l'éditeur actif.
    let doc: vscode.TextDocument | undefined;
    if (this.codeFileUri) {
      try {
        doc = await vscode.workspace.openTextDocument(this.codeFileUri);
      } catch {
        doc = undefined; // fichier déplacé/supprimé : repli sur l'éditeur actif
      }
    }
    // Projet ouvert dont le fichier de code est introuvable : PAS de repli sur
    // l'éditeur actif (on lancerait le fichier d'un autre projet en silence).
    if (!doc && this.missingCodeFileRef) {
      this.post({ type: 'status', text: l10n.t('Ready') });
      vscode.window.showErrorMessage(
        l10n.t(
          'Kablix: the project code file "{0}" was not found on this computer. Click the 📄 chip to choose the file to run.',
          this.missingCodeFileRef
        )
      );
      return;
    }
    doc ??= vscode.window.activeTextEditor?.document;
    if (!doc) {
      vscode.window.showWarningMessage(l10n.t('Kablix: no active file to compile.'));
      return;
    }
    await doc.save();
    const filePath = doc.uri.fsPath;
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

    // ▶ : si le source n'a pas changé depuis la dernière compilation (même
    // fichier, même date, même carte), inutile de recompiler — on relance le
    // binaire déjà en cache dans la webview. Les artefacts directs (.hex/.uf2…)
    // ne se recompilent jamais : ils sont toujours relancés tels quels.
    if (onlyIfChanged && this.lastCompiled) {
      const isArtifact = ARTIFACT_EXTS.includes(ext);
      const mtime = await this.mtimeOf(doc.uri);
      const unchanged =
        this.lastCompiled.path === filePath &&
        this.lastCompiled.board === this.currentBoard &&
        (isArtifact || (mtime !== undefined && mtime === this.lastCompiled.mtime));
      if (unchanged) {
        this.post({ type: 'runCached' });
        return;
      }
    }
    // Mémorise le source pour les points d'arrêt et le surlignage ; pas de suivi pour les artefacts.
    this.currentSourceUri = ARTIFACT_EXTS.includes(ext) ? undefined : doc.uri;
    // Le fichier compilé devient le fichier de code affiché (et réutilisé ensuite).
    this.setCodeFile(doc.uri);

    this.post({ type: 'status', text: l10n.t('Preparing…') });
    try {
      let result: CompileResult;
      if (ext === '.py') {
        // Pico W → firmware Wi-Fi (RPI_PICO_W) ; sinon Pico standard.
        const isPicoW = this.currentBoard === 'picow';
        const firmware = await resolveMicropythonFirmware(
          this.context,
          isPicoW ? 'picow' : 'pico'
        );
        // Pont réseau réel : activé pour le Pico W si le réglage l'autorise.
        const netBridge =
          isPicoW &&
          vscode.workspace.getConfiguration('kablix').get<boolean>('picowNetworkBridge', true);
        result = loadPythonProgram(firmware, doc.getText(), netBridge, filePath);
      } else if (ARTIFACT_EXTS.includes(ext)) {
        result = loadArtifact(filePath);
      } else {
        const board = this.currentBoard;
        const toolPaths = this.toolPaths();
        result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: l10n.t('Kablix: compiling ({0})…', board) },
          () => compile(board, filePath, this.extensionUri.fsPath, toolPaths)
        );
      }
      // Compilation/chargement réussi : mémorise la signature pour que ▶ puisse
      // sauter une recompilation tant que le source n'a pas changé.
      const mtime = await this.mtimeOf(doc.uri);
      this.lastCompiled =
        mtime !== undefined
          ? { path: filePath, mtime, board: this.currentBoard }
          : undefined;
      this.runProgram(result, filePath.split(/[\\/]/).pop() ?? filePath);
    } catch (err) {
      // L'utilisateur a renoncé à fournir un firmware : pas un échec, on se tait.
      if (err instanceof FirmwareCancelled) {
        this.post({ type: 'status', text: l10n.t('Ready') });
        return;
      }
      this.reportError(err);
    }
  }

  /**
   * Démarre le firmware MicroPython seul (sans script) : le raw REPL n'est
   * jamais engagé côté moteur, le moniteur série devient un vrai REPL
   * interactif (bouton « REPL » de la barre de simulation).
   */
  public async startReplMode(): Promise<void> {
    await this.saveProjectBeforeRun();
    try {
      const isPicoW = this.currentBoard === 'picow';
      const firmware = await resolveMicropythonFirmware(this.context, isPicoW ? 'picow' : 'pico');
      const result = loadMicropythonRepl(firmware);
      this.lastCompiled = undefined; // repli sûr : ▶ recompilera au lieu de relancer ce firmware nu
      this.post({ type: 'runProgram', ...result.payload });
      if (result.log) console.log(`[Kablix] ${result.log}`);
    } catch (err) {
      if (err instanceof FirmwareCancelled) {
        this.post({ type: 'status', text: l10n.t('Ready') });
        return;
      }
      this.reportError(err);
    }
  }

  /**
   * Détecte l'artefact compilé le plus récent du workspace pour la carte
   * courante (.hex pour l'Uno via .vscode/arduino.json ou scan ; .uf2 dans
   * build/ pour le Pico) et le lance dans le simulateur.
   */
  public async loadWorkspaceArtifact(): Promise<void> {
    await this.saveProjectBeforeRun();
    try {
      const board = this.currentBoard;
      const file =
        isAvrBoard(board) ? await this.findNewestHex() : await this.findNewestUf2();
      if (!file) {
        vscode.window.showWarningMessage(
          isAvrBoard(board)
            ? l10n.t('Kablix: no .hex file found in the workspace.')
            : l10n.t('Kablix: no .uf2 file found in the workspace (build/ folder).')
        );
        return;
      }
      this.currentSourceUri = undefined; // artefact : pas de correspondance source
      this.runProgram(loadArtifact(file.fsPath), file.fsPath.split(/[\\/]/).pop() ?? '');
    } catch (err) {
      this.reportError(err);
    }
  }

  // --- Détection d'artefacts dans le workspace --------------------------------

  /** .hex le plus récent : dossier de sortie de .vscode/arduino.json, sinon scan. */
  private async findNewestHex(): Promise<vscode.Uri | undefined> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const candidates: vscode.Uri[] = [];
    for (const folder of folders) {
      const arduinoJson = vscode.Uri.joinPath(folder.uri, '.vscode', 'arduino.json');
      try {
        const raw = await vscode.workspace.fs.readFile(arduinoJson);
        const config = JSON.parse(Buffer.from(raw).toString('utf8')) as { output?: string };
        if (config.output) {
          const outDir = vscode.Uri.joinPath(folder.uri, config.output);
          const pattern = new vscode.RelativePattern(outDir.fsPath, '**/*.hex');
          candidates.push(...(await vscode.workspace.findFiles(pattern, undefined, 20)));
        }
      } catch {
        // pas de configuration Arduino : on passera au scan global
      }
    }
    if (candidates.length === 0) {
      candidates.push(
        ...(await vscode.workspace.findFiles('**/*.hex', '**/node_modules/**', 50))
      );
    }
    return this.newest(candidates);
  }

  /** .uf2 le plus récent dans build/ (pico-vscode / cmake), hors firmwares MicroPython. */
  private async findNewestUf2(): Promise<vscode.Uri | undefined> {
    let candidates = await vscode.workspace.findFiles('**/build/**/*.uf2', '**/node_modules/**', 50);
    if (candidates.length === 0) {
      candidates = await vscode.workspace.findFiles('**/*.uf2', '**/node_modules/**', 50);
    }
    candidates = candidates.filter((u) => !/(micropython|circuitpython|rpi_pico)/i.test(u.fsPath));
    return this.newest(candidates);
  }

  private async newest(uris: vscode.Uri[]): Promise<vscode.Uri | undefined> {
    let best: vscode.Uri | undefined;
    let bestTime = -1;
    for (const uri of uris) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.mtime > bestTime) {
          bestTime = stat.mtime;
          best = uri;
        }
      } catch {
        // fichier disparu entre temps : ignoré
      }
    }
    return best;
  }

  /** Date de modification d'un fichier (ms), ou undefined s'il est inaccessible. */
  private async mtimeOf(uri: vscode.Uri): Promise<number | undefined> {
    try {
      return (await vscode.workspace.fs.stat(uri)).mtime;
    } catch {
      return undefined;
    }
  }

  // --- Communication avec la webview -------------------------------------------

  private runProgram(result: CompileResult, label: string): void {
    this.post({ type: 'runProgram', ...result.payload });
    this.sendBreakpoints(); // synchronise la gouttière avec le programme qui démarre
    // Résumé des infos de débogage (aide à diagnostiquer « aucune variable »).
    let dbg = '';
    if (result.payload.board === 'uno') {
      const info = result.payload.debug;
      dbg = info
        ? l10n.t(' — debug: {0} lines, {1} variable(s)', info.lines.length, info.globals.length)
        : l10n.t(' — debug info unavailable (avr-objdump not found)');
    }
    vscode.window.showInformationMessage(
      l10n.t('Kablix: {0} loaded into the simulator.', label) + dbg
    );
    if (result.log) {
      console.log(`[Kablix] ${result.log}`);
    }
  }

  private reportError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.post({ type: 'status', text: l10n.t('Load failed') });
    // Erreur de COMPILATION : les diagnostics complets partent dans le moniteur
    // série, qui s'ouvre pour l'occasion. Avant, l'élève n'avait qu'une bulle
    // « échec de la compilation » et devait deviner ce que gcc reprochait à son
    // programme (demande de Frank). La notification, elle, ne garde que la
    // première erreur : c'est presque toujours celle qui compte.
    if (err instanceof CompileFailed) {
      this.post({
        type: 'hostLog',
        title: l10n.t('Compilation failed'),
        text: err.log,
      });
    }
    vscode.window.showErrorMessage(`Kablix : ${message}`);
  }

  /**
   * Réglages qui décident de l'INTERFACE : trois boutons de barre, masqués par
   * défaut. « Charger binaire » (déjà là), plus « Réinitialiser les composants »
   * et « Effacer le schéma » — retour de Frank : ils ne servent plus, mais on
   * les range derrière un réglage plutôt que de les supprimer.
   * Renvoyés à chaque changement de réglage : pas besoin de recharger l'atelier.
   */
  private postUiConfig(): void {
    const cfg = vscode.workspace.getConfiguration('kablix');
    this.post({
      type: 'config',
      showLoadBinary: cfg.get<boolean>('showLoadBinaryButton', false),
      showResetParts: cfg.get<boolean>('showResetPartsButton', false),
      showClearDiagram: cfg.get<boolean>('showClearDiagramButton', false),
    });
  }

  /** Chemins de toolchain fournis par l'utilisateur (réglages Kablix). */
  private toolPaths(): ToolPaths {
    const cfg = vscode.workspace.getConfiguration('kablix');
    return {
      arduinoCli: cfg.get<string>('arduinoCliPath')?.trim() || undefined,
      searchDir: cfg.get<string>('toolchainPath')?.trim() || undefined,
    };
  }

  // --- Fichier de code à exécuter / déboguer (chip du canvas) ------------------

  /** Mémorise le fichier de code et met à jour le chip affiché dans la webview. */
  private setCodeFile(uri: vscode.Uri | undefined): void {
    this.codeFileUri = uri;
    this.missingCodeFileRef = undefined; // fichier (re)choisi ou oublié : plus de référence en échec
    this.watchOnDisk('code', uri);
    this.post({
      type: 'codeFile',
      name: uri ? uri.fsPath.split(/[\\/]/).pop() : null,
      deleted: this.gone.has('code'),
    });
    this.postProjectName();
    this.postDebugVars(); // réglages de débogage (repli hérité inclus)
  }

  // --- Fichier supprimé SOUS LE NEZ de l'éditeur (demande de Frank) -------------
  // VS Code barre le nom d'un onglet dont le fichier vient d'être supprimé.
  // Kablix affiche deux noms de fichier — le chip 📄 du programme et le nom du
  // .Projix — qui, eux, restaient impassibles : on croyait le fichier là. Une
  // suppression faite DEHORS (explorateur Windows, autre outil) ne passe par
  // aucun événement d'espace de travail ; seule une surveillance du système de
  // fichiers la voit. Un fichier par rôle, pas de motif large.

  /** Surveillances en cours, par rôle, avec le chemin surveillé. */
  private watches = new Map<
    'code' | 'project',
    { path: string; watcher: vscode.FileSystemWatcher }
  >();
  /** Rôles dont le fichier a disparu du disque (nom barré en rouge). */
  private gone = new Set<'code' | 'project'>();

  /** (Re)pose la surveillance d'un rôle sur son fichier — sans rien refaire si
   *  c'est déjà le bon. Changer de fichier remet le rôle « présent ». */
  private watchOnDisk(role: 'code' | 'project', uri: vscode.Uri | undefined): void {
    const path = uri?.scheme === 'file' ? uri.fsPath : undefined;
    const current = this.watches.get(role);
    if (current?.path === path) return;
    current?.watcher.dispose();
    this.watches.delete(role);
    this.gone.delete(role); // autre fichier : l'alerte de l'ancien ne le suit pas
    if (!path || !uri) return;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(uri, '..'), path.split(/[\\/]/).pop() ?? '')
    );
    watcher.onDidDelete(() => this.setGone(role, true), null, this.disposables);
    // Rétabli (annulation, restauration depuis la corbeille, ré-enregistrement) :
    // le nom redevient normal, sinon il resterait barré pour de bon.
    watcher.onDidCreate(() => this.setGone(role, false), null, this.disposables);
    this.watches.set(role, { path, watcher });
    this.disposables.push(watcher);
  }

  /** Bascule l'état « disparu » d'un rôle et rafraîchit l'affichage concerné. */
  private setGone(role: 'code' | 'project', gone: boolean): void {
    if (gone === this.gone.has(role)) return;
    if (gone) this.gone.add(role);
    else this.gone.delete(role);
    if (role === 'code') {
      this.post({
        type: 'codeFile',
        name: this.codeFileUri ? this.codeFileUri.fsPath.split(/[\\/]/).pop() : null,
        deleted: gone,
      });
    } else {
      this.postProjectName();
    }
  }

  // --- Réglages du panneau de débogage : masquages 👁 + base d'affichage -------
  // Ils appartiennent au PROJET (v2026.7.194) : la webview les pousse à chaque
  // changement, ils sont gravés dans le manifeste du .projix au prochain
  // enregistrement (comme la caméra), et relus à l'ouverture. Aucun point ● et
  // aucun edit annulable : masquer une variable n'est pas une modification du
  // montage, c'est une façon de le lire.

  /** Réglages de débogage du projet courant, tels que reçus de la webview. */
  private debugVars: ProjixDebugVars = {};

  /** Vrai si aucun réglage n'est posé (rien à écrire dans le manifeste). */
  private static emptyDebugVars(d: ProjixDebugVars): boolean {
    return !d.hidden?.length && Object.keys(d.bases ?? {}).length === 0;
  }

  /**
   * Réglages à envoyer à la webview : ceux du projet, ou à défaut les masquages
   * hérités de l'état global (≤ v193, rangés par fichier de code puis .projix) —
   * sans quoi une mise à jour ferait réapparaître des variables masquées de
   * longue date. Le repli est lu, jamais réécrit.
   */
  private effectiveDebugVars(): ProjixDebugVars {
    if (!SimulatorPanel.emptyDebugVars(this.debugVars)) return this.debugVars;
    const all = this.context.globalState.get<Record<string, string[]>>(HIDDEN_VARS_KEY, {});
    const legacy =
      (this.codeFileUri ? all[this.codeFileUri.fsPath] : undefined) ??
      (this.projectUri ? all[this.projectUri.fsPath] : undefined);
    return legacy?.length ? { hidden: legacy } : this.debugVars;
  }

  /** Envoie à la webview les réglages de débogage du projet courant. */
  private postDebugVars(): void {
    const { hidden, bases } = this.effectiveDebugVars();
    this.post({ type: 'debugVars', hidden: hidden ?? [], bases: bases ?? {} });
  }

  /** Réglages reçus de la webview (masquage, réaffichage, changement de base). */
  private setDebugVars(hidden: unknown, bases: unknown): void {
    const names = Array.isArray(hidden) ? hidden.map(String) : [];
    const map: Record<string, 'hex' | 'bin' | 'char'> = {};
    if (bases && typeof bases === 'object') {
      for (const [name, base] of Object.entries(bases as Record<string, unknown>)) {
        // `dec` est l'état par défaut : il ne laisse jamais d'entrée.
        if (base === 'hex' || base === 'bin' || base === 'char') map[name] = base;
      }
    }
    this.debugVars = {
      ...(names.length ? { hidden: names } : {}),
      ...(Object.keys(map).length ? { bases: map } : {}),
    };
  }

  /** Nom du projet (sans chemin) : .projix ouvert/enregistré, sinon fichier de code. */
  private projectDisplayName(): string | undefined {
    return this.projectBaseName ?? (this.codeFileUri ? baseNameNoExt(this.codeFileUri.fsPath) : undefined);
  }

  /** Envoie à la webview le nom du projet affiché à côté du bouton d'aide.
   *  Extension affichée avec un P majuscule (« .Projix ») — le fichier sur
   *  disque reste en minuscule (`.projix`), seul l'affichage change. */
  private postProjectName(): void {
    this.watchOnDisk('project', this.projectUri); // suppression sous le nez → nom barré
    const name = this.projectBaseName
      ? `${this.projectBaseName}.Projix`
      : this.projectDisplayName();
    this.post({ type: 'projectName', name: name ?? null, deleted: this.gone.has('project') });
    this.updateTitle(); // le titre de l'onglet reprend le nom du projet
  }

  /** Titre de l'onglet du simulateur : « Kablix — Simulator », le nom du projet,
   *  puis un point noir « ● » (après le nom) tant que des modifications ne sont
   *  pas enregistrées. Le titre d'onglet est du texte brut. */
  private updateTitle(): void {
    const gone = this.gone.has('project');
    let project = this.projectBaseName ? `${this.projectBaseName}.Projix` : this.projectDisplayName();
    // Projet supprimé sous le nez de l'atelier : son nom est barré DANS L'ONGLET,
    // pas seulement dans la barre de l'atelier.
    if (project && gone) project = strikeThroughText(project);
    const base = project ? `${l10n.t('Kablix — Simulator')} — ${project}` : l10n.t('Kablix — Simulator');
    // L'hôte décide du rendu du « non enregistré » : ⬤ dans le titre pour le
    // WebviewPanel, point ● NATIF de l'onglet pour le CustomEditor.
    this.panel.setDirtyIndicator(this.projectDirty, base);
    // Onglet d'un éditeur personnalisé : son titre est le nom du fichier, pas
    // celui construit ici — c'est l'hôte qui le barre.
    this.panel.setDeletedIndicator?.(gone);
  }

  /** Référence du fichier de code pour le .projix : chemin relatif au workspace, sinon nom. */
  private codeFileRef(): string | undefined {
    if (!this.codeFileUri) return undefined;
    const p = this.codeFileUri.fsPath;
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const base = folder.uri.fsPath;
      if (p.startsWith(base)) {
        return p.slice(base.length).replace(/^[\\/]+/, '').replace(/\\/g, '/');
      }
    }
    return p.split(/[\\/]/).pop();
  }

  /**
   * Restaure le fichier de code d'un .projix : exécutable s'il existe, sinon nom
   * affiché EN ALERTE. Le fichier du PROJET PRÉCÉDENT est toujours oublié
   * d'abord : mieux vaut aucun fichier que l'ancien .py compilé à la place de
   * celui du projet. Résolution d'une référence relative : dossier du .projix
   * (le code vit généralement à côté du projet), puis chaque dossier du
   * workspace, puis le nom seul dans le dossier du .projix, puis le chemin
   * ABSOLU mémorisé à l'enregistrement (même poste, workspace différent).
   */
  private async restoreCodeFile(
    ref: string | undefined,
    projectDir?: vscode.Uri,
    abs?: string
  ): Promise<void> {
    this.setCodeFile(undefined);
    this.pendingCodeReveal = undefined; // jamais le programme du projet PRÉCÉDENT
    if (!ref && !abs) return;
    const candidates: vscode.Uri[] = [];
    if (ref) {
      if (/^([a-zA-Z]:[\\/]|\/)/.test(ref)) {
        candidates.push(vscode.Uri.file(ref));
      } else {
        if (projectDir) candidates.push(vscode.Uri.joinPath(projectDir, ref));
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
          candidates.push(vscode.Uri.joinPath(folder.uri, ref));
        }
      }
    }
    const base = (ref ?? abs)?.split(/[\\/]/).pop();
    if (projectDir && base && base !== ref) {
      candidates.push(vscode.Uri.joinPath(projectDir, base));
    }
    // Dernier recours : là où était le fichier quand le .projix a été enregistré.
    if (abs) candidates.push(vscode.Uri.file(abs));
    for (const uri of candidates) {
      try {
        await vscode.workspace.fs.stat(uri);
        this.setCodeFile(uri);
        // Le programme du projet s'ouvre AUSSI dans le volet de code, mais
        // seulement une fois la disposition posée (revealPendingCodeFile).
        this.pendingCodeReveal = uri;
        return;
      } catch {
        // candidat absent : on essaie le suivant
      }
    }
    // Fichier absent sur ce poste : chip en ALERTE (nom affiché, aucun fichier
    // actif) et ▶ bloqué tant qu'un fichier n'est pas choisi — sans ça, on
    // compilerait l'éditeur actif (souvent le fichier du PROJET PRÉCÉDENT).
    this.missingCodeFileRef = ref ?? abs;
    this.post({ type: 'codeFile', name: base, missing: true });
    vscode.window.showWarningMessage(
      l10n.t(
        'Kablix: the project code file "{0}" was not found on this computer. Click the 📄 chip to choose the file to run.',
        this.missingCodeFileRef ?? ''
      )
    );
  }

  /**
   * Montre un fichier source dans la colonne de code, SANS jamais en ouvrir un
   * second onglet. Demander `viewColumn: codeColumn` alors que le fichier est
   * déjà ouvert ailleurs faisait apparaître un DOUBLON (signalé au lancement du
   * débogage : le programme était ouvert à côté, un deuxième onglet s'ouvrait).
   * On réutilise donc l'onglet existant et, s'il est du mauvais côté, on le
   * REPOSITIONNE — le déplacement exige le focus, rendu ensuite à Kablix quand
   * l'appelant ne voulait pas le perdre (pas à pas).
   */
  private async revealSource(
    uri: vscode.Uri,
    preserveFocus: boolean
  ): Promise<vscode.TextEditor | undefined> {
    const target = codeColumn(this.context);
    const existing = textTabColumn(uri, target);
    if (existing !== undefined && existing !== target) {
      await vscode.window.showTextDocument(uri, { viewColumn: existing, preview: false });
      await moveEditorToColumn(uri, target);
      if (preserveFocus) this.panel.reveal(undefined, false); // focus rendu au simulateur
    }
    return vscode.window.showTextDocument(uri, {
      viewColumn: textTabColumn(uri, target) ?? target,
      preview: false,
      preserveFocus,
    });
  }

  /**
   * Ouvre le programme du projet qui vient d'être chargé, côté code, SANS voler
   * le focus : il reste sur Kablix (demande de Frank — on veut voir le code du
   * projet, pas y travailler tout de suite).
   *
   * Volontairement DIFFÉRÉ jusqu'à la pose de la disposition (appelée par
   * projix-editor après applyDefaultLayout/lockSimulatorGroup) : ouvrir l'onglet
   * pendant `resolveCustomEditor` volerait l'activation au .projix, or le layout
   * attend `panel.active` — il ne se poserait jamais, et le groupe du simulateur
   * n'étant pas encore verrouillé le code atterrirait DANS le groupe de Kablix.
   */
  public async revealPendingCodeFile(): Promise<void> {
    const uri = this.pendingCodeReveal;
    this.pendingCodeReveal = undefined;
    if (!uri) return;
    // Artefact compilé : binaire, aucun intérêt à l'afficher.
    if (/\.(hex|uf2|elf|bin)$/i.test(uri.fsPath)) return;
    try {
      await this.revealSource(uri, true);
      this.panel.reveal(undefined, false); // focus rendu à Kablix
    } catch {
      // fichier illisible / disparu entre-temps : on n'ouvre rien
    }
  }

  /** Ouvre le fichier de code courant dans le volet d'édition (côté code, opposé à Kablix). */
  public async openCodeFile(): Promise<void> {
    if (!this.codeFileUri) return;
    try {
      await this.revealSource(this.codeFileUri, false);
    } catch {
      // fichier renommé/supprimé depuis : rien à ouvrir
    }
  }

  /** Laisse l'utilisateur choisir le fichier de code via une boîte de dialogue. */
  public async pickCodeFile(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      defaultUri: this.codeFileUri ?? (folders?.length ? folders[0].uri : undefined),
      filters: {
        [l10n.t('Source code')]: ['ino', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'py'],
        [l10n.t('Compiled artifact')]: ['hex', 'uf2', 'elf', 'bin'],
      },
      title: l10n.t('Choose the code file to run / debug'),
    });
    if (!picked || picked.length === 0) return;
    this.setCodeFile(picked[0]);
  }

  private constructor(panel: SimulatorHost, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;
    this.extensionUri = context.extensionUri;
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.onDidDispose(() => this.onDispose(), null, this.disposables);
    // Mémorise la colonne courante pour rouvrir au même endroit la prochaine fois.
    this.panel.onDidChangeViewState(
      () => {
        if (this.panel.viewColumn) {
          void this.context.globalState.update(LAST_COLUMN_KEY, this.panel.viewColumn);
        }
      },
      null,
      this.disposables
    );
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.onMessage(msg),
      null,
      this.disposables
    );
    // Gouttière VS Code → simulateur : tout changement de point d'arrêt est relayé.
    vscode.debug.onDidChangeBreakpoints(() => this.sendBreakpoints(), null, this.disposables);
    // Réglages d'interface changés dans les options : les boutons optionnels
    // apparaissent/disparaissent tout de suite, sans recharger l'atelier.
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('kablix')) this.postUiConfig();
      },
      null,
      this.disposables
    );
    // NOTE : la disposition par défaut (applyDefaultLayout/lockSimulatorGroup)
    // n'est plus posée ici. En mode CustomEditor, l'onglet .projix est placé par
    // VS Code ; poser le layout par-document, avant que l'onglet soit positionné,
    // le mettait dans la mauvaise colonne. Le layout est désormais géré par le
    // provider à l'ouverture (voir ProjixEditorProvider). [layout à finaliser]
  }

  // --- Débogage : points d'arrêt et ligne courante ------------------------------

  /**
   * Envoie à la webview les points d'arrêt actifs du fichier source courant :
   * pour chacun, la ligne (1-based) et son éventuelle condition (expression
   * saisie dans la gouttière, évaluée côté moteur — Python pour MicroPython).
   */
  private sendBreakpoints(): void {
    try {
      const source = this.currentSourceUri;
      const breakpoints = !source
        ? []
        : vscode.debug.breakpoints
            .filter(
              (bp): bp is vscode.SourceBreakpoint =>
                bp.enabled &&
                bp instanceof vscode.SourceBreakpoint &&
                bp.location.uri.toString() === source.toString()
            )
            .map((bp) => ({
              line: bp.location.range.start.line + 1,
              condition: bp.condition || undefined,
            }));
      this.post({ type: 'breakpoints', breakpoints });
    } catch {
      // panneau ou éditeur dans un état transitoire : ignoré
    }
  }

  /** Surligne la ligne source où la simulation est en pause (sans voler le focus). */
  private async showDebugLine(line: number): Promise<void> {
    const source = this.currentSourceUri;
    if (!source || !Number.isFinite(line) || line < 1) return;
    try {
      this.debugLineDecoration ??= vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor('editor.stackFrameHighlightBackground'),
      });
      const editor = await this.revealSource(source, true);
      if (!editor) return;
      const range = editor.document.lineAt(
        Math.min(line - 1, editor.document.lineCount - 1)
      ).range;
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      editor.setDecorations(this.debugLineDecoration, [range]);
    } catch {
      // fichier fermé, renommé ou supprimé : pas de surlignage
    }
  }

  /** Efface le surlignage de pause dans tous les éditeurs visibles. */
  private clearDebugLine(): void {
    if (!this.debugLineDecoration) return;
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.debugLineDecoration, []);
    }
  }

  private onMessage(msg: {
    type?: string;
    board?: Board;
    svg?: string;
    csv?: string;
    parts?: unknown[];
    models?: unknown[];
    part?: unknown;
    state?: unknown;
    line?: number;
    diagram?: unknown;
    json?: unknown;
    onlyIfChanged?: boolean;
    request?: unknown;
    url?: string;
    dirty?: boolean;
    command?: string;
    /** Dessin retouché dans l'éditeur SVG du système (messages `editSvg`). */
    which?: string;
    /** Réglages du panneau de débogage (message `debugVars`). */
    hidden?: unknown;
    bases?: unknown;
    /** Presse-papier système (messages `clipboardRead` / `clipboardWrite`). */
    id?: number;
    text?: string;
  }): void {
    // Toute interaction de la webview marque cette session comme « active » :
    // les commandes globales (Enregistrer, Wokwi…) la ciblent.
    SimulatorPanel.lastActive = this;
    switch (msg?.type) {
      case 'ready':
        // La webview écoute enfin : tout ce qui a été émis pendant son chargement
        // (le schéma du projet en tête) part maintenant, dans l'ordre.
        this.flushPostQueue();
        // Renvoie les composants personnalisés et les préférences d'interface.
        this.post({
          type: 'simModels',
          models: this.context.globalState.get<unknown[]>(SIM_MODELS_KEY, []),
        });
        this.post({
          type: 'customParts',
          parts: this.context.globalState.get<unknown[]>(CUSTOM_PARTS_KEY, []),
        });
        this.post({
          type: 'uiState',
          state: this.context.globalState.get<unknown>(UI_STATE_KEY, {}),
        });
        this.postUiConfig();
        // Rappelle le fichier de code courant (chip du canvas) après un
        // rechargement — y compris l'état « introuvable » d'un .projix ouvert.
        if (this.missingCodeFileRef) {
          this.post({
            type: 'codeFile',
            name: this.missingCodeFileRef.split(/[\\/]/).pop(),
            missing: true,
          });
          this.postDebugVars(); // le chip est en alerte, les réglages restent utiles
        } else {
          this.setCodeFile(this.codeFileUri);
        }
        // Réouverture après fermeture avec modifications non enregistrées :
        // recharge le schéma récupéré et propose de l'enregistrer.
        if (SimulatorPanel.pendingReopen) {
          void this.resumeAfterUnsavedClose(SimulatorPanel.pendingReopen);
          SimulatorPanel.pendingReopen = undefined;
        }
        break;
      case 'pickCodeFile':
        void this.pickCodeFile();
        break;
      case 'openCodeFile':
        void this.openCodeFile();
        break;
      case 'saveUiState':
        void this.context.globalState.update(UI_STATE_KEY, msg.state ?? {});
        break;
      case 'debugVars':
        // Masquage / réaffichage / base d'affichage : réglages du projet, écrits
        // dans le manifeste au prochain enregistrement. Un GESTE de l'utilisateur
        // (`dirty`) marque le fichier « à enregistrer » (v203) — sinon le réglage
        // serait perdu en fermant l'onglet sans que rien ne le signale. Les
        // réglages relus à l'ouverture arrivent sans `dirty` : projet propre.
        this.setDebugVars(msg.hidden, msg.bases);
        if (msg.dirty === true) this.markProjectDirty();
        break;
      case 'board':
        if (msg.board) this.currentBoard = msg.board;
        break;
      case 'compile':
        if (msg.board) this.currentBoard = msg.board;
        void this.compileActiveFile(msg.onlyIfChanged === true);
        break;
      case 'startRepl':
        if (msg.board) this.currentBoard = msg.board;
        void this.startReplMode();
        break;
      case 'loadWorkspace':
        if (msg.board) this.currentBoard = msg.board;
        void this.loadWorkspaceArtifact();
        break;
      case 'exportSvg':
        if (msg.svg) void this.saveSvg(msg.svg);
        break;
      case 'clipboardRead':
        // Copier/coller d'un atelier à l'autre : la webview n'a pas toujours le
        // droit de LIRE le presse-papier, l'extension l'a toujours.
        void vscode.env.clipboard.readText().then(
          (text) => this.post({ type: 'clipboardText', id: msg.id, text }),
          () => this.post({ type: 'clipboardText', id: msg.id, text: null })
        );
        break;
      case 'clipboardWrite':
        // Repli d'écriture (navigator.clipboard refusé côté webview).
        if (typeof msg.text === 'string') void vscode.env.clipboard.writeText(msg.text);
        break;
      case 'exportCsv':
        if (typeof msg.csv === 'string') void this.saveCsv(msg.csv);
        break;
      case 'saveCustomParts':
        void this.context.globalState.update(CUSTOM_PARTS_KEY, msg.parts ?? []);
        break;
      case 'saveSimModels':
        void this.context.globalState.update(SIM_MODELS_KEY, msg.models ?? []);
        break;
      case 'exportCustomPart':
        if (msg.part) void this.saveCustomPartFile(msg.part as { label?: string });
        break;
      case 'editSvg':
        // Créateur de composants : retouche d'un dessin dans l'éditeur SVG du système.
        if (typeof msg.svg === 'string' && (msg.which === 'ext' || msg.which === 'int')) {
          void this.editSvgExternally(msg.which, msg.svg);
        }
        break;
      case 'stopEditSvg':
        this.stopSvgWatchers();
        break;
      case 'debugLine':
        // Simulation en pause sur une ligne : surligne dans l'éditeur du source.
        if (typeof msg.line === 'number') void this.showDebugLine(msg.line);
        break;
      case 'debugResumed':
        this.clearDebugLine();
        break;
      case 'nativeSave':
        // Bouton Enregistrer : save « intelligent » — un projet untitled avec un
        // fichier de code associé propose le nom du code (au lieu de « Nouveau
        // projet.projix »), sinon save natif de VS Code (nom déjà connu).
        this.saveSmart(false);
        break;
      case 'nativeSaveAs':
        this.saveSmart(true);
        break;
      case 'saveProject':
        // La webview fournit le schéma sérialisé : on construit le .projix.
        // Écriture directe si un .projix est déjà connu, boîte de dialogue sinon.
        void this.saveProject(msg.diagram, msg.board);
        break;
      case 'saveProjectAs':
        // « Enregistrer sous » : boîte de dialogue systématique.
        void this.saveProject(msg.diagram, msg.board, true);
        break;
      case 'projectDirty':
        // La webview signale l'état « modifications non enregistrées » : ● dans
        // l'onglet (le nom dans la barre est géré côté webview).
        this.projectDirty = msg.dirty === true;
        if (this.projectDirty) {
          this.pendingDiagram = msg.diagram;
          if (msg.board) this.pendingBoard = msg.board;
          this.discardAccepted = false; // nouvelle modif : garde-fou réactivé
        } else {
          this.pendingDiagram = undefined; // enregistré : plus rien à proposer
        }
        this.updateTitle();
        break;
      case 'syncDiagram':
        // Schéma tenu à jour tant que le projet est « sale » (fermeture éventuelle).
        this.pendingDiagram = msg.diagram;
        if (msg.board) this.pendingBoard = msg.board;
        this.discardAccepted = false; // une modification est survenue
        break;
      case 'docEdit':
        // Édition utilisateur : empile un edit dans le CustomEditor (● + Ctrl+Z natifs).
        this.pendingDiagram = msg.diagram;
        if (msg.board) this.pendingBoard = msg.board;
        this.panel.onDocEdit?.();
        break;
      case 'openProject':
        // Ouvre un projet dans un NOUVEL onglet (commande = openProjixViaDialog).
        void vscode.commands.executeCommand('kablix.openProject');
        break;
      case 'newProjectTab':
        // Nouveau projet = nouvel onglet .projix untitled (ne touche pas le courant).
        void vscode.commands.executeCommand('kablix.openSimulator');
        break;
      case 'newProject':
        // (legacy WebviewPanel) Nouveau projet en place : la webview a déjà vidé
        // le schéma ; on oublie le nom du .projix courant et le fichier de code.
        this.projectBaseName = undefined;
        this.projectUri = undefined;
        this.currentSourceUri = undefined;
        this.setCodeFile(undefined);
        break;
      case 'help':
        void vscode.commands.executeCommand('kablix.openHelp');
        break;
      case 'menuCommand':
        // Menu « Autres fonctions » : relaie la commande VS Code demandée
        // (liste blanche stricte — jamais une commande arbitraire de la webview).
        if (typeof msg.command === 'string') {
          const allowed = new Set([
            'kablix.importWokwiDiagram',
            'kablix.exportWokwiDiagram',
            'kablix.exportPartsCsv',
            'kablix.upgradePicoFirmware',
            'kablix.checkLibraryUpdates',
            'kablix.saveDefaultLayout',
            'kablix.rearrangeLayout',
          ]);
          if (allowed.has(msg.command)) {
            void vscode.commands.executeCommand(msg.command);
          }
        }
        break;
      case 'openExternal':
        // Liste blanche stricte : doc Wokwi d'un composant (bouton aide de
        // l'inspecteur) + dépôt Kablix (formulaire de soumission de composant).
        if (
          typeof msg.url === 'string' &&
          /^https:\/\/(docs\.wokwi\.com|github\.com\/FrankSAURET\/kablix)\//.test(msg.url)
        ) {
          void vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        break;
      case 'openRepo':
        // Clic sur « Kablix vX » : ouvre le dépôt GitHub.
        void vscode.env.openExternal(vscode.Uri.parse('https://github.com/FrankSAURET/kablix'));
        break;
      case 'componentHelp':
        // Aide locale (hors-ligne) d'un composant : fiche docs/<lang>/composants/<type>.md
        // rendue dans une webview Kablix. L'aperçu Markdown de VS Code ne
        // convient pas : il bloque les images atteintes par « ../.. » quand la
        // fiche n'est pas dans le workspace (cas du .vsix installé) — cf. partHelp.ts.
        if (typeof msg.part === 'string' && /^[a-z0-9-]+$/i.test(msg.part)) {
          void PartHelpPanel.show(this.extensionUri, msg.part).then((found) => {
            if (!found) void vscode.window.showInformationMessage(vscode.l10n.t('No help available for this part yet.'));
          });
        }
        break;
      case 'wokwiExport':
        // La webview a converti le schéma au format Wokwi : on l'enregistre.
        void this.saveWokwiDiagram(msg.json);
        break;
      case 'partsCsv':
        // La webview a dressé la nomenclature : on l'enregistre.
        void this.savePartsCsv(msg.csv);
        break;
      case 'net':
        // Pont réseau Pico W : requête HTTP émise par le script simulé.
        void this.handleNetRequest(msg.request as NetBridgeRequest);
        break;
    }
  }

  // --- Pont réseau Pico W (option « pont réseau réel via l'hôte ») ------------

  /**
   * Exécute la vraie requête HTTP demandée par le script MicroPython (le Wi-Fi
   * n'étant pas émulé) puis renvoie la réponse à la webview, qui la réinjecte
   * dans le script. Borné par un délai et une taille de corps (le tunnel série
   * est lent). Désactivable via le réglage `kablix.picowNetworkBridge`.
   */
  private async handleNetRequest(req: NetBridgeRequest): Promise<void> {
    const reply = (r: Record<string, unknown>): void =>
      this.post({ type: 'netResponse', response: { id: req?.id, ...r } });
    if (!req || typeof req.url !== 'string') {
      reply({ error: 'invalid request' });
      return;
    }
    const allowed = vscode.workspace
      .getConfiguration('kablix')
      .get<boolean>('picowNetworkBridge', true);
    if (!allowed) {
      reply({ error: 'network bridge disabled (kablix.picowNetworkBridge)' });
      return;
    }
    // Seuls http/https sont relayés (jamais file:, data:, ni autre schéma local).
    let protocol: string;
    try {
      protocol = new URL(req.url).protocol;
    } catch {
      reply({ error: 'invalid url' });
      return;
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      reply({ error: `unsupported protocol: ${protocol}` });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(req.url, {
        method: req.m || 'GET',
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });
      let body = await res.text();
      // Le tunnel série transfère octet par octet : on plafonne le corps.
      const MAX = 64 * 1024;
      if (body.length > MAX) body = body.slice(0, MAX);
      reply({ status: res.status, reason: res.statusText, body });
    } catch (err) {
      reply({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Interopérabilité Wokwi (diagram.json) -----------------------------------

  /** Demande à la webview son schéma converti au format Wokwi, pour l'export. */
  public requestWokwiExport(): void {
    this.post({ type: 'requestWokwiExport' });
  }

  /** Écrit le projet Wokwi (diagram.json) renvoyé par la webview. */
  private async saveWokwiDiagram(json: unknown): Promise<void> {
    try {
      const folders = vscode.workspace.workspaceFolders;
      const defaultUri = folders?.length
        ? vscode.Uri.joinPath(folders[0].uri, 'diagram.json')
        : vscode.Uri.file('diagram.json');
      const target = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { [l10n.t('Wokwi diagram')]: ['json'] },
        title: l10n.t('Export the Wokwi diagram (diagram.json)'),
      });
      if (!target) return;
      await vscode.workspace.fs.writeFile(
        target,
        new TextEncoder().encode(JSON.stringify(json, null, 2))
      );
      vscode.window.showInformationMessage(
        l10n.t('Kablix: Wokwi diagram exported to {0}', target.fsPath)
      );
    } catch (err) {
      this.reportError(err);
    }
  }

  // --- Nomenclature (liste des composants en CSV) ------------------------------

  /** Demande à la webview la liste de ses composants, pour l'écrire en CSV. */
  public requestPartsCsv(): void {
    this.post({ type: 'requestPartsCsv' });
  }

  /**
   * Écrit la nomenclature renvoyée par la webview. Le fichier proposé porte le
   * NOM DU PROJET (« ventilo.csv »), rangé à côté du .projix quand il existe —
   * une nomenclature sans projet n'a pas de nom naturel.
   */
  private async savePartsCsv(csv: unknown): Promise<void> {
    try {
      const text = typeof csv === 'string' ? csv : '';
      const name = `${this.projectDisplayName() ?? l10n.t('parts')}.csv`;
      const folder =
        this.projectUri && this.projectUri.scheme !== 'untitled'
          ? vscode.Uri.joinPath(this.projectUri, '..')
          : vscode.workspace.workspaceFolders?.[0]?.uri;
      const target = await vscode.window.showSaveDialog({
        defaultUri: folder ? vscode.Uri.joinPath(folder, name) : vscode.Uri.file(name),
        filters: { [l10n.t('Part list')]: ['csv'] },
        title: l10n.t('Export the part list (CSV)'),
      });
      if (!target) return;
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(text));
      vscode.window.showInformationMessage(
        l10n.t('Kablix: part list exported to {0}', target.fsPath)
      );
    } catch (err) {
      this.reportError(err);
    }
  }

  /** Ouvre un diagram.json Wokwi, le lit et l'envoie à la webview pour conversion. */
  public async importWokwiDiagram(): Promise<void> {
    try {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { [l10n.t('Wokwi diagram')]: ['json'] },
        title: l10n.t('Open a Wokwi diagram (diagram.json)'),
      });
      if (!picked || picked.length === 0) return;
      const raw = await vscode.workspace.fs.readFile(picked[0]);
      const json = JSON.parse(Buffer.from(raw).toString('utf8'));
      this.post({ type: 'importWokwi', json });
    } catch (err) {
      this.reportError(err);
    }
  }

  // --- Format de projet .projix (schéma seul, sans le code) --------------------

  /** Demande à la webview son schéma puis enregistre un .projix (commande). */
  public requestSaveProject(): void {
    this.post({ type: 'requestSaveProject' });
  }

  /**
   * Construit et écrit une archive .projix : manifeste + schéma + composants
   * personnalisés. Le code n'est plus inclus (le .projix ne contient que le
   * schéma).
   */
  /** Sérialise le projet .projix (manifeste + schéma + composants perso). */
  private async buildProjixBytes(diagram: unknown, board?: Board): Promise<Uint8Array> {
    // Le schéma est enrichi des composants personnalisés utilisés (stockés côté
    // hôte) pour rester autonome à la réouverture sur un autre poste.
    const customParts = this.context.globalState.get<unknown[]>(CUSTOM_PARTS_KEY, []);
    const diagramPayload = { ...(diagram as object), customParts };
    const manifest: ProjixManifest = {
      format: 'projix',
      version: PROJIX_FORMAT_VERSION,
      app: this.appVersion(),
      board: board ?? this.currentBoard,
      createdAt: new Date().toISOString(),
      codeFile: this.codeFileRef(),
      codeFileAbs: this.codeFileUri?.fsPath,
    };
    // Réglages du panneau de débogage (masquages 👁 + bases d'affichage) : gravés
    // avec le projet, omis tant que rien n'est réglé. `effectiveDebugVars` fait
    // suivre les masquages hérités de l'état global (≤ v193) : le premier
    // enregistrement les fait passer dans le .projix.
    const debugVars = this.effectiveDebugVars();
    if (!SimulatorPanel.emptyDebugVars(debugVars)) manifest.debugVars = debugVars;
    // Backup hot-exit : grave l'état ● du moment (consommé ici). Les .projix
    // enregistrés normalement n'ont jamais ce champ (toujours « propre »).
    if (this.backupDirtyFlag !== undefined) {
      manifest.dirtyAtExit = this.backupDirtyFlag;
      this.backupDirtyFlag = undefined;
    }
    // Schéma seul : pas de codeRoot transmis.
    return packProject({ manifest, diagramJson: JSON.stringify(diagramPayload) });
  }

  private async saveProject(diagram: unknown, board?: Board, saveAs = false): Promise<void> {
    // Écriture ponctuelle (backup hot-exit) : écrit à cet endroit sans changer
    // la cible courante ni l'état projet.
    const oneShot = this.oneShotTarget;
    this.oneShotTarget = undefined;
    try {
      if (oneShot) {
        const bytes = await this.buildProjixBytes(diagram, board);
        await vscode.workspace.fs.writeFile(oneShot, bytes);
        return;
      }
      // Cible imposée par le CustomEditor (Ctrl+S natif) : l'URI du document,
      // sauf s'il est encore « untitled » (→ dialogue au premier enregistrement).
      const boundTarget =
        this.documentUri && this.documentUri.scheme !== 'untitled'
          ? this.documentUri
          : undefined;
      // Enregistrer (pas « sous ») avec un .projix déjà connu : écriture
      // directe au même endroit, sans boîte de dialogue.
      let target = saveAs ? undefined : (boundTarget ?? this.projectUri);
      const silent = target !== undefined;
      if (!target) {
        const folders = vscode.workspace.workspaceFolders;
        // Nom par défaut = nom du projet ouvert/enregistré, sinon le fichier de
        // code associé (sans chemin ni extension), sinon repli générique.
        const base = this.projectDisplayName() ?? 'schema-kablix';
        const fileName = `${base}.projix`;
        const defaultUri = this.projectUri ??
          (folders?.length
            ? vscode.Uri.joinPath(folders[0].uri, fileName)
            : vscode.Uri.file(fileName));
        target = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { [l10n.t('Kablix project')]: ['projix'] },
          title: l10n.t('Save the Kablix project'),
        });
        if (!target) return;
      }

      const bytes = await this.buildProjixBytes(diagram, board);
      await vscode.workspace.fs.writeFile(target, bytes);
      this.projectUri = target;
      this.projectBaseName = baseNameNoExt(target.fsPath);
      this.rememberLastProject(target);
      this.postProjectName();
      // Confirmation visible DANS l'atelier (statut « Projet sauvegardé »).
      this.post({ type: 'projectSaved' });
      if (silent) {
        // Enregistrement direct : simple message TEMPORAIRE dans la barre d'état.
        vscode.window.setStatusBarMessage(
          l10n.t('Kablix: project saved to {0}', target.fsPath),
          4000
        );
      } else {
        vscode.window.showInformationMessage(
          l10n.t('Kablix: project saved to {0}', target.fsPath)
        );
      }
      // Untitled devenu un vrai fichier : le CustomEditor doit désormais viser
      // ce fichier pour les Ctrl+S suivants.
      const wasUntitled = this.documentUri?.scheme === 'untitled';
      this.documentUri = target;
      // Save « intelligent » d'un untitled : l'onglet untitled reste marqué ●
      // côté VS Code (il ignore notre écriture). On le REMPLACE par le vrai
      // fichier ouvert dans le même éditeur Kablix, à la même place.
      if (this.pendingReopenAfterSave && wasUntitled) {
        this.pendingReopenAfterSave = false;
        await this.reopenAsFile(target);
      }
    } catch (err) {
      this.reportError(err);
    } finally {
      this.pendingReopenAfterSave = false;
      // Débloque un éventuel Ctrl+S natif du CustomEditor en attente.
      this.pendingSaveResolve?.();
      this.pendingSaveResolve = undefined;
    }
  }

  /** Remplace l'onglet untitled courant par le fichier .projix qu'on vient
   *  d'écrire : ouvre le vrai fichier dans l'éditeur Kablix (même colonne) puis
   *  ferme l'onglet untitled — l'utilisateur retrouve son schéma, désormais nommé
   *  et sans point ●. */
  private async reopenAsFile(target: vscode.Uri): Promise<void> {
    const column = this.panel.viewColumn;
    try {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        target,
        'kablix.projix',
        column
      );
      // Ferme l'onglet untitled remplacé (après l'ouverture du fichier réel).
      this.panel.dispose();
    } catch {
      // Ouverture impossible : on laisse l'onglet untitled en place (le fichier
      // est déjà écrit sur le disque, rien n'est perdu).
    }
  }

  /**
   * Ouvre un .projix : lit l'archive puis recharge le schéma et la carte dans la
   * webview. Le code éventuel d'anciennes archives est ignoré (schéma seul).
   * `uri` fourni (double-clic sur un .projix dans l'explorateur) : pas de
   * boîte de dialogue.
   */
  public async openProject(uri?: vscode.Uri): Promise<void> {
    try {
      // Modifications non enregistrées : mise en garde bloquante avant d'écraser
      // le schéma courant par le projet ouvert (OK = continuer, Annuler = renoncer).
      if (this.projectDirty) {
        const ok = l10n.t('Open anyway');
        const choice = await vscode.window.showWarningMessage(
          l10n.t('The current project has unsaved changes. Opening another project will discard them.'),
          { modal: true },
          ok
        );
        if (choice !== ok) return;
      }
      const picked = uri
        ? [uri]
        : await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { [l10n.t('Kablix project')]: ['projix'] },
            title: l10n.t('Open a Kablix project'),
          });
      if (!picked || picked.length === 0) return;

      const bytes = await vscode.workspace.fs.readFile(picked[0]);
      await this.openProjectFromBytes(bytes, picked[0]);
      // Disposition déjà posée ici (projet ouvert depuis un atelier existant) :
      // le programme peut être montré tout de suite.
      await this.revealPendingCodeFile();
      vscode.window.showInformationMessage(
        l10n.t('Kablix: project {0} loaded.', picked[0].fsPath.split(/[\\/]/).pop() ?? '')
      );
    } catch (err) {
      this.reportError(err);
    }
  }

  /**
   * Recharge un projet .projix à partir de ses octets et de son URI (appelé par
   * openProject après lecture disque, et par le CustomEditor à l'ouverture d'un
   * document). Ne touche pas à l'UI de dialogue.
   */
  private async openProjectFromBytes(bytes: Uint8Array, uri: vscode.Uri): Promise<void> {
    const project = await unpackProject(bytes);
    this.projectUri = uri; // cible du bouton Enregistrer (sans dialogue)
    this.projectBaseName = baseNameNoExt(uri.fsPath);
    this.rememberLastProject(uri);
    this.postProjectName();

    // Recharge le schéma et la carte dans la webview (et les composants perso).
    const diagram = project.diagram as { customParts?: unknown[] } | undefined;
    const customParts = Array.isArray(diagram?.customParts) ? diagram.customParts : undefined;
    if (customParts) {
      await this.context.globalState.update(CUSTOM_PARTS_KEY, customParts);
    }
    this.currentBoard = project.manifest.board ?? this.currentBoard;
    // Réglages du panneau de débogage du projet (masquages + bases). Envoyés
    // AVANT restoreCodeFile : celui-ci repostera le repli hérité si le projet
    // n'en porte aucun.
    this.setDebugVars(project.manifest.debugVars?.hidden, project.manifest.debugVars?.bases);
    this.postDebugVars();
    this.post({
      type: 'loadProject',
      diagram: project.diagram,
      board: project.manifest.board,
      customParts,
    });
    // Restaure le fichier de code à exécuter/déboguer mémorisé dans le projet
    // (résolu en priorité à côté du .projix ; l'ancien fichier est oublié).
    await this.restoreCodeFile(
      project.manifest.codeFile,
      vscode.Uri.joinPath(uri, '..'),
      project.manifest.codeFileAbs
    );
  }

  /** Version de l'extension (depuis package.json), « ? » si introuvable. */
  private appVersion(): string {
    return (
      vscode.extensions.getExtension('electropol-fr.kablix')?.packageJSON?.version ?? '?'
    );
  }

  /** Exporte un composant personnalisé en fichier .json (format documenté). */
  private async saveCustomPartFile(part: { label?: string }): Promise<void> {
    const safeName = (part.label ?? 'composant').replace(/[^\p{L}\p{N}_-]+/gu, '-').toLowerCase();
    const folders = vscode.workspace.workspaceFolders;
    const defaultUri = folders?.length
      ? vscode.Uri.joinPath(folders[0].uri, `${safeName}.kablix-part.json`)
      : vscode.Uri.file(`${safeName}.kablix-part.json`);
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { [l10n.t('Kablix part')]: ['json'] },
      title: l10n.t('Export the part'),
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(
      target,
      new TextEncoder().encode(JSON.stringify(part, null, 2))
    );
    vscode.window.showInformationMessage(l10n.t('Kablix: part exported to {0}', target.fsPath));
  }

  /**
   * Retouche d'un dessin du créateur de composants dans l'éditeur SVG du
   * système (Inkscape…) : le dessin part dans un fichier de travail, s'ouvre
   * dans l'éditeur CHOISI PAR L'UTILISATEUR (réglage `kablix.svgEditorPath`),
   * et chaque ENREGISTREMENT le renvoie à la webview. On ne peut pas savoir
   * quand l'éditeur se ferme — mais on voit chacune de ses écritures, ce qui
   * vaut mieux qu'une seule relecture finale.
   */
  private async editSvgExternally(which: 'ext' | 'int', svg: string): Promise<void> {
    const dir = this.context.globalStorageUri;
    await vscode.workspace.fs.createDirectory(dir);
    const uri = vscode.Uri.joinPath(
      dir,
      which === 'ext' ? 'kablix-dessin-externe.svg' : 'kablix-schema-interne.svg'
    );
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(svg));
    const stat = await vscode.workspace.fs.stat(uri);
    const previous = this.svgWatches.get(which);
    if (previous) clearInterval(previous.timer);
    this.svgWatches.set(which, {
      uri,
      mtime: stat.mtime,
      timer: setInterval(() => void this.pollEditedSvg(which), 800),
    });
    await openInSvgEditor(uri);
  }

  /** Le fichier de travail a-t-il été réenregistré ? Si oui, retour à la webview. */
  private async pollEditedSvg(which: 'ext' | 'int'): Promise<void> {
    const watch = this.svgWatches.get(which);
    if (!watch) return;
    try {
      const stat = await vscode.workspace.fs.stat(watch.uri);
      if (stat.mtime <= watch.mtime) return;
      watch.mtime = stat.mtime;
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(watch.uri));
      if (text.trim()) this.post({ type: 'svgEdited', which, svg: text });
    } catch {
      // Enregistrement atomique : le fichier disparaît une fraction de seconde.
    }
  }

  /** Fin de la surveillance (créateur refermé, panneau détruit). */
  private stopSvgWatchers(): void {
    for (const watch of this.svgWatches.values()) clearInterval(watch.timer);
    this.svgWatches.clear();
  }

  /** Enregistre le schéma exporté en SVG via un dialogue de sauvegarde. */
  private async saveSvg(svg: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    // Nom par défaut = nom du projet ouvert/enregistré, sinon fichier de code
    // associé, sinon nom du dossier de travail, sinon repli générique.
    const base =
      this.projectDisplayName() ??
      (folders?.length ? baseNameNoExt(folders[0].uri.fsPath) : null) ??
      'schema-kablix';
    const fileName = `${base}.svg`;
    const defaultUri = folders?.length
      ? vscode.Uri.joinPath(folders[0].uri, fileName)
      : vscode.Uri.file(fileName);
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { [l10n.t('SVG image')]: ['svg'] },
      title: l10n.t('Export the diagram as SVG'),
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(svg));
    vscode.window.showInformationMessage(l10n.t('Kablix: diagram exported to {0}', target.fsPath));
  }

  /** Enregistre les mesures du traceur de courbes (format CSV long). */
  private async saveCsv(csv: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    const base = this.projectDisplayName() ?? 'mesures-kablix';
    const fileName = `${base}.csv`;
    const defaultUri = folders?.length
      ? vscode.Uri.joinPath(folders[0].uri, fileName)
      : vscode.Uri.file(fileName);
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { [l10n.t('CSV measurements')]: ['csv'] },
      title: l10n.t('Export the plotter data (CSV)'),
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(csv));
    vscode.window.showInformationMessage(l10n.t('Kablix: measurements exported to {0}', target.fsPath));
  }

  /** Vrai dès que la webview a annoncé « ready » : avant, elle n'écoute pas
   *  encore et tout message envoyé est PERDU. */
  private webviewReady = false;
  /** Messages émis avant ce « ready », rejoués dans l'ordre à son arrivée. */
  private readonly postQueue: unknown[] = [];

  /**
   * Envoi vers la webview, MIS EN FILE tant qu'elle n'a pas dit « ready ».
   *
   * L'atelier s'ouvrait vide au hasard (dht11, CI3-uno, ventilo… retours de
   * Frank) alors que le `.projix` était intact : `resolveCustomEditor` lit le
   * fichier et poste `loadProject` en quelques millisecondes, quand la webview
   * en met bien plus à charger son bundle. Le message partait donc AVANT que le
   * script n'installe son écouteur — le tampon interne de VS Code le rattrape
   * la plupart du temps, mais pas toujours (onglet restauré, machine chargée),
   * et le schéma tombait alors dans le vide : atelier vierge, sans erreur, que
   * seule une réouverture réparait. La file supprime la course : rien ne part
   * avant que la webview écoute pour de bon.
   */
  private post(message: unknown): void {
    if (!this.webviewReady) {
      this.postQueue.push(message);
      // Filet : si « ready » n'arrive jamais (bundle en erreur), on finit par
      // envoyer quand même — au pire c'est le comportement d'avant, jamais pire.
      if (this.readyTimer === undefined) {
        this.readyTimer = setTimeout(() => this.flushPostQueue(), 20_000);
      }
      return;
    }
    void this.panel.webview.postMessage(message);
  }

  private readyTimer: ReturnType<typeof setTimeout> | undefined;

  /** « ready » reçu : la webview écoute, on vide la file dans l'ordre d'émission. */
  private flushPostQueue(): void {
    if (this.readyTimer !== undefined) {
      clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }
    this.webviewReady = true;
    const attente = this.postQueue.splice(0);
    for (const m of attente) void this.panel.webview.postMessage(m);
  }

  /** Panneau rouvert après une fermeture avec modifications non enregistrées :
   *  recharge le schéma récupéré, restaure le contexte du projet, puis propose
   *  une fenêtre modale Enregistrer / Continuer sans enregistrer. */
  private async resumeAfterUnsavedClose(state: {
    diagram: unknown;
    board: Board | undefined;
    projectUri: vscode.Uri | undefined;
    projectBaseName: string | undefined;
    codeFileUri: vscode.Uri | undefined;
  }): Promise<void> {
    this.projectUri = state.projectUri;
    this.projectBaseName = state.projectBaseName;
    if (state.board) this.currentBoard = state.board;
    this.pendingDiagram = state.diagram;
    this.pendingBoard = state.board;
    this.projectDirty = true;
    this.updateTitle();
    this.postProjectName();
    if (state.codeFileUri) this.setCodeFile(state.codeFileUri); // restaure le chip de code
    // Recharge le schéma tel qu'il était à la fermeture (markDirty : il reste
    // « non enregistré » tant qu'aucun enregistrement réel n'a eu lieu).
    this.post({ type: 'loadProject', diagram: state.diagram, board: state.board, markDirty: true });

    const save = l10n.t('Save');
    const discard = l10n.t('Continue without saving');
    const choice = await vscode.window.showWarningMessage(
      l10n.t('The project has unsaved changes that were about to be lost when the tab was closed.'),
      { modal: true },
      save,
      discard
    );
    if (choice === save) {
      await this.saveProject(state.diagram, state.board);
    } else {
      // « Continuer sans enregistrer » / fermeture de la modale : le panneau
      // reste ouvert avec le schéma restauré (toujours « non enregistré »), mais
      // la perte est acceptée — la PROCHAINE fermeture ne rouvre plus (sauf
      // nouvelle modification, qui remet le garde-fou).
      this.discardAccepted = true;
    }
  }

  private onDispose(): void {
    // Onglet fermé avec des modifications non enregistrées : l'API webview ne
    // permet PAS d'annuler la fermeture, mais le schéma reçu de la webview est
    // encore en mémoire. On rouvre le panneau avec ce schéma et on propose de
    // l'enregistrer (fenêtre modale Enregistrer / Continuer sans enregistrer).
    // Réouverture « modifications non enregistrées » : hack réservé au panneau
    // WebviewPanel historique. Un CustomEditor (document-backed) a le prompt de
    // fermeture NATIF de VS Code — ne pas rouvrir de panneau par-dessus.
    const reopen =
      this.documentUri === undefined &&
      this.projectDirty &&
      !this.discardAccepted && // l'utilisateur a déjà accepté la perte
      this.pendingDiagram !== undefined &&
      !SimulatorPanel.pendingReopen; // pas déjà en cours de réouverture
    if (reopen) {
      SimulatorPanel.pendingReopen = {
        diagram: this.pendingDiagram,
        board: this.pendingBoard ?? this.currentBoard,
        projectUri: this.projectUri,
        projectBaseName: this.projectBaseName,
        codeFileUri: this.codeFileUri,
      };
    }

    if (SimulatorPanel.lastActive === this) SimulatorPanel.lastActive = undefined;
    if (SimulatorPanel.current === this) SimulatorPanel.current = undefined;
    this.clearDebugLine();
    this.stopSvgWatchers();
    this.debugLineDecoration?.dispose();
    this.debugLineDecoration = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }

    if (reopen) {
      // Rouvre au prochain tick (le dispose courant doit s'achever d'abord).
      setTimeout(() => SimulatorPanel.createOrShow(this.context), 0);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    return buildWebviewHtml(webview, this.extensionUri);
  }
}

/** Enveloppe un WebviewPanel natif en SimulatorHost : le point « non
 *  enregistré » reste simulé par un ⬤ concaténé au titre de l'onglet. */
function wrapWebviewPanel(panel: vscode.WebviewPanel): SimulatorHost {
  return {
    get webview() {
      return panel.webview;
    },
    get viewColumn() {
      return panel.viewColumn;
    },
    reveal: (column, preserveFocus) => panel.reveal(column, preserveFocus),
    dispose: () => panel.dispose(),
    onDidDispose: (l, t, d) => panel.onDidDispose(l, t, d),
    onDidChangeViewState: (l, t, d) => panel.onDidChangeViewState(l, t, d),
    setDirtyIndicator: (dirty, baseTitle) => {
      panel.title = dirty ? `${baseTitle} ⬤` : baseTitle;
    },
  };
}
