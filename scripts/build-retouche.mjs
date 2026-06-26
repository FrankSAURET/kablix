// Génère des SVG de retouche de brochage (« svg retouche/<nom>.edit.svg ») pour
// les composants @wokwi/elements — y compris leurs SOUS-VARIANTES dont la position
// des broches change (clavier 3×4 vs 4×4, LCD I²C / parallèle / 20×4…).
//
// Chaque fichier contient : le dessin RÉEL du composant (rendu via Chrome headless
// puis mis à l'échelle 96 dpi × pinScale, comme Kablix), une grille de 10 px
// (croisements foncés tous les 50 px) et une pastille rouge `id="pin-<nom>"` par
// broche, posée exactement là où Kablix la place (marge 20 + pinInfo × pinScale).
// L'utilisateur déplace les pastilles sur les croisements puis reporte les
// positions dans `src/webview/diagram/pin-overrides.mts`.
//
// Usage : node scripts/build-retouche.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'svg retouche');
mkdirSync(OUT, { recursive: true });

const S = 96 / 25.4; // px par mm (96 dpi) — facteur de rendu des éléments Wokwi
const PIN_SCALE_95 = 10 / 9.5; // même facteur d'échelle des broches que catalog.mts
const MARGIN = 20;
const PAD_R = 3.2;

// Variantes à produire. `module` = fichier élément à importer ; `tag` = balise ;
// `attrs` = attributs déclenchant la variante ; `pinScale` = facteur d'échelle des
// broches appliqué par Kablix (catalog.mts). Les fichiers déjà retouchés à la main
// ne sont PAS écrasés (on n'écrit que ce qui manque, sauf --force).
// Note : le clavier 4 colonnes (keypad.edit.svg) et le LCD parallèle 16×2
// (lcd.edit.svg) existent déjà (générés/retouchés) — on ne liste ici que les
// variantes manquantes. Ajouter `--force` pour tout réécrire (formule validée :
// keypad 4col → R1 (120,358) et LCD parallèle 16×2 → VSS (53.68,157.86),
// identiques aux fichiers existants).
const VARIANTS = [
  {
    name: 'keypad-3col',
    module: 'membrane-keypad-element.js',
    tag: 'wokwi-membrane-keypad',
    attrs: { columns: '3', connector: 'true' },
    pinScale: 1,
  },
  {
    name: 'lcd-i2c',
    module: 'lcd1602-element.js',
    tag: 'wokwi-lcd1602',
    attrs: { pins: 'i2c' },
    pinScale: PIN_SCALE_95,
  },
  {
    name: 'lcd', // LCD parallèle 16×2 (HD44780, 16 broches)
    module: 'lcd1602-element.js',
    tag: 'wokwi-lcd1602',
    attrs: { pins: 'full' },
    pinScale: PIN_SCALE_95,
  },
  {
    name: 'lcd-parallel-20x4',
    module: 'lcd1602-element.js',
    tag: 'wokwi-lcd1602',
    attrs: { pins: 'full' },
    props: { numCols: 20, numRows: 4 }, // propriétés (non réactives en attribut)
    pinScale: PIN_SCALE_95,
  },
  // Afficheur 7 segments : le brochage change avec le nombre de chiffres (le
  // 1 chiffre existe déjà sous 7seg.edit.svg). Options du catalogue : 1 / 2 / 4.
  {
    name: '7seg-2dig',
    module: '7segment-element.js',
    tag: 'wokwi-7segment',
    props: { digits: 2 },
    pinScale: 1,
  },
  {
    name: '7seg-4dig',
    module: '7segment-element.js',
    tag: 'wokwi-7segment',
    props: { digits: 4 },
    pinScale: 1,
  },
];

const force = process.argv.includes('--force');
const todo = VARIANTS.filter((v) => force || !existsSync(join(OUT, `${v.name}.edit.svg`)));
if (todo.length === 0) {
  console.log('Rien à générer (tous les fichiers existent — utiliser --force pour réécrire).');
  process.exit(0);
}

// 1) Bundle navigateur : importe les modules d'éléments puis rend chaque variante
//    et publie {viewBox, inner, pinInfo} dans #result.
const modules = [...new Set(todo.map((v) => v.module))];
const entry = `
${modules.map((m) => `import '@wokwi/elements/dist/esm/${m}';`).join('\n')}
const SPECS = ${JSON.stringify(todo.map((v) => ({ name: v.name, tag: v.tag, attrs: v.attrs, props: v.props })))};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const out = [];
  for (const s of SPECS) {
    const el = document.createElement(s.tag);
    for (const [k, v] of Object.entries(s.attrs || {})) el.setAttribute(k, v);
    for (const [k, v] of Object.entries(s.props || {})) el[k] = v;
    document.body.appendChild(el);
    try {
      if (el.updateComplete) await el.updateComplete;
    } catch (e) {}
    await wait(60);
    const svg = el.shadowRoot && el.shadowRoot.querySelector('svg');
    out.push({
      name: s.name,
      viewBox: svg ? svg.getAttribute('viewBox') : null,
      width: svg ? svg.getAttribute('width') : null,
      height: svg ? svg.getAttribute('height') : null,
      inner: svg ? svg.innerHTML : '',
      pinInfo: (el.pinInfo || []).map((p) => ({ name: p.name, x: p.x, y: p.y })),
    });
  }
  document.getElementById('result').textContent = JSON.stringify(out);
}
run().catch((e) => {
  document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e);
});
`;

const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });
const entryPath = join(SCRATCH, 'entry.mjs');
writeFileSync(entryPath, entry);

const bundle = await esbuild({
  entryPoints: [entryPath],
  bundle: true,
  format: 'iife',
  write: false,
  loader: { '.svg': 'text' },
});
const js = bundle.outputFiles[0].text;

const htmlPath = join(SCRATCH, 'page.html');
writeFileSync(
  htmlPath,
  `<!doctype html><meta charset="utf-8"><body><pre id="result"></pre><script>${js}</script></body>`
);

// 2) Chrome headless : rend la page puis sérialise le DOM (#result contient le JSON).
const chrome = findChrome();
const dom = execFileSync(
  chrome,
  ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
const raw = between(dom, '<pre id="result">', '</pre>');
if (!raw) throw new Error('Aucun résultat capturé depuis Chrome (rendu échoué ?)');
const results = JSON.parse(unescapeHtml(raw));

// 3) Assemblage des .edit.svg.
for (const v of todo) {
  const r = results.find((x) => x.name === v.name);
  if (!r || !r.viewBox) {
    console.warn(`  ✗ ${v.name} : pas de rendu`);
    continue;
  }
  const svg = assembleEdit(v, r);
  const outPath = join(OUT, `${v.name}.edit.svg`);
  writeFileSync(outPath, svg);
  console.log(`  ✓ svg retouche/${v.name}.edit.svg (${r.pinInfo.length} broches)`);
}
console.log('Terminé.');

// ---------------------------------------------------------------------------

/** Construit le SVG de retouche d'une variante à partir du rendu Wokwi. */
function assembleEdit(spec, r) {
  const [vx, vy, vw, vh] = r.viewBox.trim().split(/[\s,]+/).map(Number);
  const boardScale = S * spec.pinScale;
  const W = Math.round(vw * boardScale) + 2 * MARGIN;
  const H = Math.round(vh * boardScale) + 2 * MARGIN;

  const pins = r.pinInfo
    .map((p) => {
      const cx = (MARGIN + p.x * spec.pinScale).toFixed(2);
      const cy = (MARGIN + p.y * spec.pinScale).toFixed(2);
      const ty = (Number(cy) - 5).toFixed(2);
      return (
        `<circle id="pin-${p.name}" cx="${cx}" cy="${cy}" r="${PAD_R}" fill="#e00" fill-opacity="0.85" stroke="#700" stroke-width="0.5"/>` +
        `<text x="${cx}" y="${ty}" font-size="5" fill="#a00" text-anchor="middle" font-family="sans-serif">${p.name}</text>`
      );
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n` +
    `  <!-- Retouche brochage ${spec.name} : déplace chaque pastille rouge sur un CROISEMENT (lignes foncées = 50 px). Garde les id pin-<nom>. Marge 20 px. -->\n` +
    `  <rect width="${W}" height="${H}" fill="#fff"/>\n` +
    `  <g id="grid">${grid(W, H)}</g>\n` +
    `  <g id="board" opacity="0.85" transform="translate(${MARGIN},${MARGIN}) scale(${boardScale.toFixed(4)}) translate(${-vx} ${-vy})">${r.inner}</g>\n` +
    `  <g id="pins">${pins}</g>\n` +
    `</svg>\n`
  );
}

/** Lignes de grille (10 px clair, 50 px foncé), horizontales + verticales. */
function grid(W, H) {
  const lines = [];
  for (let x = 0; x <= W; x += 10) {
    const dark = x % 50 === 0;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${dark ? '#7fb0ff' : '#cfe3ff'}" stroke-width="${dark ? 0.7 : 0.4}"/>`);
  }
  for (let y = 0; y <= H; y += 10) {
    const dark = y % 50 === 0;
    lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${dark ? '#7fb0ff' : '#cfe3ff'}" stroke-width="${dark ? 0.7 : 0.4}"/>`);
  }
  return lines.join('');
}

function between(s, a, b) {
  const i = s.indexOf(a);
  if (i < 0) return null;
  const j = s.indexOf(b, i + a.length);
  return j < 0 ? null : s.slice(i + a.length, j);
}

/** Déséchappe les entités HTML d'un texte sérialisé par --dump-dom. */
function unescapeHtml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Localise un exécutable Chrome/Edge sur Windows (ou via CHROME_PATH). */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('Chrome/Edge introuvable — définir CHROME_PATH.');
}
