// Rend le câblage interne GÉNÉRÉ (internal-wiring.mts) pour 7seg 1/2/4 dig,
// exactement comme editor.renderInternalWiring, en PNG. Pour juger le style.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SP = 'V:/Temp/claude/h--OneDrive-4-Programation---VS-Code-Extensions-Kablix/3a50b9e7-84d9-4776-83f6-f55321d5e6a5/scratchpad';
const out = join(mkdtempSync(join(tmpdir(), 'kx-iw-')), 'iw.mjs');
await esbuild.build({ entryPoints: [join(root, 'src/webview/diagram/internal-wiring.mts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', loader: { '.svg': 'text' } });
const { internalWiringSvg } = await import(pathToFileURL(out).href);

// pins des variantes (repère de conception), échelle box = corps en px (×~3.5)
const VARIANTS = {
  1: { w: 59.994762, h: 90, common: 'cathode', pins: { 'COM.2':{x:30,y:10},A:{x:40,y:10},B:{x:50,y:10},F:{x:20,y:10},G:{x:10,y:10},'COM.1':{x:30,y:80},C:{x:40,y:80},D:{x:20,y:80},E:{x:10,y:80},DP:{x:50,y:80} } },
  '1a': { w: 59.994762, h: 90, common: 'anode', pins: { 'COM.2':{x:30,y:10},A:{x:40,y:10},B:{x:50,y:10},F:{x:20,y:10},G:{x:10,y:10},'COM.1':{x:30,y:80},C:{x:40,y:80},D:{x:20,y:80},E:{x:10,y:80},DP:{x:50,y:80} }, digits:'1' },
  2: { w: 100.37129, h: 85.806129, common:'cathode', pins: { DIG1:{x:50,y:10},DIG2:{x:60,y:10},A:{x:30,y:10},B:{x:40,y:10},F:{x:70,y:10},C:{x:30,y:80},D:{x:60,y:80},E:{x:50,y:80},G:{x:70,y:80},DP:{x:40,y:80} } },
  4: { w: 200, h: 90, common:'cathode', pins: { A:{x:80,y:10},B:{x:120,y:10},F:{x:90,y:10},DIG1:{x:70,y:10},DIG2:{x:100,y:10},DIG3:{x:110,y:10},C:{x:100,y:80},D:{x:80,y:80},E:{x:70,y:80},G:{x:110,y:80},DP:{x:90,y:80},DIG4:{x:120,y:80} } },
};
const SC = 96/25.4; // ~3.78 px/mm comme le corps réel
let cells = '';
for (const [dig, v] of Object.entries(VARIANTS)) {
  const w = Math.round(v.w * SC), h = Math.round(v.h * SC);
  const pins = Object.entries(v.pins).map(([name, p]) => ({ name, x: p.x*SC, y: p.y*SC }));
  const inner = internalWiringSvg('7segment', pins, { common: v.common, digits: v.digits ?? dig }, undefined, { w, h }) || '';
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`+
    `<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="rgba(255,255,255,0.9)"/>`+
    `<g fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`+
    // pastilles broches par-dessus
    pins.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#e00"/><text x="${p.x}" y="${p.y-6}" font-size="9" fill="#a00" text-anchor="middle">${p.name}</text>`).join('')+
    `</svg>`;
  cells += `<div style="border:1px solid #ccc;padding:8px"><div>${dig} dig</div>${svg}</div>`;
}
const html = `<!doctype html><meta charset=utf8><body style="margin:0;background:#eee;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;padding:16px">${cells}</body>`;
const dir = mkdtempSync(join(tmpdir(), 'kx-html-'));
const hp = join(dir, 'p.html'); writeFileSync(hp, html);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless=new','--disable-gpu','--no-sandbox','--virtual-time-budget=6000','--window-size=1000,900',`--screenshot=${join(SP,'iw.png').replace(/\\/g,'/')}`,`file:///${hp.replace(/\\/g,'/')}`], { encoding:'utf8', maxBuffer:64*1024*1024 });
console.log('ok '+join(SP,'iw.png'));
