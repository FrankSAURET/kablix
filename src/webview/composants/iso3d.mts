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

/** Couleur `#rrggbb` éclaircie (k > 1) ou assombrie (k < 1), bornée. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (dec: number): number => Math.max(0, Math.min(255, Math.round(((n >> dec) & 255) * k)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
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

/**
 * Dessus (ou dessous) d'un prisme, découpé en ÉVENTAIL de triangles autour de
 * son centre. Une grande face plate rangée à sa profondeur MOYENNE passerait
 * devant (ou derrière) tout ce qu'elle porte : l'algorithme du peintre veut des
 * faces de taille comparable, sinon une carte posée au bord de la plaque
 * disparaît sous la plaque elle-même. Les triangles partagent la normale de la
 * face, donc la même teinte : le découpage ne se voit pas.
 */
function cap(pts: Vec3[], color: string): Face[] {
  const c: Vec3 = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
  };
  const out: Face[] = [];
  for (let i = 0; i < pts.length; i++) {
    const f = face([c, pts[i], pts[(i + 1) % pts.length]], color);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Prisme vertical : un polygone horizontal (donné en X/Y, sens trigonométrique)
 * extrudé de `z0` à `z1`. C'est le châssis découpé au laser, et toute plaque.
 */
export function prismFaces(poly: Vec2[], z0: number, z1: number, color: string): Face[] {
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
 */
export function renderFaces(faces: Face[], cx: number, cy: number): SVGTemplateResult[] {
  return [...faces]
    .sort((a, b) => a.z - b.z)
    .map((f) => {
      const pts = f.pts.map((p) => `${(p.x + cx).toFixed(2)},${(p.y + cy).toFixed(2)}`).join(' ');
      return svg`<polygon points=${pts} fill=${f.fill} stroke=${f.fill} stroke-width="0.6" stroke-linejoin="round" />`;
    });
}

/** Ombre portée au sol (z = 0) d'un point : elle donne la HAUTEUR, qu'aucune
 *  projection isométrique ne sait rendre à elle seule. */
export function groundShadow(p: Vec3, r: number, cx: number, cy: number): SVGTemplateResult {
  const c = project({ x: p.x, y: p.y, z: 0 });
  return svg`<ellipse cx=${(c.x + cx).toFixed(2)} cy=${(c.y + cy).toFixed(2)} rx=${(r * COS30 * 2).toFixed(2)}
    ry=${r.toFixed(2)} fill="rgba(0,0,0,0.16)" />`;
}
