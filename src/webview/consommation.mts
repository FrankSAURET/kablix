// Consommation de la carte en temps réel (feuille de route n° 1, v2026.9.7.179).
//
// Ce qui est mesuré : la CARTE RÉELLE (choix de Frank), pas la puce seule. Une
// Uno garde ses ~30 mA même quand son ATmega dort — régulateur, puce USB, LED ON
// — et c'est précisément la leçon : une Uno sur pile ne tient pas, une Pico en
// `lightsleep()` descend à un peu plus d'un milliampère.
//
// Deux états seulement : ÉVEILLÉE et en VEILLE PROFONDE (AVR : SLEEP en
// power-down, power-save ou standby ; Pico : `machine.lightsleep()`). Un
// `delay()` ou un `time.sleep()` n'en est pas : la vraie puce reste éveillée.
// Le moteur compte le temps passé en veille (`SimEngine.sleepMs`) ; le courant
// d'une tranche est la moyenne des deux états pondérée par ce temps.
//
// S'y ajoute le courant que la carte fournit à ce qu'elle alimente (LED
// pilotées par ses broches ou branchées sur ses rails) : la page le calcule
// déjà pour éclairer les LED, elle le passe tel quel.
import type { BoardId } from './diagram/catalog.mjs';

/**
 * Courant de la carte seule, en ampères, éveillée et en veille profonde.
 * ORDRES DE GRANDEUR relevés sur cartes réelles (alimentation USB / 5 V pour
 * les Arduino, 5 V par VBUS pour les Pico), programme au repos, sans rien de
 * branché. À ajuster si des mesures de salle de TP disent autre chose.
 */
export const COURANT_CARTE: Record<BoardId, { eveilleeA: number; veilleA: number }> = {
  uno: { eveilleeA: 0.046, veilleA: 0.031 },
  nano: { eveilleeA: 0.019, veilleA: 0.007 },
  mega: { eveilleeA: 0.072, veilleA: 0.047 },
  pico: { eveilleeA: 0.021, veilleA: 0.0013 },
  picow: { eveilleeA: 0.023, veilleA: 0.0014 },
  pico2: { eveilleeA: 0.022, veilleA: 0.0013 },
  pico2w: { eveilleeA: 0.024, veilleA: 0.0014 },
};

/** Ce que rend une tranche : courant moyen et charge cumulée depuis le départ. */
export interface MesureConsommation {
  /** Courant moyen sur la tranche, en ampères (carte + charges). */
  courantA: number;
  /** Charge consommée depuis le départ, en ampères-heures. */
  chargeAh: number;
  /** Part de la tranche passée en veille profonde (0 à 1). */
  partVeille: number;
  /** Durée de la tranche en temps simulé (ms) ; 0 pour une tranche vide (pause). */
  dtMs: number;
}

/**
 * Intègre le courant dans le TEMPS SIMULÉ (celui du programme) : au ralenti
 * comme à pleine vitesse, une seconde de programme consomme la même chose.
 */
export class CompteurConsommation {
  private simMs = 0;
  private veilleMs = 0;
  private chargeAh = 0;
  private dernier: MesureConsommation = { courantA: 0, chargeAh: 0, partVeille: 0, dtMs: 0 };

  /** Nouveau run : tout repart de zéro. */
  reinitialiser(): void {
    this.simMs = 0;
    this.veilleMs = 0;
    this.chargeAh = 0;
    this.dernier = { courantA: 0, chargeAh: 0, partVeille: 0, dtMs: 0 };
  }

  /**
   * Une tranche : `simMs` et `veilleMs` sont les compteurs CUMULÉS du moteur,
   * `chargesA` le courant fourni par la carte à l'instant de la tranche.
   * Une tranche vide (pause) rend la dernière mesure, sans rien ajouter.
   */
  pas(carte: BoardId, simMs: number, veilleMs: number, chargesA: number): MesureConsommation {
    const dt = simMs - this.simMs;
    if (!(dt > 0)) return { ...this.dernier, dtMs: 0 };
    const dv = Math.min(dt, Math.max(0, veilleMs - this.veilleMs));
    this.simMs = simMs;
    this.veilleMs = veilleMs;
    const { eveilleeA, veilleA } = COURANT_CARTE[carte] ?? COURANT_CARTE.uno;
    const partVeille = dv / dt;
    const courantA = eveilleeA * (1 - partVeille) + veilleA * partVeille + Math.max(0, chargesA);
    this.chargeAh += (courantA * dt) / 3_600_000;
    this.dernier = { courantA, chargeAh: this.chargeAh, partVeille, dtMs: dt };
    return this.dernier;
  }
}

/**
 * Décharge d'une batterie pendant une tranche : `courantA` pendant `dtMs` de
 * temps simulé. Rend la charge restante, jamais négative (Ah).
 */
export function decharger(restantAh: number, courantA: number, dtMs: number): number {
  if (!(dtMs > 0) || !(courantA > 0)) return restantAh;
  return Math.max(0, restantAh - (courantA * dtMs) / 3_600_000);
}

/** Autonomie restante au courant actuel, en heures (Infinity si rien ne débite). */
export function autonomieH(restantAh: number, courantA: number): number {
  return courantA > 0 ? restantAh / courantA : Infinity;
}

/**
 * Tension d'une pile qui se vide (v2026.9.7.180) : droite de `full` (pleine)
 * à `empty` (vide). Une vraie courbe a un plateau puis chute ; la droite suffit
 * à la leçon — la tension baisse, et sous le seuil de la carte, elle s'éteint.
 */
export function tensionBatterie(battery: { full: number; empty: number }, charge: number): number {
  const c = Math.max(0, Math.min(1, charge));
  return battery.empty + (battery.full - battery.empty) * c;
}

/**
 * Plage de tension acceptée par chaque entrée d'alimentation, en volts
 * (v2026.9.7.180). En dessous, la carte ne démarre pas (ou s'éteint) ; au-dessus,
 * elle refuse de démarrer plutôt que de griller.
 *   - VIN (Arduino) : régulateur linéaire, ~1,2 V de chute → 6,2 V au moins pour
 *     tenir 5 V ; 20 V au plus ;
 *   - 5V (Arduino) : rail direct, 4,5 à 5,5 V ;
 *   - VSYS / VBUS (Pico) : convertisseur abaisseur-élévateur, 1,8 à 5,5 V.
 */
export const PLAGES_ENTREE: Record<string, { min: number; max: number }> = {
  VIN: { min: 6.2, max: 20 },
  '5V': { min: 4.5, max: 5.5 },
  VSYS: { min: 1.8, max: 5.5 },
  VBUS: { min: 1.8, max: 5.5 },
};
