// Vérifie l'alignement du câblage interne 7seg sur les broches : monte l'élément
// réel (corps), pose le câblage via internalWiringSvg (comme editor), et dessine
// les hotspots aux positions pinInfo. Screenshot pour juger si les fils tombent
// sur les pattes.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SP = 'V:/Temp/claude/h--OneDrive-4-Programation---VS-Code-Extensions-Kablix/3a50b9e7-84d9-4776-83f6-f55321d5e6a5/scratchpad';
const SCALE = 7;

const entry = `
import '../../src/webview/composants/7segment-element.mjs';
import { internalWiringSvg } from '../../src/webview/diagram/internal-wiring.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  for (const dig of [2]) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;margin:16px;transform:scale(${SCALE});transform-origin:top left';
    const el = document.createElement('kablix-7segment');
    el.digits = dig;
    el.values = Array.from({length: dig*8}, () => 0);
    wrap.appendChild(el); document.body.appendChild(wrap);
    try { if (el.updateComplete) await el.updateComplete; } catch(e){}
    await wait(60);
    const svgEl = el.shadowRoot.querySelector('svg');
    const w = svgEl.clientWidth || svgEl.getBoundingClientRect().width;
    const h = svgEl.clientHeight || svgEl.getBoundingClientRect().height;
    const pins = (el.pinInfo || []).map(p => ({ name: p.name, x: p.x, y: p.y }));
    const inner = internalWiringSvg('7segment', pins, { common:'cathode', digits: String(dig) }, undefined, { w, h }) || '';
    const ov = document.createElement('div');
    ov.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    // repère px = w×h ; les pins sont en repère de conception (viewBox) → scale
    const vb = svgEl.viewBox.baseVal;
    ov.innerHTML = '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+
      '<rect width="'+w+'" height="'+h+'" fill="rgba(255,255,255,.55)"/>'+
      '<g fill="none" stroke="#111" stroke-width="1">'+inner+'</g>'+
      pins.map(p=>{ const x=p.x/vb.width*w, y=p.y/vb.height*h; return '<circle cx="'+x+'" cy="'+y+'" r="2.2" fill="red"/>'; }).join('')+
      '</svg>';
    wrap.appendChild(ov);
  }
  await wait(120);
}
run();
`;
const CACHE = join(ROOT, 'node_modules', '.cache-7cale');
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' } });
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body style="margin:0;background:#c8d0d8"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless=new','--disable-gpu','--no-sandbox','--virtual-time-budget=15000','--window-size=1500,600',`--screenshot=${join(SP,'7cale.png').replace(/\\/g,'/')}`,`file:///${join(CACHE,'p.html').replace(/\\/g,'/')}`], { encoding:'utf8', maxBuffer:64*1024*1024 });
console.log('ok '+join(SP,'7cale.png'));
