/**
 * Sources analogiques CALCULÉES : la tension d'une broche n'est pas une valeur
 * posée une fois, c'est une fonction du temps.
 *
 * Trois formes d'onde à ce jour : la charge d'un condensateur (exponentielle RC),
 * la courbe d'un capteur de pouls (PPG) et le signal d'un générateur de fonctions
 * (GBF). Toutes varient beaucoup plus vite que l'affichage : une valeur posée à
 * chaque frame (~16 ms) apparaîtrait en escalier à un sketch qui échantillonne
 * toutes les 5 ms de temps simulé. Le GBF pousse ce raisonnement à l'extrême —
 * à 1 MHz une période dure 1 µs, soit seize mille périodes entre deux frames :
 * la valeur de frame n'a alors AUCUN sens, seule l'évaluation à l'instant de la
 * conversion en a un.
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
  | { kind: 'pulse'; pin: string; bpm: number }
  /**
   * Générateur de fonctions (GBF) : sinus, triangle ou carré, en temps SIMULÉ —
   * c'est un signal ÉLECTRIQUE que le circuit voit, il ne ralentit pas quand la
   * simulation ralentit (à l'inverse du pouls, phénomène du monde réel).
   *
   * `amplitude` est la valeur CRÊTE-À-CRÊTE en volts (0..10 V), c'est-à-dire la
   * hauteur TOTALE du signal — sens français du mot, et celui qu'affiche un vrai
   * GBF de salle de TP. `offset` est la composante continue (−5..+5 V) : la
   * tension va donc de `offset − amplitude/2` à `offset + amplitude/2`. Un
   * générateur réglé sur 5 V d'amplitude et 0 V de décalage sort bien de −2,5 V
   * à +2,5 V. `duty` (0..100 %) est le rapport cyclique ; il déforme le carré ET
   * le triangle (dent de scie aux extrêmes), mais pas le sinus, qui est
   * symétrique par définition.
   *
   * `vcc` est la pleine échelle de l'ADC de la carte (5 V ou 3,3 V) : la sortie
   * est ÉCRÊTÉE à 0..vcc par `evalAnalogWave`, comme une vraie entrée analogique
   * qui ne lit ni le négatif ni au-dessus de sa référence.
   */
  | {
      kind: 'gbf';
      pin: string;
      forme: 'sinus' | 'triangle' | 'carre';
      /** Fréquence en Hz (1 .. 1 000 000). */
      freq: number;
      /** Amplitude crête-à-crête en volts (0 .. 10) : hauteur TOTALE du signal. */
      amplitude: number;
      /** Décalage continu en volts (−5 .. +5). */
      offset: number;
      /** Rapport cyclique en % (0 .. 100) — carré et triangle seulement. */
      duty: number;
      vcc: number;
    };

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
 * Forme d'onde d'un GBF, normalisée entre −1 et +1 sur une phase t∈[0,1).
 *
 * `duty` (0..1) est le rapport cyclique. Il agit sur le carré (durée de l'état
 * haut) et sur le triangle (durée de la MONTÉE : 0,5 donne le triangle
 * symétrique, les extrêmes donnent une dent de scie). Le sinus l'ignore : un
 * sinus déformé n'est plus un sinus, et Frank n'a demandé la déformation que
 * pour le carré et le triangle.
 *
 * Aux rapports cycliques extrêmes, `duty` est borné loin de 0 et de 1 pour le
 * triangle : sans cela la pente deviendrait infinie et le signal, un carré —
 * alors que l'élève a choisi « triangle ».
 */
export function gbfWaveform(forme: 'sinus' | 'triangle' | 'carre', t: number, duty: number): number {
  if (forme === 'sinus') return Math.sin(2 * Math.PI * t);
  if (forme === 'carre') {
    // 0 % = toujours bas, 100 % = toujours haut : les deux butées sont utiles
    // (c'est ainsi qu'on fabrique un niveau continu avec un GBF).
    if (duty <= 0) return -1;
    if (duty >= 1) return 1;
    return t < duty ? 1 : -1;
  }
  // Triangle : montée sur [0, d), descente sur [d, 1). Pente jamais infinie.
  const d = Math.max(0.001, Math.min(0.999, duty));
  return t < d ? -1 + (2 * t) / d : 1 - (2 * (t - d)) / (1 - d);
}

/**
 * Évalue une onde et rend la fraction de VREF (0..1) à poser sur l'entrée.
 *
 * `simulatedMs` est l'heure du programme (elle cadence le RC et le GBF), `realMs`
 * l'heure du mur (elle cadence le pouls, phénomène physique qui ne ralentit pas
 * quand la simulation ralentit).
 */
export function evalAnalogWave(wave: AnalogWave, simulatedMs: number, realMs: number): number {
  const clamp = (x: number): number => Math.max(0, Math.min(1, x));
  if (wave.kind === 'gbf') {
    const freq = Math.max(1, Math.min(1_000_000, wave.freq));
    const periodMs = 1000 / freq;
    // Modulo sur l'heure SIMULÉE : à 1 MHz, une période fait 1 µs — c'est le
    // moteur qui appelle cette fonction à l'instant exact de la conversion, la
    // valeur serait sinon celle d'une frame, seize mille périodes trop tard.
    const phase = (((simulatedMs % periodMs) + periodMs) % periodMs) / periodMs;
    const norme = gbfWaveform(wave.forme, phase, wave.duty / 100);
    // Écrêtage à l'entrée de l'ADC : elle ne lit ni le négatif (diode de
    // protection) ni au-dessus de sa référence. C'est ce que l'élève verra, et
    // c'est ce qu'il verrait sur la vraie carte.
    // `amplitude` est crête-à-crête : la moitié de part et d'autre du décalage.
    return clamp((wave.offset + (wave.amplitude / 2) * norme) / wave.vcc);
  }
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
