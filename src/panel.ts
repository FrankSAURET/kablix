import * as vscode from 'vscode';
const l10n = vscode.l10n;
import {
  compile,
  loadArtifact,
  loadPythonProgram,
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

/** Vrai pour une carte de la famille AVR (Arduino : Uno / Nano / Pro Mini / Mega). */
function isAvrBoard(board: Board): boolean {
  return board === 'uno' || board === 'nano' || board === 'mini' || board === 'mega';
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
const UI_STATE_KEY = 'kablix.uiState';
/** Dernière colonne d'éditeur du simulateur (rouvert au même endroit). */
const LAST_COLUMN_KEY = 'kablix.lastColumn';

/**
 * Gère le panneau webview du simulateur. Un seul panneau est ouvert à la fois ;
 * un nouvel appel le révèle au lieu d'en créer un second.
 */
export class SimulatorPanel {
  public static readonly viewType = 'kablix.simulator';
  private static current: SimulatorPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly context: vscode.ExtensionContext;
  private readonly disposables: vscode.Disposable[] = [];
  private currentBoard: Board = 'uno';
  /** Nom de base du projet (sans extension) : dernier .projix enregistré/ouvert, pour nommer l'export SVG. */
  private projectBaseName: string | undefined;
  /** Fichier source actuellement chargé dans le simulateur (.py ou source C ; pas les artefacts). */
  private currentSourceUri: vscode.Uri | undefined;
  /** Fichier de code choisi explicitement (chip du canvas) ; sinon le fichier actif sert. */
  private codeFileUri: vscode.Uri | undefined;
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

    SimulatorPanel.current = new SimulatorPanel(panel, context);
    return SimulatorPanel.current;
  }

  public static dispose(): void {
    SimulatorPanel.current?.panel.dispose();
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
        result = loadPythonProgram(firmware, doc.getText(), netBridge);
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
    this.post({ type: 'codeFile', name: uri ? uri.fsPath.split(/[\\/]/).pop() : null });
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

  /** Restaure le fichier de code d'un .projix : exécutable s'il existe, sinon nom affiché. */
  private async restoreCodeFile(ref: string | undefined): Promise<void> {
    if (!ref) return;
    const folders = vscode.workspace.workspaceFolders;
    const uri = /^([a-zA-Z]:[\\/]|\/)/.test(ref)
      ? vscode.Uri.file(ref)
      : folders?.length
        ? vscode.Uri.joinPath(folders[0].uri, ref)
        : undefined;
    if (uri) {
      try {
        await vscode.workspace.fs.stat(uri);
        this.setCodeFile(uri);
        return;
      } catch {
        // fichier absent sur ce poste : on affiche seulement son nom ci-dessous
      }
    }
    this.post({ type: 'codeFile', name: ref.split(/[\\/]/).pop() });
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

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
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
    parts?: unknown[];
    part?: unknown;
    state?: unknown;
    line?: number;
    diagram?: unknown;
    json?: unknown;
    onlyIfChanged?: boolean;
    request?: unknown;
    url?: string;
  }): void {
    switch (msg?.type) {
      case 'ready':
        // Renvoie les composants personnalisés et les préférences d'interface.
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
        // Rappelle le fichier de code courant (chip du canvas) après un rechargement.
        this.setCodeFile(this.codeFileUri);
        break;
      case 'pickCodeFile':
        void this.pickCodeFile();
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
      case 'loadWorkspace':
        if (msg.board) this.currentBoard = msg.board;
        void this.loadWorkspaceArtifact();
        break;
      case 'exportSvg':
        if (msg.svg) void this.saveSvg(msg.svg);
        break;
      case 'saveCustomParts':
        void this.context.globalState.update(CUSTOM_PARTS_KEY, msg.parts ?? []);
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
      case 'saveProject':
        // La webview fournit le schéma sérialisé : on construit le .projix.
        void this.saveProject(msg.diagram, msg.board);
        break;
      case 'openProject':
        void this.openProject();
        break;
      case 'help':
        void vscode.commands.executeCommand('kablix.openHelp');
        break;
      case 'openExternal':
        // Lien vers la doc Wokwi d'un composant (bouton aide de l'inspecteur).
        if (typeof msg.url === 'string' && /^https:\/\/docs\.wokwi\.com\//.test(msg.url)) {
          void vscode.env.openExternal(vscode.Uri.parse(msg.url));
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
  private async saveProject(diagram: unknown, board?: Board): Promise<void> {
    try {
      const folders = vscode.workspace.workspaceFolders;
      const defaultUri = folders?.length
        ? vscode.Uri.joinPath(folders[0].uri, 'schema-kablix.projix')
        : vscode.Uri.file('schema-kablix.projix');
      const target = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { [l10n.t('Kablix project')]: ['projix'] },
        title: l10n.t('Save the Kablix project'),
      });
      if (!target) return;

      // Le schéma est enrichi des composants personnalisés utilisés (stockés
      // côté hôte) pour rester autonome à la réouverture sur un autre poste.
      const customParts = this.context.globalState.get<unknown[]>(CUSTOM_PARTS_KEY, []);
      const diagramPayload = { ...(diagram as object), customParts };

      const manifest: ProjixManifest = {
        format: 'projix',
        version: PROJIX_FORMAT_VERSION,
        app: this.appVersion(),
        board: board ?? this.currentBoard,
        createdAt: new Date().toISOString(),
        codeFile: this.codeFileRef(),
      };

      // Schéma seul : pas de codeRoot transmis.
      const bytes = await packProject({
        manifest,
        diagramJson: JSON.stringify(diagramPayload),
      });

      await vscode.workspace.fs.writeFile(target, bytes);
      this.projectBaseName = baseNameNoExt(target.fsPath);
      vscode.window.showInformationMessage(
        l10n.t('Kablix: project saved to {0}', target.fsPath)
      );
    } catch (err) {
      this.reportError(err);
    }
  }

  /**
   * Ouvre un .projix : lit l'archive puis recharge le schéma et la carte dans la
   * webview. Le code éventuel d'anciennes archives est ignoré (schéma seul).
   */
  public async openProject(): Promise<void> {
    try {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { [l10n.t('Kablix project')]: ['projix'] },
        title: l10n.t('Open a Kablix project'),
      });
      if (!picked || picked.length === 0) return;

      const bytes = await vscode.workspace.fs.readFile(picked[0]);
      const project = await unpackProject(bytes);
      this.projectBaseName = baseNameNoExt(picked[0].fsPath);

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
      // Restaure le fichier de code à exécuter/déboguer mémorisé dans le projet.
      await this.restoreCodeFile(project.manifest.codeFile);
      vscode.window.showInformationMessage(
        l10n.t('Kablix: project {0} loaded.', picked[0].fsPath.split(/[\\/]/).pop() ?? '')
      );
    } catch (err) {
      this.reportError(err);
    }
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
    // Nom par défaut = nom du projet (.projix ouvert/enregistré), sinon nom du
    // dossier de travail, sinon repli générique.
    const base = this.projectBaseName ?? (folders?.length ? baseNameNoExt(folders[0].uri.fsPath) : null) ?? 'schema-kablix';
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

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private onDispose(): void {
    SimulatorPanel.current = undefined;
    this.clearDebugLine();
    this.debugLineDecoration?.dispose();
    this.debugLineDecoration = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css')
    );
    const gommeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'Gomme.svg')
    );
    const nonce = getNonce();
    const version =
      vscode.extensions.getExtension('franksauret.kablix')?.packageJSON?.version ?? '';
    const csp = [
      `default-src 'none'`,
      // Les composants @wokwi/elements (Lit) injectent des styles dans leur
      // shadow DOM ; on autorise les styles inline pour la webview locale.
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Kablix</title>
</head>
<body>
  <header class="toolbar">
    <span class="brand">
      <strong class="brand__name">Kablix</strong>
      <small class="brand__version">v${version}</small>
    </span>
    <!-- Sélecteur de carte masqué : la carte de simulation est désormais choisie
         en déposant un microcontrôleur sur le canvas. Conservé (caché) pour la
         logique interne (valeur de la carte courante). -->
    <select id="board" hidden title="${l10n.t('Simulated board')}">
      <optgroup label="Arduino (AVR)">
        <option value="uno" selected>Arduino Uno</option>
        <option value="nano">Arduino Nano</option>
        <option value="mini">Arduino Pro Mini</option>
        <option value="mega">Arduino Mega 2560</option>
      </optgroup>
      <optgroup label="Raspberry Pi (RP2040)">
        <option value="pico">Raspberry Pi Pico</option>
        <option value="picow">Raspberry Pi Pico W</option>
      </optgroup>
    </select>
    <button id="load-workspace" hidden title="${l10n.t('Load a compiled .uf2 (Pico) or .hex (Arduino) from the workspace')}">↑ ${l10n.t('Load binary')}</button>
    <button id="export-svg" title="${l10n.t('Export the diagram as SVG')}">⬇ SVG</button>
    <button id="save-project" title="${l10n.t('Save the project')}">💾</button>
    <button id="open-project" title="${l10n.t('Open a project')}">📂</button>
    <button id="toggle-labels" title="${l10n.t('Show/hide part names')}">🏷 ${l10n.t('Names')}</button>
    <button id="open-help" title="${l10n.t('Open help')}">❔ ${l10n.t('Help')}</button>
    <span id="status" class="status">Prêt</span>
  </header>

  <main class="stage">
    <div class="workshop">
      <aside id="palette" class="palette"></aside>
      <div class="splitter" id="splitter-palette" data-target="palette" title="${l10n.t('Drag to resize')}"></div>
      <div id="canvas" class="canvas">
        <!-- Commandes de simulation en surimpression du canvas (icônes + bulle). -->
        <div class="canvas-controls" role="toolbar">
          <button id="run" class="canvas-controls__btn primary" title="${l10n.t('Start')}">▶</button>
          <button id="stop" class="canvas-controls__btn" disabled title="${l10n.t('Stop')}">■</button>
          <button id="pause" class="canvas-controls__btn" disabled title="${l10n.t('Pause / resume the simulation')}">⏸</button>
          <button id="step" class="canvas-controls__btn" disabled title="${l10n.t('Run one source line then pause')}">⏭</button>
          <select id="speed" class="canvas-controls__speed" title="${l10n.t('Simulation speed')}">
            <option value="1" selected>🐇 100 %</option>
            <option value="0.1">🐢 10 %</option>
            <option value="0.01">🐌 1 %</option>
          </select>
          <button id="code-file" class="canvas-controls__file" title="${l10n.t('Code file to run / debug — click to change')}">📄 ${l10n.t('No file')}</button>
        </div>
        <!-- Barre droite : recentrer/ajuster, réinitialiser, effacer (alignée et de
             même hauteur que la barre de simulation à gauche). -->
        <div class="canvas-controls canvas-controls--right" role="toolbar">
          <button id="auto-route" class="canvas-controls__btn" title="${l10n.t('Auto-route the wires (right angles) — selection, or whole diagram')}">∟</button>
          <button id="fit-view" class="canvas-controls__btn" title="${l10n.t('Recenter and fit the view')}">⤢</button>
          <button id="reset-sim" class="canvas-controls__btn" title="${l10n.t('Reset all components to their initial state')}">⟲</button>
          <button id="clear-canvas" class="canvas-controls__btn canvas-controls__btn--eraser" title="${l10n.t('Clear the diagram (Ctrl+Z to undo)')}"><img class="canvas__clear-icon" src="${gommeUri}" alt="${l10n.t('Clear')}" /></button>
        </div>
        <svg id="wires" class="wires"></svg>
      </div>
      <div class="splitter" id="splitter-inspector" data-target="inspector" title="${l10n.t('Drag to resize')}"></div>
      <aside id="inspector" class="inspector"></aside>
    </div>

    <section id="debug" class="debug" hidden>
      <div class="debug__head">
        <span>🔍 ${l10n.t('Variables')}</span>
        <span id="debug-line" class="debug__line"></span>
      </div>
      <table id="debug-vars" class="debug__vars"></table>
    </section>

    <section class="serial">
      <div class="serial__head">
        <span>${l10n.t('Serial monitor')}</span>
        <button id="clear-serial">${l10n.t('Clear')}</button>
      </div>
      <pre id="serial" class="serial__out" aria-live="polite"></pre>
      <div class="serial__input">
        <input id="serial-input" type="text" placeholder="${l10n.t('Send to the microcontroller (Enter)…')}" />
        <button id="serial-send">${l10n.t('Send')}</button>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">window.KABLIX_LANG = ${JSON.stringify(vscode.env.language)};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
