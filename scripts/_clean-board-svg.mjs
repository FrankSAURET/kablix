// TEMP/outil — extrait le DESSIN d'un « svg retouche/<type>.edit.svg » (retouché à
// la main : dessin Wokwi repositionné sur grille + ronds de broches) vers un SVG
// minimal embarqué : src/webview/elements/boards/<type>.svg. Retire les ronds de
// broches (circle/ellipse id="pin-*"), leurs libellés rouges, la grille, le
// namedview ; garde le dessin + ses defs. viewBox conservé (= repère des broches).
// Usage : node scripts/_clean-board-svg.mjs mega [uno ...]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });
const OUTDIR = join(ROOT, 'src/webview/elements/boards');
mkdirSync(OUTDIR, { recursive: true });
const RETOUCHE = join(ROOT, 'svg retouche');

const types = process.argv.slice(2);
if (types.length === 0) { console.error('Usage: node scripts/_clean-board-svg.mjs <type> [...]'); process.exit(1); }

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
for (const t of types) {
  const svg = readFileSync(join(RETOUCHE, findSvg(t)), 'utf8').replace(/<\?xml[^>]*\?>/, '');
  bodies += `<div class="wrap" data-type="${t}">${svg}</div>`;
}
const script = `
try {
const out = [];
for (const wrap of document.querySelectorAll('.wrap')) {
  const svg = wrap.querySelector('svg');
  // Ronds de broches + leurs libellés (texte rouge).
  svg.querySelectorAll('circle[id^="pin-"],ellipse[id^="pin-"]').forEach(e => e.remove());
  svg.querySelectorAll('text').forEach(t => {
    const f = (t.getAttribute('fill') || t.style.fill || '').toLowerCase();
    if (/#a00|#aa0000|#c00|#cc0000|#e00|#ee0000|rgb\\(170|red/.test(f)) t.remove();
  });
  // Grille éventuelle (lignes bleu clair) + repères group.
  svg.querySelectorAll('line').forEach(l => {
    const s = (l.getAttribute('stroke') || '').toLowerCase();
    if (s === '#cfe3ff' || s === '#7fb0ff') l.remove();
  });
  ['#grid','#pins','#pins-reference','#key-guides'].forEach(id => { const e = svg.querySelector(id); if (e) e.remove(); });
  // Éléments à namespace inkscape:/sodipodi: (namedview, path-effect dans defs…).
  [...svg.querySelectorAll('*')].forEach(e => { if (/^(inkscape|sodipodi):/i.test(e.tagName)) e.remove(); });
  const strip = (el) => { for (const a of [...el.attributes]) if (/^(inkscape|sodipodi):/.test(a.name)) el.removeAttribute(a.name); for (const c of el.children) strip(c); };
  strip(svg);
  out.push({ type: wrap.dataset.type, vb: svg.getAttribute('viewBox'), w: svg.getAttribute('width'), h: svg.getAttribute('height'), inner: svg.innerHTML });
}
document.getElementById('result').textContent = JSON.stringify(out);
} catch(e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;
const htmlPath = join(SCRATCH, 'cleanboard.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body>${bodies}<pre id="result"></pre><script>${script}</script></body>`);
const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
const dom = execFileSync(chrome, ['--headless','--disable-gpu','--no-sandbox','--virtual-time-budget=20000','--dump-dom',`file:///${htmlPath.replace(/\\/g,'/')}`], { encoding:'utf8', maxBuffer:128*1024*1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
const raw = dom.slice(a0, b0).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0,1500)); process.exit(1); }
for (const r of JSON.parse(raw)) {
  const file = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.vb}">${r.inner}</svg>\n`;
  writeFileSync(join(OUTDIR, `${r.type}.svg`), file);
  console.log(`  ✓ src/webview/elements/boards/${r.type}.svg  (viewBox ${r.vb}, ${(file.length/1024).toFixed(0)} Ko)`);
}
