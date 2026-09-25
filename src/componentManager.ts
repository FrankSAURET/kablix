import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { KompixLibrary } from './kompixLibrary';
import { RemoteComponent, compareVersions, fetchRepositoryComponents } from './componentUpdates';
import { SimulatorPanel } from './panel';

const l10n = vscode.l10n;

// La comparaison de versions vit avec la vérification du démarrage, qui s'en
// sert aussi ; ré-exportée ici pour ses anciens utilisateurs.
export { compareVersions };

interface ComponentInfo extends RemoteComponent {
  local: boolean; // true = déjà dans la bibli locale (donc supprimable)
  origin?: 'local' | 'remote'; // pour un installé : créé ici ou téléchargé
  installedVersion?: string; // version présente sur la machine (si installé)
  update?: boolean; // installé, mais le dépôt en propose une version plus récente
}

export class ComponentManagerPanel {
  public static readonly viewType = 'kablix.componentManager';
  private static current: ComponentManagerPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private library: KompixLibrary | undefined;
  private allComponents: ComponentInfo[] = [];
  private localTypes: Set<string> = new Set();

  /**
   * Ouvre (ou réutilise) le panneau du gestionnaire de composants.
   */
  public static async show(library?: KompixLibrary): Promise<void> {
    if (!ComponentManagerPanel.current) {
      const panel = vscode.window.createWebviewPanel(
        ComponentManagerPanel.viewType,
        l10n.t('Components (.kompix)'),
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        {
          enableScripts: true,
          enableCommandUris: false,
          localResourceRoots: [],
        }
      );
      ComponentManagerPanel.current = new ComponentManagerPanel(panel, library);
    }
    ComponentManagerPanel.current.panel.reveal(undefined, false);
    if (library) {
      ComponentManagerPanel.current.library = library;
      await ComponentManagerPanel.current.load();
    }
  }

  private constructor(panel: vscode.WebviewPanel, library?: KompixLibrary) {
    this.panel = panel;
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
      const installed = this.library?.listInstalled?.() ?? [];
      this.localTypes = new Set(installed.map((c) => c.type));
      // Version présente sur la machine, pour repérer celles que le dépôt a
      // fait avancer depuis : sans ça, un composant corrigé restait invisible
      // (il n'était plus « nouveau ») et il fallait le supprimer pour le
      // réinstaller.
      const versionsLocales = new Map(installed.map((c) => [c.type, c.version]));

      // Récupère les repos distants depuis la config
      const repos =
        vscode.workspace.getConfiguration('kablix').get<string[]>('componentRepositories') ?? [];
      this.allComponents = [];

      // Récupère les composants de chaque repo
      for (const repoUrl of repos) {
        try {
          const components = await this.fetchRepositoryComponents(repoUrl);
          this.allComponents.push(
            ...components.map((c) => {
              const local = this.localTypes.has(c.type);
              const installedVersion = versionsLocales.get(c.type);
              return {
                ...c,
                local,
                installedVersion,
                update: local && compareVersions(c.version, installedVersion) > 0,
                origin: this.library?.getIndexEntry?.(c.type)?.origin,
              };
            })
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

      // Les composants installés qu'AUCUN dépôt ne propose (créés ici, glissés
      // depuis un fichier) n'apparaissaient nulle part : sans eux, impossible
      // de les supprimer depuis ce panneau.
      for (const part of installed) {
        if (seen.has(part.type)) continue;
        seen.add(part.type);
        this.allComponents.push({
          type: part.type,
          label: part.label,
          description: part.description,
          reference: part.reference,
          thumbnail: part.thumbnail,
          version: part.version,
          installedVersion: part.version,
          update: false,
          author: part.author,
          local: true,
          origin: part.origin,
          sourceUrl: part.sourceUrl,
        });
      }

      this.render();
    } catch (err) {
      void vscode.window.showErrorMessage(l10n.t('Could not load the component list.'));
      console.error(err);
    }
  }

  /** Lecture d'un dépôt, partagée avec la vérification du démarrage. */
  private fetchRepositoryComponents(repoUrl: string): Promise<RemoteComponent[]> {
    return fetchRepositoryComponents(repoUrl);
  }

  private render(): void {
    this.panel.webview.html = this.generateHtml(this.allComponents);
  }

  private generateHtml(components: ComponentInfo[]): string {
    const nonce = randomBytes(24).toString('base64');
    // Les vignettes sont soit une data: URI (composant installé, dessin extrait
    // du .kompix), soit une image du dépôt : sans img-src, aucune ne s'affiche.
    const csp = [
      `default-src 'none'`,
      `img-src data: https:`,
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    const componentsJson = JSON.stringify(components);
    const titleText = l10n.t('Components');
    const filterNewText = l10n.t('New');
    const filterInstalledText = l10n.t('Installed');
    const filterAllText = l10n.t('All');
    const downloadButtonText = l10n.t('Download');
    const deleteButtonText = l10n.t('Delete');
    const selectingText = l10n.t('Selecting…');
    const deletingText = l10n.t('Deleting…');
    const noComponentsText = l10n.t('No component available');
    const doneText = l10n.t('Done');
    const errorText = l10n.t('Error');
    const installedText = l10n.t('Installed');
    const downloadedText = l10n.t('downloaded');
    const madeHereText = l10n.t('created here');
    const updateText = l10n.t('Update available');
    const experimentalText = l10n.t('Experimental');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Component manager</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --grid-gap: 1rem;
    }
    * {
      box-sizing: border-box;
    }
    /* La page ne défile pas : seule la grille le fait, pour que le titre et
       les boutons restent sous la main quelle que soit la liste. */
    html, body {
      height: 100%;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 1rem;
      overflow: hidden;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      height: 100%;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    h1 {
      font-size: 1.8rem;
      margin: 0 0 1rem 0;
      flex: none;
    }
    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
      align-items: center;
      flex: none;
    }
    .filter {
      display: flex;
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.4));
      border-radius: 4px;
      overflow: hidden;
    }
    .filter button {
      background: transparent;
      color: var(--vscode-foreground);
      border: none;
      padding: 0.4rem 0.9rem;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 0.95rem;
    }
    .filter button.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
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
    .danger-btn {
      background: transparent;
      color: var(--vscode-errorForeground, #f14c4c);
      border: 1px solid var(--vscode-errorForeground, #f14c4c);
    }
    .danger-btn:hover:not(:disabled) {
      background: var(--vscode-inputValidation-errorBackground, rgba(241,76,76,.15));
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: var(--grid-gap);
      align-content: start;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding-right: 0.25rem;
      padding-bottom: 1rem;
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
      content: ${JSON.stringify(`✓ ${installedText}`)};
      display: block;
      font-size: 0.85rem;
      color: var(--vscode-notificationCenterHeader-foreground, #00cc00);
      margin-top: 0.5rem;
      font-weight: bold;
    }
    /* Installé, mais le dépôt a une version plus récente : la carte se signale
       d'elle-même, sinon rien ne distingue « à jour » de « en retard ». */
    .component-card.update {
      border-color: var(--vscode-charts-orange, #d18616);
    }
    .component-card.update::after {
      content: ${JSON.stringify(`⇩ ${updateText}`)};
      color: var(--vscode-charts-orange, #d18616);
    }
    /* Composant pas encore validé : la carte le dit d'emblée. Cadre en
       pointillés + pastille, pour que ça se voie sans avoir à lire. */
    .component-card.experimental {
      border-style: dashed;
    }
    .badge-experimental {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: bold;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.1rem 0.45rem;
      margin-bottom: 0.5rem;
      border-radius: 999px;
      color: var(--vscode-charts-purple, #b180d7);
      border: 1px solid currentColor;
    }
    .component-meta .from-version {
      text-decoration: line-through;
      opacity: 0.7;
    }
    /* « cover » recadrait l'image pour remplir le bloc : un composant large y
       perdait ses bords. On la met en entier dans le cadre, quitte à laisser
       du vide autour. */
    .thumbnail {
      display: block;
      width: 100%;
      height: 150px;
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
      border-radius: 4px;
      margin-bottom: 0.8rem;
      object-fit: contain;
      padding: 0.4rem;
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
    <h1>${titleText}</h1>

    <div class="controls">
      <div class="filter" id="filter">
        <button data-filter="new" class="active">${filterNewText}</button>
        <button data-filter="installed">${filterInstalledText}</button>
        <button data-filter="all">${filterAllText}</button>
      </div>
      <button class="download-btn" id="downloadBtn" disabled>${downloadButtonText}</button>
      <button class="download-btn danger-btn" id="deleteBtn" disabled>${deleteButtonText}</button>
      <span id="status" style="margin-left: auto; color: var(--vscode-descriptionForeground, rgba(255,255,255,.6));"></span>
    </div>

    <div class="grid" id="grid">
      <div class="empty">${noComponentsText}</div>
    </div>
  </div>

  <script nonce="${nonce}">
    // Sans ça, « vscode » n'existe pas et TOUT bouton lève une ReferenceError :
    // la page se contentait d'afficher la grille.
    const vscode = acquireVsCodeApi();
    const components = ${componentsJson};
    const selectedTypes = new Set();
    // Le rechargement de la liste réécrit toute la page : sans état retenu, on
    // repartirait sur « Nouveaux » juste après avoir supprimé un installé.
    let mode = (vscode.getState() || {}).mode || 'new';
    let filteredComponents = [...components];

    function updateGrid() {
      const grid = document.getElementById('grid');

      // « Nouveaux » = jamais installés ET installés que le dépôt a fait
      // avancer : c'est le seul endroit où une mise à jour se remarque.
      filteredComponents = components.filter(c =>
        mode === 'all' ? true : mode === 'installed' ? c.local : (!c.local || c.update)
      );
      grid.innerHTML = '';

      if (filteredComponents.length === 0) {
        grid.innerHTML = '<div class="empty">${noComponentsText}</div>';
      } else {
        filteredComponents.forEach(comp => {
          const card = document.createElement('div');
          card.className = 'component-card' + (comp.local ? ' local' : '') + (comp.update ? ' update' : '')
            + (comp.experimental ? ' experimental' : '');
          if (selectedTypes.has(comp.type)) card.classList.add('selected');

          card.innerHTML = \`
            \${comp.thumbnail ? \`<img src="\${comp.thumbnail}" alt="" class="thumbnail" />\` : '<div class="thumbnail"></div>'}
            \${comp.experimental ? \`<div class="badge-experimental">${experimentalText}</div>\` : ''}
            <div class="component-label">\${escapeHtml(comp.label)}</div>
            \${comp.description ? \`<div class="component-description">\${escapeHtml(comp.description)}</div>\` : ''}
            <div class="component-meta">
              \${comp.update ? \`<span class="from-version">v\${escapeHtml(comp.installedVersion || '?')}</span> → \` : ''}v\${escapeHtml(comp.version)}
              \${comp.author ? \` - \${escapeHtml(comp.author)}\` : ''}
              \${comp.reference ? \` (\${escapeHtml(comp.reference)})\` : ''}
              \${comp.local ? \` - \${comp.origin === 'remote' ? ${JSON.stringify(downloadedText)} : ${JSON.stringify(madeHereText)}}\` : ''}
            </div>
          \`;

          card.addEventListener('click', () => {
            selectedTypes.has(comp.type)
              ? selectedTypes.delete(comp.type)
              : selectedTypes.add(comp.type);
            updateGrid();
            updateButtons();
          });

          grid.appendChild(card);
        });
      }
    }

    /**
     * Types sélectionnés qui sont téléchargeables / installés. Un composant déjà
     * installé qu'un dépôt propose reste téléchargeable : c'est ainsi qu'on le
     * met à jour.
     */
    function selection() {
      const chosen = components.filter(c => selectedTypes.has(c.type));
      return {
        toDownload: chosen.filter(c => c.sourceUrl).map(c => c.type),
        toDelete: chosen.filter(c => c.local).map(c => c.type),
      };
    }

    function updateButtons() {
      const { toDownload, toDelete } = selection();
      document.getElementById('downloadBtn').disabled = toDownload.length === 0;
      document.getElementById('deleteBtn').disabled = toDelete.length === 0;
    }

    function setStatus(text) {
      const status = document.getElementById('status');
      status.textContent = text;
      status.style.color = 'var(--vscode-descriptionForeground, rgba(255,255,255,.6))';
    }

    for (const btn of document.querySelectorAll('#filter button')) {
      btn.addEventListener('click', () => {
        mode = btn.dataset.filter;
        vscode.setState({ mode });
        markFilter();
        selectedTypes.clear();
        updateGrid();
        updateButtons();
      });
    }

    function markFilter() {
      for (const btn of document.querySelectorAll('#filter button')) {
        btn.classList.toggle('active', btn.dataset.filter === mode);
      }
    }

    document.getElementById('downloadBtn').addEventListener('click', () => {
      setStatus(${JSON.stringify(selectingText)});
      vscode.postMessage({ command: 'download', types: selection().toDownload });
    });

    document.getElementById('deleteBtn').addEventListener('click', () => {
      setStatus(${JSON.stringify(deletingText)});
      // La confirmation est demandée côté extension (fenêtre modale de VS Code) :
      // un confirm() de webview est bloqué.
      vscode.postMessage({ command: 'delete', types: selection().toDelete });
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
    markFilter();
    updateGrid();
    updateButtons();

    // Écouter les messages du host
    window.addEventListener('message', event => {
      const message = event.data;
      const status = document.getElementById('status');
      if (message.command === 'downloadComplete' || message.command === 'deleteComplete') {
        if (message.success) {
          status.textContent = message.message || ${JSON.stringify(doneText)};
          status.style.color = 'var(--vscode-notificationCenterHeader-foreground, #00cc00)';
          selectedTypes.clear();
          setTimeout(() => {
            // Recharge les composants locaux
            vscode.postMessage({ command: 'reload' });
          }, 1500);
        } else if (message.cancelled) {
          // Suppression annulée dans la modale : rien à signaler.
          setStatus('');
        } else {
          status.textContent = message.error || ${JSON.stringify(errorText)};
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
    } else if (message.command === 'delete') {
      await this.deleteComponents(message.types);
    } else if (message.command === 'reload') {
      await this.load();
    }
  }

  /**
   * Désinstalle des composants : confirmation modale, effacement du .kompix, puis
   * retrait de la palette des ateliers ouverts (sinon le composant y resterait,
   * et la première retouche du schéma le réécrirait sur le disque).
   */
  private async deleteComponents(types: string[]): Promise<void> {
    const asked = (types ?? []).filter((t) => this.localTypes.has(t));
    if (asked.length === 0) {
      this.panel.webview.postMessage({ command: 'deleteComplete', success: false, cancelled: true });
      return;
    }

    const labels = asked.map((t) => this.allComponents.find((c) => c.type === t)?.label ?? t);
    const confirm = l10n.t('Delete');
    const answer = await vscode.window.showWarningMessage(
      asked.length === 1
        ? l10n.t('Delete the component "{0}" from the library?', labels[0])
        : l10n.t('Delete {0} components from the library?', asked.length),
      {
        modal: true,
        detail:
          labels.join(', ') +
          '\n\n' +
          l10n.t('The .kompix file is erased. Any instance placed in an open workshop is removed too.'),
      },
      confirm
    );
    if (answer !== confirm) {
      this.panel.webview.postMessage({ command: 'deleteComplete', success: false, cancelled: true });
      return;
    }

    const removed: string[] = [];
    for (const type of asked) {
      if (!this.library) break;
      if (await this.library.removeKompix(type)) removed.push(type);
    }

    if (removed.length > 0) {
      SimulatorPanel.notifyCustomPartsRemoved(removed);
      this.panel.webview.postMessage({
        command: 'deleteComplete',
        success: true,
        message: l10n.t('{0} component(s) deleted', removed.length),
      });
    } else {
      this.panel.webview.postMessage({
        command: 'deleteComplete',
        success: false,
        error: l10n.t('Nothing was deleted.'),
      });
    }
  }

  private async downloadComponents(types: string[]): Promise<void> {
    try {
      if (!this.library) {
        throw new Error(l10n.t('The component library is not available.'));
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
        // La palette d'un atelier déjà ouvert ne se rafraîchit pas toute seule :
        // sans ça, le composant fraîchement installé n'apparaît qu'à la
        // réouverture de l'onglet.
        SimulatorPanel.refreshCustomParts();
        this.panel.webview.postMessage({
          command: 'downloadComplete',
          success: true,
          message: l10n.t('{0} component(s) installed', downloaded.length),
        });
      } else {
        this.panel.webview.postMessage({
          command: 'downloadComplete',
          success: false,
          error: l10n.t('Nothing was downloaded.'),
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
