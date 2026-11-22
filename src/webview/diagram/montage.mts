// Liens de MONTAGE (piste 7, lot D0 de la piste 11) : « cette pièce est fixée
// sur celle-là ». Premier lien mécanique du simulateur : ce qui se transmet
// n'est pas une tension mais une POSITION. Pas de moteur physique : la pièce
// portée suit son porteur, rien de plus.
//
// Le lien vit dans les attributs de la pièce portée (`mount` = repère du
// porteur) : il s'enregistre dans le `.projix` sans changer le format, et un
// vieux Kablix l'ignore sans casser le schéma.
//
// Logique PURE ici (testable sous Node) ; la mesure des positions à l'écran et
// le déplacement visible sont dans sim.mts.
import type { Diagram, Part } from './model.mjs';
import { partDef } from './catalog.mjs';

/** Type de l'aimant au catalogue. */
export const AIMANT_TYPE = 'aimant';

/** Porteurs acceptés : le servo seul pour commencer (son palonnier tourne). */
const CARRIER_KINDS = new Set(['servo']);

/**
 * Demi-épaisseurs retranchées de la distance centre à centre : le capteur lit
 * l'écart entre la FACE du boîtier et le BORD de l'aimant, comme l'aimant
 * glissant du Hall (cote « 0 mm » = collé). 1 px du monde = 1 mm.
 */
export const HALL_FACE_HALF = 5;
export const AIMANT_HALF = 5;

export interface MountLink {
  /** Pièce portée (l'aimant). */
  partId: string;
  /** Porteur (le servo). */
  carrierId: string;
}

export interface MountProblem {
  partId: string;
  /** Repère écrit dans la propriété « Fixé sur ». */
  target: string;
  /** `missing` : aucun composant de ce repère ; `not-carrier` : il ne porte rien. */
  reason: 'missing' | 'not-carrier';
}

function kindOf(type: string): string {
  try {
    return partDef(type).kind;
  } catch {
    return ''; // type inconnu de ce poste
  }
}

/**
 * Liens de montage valides du schéma, et ceux qui visent un repère absent ou un
 * composant qui ne sait rien porter (pour le dire à l'utilisateur).
 */
export function mountLinks(diagram: Diagram): { links: MountLink[]; problems: MountProblem[] } {
  const byId = new Map(diagram.parts.map((p) => [p.id, p]));
  const links: MountLink[] = [];
  const problems: MountProblem[] = [];
  for (const part of diagram.parts) {
    if (part.type !== AIMANT_TYPE) continue;
    const target = (part.attrs?.mount ?? '').trim();
    if (!target) continue;
    const carrier = byId.get(target);
    if (!carrier || carrier.id === part.id) problems.push({ partId: part.id, target, reason: 'missing' });
    else if (!CARRIER_KINDS.has(kindOf(carrier.type))) problems.push({ partId: part.id, target, reason: 'not-carrier' });
    else links.push({ partId: part.id, carrierId: carrier.id });
  }
  return { links, problems };
}

/**
 * Suit les repères réattribués : un aimant fixé sur un porteur qui change de
 * repère (copié-collé ou dupliqué avec lui, doublon renuméroté à l'ouverture)
 * reste fixé sur CE porteur — sans cela, la copie d'un servo et de son aimant
 * donnait un aimant collé au servo d'origine. `idMap` : ancien repère → neuf,
 * comme pour les fils. Un porteur absent de la table (aimant copié seul) garde
 * son repère : la copie reste fixée sur le même servo que l'original.
 * Les attributs sont remplacés, jamais modifiés sur place (la charge utile du
 * presse-papier resservira). Rend le nombre d'aimants mis à jour.
 */
export function remapMounts(parts: Part[], idMap: ReadonlyMap<string, string>): number {
  let n = 0;
  for (const part of parts) {
    if (part.type !== AIMANT_TYPE) continue;
    const target = (part.attrs?.mount ?? '').trim();
    const next = target ? idMap.get(target) : undefined;
    if (next === undefined || next === target) continue;
    part.attrs = { ...part.attrs, mount: next };
    n++;
  }
  return n;
}

/**
 * Porteur supprimé : les aimants fixés sur lui sont détachés (`mount` vidé),
 * comme un aimant lâché hors de tout palonnier. Sans cela, ils gardaient un
 * repère orphelin, signalé en erreur au lancement de la simulation. Attributs
 * remplacés, jamais modifiés sur place. Rend les repères des aimants détachés.
 */
export function detachMounts(parts: Part[], carrierId: string): string[] {
  const ids: string[] = [];
  for (const part of parts) {
    if (part.type !== AIMANT_TYPE || part.id === carrierId) continue;
    if ((part.attrs?.mount ?? '').trim() !== carrierId) continue;
    part.attrs = { ...part.attrs, mount: '' };
    ids.push(part.id);
  }
  return ids;
}

/** Ce type de composant sait-il porter un aimant ? */
export function isCarrierType(type: string): boolean {
  return CARRIER_KINDS.has(kindOf(type));
}

/** Rectangle en coordonnées du MONDE (px = mm). */
export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zones d'accrochage d'un porteur, mesurées à l'appui du geste. */
export interface MountZone {
  carrierId: string;
  /** Boîte du palonnier, là où l'on lâche l'aimant pour le fixer. */
  horn: WorldRect;
  /** Boîte du porteur entier : lâché dedans, un aimant déjà fixé le reste. */
  body: WorldRect;
}

function inside(p: XY, r: WorldRect, tol: number): boolean {
  return p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol;
}

/**
 * Palonnier visé par le centre de l'aimant (tolérance = demi-épaisseur de
 * l'aimant : il suffit qu'il touche le palonnier). Plusieurs candidats → le
 * palonnier dont le centre est le plus proche. `null` si aucun.
 */
export function hornUnder(center: XY, zones: readonly MountZone[], tol = AIMANT_HALF): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const z of zones) {
    if (!inside(center, z.horn, tol)) continue;
    const d = Math.hypot(center.x - (z.horn.x + z.horn.w / 2), center.y - (z.horn.y + z.horn.h / 2));
    if (d < bestD) {
      bestD = d;
      best = z.carrierId;
    }
  }
  return best;
}

/**
 * « Fixé sur » après le lâcher d'un aimant glissé seul :
 * - lâché SUR un palonnier → fixé sur ce servo ;
 * - lâché sur le servo qui le porte déjà (corps, hors palonnier) → inchangé :
 *   ajuster la position de l'aimant sur son servo ne doit pas le détacher ;
 * - lâché ailleurs → détaché (vide), comme une sonde reposée dans le vide ;
 * - fixé sur un repère que le geste ne connaît pas (absent, pas un porteur) →
 *   inchangé : l'erreur reste dite au lancement plutôt qu'effacée en silence.
 */
export function mountAfterDrop(center: XY, zones: readonly MountZone[], current: string, tol = AIMANT_HALF): string {
  const hit = hornUnder(center, zones, tol);
  if (hit) return hit;
  const cur = current.trim();
  if (!cur) return '';
  const own = zones.find((z) => z.carrierId === cur);
  if (!own) return current;
  return inside(center, own.body, tol) ? current : '';
}

/** Le schéma contient-il au moins un aimant (libre ou fixé) ? */
export function hasAimant(diagram: Diagram): boolean {
  return diagram.parts.some((p) => p.type === AIMANT_TYPE);
}

export interface XY {
  x: number;
  y: number;
}

/** Écart face du capteur ↔ bord de l'aimant (mm du monde, jamais négatif). */
export function aimantGap(face: XY, aimant: XY): number {
  const d = Math.hypot(aimant.x - face.x, aimant.y - face.y);
  return Math.max(0, d - HALL_FACE_HALF - AIMANT_HALF);
}

/**
 * Champ BINAIRE (premier lot) : le capteur commute dès qu'un aimant est à moins
 * de `trigger` mm de sa face, quelle que soit l'orientation des pôles.
 */
export function hallSeesAimant(face: XY, aimants: readonly XY[], trigger: number): boolean {
  const t = Number.isFinite(trigger) ? trigger : 10;
  return aimants.some((a) => aimantGap(face, a) <= t);
}

/** Angle (degrés, sens horaire à l'écran) d'une matrice 2D `a b c d`. */
export function matrixAngle(m: { a: number; b: number }): number {
  return (Math.atan2(m.b, m.a) * 180) / Math.PI;
}

/** Écart d'angle ramené dans ]-180, 180]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
