// Ruban de LED en SPI (APA102 / DotStar, WS2801), vu comme un esclave du bus SPI du MCU.
// Il n'a ni broche CS ni retour : on reçoit un flot d'octets (MOSI), l'horloge est celle du
// contrôleur SPI matériel.
//  - APA102 : [début 32 bits à 0] + [LED 32 bits : 111 + luminosité 5 bits, B, V, R] ... +
//    [fin]. Une trame de début (octet de tête sans le motif 111) remet le rang à zéro ; la
//    trame de fin (0xFFFFFFFF) est ignorée.
//  - WS2801 : 24 bits par LED dans l'ordre réglé (RVB par défaut), pas de trame de début ;
//    une pause d'horloge > 500 µs ouvre une nouvelle trame.
//
// Module pur (sans DOM), testable hors navigateur.
import type { SpiDevice } from './i2c-devices.mjs';
import { type ColorOrder, type Rgb } from './ws2812.mjs';

/** Pause d'horloge (µs) qui verrouille les couleurs d'un WS2801 et ouvre la trame suivante. */
export const WS2801_LATCH_US = 500;

export class SpiLedStripDevice implements SpiDevice {
  /** Couleur de chaque LED (composantes 0..1). */
  readonly colors: Rgb[];

  private idx = 0;
  private word: number[] = [];
  private lastUs = Number.NEGATIVE_INFINITY;
  private readonly rank: { r: number; g: number; b: number };

  constructor(
    count: number,
    private readonly protocol: 'apa102' | 'ws2801',
    order: ColorOrder = 'rgb'
  ) {
    this.colors = Array.from({ length: Math.max(1, count) }, () => ({ r: 0, g: 0, b: 0 }));
    this.rank = { r: order.indexOf('r'), g: order.indexOf('g'), b: order.indexOf('b') };
  }

  /** Compatible avec les décodeurs un fil : rien à classer en fin de trame. */
  flush(): void {}

  transfer(mosi: number, _dc: boolean, nowUs = 0): number {
    if (this.protocol === 'apa102') this.feedApa102(mosi);
    else this.feedWs2801(mosi, nowUs);
    return 0xff;
  }

  private feedApa102(b: number): void {
    this.word.push(b);
    if (this.word.length < 4) return;
    const [head, blue, green, red] = this.word;
    this.word = [];
    if ((head & 0xe0) !== 0xe0) {
      this.idx = 0; // trame de début
      return;
    }
    if (head === 0xff && blue === 0xff && green === 0xff && red === 0xff) return; // trame de fin
    if (this.idx >= this.colors.length) return;
    const k = (head & 0x1f) / 31 / 255;
    this.colors[this.idx++] = { r: red * k, g: green * k, b: blue * k };
  }

  private feedWs2801(b: number, nowUs: number): void {
    if (nowUs - this.lastUs > WS2801_LATCH_US) {
      this.idx = 0;
      this.word = [];
    }
    this.lastUs = nowUs;
    this.word.push(b);
    if (this.word.length < 3) return;
    const w = this.word;
    this.word = [];
    if (this.idx >= this.colors.length) return;
    this.colors[this.idx++] = {
      r: w[this.rank.r] / 255,
      g: w[this.rank.g] / 255,
      b: w[this.rank.b] / 255,
    };
  }
}
