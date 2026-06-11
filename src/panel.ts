import * as vscode from 'vscode';
import { compile, type Board } from './compiler';

/**
 * Gère le panneau webview du simulateur. Un seul panneau est ouvert à la fois ;
 * un nouvel appel le révèle au lieu d'en créer un second.
 */
export class SimulatorPanel {
  public static readonly viewType = 'kablix.simulator';
  private static current: SimulatorPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private currentBoard: Board = 'uno';

  public static createOrShow(extensionUri: vscode.Uri): SimulatorPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (SimulatorPanel.current) {
      SimulatorPanel.current.panel.reveal(column);
      return SimulatorPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      SimulatorPanel.viewType,
      'Kablix — Simulateur',
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

    SimulatorPanel.current = new SimulatorPanel(panel, extensionUri);
    return SimulatorPanel.current;
  }

  public static dispose(): void {
    SimulatorPanel.current?.panel.dispose();
  }

  /** Compile le fichier actif pour la carte courante et l'exécute dans la webview. */
  public async compileActiveFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Kablix : aucun fichier actif à compiler.');
      return;
    }
    await editor.document.save();
    const filePath = editor.document.uri.fsPath;
    const board = this.currentBoard;

    this.post({ type: 'status', text: 'Compilation…' });
    try {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Kablix : compilation (${board})…` },
        () => Promise.resolve(compile(board, filePath, this.extensionUri.fsPath))
      );
      this.post({ type: 'runProgram', board: result.board, bytes: result.bytes });
      vscode.window.showInformationMessage(
        `Kablix : ${filePath.split(/[\\/]/).pop()} compilé et lancé (${result.bytes.length} ${board === 'uno' ? 'mots' : 'octets'}).`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: 'status', text: 'Échec de compilation' });
      vscode.window.showErrorMessage(`Kablix : ${message}`);
    }
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.onDidDispose(() => this.onDispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.onMessage(msg),
      null,
      this.disposables
    );
  }

  private onMessage(msg: { type?: string; board?: Board }): void {
    switch (msg?.type) {
      case 'board':
        if (msg.board) this.currentBoard = msg.board;
        break;
      case 'compile':
        void this.compileActiveFile();
        break;
    }
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
    <button id="run" class="primary">▶ Démarrer</button>
    <button id="stop" disabled>■ Arrêter</button>
    <button id="compile">⚙ Compiler &amp; exécuter le fichier actif</button>
    <span id="status" class="status">Prêt</span>
  </header>

  <main class="stage">
    <div class="workshop">
      <aside id="palette" class="palette"><h3>Composants</h3></aside>
      <div id="canvas" class="canvas">
        <svg id="wires" class="wires"></svg>
      </div>
    </div>

    <section class="serial">
      <div class="serial__head">
        <span>Moniteur série</span>
        <button id="clear-serial">Effacer</button>
      </div>
      <pre id="serial" class="serial__out" aria-live="polite"></pre>
    </section>
  </main>

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
