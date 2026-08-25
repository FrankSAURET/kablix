// Diagnostic du multimètre : l'écran déborde-t-il ? le levier bascule-t-il ?
// Rendu du vrai élément en Chrome headless, mesures dans le DOM.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-diag');
mkdirSync(SCRATCH, { recursive: true });

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((c) => existsSync(c));

const entry = `
import '../../src/webview/composants/multimetre-element.mjs';

const CAS = [
  ['voltage', 0], ['voltage', 5], ['voltage', 12.34], ['voltage', -12.34], ['voltage', 230.5],
  ['current', 0.00499], ['current', 0.0999], ['current', 0.4999], ['current', 1.25], ['current', -0.0499],
];

const out = [];
for (const [mode, val] of CAS) {
  const el = document.createElement('kablix-multimetre');
  el.setAttribute('mode', mode);
  el.style.display = 'inline-block';
  document.body.appendChild(el);
  el.reading = val;
  out.push({ el, mode, val });
}

setTimeout(() => {
  const res = out.map(({ el, mode, val }) => {
    const r = el.shadowRoot;
    const txt = r.querySelector('#Text-Affichage');
    const ecran = r.querySelector('#Ecran');
    const lev = r.querySelector('#multi-levier');
    const boule = r.querySelector('#circle58');
    const tb = txt.getBoundingClientRect();
    const eb = ecran.getBoundingClientRect();
    const bb = boule ? boule.getBoundingClientRect() : null;
    const host = el.getBoundingClientRect();
    return {
      mode, val,
      texte: txt.textContent,
      tx: [+(tb.x - host.x).toFixed(1), +(tb.right - host.x).toFixed(1)],
      ecran: [+(eb.x - host.x).toFixed(1), +(eb.right - host.x).toFixed(1)],
      deborde: tb.x < eb.x + 1 || tb.right > eb.right - 1,
      bouleY: bb ? +(bb.y + bb.height / 2 - host.y).toFixed(1) : null,
      transform: lev ? (lev.getAttribute('transform') || '(aucun)') : 'ABSENT',
    };
  });
  document.getElementById('res').textContent = JSON.stringify(res, null, 1);
}, 200);
`;

const entryPath = join(SCRATCH, 'entry.mjs');
writeFileSync(entryPath, entry);
const bundle = await esbuild({ entryPoints: [entryPath], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' } });
const htmlPath = join(SCRATCH, 'page.html');
writeFileSync(htmlPath,
  `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222}kablix-multimetre{display:inline-block}</style>` +
  `<body><pre id="res" style="position:absolute;left:-9999px"></pre><script>${bundle.outputFiles[0].text}</script></body>`);

const url = `file:///${htmlPath.replace(/\\/g, '/')}`;
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="res"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'PAS DE RESULTAT');

const shot = join(SCRATCH, 'multi.png');
execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--virtual-time-budget=8000', `--screenshot=${shot}`, '--window-size=1400,1000', url,
], { stdio: 'ignore' });
console.log('capture:', shot);
