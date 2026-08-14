// Petit moteur de rendu ISOMÉTRIQUE en SVG, partagé par les composants qui ont
// besoin de VOLUME (robot araignée, patte). Il n'y a ni three.js ni WebGL : la
// scène est décrite en 3D, projetée à plat, et sortie en `<polygon>` SVG — le
// même moteur de rendu que tous les autres composants, donc le même zoom, le
// même export, la même capture de fiche d'aide, et aucune dépendance de plus.
//
// Ce qu'il sait faire (et rien de plus, c'est voulu) :
//   • projeter un point 3D en isométrique ;
//   • fabriquer les faces d'une BOÎTE orientée le long d'un segment (les os des
//     pattes, les cartes embarquées) et d'un PRISME vertical (le châssis) ;
//   • ombrer chaque face selon son orientation, écarter les faces de dos, et
//     trier le tout en profondeur (algorithme du peintre).
//
// Convention du repère MONDE : X vers la droite du robot, Y vers l'arrière,
// Z vers le HAUT (le sol est en z = 0). L'observateur regarde depuis (1, 1, 1),
// d'où la projection classique : une arête verticale reste verticale à l'écran,
// une arête horizontale part à ±30°.
import { svg, type SVGTemplateResult } from 'lit';

export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };

const COS30 = Math.cos(Math.PI / 6); // 0,866…
/** Direction de l'œil, normalisée : sert au tri en profondeur et au dos des faces. */
const EYE: Vec3 = { x: 1 / Math.sqrt(3), y: 1 / Math.sqrt(3), z: 1 / Math.sqrt(3) };
/** Lumière fixe, venant du haut avant-gauche : le relief se lit toujours pareil. */
const LIGHT = norm({ x: -0.4, y: -0.55, z: 0.75 });

export function project(p: Vec3): Vec2 {
  return { x: (p.x - p.y) * COS30, y: (p.x + p.y) * 0.5 - p.z };
}

/** Profondeur le long de l'axe de vue : plus grand = plus près de l'œil. */
export function depth(p: Vec3): number {
  return p.x * EYE.x + p.y * EYE.y + p.z * EYE.z;
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

/** Rotation autour de l'axe vertical (lacet), en degrés. Sert à ORIENTER la
 *  scène : en isométrie pure, tout ce qui pointe à ±45° se projette sur l'axe
 *  vertical de l'écran — les pattes avant et arrière du robot se superposaient
 *  alors au châssis. Un quart de tour de biais suffit à les dégager. */
export function rotZ(p: Vec3, deg: number): Vec3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

/**
 * Rotation autour d'un axe QUELCONQUE (Rodrigues), `u` unitaire et passant par
 * l'origine, angle en degrés. `rotZ` ne sait tourner qu'autour de la verticale :
 * c'est le lacet d'une coxa, mais surtout pas une PATELLA, dont l'axe est
 * horizontal et tourne lui-même avec la patte. Composer une translation, cette
 * rotation et la translation inverse fait pivoter une pièce autour de l'axe
 * dessiné, où qu'il soit.
 */
export function rotAxis(p: Vec3, u: Vec3, deg: number): Vec3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const d = dot(u, p) * (1 - c);
  const w = cross(u, p);
  return {
    x: p.x * c + w.x * s + u.x * d,
    y: p.y * c + w.y * s + u.y * d,
    z: p.z * c + w.z * s + u.z * d,
  };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l < 1e-9 ? { x: 0, y: 0, z: 1 } : scale(a, 1 / l);
}

/** Une face prête à sortir : ses sommets projetés, sa profondeur, sa couleur, et
 *  le GROUPE dont elle fait partie — une pièce. Une matière translucide ne se
 *  traverse qu'une fois : c'est le groupe entier qui porte la transparence, pas
 *  chacun de ses triangles (voir `renderFaces`). */
export type Face = { pts: Vec2[]; z: number; fill: string; g?: number; img?: FaceImage };

/** Une IMAGE plaquée sur la face vue d'une pièce (v2026.8.59) : la photo d'une
 *  carte électronique collée sur son rectangle de PMMA, comme un décalque. Les
 *  trois points sont déjà PROJETÉS à l'écran — origine du bitmap, bout de son
 *  côté large, bout de son côté haut : ils portent à eux seuls la perspective
 *  isométrique (une image reste un parallélogramme dans cette projection). La
 *  face qui porte l'image donne le DÉCOUPAGE (`pts`, le contour de la pièce) :
 *  une photo rectangulaire posée sur une plaque échancrée s'arrête au bord. */
export type FaceImage = { href: string; o: Vec2; u: Vec2; v: Vec2; alpha: number };

/** Numéro du prochain groupe de rendu. Un compteur suffit : deux pièces ne sont
 *  jamais fusionnées, même dessinées à partir du même contour. */
let groupeSeq = 0;

/** Marque toutes ces faces comme UNE pièce, et les rend. */
function grouper(faces: Face[]): Face[] {
  const g = ++groupeSeq;
  for (const f of faces) f.g = g;
  return faces;
}

/** Couleur éclaircie (k > 1) ou assombrie (k < 1), bornée. Accepte `#rrggbb`,
 *  `#rrggbbaa` (la couleur de remplissage lue sur le dessin, transparence
 *  comprise) et le `rgb()` / `rgba()` qu'elle produit : une teinte déjà
 *  assombrie (le fond d'un perçage) repasse ensuite par l'éclairage de sa face.
 *  **L'éclairage ne touche pas l'alpha** : un flanc translucide le reste, à
 *  l'ombre comme au soleil. */
export function shade(color: string, k: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  if (color[0] === '#') {
    const h = color.slice(1);
    const n = parseInt(h.slice(0, 6), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
    if (h.length >= 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = color.match(/[\d.]+/g);
    if (m) {
      [r, g, b] = m.slice(0, 3).map(Number);
      if (m.length > 3) a = Number(m[3]);
    }
  }
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return a >= 1
    ? `rgb(${c(r)},${c(g)},${c(b)})`
    : `rgba(${c(r)},${c(g)},${c(b)},${Math.round(a * 1000) / 1000})`;
}

/** Luminosité d'une face : ambiante + diffus, du plein soleil au clair-obscur. */
function litness(normal: Vec3): number {
  return 0.55 + 0.45 * Math.max(0, dot(normal, LIGHT));
}

/** Fabrique une face à partir de ses sommets 3D. Retourne `null` si elle est
 *  vue DE DOS (invisible) : inutile de la trier et de la dessiner. */
function face(pts3: Vec3[], color: string, boost = 1): Face | null {
  const normal = norm(cross(sub(pts3[1], pts3[0]), sub(pts3[2], pts3[0])));
  if (dot(normal, EYE) <= 0.001) return null;
  let z = 0;
  for (const p of pts3) z += depth(p);
  return { pts: pts3.map(project), z: z / pts3.length, fill: shade(color, litness(normal) * boost) };
}

/**
 * Boîte orientée : un pavé dont l'axe long va de `from` à `to`, de section
 * `w` × `h` (largeur horizontale, hauteur). C'est la brique des OS de patte —
 * un simple trait n'a pas de volume, une boîte en a trois faces visibles.
 */
export function boxFaces(from: Vec3, to: Vec3, w: number, h: number, color: string): Face[] {
  const axis = norm(sub(to, from));
  // Repère local : `side` horizontal perpendiculaire à l'axe, `up` complète.
  // Axe presque vertical : on prend X comme référence pour éviter la dégénérescence.
  const ref: Vec3 = Math.abs(axis.z) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const side = norm(cross(axis, ref));
  const up = norm(cross(side, axis));
  const dw = scale(side, w / 2);
  const dh = scale(up, h / 2);
  const corners = (o: Vec3): Vec3[] => [
    add(add(o, dw), dh), add(sub(o, dw), dh), add(sub(o, dw), scale(dh, -1)), add(add(o, dw), scale(dh, -1)),
  ];
  const a = corners(from);
  const b = corners(to);
  // Chaque quadrilatère est donné dans l'ordre qui fait SORTIR sa normale du
  // volume : c'est elle qui décide de l'éclairage et de l'élimination des faces
  // de dos. Un quad listé à l'envers disparaît (ou s'allume au mauvais moment).
  const quads: Vec3[][] = [
    [a[0], a[1], a[2], a[3]], // bout côté `from`
    [b[3], b[2], b[1], b[0]], // bout côté `to`
    [b[0], b[1], a[1], a[0]], // dessus
    [b[2], b[3], a[3], a[2]], // dessous
    [b[1], b[2], a[2], a[1]], // flanc
    [b[3], b[0], a[0], a[3]], // flanc opposé
  ];
  return grouper(quads.map((q) => face(q, color)).filter((f): f is Face => f !== null));
}

/** Aire signée d'un polygone plan (positive = sens trigonométrique). */
export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * ALLÈGE un contour dessiné : les points qui ne s'écartent pas de plus de `tol`
 * de la ligne qu'ils prolongent sont retirés (Douglas-Peucker, contour fermé).
 *
 * Un tracé sorti d'Inkscape porte ses courbes en dizaines de points espacés d'un
 * dixième de millimètre : parfait pour découper au laser, ruineux à l'écran —
 * chaque point ajoute un triangle, et chaque triangle une face à trier, à
 * projeter et à écrire dans le DOM. Sur le robot entier, 96 points de plaque
 * coûtaient 1800 faces là où 25 en donnent 250, pour la même silhouette à un
 * demi-pixel près. La tolérance s'exprime dans l'unité du contour reçu.
 *
 * Les COINS sont gardés quoi qu'il arrive. Douglas-Peucker seul ne connaît que
 * l'écart à la corde : sur une carte PCA9685 large de 26 px, ses détrompeurs de
 * 1 mm rentraient sous la tolérance, disparaissaient — et les points de coin
 * partis avec eux, les bords droits se mettaient à onduler. Un sommet qui fait
 * tourner le tracé de plus de `COIN` est une ancre ; entre deux ancres, la
 * courbe est allégée normalement. Un cercle Inkscape tourne de 5° par point : il
 * s'allège toujours autant.
 */
const COIN = (20 * Math.PI) / 180;

export function simplifyPoly(poly: Vec2[], tol: number): Vec2[] {
  if (tol <= 0 || poly.length < 5) return poly;
  const n = poly.length;
  // Le contour est FERMÉ : les index tournent, un arc peut passer par le point 0.
  const at = (i: number): Vec2 => poly[((i % n) + n) % n];
  // Distance d'un point au SEGMENT ab (et non à la droite : sur un contour fermé
  // très replié, la droite passe loin de la vraie corde).
  const dist = (p: Vec2, a: Vec2, b: Vec2): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  /** Allège l'arc `from` → `to` et pousse ses points, `to` compris. */
  const keep = (from: number, to: number, out: Vec2[]): void => {
    let worst = 0;
    let pire = -1;
    for (let i = from + 1; i < to; i++) {
      const d = dist(at(i), at(from), at(to));
      if (d > worst) { worst = d; pire = i; }
    }
    if (worst <= tol || pire < 0) { out.push(at(to)); return; }
    keep(from, pire, out);
    keep(pire, to, out);
  };
  // Les ancres : les sommets où le tracé tourne franchement.
  const coins: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = at(i - 1);
    const b = at(i);
    const c = at(i + 1);
    const dot2 = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (Math.abs(Math.atan2(cross2(a, b, c), dot2)) > COIN) coins.push(i);
  }
  const out: Vec2[] = [];
  if (coins.length >= 2) {
    for (let j = 0; j < coins.length; j++) {
      const from = coins[j];
      const to = j + 1 < coins.length ? coins[j + 1] : coins[0] + n;
      out.push(at(from));
      const arc: Vec2[] = [];
      keep(from, to, arc);
      arc.pop(); // le point d'arrivée est l'ancre suivante : elle se pousse seule.
      out.push(...arc);
    }
  } else {
    // Aucun coin (un cercle) : on coupe en DEUX arcs, sans quoi le premier point
    // serait le seul ancrage et la moitié du tracé s'effondrerait sur une corde.
    const half = Math.floor(n / 2);
    out.push(poly[0]);
    keep(0, half, out);
    keep(half, n - 1, out);
  }
  return out.length >= 4 ? out : poly;
}

/** Double de l'aire signée du triangle abc : > 0 = sommet convexe (sens trigo). */
function cross2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function inTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  return cross2(a, b, p) >= 0 && cross2(b, c, p) >= 0 && cross2(c, a, p) >= 0;
}

/**
 * Triangule un polygone SIMPLE quelconque par découpage d'oreilles. Un éventail
 * autour du centre suffisait tant que les formes étaient convexes (octogone
 * codé en dur) ; dès que Frank dessine un châssis découpé au laser — encoches,
 * pattes de fixation, découpes en U — l'éventail sort de la forme et bave dans
 * les creux. Le découpage d'oreilles, lui, ne produit que des triangles
 * intérieurs. Sortie toujours en sens trigonométrique.
 */
export function triangulate(poly: Vec2[]): Vec2[][] {
  if (poly.length < 3) return [];
  const pts = signedArea(poly) < 0 ? [...poly].reverse() : [...poly];
  const idx = pts.map((_, i) => i);
  const out: Vec2[][] = [];
  // Un polygone à n sommets donne n-2 triangles : la boucle ne peut pas tourner
  // plus de n fois de plus sans progresser (garde-fou contre un tracé dégénéré).
  let guard = pts.length * 2;
  while (idx.length > 3 && guard-- > 0) {
    let cut = -1;
    for (let i = 0; i < idx.length; i++) {
      const a = pts[idx[(i + idx.length - 1) % idx.length]];
      const b = pts[idx[i]];
      const c = pts[idx[(i + 1) % idx.length]];
      if (cross2(a, b, c) <= 1e-9) continue; // sommet rentrant : pas une oreille
      let clean = true;
      for (const j of idx) {
        const p = pts[j];
        if (p === a || p === b || p === c) continue;
        if (inTriangle(p, a, b, c)) { clean = false; break; }
      }
      if (!clean) continue;
      out.push([a, b, c]);
      cut = i;
      break;
    }
    if (cut < 0) break; // plus d'oreille trouvable : on rend ce qui est fait
    idx.splice(cut, 1);
  }
  if (idx.length === 3) out.push(idx.map((i) => pts[i]));
  return out;
}

/** Taille visée d'un triangle de face plate, en unités de la feuille. Au-delà,
 *  le triangle est recoupé : l'algorithme du peintre range chaque face à sa
 *  profondeur MOYENNE, donc une grande face passe devant (ou derrière) tout ce
 *  qu'elle porte — le Pico posé au bord de la plaque disparaissait SOUS la
 *  plaque. Des faces de taille comparable rangent juste. */
const MAX_EDGE = 26;

/** Recoupe un triangle par le milieu de sa plus longue arête tant qu'il dépasse
 *  `max`. Les morceaux partagent la normale du triangle d'origine, donc sa
 *  teinte : le découpage reste invisible.
 *  `max` SUIT la taille du dessin (v2026.8.62) : c'est une taille relative à la
 *  scène, pas un absolu. Laissé fixe, un dessin deux fois plus grand quadruple
 *  son nombre de faces pour exactement la même image. */
function subdivide(tri: Vec2[], out: Vec2[][], max = MAX_EDGE): void {
  const [a, b, c] = tri;
  const e = [
    { d: Math.hypot(b.x - a.x, b.y - a.y), i: 0 },
    { d: Math.hypot(c.x - b.x, c.y - b.y), i: 1 },
    { d: Math.hypot(a.x - c.x, a.y - c.y), i: 2 },
  ].sort((p, q) => q.d - p.d)[0];
  if (e.d <= max) { out.push(tri); return; }
  const v = [a, b, c];
  const p = v[e.i];
  const q = v[(e.i + 1) % 3];
  const r = v[(e.i + 2) % 3];
  const m: Vec2 = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  subdivide([p, m, r], out, max);
  subdivide([m, q, r], out, max);
}

/**
 * Dessus (ou dessous) d'un prisme : le polygone est triangulé, puis recoupé en
 * morceaux de taille comparable pour que le tri en profondeur reste juste.
 */
function cap(pts: Vec3[], color: string): Face[] {
  const z = pts[0].z;
  const flat = pts.map((p) => ({ x: p.x, y: p.y }));
  // Sens de parcours reçu : il dit si l'on regarde le dessus ou le dessous, et
  // `triangulate` le normalise — il faut donc le RENDRE après coup, sans quoi
  // toutes les faces plates regarderaient vers le haut.
  const flip = signedArea(flat) < 0;
  const tris: Vec2[][] = [];
  for (const t of triangulate(flat)) subdivide(t, tris);
  const out: Face[] = [];
  for (const t of tris) {
    const ordered = flip ? [...t].reverse() : t;
    const f = face(ordered.map((p) => ({ x: p.x, y: p.y, z })), color);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Prisme vertical : un polygone horizontal (donné en X/Y, sens trigonométrique)
 * extrudé de `z0` à `z1`. C'est le châssis découpé au laser, et toute plaque.
 */
export function prismFaces(poly: Vec2[], z0: number, z1: number, color: string): Face[] {
  // Sens de tracé normalisé : un contour DESSINÉ arrive dans le sens du crayon,
  // et à l'envers ce sont le dessus et le dessous qui échangent leur normale —
  // la plaque se retrouve alors éclairée par en dessous, son dessus effacé.
  if (signedArea(poly) < 0) poly = [...poly].reverse();
  const top = poly.map((p) => ({ x: p.x, y: p.y, z: z1 }));
  const bottom = poly.map((p) => ({ x: p.x, y: p.y, z: z0 }));
  const out: Face[] = [...cap(top, color), ...cap([...bottom].reverse(), color)];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const f = face([bottom[i], bottom[j], top[j], top[i]], color);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Un PROFIL dessiné à la main : le contour d'une pièce, à plat, tel que Frank
 * le trace dans `Composants.svg` et que `scripts/_extract-profils.mjs` le sort
 * en polygone (voir `docs/fr/Drawing-systems.md`). Le tracé est centré
 * sur le milieu de sa boîte englobante ; `w` et `h` la mesurent.
 */
export type Profile = { poly: Vec2[]; w: number; h: number; axes?: Record<string, Vec2> };

/** Repère d'un profil posé entre deux articulations : `u` le long de la pièce
 *  depuis `from`, `v` vers le haut, `side` en travers. `flat` porte un point du
 *  dessin (repère centré, y qui descend) dans ce repère, `at` l'envoie dans le
 *  monde à la distance `s` du plan moyen. Partagé par l'extrusion et la lecture
 *  des pastilles : la pièce et ses axes ne peuvent donc pas se désaccorder. */
function profileFrame(profile: Profile, from: Vec3, to: Vec3) {
  const span = sub(to, from);
  const axis = norm(span);
  const ref: Vec3 = Math.abs(axis.z) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const side = norm(cross(axis, ref));
  const up = norm(cross(side, axis));
  const k = profile.w > 1e-6 ? len(span) / profile.w : 1;
  // Le y du dessin descend (convention SVG), le v du monde monte : d'où le signe.
  const flat = (p: Vec2): Vec2 => ({ x: (p.x + profile.w / 2) * k, y: -p.y * k });
  const at = (p: Vec2, s: number): Vec3 =>
    add(add(add(from, scale(axis, p.x)), scale(up, p.y)), scale(side, s));
  return { flat, at };
}

/**
 * Les pastilles nommées d'un profil, une fois la pièce POSÉE entre `from` et
 * `to` : la patella dessiné sur le fémur devient un point du monde, à l'échelle de
 * la patte, au milieu de son épaisseur. C'est ainsi qu'un sous-ensemble s'accoste
 * sur un autre — le tibia tourne autour de la patella que le fémur a dessiné, plus
 * autour d'une cote reportée à la main.
 *
 * Passer le résultat à `articulations` pour les lire par famille.
 */
export function profileAxes(profile: Profile, from: Vec3, to: Vec3): Record<string, Vec3> {
  const { flat, at } = profileFrame(profile, from, to);
  const out: Record<string, Vec3> = {};
  for (const [name, p] of Object.entries(profile.axes ?? {})) out[name] = at(flat(p), 0);
  return out;
}

/**
 * Extrude un profil DESSINÉ le long du segment `from` → `to`, sur l'épaisseur
 * `thickness`. C'est la version « dessinée » de `boxFaces` : là où la boîte ne
 * sait faire qu'un pavé, celle-ci suit le contour du fémur, du servo ou de
 * l'équerre tel qu'il a été tracé.
 *
 * Le profil est vu DE CÔTÉ, pièce couchée à l'horizontale : son bord gauche
 * tombe sur `from`, son bord droit sur `to`, le haut du dessin reste en haut.
 * Il est mis à l'échelle en BLOC (largeur ET hauteur par le même facteur) :
 * la même pièce sert à la patte seule et à celles du robot, plus longues, sans
 * s'y déformer.
 */
export function extrudeProfile(
  profile: Profile, from: Vec3, to: Vec3, thickness: number, color: string,
  holes: Vec2[][] = [],
): Face[] {
  // Repère local (u le long de la pièce depuis `from`, v vers le haut), déjà en
  // unités de la feuille : le recoupage des faces peut s'y appliquer tel quel.
  const { flat, at } = profileFrame(profile, from, to);
  return slabCore(profile.poly.map(flat), holes.map((h) => h.map(flat)), at, thickness, color);
}

/**
 * Une PLAQUE de matière posée dans le volume : le contour dessiné est étalé dans
 * le plan `plane`, épaissi de `thickness` de part et d'autre, et posé centre sur
 * `center`. C'est la brique des ASSEMBLAGES — deux flancs de PMMA de 3 mm et les
 * servos pris en sandwich entre eux (docs/fr/Drawing-systems.md).
 *
 * Là où `extrudeProfile` met la pièce À L'ÉCHELLE entre deux articulations, ici
 * les cotes du dessin sont gardées TELLES QUELLES : dans un assemblage, 3 mm
 * d'épaisseur et 18 mm d'entrefer sont l'information même, pas une proportion.
 *
 * `xf` transforme chaque point dans le monde (lacet de présentation, éclaté des
 * pièces) : la pose reste ainsi décrite dans le repère simple de l'assemblage.
 */
export function slabFaces(
  poly: Vec2[], plane: Plane, center: Vec3, thickness: number, color: string,
  holes: Vec2[][] = [], xf: (p: Vec3) => Vec3 = (p) => p, grain = MAX_EDGE,
): Face[] {
  const { u, v } = PLANES[plane];
  const n = cross(u, v);
  const at = (p: Vec2, s: number): Vec3 => xf(add(center,
    add(add(scale(u, p.x), scale(v, p.y)), scale(n, s))));
  return slabCore(poly, holes, at, thickness, color, grain);
}

/** Comment le dessin à plat d'une pièce se pose dans le repère de l'assemblage.
 *  `u` suit le x du dessin, `v` son y (qui DESCEND, convention SVG). L'épaisseur
 *  part le long de u × v. Repère monde : X à droite, Y à l'arrière, Z en haut. */
export type Plane = 'dessus' | 'flanc' | 'face';
export const PLANES: Record<Plane, { u: Vec3; v: Vec3 }> = {
  // Vue de dessus, avant du robot en haut du dessin : le y qui descend va vers
  // l'arrière. Épaisseur verticale — châssis, platine, pont.
  dessus: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
  // Vue de côté, avant à gauche : le x va vers l'arrière, le y vers le bas.
  // Épaisseur en travers du robot — les deux flancs du corps.
  flanc: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: -1 } },
  // Vue de face : le x va vers la droite du robot, le y vers le bas. Épaisseur
  // d'avant en arrière — une cloison, un capot avant.
  face: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 } },
};

/** Une pièce d'assemblage, telle que `_extract-assemblage.mjs` la range : un
 *  contour à plat (centré sur sa boîte), son plan, sa pose et son épaisseur —
 *  le tout en MILLIMÈTRES, cotes du dessin comprises. */
export type AssemblyPiece = {
  name: string;
  plan: Plane;
  mat: string;
  /** Couleur de remplissage LUE SUR LE DESSIN, `#rrggbbaa` (transparence
   *  comprise). Elle prime sur `mat`, qui n'est plus que le repli d'une pièce
   *  laissée sans couleur — ou l'ordre écrit dans l'étiquette de pose. */
  fill?: string;
  ep: number;
  pos: Vec3;
  w: number;
  h: number;
  /** Axe de symétrie : la pièce est posée DEUX fois (les deux flancs du corps). */
  miroir?: string;
  poly: Vec2[];
  holes?: Vec2[][];
  /** Image PLAQUÉE sur la pièce, lue sur le dessin (v2026.8.59) : la photo d'une
   *  carte électronique posée sur son contour dans Inkscape. `o`, `u` et `v` sont
   *  en MILLIMÈTRES dans le repère du contour (même centrage que `poly`) : le
   *  coin de l'image, son côté large, son côté haut — trois points suffisent, y
   *  compris si Frank l'a tournée. `alpha` est son opacité, réglée dans Inkscape.
   *  L'image est plaquée sur la face VUE de la pièce et découpée à son contour. */
  img?: { href: string; o: Vec2; u: Vec2; v: Vec2; alpha: number };
};

/**
 * L'AXE d'une articulation : une DROITE, pas un point. Deux pièces en MIROIR (les
 * deux plaques du corps, les deux côtés du fémur) créent entre elles un axe de
 * rotation dirigé selon leur ÉPAISSEUR — la flèche « ép » du dessin. Une pièce
 * `dessus` donne donc un axe VERTICAL (z), un `flanc` un axe en travers (x).
 *
 * `dir` nomme cette direction, et le point rangé est le ZÉRO de l'axe : le milieu
 * des deux exemplaires en miroir, l'origine de l'assemblage sinon. C'est par ce
 * zéro que deux dessins se centrent l'un sur l'autre — leurs axes superposés,
 * leurs zéros confondus, sans une cote à reporter.
 */
export type Axis = Vec3 & { dir?: AxisDir };
export type AxisDir = 'x' | 'y' | 'z';

/** Un assemblage complet : ses pièces, ses axes d'articulation (les pastilles
 *  rouges nommées) et son encombrement, en millimètres. */
export type Assembly = {
  source: string;
  box: Vec3;
  axes: Record<string, Axis>;
  pieces: AssemblyPiece[];
};

/** Matières d'un assemblage : le mot du dessin dit la couleur, et rien d'autre.
 *  PMMA bleuté (le châssis découpé au laser), aluminium clair (les os), servos
 *  noirs, circuit imprimé vert, visserie dorée, batterie gris ardoise. */
export const MATIERES: Record<string, string> = {
  pmma: '#bcdff0',
  alu: '#c9d6de',
  servo: '#2f3640',
  carte: '#1f6b3a',
  laiton: '#c8ad63',
  pile: '#37474f',
};

/** Normale du plan d'une pièce : l'axe le long duquel part son épaisseur. */
export function planeNormal(plan: Plane): Vec3 {
  const { u, v } = PLANES[plan];
  return cross(u, v);
}

/** Le nom de cette normale — `dessus` → `z`, `flanc` → `x`, `face` → `y`. C'est
 *  la DIRECTION de l'axe d'articulation d'une pastille posée sur cette pièce :
 *  une plaque à plat pivote autour d'un axe vertical, un flanc autour d'un axe en
 *  travers du robot. */
export function planeAxisDir(plan: Plane): AxisDir {
  const n = planeNormal(plan);
  return Math.abs(n.z) > 0.5 ? 'z' : Math.abs(n.x) > 0.5 ? 'x' : 'y';
}

/** Le vecteur unité d'une direction d'axe, ou `null` si l'axe n'est pas orienté
 *  (une pastille de profil, dessinée hors assemblage). */
export function axisVector(dir?: AxisDir): Vec3 | null {
  if (!dir) return null;
  return { x: dir === 'x' ? 1 : 0, y: dir === 'y' ? 1 : 0, z: dir === 'z' ? 1 : 0 };
}

/**
 * Toutes les faces d'un ASSEMBLAGE, prêtes à être triées avec le reste de la
 * scène. Une pièce marquée `miroir` est posée deux fois, symétriquement : c'est
 * ainsi qu'UN dessin de flanc donne les DEUX flancs du corps.
 *
 * `scale` convertit les millimètres du plan en unités de la feuille, `xf` place
 * l'assemblage dans la scène (lacet de présentation), et `eclate` écarte chaque
 * pièce le long de sa normale — la vue éclatée d'une notice de montage, qui est
 * le seul moyen de voir ce qu'il y a entre deux flancs serrés à 3 mm.
 *
 * `grain` est la taille visée d'un triangle, dans les mêmes unités de feuille :
 * c'est une taille RELATIVE à la scène, donc elle suit l'échelle du dessin —
 * laissée fixe, un dessin deux fois plus grand quadruple son nombre de faces
 * pour exactement la même image.
 *
 * `simplify` allège les contours (en unités de la FEUILLE, après échelle) : un
 * composant de l'atelier, redessiné à chaque image d'animation, ne peut pas
 * porter les milliers de faces qu'un tracé Inkscape brut produit — alors qu'un
 * demi-pixel d'écart ne se voit pas. La fenêtre `npm run montre`, elle, garde le
 * tracé entier : c'est là qu'on vérifie un dessin.
 */
export function assemblyFaces(a: Assembly, opts: {
  scale?: number;
  xf?: (p: Vec3) => Vec3;
  eclate?: number;
  color?: (p: AssemblyPiece) => string;
  simplify?: number;
  grain?: number;
} = {}): Face[] {
  const k = opts.scale ?? 1;
  const xf = opts.xf ?? ((p: Vec3): Vec3 => p);
  const eclate = opts.eclate ?? 0;
  const tol = opts.simplify ?? 0;
  const grain = opts.grain ?? MAX_EDGE;
  const out: Face[] = [];
  const empiles: Empile[] = [];
  for (const p of a.pieces) {
    const color = opts.color?.(p) ?? p.fill ?? MATIERES[p.mat] ?? MATIERES.pmma;
    const n = planeNormal(p.plan);
    const poly = simplifyPoly(p.poly.map((q) => ({ x: q.x * k, y: q.y * k })), tol);
    const holes = (p.holes ?? [])
      .map((h) => simplifyPoly(h.map((q) => ({ x: q.x * k, y: q.y * k })), tol));
    for (const pos of mirrored(p)) {
      // Sens de l'éclaté : du côté où la pièce se trouve déjà. Une pièce pile au
      // milieu (une entretoise centrale) ne bouge pas, il n'y a rien à dégager.
      const along = dot(pos, n);
      const off = scale(n, eclate * Math.sign(along));
      const center = add(scale(pos, k), off);
      const faces = slabFaces(poly, p.plan, center, p.ep * k, color, holes, xf, grain);
      const decalque = p.img && imageFace(p, poly, k, center, xf, faces);
      if (decalque) faces.push(decalque);
      empiles.push({ ...boiteMonde(poly, p.plan, center, p.ep * k), faces, alpha: alphaColor(color) });
      out.push(...faces);
    }
  }
  empilement(empiles);
  return out;
}

/**
 * L'IMAGE d'une pièce, plaquée sur celui de ses deux flancs que l'on VOIT.
 *
 * Le côté vu ne se devine pas au plan de la pièce : le lacet de présentation
 * (`xf`) tourne toute la scène, et un flanc gauche devient un flanc droit. Les
 * deux candidats sont donc projetés et c'est le plus PROCHE de l'œil qui prend
 * l'image — mesuré, pas supposé.
 *
 * Le découpage est le contour de la pièce (`pts`), pas le rectangle du bitmap :
 * une photo posée sur une plaque échancrée s'arrête au bord de la plaque. Et la
 * profondeur est celle de la face la plus avancée de la pièce, comme un décalque
 * (`decalFaces`) — une plaque est découpée en dizaines de triangles rangés
 * chacun à SA profondeur, une image simplement soulevée passerait dessous.
 */
function imageFace(
  p: AssemblyPiece, poly: Vec2[], k: number, center: Vec3,
  xf: (q: Vec3) => Vec3, faces: Face[],
): Face | null {
  const img = p.img;
  if (!img || !img.href) return null;
  const { u, v } = PLANES[p.plan];
  const n = planeNormal(p.plan);
  const t = (p.ep * k) / 2;
  // `poly` arrive DÉJÀ à l'échelle de la feuille, l'image en millimètres : elle
  // passe donc par `k` ici, une fois, comme le contour l'a fait avant.
  const monde = (q: Vec2, s: number): Vec3 => xf(add(center,
    add(add(scale(u, q.x), scale(v, q.y)), scale(n, s))));
  // Le côté vu : celui dont le contour ressort le plus près de l'œil.
  const profondeur = (s: number): number => poly.reduce((m, q) => m + depth(monde(q, s)), 0);
  const s = profondeur(t) >= profondeur(-t) ? t + 0.02 : -t - 0.02;
  const ecran = (q: Vec2): Vec2 => project(monde(q, s));
  const mm = (q: Vec2): Vec2 => ({ x: q.x * k, y: q.y * k });
  let front = -Infinity;
  for (const f of faces) front = Math.max(front, f.z);
  return {
    pts: poly.map(ecran),
    z: front + 0.01,
    fill: 'none',
    // Même numéro de groupe que la pièce : c'est lui qui nomme le découpage dans
    // le SVG, et un id qui changerait à chaque image d'animation ferait repatcher
    // le `clip-path` de tout le robot soixante fois par seconde.
    g: faces[0]?.g,
    img: {
      href: img.href,
      o: ecran(mm(img.o)),
      u: ecran(mm({ x: img.o.x + img.u.x, y: img.o.y + img.u.y })),
      v: ecran(mm({ x: img.o.x + img.v.x, y: img.o.y + img.v.y })),
      alpha: img.alpha,
    },
  };
}

/** Une pièce POSÉE dans l'assemblage : ses faces, sa transparence et le pavé
 *  qu'elle occupe (avant le lacet de présentation, qui ne tourne qu'autour de Z
 *  et ne change donc rien aux hauteurs). */
type Empile = {
  z0: number; z1: number;
  bb: { x0: number; x1: number; y0: number; y1: number };
  faces: Face[];
  /** Opacité de la matière : elle dit comment la pièce sera PEINTE, donc quelle
   *  profondeur décide de son ordre de dessin (voir `empilement`). */
  alpha: number;
};

/** Le pavé englobant d'une pièce posée : son contour porté dans son plan, épaisseur
 *  comprise. */
function boiteMonde(poly: Vec2[], plan: Plane, center: Vec3, thickness: number): Omit<Empile, 'faces' | 'alpha'> {
  const { u, v } = PLANES[plan];
  const n = planeNormal(plan);
  const t = thickness / 2;
  const b = { z0: Infinity, z1: -Infinity, bb: { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity } };
  for (const q of poly) {
    for (const s of [-t, t]) {
      const x = center.x + u.x * q.x + v.x * q.y + n.x * s;
      const y = center.y + u.y * q.x + v.y * q.y + n.y * s;
      const z = center.z + u.z * q.x + v.z * q.y + n.z * s;
      b.z0 = Math.min(b.z0, z);
      b.z1 = Math.max(b.z1, z);
      b.bb.x0 = Math.min(b.bb.x0, x);
      b.bb.x1 = Math.max(b.bb.x1, x);
      b.bb.y0 = Math.min(b.bb.y0, y);
      b.bb.y1 = Math.max(b.bb.y1, y);
    }
  }
  return b;
}

/**
 * EMPILEMENT : une pièce entièrement au-dessus d'une autre passe DEVANT elle,
 * quoi qu'en dise la profondeur moyenne de ses faces.
 *
 * C'est un fait de la projection isométrique, pas une préférence : deux points qui
 * se projettent au même pixel avec z₂ > z₁ vérifient toujours depth₂ > depth₁ —
 * le plus haut est le plus près de l'œil. L'algorithme du peintre, lui, range
 * chaque face à sa profondeur MOYENNE : un triangle de plaque long de 20 mm se
 * retrouve rangé 10 mm trop en avant, et passe devant la carte posée dessus. Le
 * Pico W et le PCA9685 du robot en sortaient déchiquetés en morceaux blancs.
 *
 * Chaque pièce est donc remontée juste devant celles qu'elle surplombe (comme un
 * décalque devant sa plaque), les plus basses d'abord pour que l'empilement se
 * propage — batterie, plaque du dessous, plaque du dessus, cartes.
 *
 * Le décalage se calcule sur la profondeur qui DÉCIDE VRAIMENT du dessin, et
 * elle n'est pas la même selon la matière (v2026.8.58) : une pièce translucide
 * est peinte d'un bloc, à sa profondeur MOYENNE (`renderFaces`), une pièce opaque
 * triangle par triangle, donc entre son plus loin et son plus près. Calculé sur
 * les extrêmes des deux côtés, comme jusqu'ici, le décalage valait la DIAGONALE
 * de la pièce : les deux plaques du corps du robot partaient 27 unités en avant
 * et venaient recouvrir les servos des pattes, pourtant bien plus près de l'œil.
 */
function empilement(pieces: Empile[]): void {
  const n = pieces.length;
  if (n < 2) return;
  const chevauche = (a: Empile, b: Empile): boolean =>
    a.bb.x0 < b.bb.x1 && b.bb.x0 < a.bb.x1 && a.bb.y0 < b.bb.y1 && b.bb.y0 < a.bb.y1;
  // Qui est SOUS qui : dessous de l'un au niveau (ou au-dessus) du dessus de
  // l'autre, et empreintes qui se recouvrent — sans quoi l'ordre est sans effet.
  const sous: number[][] = pieces.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && pieces[i].z0 >= pieces[j].z1 - 1e-6 && pieces[i].z1 > pieces[j].z1
        && chevauche(pieces[i], pieces[j])) sous[i].push(j);
    }
  }
  // Étage de chaque pièce (rang topologique) : on traite les plus basses d'abord.
  const rang = pieces.map(() => 0);
  for (let pass = 0; pass < n; pass++) {
    let bouge = false;
    for (let i = 0; i < n; i++) {
      const r = sous[i].reduce((m, j) => Math.max(m, rang[j] + 1), 0);
      if (r > rang[i]) { rang[i] = r; bouge = true; }
    }
    if (!bouge) break;
  }
  // La plage de profondeur que chaque pièce OCCUPERA une fois peinte : un point
  // (la moyenne) si elle est translucide, l'intervalle de ses faces si elle est
  // opaque. C'est là-dessus, et non sur les sommets du pavé, que se règle
  // l'empilement.
  const repere = pieces.map((p) => {
    if (!p.faces.length) return { arriere: 0, avant: 0 };
    if (p.alpha < 1) {
      const moy = p.faces.reduce((s, f) => s + f.z, 0) / p.faces.length;
      return { arriere: moy, avant: moy };
    }
    let arriere = Infinity;
    let avant = -Infinity;
    for (const f of p.faces) {
      arriere = Math.min(arriere, f.z);
      avant = Math.max(avant, f.z);
    }
    return { arriere, avant };
  });
  for (const i of pieces.map((_, q) => q).sort((x, y) => rang[x] - rang[y])) {
    if (!sous[i].length || !pieces[i].faces.length) continue;
    let devant = -Infinity;
    for (const j of sous[i]) devant = Math.max(devant, repere[j].avant);
    if (devant === -Infinity) continue;
    const d = devant + 0.01 - repere[i].arriere;
    if (d <= 0) continue;
    for (const f of pieces[i].faces) f.z += d;
    repere[i].arriere += d;
    repere[i].avant += d;
  }
}

/** Les deux poses d'une pièce en miroir, ou son unique pose. */
export function mirrored(p: AssemblyPiece): Vec3[] {
  if (!p.miroir) return [p.pos];
  const axis = p.miroir as 'x' | 'y' | 'z';
  return [p.pos, { ...p.pos, [axis]: -p.pos[axis] }];
}

/** Tous les sommets d'un assemblage en 3D, en millimètres : le contour de chaque
 *  pièce porté dans son plan, les deux exemplaires d'une pièce en miroir
 *  compris. C'est de quoi CADRER un dessin et le mesurer (où tombe le bout d'une
 *  patte, quelle place tient le robot bras tendus) sans rien recopier de ses
 *  cotes.
 *
 *  `withEp` porte en plus les deux peaux de chaque pièce, écartées de son
 *  épaisseur : indispensable pour cadrer (un servo de 24,5 mm posé à plat
 *  dépasse de 12 mm du contour, et c'est ce qui sortait de la feuille), inutile
 *  pour repérer un point du dessin — on veut alors le contour, pas ses coins. */
export function assemblyVertices(a: Assembly, withEp = false): Vec3[] {
  const out: Vec3[] = [];
  for (const p of a.pieces) {
    const { u, v } = PLANES[p.plan];
    const n = planeNormal(p.plan);
    const skins = withEp ? [-p.ep / 2, p.ep / 2] : [0];
    for (const pos of mirrored(p)) {
      for (const q of p.poly) {
        for (const s of skins) {
          out.push({
            x: pos.x + u.x * q.x + v.x * q.y + n.x * s,
            y: pos.y + u.y * q.x + v.y * q.y + n.y * s,
            z: pos.z + u.z * q.x + v.z * q.y + n.z * s,
          });
        }
      }
    }
  }
  return out;
}

/** Position d'un AXE d'articulation dans la scène : la pastille rouge nommée du
 *  dessin, mise à l'échelle et placée. C'est le dessin qui dit où est la coxa,
 *  plus une constante du code. Rend `null` si l'axe n'est pas dessiné. */
export function assemblyAxis(
  a: Assembly, name: string, scaleK = 1, xf: (p: Vec3) => Vec3 = (p) => p,
): Vec3 | null {
  const v = a.axes[name];
  return v ? xf(scale(v, scaleK)) : null;
}

/** La FAMILLE d'une pastille : son PREMIER mot — `coxa-gh` → `coxa`,
 *  `patella-t` → `patella`, `patella` → `patella`. C'est TOUTE la règle du dessin : le
 *  premier mot dit à quoi la pastille s'emboîte, ce qui vient après ne sert qu'à
 *  distinguer deux pastilles voisines (`-gh`/`-db` sur le corps, `-f`/`-t` de
 *  part et d'autre de la patella — Inkscape exige des ids uniques).
 *
 *  Deux ensembles qui nomment la même famille sont faits pour s'emboîter, et
 *  c'est le NOMBRE de pastilles de cette famille qui dit combien d'exemplaires il
 *  faut : quatre `coxa…` sur le corps, une `coxa` sur le fémur → quatre
 *  fémurs. */
export function axisFamily(name: string): string {
  const i = name.indexOf('-');
  return i > 0 ? name.slice(0, i) : name;
}

/**
 * Une ARTICULATION : UNE pastille rouge et l'AXE qu'elle porte. Il n'y a rien à
 * regrouper — chaque pastille est un pivot à elle seule.
 *
 * `name` est le nom entier de la pastille (`coxa-gh`), `famille` son premier
 * mot (`coxa`), `at` le ZÉRO de son axe dans le repère de l'ensemble, et `dir`
 * la direction de cet axe (l'épaisseur de la pièce qui la porte : `z` pour une
 * plaque posée à plat, `x` pour un flanc).
 */
export type Articulation = { name: string; famille: string; at: Vec3; dir?: AxisDir };

/**
 * Les ARTICULATIONS d'un assemblage : ses pastilles, une par une, dans l'ordre
 * des noms. C'est par elles que deux sous-ensembles s'assemblent — le fémur se
 * pose sur une coxa du corps, le tibia sur la patella du fémur. Les deux dessins
 * nomment la MÊME famille, et il n'y a plus rien à mesurer.
 *
 * Prend un assemblage, ou directement des pastilles déjà placées — celles d'un
 * PROFIL posé, rendues par `profileAxes` : la règle est la même des deux côtés,
 * le dessin d'une pièce isolée n'a pas de convention à part.
 */
export function articulations(src: Assembly | Record<string, Axis>, scaleK = 1): Articulation[] {
  const axes = (src as Assembly).axes ?? (src as Record<string, Axis>);
  return Object.entries(axes)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([name, v]) => ({
      name,
      famille: axisFamily(name),
      at: scale(v, scaleK),
      ...(v.dir ? { dir: v.dir } : {}),
    }));
}

/** Un ensemble nommé — un assemblage ou un profil vu comme tel — tel que le
 *  monteur le reçoit. */
export type Ensemble = { nom: string; A: Assembly };

/**
 * Un exemplaire posé dans la scène : `pos` sa translation en millimètres,
 * `lacet` sa rotation autour de Z, appliquée AVANT la translation. Un point `q`
 * de l'ensemble tombe donc en `rotZ(q, lacet) + pos`.
 *
 * `via` nomme l'articulation du parent sur laquelle il s'est posé ; la base du
 * montage a `parent` et `via` vides.
 */
export type Instance = { nom: string; pos: Vec3; lacet: number; parent: string; via: string };

/** Centre des pièces d'un assemblage dans le plan X/Y : la moyenne de leurs
 *  poses. Sert à savoir de quel côté « dehors » se trouve — c'est ce qui écarte
 *  les quatre pattes au lieu de les empiler. */
function centreXY(a: Assembly): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of a.pieces) {
    x += p.pos.x;
    y += p.pos.y;
  }
  const n = Math.max(a.pieces.length, 1);
  return { x: x / n, y: y / n };
}

/** Le SENS d'un ensemble vu depuis une de ses articulations : vers l'articulation
 *  suivante si elle existe (un fémur va de la coxa à la patella), sinon vers le
 *  centre de ses pièces. Rendu dans le plan X/Y, non normalisé. */
function sensDepuis(a: Assembly, joints: Articulation[], depuis: Articulation): Vec2 {
  for (const j of joints) {
    if (j.famille === depuis.famille) continue;
    const d = { x: j.at.x - depuis.at.x, y: j.at.y - depuis.at.y };
    if (Math.hypot(d.x, d.y) > 1e-3) return d;
  }
  const c = centreXY(a);
  return { x: c.x - depuis.at.x, y: c.y - depuis.at.y };
}

const degXY = (v: Vec2): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/**
 * MONTAGE : chaque ensemble posé sur les articulations du précédent, jusqu'à ce
 * que le robot soit entier. C'est la réponse à « montre-moi l'araignée », pas
 * trois dessins côte à côte.
 *
 * La règle tient en une phrase : **deux ensembles dont une pastille porte le même
 * PREMIER MOT s'emboîtent, et celui qui en offre le plus porte l'autre.** Le
 * corps a quatre pastilles `coxa…`, le fémur une seule `coxa` : le corps est
 * la base et il naît quatre fémurs. Chaque fémur a un `patella-f`, le tibia un
 * `patella-t` : un tibia par fémur, soit quatre.
 *
 * Ce qui se superpose, ce sont les AXES : deux droites de même direction, mises
 * l'une sur l'autre et CENTRÉES SUR LEUR ZÉRO — le milieu des deux pièces en
 * miroir de chaque côté. C'est le dessin qui a dit où elles passent, il n'y a
 * rien à coter. (Les zéros étant rangés à l'extraction, la superposition des
 * points `at` suffit ici : elle place les deux droites l'une sur l'autre.)
 *
 * Le LACET d'un exemplaire est celui de son parent, plus l'écart qu'il faut pour
 * que la pièce parte vers l'extérieur quand la famille compte plusieurs
 * articulations (les quatre pattes s'écartent) ; une famille à une seule
 * articulation ne tourne rien, l'enfant suit son parent (le tibia prolonge le
 * fémur).
 *
 * Un ensemble qui ne partage aucune famille reste à sa propre place, sans
 * parent : rien n'est inventé, et son absence de montage se voit.
 */
export function montage(ensembles: Ensemble[]): Instance[] {
  const joints = new Map<string, Articulation[]>();
  for (const e of ensembles) joints.set(e.nom, articulations(e.A));
  // La BASE : celle qui offre le plus d'articulations — c'est le corps qui porte
  // les coxas, jamais la patte qui n'en demande qu'une.
  const ordre = [...ensembles].sort((x, y) =>
    (joints.get(y.nom)!.length - joints.get(x.nom)!.length) || x.nom.localeCompare(y.nom));
  const par = new Map(ensembles.map((e) => [e.nom, e.A]));
  const reste = new Set(ordre.map((e) => e.nom));
  const posees = new Map<string, Instance[]>();
  const out: Instance[] = [];
  const file: string[] = [];

  const poser = (nom: string, insts: Instance[]): void => {
    posees.set(nom, insts);
    out.push(...insts);
    reste.delete(nom);
    file.push(nom);
  };

  while (reste.size) {
    // Une racine à la fois : la première de l'ordre encore libre. Un second robot
    // sur la planche fonde ainsi son propre montage au lieu de se coller au premier.
    const racine = ordre.find((e) => reste.has(e.nom))!;
    poser(racine.nom, [{ nom: racine.nom, pos: { x: 0, y: 0, z: 0 }, lacet: 0, parent: '', via: '' }]);
    while (file.length) {
      const pnom = file.shift()!;
      const P = par.get(pnom)!;
      const pj = joints.get(pnom)!;
      const familles = new Map<string, Articulation[]>();
      for (const j of pj) {
        if (!familles.has(j.famille)) familles.set(j.famille, []);
        familles.get(j.famille)!.push(j);
      }
      for (const enfant of ordre) {
        if (!reste.has(enfant.nom)) continue;
        const ej = joints.get(enfant.nom)!;
        // Une famille partagée dont les deux axes pointent dans le MÊME sens passe
        // devant : deux droites de directions différentes ne se superposent pas,
        // et le monteur ne sait tourner qu'autour de Z. À défaut, la famille
        // partagée est prise telle quelle — mieux vaut un montage visiblement de
        // travers qu'un ensemble laissé seul dans son coin sans qu'on sache pourquoi.
        const partagees = ej.map((j) => j.famille).sort().filter((f) => familles.has(f));
        const commune = partagees.find((f) => {
          const a = ej.find((j) => j.famille === f)!;
          const b = familles.get(f)![0];
          return !a.dir || !b.dir || a.dir === b.dir;
        }) ?? partagees[0];
        if (!commune) continue;
        const accroche = ej.find((j) => j.famille === commune)!;
        const points = familles.get(commune)!;
        const cp = centreXY(P);
        const insts: Instance[] = [];
        for (const pi of posees.get(pnom)!) {
          for (const pt of points) {
            // Une famille à plusieurs articulations écarte ses enfants : chacun
            // part du côté où sa coxa se trouve déjà sur le corps.
            const delta = points.length > 1
              ? degXY({ x: pt.at.x - cp.x, y: pt.at.y - cp.y })
                - degXY(sensDepuis(enfant.A, ej, accroche))
              : 0;
            const lacet = pi.lacet + delta;
            const monde = add(rotZ(pt.at, pi.lacet), pi.pos);
            insts.push({
              nom: enfant.nom,
              pos: sub(monde, rotZ(accroche.at, lacet)),
              lacet,
              parent: pnom,
              via: pt.name,
            });
          }
        }
        poser(enfant.nom, insts);
      }
    }
  }
  return out;
}

/**
 * Cœur commun d'une pièce épaissie : deux flancs triangulés, leurs perçages, et
 * la tranche. `at(p, s)` place un point du dessin (`p`) à la distance `s` du
 * plan moyen — c'est lui seul qui distingue une pièce couchée entre deux
 * articulations d'une plaque posée dans un assemblage.
 */
function slabCore(
  poly: Vec2[], holes: Vec2[][], at: (p: Vec2, s: number) => Vec3,
  thickness: number, color: string, grain = MAX_EDGE,
): Face[] {
  let local = poly;
  if (signedArea(local) < 0) local = [...local].reverse();
  const t = thickness / 2;
  const out: Face[] = [];
  // Les deux flancs, triangulés et recoupés comme un dessus de prisme. Ils sont
  // gardés séparés : c'est devant le flanc VU que se rangent ses perçages.
  const tris: Vec2[][] = [];
  for (const tri of triangulate(local)) subdivide(tri, tris, grain);
  const sides: Face[][] = [[], []];
  for (const tri of tris) {
    const a = face(tri.map((p) => at(p, t)), color);
    if (a) sides[0].push(a);
    const b = face([...tri].reverse().map((p) => at(p, -t)), color);
    if (b) sides[1].push(b);
  }
  out.push(...sides[0], ...sides[1]);
  // Les perçages, sur le flanc que l'on voit. Même repère que le contour : un
  // trou dessiné à 3 px du bord y reste.
  const dark = shade(color, 0.45);
  for (const hole of holes) {
    for (const [i, s] of [t + 0.05, -t - 0.05].entries()) {
      if (!sides[i].length) continue;
      const front = Math.max(...sides[i].map((f) => f.z));
      const htris: Vec2[][] = [];
      for (const tri of triangulate(hole)) subdivide(tri, htris, grain);
      for (const tri of htris) {
        const ordered = i === 0 ? tri : [...tri].reverse();
        const f = face(ordered.map((p) => at(p, s)), dark);
        if (!f) continue;
        f.z = front + 0.01;
        out.push(f);
      }
    }
  }
  // La tranche : un quadrilatère par arête du contour.
  for (let i = 0; i < local.length; i++) {
    const p = local[i];
    const q = local[(i + 1) % local.length];
    const f = face([at(p, -t), at(q, -t), at(q, t), at(p, t)], color);
    if (f) out.push(f);
  }
  return grouper(out);
}

/**
 * DÉCALQUE : un polygone plat posé à l'altitude `z` sur la face qui le porte.
 * Sert aux perçages du châssis et aux marquages — les dessiner en creux
 * demanderait de trianguler un polygone à trous, alors qu'une tache sombre à la
 * bonne place fait la même image.
 *
 * `over` : les faces de la pièce porteuse. Le décalque est rangé JUSTE DEVANT
 * la plus proche d'entre elles, et non simplement soulevé de quelques dixièmes :
 * la plaque est découpée en dizaines de triangles, chacun rangé à SA profondeur,
 * et ceux du bord arrière passent devant tout ce qui se trouve au centre — un
 * perçage soulevé de 0,4 disparaissait sous sa propre plaque. Rien d'autre n'est
 * masqué pour autant : une patte qui survole la plaque est bien plus près de
 * l'œil que n'importe quel morceau de celle-ci.
 */
export function decalFaces(poly: Vec2[], z: number, color: string, over: Face[] = []): Face[] {
  const tris: Vec2[][] = [];
  for (const tri of triangulate(poly)) subdivide(tri, tris);
  let front = -Infinity;
  for (const f of over) front = Math.max(front, f.z);
  const out: Face[] = [];
  for (const tri of tris) {
    const f = face(tri.map((p) => ({ x: p.x, y: p.y, z: z + 0.05 })), color);
    if (!f) continue;
    if (front > -Infinity) f.z = front + 0.01;
    out.push(f);
  }
  return out;
}

/** Polygone régulier à `n` côtés, rayon `r`, centré à l'origine (plan X/Y). */
export function regularPoly(n: number, r: number, phase = 0): Vec2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i * 2 * Math.PI) / n;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

/** L'alpha d'une couleur, quelle que soit son écriture : `#rrggbbaa` (celle du
 *  dessin), `rgba(…)` (celle que rend `shade`), et 1 pour tout le reste. */
export function alphaColor(color: string): number {
  if (color[0] === '#') {
    const h = color.slice(1);
    return h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  }
  if (!color.startsWith('rgba(')) return 1;
  const m = color.match(/[\d.]+/g);
  return m && m.length > 3 ? Number(m[3]) : 1;
}

/** La même couleur, OPAQUE : dans un groupe translucide, c'est le groupe qui
 *  porte la transparence — ses faces s'y peignent pleines. */
function sansAlpha(fill: string): string {
  if (!fill.startsWith('rgba(')) return fill;
  const m = fill.match(/[\d.]+/g);
  return m ? `rgb(${m[0]},${m[1]},${m[2]})` : fill;
}

/**
 * Sort les faces triées du plus LOIN au plus près (algorithme du peintre) et
 * translatées au centre voulu de la feuille. Le liseré de même couleur que le
 * remplissage bouche les coutures blanches que l'anticrénelage laisse entre
 * deux polygones adjacents.
 *
 * **La TRANSPARENCE est portée par la pièce, pas par ses triangles.** Une plaque
 * de PMMA est découpée en dizaines de triangles : peints translucides un par un,
 * chaque arête intérieure reçoit deux couches de couleur (quatre avec les
 * liserés) et la triangulation apparaît en toile d'araignée. Les faces d'une
 * même pièce (`Face.g`) sont donc peintes PLEINES dans un `<g opacity>` unique :
 * le groupe est aplati avant d'être composé, la matière ne se traverse qu'une
 * fois, et les liserés peuvent rester — plus de couture, plus de toile.
 *
 * Le prix est que la pièce est alors rangée à UNE profondeur (la moyenne des
 * siennes) au lieu d'une par triangle. C'est le même compromis que celui
 * qu'`empilement` fait déjà pièce par pièce, et il ne concerne que les pièces
 * translucides : les opaques gardent leur tri au triangle près.
 */
export function renderFaces(faces: Face[], cx: number, cy: number): SVGTemplateResult[] {
  type Paquet = { z: number; faces: Face[]; alpha: number };
  const paquets: Paquet[] = [];
  const parGroupe = new Map<number, Paquet>();
  for (const f of faces) {
    // Une image plaquée est peinte SEULE, à sa profondeur : elle porte sa propre
    // opacité et son propre découpage, elle n'a rien à mettre en commun avec les
    // triangles de la pièce.
    if (f.img) { paquets.push({ z: f.z, faces: [f], alpha: 1 }); continue; }
    const a = alphaColor(f.fill);
    if (a >= 1) { paquets.push({ z: f.z, faces: [f], alpha: 1 }); continue; }
    // Une face translucide isolée (un décalque) forme un groupe à elle seule :
    // elle est aplatie pareil, sans jamais se recouvrir elle-même.
    const cle = f.g ?? -(++groupeSeq);
    let p = parGroupe.get(cle);
    if (!p) { p = { z: 0, faces: [], alpha: a }; parGroupe.set(cle, p); paquets.push(p); }
    p.faces.push(f);
  }
  for (const p of parGroupe.values()) {
    p.z = p.faces.reduce((s, f) => s + f.z, 0) / p.faces.length;
  }
  const points = (f: Face): string =>
    f.pts.map((p) => `${(p.x + cx).toFixed(2)},${(p.y + cy).toFixed(2)}`).join(' ');
  // Une image plaquée : le bitmap est dessiné dans un carré unité et c'est la
  // MATRICE qui l'amène sur la face — les trois points projetés (coin, côté
  // large, côté haut) sont exactement ses deux vecteurs et son origine. Aucun
  // besoin de connaître la taille en pixels du fichier, ni de gérer une rotation
  // à part : la projection isométrique d'un rectangle est un parallélogramme, et
  // un parallélogramme EST une matrice affine.
  const image = (f: Face): SVGTemplateResult => {
    const g = f.img as FaceImage;
    const id = `kx-img-${f.g ?? ++groupeSeq}`;
    const m = [g.u.x - g.o.x, g.u.y - g.o.y, g.v.x - g.o.x, g.v.y - g.o.y, g.o.x + cx, g.o.y + cy]
      .map((n) => n.toFixed(3)).join(' ');
    return svg`<clipPath id=${id}><polygon points=${points(f)} /></clipPath>
      <g clip-path=${`url(#${id})`} opacity=${g.alpha}>
        <image href=${g.href} width="1" height="1" preserveAspectRatio="none"
          transform=${`matrix(${m})`} />
      </g>`;
  };
  const polygone = (f: Face): SVGTemplateResult => {
    if (f.img) return image(f);
    const fill = sansAlpha(f.fill);
    return svg`<polygon points=${points(f)} fill=${fill} stroke=${fill} stroke-width="0.6" stroke-linejoin="round" />`;
  };
  return paquets
    .sort((a, b) => a.z - b.z)
    .map((p) => (p.alpha >= 1
      ? polygone(p.faces[0])
      : svg`<g opacity=${p.alpha}>${[...p.faces].sort((a, b) => a.z - b.z).map(polygone)}</g>`));
}

/** Les trois couleurs du repère, dans l'ordre X, Y, Z. Rouge / vert / bleu :
 *  c'est la convention de tous les logiciels de volume, autant ne pas en
 *  inventer une. */
export const AXIS_COLORS = ['#d8443c', '#2f9e44', '#1c6fd0'] as const;

/**
 * Le REPÈRE X/Y/Z dessiné dans la scène : trois flèches parties de `origin`,
 * longues de `size`, chacune étiquetée. Sans lui, une image en volume ne dit
 * pas dans quel sens la pièce est partie — et c'est justement la question quand
 * un dessin ne donne pas ce qu'on attendait.
 *
 * `xf` place le repère comme le reste de la scène (le lacet de présentation) :
 * les flèches tournent avec elle, ce qui est tout l'intérêt. `cx`/`cy` sont le
 * centre de feuille, comme pour `renderFaces`.
 */
export function axisGizmo(
  origin: Vec3, size: number, cx: number, cy: number,
  xf: (p: Vec3) => Vec3 = (p) => p,
  opts: {
    /** Ce qu'on écrit au bout des trois flèches. */
    labels?: readonly [string, string, string];
    /** Les trois directions, si ce ne sont pas celles du monde : le `u`, le `v`
     *  et la normale d'un PLAN de dessin, pour montrer où part le x d'une feuille. */
    dirs?: readonly [Vec3, Vec3, Vec3];
    colors?: readonly [string, string, string];
  } = {},
): SVGTemplateResult[] {
  const labels = opts.labels ?? ['X', 'Y', 'Z'];
  const cols = opts.colors ?? AXIS_COLORS;
  const dirs: readonly Vec3[] = opts.dirs
    ?? [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
  const o = project(xf(origin));
  const out: SVGTemplateResult[] = [];
  for (let i = 0; i < 3; i++) {
    const t = project(xf(add(origin, scale(dirs[i], size))));
    const dx = t.x - o.x;
    const dy = t.y - o.y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    // Pointe de flèche : un triangle posé sur le bout, jamais plus long que le
    // tiers de la flèche (Y se projette court quand la scène est tournée).
    const h = Math.min(8, l * 0.34);
    const bx = t.x - ux * h;
    const by = t.y - uy * h;
    const px = -uy * h * 0.45;
    const py = ux * h * 0.45;
    const pt = (x: number, y: number): string => `${(x + cx).toFixed(2)},${(y + cy).toFixed(2)}`;
    out.push(svg`<line x1=${(o.x + cx).toFixed(2)} y1=${(o.y + cy).toFixed(2)}
        x2=${(bx + cx).toFixed(2)} y2=${(by + cy).toFixed(2)}
        stroke=${cols[i]} stroke-width="1.7" stroke-linecap="round" />
      <polygon points=${`${pt(t.x, t.y)} ${pt(bx + px, by + py)} ${pt(bx - px, by - py)}`}
        fill=${cols[i]} />
      <text x=${(t.x + ux * 9 + cx).toFixed(2)} y=${(t.y + uy * 9 + cy + 4).toFixed(2)}
        text-anchor="middle" font-size="11" font-family="sans-serif" font-weight="700"
        fill=${cols[i]}>${labels[i]}</text>`);
  }
  return out;
}

/**
 * Le DÉGRADÉ des ombres portées : noir au centre, éteint sur le bord. À déclarer
 * une fois dans les `<defs>` du composant, puis à nommer dans `groundShadow`.
 *
 * Une ombre à bord net est un décalque de dessin animé : sous une lumière de
 * pièce, rien ne projette de contour franc. Le dégradé coûte un élément de plus
 * et rien à l'affichage — là où un `feGaussianBlur` ferait passer toute la scène
 * par un filtre, à chaque image d'animation.
 */
export function shadowGradient(id: string): SVGTemplateResult {
  return svg`<radialGradient id=${id}>
    <stop offset="0%" stop-color="#000" stop-opacity="0.26" />
    <stop offset="45%" stop-color="#000" stop-opacity="0.19" />
    <stop offset="78%" stop-color="#000" stop-opacity="0.07" />
    <stop offset="100%" stop-color="#000" stop-opacity="0" />
  </radialGradient>`;
}

/**
 * Ombre portée au sol (z = 0) d'un point : elle donne la HAUTEUR, qu'aucune
 * projection isométrique ne sait rendre à elle seule.
 *
 * `fondu` nomme le dégradé de `shadowGradient` : l'ombre est alors DIFFUSE. Elle
 * s'étale et pâlit en montant, comme une vraie — `ref` est la hauteur à laquelle
 * elle a doublé de rayon, `max` son étalement maximal. C'est ce qui fait lire
 * « ce pied-là est levé » d'un coup d'œil, là où une tache de taille fixe ne
 * disait que « le pied est ici ».
 */
export function groundShadow(
  p: Vec3, r: number, cx: number, cy: number,
  opts: { fondu?: string; ref?: number; max?: number } = {},
): SVGTemplateResult {
  const c = project({ x: p.x, y: p.y, z: 0 });
  const k = opts.ref
    ? Math.min(opts.max ?? 2, 1 + Math.max(0, p.z) / opts.ref)
    : 1;
  const fill = opts.fondu ? `url(#${opts.fondu})` : 'rgba(0,0,0,0.16)';
  return svg`<ellipse cx=${(c.x + cx).toFixed(2)} cy=${(c.y + cy).toFixed(2)}
    rx=${(r * COS30 * 2 * k).toFixed(2)} ry=${(r * k).toFixed(2)}
    fill=${fill} opacity=${(1 / k).toFixed(3)} />`;
}
