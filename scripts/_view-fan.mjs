// Revoir l'hélice du ventilateur à plusieurs vitesses (capture PNG) : au-delà
// du plafond anti-stroboscope, c'est le flou de bougé qui dit la vitesse.
// Usage : node scripts/_view-fan.mjs [fichier.png]
import esbuild from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'node_modules', '.cache-fan-view', 'fan.png'));
const CACHE = join(ROOT, 'node_modules', '.cache-fan-view');
mkdirSync(CACHE, { recursive: true });

const entry = `
import '../../src/webview/composants/ventilo-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  for (const v of [0, 1, 3, 10, 25, 50]) {
    const box = document.createElement('div');
    box.style.cssText = 'display:inline-block;text-align:center;font:12px sans-serif;margin:4px';
    const el = document.createElement('kablix-ventilo');
    box.appendChild(el);
    const cap = document.createElement('div');
    cap.textContent = v + ' tr/s';
    box.appendChild(cap);
    document.body.appendChild(box);
    await el.updateComplete;
    await wait(50);
    el.speed = v;
    await el.updateComplete;
  }
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
writeFileSync(join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><body style="margin:0;background:#fff;white-space:nowrap">` +
  `<script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) throw new Error('Chrome introuvable');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3000',
  '--window-size=1500,280', `--screenshot=${OUT}`,
  `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8' });
console.log('capture', OUT);
