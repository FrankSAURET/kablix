// Repère les éléments FIXES du ventilateur qui traversent le disque de l'hélice
// (le trait en zigzag qui ressort dès que les pales tournent ou s'estompent).
import esbuild from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-fan-view');
mkdirSync(CACHE, { recursive: true });

const entry = `
import '../../src/webview/composants/ventilo-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const el = document.createElement('kablix-ventilo');
  document.body.appendChild(el);
  await el.updateComplete;
  await wait(60);
  const spin = el.shadowRoot.querySelector('.spin');
  const lignes = [];
  for (const n of el.shadowRoot.querySelectorAll('path,rect,circle,ellipse,polygon')) {
    if (spin.contains(n)) continue;
    const b = n.getBBox();
    const cs = getComputedStyle(n);
    lignes.push([
      n.id || n.tagName,
      'x=' + b.x.toFixed(0), 'y=' + b.y.toFixed(0), 'w=' + b.width.toFixed(0), 'h=' + b.height.toFixed(0),
      'fill=' + cs.fill, 'stroke=' + cs.stroke, 'sw=' + cs.strokeWidth,
      'd=' + String(n.getAttribute('d') || '').slice(0, 90),
    ].join(' '));
  }
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = lignes.join('\\n');
  document.body.appendChild(out);
}
run().catch((e) => {
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = 'exception ' + e.message;
  document.body.appendChild(out);
});
`;
writeFileSync(join(CACHE, 'carter.mjs'), entry);
const b = await esbuild.build({
  entryPoints: [join(CACHE, 'carter.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
writeFileSync(join(CACHE, 'carter.html'),
  `<!doctype html><meta charset=utf8><body style="margin:0">` +
  `<script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=8000', '--dump-dom',
  `file:///${join(CACHE, 'carter.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'aucune mesure');
