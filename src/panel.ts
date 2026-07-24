import * as vscode from 'vscode';
const l10n = vscode.l10n;
import { buildWebviewHtml } from './webview-html';
import {
  compile,
  loadArtifact,
  loadPythonProgram,
  loadMicropythonRepl,
  type Board,
  type CompileResult,
  type ToolPaths,
} from './compiler';
import {
  packProject,
  unpackProject,
  PROJIX_FORMAT_VERSION,
  type ProjixManifest,
} from './projix';
import { resolveMicropythonFirmware, FirmwareCancelled } from './firmware';

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
  /** Édition utilisateur signalée par la webview : le CustomEditor empile un edit
   *  (point ● natif + Ctrl+Z natif). Optionnel (le WebviewPanel legacy l'ignore). */
  onDocEdit?(): void;
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
  /** Décoration de la ligne en pause (créée à la demande, détruite avec le panneau). */
  private debugLineDecoration: vscode.TextEditorDecorationType | undefined;
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
   * Compile ou charge le fichier actif selon son type :
   *   .py → firmware MicroPython du workspace + injection du script ;
   *   .hex/.uf2/.elf/.bin → artefact chargé directement ;
   *   sinon → compilation via la toolchain locale pour la carte courante.
   */
  public async compileActiveFile(onlyIfChanged = false): Promise<void> {
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
          () => Promise.resolve(compile(board, filePath, this.extensionUri.fsPath, toolPaths))
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
    vscode.window.showErrorMessage(`Kablix : ${message}`);
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
    this.post({ type: 'codeFile', name: uri ? uri.fsPath.split(/[\\/]/).pop() : null });
    this.postProjectName();
  }

  /** Nom du projet (sans chemin) : .projix ouvert/enregistré, sinon fichier de code. */
  private projectDisplayName(): string | undefined {
    return this.projectBaseName ?? (this.codeFileUri ? baseNameNoExt(this.codeFileUri.fsPath) : undefined);
  }

  /** Envoie à la webview le nom du projet affiché à côté du bouton d'aide.
   *  Extension affichée avec un P majuscule (« .Projix ») — le fichier sur
   *  disque reste en minuscule (`.projix`), seul l'affichage change. */
  private postProjectName(): void {
    const name = this.projectBaseName
      ? `${this.projectBaseName}.Projix`
      : this.projectDisplayName();
    this.post({ type: 'projectName', name: name ?? null });
    this.updateTitle(); // le titre de l'onglet reprend le nom du projet
  }

  /** Titre de l'onglet du simulateur : « Kablix — Simulator », le nom du projet,
   *  puis un point noir « ● » (après le nom) tant que des modifications ne sont
   *  pas enregistrées. Le titre d'onglet est du texte brut. */
  private updateTitle(): void {
    const project = this.projectBaseName ? `${this.projectBaseName}.Projix` : this.projectDisplayName();
    const base = project ? `${l10n.t('Kablix — Simulator')} — ${project}` : l10n.t('Kablix — Simulator');
    // L'hôte décide du rendu du « non enregistré » : ⬤ dans le titre pour le
    // WebviewPanel, point ● NATIF de l'onglet pour le CustomEditor.
    this.panel.setDirtyIndicator(this.projectDirty, base);
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

  /** Ouvre le fichier de code courant dans le volet d'édition (à gauche de Kablix). */
  public async openCodeFile(): Promise<void> {
    if (!this.codeFileUri) return;
    try {
      await vscode.window.showTextDocument(this.codeFileUri, { viewColumn: vscode.ViewColumn.One });
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
      const editor = await vscode.window.showTextDocument(source, {
        preserveFocus: true,
        preview: false,
        viewColumn: vscode.ViewColumn.One,
      });
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
  }): void {
    // Toute interaction de la webview marque cette session comme « active » :
    // les commandes globales (Enregistrer, Wokwi…) la ciblent.
    SimulatorPanel.lastActive = this;
    switch (msg?.type) {
      case 'ready':
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
        // Réglages affectant l'interface (bouton « Charger binaire » masqué par défaut).
        this.post({
          type: 'config',
          showLoadBinary: vscode.workspace
            .getConfiguration('kablix')
            .get<boolean>('showLoadBinaryButton', false),
        });
        // Rappelle le fichier de code courant (chip du canvas) après un
        // rechargement — y compris l'état « introuvable » d'un .projix ouvert.
        if (this.missingCodeFileRef) {
          this.post({
            type: 'codeFile',
            name: this.missingCodeFileRef.split(/[\\/]/).pop(),
            missing: true,
          });
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
      case 'debugLine':
        // Simulation en pause sur une ligne : surligne dans l'éditeur du source.
        if (typeof msg.line === 'number') void this.showDebugLine(msg.line);
        break;
      case 'debugResumed':
        this.clearDebugLine();
        break;
      case 'nativeSave':
        // Bouton Enregistrer : délègue au save NATIF de VS Code (CustomEditor).
        void vscode.commands.executeCommand('workbench.action.files.save');
        break;
      case 'nativeSaveAs':
        void vscode.commands.executeCommand('workbench.action.files.saveAs');
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
            'kablix.upgradePicoFirmware',
            'kablix.checkLibraryUpdates',
            'kablix.saveDefaultLayout',
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
        // Aide locale (hors-ligne) d'un composant : aperçu de docs/composants/<lang>/<type>.md.
        // La langue suit VS Code (en si elle commence par « en », fr sinon = repli).
        if (typeof msg.part === 'string' && /^[a-z0-9-]+$/i.test(msg.part)) {
          const lang = vscode.env.language.startsWith('en') ? 'en' : 'fr';
          const localized = vscode.Uri.joinPath(this.extensionUri, 'docs', 'composants', lang, `${msg.part}.md`);
          const fallback = vscode.Uri.joinPath(this.extensionUri, 'docs', 'composants', 'fr', `${msg.part}.md`);
          const openOrFallback = () =>
            vscode.workspace.fs.stat(localized).then(
              () => vscode.commands.executeCommand('markdown.showPreviewToSide', localized),
              // Fiche localisée absente : on retombe sur la fiche FR (toujours présente).
              () => vscode.workspace.fs.stat(fallback).then(
                () => vscode.commands.executeCommand('markdown.showPreviewToSide', fallback),
                () => vscode.window.showInformationMessage(vscode.l10n.t('No help available for this part yet.'))
              )
            );
          void openOrFallback();
        }
        break;
      case 'wokwiExport':
        // La webview a converti le schéma au format Wokwi : on l'enregistre.
        void this.saveWokwiDiagram(msg.json);
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
      this.documentUri = target;
    } catch (err) {
      this.reportError(err);
    } finally {
      // Débloque un éventuel Ctrl+S natif du CustomEditor en attente.
      this.pendingSaveResolve?.();
      this.pendingSaveResolve = undefined;
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
      vscode.extensions.getExtension('franksauret.kablix')?.packageJSON?.version ?? '?'
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

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
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
