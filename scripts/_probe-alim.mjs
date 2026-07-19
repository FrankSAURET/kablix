// TEMP — sonde géométrique du SVG « alim » (media/parts) : centres des prises,
// boîtes du bouton/cadran/écran/LED/textes, viewBox. À supprimer après intégration.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });

const svg = readFileSync(join(ROOT, 'media/parts/alim.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');

const script = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const wrap = document.createElement('div');
  wrap.innerHTML = ${JSON.stringify(svg)};
  document.body.appendChild(wrap);
  const svg = wrap.querySelector('svg');
  await wait(50);
  const vb = svg.viewBox.baseVal;
  const out = { vb: svg.getAttribute('viewBox'), w: svg.width.baseVal.value, h: svg.height.baseVal.value, scale: svg.width.baseVal.value / vb.width, boxes: {} };
  const ids = ['prise-plus','prise-gnd','bouton-tension','cadran-tension','text-tension','text-courant-limite','LED-courant-limite','Ecran','Text-Affichage','base','grid25'];
  for (const id of ids) {
    const el = svg.querySelector('#' + CSS.escape(id));
    if (!el) { out.boxes[id] = null; continue; }
    if (typeof el.getCTM !== 'function') { out.boxes[id] = { tag: el.tagName, nonGraphic: true }; continue; }
    const m = el.getCTM(); const b = el.getBBox();
    const pts = [[b.x,b.y],[b.x+b.width,b.y+b.height]].map(([px,py]) => [m.a*px+m.c*py+m.e, m.b*px+m.d*py+m.f]);
    const x1 = Math.min(pts[0][0],pts[1][0]), x2 = Math.max(pts[0][0],pts[1][0]);
    const y1 = Math.min(pts[0][1],pts[1][1]), y2 = Math.max(pts[0][1],pts[1][1]);
    out.boxes[id] = { x1:+x1.toFixed(2), y1:+y1.toFixed(2), x2:+x2.toFixed(2), y2:+y2.toFixed(2), cx:+((x1+x2)/2).toFixed(2), cy:+((y1+y2)/2).toFixed(2), tag: el.tagName, kids: el.children.length };
  }
  document.getElementById('result').textContent = JSON.stringify(out);
}
run().catch(e=>document.getElementById('result').textContent='ERR:'+(e&&e.stack||e));
`;
const htmlPath = join(SCRATCH, 'alim.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body><pre id="result"></pre><script>${script}</script></body>`);
const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
const raw = dom.slice(a0, b0).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0, 1500)); process.exit(1); }
const data = JSON.parse(raw);
console.log(`viewBox: ${data.vb}  rendu: ${data.w}x${data.h}  échelle: ${data.scale}`);
for (const [id, b] of Object.entries(data.boxes)) {
  if (!b) { console.log(`  ${id}: ABSENT`); continue; }
  if (b.nonGraphic) { console.log(`  ${id} <${b.tag}> NON GRAPHIQUE`); continue; }
  console.log(`  ${id} <${b.tag}> enfants=${b.kids}  boîte (${b.x1},${b.y1})-(${b.x2},${b.y2})  centre (${b.cx},${b.cy})`);
}
