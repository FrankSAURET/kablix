// Rend l'élément <kablix-7segment> (dessin externe) pour 1/2/4 chiffres, tous
// segments allumés, en PNG — pour juger l'épaisseur des segments et la hauteur.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Sortie des captures : le temporaire du système, sauf KABLIX_OUT.
const SP = process.env.KABLIX_OUT ?? join(tmpdir(), 'kablix-vues');
mkdirSync(SP, { recursive: true });
const SCALE = 3;

const entry = `
import '../../src/webview/composants/7segment-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  for (const dig of [4]) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-block;margin:12px;outline:1px solid #999;background:#fff';
    const el = document.createElement('kablix-7segment');
    el.digits = dig;
    el.values = Array.from({length: dig*8}, () => 0); // tout éteint
    wrap.style.transform = 'scale(${SCALE})';
    wrap.style.transformOrigin = 'top left';
    wrap.appendChild(el); document.body.appendChild(wrap);
    try { if (el.updateComplete) await el.updateComplete; } catch(e){}
  }
  await wait(150);
}
run();
`;
const CACHE = join(ROOT, 'node_modules', '.cache-7ext');
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' } });
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body style="margin:0;background:#cfd6dd;display:flex;align-items:flex-start"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless=new','--disable-gpu','--no-sandbox','--virtual-time-budget=15000','--window-size=1500,500',`--screenshot=${join(SP,'7ext.png').replace(/\\/g,'/')}`,`file:///${join(CACHE,'p.html').replace(/\\/g,'/')}`], { encoding:'utf8', maxBuffer:64*1024*1024 });
console.log('ok '+join(SP,'7ext.png'));
