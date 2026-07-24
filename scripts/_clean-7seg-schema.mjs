// TEMP — nettoie les schémas de câblage interne 7 segments dessinés dans Inkscape
// (src/webview/composants/interne/7seg*.schema*.svg) → SVG minimal embarquable :
// retire pastilles de broche (circle id=pin-*) + leurs textes, rects (repères/
// patterns), defs (path-effects), namedview, attributs inkscape/sodipodi.
// Garde le viewBox (= repère du corps) + le schéma (diodes + pistes colorées).
// Écrit des fichiers *.clean.svg à côté. À relancer si Frank retouche les SVG.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-7seg');
mkdirSync(SCRATCH, { recursive: true });
const INT = 'src/webview/composants/interne';

const JOBS = [
  { src: `${INT}/7seg-schema.edit.svg`, out: `${INT}/7seg-schema.clean.svg`, digits: 1 },
  { src: `${INT}/7seg-2dig.schema.edit.svg`, out: `${INT}/7seg-2dig.schema.clean.svg`, digits: 2 },
  { src: `${INT}/7seg-4dig-schema.edit.svg`, out: `${INT}/7seg-4dig-schema.clean.svg`, digits: 4 },
];

// Noms des segments a-g posés au centre de chaque diode (gras #FF6075). Ces
// labels n'existent PAS dans les .edit.svg — ils sont réinjectés ici après le
// nettoyage (qui supprime tous les <text>). Sans ça, les lettres a-g des schémas
// disparaissent à chaque régénération (régression v2026.7.162). Positions du
// digit 1 ci-dessous ; les digits 2-4 sont décalés d'un PAS constant en X.
// Le schéma 4 digits AVEC horloge (7seg-4dig-clock) partage EXACTEMENT ces
// positions (mêmes triangles) mais est généré à la main : y coller le même bloc.
const SEG_D1 = [
  ['a', 28.92, 19.33], ['b', 40.61, 31.75], ['c', 35.77, 57.43], ['d', 22.3, 70],
  ['e', 10.01, 57.43], ['f', 14.8, 31.67], ['g', 26.07, 44.43],
];
const DIGIT_DX = [0, 50.49, 99.51, 150]; // décalage X du digit 1,2,3,4 (mesuré)
function segLabels(digits) {
  let out = '  <!-- Noms des segments (a-g) posés au centre de chaque diode, gras #FF6075. -->\n';
  out += '  <g id="seg-labels" fill="#FF6075" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle" dominant-baseline="central" style="stroke:none;pointer-events:none">\n';
  for (let d = 0; d < digits; d++)
    for (const [c, x, y] of SEG_D1)
      out += `    <text x="${(x + DIGIT_DX[d]).toFixed(2)}" y="${y}">${c}</text>\n`;
  out += '  </g>\n';
  return out;
}

let bodies = '';
for (const j of JOBS) {
  const svg = readFileSync(join(ROOT, j.src), 'utf8').replace(/<\?xml[^>]*\?>/, '');
  bodies += `<div class="wrap" data-out="${j.out}" data-digits="${j.digits}">${svg}</div>`;
}
const script = `
try {
const out = [];
for (const wrap of document.querySelectorAll('.wrap')) {
  const svg = wrap.querySelector('svg');
  svg.querySelectorAll('[id^="pin-"]').forEach((e) => e.remove());          // pastilles de broche
  svg.querySelectorAll('text').forEach((e) => e.remove());                  // labels de broche
  svg.querySelectorAll('rect').forEach((e) => e.remove());                  // repères / fonds pattern
  svg.querySelectorAll('defs').forEach((e) => e.remove());                  // path-effects inkscape + patterns
  // Traits anormalement épais (artefacts Inkscape : doublon d'un fil fin sans
  // couleur de stroke → rendu en gros trait noir). On les supprime.
  svg.querySelectorAll('path, line').forEach((e) => {
    const sw = parseFloat((e.getAttribute('style') || '').match(/stroke-width:\\s*([\\d.]+)/)?.[1] || e.getAttribute('stroke-width') || '0');
    if (sw > 5) e.remove();
  });
  svg.querySelectorAll('sodipodi\\\\:namedview, namedview').forEach((e) => e.remove());
  // Retire les groupes désormais vides (anciens conteneurs de broches).
  let removed = true;
  while (removed) { removed = false; svg.querySelectorAll('g').forEach((g) => { if (g.children.length === 0) { g.remove(); removed = true; } }); }
  const strip = (el) => { for (const a of [...el.attributes]) if (/^(inkscape|sodipodi):/.test(a.name)) el.removeAttribute(a.name); for (const c of el.children) strip(c); };
  strip(svg);
  const vb = svg.getAttribute('viewBox');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  out.push({ out: wrap.dataset.out, digits: wrap.dataset.digits, vb, inner: svg.innerHTML });
}
document.getElementById('result').textContent = JSON.stringify(out);
} catch (e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;
const htmlPath = join(SCRATCH, 'clean.html');
writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><body>${bodies}<pre id="result"></pre><script>${script}</script></body>`);
const cand = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter((c) => existsSync(c));
const chrome = cand[0];
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const i = dom.indexOf('<pre id="result">'), j = dom.indexOf('</pre>', i);
const raw = dom.slice(i + 17, j).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR:') || !raw.trim()) { console.error('Echec:', raw.slice(0, 2000)); process.exit(1); }
for (const r of JSON.parse(raw)) {
  const file = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.vb}">${r.inner}${segLabels(+r.digits)}</svg>\n`;
  writeFileSync(join(ROOT, r.out), file);
  console.log(`  ✓ ${r.out}  (viewBox ${r.vb}, ${file.length} o)`);
}
