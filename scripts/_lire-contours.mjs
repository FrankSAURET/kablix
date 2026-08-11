// Outil partagé — LECTURE DES CONTOURS d'une planche SVG (Inkscape). Sert au
// lecteur de profils (`_extract-profils.mjs`, une pièce isolée) comme au lecteur
// d'assemblages (`_extract-assemblage.mjs`, plusieurs pièces posées les unes par
// rapport aux autres). Les deux ont besoin exactement des mêmes choses :
// résoudre les transformations imbriquées, aplatir les courbes, et rendre des
// points dans le repère de la planche.
//
// Le travail géométrique est fait par un NAVIGATEUR sans interface : aplatir des
// Bézier et des arcs elliptiques à la main en node serait du code faux à écrire
// deux fois, alors que `getPointAtLength` le fait juste et gratuitement.
//
// Ce module ne décide de RIEN : il rend des contours bruts, les pastilles rouges
// et les textes, dans les unités du dessin. C'est à l'appelant de dire ce qu'est
// une pièce, un trou, un axe ou une étiquette.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-composants');
/** Planche Inkscape en millimètres → pixels de la grille 10 px du canevas. */
export const MM2PX = 1 / 0.26458333;

export function findChrome() {
  const cand = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const found = cand.find((c) => existsSync(c));
  if (!found) throw new Error('Chrome introuvable (définir CHROME_PATH)');
  return found;
}

/** Le script exécuté DANS la page : tout ce qui touche à la géométrie SVG. */
function pageScript({ ids, prefixes, step }) {
  return `
try {
const STEP = ${step};
const IDS = ${JSON.stringify(ids)};
const PREFIXES = ${JSON.stringify(prefixes)};
const root = document.querySelector('#board svg');
const out = [];
const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line';
/** Pastille repère : un petit rond ROUGE. Elle marque un point remarquable —
 *  broche d'un composant plat, AXE d'articulation dans un assemblage.
 *  La teinte est jugée sur la couleur CALCULÉE, pas sur le texte de l'attribut :
 *  la planche mêle le rouge historique (#ee0000) et celui de la palette Inkscape
 *  (#ff0000), et une liste de codes en laissait forcément un dehors — les
 *  pastilles de l'araignée n'étaient tout simplement pas vues. */
const isPad = (el) => {
  if (el.tagName !== 'circle') return false;
  const c = fillOf(el);
  if (!c) return false;
  const v = (i) => parseInt(c.slice(i, i + 2), 16);
  return v(1) >= 200 && v(3) <= 90 && v(5) <= 90;
};
function findGroup(id) {
  const hit = root.getElementById(id);
  if (hit) return hit;
  // Inkscape laisse parfois un point ou un souligné à la place d'un tiret.
  for (let i = 0; i < id.length; i++) {
    if (id[i] !== '-') continue;
    for (const sep of ['.', '_']) {
      const el = root.querySelector('[id="' + id.slice(0, i) + sep + id.slice(i + 1) + '"]');
      if (el) return el;
    }
  }
  return null;
}
/** Découpe un attribut « d » en SOUS-CHEMINS : chaque M/m ouvre un contour, et
 *  c'est ainsi qu'un perçage se distingue de la pièce qui le porte. */
function subPaths(d) {
  const parts = [];
  let cur = '';
  const re = /[MmZzLlHhVvCcSsQqTtAa][^MmZz]*|[Zz]/g;
  let m;
  while ((m = re.exec(d))) {
    const c = m[0][0];
    if ((c === 'M' || c === 'm') && cur.trim()) { parts.push(cur); cur = ''; }
    cur += m[0];
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}
/** Échantillonne un élément de forme en points, dans le repère de la planche. */
function samplePath(dAttr, ctm) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', dAttr);
  root.appendChild(p);
  const total = p.getTotalLength();
  const pts = [];
  if (total > 1e-6) {
    const n = Math.max(3, Math.ceil(total / STEP));
    for (let i = 0; i < n; i++) {
      const q = p.getPointAtLength((i * total) / n);
      const t = q.matrixTransform(ctm);
      pts.push([t.x, t.y]);
    }
  }
  p.remove();
  return pts;
}
/** Toute forme ramenée à un « d » : rect, circle et ellipse n'ont pas de
 *  getTotalLength utile dans tous les moteurs, les convertir est plus sûr. */
function toPathData(el) {
  const n = (a) => Number(el.getAttribute(a) || 0);
  switch (el.tagName) {
    case 'path': return el.getAttribute('d') || '';
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      return 'M' + x + ',' + y + 'H' + (x + w) + 'V' + (y + h) + 'H' + x + 'Z';
    }
    case 'circle': case 'ellipse': {
      const cx = n('cx'), cy = n('cy');
      const rx = el.tagName === 'circle' ? n('r') : n('rx');
      const ry = el.tagName === 'circle' ? n('r') : n('ry');
      return 'M' + (cx - rx) + ',' + cy + 'a' + rx + ',' + ry + ' 0 1,0 ' + (2 * rx) + ',0'
           + 'a' + rx + ',' + ry + ' 0 1,0 ' + (-2 * rx) + ',0Z';
    }
    case 'polygon': case 'polyline':
      return 'M' + (el.getAttribute('points') || '').trim() + (el.tagName === 'polygon' ? 'Z' : '');
    case 'line':
      return 'M' + n('x1') + ',' + n('y1') + 'L' + n('x2') + ',' + n('y2');
    default: return '';
  }
}
const rootInv = root.getScreenCTM().inverse();
/** Point d'un élément ramené dans le repère de la planche. */
function at(el, x, y) {
  const pt = root.createSVGPoint();
  pt.x = x;
  pt.y = y;
  return pt.matrixTransform(rootInv.multiply(el.getScreenCTM()));
}
/** Couleur de remplissage EFFECTIVE d'une forme, en « #rrggbbaa » : la teinte
 *  calculée par le navigateur, son opacité de remplissage, et les opacités de
 *  tous les groupes qui la portent (Inkscape pose souvent la transparence sur le
 *  calque ou le groupe, pas sur la forme). Rend null si la forme n'est pas
 *  remplie — un trait seul ne colore rien. */
function fillOf(el) {
  const cs = getComputedStyle(el);
  const m = (cs.fill || '').match(/[\\d.]+/g);
  if (!m || m.length < 3 || cs.fill === 'none') return null;
  let a = Number(cs.fillOpacity || 1) * (m.length > 3 ? Number(m[3]) : 1);
  for (let n = el; n && n !== root.parentNode; n = n.parentNode) {
    const o = Number(getComputedStyle(n).opacity);
    if (Number.isFinite(o)) a *= o;
  }
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + h(Number(m[0])) + h(Number(m[1])) + h(Number(m[2])) + h(a * 255);
}
function readGroup(name, g) {
  const shapes = g.matches(SHAPES) ? [g] : [...g.querySelectorAll(SHAPES)];
  const rings = [];
  const pads = [];
  // Couleur de la pièce : celle de la plus GRANDE forme remplie, c'est-à-dire
  // son contour — un perçage ou un décor ne décide pas de la teinte du tout.
  let fill = null;
  let fillAire = 0;
  for (const el of shapes) {
    const ctm = rootInv.multiply(el.getScreenCTM());
    if (isPad(el)) {
      const c = at(el, Number(el.getAttribute('cx') || 0), Number(el.getAttribute('cy') || 0));
      // L'ID du rond est remonté tel quel : c'est la façon la plus sûre de
      // nommer une pastille dans Inkscape (Objet → Propriétés de l'objet), et
      // elle ne dépend pas d'un texte posé à côté.
      pads.push({ x: c.x, y: c.y, id: el.getAttribute('id') || '' });
      continue;
    }
    const d = toPathData(el);
    if (!d) continue;
    const bb = el.getBBox();
    const c = fillOf(el);
    if (c && bb.width * bb.height > fillAire) { fillAire = bb.width * bb.height; fill = c; }
    for (const sub of (el.tagName === 'path' ? subPaths(d) : [d])) {
      const pts = samplePath(sub, ctm);
      if (pts.length >= 3) rings.push(pts);
    }
  }
  const texts = [];
  for (const t of (g.matches('text') ? [g] : [...g.querySelectorAll('text')])) {
    const s = (t.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!s) continue;
    const bb = t.getBBox();
    const c = at(t, bb.x + bb.width / 2, bb.y + bb.height / 2);
    texts.push({ s, x: c.x, y: c.y });
  }
  out.push({ name, id: g.getAttribute('id'), rings, pads, texts, fill });
}
for (const id of IDS) {
  const g = findGroup(id + '-profil') || findGroup(id);
  if (!g) { out.push({ name: id, missing: true }); continue; }
  readGroup(id, g);
}
for (const p of PREFIXES) {
  // Tous les groupes du préfixe, SANS leurs descendants : une pièce est un
  // groupe de premier niveau, ses sous-groupes en font partie.
  const seen = [];
  for (const el of root.querySelectorAll('[id]')) {
    const id = el.getAttribute('id') || '';
    if (!id.startsWith(p)) continue;
    if (seen.some((s) => s.contains(el))) continue;
    seen.push(el);
  }
  for (const el of seen) readGroup(el.getAttribute('id').replace(/-profil$/, ''), el);
}
document.getElementById('result').textContent = JSON.stringify(out);
} catch (e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;
}

/**
 * Lit une planche SVG et rend les groupes demandés, en unités du DESSIN.
 * `ids` : noms exacts (le suffixe `-profil` est essayé d'abord).
 * `prefixes` : tous les groupes dont l'id commence ainsi (assemblage).
 * Rend aussi `unitScale`, le facteur unités du dessin → pixels de grille.
 */
export function lireDessin({ source = 'Composants.svg', ids = [], prefixes = [], step = 0.35 }) {
  const srcPath = join(ROOT, source);
  if (!existsSync(srcPath)) throw new Error(`source introuvable : ${srcPath}`);
  const svg = readFileSync(srcPath, 'utf8').replace(/<\?xml[^>]*\?>/, '');
  const unitScale = /<svg[^>]*\bwidth="[\d.]+mm"/.test(svg) ? MM2PX : 1;

  mkdirSync(SCRATCH, { recursive: true });
  const htmlPath = join(SCRATCH, 'contours.html');
  writeFileSync(htmlPath,
    `<!doctype html><meta charset=utf-8><body><div id="board">${svg}</div>`
    + `<pre id="result"></pre><script>${pageScript({ ids, prefixes, step })}</script></body>`);

  const dom = execFileSync(findChrome(), [
    '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom',
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const a0 = dom.indexOf('<pre id="result">') + 17;
  const raw = dom
    .slice(a0, dom.indexOf('</pre>', a0))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  if (raw.startsWith('ERR')) { console.error(raw.slice(0, 2000)); process.exit(1); }
  return { unitScale, groupes: JSON.parse(raw) };
}

// --- pastilles ----------------------------------------------------------------
/** Ids qu'Inkscape fabrique tout seul (`circle91`, `path102`, `g123-1`…) : ils
 *  ne nomment rien. Un id qui commence par un mot de balise suivi d'un chiffre
 *  est automatique ; tout le reste a été écrit à la main. */
export const idAuto = (id) => !id
  || /^(circle|ellipse|path|rect|polygon|polyline|line|g|use|text|tspan|svg|defs)[-_]?\d*$/i.test(id);

/**
 * Le nom d'une pastille : son ID d'abord (Inkscape, Objet → Propriétés de
 * l'objet), le texte libre le plus proche ensuite — l'AU-DESSUS étant préféré,
 * comme le nom d'une broche sur la planche des composants.
 *
 * L'id passe devant parce qu'il colle au rond : il survit à un déplacement, à un
 * texte ajouté à côté, et à une pastille posée hors de la pièce qu'elle repère.
 * Rend `null` si rien ne la nomme — une pastille anonyme n'est pas un axe.
 */
export function nomDePastille(p, libres, id = '') {
  if (!idAuto(id)) return id;
  let best = null;
  let bestD = Infinity;
  for (const t of libres) {
    const d = Math.hypot(t.x - p.x, t.y - p.y) + (t.y < p.y ? 0 : 6);
    if (d < bestD) { bestD = d; best = t.s; }
  }
  return bestD > 20 ? null : best;
}

// --- géométrie ----------------------------------------------------------------
/** Distance d'un point au segment ab — le critère de Douglas-Peucker. */
function distToSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker : ne garde que les points qui changent la SILHOUETTE. Un
 *  cercle échantillonné tous les 0,35 px pèse 200 points pour un rendu identique
 *  à 30 ; et chaque point du contour coûte une face de tranche. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let far = -1;
    let best = tol;
    for (let k = i + 1; k < j; k++) {
      const d = distToSeg(pts[k], pts[i], pts[j]);
      if (d > best) { best = d; far = k; }
    }
    if (far > 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function bbox(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const R2 = (v) => Number(v.toFixed(2));

/**
 * Contours bruts d'un groupe → UNE pièce : le plus grand contour est la matière,
 * ceux qu'il contient sont ses perçages. Un contour extérieur qui n'est pas
 * contenu (deux pièces dans le même groupe) est signalé plutôt qu'avalé en
 * silence : ce serait un dessin à corriger, pas une devinette à trancher.
 * Les points sont mis à l'échelle `k` puis simplifiés ; la boîte englobante est
 * rendue telle quelle (l'appelant décide de centrer ou non).
 */
export function ringsToPiece(name, rings, { k = 1, tol = 0.25, warn = console.log } = {}) {
  let rs = rings
    .map((r) => simplify(r.map((p) => [p[0] * k, p[1] * k]), tol))
    .filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1);
  if (!rs.length) return null;
  rs.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const outer = rs[0];
  const holes = [];
  for (const r of rs.slice(1)) {
    if (pointInRing(r[0], outer)) holes.push(r);
    else warn(`  ! ${name} : un contour hors de la pièce a été ignoré (${r.length} points)`);
  }
  return { outer, holes, bb: bbox(outer) };
}
