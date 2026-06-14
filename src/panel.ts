import * as vscode from 'vscode';
const l10n = vscode.l10n;
import {
  compile,
  loadArtifact,
  loadPythonProgram,
  type Board,
  type CompileResult,
} from './compiler';
import {
  packProject,
  unpackProject,
  PROJIX_FORMAT_VERSION,
  PROJIX_SIZE_WARN,
  type ProjixManifest,
} from './projix';

const ARTIFACT_EXTS = ['.hex', '.uf2', '.elf', '.bin'];
const CUSTOM_PARTS_KEY = 'kablix.customParts';
const UI_STATE_KEY = 'kablix.uiState';

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
  /** Fichier source actuellement chargé dans le simulateur (.py ou source C ; pas les artefacts). */
  private currentSourceUri: vscode.Uri | undefined;
  /** Fichier de code choisi explicitement (chip du canvas) ; sinon le fichier actif sert. */
  private codeFileUri: vscode.Uri | undefined;
  /** Décoration de la ligne en pause (créée à la demande, détruite avec le panneau). */
  private debugLineDecoration: vscode.TextEditorDecorationType | undefined;

  public static createOrShow(context: vscode.ExtensionContext): SimulatorPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (SimulatorPanel.current) {
      SimulatorPanel.current.panel.reveal(column);
      return SimulatorPanel.current;
    }

    const extensionUri = context.extensionUri;
    const panel = vscode.window.createWebviewPanel(
      SimulatorPanel.viewType,
      l10n.t('Kablix — Simulator'),
      column ?? vscode.ViewColumn.One,
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
  public async compileActiveFile(): Promise<void> {
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
    // Mémorise le source pour les points d'arrêt et le surlignage ; pas de suivi pour les artefacts.
    this.currentSourceUri = ARTIFACT_EXTS.includes(ext) ? undefined : doc.uri;
    // Le fichier compilé devient le fichier de code affiché (et réutilisé ensuite).
    this.setCodeFile(doc.uri);

    this.post({ type: 'status', text: l10n.t('Preparing…') });
    try {
      let result: CompileResult;
      if (ext === '.py') {
        const firmware = await this.findMicropythonFirmware();
        result = loadPythonProgram(firmware, doc.getText());
      } else if (ARTIFACT_EXTS.includes(ext)) {
        result = loadArtifact(filePath);
      } else {
        const board = this.currentBoard;
        result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: l10n.t('Kablix: compiling ({0})…', board) },
          () => Promise.resolve(compile(board, filePath, this.extensionUri.fsPath))
        );
      }
      this.runProgram(result, filePath.split(/[\\/]/).pop() ?? filePath);
    } catch (err) {
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
        board === 'uno' ? await this.findNewestHex() : await this.findNewestUf2();
      if (!file) {
        vscode.window.showWarningMessage(
          board === 'uno'
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

  /** Firmware MicroPython : réglage kablix.micropythonUf2, sinon scan du workspace. */
  private async findMicropythonFirmware(): Promise<string> {
    const configured = vscode.workspace
      .getConfiguration('kablix')
      .get<string>('micropythonUf2');
    if (configured) {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const uri = /^([a-zA-Z]:[\\/]|\/)/.test(configured)
        ? vscode.Uri.file(configured)
        : folders.length > 0
          ? vscode.Uri.joinPath(folders[0].uri, configured)
          : undefined;
      if (uri) {
        try {
          await vscode.workspace.fs.stat(uri);
          return uri.fsPath;
        } catch {
          throw new Error(l10n.t('MicroPython firmware not found: {0} (kablix.micropythonUf2 setting).', configured));
        }
      }
    }
    const found = await vscode.workspace.findFiles(
      '**/{micropython,MICROPYTHON,RPI_PICO,rp2-pico}*.uf2',
      '**/node_modules/**',
      10
    );
    const best = await this.newest(found);
    if (!best) {
      throw new Error(
        l10n.t(
          'No MicroPython firmware (.uf2) found in the workspace. Download it from https://micropython.org/download/RPI_PICO/ then place it in the workspace or set the "kablix.micropythonUf2" setting.'
        )
      );
    }
    return best.fsPath;
  }

  // --- Communication avec la webview -------------------------------------------

  private runProgram(result: CompileResult, label: string): void {
    this.post({ type: 'runProgram', ...result.payload });
    this.sendBreakpoints(); // synchronise la gouttière avec le programme qui démarre
    vscode.window.showInformationMessage(l10n.t('Kablix: {0} loaded into the simulator.', label));
    if (result.log) {
      console.log(`[Kablix] ${result.log}`);
    }
  }

  private reportError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.post({ type: 'status', text: l10n.t('Load failed') });
    vscode.window.showErrorMessage(`Kablix : ${message}`);
  }

  // --- Fichier de code à exécuter / déboguer (chip du canvas) ------------------

  /** Mémorise le fichier de code et met à jour le chip affiché dans la webview. */
  private setCodeFile(uri: vscode.Uri | undefined): void {
    this.codeFileUri = uri;
    this.post({ type: 'codeFile', name: uri ? uri.fsPath.split(/[\\/]/).pop() : null });
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
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.onMessage(msg),
      null,
      this.disposables
    );
    // Gouttière VS Code → simulateur : tout changement de point d'arrêt est relayé.
    vscode.debug.onDidChangeBreakpoints(() => this.sendBreakpoints(), null, this.disposables);
  }

  // --- Débogage : points d'arrêt et ligne courante ------------------------------

  /** Envoie à la webview les points d'arrêt actifs (1-based) du fichier source courant. */
  private sendBreakpoints(): void {
    try {
      const source = this.currentSourceUri;
      const lines = !source
        ? []
        : vscode.debug.breakpoints
            .filter(
              (bp): bp is vscode.SourceBreakpoint =>
                bp.enabled &&
                bp instanceof vscode.SourceBreakpoint &&
                bp.location.uri.toString() === source.toString()
            )
            .map((bp) => bp.location.range.start.line + 1);
      this.post({ type: 'breakpoints', lines });
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
        void this.compileActiveFile();
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
      case 'wokwiExport':
        // La webview a converti le schéma au format Wokwi : on l'enregistre.
        void this.saveWokwiDiagram(msg.json);
        break;
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

  // --- Format de projet .projix (schéma + code) --------------------------------

  /** Demande à la webview son schéma puis enregistre un .projix (commande). */
  public requestSaveProject(): void {
    this.post({ type: 'requestSaveProject' });
  }

  /**
   * Construit et écrit une archive .projix : manifeste + schéma + composants
   * personnalisés + tous les fichiers du dossier de code (workspace ou dossier
   * du fichier actif). Le code est optionnel s'il n'y a pas de dossier.
   */
  private async saveProject(diagram: unknown, board?: Board): Promise<void> {
    try {
      const folders = vscode.workspace.workspaceFolders;
      const codeRoot = folders?.length
        ? folders[0].uri
        : this.activeFileFolder();

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
      };

      const bytes = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: l10n.t('Kablix: building the project…') },
        () =>
          packProject({
            manifest,
            diagramJson: JSON.stringify(diagramPayload),
            codeRoot,
          })
      );

      if (bytes.byteLength > PROJIX_SIZE_WARN) {
        const mb = (bytes.byteLength / (1024 * 1024)).toFixed(1);
        const choice = await vscode.window.showWarningMessage(
          l10n.t('Kablix: the project is large ({0} MB). Save anyway?', mb),
          l10n.t('Save'),
          l10n.t('Cancel')
        );
        if (choice !== l10n.t('Save')) return;
      }

      await vscode.workspace.fs.writeFile(target, bytes);
      vscode.window.showInformationMessage(
        l10n.t('Kablix: project saved to {0}', target.fsPath)
      );
    } catch (err) {
      this.reportError(err);
    }
  }

  /**
   * Ouvre un .projix : lit l'archive, propose où extraire le dossier code/
   * (ou de ne pas l'extraire), écrit les fichiers puis recharge le schéma et la
   * carte dans la webview.
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

      // Extraction du code : optionnelle. On propose le workspace par défaut.
      if (project.codeFiles.length > 0) {
        await this.extractCode(project.codeFiles);
      }

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
      vscode.window.showInformationMessage(
        l10n.t('Kablix: project {0} loaded.', picked[0].fsPath.split(/[\\/]/).pop() ?? '')
      );
    } catch (err) {
      this.reportError(err);
    }
  }

  /** Propose un dossier de destination puis écrit les fichiers de code. */
  private async extractCode(
    codeFiles: Array<{ path: string; data: Uint8Array }>
  ): Promise<void> {
    const skip = l10n.t('Do not extract the code');
    const choose = l10n.t('Choose a folder…');
    const choice = await vscode.window.showInformationMessage(
      l10n.t('Kablix: this project contains {0} code file(s). Where to extract them?', codeFiles.length),
      choose,
      skip
    );
    if (choice !== choose) return;

    const folders = vscode.workspace.workspaceFolders;
    const dest = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      defaultUri: folders?.length ? folders[0].uri : undefined,
      openLabel: l10n.t('Extract here'),
      title: l10n.t('Choose where to extract the code'),
    });
    if (!dest || dest.length === 0) return;

    const root = dest[0];
    for (const file of codeFiles) {
      // Les chemins de l'archive utilisent '/' ; on les éclate pour joinPath.
      const segments = file.path.split('/').filter((s) => s.length > 0);
      if (segments.length === 0) continue;
      const target = vscode.Uri.joinPath(root, ...segments);
      await vscode.workspace.fs.writeFile(target, file.data);
    }
    vscode.window.showInformationMessage(
      l10n.t('Kablix: code extracted to {0}', root.fsPath)
    );
  }

  /** Dossier contenant le fichier actif (repli quand il n'y a pas de workspace). */
  private activeFileFolder(): vscode.Uri | undefined {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || doc.uri.scheme !== 'file') return undefined;
    return vscode.Uri.joinPath(doc.uri, '..');
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
    const defaultUri = folders?.length
      ? vscode.Uri.joinPath(folders[0].uri, 'schema-kablix.svg')
      : vscode.Uri.file('schema-kablix.svg');
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
    const nonce = getNonce();
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
    <strong class="brand">Kablix</strong>
    <select id="board" title="${l10n.t('Simulated board')}">
      <option value="uno" selected>Arduino Uno</option>
      <option value="pico">Raspberry Pi Pico</option>
    </select>
    <button id="compile">⚙ ${l10n.t('Compile &amp; run the active file')}</button>
    <button id="load-workspace" title="${l10n.t('Loads the most recent compiled artifact of the workspace')}">↑ ${l10n.t('Load workspace')}</button>
    <button id="export-svg" title="${l10n.t('Export the diagram as SVG')}">⬇ SVG</button>
    <button id="save-project" title="${l10n.t('Save the project')}">💾</button>
    <button id="open-project" title="${l10n.t('Open a project')}">📂</button>
    <button id="toggle-labels" title="${l10n.t('Show/hide part names')}">🏷 ${l10n.t('Names')}</button>
    <span id="status" class="status">Prêt</span>
  </header>

  <main class="stage">
    <div class="workshop">
      <aside id="palette" class="palette"></aside>
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
        <svg id="wires" class="wires"></svg>
      </div>
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
