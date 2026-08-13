// Outil — extrait un composant dessiné par Frank dans « Composants2D.svg » (planche
// Inkscape A3, unités mm) vers un SVG autonome en PIXELS de la grille 10 px :
// src/webview/composants/externe/<nom>.svg (dessin externe) et
// src/webview/composants/interne/<nom>-interne.svg (schéma interne, si le groupe
// « <nom>-interne » existe).
//
// Conventions de la planche (cf. CLAUDE.md) :
//   - un composant = un groupe dont l'id est le nom du composant ;
//   - les PASTILLES ROUGES (cercles fill #ee0000) marquent les points de
//     connexion ; le texte juste au-dessus donne le NOM de la patte (nc = non
//     connecté). Pastilles et libellés sont des repères : retirés du dessin livré
//     (--garde-libelles laisse les noms, pour un bornier où ils sont dessinés) ;
//   - 1 px de grille = 0,26458333 mm → facteur mm→px = 3,7795276.
//
// Le cadre livré est choisi pour que chaque pastille tombe sur un multiple de
// 10 px (calage grille) avec au moins 10 px de marge autour.
//
// Boîtiers partagés (TO92…) : un schéma interne peut vivre dans un groupe qui ne
// s'appelle PAS « <nom>-interne » et dont les pastilles portent d'autres noms
// (to92 numérote 1/2/3, NPN1 nomme e/b/c). La syntaxe « NPN1@to92 » extrait NPN1
// comme schéma interne en reprenant le cadre du boîtier to92, les pastilles étant
// appariées par nom puis, à défaut, par position (même ordre haut→bas, gauche→droite).
//
// Usage : node scripts/_extract-composants.mjs diode condo-np ...
//         node scripts/_extract-composants.mjs --png diode   (aperçu PNG seulement)
//         node scripts/_extract-composants.mjs to92 NPN1@to92 --drop=txt-TO92
//         node scripts/_extract-composants.mjs connecteur-servo-patte --garde-libelles
//         node scripts/_extract-composants.mjs NPN1@to92 --drop=path409 --suffix=-libre
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planche } from './_lire-contours.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-composants');
mkdirSync(SCRATCH, { recursive: true });
const EXT_DIR = join(ROOT, 'src/webview/composants/externe');
const INT_DIR = join(ROOT, 'src/webview/composants/interne');

const MM2PX = 1 / 0.26458333;

const args = process.argv.slice(2);
const pngOnly = args.includes('--png');
const DROP = (args.find((a) => a.startsWith('--drop='))?.slice(7) ?? '').split(',').filter(Boolean);
const SUFFIX = args.find((a) => a.startsWith('--suffix='))?.slice(9) ?? '';
// Les noms de pattes sont normalement des REPÈRES, retirés du dessin livré.
// Sur un connecteur (bornier servo…), ils font partie du dessin : Frank écrit
// GND / V+ / PWM sur le boîtier pour qu'on sache où brancher quoi.
const KEEP_LABELS = args.includes('--garde-libelles');
// « NPN1@to92 » → schéma interne NPN1 calé sur le boîtier to92 déjà extrait.
const names = args
  .filter((a) => !a.startsWith('--'))
  .map((a) => {
    const [id, host] = a.split('@');
    return { id, host: host || null };
  });
if (names.length === 0) {
  console.error('Usage: node scripts/_extract-composants.mjs [--png] [--source=f.svg] [--drop=id,…] [--suffix=x] <nom>[@boîtier] [...]');
  process.exit(1);
}
// Un boîtier cité en hôte doit être extrait avant (son cadre sert de référence).
for (const n of names) {
  if (n.host && !names.some((m) => m.id === n.host && !m.host)) {
    console.error(`  ! ${n.id}@${n.host} : ajoutez « ${n.host} » à la ligne de commande, avant.`);
    process.exit(1);
  }
}
names.sort((a, b) => Number(!!a.host) - Number(!!b.host));

// Planche des composants PLATS (`Composants2D.svg` ; l'ancienne planche unique
// `Composants.svg` sert de repli tant qu'elle n'a pas été scindée).
const SRC_FILE = args.find((a) => a.startsWith('--source='))?.slice(9) ?? planche('2D');
const source = readFileSync(join(ROOT, SRC_FILE), 'utf8').replace(/<\?xml[^>]*\?>/, '');

// Le navigateur fait tout le travail géométrique (CTM, getBBox, résolution des
// defs) : impossible à faire correctement en regex côté node.
const script = `
try {
const MM2PX = ${MM2PX};
const NAMES = ${JSON.stringify(names)};
const DROP = ${JSON.stringify(DROP)};
const KEEP_LABELS = ${KEEP_LABELS};
const root = document.querySelector('#board svg');
const out = [];
const isPad = (el) => {
  const f = ((el.getAttribute('fill') || '') + ';' + (el.getAttribute('style') || '')).toLowerCase();
  return el.tagName === 'circle' && /#ee0000|#e00\\b|rgb\\(238/.test(f);
};
function findGroup(id) {
  // Inkscape laisse parfois passer une coquille dans l'id : on accepte le même
  // nom avec un point ou un souligné à la place de N'IMPORTE QUEL tiret
  // (condo.p-1, relais_interne).
  const hit = root.getElementById(id);
  if (hit) return hit;
  for (let i = 0; i < id.length; i++) {
    if (id[i] !== '-') continue;
    for (const sep of ['.', '_']) {
      const alt = id.slice(0, i) + sep + id.slice(i + 1);
      const el = root.querySelector('[id="' + alt + '"]');
      if (el) return el;
    }
  }
  return null;
}
function collect(name, ids, parent, host) {
  let g = null, id = null;
  for (const cand of [].concat(ids)) { g = findGroup(cand); if (g) { id = cand; break; } }
  if (!g) { out.push({ name, missing: [].concat(ids).join(' / ') }); return; }
  name = id;
  const rootCTM = root.getScreenCTM();
  const toRoot = (el, x, y) => {
    const p = root.createSVGPoint(); p.x = x; p.y = y;
    return p.matrixTransform(rootCTM.inverse().multiply(el.getScreenCTM()));
  };
  // Pastilles + libellés : le texte le plus proche AU-DESSUS de la pastille.
  const pads = [];
  const texts = [...g.querySelectorAll('text')].map((t) => {
    const b = t.getBBox();
    const p = toRoot(t, b.x + b.width / 2, b.y + b.height);
    return { el: t, x: p.x, y: p.y, txt: t.textContent.trim() };
  });
  for (const c of [...g.querySelectorAll('circle')].filter(isPad)) {
    const p = toRoot(c, Number(c.getAttribute('cx') || 0), Number(c.getAttribute('cy') || 0));
    let best = null, bestD = 1e9;
    for (const t of texts) {
      const dx = Math.abs(t.x - p.x), dy = p.y - t.y; // texte au-dessus => dy > 0
      if (dx > 2.5 || dy < 0 || dy > 3.5) continue;
      const d = dx * 4 + dy;
      if (d < bestD) { bestD = d; best = t; }
    }
    pads.push({ x: p.x * MM2PX, y: p.y * MM2PX, name: best ? best.txt : '?', el: c, label: best });
  }
  // Clone nettoyé : pastilles, libellés et ids explicitement écartés (--drop).
  const clone = g.cloneNode(true);
  const kill = new Set(DROP);
  for (const p of pads) { kill.add(p.el.getAttribute('id')); if (p.label && !KEEP_LABELS) kill.add(p.label.el.getAttribute('id')); }
  for (const el of [...clone.querySelectorAll('*')]) {
    if (kill.has(el.getAttribute('id'))) el.remove();
  }
  // Groupes devenus vides (le repère pastille+texte était seul dans son groupe).
  let again = true;
  while (again) {
    again = false;
    for (const el of [...clone.querySelectorAll('g')]) {
      if (el.children.length === 0) { el.remove(); again = true; }
    }
  }
  // BBox du dessin nettoyé, dans le repère de la planche.
  root.appendChild(clone);
  const bb = clone.getBBox();
  const c1 = toRoot(clone, bb.x, bb.y), c2 = toRoot(clone, bb.x + bb.width, bb.y + bb.height);
  clone.remove();
  const box = { x0: Math.min(c1.x, c2.x) * MM2PX, y0: Math.min(c1.y, c2.y) * MM2PX,
                x1: Math.max(c1.x, c2.x) * MM2PX, y1: Math.max(c1.y, c2.y) * MM2PX };
  // Transformation cumulée du groupe (planche → groupe), à reporter sur la sortie.
  const m = rootCTM.inverse().multiply(g.getScreenCTM());
  out.push({
    name, id, parent, host: host ?? null,
    pads: pads.map((p) => ({ name: p.name, x: p.x, y: p.y })),
    box,
    ctm: [m.a, m.b, m.c, m.d, m.e, m.f],
    inner: clone.innerHTML,
  });
}
for (const n of NAMES) {
  if (n.host) { collect(n.id, n.id, null, n.host); continue; }
  collect(n.id, n.id);
  // Schéma interne : « <nom>-interne », ou celui de la famille pour une variante
  // numérotée (condo-p-1 / condo-p-2 partagent « condo-p-interne »).
  const fam = n.id.replace(/-\\d+$/, '');
  collect(n.id + '-interne', fam === n.id ? [n.id + '-interne'] : [n.id + '-interne', fam + '-interne'], n.id);
}
document.getElementById('result').textContent = JSON.stringify(out);
} catch (e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;

const htmlPath = join(SCRATCH, 'extract.html');
writeFileSync(
  htmlPath,
  `<!doctype html><meta charset=utf-8><body><div id="board">${source}</div><pre id="result"></pre><script>${script}</script></body>`
);

const cand = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
if (!chrome) throw new Error('Chrome introuvable (CHROME_PATH)');
const dom = execFileSync(
  chrome,
  ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
);
const a0 = dom.indexOf('<pre id="result">') + 17;
const b0 = dom.indexOf('</pre>', a0);
const raw = dom
  .slice(a0, b0)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0, 2000)); process.exit(1); }
const items = JSON.parse(raw);

// --- defs référencées ---------------------------------------------------------
const defsBlock = source.slice(source.indexOf('<defs'), source.lastIndexOf('</defs>') + 7);
/** Extrait l'élément de defs portant cet id (balise complète, enfants compris). */
function defById(id) {
  const re = new RegExp(`<([a-zA-Z:]+)\\b[^>]*\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
  const m = re.exec(defsBlock);
  if (!m) return null;
  const tag = m[1];
  const start = m.index;
  const openEnd = defsBlock.indexOf('>', start);
  if (defsBlock[openEnd - 1] === '/') return defsBlock.slice(start, openEnd + 1);
  let depth = 1;
  const rx = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  rx.lastIndex = openEnd;
  let mm;
  while ((mm = rx.exec(defsBlock))) {
    depth += mm[0][1] === '/' ? -1 : 1;
    if (depth === 0) return defsBlock.slice(start, mm.index + mm[0].length);
  }
  return null;
}
/** Ferme transitivement les ids référencés (url(#x), href="#x"). */
function neededDefs(markup) {
  const seen = new Set();
  const queue = [];
  const scan = (s) => {
    for (const m of s.matchAll(/url\(#([^)"']+)\)|(?:xlink:)?href="#([^"]+)"/g)) {
      const id = m[1] || m[2];
      if (id && !seen.has(id)) { seen.add(id); queue.push(id); }
    }
  };
  scan(markup);
  const parts = [];
  while (queue.length) {
    const id = queue.shift();
    const d = defById(id);
    if (!d) continue;
    parts.push(d);
    scan(d);
  }
  return parts;
}

// --- écriture -----------------------------------------------------------------
const R3 = (v) => Number(v.toFixed(4));
/** Nombre de pas de 10 px, arrondi au-dessus (tolérant au bruit flottant). */
const steps10 = (v) => Math.ceil(v / 10 - 1e-6);

function frame(pads, box) {
  // Cadre calé sur le réseau des pastilles (multiples de 10 px) + marge ≥ 10 px.
  const pxs = pads.map((p) => p.x), pys = pads.map((p) => p.y);
  const pminX = Math.min(...pxs), pmaxX = Math.max(...pxs);
  const pminY = Math.min(...pys), pmaxY = Math.max(...pys);
  const left = Math.min(box.x0 - 2, pminX - 10);
  const right = Math.max(box.x1 + 2, pmaxX + 10);
  const top = Math.min(box.y0 - 2, pminY - 10);
  const bottom = Math.max(box.y1 + 2, pmaxY + 10);
  const x = pminX - 10 * steps10(pminX - left);
  const y = pminY - 10 * steps10(pminY - top);
  const w = pmaxX + 10 * steps10(right - pmaxX) - x;
  const h = pmaxY + 10 * steps10(bottom - pmaxY) - y;
  return { x, y, w, h };
}

// Cadre de chaque dessin EXTERNE, réutilisé tel quel par son schéma interne :
// « les pattes sont les mêmes pour les schémas interne et externe » (CLAUDE.md),
// donc mêmes coordonnées locales de broches et même boîte.
const extFrames = new Map();
const done = new Set();

for (const it of items) {
  if (it.missing) { console.log(`  – ${it.missing} : absent de ${SRC_FILE}`); continue; }
  if (done.has(it.name)) { console.log(`  = ${it.name}.svg déjà extrait`); continue; }
  done.add(it.name);
  let f = frame(it.pads, it.box);
  const isInt = it.name.endsWith('-interne') || !!it.host;
  const base = it.host ?? it.parent ?? it.name.replace(/-interne$/, '');
  if (isInt && extFrames.has(base)) {
    // Calage sur la pastille homonyme du dessin externe ; pour un boîtier partagé
    // les noms diffèrent (1/2/3 contre e/b/c), on apparie alors par POSITION.
    const ext = extFrames.get(base);
    const order = (a, b) => a.y - b.y || a.x - b.x;
    const mine = [...it.pads].sort(order);
    const theirs = [...ext.pads].sort(order);
    const ref = mine[0];
    const twin = theirs.find((p) => p.name === ref.name) ?? theirs[0];
    f = { x: ref.x - (twin.x - ext.f.x), y: ref.y - (twin.y - ext.f.y), w: ext.f.w, h: ext.f.h };
  } else if (!isInt) {
    extFrames.set(it.name, { f, pads: it.pads });
  }
  // planche (mm) → sortie (px) : mise à l'échelle puis translation du cadre.
  const [a, b, c, d, e, ff] = it.ctm;
  const s = MM2PX;
  const M = [a * s, b * s, c * s, d * s, e * s - f.x, ff * s - f.y];
  const defs = neededDefs(it.inner);
  const body = `<g transform="matrix(${M.map(R3).join(',')})">${it.inner}</g>`;
  // Attributs d'atelier Inkscape : sans effet sur le rendu (le `d` est déjà
  // calculé) mais svgo refuse un fichier qui les porte sans son espace de noms.
  const svg = (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${R3(f.w)} ${R3(f.h)}">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    body +
    `</svg>\n`
  ).replace(/\s(?:inkscape|sodipodi):[\w-]+="[^"]*"/g, '');
  const dir = isInt ? INT_DIR : EXT_DIR;
  // Nom livré : « <nom><suffixe>[-interne].svg », en minuscules pour un groupe de
  // boîtier partagé (NPN1@to92 → npn1-libre-interne.svg).
  // (le suffixe ne vise que les variantes de schéma interne : un boîtier cité
  // comme hôte est extrait tel quel, sans doublon suffixé)
  // Le suffixe « -interne » n'est JAMAIS doublé : un groupe déjà nommé
  // « hall-interne » sort en hall-interne.svg, pas hall-interne-interne.svg.
  const outName = isInt
    ? (it.host ? it.name.toLowerCase() : it.name).replace(/-interne$/, '') + SUFFIX + '-interne'
    : it.name;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${outName}.svg`);
  if (!pngOnly) writeFileSync(file, svg);
  const pins = it.pads
    .map((p) => ({ name: p.name, x: R3(p.x - f.x), y: R3(p.y - f.y) }))
    .sort((p, q) => p.y - q.y || p.x - q.x);
  console.log(`  ✓ ${outName}.svg  viewBox 0 0 ${R3(f.w)} ${R3(f.h)}  (${(svg.length / 1024).toFixed(1)} Ko)`);
  if (process.env.DEBUG_BOX) console.log(`    bbox : ${R3(it.box.x0)},${R3(it.box.y0)} → ${R3(it.box.x1)},${R3(it.box.y1)}`);
  console.log(`    pins : ${pins.map((p) => `${p.name}(${p.x},${p.y})`).join(' ')}`);
  // Aperçu PNG (contrôle visuel + grille 10 px).
  const prev = join(SCRATCH, `${it.name}.html`);
  const grid = `<defs><pattern id="grid10" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#cfe3ff" stroke-width="0.4"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid10)"/>`;
  writeFileSync(
    prev,
    `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff"><svg width="${R3(f.w) * 4}" height="${R3(f.h) * 4}" viewBox="0 0 ${R3(f.w)} ${R3(f.h)}" xmlns="http://www.w3.org/2000/svg">${grid}${svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}${it.pads.map((p) => `<circle cx="${R3(p.x - f.x)}" cy="${R3(p.y - f.y)}" r="1.2" fill="#ee0000"/>`).join('')}</svg></body>`
  );
  const png = join(SCRATCH, `${it.name}.png`);
  execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000',
    `--screenshot=${png}`, `--window-size=${Math.ceil(R3(f.w) * 4)},${Math.ceil(R3(f.h) * 4)}`,
    `file:///${prev.replace(/\\/g, '/')}`], { stdio: 'ignore' });
  console.log(`    aperçu : ${png}`);
}
