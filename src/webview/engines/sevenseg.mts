/**
 * Latch des afficheurs 7 segments MULTIPLEXÉS, échantillonné à haute fréquence.
 *
 * Un afficheur multiplexé n'éclaire qu'un chiffre à la fois, ~2 ms chacun : lu à
 * la seule cadence du rendu (~16 ms), l'affichage défile chiffre par chiffre. Il
 * faut donc lire les broches à CHAQUE front GPIO — et cette lecture doit se faire
 * là où sont les broches. Avec un moteur déporté, c'est dans le worker : depuis la
 * page, `onUpdate` ne tombe qu'à chaque instantané (4 ms) et les chiffres brefs
 * sont manqués.
 *
 * D'où ce module partagé : la MÊME fonction sert au fil principal (lecture directe
 * du moteur) et au worker (lecture directe du sien), et la page ne fait plus que
 * relire le latch publié.
 */

/**
 * Afficheur multiplexé décrit : broches MCU déjà résolues (aucun rebâtissage de
 * nets à l'échantillonnage) et niveaux imposés par un rail. Structurellement
 * identique à `SevenSegmentMuxBinding` (`diagram/model.mts`) — le type est
 * redéclaré ici pour que le bundle du worker n'embarque pas le modèle du schéma.
 */
export interface SevenSegMuxSpec {
  partId: string;
  digits: number;
  commonAnode: boolean;
  /** Broche MCU de chaque segment A..DP (index 0..7), null si non câblé. */
  segPins: (string | null)[];
  /** Broche MCU de chaque commun DIG1..DIGn, null si non câblé. */
  digitPins: (string | null)[];
  /** Niveau imposé par un rail pour chaque segment (1, 0 ou null). */
  segFixed: (number | null)[];
  /** Idem pour chaque commun (un commun soudé à la masse reste actif). */
  digitFixed: (number | null)[];
}

/**
 * Échantillonne les latchs : pour chaque afficheur, repère le chiffre ACTIF et
 * mémorise ses 8 segments. Un chiffre éteint garde sa dernière valeur — c'est
 * tout le principe du latch, et c'est ce qui rend l'affichage stable à l'écran.
 * `latches` est modifiée sur place (tableau de `digits × 8` valeurs 0/1).
 */
export function sampleSevenSeg(
  specs: SevenSegMuxSpec[],
  latches: Map<string, number[]>,
  readDigital: (pin: string) => boolean
): void {
  for (const b of specs) {
    let latch = latches.get(b.partId);
    if (!latch || latch.length !== b.digits * 8) {
      latch = new Array(b.digits * 8).fill(0);
      latches.set(b.partId, latch);
    }
    for (let d = 0; d < b.digits; d++) {
      const digPin = b.digitPins[d];
      // Un commun sans broche MCU peut être câblé en dur à un rail : il vaut
      // alors ce rail. Sans rail NI broche, le chiffre n'est pas alimenté.
      const digFixed = b.digitFixed[d];
      if (!digPin && digFixed === null) continue;
      const common = digPin ? (readDigital(digPin) ? 1 : 0) : digFixed!; // niveau du commun
      const active = b.commonAnode ? common === 1 : common === 0;
      if (!active) continue; // chiffre éteint : on garde sa dernière valeur (latch)
      for (let s = 0; s < 8; s++) {
        const segPin = b.segPins[s];
        // Segment sans broche MCU : niveau du rail auquel il est soudé (les deux
        // points d'une horloge sont tirés au 3,3 V), sinon éteint.
        const fixed = b.segFixed[s];
        const seg = segPin ? (readDigital(segPin) ? 1 : 0) : (fixed ?? (b.commonAnode ? 1 : 0));
        latch[d * 8 + s] = b.commonAnode
          ? common === 1 && seg === 0
            ? 1
            : 0
          : common === 0 && seg === 1
            ? 1
            : 0;
      }
    }
  }
}
