// TEMP — nettoie « svg/keypad*-schema.edit.svg » (dessin du câblage interne fait
// dans Inkscape) → SVG minimal embarqué dans src/webview/elements/ :
// retire corps, guides de touches (rects), repères de broches, namedview, defs
// (path-effects inkscape : inutiles au rendu, le `d` est déjà résolu) et commentaires.
// Garde le viewBox (= repère interne) + les tracés (interrupteurs + bus). À supprimer.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });

const JOBS = [
  { src: 'svg/keypad-schema.edit.svg', out: 'src/webview/elements/keypad-schema.svg' },
  { src: 'svg/keypad-3col-schema.edit.svg', out: 'src/webview/elements/keypad-3col-schema.svg' },
];

let bodies = '';
for (const j of JOBS) {
  const svg = readFileSync(join(ROOT, j.src), 'utf8').replace(/<\?xml[^>]*\?>/, '');
  bodies += `<div class="wrap" data-out="${j.out}">${svg}</div>`;
}
const script = `
try {
const out = [];
for (const wrap of document.querySelectorAll('.wrap')) {
  const svg = wrap.querySelector('svg');
  // Retire les éléments non exportés.
  svg.querySelectorAll('rect').forEach((e) => e.remove());                 // corps + guides
  const pr = svg.querySelector('#pins-reference'); if (pr) pr.remove();    // repères broches
  svg.querySelectorAll('defs').forEach((e) => e.remove());                 // path-effects inkscape
  svg.querySelectorAll('sodipodi\\\\:namedview, namedview').forEach((e) => e.remove());
  // Nettoie attributs inkscape/sodipodi.
  const strip = (el) => { for (const a of [...el.attributes]) if (/^(inkscape|sodipodi):/.test(a.name)) el.removeAttribute(a.name); for (const c of el.children) strip(c); };
  strip(svg);
  svg.removeAttribute('width'); svg.removeAttribute('height');
  out.push({ out: wrap.dataset.out, vb: svg.getAttribute('viewBox'), inner: svg.innerHTML });
}
document.getElementById('result').textContent = JSON.stringify(out);
} catch (e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;
const htmlPath = join(SCRATCH, 'clean.html');
writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><body>${bodies}<pre id="result"></pre><script>${script}</script></body>`);

const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const i = dom.indexOf('<pre id="result">'), j = dom.indexOf('</pre>', i);
const raw = dom.slice(i + 17, j).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR:') || !raw.trim()) { console.error('Echec:', raw.slice(0, 2000)); process.exit(1); }
for (const r of JSON.parse(raw)) {
  const file = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.vb}">${r.inner}</svg>\n`;
  writeFileSync(join(ROOT, r.out), file);
  console.log(`  ✓ ${r.out}  (viewBox ${r.vb}, ${file.length} o)`);
}
