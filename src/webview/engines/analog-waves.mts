/**
 * Sources analogiques CALCULÉES : la tension d'une broche n'est pas une valeur
 * posée une fois, c'est une fonction du temps.
 *
 * Deux formes d'onde à ce jour : la charge d'un condensateur (exponentielle RC)
 * et la courbe d'un capteur de pouls (PPG). Toutes deux varient beaucoup plus vite
 * que l'affichage : une valeur posée à chaque frame (~16 ms) apparaîtrait en
 * escalier à un sketch qui échantillonne toutes les 5 ms de temps simulé.
 *
 * D'où ce module : la forme d'onde est DÉCRITE (quelques nombres), pas calculée
 * d'avance, et le moteur l'évalue à l'instant EXACT de la conversion ADC. Décrite
 * plutôt que fermée dans une closure, elle traverse la frontière d'un Web Worker —
 * une fonction, non. C'est ce qui permet au moteur de tourner sur son propre fil
 * sans dégrader la courbe.
 */

/** Une source analogique décrite par ses paramètres, évaluable à tout instant. */
export type AnalogWave =
  /**
   * Charge/décharge d'un condensateur, solution EXACTE de l'exponentielle :
   * v(t) = V∞ + (v0 − V∞)·e^(−Δt/RC). `t0` est en ms de temps SIMULÉ (au ralenti,
   * le condensateur se charge à l'heure du programme, pas à celle de l'écran).
   * `tau` vaut 0 si le nœud suit sa source sans retard, `Infinity` s'il flotte.
   */
  | { kind: 'rc'; pin: string; v0: number; target: number; tau: number; t0: number; vcc: number }
  /** Capteur de pouls : courbe cardiaque périodique, en temps RÉEL. */
  | { kind: 'pulse'; pin: string; bpm: number };

/** Tension de repos d'un capteur de pouls sans battement (fraction de VREF). */
const PULSE_FLATLINE = 0.08;

/**
 * Forme d'onde de pouls (PPG) normalisée 0..1 sur une phase t∈[0,1) : montée
 * systolique rapide (pic vers t≈0.16), redescente, petite onde dicrotique
 * (t≈0.42), puis ligne de base. Approximation par deux gaussiennes.
 *
 * Ligne de base haute (0.6) + amplitude modérée (0.15) : un vrai capteur KY-039
 * varie peu en valeur absolue (bruit + faible modulation), il ne bascule pas
 * entre presque 0 et presque plein échelle à chaque battement. Avec une ligne de
 * base quasi nulle, les algos de détection par seuil relatif (ex. tuto KY-039
 * classique : max_value -= 1000 // delay_msec) perdent le pic en 1-2 échantillons
 * à 60 ms et redéclenchent sur la même descente → BPM mesuré ~2× trop élevé.
 */
export function pulseWaveform(t: number): number {
  const g = (c: number, w: number) => Math.exp(-((t - c) * (t - c)) / (2 * w * w));
  const systolic = g(0.16, 0.1);
  const dicrotic = 0.35 * g(0.42, 0.1);
  return Math.max(0, Math.min(1, 0.6 + 0.15 * Math.max(systolic, dicrotic)));
}

/**
 * Évalue une onde et rend la fraction de VREF (0..1) à poser sur l'entrée.
 *
 * `simulatedMs` est l'heure du programme (elle cadence le RC), `realMs` l'heure du
 * mur (elle cadence le pouls, phénomène physique qui ne ralentit pas quand la
 * simulation ralentit).
 */
export function evalAnalogWave(wave: AnalogWave, simulatedMs: number, realMs: number): number {
  const clamp = (x: number): number => Math.max(0, Math.min(1, x));
  if (wave.kind === 'pulse') {
    const bpm = Math.max(0, Math.min(200, wave.bpm));
    if (bpm <= 0) return PULSE_FLATLINE; // pas de pouls : ligne de base
    const periodMs = 60000 / bpm;
    return pulseWaveform((realMs % periodMs) / periodMs);
  }
  if (wave.tau === 0) return clamp(wave.target / wave.vcc);
  if (!Number.isFinite(wave.tau)) return clamp(wave.v0 / wave.vcc); // nœud flottant : charge figée
  const dt = Math.max(0, (simulatedMs - wave.t0) / 1000);
  return clamp((wave.target + (wave.v0 - wave.target) * Math.exp(-dt / wave.tau)) / wave.vcc);
}
