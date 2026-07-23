import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

const l10n = vscode.l10n;

/** Nonce CSP : aléa cryptographique (Math.random serait prédictible). */
function getNonce(): string {
  return randomBytes(24).toString('base64');
}

/**
 * HTML complet de l'atelier Kablix (barre d'outils + canvas + moniteur série +
 * traceur). Partagé par les deux hôtes : le WebviewPanel historique
 * (SimulatorPanel) et le CustomEditor `.projix` (ProjixEditorProvider). Tout ce
 * dont il a besoin se dérive de `webview` + `extensionUri`, pour rester
 * indépendant de l'hôte.
 */
export function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const asset = (name: string): vscode.Uri =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', name));
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
  );
  const styleUri = asset('styles.css');
  const gommeUri = asset('Gomme.svg');
  const stepUri = asset('step.png');
  const autoRouteUri = asset('autoroutage.png');
  const fitViewUri = asset('recentrer.svg');
  const serialMonitorUri = asset('serialMonitor.svg');
  const plotterIconUri = asset('serialTracer.svg');
  const newIconUri = asset('nouveau.svg');
  const openIconUri = asset('ouvrir.svg');
  const saveIconUri = asset('enregistrer.svg');
  const saveAsIconUri = asset('enregistrerSous.svg');
  const svgIconUri = asset('exportSvg.svg');
  const aideIconUri = asset('aide.svg');
  const grilleIconUri = asset('grille.svg');
  // Base des posters de brochage (dist/pinout/<carte>.svg) : récupérés par fetch au clic sur ☢.
  const pinoutBase = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'pinout')
  );
  const nonce = getNonce();
  const version =
    vscode.extensions.getExtension('franksauret.kablix')?.packageJSON?.version ?? '';
  // Couleur de sélection réglable (composants/fils/coudes) : variable CSS --kx-select.
  const rawSelColor = vscode.workspace
    .getConfiguration('kablix')
    .get<string>('selectionColor', '#e973e9');
  const selColor = /^#[0-9a-fA-F]{6}$/.test(rawSelColor ?? '') ? rawSelColor : '#e973e9';
  const csp = [
    `default-src 'none'`,
    // Les composants Lit injectent des styles dans leur shadow DOM ; on autorise
    // les styles inline pour la webview locale.
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
    // fetch des posters de brochage (dist/pinout/*.svg), chargés à la demande.
    `connect-src ${webview.cspSource}`,
    // Police LED des écrans LCD (media/font/led_board-7.ttf, @font-face).
    `font-src ${webview.cspSource}`,
  ].join('; ');

  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <style>:root { --kx-select: ${selColor}; --kx-help-icon: url("${aideIconUri}"); }</style>
  <title>Kablix</title>
</head>
<body>
  <header class="toolbar">
    <span class="brand" id="brand" title="${l10n.t('Open the GitHub repository')}">
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
        <option value="mega">Arduino Mega 2560</option>
      </optgroup>
      <optgroup label="Raspberry Pi (RP2040)">
        <option value="pico">Raspberry Pi Pico</option>
        <option value="picow">Raspberry Pi Pico W</option>
      </optgroup>
    </select>
    <button id="load-workspace" hidden title="${l10n.t('Load a compiled .uf2 (Pico) or .hex (Arduino) from the workspace')}">↑ ${l10n.t('Load binary')}</button>
    <button id="new-project" class="toolbar__icon-btn" title="${l10n.t('New project')}"><img src="${newIconUri}" alt="${l10n.t('New project')}" /></button>
    <button id="open-project" class="toolbar__icon-btn" title="${l10n.t('Open a project')}"><img src="${openIconUri}" alt="${l10n.t('Open a project')}" /></button>
    <button id="save-project" class="toolbar__icon-btn" title="${l10n.t('Save the project')}"><img src="${saveIconUri}" alt="${l10n.t('Save the project')}" /></button>
    <button id="save-project-as" class="toolbar__icon-btn" title="${l10n.t('Save the project as…')}"><img src="${saveAsIconUri}" alt="${l10n.t('Save the project as…')}" /></button>
    <button id="export-svg" class="toolbar__icon-btn" title="${l10n.t('Export the diagram as SVG')}"><img src="${svgIconUri}" alt="${l10n.t('Export the diagram as SVG')}" /></button>
    <button id="toggle-labels" title="${l10n.t('Show/hide part names')}">${l10n.t('Names')}</button>
    <button id="open-help" class="toolbar__icon-btn" title="${l10n.t('Open help')}"><img src="${aideIconUri}" alt="${l10n.t('Open help')}" /></button>
    <span id="project-name" class="project-name" title="${l10n.t('Current project')}"></span>
    <div class="more-menu" id="more-menu">
      <button id="more-btn" class="more-menu__btn" title="${l10n.t('Other functions')}" aria-haspopup="true" aria-expanded="false" aria-label="${l10n.t('Other functions')}"><span class="more-menu__burger" aria-hidden="true"></span></button>
      <ul id="more-list" class="more-menu__list" role="menu" hidden>
        <li role="menuitem" data-cmd="kablix.importWokwiDiagram">${l10n.t('Import a Wokwi diagram')}</li>
        <li role="menuitem" data-cmd="kablix.exportWokwiDiagram">${l10n.t('Export a Wokwi diagram')}</li>
        <li role="menuitem" data-cmd="kablix.upgradePicoFirmware">${l10n.t('Update the Pico firmware')}</li>
        <li role="menuitem" data-cmd="kablix.checkLibraryUpdates">${l10n.t('Check for library updates')}</li>
        <li class="more-menu__sep" role="separator"></li>
        <li role="menuitem" data-cmd="kablix.saveDefaultLayout">${l10n.t('Save this layout as default')}</li>
      </ul>
    </div>
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
          <button id="pause" class="canvas-controls__btn" disabled title="${l10n.t('Pause - resume the simulation')}">⏸</button>
          <button id="step" class="canvas-controls__btn canvas-controls__btn--step" disabled title="${l10n.t('Run next source line')}"><img class="canvas-controls__icon" src="${stepUri}" alt="${l10n.t('Run next source line')}" /></button>
          <select id="speed" class="canvas-controls__speed" title="${l10n.t('Simulation speed')}">
            <option value="1" selected>🐇 100 %</option>
            <option value="0.1">🐢 10 %</option>
            <option value="0.01">🐌 1 %</option>
          </select>
          <button id="code-file" class="canvas-controls__file" title="${l10n.t('Code file to run / debug — click to change, double-click to open')}">📄 ${l10n.t('No file')}</button>
          <button id="repl" class="canvas-controls__btn canvas-controls__btn--repl" hidden title="${l10n.t('Start an interactive MicroPython REPL (no script)')}">REPL</button>
          <button id="toggle-serial" class="canvas-controls__btn canvas-controls__btn--icon" title="${l10n.t('Show/hide the serial monitor')}"><img class="canvas-controls__icon" src="${serialMonitorUri}" alt="${l10n.t('Show/hide the serial monitor')}" /></button>
          <button id="toggle-plotter" class="canvas-controls__btn canvas-controls__btn--icon" title="${l10n.t('Show/hide the plotter (curves)')}"><img class="canvas-controls__icon" src="${plotterIconUri}" alt="${l10n.t('Show/hide the plotter (curves)')}" /></button>
        </div>
        <!-- Barre droite : recentrer/ajuster, réinitialiser, effacer (alignée et de
             même hauteur que la barre de simulation à gauche). -->
        <div class="canvas-controls canvas-controls--right" role="toolbar">
          <button id="internal-toggle" class="canvas-controls__btn canvas-controls__btn--internal" hidden title="${l10n.t('Show/hide the internal wiring')}"></button>
          <button id="auto-route" class="canvas-controls__btn canvas-controls__btn--icon" title="${l10n.t('Auto-route the wires (right angles) — selection, or whole diagram')}"><img class="canvas-controls__icon" src="${autoRouteUri}" alt="${l10n.t('Auto-route the wires (right angles) — selection, or whole diagram')}" /></button>
          <button id="toggle-grid" class="canvas-controls__btn canvas-controls__btn--grid canvas-controls__btn--icon is-on" title="${l10n.t('Show/hide the grid')}"><img class="canvas-controls__icon" src="${grilleIconUri}" alt="${l10n.t('Show/hide the grid')}" /></button>
          <button id="fit-view" class="canvas-controls__btn canvas-controls__btn--icon" title="${l10n.t('Recenter and fit the view')}"><img class="canvas-controls__icon" src="${fitViewUri}" alt="${l10n.t('Recenter and fit the view')}" /></button>
          <button id="reset-sim" class="canvas-controls__btn canvas-controls__btn--reset" title="${l10n.t('Reset all components')}">⟲</button>
          <button id="clear-canvas" class="canvas-controls__btn canvas-controls__btn--eraser" title="${l10n.t('Clear the diagram (Ctrl+Z to undo)')}"><img class="canvas__clear-icon" src="${gommeUri}" alt="${l10n.t('Clear')}" /></button>
        </div>
        <!-- Bandeau permanent « Simulation en cours » (rouge sur jaune), entre les
             deux barres d'outils. Visible pendant la simulation ; clignote sur
             tentative d'édition interdite. -->
        <div id="sim-banner" class="sim-banner" hidden></div>
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

    <section class="serial" id="serial-section">
      <div class="serial__head">
        <span id="serial-title">${l10n.t('Serial monitor')}</span>
        <span class="serial__head-actions">
          <button id="clear-serial">${l10n.t('Clear')}</button>
          <button id="close-serial" title="${l10n.t('Close the serial monitor')}">✕</button>
        </span>
      </div>
      <pre id="serial" class="serial__out" tabindex="0" aria-live="polite"></pre>
      <div class="serial__input" id="serial-input-row">
        <input id="serial-input" type="text" placeholder="${l10n.t('Send to the microcontroller (Enter)…')}" />
        <button id="serial-send">${l10n.t('Send')}</button>
      </div>
    </section>

    <!-- Traceur de courbes : télémétrie série « >nom:valeur » (format Teleplot)
         et sondes internes (tension des broches analogiques). -->
    <section class="plotter" id="plotter-section" hidden>
      <div class="serial__head">
        <span><img class="plotter__head-icon" src="${plotterIconUri}" alt="" /> ${l10n.t('Plotter')}</span>
        <span class="serial__head-actions">
          <select id="plotter-window" class="plotter__window" title="${l10n.t('Time window')}"></select>
          <button id="plotter-pause"></button>
          <button id="plotter-csv" title="${l10n.t('Export the measurements (CSV)')}">CSV</button>
          <button id="clear-plotter">${l10n.t('Clear')}</button>
          <button id="close-plotter" title="${l10n.t('Close the plotter')}">✕</button>
        </span>
      </div>
      <div id="plotter-legend" class="plotter__legend" hidden></div>
      <div class="plotter__wrap">
        <canvas id="plotter-canvas" class="plotter__canvas"></canvas>
        <div id="plotter-tooltip" class="plotter__tooltip" hidden></div>
        <div id="plotter-empty" class="plotter__empty">${l10n.t('Waiting for data — print ">name:value" on the serial port, or wire an analog sensor (its pin is plotted automatically).')}</div>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">window.KABLIX_LANG = ${JSON.stringify(vscode.env.language)};
window.KABLIX_PINOUT_BASE = ${JSON.stringify(pinoutBase.toString())};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
