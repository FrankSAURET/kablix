// Capture visuelle du traceur : sinus + escalier de sonde, thèmes sombre et clair.
// Usage : node view-plotter.mjs (depuis la racine Kablix pour node_modules)
import { writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

const ROOT = 'h:/OneDrive/4 Programation/- VS Code/Extensions/Kablix';
const OUT = 'V:/Temp/claude/h--OneDrive-4-Programation---VS-Code-Extensions-Kablix/056d6e61-34bc-4b56-8aca-a46bee3716f8/scratchpad';

const bundle = buildSync({
  entryPoints: [join(ROOT, 'src', 'webview', 'plotter.mts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'PlotterMod',
}).outputFiles[0].text;

// Reprend les styles réels du traceur + variables VS Code simulées.
const css = `
body { margin: 16px; font-family: "Segoe UI", sans-serif; font-size: 13px; }
body.vscode-dark { background: #1f1f1f; color: #ccc;
  --vscode-foreground: #cccccc; --vscode-editor-font-family: Consolas, monospace;
  --vscode-input-border: #555; --vscode-input-background: #333; --vscode-input-foreground: #fff;
  --vscode-textCodeBlock-background: rgba(0,0,0,0.3);
  --vscode-editorWidget-background: #252526; --vscode-editorWidget-foreground: #ccc; --vscode-editorWidget-border: #454545; }
body.vscode-light { background: #ffffff; color: #333;
  --vscode-foreground: #333333; --vscode-editor-font-family: Consolas, monospace;
  --vscode-input-border: #bbb; --vscode-input-background: #f3f3f3; --vscode-input-foreground: #333;
  --vscode-textCodeBlock-background: rgba(0,0,0,0.05);
  --vscode-editorWidget-background: #f3f3f3; --vscode-editorWidget-foreground: #333; --vscode-editorWidget-border: #ccc; }
` + (await import('node:fs')).readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8')
  .split('/* --- Traceur de courbes ---')[1].split('/* --- Panneau de débogage')[0];

const skeleton = `
<section class="plotter" id="plotter-section" style="max-width:760px">
  <div class="serial__head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">
    <span>📈 Traceur</span>
    <span class="serial__head-actions" style="display:inline-flex;gap:.35rem">
      <select id="plotter-window" class="plotter__window"></select>
      <button id="plotter-pause"></button>
      <button id="plotter-csv">CSV</button>
      <button id="clear-plotter">Effacer</button>
      <button id="close-plotter">✕</button>
    </span>
  </div>
  <div id="plotter-legend" class="plotter__legend" hidden></div>
  <div class="plotter__wrap">
    <canvas id="plotter-canvas" class="plotter__canvas"></canvas>
    <div id="plotter-tooltip" class="plotter__tooltip" hidden></div>
    <div id="plotter-empty" class="plotter__empty">En attente de données…</div>
  </div>
</section>`;

const script = `
window.KABLIX_LANG = 'fr';
const p = new PlotterMod.Plotter();
p.start();
// 8 s de données : 2 télémétries série (sinus + dents de scie) et 1 sonde escalier.
const t0 = performance.now();
for (let ms = 0; ms <= 8000; ms += 40) {
  const t = t0 - 8000 + ms;
  p.push('temp', 22 + 3 * Math.sin(ms / 900), '°C', 'line');
  p.push('lum', 15 + (ms % 2000) / 120, '°C', 'line');
  // Points forcés dans le passé pour un tracé étalé.
  for (const s of p.series.values()) { const q = s.pts[s.pts.length - 1]; if (q) q.t = t; }
}
p.probe('A0', 1.2); p.series.get('A0').pts.forEach(q => q.t = t0 - 6000);
p.probe('A0', 3.1); { const a = p.series.get('A0').pts; a[1].t = t0 - 3000; a[2].t = t0 - 3000; }
p.freezeT = t0; p.running = false; p.frozen = false;
setTimeout(() => { p.draw(); }, 100);
`;

const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
for (const theme of ['dark', 'light']) {
  const htmlPath = join(OUT, `view-plotter-${theme}.html`);
  writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><style>${css}</style><body class="vscode-${theme}">${skeleton}<script>${bundle}</script><script>${script}</script></body>`);
  execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3000',
    `--screenshot=${join(OUT, `view-plotter-${theme}.png`)}`, '--window-size=800,340', `file:///${htmlPath.replace(/\\/g, '/')}`],
    { encoding: 'utf8' });
  console.log(`OK ${theme}`);
}
