// Décodeur de chaîne WS2812 / NeoPixel (protocole « une donnée » à 800 kHz).
// Chaque bit = un créneau haut puis bas ; un « 1 » a un HAUT long (T1H≈0,8 µs) et
// un BAS court, un « 0 » l'inverse. On classe donc chaque bit par HAUT > BAS,
// règle indépendante de l'implémentation (vrai bit-bang AVR, PIO RP2040…), tant
// que l'invariant WS2812 (T1H>T0H) est respecté. 24 bits = une LED (ordre GRB).
// Le décodeur est alimenté par les fronts de la broche DIN (avec horodatage en
// cycles) ; un long BAS (>30 µs) marque le « reset » entre deux trames.
//
// Module pur (sans DOM), testable hors navigateur.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export class Ws2812Decoder {
  /** Couleur de chaque LED (composantes 0..1). */
  readonly colors: Rgb[];

  private high = false;
  private riseCycle = 0;
  private lastFall = 0;
  private pendingHigh = -1; // durée du HAUT du bit en attente de classification
  private maxHigh = 0; // plus long HAUT vu dans la trame (≈ T1H) pour le seuil de flush
  private bits = 0;
  private nbits = 0;
  private idx = 0;
  private readonly resetCycles: number;

  constructor(
    private readonly count: number,
    cyclesPerUs: number
  ) {
    this.colors = Array.from({ length: Math.max(1, count) }, () => ({ r: 0, g: 0, b: 0 }));
    this.resetCycles = Math.round(30 * cyclesPerUs); // > BAS d'un bit, < reset (50 µs)
  }

  /** À appeler à chaque changement de niveau de DIN (cycle = compteur du cœur). */
  edge(cycle: number, level: boolean): void {
    if (level && !this.high) {
      const low = cycle - this.lastFall;
      // Front montant : le BAS qui vient de finir classe le bit précédent (HAUT>BAS).
      if (this.pendingHigh >= 0) {
        this.pushBit(this.pendingHigh > low ? 1 : 0);
        this.pendingHigh = -1;
      }
      if (low > this.resetCycles) this.newFrame(); // long BAS = nouvelle trame
      this.riseCycle = cycle;
      this.high = true;
    } else if (!level && this.high) {
      this.pendingHigh = cycle - this.riseCycle;
      if (this.pendingHigh > this.maxHigh) this.maxHigh = this.pendingHigh;
      this.lastFall = cycle;
      this.high = false;
    }
  }

  /**
   * Classe le dernier bit en attente (fin de trame : pas de front suivant). Comme
   * le BAS final est absent, on compare le HAUT au seuil de la trame (≈ 0,6×T1H).
   * À appeler avant de lire les couleurs.
   */
  flush(): void {
    if (this.pendingHigh < 0) return;
    this.pushBit(this.maxHigh > 0 && this.pendingHigh > this.maxHigh * 0.6 ? 1 : 0);
    this.pendingHigh = -1;
  }

  private pushBit(bit: number): void {
    this.bits = ((this.bits << 1) | bit) & 0xffffff;
    if (++this.nbits === 24) {
      this.store();
      this.nbits = 0;
      this.bits = 0;
    }
  }

  private store(): void {
    if (this.idx >= this.count) return;
    const g = (this.bits >> 16) & 0xff;
    const r = (this.bits >> 8) & 0xff;
    const b = this.bits & 0xff;
    this.colors[this.idx] = { r: r / 255, g: g / 255, b: b / 255 };
    this.idx++;
  }

  private newFrame(): void {
    this.idx = 0;
    this.nbits = 0;
    this.bits = 0;
    this.maxHigh = 0;
  }
}
