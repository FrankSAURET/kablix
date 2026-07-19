// TEMP — sonde géométrique du SVG « 16-Channel PWM Driver(PCA9685) » retouché
// par Frank (media/parts) : centres des connectorNterminal en px rendus. À supprimer.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });

const svg = readFileSync(join(ROOT, 'media/parts/16-Channel PWM Driver(PCA9685).svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');

const script = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const wrap = document.createElement('div');
  wrap.innerHTML = ${JSON.stringify(svg)};
  document.body.appendChild(wrap);
  const svg = wrap.querySelector('svg');
  await wait(50);
  const out = { vb: svg.getAttribute('viewBox'), w: svg.width.baseVal.value, h: svg.height.baseVal.value, terminals: [] };
  for (const el of svg.querySelectorAll('[id$="terminal"]')) {
    const m = el.getCTM(); if (!m) continue;
    const b = el.getBBox();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const x = (m.a * cx + m.c * cy + m.e), y = (m.b * cx + m.d * cy + m.f);
    const n = el.id.replace(/^connector/, '').replace(/terminal$/, '');
    out.terminals.push({ n: +n, x: +(x).toFixed(2), y: +(y).toFixed(2) });
  }
  document.getElementById('result').textContent = JSON.stringify(out);
}
run().catch(e=>document.getElementById('result').textContent='ERR:'+(e&&e.stack||e));
`;
const htmlPath = join(SCRATCH, 'pca.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body><pre id="result"></pre><script>${script}</script></body>`);
const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
const raw = dom.slice(a0, b0).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0, 1500)); process.exit(1); }
const data = JSON.parse(raw);
console.log(`viewBox: ${data.vb}  rendu: ${data.w}x${data.h}`);
console.log(`terminals: ${data.terminals.length}`);
// tri par colonnes x puis y pour lecture humaine
const ts = [...data.terminals].sort((a, b) => (Math.abs(a.x - b.x) > 3 ? a.x - b.x : a.y - b.y));
for (const t of ts) console.log(`  ${String(t.n).padStart(3)}  x=${t.x.toFixed(1).padStart(7)}  y=${t.y.toFixed(1).padStart(7)}`);
writeFileSync(join(SCRATCH, 'pca-probe.json'), raw);
