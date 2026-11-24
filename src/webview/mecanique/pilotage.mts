// Pilotage du montage 3D par la simulation (piste 11, lot D6d).
//
// Module pur (ni DOM, ni three.js). Les rôles des pièces (`rôle:repère`,
// lot D5) disent quelle liaison suit quel composant du schéma :
//   - `servo:Act1`  : chaque pivot dont la pièce est le PARENT prend l'angle
//                     simulé du servo Act1 (degrés, absolu) ;
//   - `moteur:M1`   : chaque pivot dont la pièce est le parent tourne à la
//                     vitesse simulée de M1, intégrée en angle ;
//   - `roue:M1`     : le pivot qui PORTE la roue suit M1 (moteur : vitesse
//                     intégrée ; servo : son angle). Avec une liaison
//                     `roue-sol`, le châssis roule (`rollStep`).
// Une pièce en défaut de rôle est inerte (lot D5) : elle n'est pas pilotée.
// Arrêt de la simulation → `remettre()` : retour à la pose du document.

import { rollBase, rollStart, rollStep, solve, type KinProblem, type KinSolution, type KinTree, type RollState } from './cinematique.mjs';
import type { NomRole } from '../../systeme.js';

/**
 * Régime nominal à l'arbre de sortie d'un moteur à courant continu, en tours
 * par seconde : 200 tr/min, motoréducteur TT 1:48 sous 5 V (paquet `moteur-dc`
 * de la bibliothèque mécanique). La simulation donne la vitesse en fraction du
 * nominal (`motorStates`) : elle est multipliée par ce régime.
 */
export const TOURS_PAR_S_NOMINAL = 200 / 60;

/** Ce que la simulation donne à chaque image, par repère du schéma. */
export interface EtatSimulation {
  /** Angle de chaque servo, en degrés (0-180). */
  servos: Record<string, number>;
  /** Vitesse de chaque moteur, en fraction du régime nominal (signée). */
  moteurs: Record<string, number>;
}

/** Ce qu'il faut savoir d'une pièce pour la piloter. */
export interface PiecePilotee {
  id: string;
  role?: { nom: NomRole; repere: string };
  /** Repère effectif (`ref`, sinon celui du rôle propre). */
  repere?: string;
  /** Pièce en défaut de rôle : inerte. */
  inerte: boolean;
}

/** Une liaison menée par un composant du schéma. */
export interface Commande {
  liaison: string;
  repere: string;
  /** Pièce dont le rôle a créé la commande. */
  piece: string;
}

/** Commandes du montage : une par pivot piloté (la première l'emporte). */
export function commandesDuMontage(tree: KinTree, pieces: readonly PiecePilotee[]): Commande[] {
  const out: Commande[] = [];
  const prises = new Set<string>();
  const menees = new Set(tree.gears.map((g) => g.driven));
  const ajouter = (liaison: string | undefined, repere: string, piece: string): void => {
    if (!liaison || prises.has(liaison) || menees.has(liaison)) return;
    if (tree.joints[liaison]?.type !== 'pivot') return;
    prises.add(liaison);
    out.push({ liaison, repere, piece });
  };
  for (const p of pieces) {
    if (!p.role || p.inerte) continue;
    if (p.role.nom === 'servo' || p.role.nom === 'moteur') {
      const repere = p.repere ?? p.role.repere;
      for (const j of Object.values(tree.joints)) if (j.parent === p.id) ajouter(j.id, repere, p.id);
    } else if (p.role.nom === 'roue') {
      ajouter(tree.nodes[p.id]?.joint, p.role.repere, p.id);
    }
  }
  return out;
}

/** Pose courante du montage piloté. */
export interface ImagePilotee {
  solution: KinSolution;
  /** Liaisons arrêtées à une borne. */
  saturees: Record<string, 'min' | 'max'>;
  /** Problèmes du solveur sur cette image. */
  problemes: KinProblem[];
  /** Commandes dont le repère n'est ni un servo ni un moteur simulé. */
  sansSource: string[];
}

/** État du pilotage d'un montage pendant une simulation. */
export class Pilotage {
  private readonly cmd: Commande[];
  /** Angle accumulé par liaison menée par un moteur (degrés, écart au zéro). */
  private tours: Record<string, number> = {};
  /** Dernière valeur rendue par le solveur, par liaison (pour les pas de roulage). */
  private precedent: Record<string, number> = {};
  private roule: RollState | undefined;

  constructor(private readonly tree: KinTree, pieces: readonly PiecePilotee[]) {
    this.cmd = commandesDuMontage(tree, pieces);
    this.remettre();
  }

  get commandes(): readonly Commande[] {
    return this.cmd;
  }

  /** Retour à la pose du document. */
  remettre(): ImagePilotee {
    this.tours = {};
    this.roule = rollStart(this.tree);
    const solution = solve(this.tree);
    this.precedent = { ...solution.values };
    return { solution, saturees: solution.saturated, problemes: solution.problems, sansSource: [] };
  }

  /** Une image : `dt` secondes écoulées depuis la précédente. */
  pas(etat: EtatSimulation, dt: number): ImagePilotee {
    const q: Record<string, number> = {};
    const sansSource: string[] = [];
    const duree = Number.isFinite(dt) && dt > 0 ? dt : 0;
    for (const c of this.cmd) {
      const j = this.tree.joints[c.liaison];
      const angle = etat.servos[c.repere];
      const vitesse = etat.moteurs[c.repere];
      if (Number.isFinite(angle)) q[c.liaison] = angle;
      else if (Number.isFinite(vitesse)) {
        this.tours[c.liaison] = (this.tours[c.liaison] ?? 0) + vitesse * TOURS_PAR_S_NOMINAL * 360 * duree;
        q[c.liaison] = j.zero + this.tours[c.liaison];
      } else sansSource.push(c.liaison);
    }
    // Roues : rotation de chaque pivot depuis l'image précédente, bornes
    // comprises (on résout d'abord sans déplacer le châssis pour connaître les
    // valeurs retenues) ; `rollStep` n'en lit que les roues et leurs meneurs.
    let base = {};
    if (this.roule) {
      const valeurs = solve(this.tree, q).values;
      const deltas: Record<string, number> = {};
      for (const [id, v] of Object.entries(valeurs)) {
        const d = v - (this.precedent[id] ?? v);
        if (d) deltas[id] = d;
      }
      // Les engrenages propagent eux-mêmes : ne garder que les meneurs.
      for (const g of this.tree.gears) delete deltas[g.driven];
      this.roule = rollStep(this.roule, this.tree, deltas);
      base = rollBase(this.tree, this.roule);
    }
    const solution = solve(this.tree, q, base);
    this.precedent = { ...solution.values };
    return { solution, saturees: solution.saturated, problemes: solution.problems, sansSource };
  }
}
