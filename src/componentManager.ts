import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { KompixLibrary } from './kompixLibrary';

const l10n = vscode.l10n;

interface ComponentInfo {
  type: string;
  label: string;
  description?: string;
  reference?: string;
  thumbnail?: string; // base64 ou URL
  version: string;
  author?: string;
  local: boolean; // true = déjà dans la bibli locale
  file?: string; // nom du fichier .kompix dans le repo (ex. "led.kompix")
  sourceUrl?: string; // URL complète du fichier .kompix
}

interface RepositoryIndex {
  components: ComponentInfo[];
}

export class ComponentManagerPanel {
  public static readonly viewType = 'kablix.componentManager';
  private static current: ComponentManagerPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private library: KompixLibrary | undefined;
  private allComponents: ComponentInfo[] = [];
  private localTypes: Set<string> = new Set();

  /**
   * Ouvre (ou réutilise) le panneau du gestionnaire de composants.
   */
  public static async show(extensionUri: vscode.Uri, library?: KompixLibrary): Promise<void> {
    if (!ComponentManagerPanel.current) {
      const panel = vscode.window.createWebviewPanel(
        ComponentManagerPanel.viewType,
        l10n.t('Composants (kompix)'),
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        {
          enableScripts: true,
          enableCommandUris: false,
          localResourceRoots: [],
        }
      );
      ComponentManagerPanel.current = new ComponentManagerPanel(panel, extensionUri, library);
    }
    ComponentManagerPanel.current.panel.reveal(undefined, false);
    if (library) {
      ComponentManagerPanel.current.library = library;
      await ComponentManagerPanel.current.load();
    }
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, library?: KompixLibrary) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.library = library;

    this.panel.onDidDispose(() => this.onDispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  private async load(): Promise<void> {
    try {
      // Récupère la liste des composants locaux
      if (this.library) {
        const localComponents = this.library.getComponents();
        this.localTypes = new Set(localComponents.map((c) => c.type));
      }

      // Récupère les repos distants depuis la config
      const repos =
        vscode.workspace.getConfiguration('kablix').get<string[]>('componentRepositories') ?? [];
      this.allComponents = [];

      // Récupère les composants de chaque repo
      for (const repoUrl of repos) {
        try {
          const components = await this.fetchRepositoryComponents(repoUrl);
          this.allComponents.push(
            ...components.map((c) => ({
              ...c,
              local: this.localTypes.has(c.type),
            }))
          );
        } catch (err) {
          console.error(`Failed to fetch from ${repoUrl}:`, err);
        }
      }

      // Déduplique par type (garde la première occurrence)
      const seen = new Set<string>();
      this.allComponents = this.allComponents.filter((c) => {
        if (seen.has(c.type)) return false;
        seen.add(c.type);
        return true;
      });

      this.render();
    } catch (err) {
      vscode.window.showErrorMessage(l10n.t('Erreur lors du chargement des composants'));
      console.error(err);
    }
  }

  private async fetchRepositoryComponents(repoUrl: string): Promise<ComponentInfo[]> {
    const baseUrl = repoUrl.replace(/\/$/, '');
    const indexUrl = baseUrl + '/index.json';
    const response = await fetch(indexUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const components: ComponentInfo[] = data.components ?? [];
    // Construit l'URL complète du .kompix pour chaque composant
    return components.map((c) => ({
      ...c,
      sourceUrl: c.file ? baseUrl + '/' + c.file : undefined,
    }));
  }

  private render(): void {
    const webview = this.panel.webview;
    this.panel.webview.html = this.generateHtml(this.allComponents);
  }

  private generateHtml(components: ComponentInfo[]): string {
    const nonce = randomBytes(24).toString('base64');
    const csp = [`default-src 'none'`, `style-src 'nonce-${nonce}'`, `script-src 'nonce-${nonce}'`].join(
      '; '
    );

    const componentsJson = JSON.stringify(components);
    const newOnlyLabelText = l10n.t('Nouveaux seulement');
    const downloadButtonText = l10n.t('Télécharger');
    const selectingText = l10n.t('Sélection…');
    const noComponentsText = l10n.t('Aucun composant disponible');

    return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gestionnaire de composants</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --grid-gap: 1rem;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 1rem;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.8rem;
      margin: 0 0 1rem 0;
    }
    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
      align-items: center;
    }
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    #newOnlyCheckbox {
      cursor: pointer;
      width: 1.2rem;
      height: 1.2rem;
    }
    label {
      cursor: pointer;
      user-select: none;
    }
    .download-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      padding: 0.5rem 1rem;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 1rem;
    }
    .download-btn:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    .download-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: var(--grid-gap);
      margin-top: 2rem;
    }
    .component-card {
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
      border-radius: 6px;
      padding: 1rem;
      background: var(--vscode-panel-background, transparent);
      cursor: pointer;
      transition: border-color 0.2s, background-color 0.2s;
    }
    .component-card:hover {
      border-color: var(--vscode-focusBorder);
    }
    .component-card.selected {
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .component-card.local::after {
      content: '✓ Installé';
      display: block;
      font-size: 0.85rem;
      color: var(--vscode-notificationCenterHeader-foreground, #00cc00);
      margin-top: 0.5rem;
      font-weight: bold;
    }
    .thumbnail {
      width: 100%;
      height: 150px;
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
      border-radius: 4px;
      margin-bottom: 0.8rem;
      object-fit: cover;
    }
    .component-label {
      font-weight: bold;
      font-size: 1rem;
      margin-bottom: 0.3rem;
    }
    .component-description {
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground, rgba(255,255,255,.6));
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }
    .component-meta {
      font-size: 0.75rem;
      color: var(--vscode-foreground, rgba(200,200,200,.8));
    }
    .empty {
      grid-column: 1 / -1;
      text-align: center;
      padding: 3rem 1rem;
      color: var(--vscode-descriptionForeground, rgba(255,255,255,.6));
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Importer des composants</h1>

    <div class="controls">
      <div class="checkbox-group">
        <input type="checkbox" id="newOnlyCheckbox" checked />
        <label for="newOnlyCheckbox">${newOnlyLabelText}</label>
      </div>
      <button class="download-btn" id="downloadBtn" disabled>${downloadButtonText}</button>
      <span id="status" style="margin-left: auto; color: var(--vscode-descriptionForeground, rgba(255,255,255,.6));"></span>
    </div>

    <div class="grid" id="grid">
      <div class="empty">${noComponentsText}</div>
    </div>
  </div>

  <script nonce="${nonce}">
    const components = ${componentsJson};
    const selectedTypes = new Set();
    let filteredComponents = [...components];

    function updateGrid() {
      const newOnly = document.getElementById('newOnlyCheckbox').checked;
      const grid = document.getElementById('grid');

      filteredComponents = components.filter(c => !newOnly || !c.local);
      grid.innerHTML = '';

      if (filteredComponents.length === 0) {
        grid.innerHTML = '<div class="empty">${noComponentsText}</div>';
      } else {
        filteredComponents.forEach(comp => {
          const card = document.createElement('div');
          card.className = 'component-card' + (comp.local ? ' local' : '');
          if (selectedTypes.has(comp.type)) card.classList.add('selected');

          card.innerHTML = \`
            \${comp.thumbnail ? \`<img src="\${comp.thumbnail}" alt="" class="thumbnail" />\` : '<div class="thumbnail"></div>'}
            <div class="component-label">\${escapeHtml(comp.label)}</div>
            \${comp.description ? \`<div class="component-description">\${escapeHtml(comp.description)}</div>\` : ''}
            <div class="component-meta">
              v\${escapeHtml(comp.version)}
              \${comp.author ? \` - \${escapeHtml(comp.author)}\" : ''}
              \${comp.reference ? \` (\${escapeHtml(comp.reference)})\" : ''}
            </div>
          \`;

          card.addEventListener('click', () => {
            selectedTypes.has(comp.type)
              ? selectedTypes.delete(comp.type)
              : selectedTypes.add(comp.type);
            updateGrid();
            updateDownloadBtn();
          });

          grid.appendChild(card);
        });
      }
    }

    function updateDownloadBtn() {
      const btn = document.getElementById('downloadBtn');
      btn.disabled = selectedTypes.size === 0;
    }

    document.getElementById('newOnlyCheckbox').addEventListener('change', () => {
      selectedTypes.clear();
      updateGrid();
      updateDownloadBtn();
    });

    document.getElementById('downloadBtn').addEventListener('click', () => {
      const selected = filteredComponents.filter(c => selectedTypes.has(c.type));
      const status = document.getElementById('status');
      status.textContent = '${selectingText}';
      status.style.color = 'var(--vscode-descriptionForeground, rgba(255,255,255,.6))';

      vscode.postMessage({
        command: 'download',
        types: Array.from(selectedTypes),
      });
    });

    function escapeHtml(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Initialisation
    updateGrid();
    updateDownloadBtn();

    // Écouter les messages du host
    window.addEventListener('message', event => {
      const message = event.data;
      const status = document.getElementById('status');
      if (message.command === 'downloadComplete') {
        if (message.success) {
          status.textContent = message.message || 'Terminé';
          status.style.color = 'var(--vscode-notificationCenterHeader-foreground, #00cc00)';
          selectedTypes.clear();
          setTimeout(() => {
            // Recharge les composants locaux
            vscode.postMessage({ command: 'reload' });
          }, 1500);
        } else {
          status.textContent = message.error || 'Erreur';
          status.style.color = 'var(--vscode-errorForeground, #ff0000)';
        }
      }
    });
  </script>
</body>
</html>`;
  }

  private async handleMessage(message: any): Promise<void> {
    if (message.command === 'download') {
      await this.downloadComponents(message.types);
    } else if (message.command === 'reload') {
      await this.load();
    }
  }

  private async downloadComponents(types: string[]): Promise<void> {
    try {
      if (!this.library) {
        throw new Error(l10n.t('Bibliothèque de composants non disponible'));
      }

      const toDownload = this.allComponents.filter((c) => types.includes(c.type) && c.sourceUrl);
      const downloaded: string[] = [];

      for (const component of toDownload) {
        try {
          if (!component.sourceUrl) continue;

          const response = await fetch(component.sourceUrl);
          if (!response.ok) {
            console.error(`Impossible de télécharger ${component.type}: HTTP ${response.status}`);
            continue;
          }

          const buffer = await response.arrayBuffer();
          const uint8array = new Uint8Array(buffer);
          await this.library.saveKompixFromBuffer(uint8array, 'remote', component.sourceUrl);
          downloaded.push(component.label);
        } catch (err) {
          console.error(`Erreur lors du téléchargement de ${component.type}:`, err);
        }
      }

      if (downloaded.length > 0) {
        this.panel.webview.postMessage({
          command: 'downloadComplete',
          success: true,
          message: l10n.t('{0} composant(s) installé(s)', downloaded.length),
        });
      } else {
        this.panel.webview.postMessage({
          command: 'downloadComplete',
          success: false,
          error: l10n.t('Aucun composant téléchargé'),
        });
      }
    } catch (err) {
      this.panel.webview.postMessage({
        command: 'downloadComplete',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private onDispose(): void {
    ComponentManagerPanel.current = undefined;
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
