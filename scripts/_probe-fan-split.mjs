// Sépare le dessin du ventilateur : hélice seule / carter seul / hélice tournée
// de 40°. Ce qui reste FIXE alors que le reste tourne se voit d'un coup d'œil.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-fan-view');
const OUT = resolve(process.argv[2] || join(CACHE, 'split.png'));
mkdirSync(CACHE, { recursive: true });

const entry = `
import '../../src/webview/composants/ventilo-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const vues = ['tout', 'carter seul', 'fixes en rouge', 'fixes seuls'];
  for (const vue of vues) {
    const box = document.createElement('div');
    box.style.cssText = 'display:inline-block;text-align:center;font:12px sans-serif;margin:4px';
    const el = document.createElement('kablix-ventilo');
    box.appendChild(el);
    const cap = document.createElement('div');
    cap.textContent = vue;
    box.appendChild(cap);
    document.body.appendChild(box);
    await el.updateComplete;
    await wait(50);
    const spin = el.shadowRoot.querySelector('.spin');
    const svg = el.shadowRoot.querySelector('svg');
    if (vue === 'helice seule') {
      for (const n of [...svg.children]) if (!n.contains(spin)) n.style.display = 'none';
      for (const n of [...spin.parentNode.children]) if (n !== spin) n.style.display = 'none';
    } else if (vue === 'carter seul') {
      spin.style.display = 'none';
    } else if (vue.startsWith('helice tournee')) {
      spin.style.transform = 'rotate(40deg)';
      spin.style.animationName = 'none';
    } else if (vue === 'fixes en rouge') {
      for (const n of el.shadowRoot.querySelectorAll('#path4272,#path4274')) n.style.fill = 'red';
    } else if (vue === 'fixes seuls') {
      // Tout masquer sauf les deux traits suspects, sur fond clair.
      for (const n of el.shadowRoot.querySelectorAll('path,rect,circle,ellipse,polygon')) {
        n.style.display = /^path427[24]$/.test(n.id) ? '' : 'none';
      }
      for (const n of el.shadowRoot.querySelectorAll('#path4272,#path4274')) n.style.fill = 'red';
      el.style.background = '#eee';
    }
  }
}
run();
`;
writeFileSync(join(CACHE, 'split.mjs'), entry);
const b = await esbuild.build({
  entryPoints: [join(CACHE, 'split.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
writeFileSync(join(CACHE, 'split.html'),
  `<!doctype html><meta charset=utf8><body style="margin:0;background:#fff;white-space:nowrap">` +
  `<script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) throw new Error('Chrome introuvable');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3000',
  '--window-size=1100,290', `--screenshot=${OUT}`,
  `file:///${join(CACHE, 'split.html').replace(/\\/g, '/')}`], { encoding: 'utf8' });
console.log('capture', OUT);
