// Reproduit FIDÈLEMENT le rendu éditeur du 7seg : composant dans .part__body,
// hotspots posés via pinPos (snap grille), câblage posé via renderInternalWiring
// (SVG viewBox = box px, box = body.offsetWidth/Height). Screenshot pour voir le
// vrai décalage câblage↔broches.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SP = 'V:/Temp/claude/h--OneDrive-4-Programation---VS-Code-Extensions-Kablix/3a50b9e7-84d9-4776-83f6-f55321d5e6a5/scratchpad';
const dig = process.argv[2] || '4';
const SCALE = dig === '4' ? 3.5 : 6;

const entry = `
import '../../src/webview/composants/7segment-element.mjs';
import { internalWiringSvg } from '../../src/webview/diagram/internal-wiring.mjs';
const GRID = 10;
const snapPinTo = (v, a) => { const r = a + Math.round((v-a)/GRID)*GRID; return Math.abs(r-v)<=3?r:v; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const container = document.createElement('div');
  container.style.cssText = 'position:relative;display:inline-block;margin:20px;transform:scale(${SCALE});transform-origin:top left';
  const body = document.createElement('div');
  body.style.cssText = 'position:relative;display:inline-block';
  const el = document.createElement('kablix-7segment');
  el.digits = ${dig}; el.values = Array.from({length:${dig}*8},()=>0);
  body.appendChild(el); container.appendChild(body); document.body.appendChild(container);
  try { if (el.updateComplete) await el.updateComplete; } catch(e){}
  await wait(80);
  const pins = (el.pinInfo || []);
  const anchor = pins[0] ? { x: pins[0].x, y: pins[0].y } : { x:0, y:0 };
  const pinScale = 1;
  // hotspots (pinPos : snap grille)
  for (const p of pins) {
    const x = snapPinTo(p.x*pinScale, anchor.x*pinScale), y = snapPinTo(p.y*pinScale, anchor.y*pinScale);
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:'+x+'px;top:'+y+'px;width:6px;height:6px;margin:-3px;border-radius:50%;background:red;z-index:5';
    body.appendChild(d);
  }
  // câblage (renderInternalWiring EXACT)
  const w = body.offsetWidth || 80, h = body.offsetHeight || 60;
  const inner = internalWiringSvg('7segment', pins.map(p=>({name:p.name,x:p.x,y:p.y})), {common:'cathode',digits:'${dig}'}, undefined, {w,h}) || '';
  const ov = document.createElement('div');
  ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4';
  ov.innerHTML = '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="'+w+'" height="'+h+'" fill="rgba(255,255,255,.5)"/><g fill="none" stroke="#111" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">'+inner+'</g></svg>';
  body.appendChild(ov);
  window.__box = {w,h,vb:el.shadowRoot.querySelector('svg').getAttribute('viewBox')};
  await wait(50);
}
run();
`;
const CACHE = join(ROOT, 'node_modules', '.cache-7ed');
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' } });
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body style="margin:0;background:#c8d0d8"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless=new','--disable-gpu','--no-sandbox','--virtual-time-budget=15000','--window-size=1500,700',`--screenshot=${join(SP,'7ed.png').replace(/\\/g,'/')}`,`file:///${join(CACHE,'p.html').replace(/\\/g,'/')}`], { encoding:'utf8', maxBuffer:64*1024*1024 });
console.log('ok '+join(SP,'7ed.png'));
