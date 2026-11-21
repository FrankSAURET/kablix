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
import type { Diagram } from './model.mjs';
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
