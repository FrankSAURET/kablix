// TEMP — sonde géométrique du SVG « Grove pour Pico Pi » (media/parts) :
// centres des connectorNterminal (repère feuille, px rendus), boîte du
// curseur-switch, viewBox. À supprimer après intégration.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });

const svg = readFileSync(join(ROOT, 'media/parts/Grove pour Pico Pi.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');

const script = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const wrap = document.createElement('div');
  wrap.innerHTML = ${JSON.stringify(svg)};
  document.body.appendChild(wrap);
  const svg = wrap.querySelector('svg');
  await wait(50);
  // échelle viewBox -> px rendus
  const vb = svg.viewBox.baseVal;
  const scale = svg.width.baseVal.value / vb.width;
  const out = { vb: svg.getAttribute('viewBox'), w: svg.width.baseVal.value, h: svg.height.baseVal.value, scale, terminals: [], pinsOnly: [], sw: null };
  const seen = new Set();
  for (const el of svg.querySelectorAll('[id$="terminal"]')) {
    const m = el.getCTM(); if (!m) continue;
    const b = el.getBBox();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const x = (m.a * cx + m.c * cy + m.e), y = (m.b * cx + m.d * cy + m.f);
    const n = el.id.replace(/^connector/, '').replace(/terminal$/, '');
    seen.add(n);
    out.terminals.push({ n: +n, x: +(x).toFixed(2), y: +(y).toFixed(2) });
  }
  // pins sans terminal (au cas où)
  for (const el of svg.querySelectorAll('[id^="connector"][id$="pin"]')) {
    const n = el.id.replace(/^connector/, '').replace(/pin$/, '');
    if (seen.has(n)) continue;
    const m = el.getCTM(); if (!m) continue;
    const b = el.getBBox();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    out.pinsOnly.push({ n: +n, x: +(m.a*cx+m.c*cy+m.e).toFixed(2), y: +(m.b*cx+m.d*cy+m.f).toFixed(2) });
  }
  const sw = svg.querySelector('#curseur-switch');
  if (sw) {
    const m = sw.getCTM(); const b = sw.getBBox();
    const pts = [[b.x,b.y],[b.x+b.width,b.y+b.height]].map(([px,py]) => [m.a*px+m.c*py+m.e, m.b*px+m.d*py+m.f]);
    out.sw = { x1:+pts[0][0].toFixed(2), y1:+pts[0][1].toFixed(2), x2:+pts[1][0].toFixed(2), y2:+pts[1][1].toFixed(2) };
  }
  document.getElementById('result').textContent = JSON.stringify(out);
}
run().catch(e=>document.getElementById('result').textContent='ERR:'+(e&&e.stack||e));
`;
const htmlPath = join(SCRATCH, 'grove.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body><pre id="result"></pre><script>${script}</script></body>`);
const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
const raw = dom.slice(a0, b0).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0, 1500)); process.exit(1); }
const data = JSON.parse(raw);
console.log(`viewBox: ${data.vb}  rendu: ${data.w}x${data.h}  échelle: ${data.scale}`);
console.log(`terminals: ${data.terminals.length}  pins sans terminal: ${data.pinsOnly.length}`);
console.log('switch:', JSON.stringify(data.sw));
// tri par position (lignes puis colonnes) pour lecture humaine
const ts = [...data.terminals].sort((a, b) => a.n - b.n);
for (const t of ts) console.log(`  ${String(t.n).padStart(3)}  x=${t.x.toFixed(1).padStart(7)}  y=${t.y.toFixed(1).padStart(7)}`);
if (data.pinsOnly.length) {
  console.log('--- pins sans terminal ---');
  for (const t of data.pinsOnly.sort((a,b)=>a.n-b.n)) console.log(`  ${String(t.n).padStart(3)}  x=${t.x.toFixed(1).padStart(7)}  y=${t.y.toFixed(1).padStart(7)}`);
}
writeFileSync(join(SCRATCH, 'grove-probe.json'), raw);
