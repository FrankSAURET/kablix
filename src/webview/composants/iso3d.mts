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

/** Une face prête à sortir : ses sommets projetés, sa profondeur, sa couleur. */
export type Face = { pts: Vec2[]; z: number; fill: string };

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
  return quads.map((q) => face(q, color)).filter((f): f is Face => f !== null);
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
 *  `MAX_EDGE`. Les morceaux partagent la normale du triangle d'origine, donc sa
 *  teinte : le découpage reste invisible. */
function subdivide(tri: Vec2[], out: Vec2[][]): void {
  const [a, b, c] = tri;
  const e = [
    { d: Math.hypot(b.x - a.x, b.y - a.y), i: 0 },
    { d: Math.hypot(c.x - b.x, c.y - b.y), i: 1 },
    { d: Math.hypot(a.x - c.x, a.y - c.y), i: 2 },
  ].sort((p, q) => q.d - p.d)[0];
  if (e.d <= MAX_EDGE) { out.push(tri); return; }
  const v = [a, b, c];
  const p = v[e.i];
  const q = v[(e.i + 1) % 3];
  const r = v[(e.i + 2) % 3];
  const m: Vec2 = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  subdivide([p, m, r], out);
  subdivide([m, q, r], out);
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
export type Profile = { poly: Vec2[]; w: number; h: number };

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
  const span = sub(to, from);
  const axis = norm(span);
  const ref: Vec3 = Math.abs(axis.z) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const side = norm(cross(axis, ref));
  const up = norm(cross(side, axis));
  const k = profile.w > 1e-6 ? len(span) / profile.w : 1;
  // Repère local (u le long de la pièce depuis `from`, v vers le haut), déjà en
  // unités de la feuille : le recoupage des faces peut s'y appliquer tel quel.
  // Le y du dessin descend (convention SVG), le v du monde monte : d'où le signe.
  const flat = (p: Vec2): Vec2 => ({ x: (p.x + profile.w / 2) * k, y: -p.y * k });
  const at = (p: Vec2, s: number): Vec3 =>
    add(add(add(from, scale(axis, p.x)), scale(up, p.y)), scale(side, s));
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
  holes: Vec2[][] = [], xf: (p: Vec3) => Vec3 = (p) => p,
): Face[] {
  const { u, v } = PLANES[plane];
  const n = cross(u, v);
  const at = (p: Vec2, s: number): Vec3 => xf(add(center,
    add(add(scale(u, p.x), scale(v, p.y)), scale(n, s))));
  return slabCore(poly, holes, at, thickness, color);
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
};

/** Un assemblage complet : ses pièces, ses axes d'articulation (les pastilles
 *  rouges nommées) et son encombrement, en millimètres. */
export type Assembly = {
  source: string;
  box: Vec3;
  axes: Record<string, Vec3>;
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

/**
 * Toutes les faces d'un ASSEMBLAGE, prêtes à être triées avec le reste de la
 * scène. Une pièce marquée `miroir` est posée deux fois, symétriquement : c'est
 * ainsi qu'UN dessin de flanc donne les DEUX flancs du corps.
 *
 * `scale` convertit les millimètres du plan en unités de la feuille, `xf` place
 * l'assemblage dans la scène (lacet de présentation), et `eclate` écarte chaque
 * pièce le long de sa normale — la vue éclatée d'une notice de montage, qui est
 * le seul moyen de voir ce qu'il y a entre deux flancs serrés à 3 mm.
 */
export function assemblyFaces(a: Assembly, opts: {
  scale?: number;
  xf?: (p: Vec3) => Vec3;
  eclate?: number;
  color?: (p: AssemblyPiece) => string;
} = {}): Face[] {
  const k = opts.scale ?? 1;
  const xf = opts.xf ?? ((p: Vec3): Vec3 => p);
  const eclate = opts.eclate ?? 0;
  const out: Face[] = [];
  for (const p of a.pieces) {
    const color = opts.color?.(p) ?? p.fill ?? MATIERES[p.mat] ?? MATIERES.pmma;
    const n = planeNormal(p.plan);
    const poly = p.poly.map((q) => ({ x: q.x * k, y: q.y * k }));
    const holes = (p.holes ?? []).map((h) => h.map((q) => ({ x: q.x * k, y: q.y * k })));
    for (const pos of mirrored(p)) {
      // Sens de l'éclaté : du côté où la pièce se trouve déjà. Une pièce pile au
      // milieu (une entretoise centrale) ne bouge pas, il n'y a rien à dégager.
      const along = dot(pos, n);
      const off = scale(n, eclate * Math.sign(along));
      const center = add(scale(pos, k), off);
      out.push(...slabFaces(poly, p.plan, center, p.ep * k, color, holes, xf));
    }
  }
  return out;
}

/** Les deux poses d'une pièce en miroir, ou son unique pose. */
function mirrored(p: AssemblyPiece): Vec3[] {
  if (!p.miroir) return [p.pos];
  const axis = p.miroir as 'x' | 'y' | 'z';
  return [p.pos, { ...p.pos, [axis]: -p.pos[axis] }];
}

/** Position d'un AXE d'articulation dans la scène : la pastille rouge nommée du
 *  dessin, mise à l'échelle et placée. C'est le dessin qui dit où est la hanche,
 *  plus une constante du code. Rend `null` si l'axe n'est pas dessiné. */
export function assemblyAxis(
  a: Assembly, name: string, scaleK = 1, xf: (p: Vec3) => Vec3 = (p) => p,
): Vec3 | null {
  const v = a.axes[name];
  return v ? xf(scale(v, scaleK)) : null;
}

/**
 * Cœur commun d'une pièce épaissie : deux flancs triangulés, leurs perçages, et
 * la tranche. `at(p, s)` place un point du dessin (`p`) à la distance `s` du
 * plan moyen — c'est lui seul qui distingue une pièce couchée entre deux
 * articulations d'une plaque posée dans un assemblage.
 */
function slabCore(
  poly: Vec2[], holes: Vec2[][], at: (p: Vec2, s: number) => Vec3,
  thickness: number, color: string,
): Face[] {
  let local = poly;
  if (signedArea(local) < 0) local = [...local].reverse();
  const t = thickness / 2;
  const out: Face[] = [];
  // Les deux flancs, triangulés et recoupés comme un dessus de prisme. Ils sont
  // gardés séparés : c'est devant le flanc VU que se rangent ses perçages.
  const tris: Vec2[][] = [];
  for (const tri of triangulate(local)) subdivide(tri, tris);
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
      for (const tri of triangulate(hole)) subdivide(tri, htris);
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
  return out;
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

/**
 * Sort les faces triées du plus LOIN au plus près (algorithme du peintre) et
 * translatées au centre voulu de la feuille. Le liseré de même couleur que le
 * remplissage bouche les coutures blanches que l'anticrénelage laisse entre
 * deux polygones adjacents.
 *
 * **Une face TRANSLUCIDE n'a pas de liseré** : une plaque est découpée en
 * dizaines de triangles, et sur chaque arête intérieure le liseré de l'un
 * recouvre celui de l'autre — quatre couches de couleur au lieu d'une. Opaque,
 * cela ne se voit pas ; translucide, cela dessine une toile d'araignée sur toute
 * la pièce. Sans liseré, il ne reste que la couture d'anticrénelage, invisible
 * sur une matière qu'on traverse du regard.
 */
export function renderFaces(faces: Face[], cx: number, cy: number): SVGTemplateResult[] {
  return [...faces]
    .sort((a, b) => a.z - b.z)
    .map((f) => {
      const pts = f.pts.map((p) => `${(p.x + cx).toFixed(2)},${(p.y + cy).toFixed(2)}`).join(' ');
      const stroke = f.fill.startsWith('rgba(') ? 'none' : f.fill;
      return svg`<polygon points=${pts} fill=${f.fill} stroke=${stroke} stroke-width="0.6" stroke-linejoin="round" />`;
    });
}

/** Ombre portée au sol (z = 0) d'un point : elle donne la HAUTEUR, qu'aucune
 *  projection isométrique ne sait rendre à elle seule. */
export function groundShadow(p: Vec3, r: number, cx: number, cy: number): SVGTemplateResult {
  const c = project({ x: p.x, y: p.y, z: 0 });
  return svg`<ellipse cx=${(c.x + cx).toFixed(2)} cy=${(c.y + cy).toFixed(2)} rx=${(r * COS30 * 2).toFixed(2)}
    ry=${r.toFixed(2)} fill="rgba(0,0,0,0.16)" />`;
}
