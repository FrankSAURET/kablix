// Mise en place du volume : où tombe chaque pièce d'un `model3d.json`.
//
// Port fidèle d'`iso3d.mts` de Kablix (PLANES, MATIERES, miroir, articulations,
// `montage`) sans le rendu SVG : la visionneuse three.js et le futur aperçu
// « rendu Kablix » doivent poser les pièces EXACTEMENT au même endroit. Un
// test compare le montage à celui que calcule Kablix (fixture figée).
//
// Ajout v2 : la rotation `rot` d'une pièce (X puis Y puis Z, autour de son
// centre `pos`, avant le placement).

// Kablix : COPIE de `montage.ts` de kompix-core (v2026.10.0.19), imports
// Kablix : seuls changés. Ne rien modifier ici : corriger dans kompix-core,
// Kablix : puis recopier (`npm run verify:vue3d` compare les deux).
import type { Assembly, AssemblyPiece, AxisDir, Axis, Model3D, Plane, Vec2, Vec3 } from './modele3d.mjs';
import { pieceOutline } from './socle.mjs';

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Rotation autour de Z (lacet), en degrés — celle d'iso3d. */
export function rotZ(p: Vec3, deg: number): Vec3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

/** Rotation v2 d'une pièce : autour de X, puis de Y, puis de Z (degrés). */
export function rotXYZ(p: Vec3, r?: Vec3): Vec3 {
  if (!r || (!r.x && !r.y && !r.z)) return p;
  const rad = Math.PI / 180;
  let { x, y, z } = p;
  let c = Math.cos(r.x * rad);
  let s = Math.sin(r.x * rad);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(r.y * rad);
  s = Math.sin(r.y * rad);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(r.z * rad);
  s = Math.sin(r.z * rad);
  [x, y] = [x * c - y * s, x * s + y * c];
  return { x, y, z };
}

/** Comment le dessin à plat se pose : `u` suit le x du dessin, `v` son y (qui
 *  descend, convention SVG), l'épaisseur part le long de u × v. */
export const PLANES: Record<Plane, { u: Vec3; v: Vec3 }> = {
  dessus: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
  flanc: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: -1 } },
  face: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 } },
};

export function planeNormal(plan: Plane): Vec3 {
  const { u, v } = PLANES[plan];
  return cross(u, v);
}

/** Couleurs des matières, repli d'une pièce sans `fill` (celles d'iso3d). */
export const MATIERES: Record<string, string> = {
  pmma: '#bcdff0',
  alu: '#c9d6de',
  servo: '#2f3640',
  carte: '#1f6b3a',
  laiton: '#c8ad63',
  pile: '#37474f',
};

/** Couleur d'une pièce : `#rrggbb` opaque et son opacité (0..1). */
export function pieceColor(p: AssemblyPiece): { rgb: string; alpha: number } {
  const c = p.fill ?? MATIERES[p.mat] ?? MATIERES.pmma;
  const h = c.startsWith('#') ? c.slice(1) : '';
  if (h.length === 8) return { rgb: `#${h.slice(0, 6)}`, alpha: parseInt(h.slice(6, 8), 16) / 255 };
  if (h.length === 6) return { rgb: c, alpha: 1 };
  if (h.length === 3) return { rgb: `#${[...h].map((d) => d + d).join('')}`, alpha: 1 };
  return { rgb: MATIERES.pmma, alpha: 1 };
}

/** Les deux poses d'une pièce en miroir, ou son unique pose. */
export function mirrored(p: AssemblyPiece): Vec3[] {
  if (!p.miroir) return [p.pos];
  const axis = p.miroir as 'x' | 'y' | 'z';
  return [p.pos, { ...p.pos, [axis]: -p.pos[axis] }];
}

/**
 * Rotation de la copie en miroir : le REFLET de celle de la pièce (décision
 * B2). Réfléchir Rz·Ry·Rx par le plan normal à l'axe garde l'angle autour de cet
 * axe et inverse les deux autres. Une patte penchée vers l'extérieur a ainsi sa
 * jumelle penchée vers l'extérieur, pas vers l'intérieur.
 */
export function mirrorRot(r: Vec3 | undefined, axis: string): Vec3 | undefined {
  if (!r) return r;
  return {
    x: axis === 'x' ? r.x : -r.x,
    y: axis === 'y' ? r.y : -r.y,
    z: axis === 'z' ? r.z : -r.z,
  };
}

/** Famille d'une pastille : son premier mot (`coxa-gh` → `coxa`). */
export function axisFamily(name: string): string {
  const i = name.indexOf('-');
  return i > 0 ? name.slice(0, i) : name;
}

export type Articulation = { name: string; famille: string; at: Vec3; dir?: AxisDir };

export function articulations(src: Assembly | Record<string, Axis>): Articulation[] {
  const axes = (src as Assembly).axes ?? (src as Record<string, Axis>);
  return Object.entries(axes)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([name, v]) => ({
      name,
      famille: axisFamily(name),
      at: { x: v.x, y: v.y, z: v.z },
      ...(v.dir ? { dir: v.dir } : {}),
    }));
}

/** Un exemplaire posé : un point `q` de l'ensemble tombe en `rotZ(q, lacet) + pos`. */
export type Instance = { nom: string; pos: Vec3; lacet: number; parent: string; via: string };

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
 * MONTAGE (règle d'iso3d) : deux ensembles dont une pastille porte le même
 * premier mot s'emboîtent, axes superposés, zéros confondus ; celui qui offre le
 * plus de pastilles de la famille porte l'autre, en autant d'exemplaires. Un
 * ensemble sans famille commune reste seul, à sa place.
 */
export function montage(assemblies: Record<string, Assembly>): Instance[] {
  const ensembles = Object.entries(assemblies).map(([nom, A]) => ({ nom, A }));
  const joints = new Map<string, Articulation[]>();
  for (const e of ensembles) joints.set(e.nom, articulations(e.A));
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
    const racine = ordre.find((e) => reste.has(e.nom))!;
    poser(racine.nom, [{ nom: racine.nom, pos: { x: 0, y: 0, z: 0 }, lacet: 0, parent: '', via: '' }]);
    while (file.length) {
      const pnom = file.shift()!;
      const P = par.get(pnom)!;
      const familles = new Map<string, Articulation[]>();
      for (const j of joints.get(pnom)!) {
        if (!familles.has(j.famille)) familles.set(j.famille, []);
        familles.get(j.famille)!.push(j);
      }
      for (const enfant of ordre) {
        if (!reste.has(enfant.nom)) continue;
        const ej = joints.get(enfant.nom)!;
        // Une famille dont les deux axes ont la même direction passe devant.
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
            // Plusieurs articulations : chaque enfant part du côté de la sienne.
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
 * Un exemplaire de pièce à dessiner : la pièce, son centre dans l'ensemble
 * (miroir appliqué, éclaté compris) et l'exemplaire d'ensemble qui le porte.
 * `id` est stable : `ensemble#instance/pièce#copie`.
 */
export type Placement = {
  id: string;
  assembly: string;
  instance: number;
  piece: AssemblyPiece;
  pieceIndex: number;
  copy: number;
  center: Vec3;
  /** Rotation v2 de CET exemplaire (reflétée pour la copie en miroir). */
  rot?: Vec3;
  inst: Instance;
};

/** Toutes les pièces du volume, montées. `eclate` (mm) écarte chaque pièce le
 *  long de sa normale, du côté où elle se trouve déjà (vue éclatée d'iso3d). */
export function placements(model: Model3D, eclate = 0): Placement[] {
  const insts = montage(model.assemblies);
  const rang = new Map<string, number>();
  const out: Placement[] = [];
  for (const inst of insts) {
    const k = rang.get(inst.nom) ?? 0;
    rang.set(inst.nom, k + 1);
    const A = model.assemblies[inst.nom];
    A.pieces.forEach((piece, pieceIndex) => {
      mirrored(piece).forEach((pos, copy) => {
        const rot = copy ? mirrorRot(piece.rot, piece.miroir!) : piece.rot;
        const n = rotXYZ(planeNormal(piece.plan), rot);
        const center = add(pos, scale(n, eclate * Math.sign(dot(pos, n))));
        out.push({ id: `${inst.nom}#${k}/${pieceIndex}#${copy}`, assembly: inst.nom, instance: k, piece, pieceIndex, copy, center, rot, inst });
      });
    });
  }
  return out;
}

/** Point du dessin à plat (`q`, à la distance `s` du plan moyen) porté dans le
 *  monde pour un placement donné. */
export function placePoint(pl: Placement, q: Vec2, s = 0): Vec3 {
  const { u, v } = PLANES[pl.piece.plan];
  const n = cross(u, v);
  const local = add(add(scale(u, q.x), scale(v, q.y)), scale(n, s));
  return add(rotZ(add(pl.center, rotXYZ(local, pl.rot)), pl.inst.lacet), pl.inst.pos);
}

/** Boîte englobante du volume monté (contours et épaisseurs), en mm. */
export function modelBounds(model: Model3D, eclate = 0): { min: Vec3; max: Vec3 } | null {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const pl of placements(model, eclate)) {
    for (const q of pieceOutline(pl.piece)) {
      for (const s of [-pl.piece.ep / 2, pl.piece.ep / 2]) {
        const p = placePoint(pl, q, s);
        for (const k of ['x', 'y', 'z'] as const) {
          min[k] = Math.min(min[k], p[k]);
          max[k] = Math.max(max[k], p[k]);
        }
      }
    }
  }
  return min.x === Infinity ? null : { min, max };
}
