// Vérifie la GÉOMÉTRIE des deux poses de la résistance dans le vrai éditeur
// (Chrome headless, vrai CSS) :
//   • couchée ('h') : dessin 80×20, pastilles à (10,10) et (70,10) ;
//   • debout ('v')  : dessin ÉCRASÉ DE MOITIÉ en hauteur — le dessin source de
//     Frank (40×70) tient dans une boîte de 40×35, ce qui ramène l'encombrement
//     visible de 26 × 53 à 26 × 26,5 (« 60 × 30 » → « 30 × 30 » sur la grille).
//     L'écrasement ne touche QUE la hauteur : la largeur du corps ne bouge pas,
//     et elle reste égale à la hauteur du corps couché — c'est la même pièce
//     regardée de plus haut, pas une pièce plus fine.
//   • les pastilles restent sur la grille de 10 px (y = 60 → 30), donc aucun fil
//     ne se retrouve entre deux carreaux ;
//   • le symbole interne suit la boîte écrasée (il est mis à l'échelle) ;
//   • changer de pose et revenir ne laisse rien derrière (dessin, pastilles,
//     anneaux de couleur).
// Sans l'écrasement (v2026.8.70 et avant) : 8 échecs sur 14.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(ROOT, 'node_modules', '.cache-resistance');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/resistor-element.mjs';
// Dessin SOURCE de la pose debout : sert de référence NON écrasée. Le banc ne
// compare donc pas à des nombres écrits à la main, mais au dessin de Frank.
import resVert from '../../src/webview/composants/externe/res-vert.svg';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const r2 = (v) => +v.toFixed(2);

/** Union des tracés d'un <svg>, en px, relative au coin haut-gauche du svg. */
function tracesOf(svg) {
  const sr = svg.getBoundingClientRect();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of svg.querySelectorAll('path,rect,circle,use,line,polygon,ellipse')) {
    const b = n.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top);
    x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom);
  }
  return { w: r2(x1 - x0), h: r2(y1 - y0), x: r2(x0 - sr.left), y: r2(y0 - sr.top),
    boite: { w: r2(sr.width), h: r2(sr.height) } };
}

async function run() {
  const editor = new Editor(
    document.getElementById('canvas'), document.getElementById('palette'),
    document.getElementById('wires'), document.getElementById('inspector'));

  // Géométrie du composant posé : son svg, ses tracés, ses pastilles (repère du svg).
  const geo = () => {
    const cont = [...document.querySelectorAll('.part')].pop();
    const el = cont.querySelector('.part__body').firstElementChild;
    const svg = el.shadowRoot.querySelector('svg');
    const sr = svg.getBoundingClientRect();
    const g = tracesOf(svg);
    g.pins = [...cont.querySelectorAll('.pin')].map((d) => {
      const b = d.getBoundingClientRect();
      return { x: r2(b.left + b.width / 2 - sr.left), y: r2(b.top + b.height / 2 - sr.top) };
    }).sort((a, b) => a.x - b.x || a.y - b.y);
    return g;
  };
  const fmt = (g) => 'boîte ' + g.boite.w + '×' + g.boite.h + ', dessin ' + g.w + '×' + g.h
    + ' en ' + g.x + ',' + g.y + ', pastilles ' + g.pins.map((p) => p.x + ',' + p.y).join(' ');
  const grille = (g) => g.pins.length === 2 && g.pins.every((p) => p.x % 10 === 0 && p.y % 10 === 0);
  // Corps seul (le cylindre coloré, id « body » dans les deux dessins), sans les pattes.
  const corps = () => {
    const cont = [...document.querySelectorAll('.part')].pop();
    const el = cont.querySelector('.part__body').firstElementChild;
    const b = el.shadowRoot.querySelector('#body').getBoundingClientRect();
    return { w: r2(b.width), h: r2(b.height) };
  };

  // --- Référence : le dessin source, rendu dans SON viewBox (40×70) ----------
  const ref = document.createElement('div');
  ref.style.cssText = 'position:absolute;left:0;top:0';
  ref.innerHTML = '<svg width="40" height="70" viewBox="0 0 40 70">' + resVert + '</svg>';
  document.body.appendChild(ref);
  await wait(60);
  const source = tracesOf(ref.querySelector('svg'));

  // --- Pose couchée ----------------------------------------------------------
  const part = editor.addPart('resistor', 200, 200);
  await wait(150);
  const h = geo();
  ok('couchée : dessin 80×20, pastilles à (10,10) et (70,10)',
    Math.round(h.boite.w) === 80 && h.boite.h === 20
    && h.pins.length === 2 && h.pins[0].x === 10 && h.pins[0].y === 10
    && h.pins[1].x === 70 && h.pins[1].y === 10, fmt(h));
  ok('couchée : le corps mesure 60 px de long', Math.abs(h.w - 60) < 1, h.w + ' px');
  const corpsH = corps();

  // --- Pose debout -----------------------------------------------------------
  editor.updatePartAttr(part.id, 'orientation', 'v');
  await wait(150);
  const v = geo();
  ok('debout : boîte 40×35 (le dessin source de 40×70 écrasé de moitié)',
    v.boite.w === 40 && v.boite.h === 35, fmt(v));
  ok('debout : pastilles à (10,30) et (30,30), sur la grille de 10 px',
    grille(v) && v.pins[0].x === 10 && v.pins[0].y === 30 && v.pins[1].x === 30 && v.pins[1].y === 30,
    v.pins.map((p) => p.x + ',' + p.y).join(' '));
  ok('debout : l’encombrement tient dans 30 × 30 px',
    v.w <= 30 && v.h <= 30, v.w + '×' + v.h);
  ok('debout : moitié de la hauteur du dessin source (' + source.h + ' → ' + v.h + ')',
    Math.abs(v.h - source.h / 2) < 0.5, 'source ' + source.w + '×' + source.h);
  ok('debout : la largeur, elle, n’a pas bougé (écrasement vertical PUR)',
    Math.abs(v.w - source.w) < 0.5, 'source ' + source.w + ', posée ' + v.w);
  // Le raccourci ne doit pas AMAIGRIR la pièce : debout, le cylindre est vu par
  // le bout, sa largeur reste donc le diamètre qu'il a couché.
  const corpsV = corps();
  ok('debout : le corps garde le diamètre de la pose couchée ('
    + corpsH.h + ' → ' + corpsV.w + ')', Math.abs(corpsV.w - corpsH.h) < 0.5,
    'couché ' + corpsH.w + '×' + corpsH.h + ', debout ' + corpsV.w + '×' + corpsV.h);
  ok('debout : le corps est deux fois plus court qu’il n’était long couché',
    corpsV.h < corpsH.w / 2 + 1, 'long couché ' + corpsH.w + ', haut debout ' + corpsV.h);

  // --- Le symbole interne suit la boîte écrasée ------------------------------
  editor.select({ kind: 'part', id: part.id });
  editor.toggleInternalWiring(part.id);
  await wait(150);
  const overlay = document.querySelector('.part__internal');
  const osvg = overlay?.querySelector('svg');
  // Le symbole seul : le <g> des traits, sans le fond blanc qui couvre la boîte.
  const sr = osvg?.getBoundingClientRect();
  const gr = osvg?.querySelector('g')?.getBoundingClientRect();
  const inner = sr && gr
    ? { w: r2(gr.width), h: r2(gr.height), x: r2(gr.left - sr.left), y: r2(gr.top - sr.top),
        boite: { w: r2(sr.width), h: r2(sr.height) } }
    : null;
  ok('vue interne : l’overlay a la taille de la boîte écrasée (40×35)',
    !!inner && inner.boite.w === 40 && inner.boite.h === 35,
    inner ? inner.boite.w + '×' + inner.boite.h : 'aucun overlay');
  ok('vue interne : le symbole est écrasé avec le dessin (il ne déborde pas)',
    !!inner && inner.h <= 35 && inner.w <= 40, inner ? inner.w + '×' + inner.h : '—');
  ok('vue interne : le symbole descend jusqu’aux pastilles',
    !!inner && Math.abs(inner.y + inner.h - 30) <= 2,
    inner ? 'bas à ' + r2(inner.y + inner.h) : '—');
  editor.toggleInternalWiring(part.id);
  await wait(60);

  // --- Retour à la pose couchée ---------------------------------------------
  editor.updatePartAttr(part.id, 'orientation', 'h');
  await wait(150);
  const retour = geo();
  ok('retour couchée : dessin 80×20 et pastilles à y = 10',
    Math.round(retour.boite.w) === 80 && retour.boite.h === 20
    && retour.pins.every((p) => p.y === 10), fmt(retour));

  // --- Les anneaux de couleur survivent au changement de pose ---------------
  editor.updatePartAttr(part.id, 'value', '4700');
  editor.updatePartAttr(part.id, 'orientation', 'v');
  await wait(150);
  const cont = [...document.querySelectorAll('.part')].pop();
  const el = cont.querySelector('.part__body').firstElementChild;
  const bandes = ['#rect19', '#path19-0', '#path20-1']
    .map((s) => el.shadowRoot.querySelector(s)?.getAttribute('fill'));
  // 4700 Ω = jaune, violet, rouge.
  ok('debout : les anneaux disent la valeur (4,7 kΩ → jaune, violet, rouge)',
    bandes[0] === '#FCF800' && bandes[1] === '#A803D6' && bandes[2] === '#FB0000', bandes.join(' '));

  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify(checks);
  document.body.appendChild(out);
}
run().catch((e) => {
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
  document.body.appendChild(out);
});
`;

console.log('Géométrie de la résistance (Chrome headless) :');
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">`
  + `<div class="workshop"><aside id="palette" class="palette"></aside>`
  + `<div id="canvas" class="canvas" style="width:800px;height:600px"><svg id="wires" class="wires"></svg></div>`
  + `<aside id="inspector" class="inspector"></aside></div>`
  + `<script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
  console.log('  – Chrome introuvable, géométrie non vérifiée');
} else {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom',
    `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) check('mesures relevées', false, 'aucune mesure dans le DOM');
  else for (const r of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))) {
    check(r.name, r.ok, r.detail);
  }
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
