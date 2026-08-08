// Outil — LECTEUR DE PROFILS. Transforme un contour dessiné à la main (Inkscape,
// planche « Composants.svg ») en polygone prêt à être mis EN VOLUME par le moteur
// isométrique `src/webview/composants/iso3d.mts` : le châssis du robot araignée,
// les os des pattes, les blocs de servo.
//
// Ce que ça change : le châssis n'est plus un octogone codé en dur
// (`regularPoly(8, 55)`), c'est le contour que Frank a tracé — encoches, pans
// coupés, découpes en U comprises. Le dessin reste de sa main, le volume, l'ombrage
// et la cinématique restent au moteur.
//
// Conventions du dessin (détail : docs/fr/Drawing-systems.md) :
//   • un profil = un groupe (ou un chemin) dont l'id est « <nom>-profil » ;
//   • un CONTOUR FERMÉ par pièce ; les contours supplémentaires ENTIÈREMENT
//     contenus dans le premier sont des TROUS (perçages, allègements) ;
//   • plaque (châssis, platine) : dessinée VUE DE DESSUS, le haut du dessin est
//     l'AVANT du robot. Os et blocs : dessinés VUS DE CÔTÉ, pièce couchée, le
//     bord gauche est la première articulation, le bord droit la seconde ;
//   • pastilles rouges et textes sont ignorés (ce sont les repères habituels).
//
// Sortie : src/webview/composants/profils.mts — un objet figé, relu et FUSIONNÉ à
// chaque exécution, donc extraire un seul profil ne perd pas les autres.
//
// Usage : node scripts/_extract-profils.mjs araignee-chassis patte-femur
//         node scripts/_extract-profils.mjs --source=docs/exemples/chassis.svg chassis-demo
//         node scripts/_extract-profils.mjs --list          (ce qui est déjà rangé)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-composants');
const OUT_FILE = join(ROOT, 'src/webview/composants/profils.mts');
const MM2PX = 1 / 0.26458333;

const args = process.argv.slice(2);
const SOURCE = args.find((a) => a.startsWith('--source='))?.slice(9) ?? 'Composants.svg';
/** Pas d'échantillonnage des courbes, en unités du dessin. Plus fin que l'œil
 *  (la simplification qui suit efface tout ce qui ne se voit pas). */
const STEP = Number(args.find((a) => a.startsWith('--step='))?.slice(7) ?? 0.35);
/** Tolérance de simplification, en px de grille : en dessous, un point ne
 *  change plus rien à la silhouette et ne fait qu'alourdir le rendu. */
const TOL = Number(args.find((a) => a.startsWith('--tol='))?.slice(6) ?? 0.25);
const names = args.filter((a) => !a.startsWith('--'));

// --- fichier de sortie : relu avant d'être réécrit ----------------------------
/** Profils déjà rangés, lus dans le module généré (il est sa propre archive :
 *  un fichier de cache à côté finirait par mentir). */
function readExisting() {
  if (!existsSync(OUT_FILE)) return {};
  const txt = readFileSync(OUT_FILE, 'utf8');
  const a = txt.indexOf('const DATA = ');
  if (a < 0) return {};
  const b = txt.indexOf('\n} as const;', a);
  if (b < 0) return {};
  try {
    return JSON.parse(txt.slice(a + 13, b + 2));
  } catch {
    console.error('  ! profils.mts illisible : il sera reconstruit à partir des seuls profils extraits maintenant.');
    return {};
  }
}

if (args.includes('--list')) {
  const data = readExisting();
  const keys = Object.keys(data);
  if (!keys.length) console.log('  (aucun profil rangé)');
  for (const k of keys) {
    const p = data[k];
    console.log(`  ${k} : ${p.poly.length} points, ${p.w}×${p.h} px${p.holes?.length ? `, ${p.holes.length} trou(s)` : ''}`);
  }
  process.exit(0);
}

if (names.length === 0) {
  console.error('Usage: node scripts/_extract-profils.mjs [--source=f.svg] [--step=n] [--tol=n] <nom> [...]');
  console.error('       node scripts/_extract-profils.mjs --list');
  process.exit(1);
}

const srcPath = join(ROOT, SOURCE);
if (!existsSync(srcPath)) throw new Error(`source introuvable : ${srcPath}`);
const source = readFileSync(srcPath, 'utf8').replace(/<\?xml[^>]*\?>/, '');
// Planche Inkscape en millimètres (« width="420mm" ») : le repère racine est en
// mm, il faut le ramener aux pixels de la grille 10 px du canvas.
const unitScale = /<svg[^>]*\bwidth="[\d.]+mm"/.test(source) ? MM2PX : 1;

// Le navigateur fait tout le travail géométrique : résolution des transformations
// imbriquées, et surtout getPointAtLength — aplatir des courbes de Bézier et des
// arcs elliptiques à la main en node serait du code faux à écrire deux fois.
const script = `
try {
const STEP = ${STEP};
const NAMES = ${JSON.stringify(names)};
const root = document.querySelector('#board svg');
const out = [];
const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line';
const isPad = (el) => {
  const f = ((el.getAttribute('fill') || '') + ';' + (el.getAttribute('style') || '')).toLowerCase();
  return el.tagName === 'circle' && /#ee0000|#e00\\b|rgb\\(238/.test(f);
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
for (const name of NAMES) {
  const g = findGroup(name + '-profil') || findGroup(name);
  if (!g) { out.push({ name, missing: true }); continue; }
  const rootInv = root.getScreenCTM().inverse();
  const shapes = g.matches(SHAPES) ? [g] : [...g.querySelectorAll(SHAPES)];
  const rings = [];
  for (const el of shapes) {
    if (isPad(el)) continue;                    // pastille repère
    const d = toPathData(el);
    if (!d) continue;
    const ctm = rootInv.multiply(el.getScreenCTM());
    for (const sub of (el.tagName === 'path' ? subPaths(d) : [d])) {
      const pts = samplePath(sub, ctm);
      if (pts.length >= 3) rings.push(pts);
    }
  }
  out.push({ name, id: g.getAttribute('id'), rings });
}
document.getElementById('result').textContent = JSON.stringify(out);
} catch (e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;

mkdirSync(SCRATCH, { recursive: true });
const htmlPath = join(SCRATCH, 'profils.html');
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
  ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom',
    `file:///${htmlPath.replace(/\\/g, '/')}`],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
);
const a0 = dom.indexOf('<pre id="result">') + 17;
const raw = dom
  .slice(a0, dom.indexOf('</pre>', a0))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0, 2000)); process.exit(1); }
const items = JSON.parse(raw);

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
 *  cercle échantillonné tous les 0,35 px pèse 200 points pour un rendu
 *  identique à 30 ; et chaque point du contour coûte une face de tranche. */
function simplify(pts, tol) {
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
function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function bbox(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const R2 = (v) => Number(v.toFixed(2));
const data = readExisting();
let changed = 0;

for (const it of items) {
  if (it.missing) {
    console.log(`  – ${it.name} : ni « ${it.name}-profil » ni « ${it.name} » dans ${SOURCE}`);
    continue;
  }
  if (!it.rings.length) {
    console.log(`  – ${it.name} : aucun contour fermé trouvé dans le groupe`);
    continue;
  }
  // Unités du dessin → pixels de la grille 10 px, puis simplification.
  let rings = it.rings
    .map((r) => simplify(r.map((p) => [p[0] * unitScale, p[1] * unitScale]), TOL))
    .filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1);
  if (!rings.length) {
    console.log(`  – ${it.name} : contours trop petits (moins de 1 px² une fois à l'échelle)`);
    continue;
  }
  // Le plus grand contour est la PIÈCE ; ceux qu'il contient sont des trous. Un
  // contour extérieur qui n'est pas contenu (deux pièces dans le même groupe)
  // est signalé plutôt qu'avalé en silence : ce serait un dessin à corriger.
  rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const outer = rings[0];
  const holes = [];
  for (const r of rings.slice(1)) {
    if (pointInRing(r[0], outer)) holes.push(r);
    else console.log(`  ! ${it.name} : un contour hors de la pièce a été ignoré (${r.length} points)`);
  }
  // Centrage sur le milieu de la boîte englobante : le composant place ensuite
  // la pièce par son centre, sans avoir à connaître le coin de la planche.
  const bb = bbox(outer);
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  const move = (r) => r.map((p) => ({ x: R2(p[0] - cx), y: R2(p[1] - cy) }));
  const entry = {
    poly: move(outer),
    w: R2(bb.x1 - bb.x0),
    h: R2(bb.y1 - bb.y0),
  };
  if (holes.length) entry.holes = holes.map(move);
  entry.source = `${SOURCE}#${it.id}`;
  data[it.name] = entry;
  changed++;
  console.log(`  ✓ ${it.name} : ${entry.poly.length} points, ${entry.w}×${entry.h} px${holes.length ? `, ${holes.length} trou(s)` : ''}`);
}

if (!changed) {
  console.log('  (rien à écrire)');
  process.exit(1);
}

// --- écriture du module -------------------------------------------------------
/** JSON lisible : un profil par bloc, les points quatre par ligne — un diff git
 *  doit rester consultable, c'est du dessin versionné. */
function dump(obj) {
  const parts = [];
  for (const [name, p] of Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) {
    const ring = (r) => {
      const lines = [];
      for (let i = 0; i < r.length; i += 4) {
        lines.push('      ' + r.slice(i, i + 4).map((q) => `{ "x": ${q.x}, "y": ${q.y} }`).join(', '));
      }
      return '[\n' + lines.join(',\n') + '\n    ]';
    };
    const fields = [
      `    "w": ${p.w}`,
      `    "h": ${p.h}`,
      `    "source": ${JSON.stringify(p.source ?? '')}`,
      `    "poly": ${ring(p.poly)}`,
    ];
    if (p.holes?.length) {
      fields.push(`    "holes": [\n${p.holes.map((h) => '    ' + ring(h)).join(',\n')}\n    ]`);
    }
    parts.push(`  ${JSON.stringify(name)}: {\n${fields.join(',\n')}\n  }`);
  }
  return '{\n' + parts.join(',\n') + '\n}';
}

const header = `// FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Produit par \`node scripts/_extract-profils.mjs <nom>…\` à partir des contours
// dessinés dans Composants.svg (mode d'emploi : docs/fr/Drawing-systems.md).
// Le module est sa propre archive : l'outil le RELIT avant de le réécrire, donc
// extraire un seul profil ne fait pas disparaître les autres.
//
// Coordonnées en pixels de la grille 10 px, centrées sur le milieu de la boîte
// englobante de la pièce. \`holes\` : les perçages, dans le même repère.
import type { Profile } from './iso3d.mjs';

const DATA = ${dump(data)} as const;

export type ProfileName = keyof typeof DATA;

/** Tous les profils dessinés, dans l'ordre alphabétique. Le banc \`verify:profils\`
 *  les passe tous en revue : un contour qui se croise ou dont le découpage laisse
 *  un trou doit tomber au test, pas à l'image. */
export const PROFIL_NAMES = Object.keys(DATA) as ProfileName[];

/** Profil dessiné, prêt pour \`prismFaces\` (plaque) ou \`extrudeProfile\` (pièce). */
export function profile(name: ProfileName): Profile & { holes: { x: number; y: number }[][] } {
  const p = DATA[name] as { poly: readonly { x: number; y: number }[]; w: number; h: number;
    holes?: readonly (readonly { x: number; y: number }[])[] };
  return {
    poly: p.poly.map((q) => ({ x: q.x, y: q.y })),
    w: p.w,
    h: p.h,
    holes: (p.holes ?? []).map((h) => h.map((q) => ({ x: q.x, y: q.y }))),
  };
}

/** Vrai si ce profil a été dessiné et extrait (les composants gardent une forme
 *  de repli codée en dur tant que le dessin n'existe pas). */
export function hasProfile(name: string): name is ProfileName {
  return Object.prototype.hasOwnProperty.call(DATA, name);
}
`;
writeFileSync(OUT_FILE, header);
console.log(`\n  → ${OUT_FILE} (${Object.keys(data).length} profil(s))`);
