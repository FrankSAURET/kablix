/**
 * Décodeur DMX512 branché sur le flux d'octets d'un UART matériel.
 *
 * Une trame DMX512 ne commence pas par un octet mais par un BREAK (ligne basse
 * ≥ 88 µs) suivi d'un MAB, que l'UART ne sait pas produire : les programmes le
 * tiennent à la main (broche TX pilotée en GPIO côté Arduino, `sendbreak()` côté
 * MicroPython). Rien de tout cela n'apparaît dans `onByteTransmit` — le décodeur
 * se resynchronise donc sur le SILENCE : à 250 kbauds, deux octets d'une même
 * trame sont séparés de ~44 µs, un BREAK en fait au moins 88. Au-delà du seuil,
 * l'octet suivant est un START CODE.
 *
 * Seul le start code 0 (« éclairage ») est retenu : les autres (RDM, test…) ne
 * portent pas de niveaux de projecteur et ne doivent pas écraser l'univers. Cette
 * garde protège aussi le cas ordinaire — la même broche TX sert au moniteur
 * série, et un `Serial.println` ne doit pas allumer un projecteur.
 *
 * Les canaux sont appliqués AU FIL DE L'EAU : un vrai récepteur attend la fin de
 * trame, mais 512 canaux à 250 kbauds font 23 ms de retard pour rien. Le décodeur
 * ne prévient personne de lui-même ; c'est le moteur qui relève `takeChanged()`
 * à sa cadence de publication, sinon un balayage de 512 canaux coûterait 512
 * messages.
 */

/** Silence minimal séparant deux trames, en µs simulées (BREAK de la norme). */
const GAP_US = 88;

/** Canaux d'un univers, plus le start code en tête (index 0). */
export const DMX_SLOTS = 513;

export class DmxDecoder {
  /** Univers courant : index 0 = start code, 1..512 = canaux. */
  readonly universe = new Uint8Array(DMX_SLOTS);

  /** Instant du dernier octet reçu, en µs simulées (−1 = aucun). */
  private lastUs = -1;
  /** Position dans la trame courante (0 = start code) ; −1 = trame ignorée. */
  private slot = -1;
  /** Vrai si un canal a bougé depuis le dernier relevé. */
  private dirty = false;

  /** Un octet vient de partir sur la ligne, daté en µs de temps SIMULÉ. */
  feed(byte: number, us: number): void {
    const nouvelle = this.lastUs < 0 || us - this.lastUs >= GAP_US;
    this.lastUs = us;
    if (nouvelle) {
      // Le silence a fermé la trame précédente : celle-ci s'ouvre sur son start
      // code. Un start code non nul (RDM…) met le décodeur en sommeil jusqu'au
      // prochain silence.
      this.slot = byte === 0 ? 0 : -1;
      return;
    }
    if (this.slot < 0) return;
    this.slot += 1;
    if (this.slot >= DMX_SLOTS) return;
    if (this.universe[this.slot] !== byte) {
      this.universe[this.slot] = byte;
      this.dirty = true;
    }
  }

  /** BREAK explicite (uart.sendbreak) : ferme la trame sans attendre le silence. */
  breakDetected(): void {
    this.lastUs = -1;
    this.slot = -1;
  }

  /** L'univers s'il a changé depuis le dernier appel, `null` sinon. */
  takeChanged(): Uint8Array | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return this.universe;
  }

  /** Remet à zéro (arrêt de simulation, recâblage). */
  reset(): void {
    this.universe.fill(0);
    this.lastUs = -1;
    this.slot = -1;
    this.dirty = false;
  }
}
