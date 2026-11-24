// Capteurs lus dans la scène 3D (piste 11, lots D7a : effet Hall, D7b : HC-SR04).
//
// Module pur (ni DOM, ni three.js). La vue 3D mesure la boîte englobante de
// chaque pièce dans le repère du monde, et lance les rayons des télémètres, à
// chaque image de simulation ; ce module en tire ce que voit chaque capteur
// du schéma.
//
// Hall : une pièce `hall:U3` voit l'aimant le plus proche (pièces au rôle
// `aimant:…`). La lecture est l'ÉCART entre les deux boîtes, en mm (0 quand
// elles se touchent ou se chevauchent) ; la simulation le compare au seuil
// du capteur U3 (propriété « trigger », 10 mm par défaut), comme l'écart
// mesuré à l'écran en 2D (lot D0). Pièce en défaut de rôle : inerte.
//
// Ultrason : une pièce `ultrason:U4` lance un rayon depuis son axe nommé
// `faisceau` (point = départ, sens POSITIF de `dir`, `z` par défaut) ; la
// lecture est la distance au premier obstacle de la scène, en cm (`Infinity`
// sans obstacle). Pièce sans axe `faisceau` : inerte.

import type { PiecePilotee } from './pilotage.mjs';

export type Point3 = [number, number, number];
/** Boîte englobante alignée sur les axes du monde (mm). */
export interface Boite {
  min: Point3;
  max: Point3;
}

/** Ce que les capteurs lisent dans la scène, par repère du schéma. */
export interface LecturesCapteurs {
  /**
   * Écart (mm) entre le capteur Hall et l'aimant le plus proche ; `Infinity`
   * sans aimant dans la scène. Repère absent = pas de pièce `hall:` pour lui :
   * la scène ne le pilote pas.
   */
  hall: Record<string, number>;
  /**
   * Distance (cm) du télémètre au premier obstacle ; `Infinity` sans obstacle.
   * Repère absent = pas de pièce `ultrason:` utilisable pour lui.
   */
  ultrason: Record<string, number>;
}

/** Pièces qui comptent pour les capteurs : capteurs (par repère) et aimants. */
export interface PiecesCapteurs {
  hall: Array<{ piece: string; repere: string }>;
  aimants: string[];
  ultrason: Array<{ piece: string; repere: string }>;
}

/** Trie les pièces : un seul capteur par repère (le premier), pièces inertes écartées. */
export function piecesCapteurs(pieces: readonly PiecePilotee[]): PiecesCapteurs {
  const hall: PiecesCapteurs['hall'] = [];
  const ultrason: PiecesCapteurs['ultrason'] = [];
  const aimants: string[] = [];
  const vus = new Set<string>();
  for (const p of pieces) {
    if (!p.role || p.inerte) continue;
    const repere = p.repere ?? p.role.repere;
    if (p.role.nom === 'aimant') aimants.push(p.id);
    else if ((p.role.nom === 'hall' || p.role.nom === 'ultrason') && !vus.has(repere)) {
      vus.add(repere);
      (p.role.nom === 'hall' ? hall : ultrason).push({ piece: p.id, repere });
    }
  }
  return { hall, aimants, ultrason };
}

/** Plus courte distance entre deux boîtes (0 si elles se touchent). */
export function ecartBoites(a: Boite, b: Boite): number {
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const d = Math.max(a.min[i] - b.max[i], b.min[i] - a.max[i], 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

/** Axe nommé d'une pièce (repère local, mm). */
export type AxeLocal = { x: number; y: number; z: number; dir?: 'x' | 'y' | 'z' };

/** Rayon d'un faisceau dans le repère local de la pièce : départ et direction unitaire. */
export function rayonLocal(axe: AxeLocal): { origine: Point3; direction: Point3 } {
  const d = axe.dir ?? 'z';
  return { origine: [axe.x, axe.y, axe.z], direction: [d === 'x' ? 1 : 0, d === 'y' ? 1 : 0, d === 'z' ? 1 : 0] };
}

/**
 * Lectures d'une image. `boite(id)` rend la boîte monde d'une pièce, ou null ;
 * `lancer(id)` rend la distance (mm) du faisceau de la pièce au premier
 * obstacle (`Infinity` sans obstacle), ou null si elle n'a pas de faisceau.
 */
export function lireCapteurs(
  pc: PiecesCapteurs,
  boite: (id: string) => Boite | null,
  lancer: (id: string) => number | null = () => null,
): LecturesCapteurs {
  const hall: Record<string, number> = {};
  const ultrason: Record<string, number> = {};
  if (pc.hall.length) {
    const aimants = pc.aimants.map(boite).filter((b): b is Boite => b !== null);
    for (const h of pc.hall) {
      const bh = boite(h.piece);
      if (!bh) continue;
      hall[h.repere] = Math.min(Infinity, ...aimants.map((a) => ecartBoites(bh, a)));
    }
  }
  for (const u of pc.ultrason) {
    const mm = lancer(u.piece);
    if (mm !== null) ultrason[u.repere] = mm / 10;
  }
  return { hall, ultrason };
}

/**
 * Distance que le télémètre du schéma doit renvoyer : bornée par sa plage
 * (`distancemin`/`distancemax`, en cm) ; sans obstacle, la borne haute.
 * Arrondie au millimètre, comme la saisie du composant.
 */
export function distanceUltrason(cm: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const v = Number.isFinite(cm) ? cm : hi;
  return Math.round(Math.max(lo, Math.min(hi, v)) * 10) / 10;
}
