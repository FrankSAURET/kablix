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

/** Ordre des octets d'une LED sur le fil : « grb » = vert d'abord (WS2812), « rgb » (WS2811). */
export type ColorOrder = 'rgb' | 'grb' | 'brg';

/** Ordre reconnu, sinon `repli` (valeur d'un fichier abîmé). */
export function colorOrderOf(value: unknown, repli: ColorOrder): ColorOrder {
  return value === 'rgb' || value === 'grb' || value === 'brg' ? value : repli;
}

/** Rang (0, 1, 2) de l'octet rouge / vert / bleu dans la trame, selon l'ordre. */
function channelRanks(order: ColorOrder): { r: number; g: number; b: number } {
  return { r: order.indexOf('r'), g: order.indexOf('g'), b: order.indexOf('b') };
}

/** Une chaîne à décoder : sur une broche MCU (un fil) ou sur le bus SPI du MCU. */
export interface NeopixelStripSpec {
  /** Broche MCU de DIN. Pour un ruban SPI : nom de lecture synthétique (`spi:<id>`). */
  pin: string;
  count: number;
  /** Ordre des couleurs sur le fil (un fil : « grb » par défaut). */
  order?: ColorOrder;
  /** Pause de fin de trame (µs) : un BAS plus long ouvre une nouvelle trame. */
  resetUs?: number;
  /** Ruban SPI : décodé sur le bus matériel, pas sur une broche. */
  spi?: 'apa102' | 'ws2801';
}

export class Ws2812Decoder {
  /** Couleur de chaque LED (composantes 0..1). */
  readonly colors: Rgb[];
  private readonly rank: { r: number; g: number; b: number };

  private high = false;
  private riseCycle = 0;
  private lastFall = 0;
  private pendingHigh = -1; // durée du HAUT du bit en attente de classification
  private maxHigh = 0; // plus long HAUT vu dans la trame (≈ T1H) pour le seuil de flush
  private bits = 0;
  private nbits = 0;
  private idx = 0;
  private readonly resetCycles: number;
  private readonly minHighOneCycles: number;

  constructor(
    private readonly count: number,
    cyclesPerUs: number,
    order: ColorOrder = 'grb',
    resetUs = 30 // > BAS d'un bit, < reset (50 µs) ; 300 pour WS2811 / NeoPixel en ruban
  ) {
    this.colors = Array.from({ length: Math.max(1, count) }, () => ({ r: 0, g: 0, b: 0 }));
    this.resetCycles = Math.round(resetUs * cyclesPerUs);
    this.minHighOneCycles = 0.5 * cyclesPerUs;
    this.rank = channelRanks(order);
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
    // Plancher absolu (0,5 µs) : tant que la trame n'a montré que des « 0 » (début noir),
    // maxHigh = T0H et un « 0 » serait pris pour un « 1 » (LED rouge fantôme en cours de trame).
    const seuil = Math.max(this.maxHigh * 0.6, this.minHighOneCycles);
    this.pushBit(this.pendingHigh > seuil ? 1 : 0);
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
    const byteAt = (rank: number) => (this.bits >> (16 - 8 * rank)) & 0xff;
    this.colors[this.idx] = {
      r: byteAt(this.rank.r) / 255,
      g: byteAt(this.rank.g) / 255,
      b: byteAt(this.rank.b) / 255,
    };
    this.idx++;
  }

  private newFrame(): void {
    this.idx = 0;
    this.nbits = 0;
    this.bits = 0;
    this.maxHigh = 0;
  }
}
