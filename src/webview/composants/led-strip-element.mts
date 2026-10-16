// Ruban de LED adressables, extensible : <kablix-led-strip>.
// Composant natif Kablix (pas un fork Wokwi). Dessin PROCÉDURAL : le nombre de LED est une
// propriété, le ruban est enroulé en SPIRALE pour tenir sur la feuille, son départ (entrée)
// à l'extérieur, relié par une queue de fils à une connectique de 3 ou 4 broches posées sur
// la grille de 10 px.
//  - 'ws2811' : un fil de données, ordre RGB, pause de fin de trame 300 µs. Broches GND, 5V, DIN.
//  - 'ws2812' : un fil de données — WS2812(B), SK6812 (NeoPixel), ordre GRB. Mêmes broches.
//  - 'apa102' : SPI, données + horloge — APA102 (DotStar). Broches GND, 5V, DI, CI.
//  - 'ws2801' : SPI, données + horloge — WS2801 (ordre des couleurs réglable). Mêmes broches.
// Décodage : cf. neopixelBindings (model.mts) et les décodeurs des moteurs.
import { css, html, LitElement, svg } from 'lit';
import { ElementPin, VCC } from './pin.mjs';
import type { RGB } from './types/rgb.mjs';

export type LedStripProtocol = 'ws2811' | 'ws2812' | 'apa102' | 'ws2801';

/** Protocole reconnu, sinon WS2812 (valeur d'un fichier abîmé ou d'une version future). */
export function stripProtocol(value: unknown): LedStripProtocol {
  return value === 'ws2811' || value === 'apa102' || value === 'ws2801' ? value : 'ws2812';
}

/** Protocoles SPI (données + horloge) par opposition au fil unique. */
export function stripIsSpi(protocol: LedStripProtocol): boolean {
  return protocol === 'apa102' || protocol === 'ws2801';
}

/** Nombre de LED du ruban : entier ≥ 1, 10 par défaut (aucun maximum). */
export function stripLedCount(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 10;
}

/** Broches du protocole, dans l'ordre de la connectique (de gauche à droite). */
export function stripPinNames(protocol: LedStripProtocol): string[] {
  return stripIsSpi(protocol) ? ['GND', '5V', 'DI', 'CI'] : ['GND', '5V', 'DIN'];
}

const LED_PITCH = 12; // distance entre deux LED, le long du ruban
const TURN_PITCH = 16; // écart entre deux tours de la spirale (ruban 12 + jour de 4)
const INNER_RADIUS = 14; // rayon de la LED du bout (au centre)
const RIBBON_WIDTH = 12;
const LED_SIZE = 8;
const PIN_PITCH = 10;
const CONNECTOR_X = 20; // 1re pastille de la connectique (fixe, en haut à gauche)
const CONNECTOR_Y = 20;
const CONNECTOR_ZONE = 50; // hauteur réservée en haut pour la connectique et la queue de fils

export interface StripLed {
  x: number;
  y: number;
  /** Orientation du ruban en ce point (degrés) : la LED est couchée dans le sens du ruban. */
  deg: number;
}

export interface StripGeometry {
  width: number;
  height: number;
  /** Centre de la spirale. */
  cx: number;
  cy: number;
  /** Rayon de la LED d'entrée (la plus extérieure). */
  outer: number;
  /** LED dans l'ordre de la chaîne : 0 = entrée (extérieur), n−1 = bout (centre). */
  leds: StripLed[];
  /** Fin du ruban à l'extérieur, là où partent les fils. */
  tail: { x: number; y: number };
  /** Centre des pastilles de la connectique. */
  pins: { name: string; x: number; y: number }[];
}

const snapUp = (v: number) => Math.ceil(v / 10) * 10;

/**
 * Géométrie du ruban : spirale d'Archimède parcourue du centre vers l'extérieur à pas de
 * `LED_PITCH` d'arc, puis renumérotée pour que la LED 0 soit la plus extérieure. L'entrée
 * est tournée à droite de la spirale, où le ruban repart vers le BAS : la queue de fils
 * descend sans croiser les tours.
 */
export function stripGeometry(count: number, protocol: LedStripProtocol): StripGeometry {
  const b = TURN_PITCH / (2 * Math.PI);
  const phis: number[] = [0];
  for (let k = 1; k < count; k++) {
    const phi = phis[k - 1];
    const r = INNER_RADIUS + b * phi;
    phis.push(phi + LED_PITCH / Math.hypot(r, b));
  }
  const phiEnd = phis[count - 1];
  const outer = INNER_RADIUS + b * phiEnd;
  const cx = snapUp(outer + 20);
  // Connectique FIXE en haut à gauche (même place quel que soit le nombre de LED) : la
  // spirale grandit vers le bas et la droite, sous la connectique.
  const cy = snapUp(outer + CONNECTOR_ZONE + 20);
  const leds: StripLed[] = [];
  for (let k = count - 1; k >= 0; k--) {
    const r = INNER_RADIUS + b * phis[k];
    const theta = phis[k] - phiEnd - Math.PI / 2; // l'entrée tombe au nord
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    const dx = b * Math.cos(theta) - r * Math.sin(theta);
    const dy = b * Math.sin(theta) + r * Math.cos(theta);
    leds.push({ x, y, deg: (Math.atan2(dy, dx) * 180) / Math.PI });
  }
  const tail = { x: cx, y: cy - outer - 10 };
  const names = stripPinNames(protocol);
  const span = PIN_PITCH * (names.length - 1);
  const pins = names.map((name, i) => ({ name, x: CONNECTOR_X + PIN_PITCH * i, y: CONNECTOR_Y }));
  return {
    width: Math.max(2 * cx, CONNECTOR_X + span + 20),
    height: cy + outer + 20,
    cx,
    cy,
    outer,
    leds,
    tail,
    pins,
  };
}

/** Couleur du fil de chaque broche (convention des rubans du commerce). */
const WIRE_COLOR: Record<string, string> = {
  GND: '#222222',
  '5V': '#d62020',
  DIN: '#2e9e3c',
  DI: '#2e9e3c',
  CI: '#e0b420',
};

/** Seuil de « LED allumée » (sous ce niveau : éteinte, donc blanche et sans halo). */
const PIXEL_LIT = 0.004;

export class LEDStripElement extends LitElement {
  declare leds: number;
  declare protocol: LedStripProtocol;

  static properties = {
    leds: { type: Number },
    protocol: {},
  };

  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  constructor() {
    super();
    this.leds = 10;
    this.protocol = 'ws2812';
  }

  private pixelElements: SVGRectElement[] | null = null;

  /** Dernier style écrit par pixel : la simulation repose toutes les couleurs à chaque image. */
  private lastStyle: string[] = [];

  private get geometry(): StripGeometry {
    return stripGeometry(stripLedCount(this.leds), stripProtocol(this.protocol));
  }

  get pinInfo(): ElementPin[] {
    return this.geometry.pins.map((p) => ({
      name: p.name,
      x: p.x,
      y: p.y,
      signals: p.name === '5V' ? [VCC(5)] : p.name === 'GND' ? [{ type: 'power', signal: 'GND' }] : [],
    }));
  }

  private getPixelElements(): SVGRectElement[] {
    if (!this.pixelElements) {
      this.pixelElements = Array.from(this.renderRoot.querySelectorAll('rect.pixel'));
    }
    return this.pixelElements;
  }

  setPixel(pixel: number, { r, g, b }: RGB) {
    const lum = Math.max(r, g, b);
    if (lum <= PIXEL_LIT) {
      this.applyStyle(pixel, '', '');
      return;
    }
    // Même rendu que l'anneau NeoPixel : boîtier blanc teinté + halo de la couleur pure.
    const hue = { r: (r / lum) * 255, g: (g / lum) * 255, b: (b / lum) * 255 };
    const tint = Math.sqrt(lum);
    const mix = (c: number) => Math.round(255 + (c - 255) * tint);
    const fill = `rgb(${mix(hue.r)},${mix(hue.g)},${mix(hue.b)})`;
    const glow = `rgba(${Math.round(hue.r)},${Math.round(hue.g)},${Math.round(hue.b)},${lum.toFixed(2)})`;
    const filter =
      `drop-shadow(0 0 ${(0.8 + lum * 0.7).toFixed(2)}px ${glow})` +
      ` drop-shadow(0 0 ${(2 + lum * 2).toFixed(2)}px ${glow})`;
    this.applyStyle(pixel, fill, filter);
  }

  private applyStyle(pixel: number, fill: string, filter: string): void {
    const els = this.getPixelElements();
    if (pixel < 0 || pixel >= els.length) return;
    const style = `${fill}|${filter}`;
    if (this.lastStyle[pixel] === style) return;
    this.lastStyle[pixel] = style;
    els[pixel].style.fill = fill;
    els[pixel].style.filter = filter;
  }

  /** Éteint toutes les LED. */
  reset() {
    for (let i = 0; i < this.getPixelElements().length; i++) this.applyStyle(i, '', '');
  }

  updated() {
    // Gabarit (re)rendu : les rects sont neufs, sans style.
    this.pixelElements = null;
    this.lastStyle = [];
  }

  render() {
    const g = this.geometry;
    // Du bout des fils (extérieur) à la LED du centre : la queue part de l'entrée, LED 0.
    const ribbon =
      `M${g.tail.x.toFixed(2)},${g.tail.y.toFixed(2)} ` +
      g.leds.map((l) => `L${l.x.toFixed(2)},${l.y.toFixed(2)}`).join(' ');
    const head = g.pins[0].x - 5;
    const headEnd = g.pins[g.pins.length - 1].x + 5;
    const headY = g.pins[0].y - 10;
    const headBottom = headY + 15;
    return html`
      <svg width=${g.width} height=${g.height} viewBox="0 0 ${g.width} ${g.height}" xmlns="http://www.w3.org/2000/svg">
        ${svg`
          <path d=${ribbon} fill="none" stroke="#8d8d8d" stroke-width=${RIBBON_WIDTH + 2} stroke-linejoin="round" stroke-linecap="round" />
          <path d=${ribbon} fill="none" stroke="#dcdcdc" stroke-width=${RIBBON_WIDTH} stroke-linejoin="round" stroke-linecap="round" />
          ${g.pins.map(
            (p) => svg`<path d="M${g.tail.x},${g.tail.y} C${g.tail.x},${g.tail.y - 20} ${p.x},${headBottom + 20} ${p.x},${headBottom}"
              fill="none" stroke=${WIRE_COLOR[p.name] ?? '#888'} stroke-width="2" />`
          )}
          <rect x=${head} y=${headY} width=${headEnd - head} height="15" rx="2" fill="#2b2b2b" />
          ${g.pins.map((p) => svg`<circle cx=${p.x} cy=${p.y} r="3" fill="#d9a441" />`)}
          ${g.leds.map(
            (l) => svg`<rect class="pixel" x=${-LED_SIZE / 2} y=${-LED_SIZE / 2} width=${LED_SIZE} height=${LED_SIZE} rx="1.2"
              transform="translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) rotate(${l.deg.toFixed(1)})"
              fill="#ffffff" stroke="#8d8d8d" stroke-width="0.6" />`
          )}
        `}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-led-strip')) {
  customElements.define('kablix-led-strip', LEDStripElement);
}
