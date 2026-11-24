// Capteurs lus dans la scène 3D (piste 11, lot D7a : effet Hall).
//
// Module pur (ni DOM, ni three.js). La vue 3D mesure la boîte englobante de
// chaque pièce dans le repère du monde, à chaque image de simulation ; ce
// module en tire ce que voit chaque capteur du schéma.
//
// Hall : une pièce `hall:U3` voit l'aimant le plus proche (pièces au rôle
// `aimant:…`). La lecture est l'ÉCART entre les deux boîtes, en mm (0 quand
// elles se touchent ou se chevauchent) ; la simulation le compare au seuil
// du capteur U3 (propriété « trigger », 10 mm par défaut), comme l'écart
// mesuré à l'écran en 2D (lot D0). Pièce en défaut de rôle : inerte.

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
}

/** Pièces qui comptent pour les capteurs : capteurs Hall (par repère) et aimants. */
export interface PiecesCapteurs {
  hall: Array<{ piece: string; repere: string }>;
  aimants: string[];
}

/** Trie les pièces : un seul capteur Hall par repère (le premier), pièces inertes écartées. */
export function piecesCapteurs(pieces: readonly PiecePilotee[]): PiecesCapteurs {
  const hall: PiecesCapteurs['hall'] = [];
  const aimants: string[] = [];
  const vus = new Set<string>();
  for (const p of pieces) {
    if (!p.role || p.inerte) continue;
    const repere = p.repere ?? p.role.repere;
    if (p.role.nom === 'aimant') aimants.push(p.id);
    else if (p.role.nom === 'hall' && !vus.has(repere)) {
      vus.add(repere);
      hall.push({ piece: p.id, repere });
    }
  }
  return { hall, aimants };
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

/** Lectures d'une image : `boite(id)` rend la boîte monde d'une pièce, ou null. */
export function lireCapteurs(pc: PiecesCapteurs, boite: (id: string) => Boite | null): LecturesCapteurs {
  const hall: Record<string, number> = {};
  if (pc.hall.length === 0) return { hall };
  const aimants = pc.aimants.map(boite).filter((b): b is Boite => b !== null);
  for (const h of pc.hall) {
    const bh = boite(h.piece);
    if (!bh) continue;
    hall[h.repere] = Math.min(Infinity, ...aimants.map((a) => ecartBoites(bh, a)));
  }
  return { hall };
}
