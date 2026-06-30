// Outil — extrait les surcharges de broches d'un « svg retouche/<type>.edit.svg »
// retouché : centre de chaque rond rouge (id="pin-<nom>") résolu via getCTM dans
// le repère = COIN HAUT-GAUCHE DE LA FEUILLE (viewBox 0,0), SANS marge, position
// telle quelle. C'est la convention v2026.6.48 (mega), à employer pour TOUS les
// dessins retouchés affichés à la place du rendu @wokwi.
//
// Usage : node scripts/_probe-overrides.mjs <type> [<type> ...]
//   <type> = nom de fichier sans « .edit.svg » NI suffixe d'état. On accepte les
//   variantes « <type>.edit.OK.svg » / « .ok » / « .PB » automatiquement.
// Sortie : un bloc TS par type (clé = <type>) imprimé + écrit dans
//   node_modules/.cache-retouche/<type>-override.txt.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });
const RETOUCHE = join(ROOT, 'svg retouche');

const types = process.argv.slice(2);
if (types.length === 0) { console.error('Usage: node scripts/_probe-overrides.mjs <type> [...]'); process.exit(1); }

// Retrouve le fichier réel pour un type (avec/sans suffixe d'état OK/ok/PB).
function findSvg(t) {
  const files = readdirSync(RETOUCHE);
  const exact = `${t}.edit.svg`;
  if (files.includes(exact)) return exact;
  const re = new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.edit\\.(OK|ok|PB)\\.svg$`);
  const m = files.find((f) => re.test(f));
  if (!m) throw new Error(`Aucun SVG pour « ${t} » dans svg retouche/`);
  return m;
}

let bodies = '';
const order = [];
for (const t of types) {
  const file = findSvg(t);
  order.push(t);
  const svg = readFileSync(join(RETOUCHE, file), 'utf8').replace(/<\?xml[^>]*\?>/, '');
  bodies += `<div class="wrap" data-type="${t}">${svg}</div>`;
}

const script = `
try {
const out = [];
for (const wrap of document.querySelectorAll('.wrap')) {
  const svg = wrap.querySelector('svg');
  const dots = [];
  for (const c of svg.querySelectorAll('circle[id^="pin-"],ellipse[id^="pin-"]')) {
    const m = c.getCTM(); if (!m) continue;
    const cx = parseFloat(c.getAttribute('cx')||'0'), cy = parseFloat(c.getAttribute('cy')||'0');
    dots.push({ name: c.id.replace(/^pin-/,''), x: m.a*cx+m.c*cy+m.e, y: m.b*cx+m.d*cy+m.f });
  }
  out.push({ type: wrap.dataset.type, vb: svg.getAttribute('viewBox'), dots });
}
document.getElementById('result').textContent = JSON.stringify(out);
} catch(e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;
const htmlPath = join(SCRATCH, 'probe-ov.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body>${bodies}<pre id="result"></pre><script>${script}</script></body>`);
const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
if (!chrome) { console.error('Chrome/Edge introuvable (définir CHROME_PATH)'); process.exit(1); }
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
const raw = dom.slice(a0, b0).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0, 1500)); process.exit(1); }

const r1 = (n) => Math.round(n);
for (const r of JSON.parse(raw)) {
  const lines = r.dots.map((d) => `    '${d.name}': { x: ${r1(d.x)}, y: ${r1(d.y)} },`);
  const block = `  '${r.type}': {\n${lines.join('\n')}\n  },`;
  writeFileSync(join(SCRATCH, `${r.type}-override.txt`), block);
  console.log(`\n# ${r.type}  (viewBox ${r.vb}, ${r.dots.length} broches) → node_modules/.cache-retouche/${r.type}-override.txt`);
  console.log(block);
}
