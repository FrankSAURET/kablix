// TEMP — génère la BASE de retouche du SCHÉMA INTERNE du potentiomètre :
// svg/pot-schema.edit.svg = corps (cadre de référence) + pastilles rouges des
// broches (VCC / SIG / GND) à leur position réelle, repère interne = px (mm ×
// 96/25,4 × pinScale=1). À DESSINER par-dessus : le symbole IEC (boîte résistive
// VCC↔GND + curseur SIG). Repère = coin haut-gauche de la feuille. À supprimer.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'svg');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });
const S = 96 / 25.4; // px/mm ; pinScale = 1 pour le pot
const r2 = (n) => Math.round(n * 100) / 100;

const entry = `
import '@wokwi/elements/dist/esm/potentiometer-element.js';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const el = document.createElement('wokwi-potentiometer');
  document.body.appendChild(el);
  try { if (el.updateComplete) await el.updateComplete; } catch(e){}
  await wait(80);
  const svg = el.shadowRoot && el.shadowRoot.querySelector('svg');
  document.getElementById('result').textContent = JSON.stringify({
    vb: svg.getAttribute('viewBox'), width: svg.getAttribute('width'), height: svg.getAttribute('height'),
    pins: (el.pinInfo || []).map(p => ({ name: p.name, x: p.x, y: p.y })),
  });
}
run().catch(e => document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e));
`;
const entryPath = join(SCRATCH, 'pot-entry.mjs');
writeFileSync(entryPath, entry);
const bundle = await esbuild({ entryPoints: [entryPath], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' } });
const htmlPath = join(SCRATCH, 'pot.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body><pre id="result"></pre><script>${bundle.outputFiles[0].text}</script></body>`);
const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
const raw = dom.slice(a0, b0).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0, 1500)); process.exit(1); }
const { vb, pins } = JSON.parse(raw);
const [, , vw, vh] = vb.split(/\s+/).map(Number);
const W = r2(vw * S), H = r2(vh * S);
console.log(`pot viewBox=${vb}  → repère interne ${W}×${H} px`);
console.log('broches (px):', pins.map(p => `${p.name}(${r2(p.x)},${r2(p.y)})`).join('  '));

const COL = { VCC: '#c00', GND: '#111', SIG: '#06c' };
const dots = pins.map((p, i) => {
  const cx = r2(p.x), cy = r2(p.y), ty = cy - (i % 2 ? 12 : 5);
  const c = COL[p.name] || '#c00';
  return `    <g>\n` +
    `      <circle cx="${cx}" cy="${cy}" r="2.5" fill="${c}" stroke="none"/>\n` +
    `      <text x="${cx}" y="${ty}" font-size="6" fill="${c}" text-anchor="middle" font-family="sans-serif">${p.name}</text>\n` +
    `    </g>`;
}).join('\n');

const svg =
`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" version="1.1">
  <!-- ====================================================================
       BASE DE RETOUCHE — schéma interne du potentiomètre
       Repère interne (px) = mm de l'élément × 96/25,4 (pinScale = 1).
       À DESSINER dans le groupe #schema : symbole IEC = boîte résistive entre
       VCC et GND + curseur (flèche) depuis SIG sur le milieu de la boîte.
       Le corps (#body) et les repères (#pins-reference) NE SONT PAS exportés
       (calage seul). Garder les tracés en noir dans #schema.
       ==================================================================== -->
  <rect id="body" x="0" y="0" width="${W}" height="${H}" rx="6" ry="6" fill="rgba(255,255,255,0.8)" stroke="#bbb" stroke-width="0.5"/>
  <!-- ===== À ÉDITER : tracés noirs (symbole pot) ===== -->
  <g id="schema" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- dessiner ici -->
  </g>
  <!-- ===== Repères de broches (VCC rouge, GND noir, SIG bleu) : NE PAS exporter ===== -->
  <g id="pins-reference">
${dots}
  </g>
</svg>
`;
writeFileSync(join(OUT, 'pot-schema.edit.svg'), svg);
console.log(`✓ svg/pot-schema.edit.svg (${W}×${H})`);
