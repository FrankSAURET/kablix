import * as vscode from 'vscode';
const l10n = vscode.l10n;
import {
  compile,
  loadArtifact,
  loadPythonProgram,
  type Board,
  type CompileResult,
} from './compiler';

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
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage(l10n.t('Kablix: no active file to compile.'));
      return;
    }
    await editor.document.save();
    const filePath = editor.document.uri.fsPath;
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

    this.post({ type: 'status', text: l10n.t('Preparing…') });
    try {
      let result: CompileResult;
      if (ext === '.py') {
        const firmware = await this.findMicropythonFirmware();
        result = loadPythonProgram(firmware, editor.document.getText());
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
  }

  private onMessage(msg: { type?: string; board?: Board; svg?: string; parts?: unknown[]; part?: unknown; state?: unknown }): void {
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
    }
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
    <button id="run" class="primary">▶ ${l10n.t('Start')}</button>
    <button id="stop" disabled>■ ${l10n.t('Stop')}</button>
    <button id="compile">⚙ ${l10n.t('Compile &amp; run the active file')}</button>
    <button id="load-workspace" title="${l10n.t('Loads the most recent compiled artifact of the workspace')}">↑ ${l10n.t('Load workspace')}</button>
    <button id="export-svg" title="${l10n.t('Export the diagram as SVG')}">⬇ SVG</button>
    <button id="toggle-labels" title="${l10n.t('Show/hide part names')}">🏷 ${l10n.t('Names')}</button>
    <span id="status" class="status">Prêt</span>
  </header>

  <main class="stage">
    <div class="workshop">
      <aside id="palette" class="palette"></aside>
      <div id="canvas" class="canvas">
        <svg id="wires" class="wires"></svg>
      </div>
      <aside id="inspector" class="inspector"></aside>
    </div>

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
