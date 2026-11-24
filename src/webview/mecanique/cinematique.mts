// Solveur cinématique en arbre du document système (piste 11, lot D2).
//
// Contrat : section « Paramètres et sens des liaisons (lot D2) » de
// `docs/systeme_specification.md` de Kablix. `a` est l'enfant, `b` le parent ;
// les poses du document sont la référence (chaque variable y vaut son `zero`).
// Cinématique seule : ni masse, ni frottement, ni chute.
//
// Conventions : millimètres, degrés ; pose = rotation X puis Y puis Z
// (`rotXYZ`), appliquée avant la position. Matrices 3×4 internes : un point
// local `p` tombe en `r·p + t`.
//
// Module pur : aucune dépendance, aucune mutation du document.

// Kablix : COPIE de `kinematics.ts` de kompix-core (v2026.10.0.19), imports
// Kablix : seuls changés (voir `socle.mts`). Ne rien modifier ici : corriger
// Kablix : dans kompix-core, puis recopier (`npm run verify:cinematique`).
import type { Axis, Vec3, SystemDoc, SystemPiece, SystemLink } from './socle.mjs';
import { add, sub, scale, dot, cross, rotXYZ, axisVector } from './socle.mjs';

// ---------------------------------------------------------------- matrices

/** Transformation rigide : rotation `r` (3×3, lignes à la suite) et translation `t`. */
export type Mat = { r: number[]; t: Vec3 };

/** Pose au sens du format : position et rotation (degrés, X puis Y puis Z). */
export type Pose = { pos: Vec3; rot: Vec3 };

const RAD = Math.PI / 180;

export const IDENTITY: Mat = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x: 0, y: 0, z: 0 } };

/** Applique la rotation seule (une direction). */
export function matDir(m: Mat, v: Vec3): Vec3 {
  const r = m.r;
  return {
    x: r[0] * v.x + r[1] * v.y + r[2] * v.z,
    y: r[3] * v.x + r[4] * v.y + r[5] * v.z,
    z: r[6] * v.x + r[7] * v.y + r[8] * v.z,
  };
}

/** Image d'un point local. */
export const matPoint = (m: Mat, p: Vec3): Vec3 => add(matDir(m, p), m.t);

/** Produit `a·b` : d'abord `b`, puis `a`. */
export function matMul(a: Mat, b: Mat): Mat {
  const r: number[] = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a.r[i * 3] * b.r[j] + a.r[i * 3 + 1] * b.r[3 + j] + a.r[i * 3 + 2] * b.r[6 + j];
  return { r, t: matPoint(a, b.t) };
}

/** Inverse d'une transformation rigide (rotation transposée). */
export function matInv(m: Mat): Mat {
  const r = [m.r[0], m.r[3], m.r[6], m.r[1], m.r[4], m.r[7], m.r[2], m.r[5], m.r[8]];
  const inv: Mat = { r, t: { x: 0, y: 0, z: 0 } };
  inv.t = scale(matDir(inv, m.t), -1);
  return inv;
}

/** Matrice d'une pose : colonnes = images des vecteurs unités par `rotXYZ`. */
export function poseToMat(p: Pose): Mat {
  const ex = rotXYZ({ x: 1, y: 0, z: 0 }, p.rot);
  const ey = rotXYZ({ x: 0, y: 1, z: 0 }, p.rot);
  const ez = rotXYZ({ x: 0, y: 0, z: 1 }, p.rot);
  return { r: [ex.x, ey.x, ez.x, ex.y, ey.y, ez.y, ex.z, ey.z, ez.z], t: { ...p.pos } };
}

/** Pose d'une matrice (r = Rz·Ry·Rx). Blocage de cardan : Z mis à 0. */
export function matToPose(m: Mat): Pose {
  const r = m.r;
  const sy = Math.max(-1, Math.min(1, -r[6]));
  const y = Math.asin(sy);
  let x: number;
  let z: number;
  if (Math.abs(sy) < 1 - 1e-9) {
    x = Math.atan2(r[7], r[8]);
    z = Math.atan2(r[3], r[0]);
  } else {
    x = Math.atan2(-r[5], r[4]);
    z = 0;
  }
  const clean = (d: number) => (Math.abs(d) < 1e-12 ? 0 : d);
  return { pos: { ...m.t }, rot: { x: clean(x / RAD), y: clean(y / RAD), z: clean(z / RAD) } };
}

/** Rotation d'angle `deg` autour de la droite (point `p`, direction unité `d`). */
export function matAxisRot(p: Vec3, d: Vec3, deg: number): Mat {
  const a = deg * RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = 1 - c;
  const { x, y, z } = d;
  // Formule de Rodrigues.
  const r = [
    c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k,
  ];
  const m: Mat = { r, t: { x: 0, y: 0, z: 0 } };
  m.t = sub(p, matDir(m, p));
  return m;
}

const norm = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));

// ---------------------------------------------------------------- arbre

export type KinProblemCode =
  | 'boucle-fermee'
  | 'axe-absent'
  | 'engrenage-sans-pivot'
  | 'couplage-cycle'
  | 'roue-sans-rayon'
  | 'roue-sans-pivot'
  | 'roues-incompatibles'
  | 'parametre-invalide'
  | 'type-inconnu'
  | 'variable-menee';

/** `target` = id de la liaison en cause (ou de la pièce). */
export type KinProblem = { code: KinProblemCode; target?: string };

/** Arête de l'arbre : l'enfant `child` tenu par son parent `parent`. */
export type KinJoint = {
  id: string;
  type: 'encastrement' | 'pivot' | 'glissiere';
  child: string;
  parent: string;
  /** Axe `b.axe`, repère local du parent (pivot, glissière). */
  point: Vec3;
  dir: Vec3;
  min?: number;
  max?: number;
  zero: number;
};

export type KinNode = {
  id: string;
  /** Pose du document. */
  doc: Mat;
  /** Liaison qui le tient (absente = racine). */
  joint?: string;
  /** Pose relative au parent dans le document : `inv(parent.doc)·doc`. */
  rel: Mat;
};

/** Couplage d'engrenage : `driven − zero = ratio·(driver − zero)`. */
export type KinGear = { id: string; driver: string; driven: string; ratio: number };

/** Roue sur le sol : pièce roue, pivot qui la porte, châssis = parent de ce pivot. */
export type KinWheel = { id: string; piece: string; joint: string; chassis: string; rayon: number };

export type KinTree = {
  nodes: Record<string, KinNode>;
  joints: Record<string, KinJoint>;
  /** Pièces dans l'ordre de résolution (parents d'abord). */
  order: string[];
  roots: string[];
  /** Couplages dans l'ordre de propagation (meneurs d'abord). */
  gears: KinGear[];
  wheels: KinWheel[];
};

const TREE_TYPES = ['encastrement', 'pivot', 'glissiere'] as const;
const KNOWN_TYPES = [...TREE_TYPES, 'engrenage', 'roue-sol'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Direction d'un axe nommé ; direction absente = Z (cornes de servo). */
const axisDir = (a: Axis): Vec3 => axisVector(a.dir ?? 'z');

/**
 * Construit l'arbre des liaisons d'un document. `axesOf` rend les axes nommés
 * d'une pièce dans SON repère local (miroir déjà appliqué). Une liaison
 * refusée est signalée et ignorée : sa pièce enfant devient une racine,
 * laissée à sa pose du document.
 */
export function buildKinematics(
  doc: SystemDoc,
  axesOf: (p: SystemPiece) => Record<string, Axis> | undefined,
): { tree: KinTree; problems: KinProblem[] } {
  const problems: KinProblem[] = [];
  const pieces = new Map(doc.pieces.map((p) => [p.id, p]));
  const axesCache = new Map<string, Record<string, Axis> | undefined>();
  const axes = (id: string) => {
    if (!axesCache.has(id)) axesCache.set(id, axesOf(pieces.get(id)!));
    return axesCache.get(id);
  };

  // 1. Liaisons d'arbre candidates, enfant par enfant.
  const byChild = new Map<string, SystemLink[]>();
  const couplings: SystemLink[] = [];
  for (const l of doc.liaisons) {
    if (!KNOWN_TYPES.includes(l.type)) {
      problems.push({ code: 'type-inconnu', target: l.id });
      continue;
    }
    if (!pieces.has(l.a.piece) || !pieces.has(l.b.piece)) continue; // déjà écartée par readSystem
    if (l.type === 'engrenage' || l.type === 'roue-sol') {
      couplings.push(l);
      continue;
    }
    if (l.a.piece === l.b.piece) {
      problems.push({ code: 'boucle-fermee', target: l.id });
      continue;
    }
    const list = byChild.get(l.a.piece) ?? [];
    list.push(l);
    byChild.set(l.a.piece, list);
  }

  // 2. Une pièce enfant de deux liaisons : boucle fermée, toutes refusées.
  const parentLink = new Map<string, SystemLink>();
  for (const [child, list] of byChild) {
    if (list.length > 1) {
      for (const l of list) problems.push({ code: 'boucle-fermee', target: l.id });
      continue;
    }
    const l = list[0];
    if (l.type !== 'encastrement') {
      const bAxes = axes(l.b.piece);
      const missing = !l.b.axe || !bAxes?.[l.b.axe] || (l.a.axe !== undefined && !axes(l.a.piece)?.[l.a.axe]);
      if (missing) {
        problems.push({ code: 'axe-absent', target: l.id });
        continue;
      }
    }
    parentLink.set(child, l);
  }

  // 3. Cycles : on remonte les parents ; les liaisons d'un cycle sont refusées.
  const state = new Map<string, 'encours' | 'fait'>();
  for (const start of parentLink.keys()) {
    const path: string[] = [];
    let cur: string | undefined = start;
    while (cur && !state.has(cur)) {
      state.set(cur, 'encours');
      path.push(cur);
      cur = parentLink.get(cur)?.b.piece;
    }
    if (cur && state.get(cur) === 'encours') {
      const cycle = path.slice(path.indexOf(cur));
      for (const id of cycle) problems.push({ code: 'boucle-fermee', target: parentLink.get(id)!.id });
      for (const id of cycle) parentLink.delete(id);
    }
    for (const id of path) state.set(id, 'fait');
  }

  // 4. Nœuds et arêtes ; ordre parents d'abord.
  const nodes: Record<string, KinNode> = {};
  const joints: Record<string, KinJoint> = {};
  for (const p of doc.pieces) nodes[p.id] = { id: p.id, doc: poseToMat(p.pose), rel: IDENTITY };
  for (const [child, l] of parentLink) {
    const prm = l.params ?? {};
    const j: KinJoint = {
      id: l.id,
      type: l.type as KinJoint['type'],
      child,
      parent: l.b.piece,
      point: { x: 0, y: 0, z: 0 },
      dir: { x: 0, y: 0, z: 1 },
      zero: finite(prm.zero) ? prm.zero : 0,
    };
    if (l.type !== 'encastrement') {
      const ax = axes(l.b.piece)![l.b.axe!];
      j.point = { x: ax.x, y: ax.y, z: ax.z };
      j.dir = axisDir(ax);
      if (finite(prm.min)) j.min = prm.min;
      if (finite(prm.max)) j.max = prm.max;
    }
    joints[l.id] = j;
    nodes[child].joint = l.id;
    nodes[child].rel = matMul(matInv(nodes[l.b.piece].doc), nodes[child].doc);
  }
  const children = new Map<string, string[]>();
  for (const j of Object.values(joints)) children.set(j.parent, [...(children.get(j.parent) ?? []), j.child]);
  const roots = doc.pieces.filter((p) => !nodes[p.id].joint).map((p) => p.id);
  const order: string[] = [];
  const walk = (id: string) => {
    order.push(id);
    for (const c of children.get(id) ?? []) walk(c);
  };
  roots.forEach(walk);

  // 5. Couplages.
  const pivotOf = (piece: string) => {
    const jid = nodes[piece]?.joint;
    return jid && joints[jid].type === 'pivot' ? jid : undefined;
  };
  const gearsRaw: KinGear[] = [];
  const wheelsRaw: KinWheel[] = [];
  for (const l of couplings) {
    const prm = l.params ?? {};
    if (l.type === 'engrenage') {
      const driver = pivotOf(l.a.piece);
      const driven = pivotOf(l.b.piece);
      if (!driver || !driven) {
        problems.push({ code: 'engrenage-sans-pivot', target: l.id });
        continue;
      }
      let ratio: number | undefined;
      // `rapport` = vitesse de B / vitesse de A, signe compris.
      if (finite(prm.rapport) && prm.rapport !== 0) ratio = prm.rapport;
      else if (finite(prm.dentsA) && finite(prm.dentsB) && prm.dentsA > 0 && prm.dentsB > 0)
        ratio = (prm.interne === true ? 1 : -1) * (prm.dentsA / prm.dentsB);
      if (ratio === undefined) {
        problems.push({ code: 'parametre-invalide', target: l.id });
        continue;
      }
      gearsRaw.push({ id: l.id, driver, driven, ratio });
    } else {
      const joint = pivotOf(l.a.piece);
      if (!joint) {
        problems.push({ code: 'roue-sans-pivot', target: l.id });
        continue;
      }
      if (!finite(prm.rayon) || prm.rayon <= 0) {
        problems.push({ code: 'roue-sans-rayon', target: l.id });
        continue;
      }
      wheelsRaw.push({ id: l.id, piece: l.a.piece, joint, chassis: joints[joint].parent, rayon: prm.rayon });
    }
  }

  return { tree: { nodes, joints, order, roots, gears: orderGears(gearsRaw, problems), wheels: checkWheels(wheelsRaw, joints, nodes, problems) }, problems };
}

/**
 * Ordonne les engrenages meneurs d'abord. Un pivot mené par deux engrenages,
 * ou un cycle de couplages : tous les couplages en cause sont refusés.
 */
function orderGears(gears: KinGear[], problems: KinProblem[]): KinGear[] {
  const refused = new Set<string>();
  const byDriven = new Map<string, KinGear[]>();
  for (const g of gears) byDriven.set(g.driven, [...(byDriven.get(g.driven) ?? []), g]);
  for (const list of byDriven.values()) if (list.length > 1) list.forEach((g) => refused.add(g.id));
  // Remontée meneur par meneur : revenir sur ses pas = cycle.
  const drivenBy = new Map<string, KinGear>();
  for (const g of gears) if (!refused.has(g.id)) drivenBy.set(g.driven, g);
  for (const g of gears) {
    if (refused.has(g.id)) continue;
    const seen: KinGear[] = [];
    let cur: KinGear | undefined = g;
    while (cur && !seen.includes(cur)) {
      seen.push(cur);
      cur = drivenBy.get(cur.driver);
    }
    if (cur) seen.slice(seen.indexOf(cur)).forEach((c) => refused.add(c.id));
  }
  for (const g of gears) if (refused.has(g.id)) problems.push({ code: 'couplage-cycle', target: g.id });
  const kept = gears.filter((g) => !refused.has(g.id));
  // Tri topologique : un couplage après celui qui mène son meneur.
  const out: KinGear[] = [];
  const done = new Set<string>();
  const place = (g: KinGear) => {
    if (done.has(g.id)) return;
    const up = kept.find((h) => h.driven === g.driver);
    if (up) place(up);
    done.add(g.id);
    out.push(g);
  };
  kept.forEach(place);
  return out;
}

/**
 * Point de contact d'une roue, repère du châssis : l'origine de la pièce roue
 * projetée sur l'axe de son pivot. `rel` = pose de la roue relative au châssis
 * (parent du pivot) dans le document ; la rotation propre de la roue ne
 * déplace pas ce point.
 */
function wheelContact(w: KinWheel, joints: Record<string, KinJoint>, nodes: Record<string, KinNode>): Vec3 {
  const j = joints[w.joint];
  const e = unit(j.dir);
  return add(j.point, scale(e, dot(sub(nodes[w.piece].rel.t, j.point), e)));
}

/**
 * Au plus deux roues, même châssis, axes confondus (propriété de la droite),
 * points de contact distincts (voie non nulle) ; sinon toutes refusées.
 */
function checkWheels(wheels: KinWheel[], joints: Record<string, KinJoint>, nodes: Record<string, KinNode>, problems: KinProblem[]): KinWheel[] {
  if (wheels.length <= 1) return wheels;
  let ok = wheels.length === 2 && wheels[0].chassis === wheels[1].chassis;
  if (ok) {
    const [j1, j2] = wheels.map((w) => joints[w.joint]);
    const d = j1.dir;
    const gap = sub(j2.point, j1.point);
    ok = norm(cross(d, j2.dir)) < 1e-9 && norm(cross(d, gap)) < 1e-6;
  }
  if (ok) ok = norm(sub(wheelContact(wheels[1], joints, nodes), wheelContact(wheels[0], joints, nodes))) > 1e-6;
  if (ok) return wheels;
  for (const w of wheels) problems.push({ code: 'roues-incompatibles', target: w.id });
  return [];
}

// ---------------------------------------------------------------- résolution

export type KinPose = Pose & { matrix: Mat };

export type KinSolution = {
  /** Pose monde de chaque pièce. */
  poses: Record<string, KinPose>;
  /** Valeur retenue de chaque variable (pivot, glissière), bornes et couplages appliqués. */
  values: Record<string, number>;
  /** Variables arrêtées à une borne. */
  saturated: Record<string, 'min' | 'max'>;
  problems: KinProblem[];
};

const clampJoint = (j: KinJoint, v: number): { v: number; sat?: 'min' | 'max' } => {
  if (j.min !== undefined && v < j.min) return { v: j.min, sat: 'min' };
  if (j.max !== undefined && v > j.max) return { v: j.max, sat: 'max' };
  return { v };
};

/**
 * Poses monde pour les variables `q` : `q[idLiaison]` = angle en degrés d'un
 * pivot, course en mm d'une glissière ; absente = son `zero`. Valeur bornée
 * par `min`/`max` (saturation signalée, pas d'erreur). `base` impose la pose
 * monde d'une pièce (châssis qui roule) : sa liaison parente est alors ignorée.
 */
export function solve(tree: KinTree, q: Record<string, number> = {}, base: Record<string, Pose> = {}): KinSolution {
  const problems: KinProblem[] = [];
  const values: Record<string, number> = {};
  const saturated: Record<string, 'min' | 'max'> = {};
  for (const j of Object.values(tree.joints)) {
    if (j.type === 'encastrement') continue;
    const r = clampJoint(j, finite(q[j.id]) ? q[j.id] : j.zero);
    values[j.id] = r.v;
    if (r.sat) saturated[j.id] = r.sat;
  }
  // Engrenages : le pivot mené suit son meneur, la valeur fournie est ignorée.
  for (const g of tree.gears) {
    if (q[g.driven] !== undefined) problems.push({ code: 'variable-menee', target: g.driven });
    const jd = tree.joints[g.driven];
    const jm = tree.joints[g.driver];
    const r = clampJoint(jd, jd.zero + g.ratio * (values[g.driver] - jm.zero));
    values[g.driven] = r.v;
    if (r.sat) saturated[g.driven] = r.sat;
    else delete saturated[g.driven];
  }

  const world: Record<string, Mat> = {};
  for (const id of tree.order) {
    const node = tree.nodes[id];
    if (base[id]) world[id] = poseToMat(base[id]);
    else if (!node.joint) world[id] = node.doc;
    else {
      const j = tree.joints[node.joint];
      world[id] = matMul(matMul(world[j.parent], jointMat(j, values[j.id])), node.rel);
    }
  }
  const poses: Record<string, KinPose> = {};
  for (const id of tree.order) poses[id] = { ...matToPose(world[id]), matrix: world[id] };
  return { poses, values, saturated, problems };
}

/** Mouvement d'une liaison dans le repère du parent, écart au `zero`. */
function jointMat(j: KinJoint, v: number | undefined): Mat {
  const d = (v ?? j.zero) - j.zero;
  if (j.type === 'pivot') return matAxisRot(j.point, j.dir, d);
  if (j.type === 'glissiere') return { r: IDENTITY.r, t: scale(j.dir, d) };
  return IDENTITY;
}

// ---------------------------------------------------------------- roulage

/** Pose du châssis sur le sol : position `x`, `y` (mm) et lacet (degrés, autour de Z). */
export type RollState = { x: number; y: number; lacet: number };

/** Châssis mobile (parent du pivot des roues) ; absent sans roue valide. */
export const rollChassis = (tree: KinTree): string | undefined => tree.wheels[0]?.chassis;

/** État de départ : la pose du châssis dans le document. */
export function rollStart(tree: KinTree): RollState | undefined {
  const c = rollChassis(tree);
  if (!c) return undefined;
  const p = matToPose(tree.nodes[c].doc);
  return { x: p.pos.x, y: p.pos.y, lacet: p.rot.z };
}

/** `base` à passer à `solve` : hauteur, roulis et tangage du document gardés. */
export function rollBase(tree: KinTree, s: RollState): Record<string, Pose> {
  const c = rollChassis(tree);
  if (!c) return {};
  const p = matToPose(tree.nodes[c].doc);
  return { [c]: { pos: { x: s.x, y: s.y, z: p.pos.z }, rot: { x: p.rot.x, y: p.rot.y, z: s.lacet } } };
}

/**
 * Un pas de roulage sans glissement. `deltas[idPivot]` = rotation de la roue
 * (degrés) depuis le pas précédent ; les engrenages la propagent. Une roue :
 * avance de `rayon × Δθ` ; deux roues sur un même axe : conduite
 * différentielle, voie = écart des points de contact, chacun = l'origine de
 * la pièce roue projetée sur l'axe de son pivot. Rend le nouvel état.
 */
export function rollStep(state: RollState, tree: KinTree, deltas: Record<string, number>): RollState {
  const c = rollChassis(tree);
  if (!c) return { ...state };
  // Rotations propagées (partie linéaire des couplages).
  const d: Record<string, number> = { ...deltas };
  for (const g of tree.gears) d[g.driven] = g.ratio * (d[g.driver] ?? 0);

  const m = poseToMat(rollBase(tree, state)[c]);
  const Z = { x: 0, y: 0, z: 1 };
  const flat = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: 0 });
  // Pour chaque roue : axe (monde, à plat), contact, direction d'avance
  // f = axe × Z (rotation positive autour de l'axe → la roue part vers f).
  const ws = tree.wheels.map((w) => {
    const j = tree.joints[w.joint];
    const e = unit(flat(matDir(m, j.dir)));
    const at = flat(matPoint(m, wheelContact(w, tree.joints, tree.nodes)));
    return { e, at, f: cross(e, Z), s: w.rayon * (d[w.joint] ?? 0) * RAD };
  });
  const e = ws[0].e;
  const f = ws[0].f;
  let origin = ws[0].at;
  let dist = ws[0].s * dot(ws[0].f, f);
  let turn = 0;
  if (ws.length === 2) {
    // Vitesse le long de f d'un point à l'écart u sur l'axe : v(u) = v0 − ω·u.
    const u1 = 0;
    const u2 = dot(sub(ws[1].at, ws[0].at), e);
    const s1 = dist;
    const s2 = ws[1].s * dot(ws[1].f, f);
    turn = (s1 - s2) / (u2 - u1);
    origin = add(ws[0].at, scale(e, u2 / 2));
    dist = s1 - turn * (u2 / 2);
  }
  // Déplacement exact sur l'arc (ou droit si le virage est nul).
  let moved: Vec3;
  if (Math.abs(turn) < 1e-12) moved = add(origin, scale(f, dist));
  else {
    const n = cross(Z, f);
    const center = add(origin, scale(n, dist / turn));
    moved = add(center, rotZv(sub(origin, center), turn));
  }
  const chassisAt = { x: state.x, y: state.y, z: 0 };
  const next = add(moved, rotZv(sub(chassisAt, origin), turn));
  return { x: next.x, y: next.y, lacet: state.lacet + turn / RAD };
}

/** Rotation autour de Z, angle en radians. */
function rotZv(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: 0 };
}
