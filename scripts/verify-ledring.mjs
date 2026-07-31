// Banc de rendu de l'anneau NeoPixel (kablix-led-ring) en Chrome headless.
// Régression v195 : sim.mts écrit `rgb(0,0,0)` sur chaque LED éteinte (couleurs
// décodées de la chaîne WS2812) → l'anneau devenait NOIR au repos alors que le
// dessin retouché a des LED blanches. Attendu maintenant :
//  - LED éteinte  : fill du dessin rétabli (blanc) et AUCUN halo ;
//  - LED allumée  : fill de la couleur + halo drop-shadow de la même couleur,
//    d'autant plus large que la LED est lumineuse ;
//  - reset()      : tout redevient blanc sans halo.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-ledring');
mkdirSync(CACHE, { recursive: true });
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');

const entry = `
import '${SRC}/composants/led-ring-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const ring = document.createElement('kablix-led-ring');
  document.body.appendChild(ring);
  await ring.updateComplete;
  await wait(50);
  const px = (i) => ring.renderRoot.querySelectorAll('rect.pixel')[i];
  const st = (i) => {
    const s = getComputedStyle(px(i));
    return { fill: s.fill, filter: s.filter };
  };
  // Toutes éteintes (ce que fait sim.mts hors allumage), puis 2 allumées.
  for (let i = 0; i < 16; i++) ring.setPixel(i, { r: 0, g: 0, b: 0 });
  const off = st(0);
  ring.setPixel(3, { r: 1, g: 0, b: 0 });
  ring.setPixel(4, { r: 0, g: 0.2, b: 0 });
  ring.setPixel(5, { r: 0, g: 0, b: 0.1 }); // bleu à 10 % : boîtier encore blanc
  const bright = st(3);
  const dim = st(4);
  const faint = st(5);
  // Extinction après allumage : retour au blanc, halo retiré.
  ring.setPixel(3, { r: 0, g: 0, b: 0 });
  const offAgain = st(3);
  ring.setPixel(3, { r: 1, g: 1, b: 1 });
  ring.reset();
  const afterReset = st(3);
  const res = { off, bright, dim, faint, offAgain, afterReset, count: ring.renderRoot.querySelectorAll('rect.pixel').length };
  const pre = document.createElement('pre'); pre.id = 'm'; pre.textContent = JSON.stringify(res); document.body.appendChild(pre);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: join(ROOT, 'scripts'), logLevel: 'silent',
});
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body><script>${b.outputFiles[0].text}</script>`);

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✅' : '❌'} ${label}`); if (!ok) failures++; };
const halo = (s) => /drop-shadow/.test(s.filter ?? '');
/** Rayon du halo le plus large (px) — sert à comparer LED vive / LED faible.
 *  getComputedStyle réordonne le drop-shadow (`rgb(…) 0px 0px 3px`) : on prend
 *  simplement la plus grande longueur du filtre calculé. */
const haloRadius = (s) => Math.max(0, ...[...(s.filter ?? '').matchAll(/([\d.]+)px/g)].map((m) => Number(m[1])));

if (!chrome) {
  console.log('(Chrome introuvable : banc anneau sauté)');
} else {
  const url = 'file:///' + join(CACHE, 'p.html').replace(/\\/g, '/');
  const dom = execFileSync(chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="m"[^>]*>([^<]+)<\/pre>/);
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
  check('anneau : 16 LED dans le dessin', r && r.count === 16);
  check('LED éteinte : BLANCHE (plus de rgb(0,0,0))', r && r.off.fill === 'rgb(255, 255, 255)');
  check('LED éteinte : aucun halo', r && !halo(r.off));
  check('LED allumée : fill de sa couleur', r && r.bright.fill === 'rgb(255, 0, 0)');
  check('LED allumée : halo drop-shadow de sa couleur', r && halo(r.bright) && /rgb\(255, 0, 0\)/.test(r.bright.filter));
  check('halo plus large quand la LED est plus lumineuse', r && haloRadius(r.bright) > haloRadius(r.dim));
  check('LED faible allumée : halo présent quand même', r && halo(r.dim));
  // Boîtier BLANC teinté à basse luminosité (item Frank) : un bleu à 10 % donnait
  // rgb(0,0,26), soit un pixel quasi noir, là où la LED réelle reste blanchâtre.
  const rgbOf = (s) => (String(s.fill).match(/[\d.]+/g) ?? []).map(Number);
  const faint = r ? rgbOf(r.faint) : [];
  check('LED faible : boîtier CLAIR, jamais noirâtre', faint.length === 3 && Math.min(...faint) >= 140);
  check('LED faible : la teinte reste lisible (bleu dominant)',
    faint.length === 3 && faint[2] === 255 && faint[2] > faint[0] + 40);
  const dimRgb = r ? rgbOf(r.dim) : [];
  check('LED faible : plus claire qu une LED vive de la même teinte',
    dimRgb.length === 3 && rgbOf(r.bright)[1] < dimRgb[0]);
  check('LED faible : halo atténué (rgba, pas la couleur pleine)',
    r && /rgba\(/.test(r.faint.filter ?? ''));
  check('extinction après allumage : blanche et sans halo', r && r.offAgain.fill === 'rgb(255, 255, 255)' && !halo(r.offAgain));
  check('reset() : blanche et sans halo', r && r.afterReset.fill === 'rgb(255, 255, 255)' && !halo(r.afterReset));
}

// Garde-fou statique (le rendu headless ne dirait pas d'où vient la couleur).
const src = readFileSync(join(ROOT, 'src/webview/composants/led-ring-element.mts'), 'utf8');
check('led-ring : seuil d\'allumage PIXEL_LIT', /const PIXEL_LIT = /.test(src));
check('led-ring : LED éteinte → fill vidé (couleur du dessin)', /lum <= PIXEL_LIT[\s\S]{0,320}applyStyle\(pixel, '', ''\)/.test(src));
check('led-ring : halo en drop-shadow de la couleur', /const filter =[\s\S]{0,200}drop-shadow[\s\S]{0,120}\$\{glow\}/.test(src));
check('led-ring : teinte séparée de l\'intensité (boîtier fondu vers le blanc)',
  /const hue = \{[\s\S]{0,140}\/ lum/.test(src) && /255 \+ \(c - 255\) \* tint/.test(src));
check('led-ring : reset() vide aussi le halo', /reset\(\)[\s\S]{0,260}applyStyle\(pixel, '', ''\)/.test(src));
// Perf : la simulation repose les 16 couleurs à chaque frame. Réécrire le même
// style invaliderait la peinture des 16 halos pour rien, à chaque frame.
check('led-ring : le style n\'est écrit que s\'il CHANGE',
  /if \(this\.lastStyle\[pixel\] === style\) return;/.test(src));

console.log(failures ? `Anneau NeoPixel : ${failures} échec(s).` : 'Anneau NeoPixel : tous les contrôles passent.');
process.exit(failures ? 1 : 0);
