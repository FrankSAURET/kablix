// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — ssd1306-element.ts.
// Balise <kablix-ssd1306> (ex <wokwi-ssd1306>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/oled-ssd1306.svg).
// Broches recalées sur la grille de 10 px (repris tel quel de l'ancien pin-overrides.mts).
// Le module réel dessiné est un combo I²C/SPI 8 broches (SDA/SCL/SA0/RST/CS/VDD/VIN/GND,
// étiquettes déjà présentes dans le SVG) : `pins` (i2c/spi) bascule seulement les noms/
// signaux exposés par `pinInfo` (mêmes positions x/y, cf. catalog.mts) — pattern identique
// à kablix-lcd1602 (pins i2c/full). Écran : superposé nativement en
// `<foreignObject><canvas></foreignObject>` calé sur le plus grand rectangle non texturé du
// dessin (zone noire de l'écran) — même logique que l'ancien `reflectOled`/`screenCtx` de
// drawing-feedback.mts, portée ici (plus d'overlay externe).
import { html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, i2c } from './pin.mjs';
import drawing from './externe/oled-ssd1306.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const W = 190;
const H = 140;

function screenRectOf(svg: SVGElement): { x: number; y: number; w: number; h: number } | null {
  let best: { x: number; y: number; w: number; h: number } | null = null;
  for (const r of svg.querySelectorAll('rect')) {
    const fill = (r.getAttribute('fill') || (r as SVGElement).style.fill || '').toLowerCase();
    if (fill.includes('url')) continue;
    const w = Number(r.getAttribute('width') ?? 0);
    const h = Number(r.getAttribute('height') ?? 0);
    if (!best || w * h > best.w * best.h) {
      best = { x: Number(r.getAttribute('x') ?? 0), y: Number(r.getAttribute('y') ?? 0), w, h };
    }
  }
  return best;
}

export class SSD1306Element extends LitElement {
  declare imageData: ImageData;
  declare pins: 'i2c' | 'spi';

  static properties = {
    imageData: {},
    pins: {},
  };

  private screenWidth = 128;
  private screenHeight = 64;
  private canvas: HTMLCanvasElement | null = null;

  get pinInfo(): ElementPin[] {
    if (this.pins === 'spi') {
      return [
        { name: 'DATA', x: 59, y: 20, signals: [i2c('SDA')] },
        { name: 'CLK', x: 69, y: 20, signals: [i2c('SCL')] },
        { name: 'DC', x: 79, y: 20, signals: [] },
        { name: 'RST', x: 89, y: 20, signals: [] },
        { name: 'CS', x: 99, y: 20, signals: [] },
        { name: '3V3', x: 109, y: 20, signals: [{ type: 'power', signal: 'VCC', voltage: 3.3 }] },
        { name: 'VIN', x: 119, y: 20, signals: [{ type: 'power', signal: 'VCC' }] },
        { name: 'GND', x: 129, y: 20, signals: [{ type: 'power', signal: 'GND' }] },
      ];
    }
    return [
      { name: 'SDA', x: 59, y: 20, signals: [i2c('SDA')] },
      { name: 'SCL', x: 69, y: 20, signals: [i2c('SCL')] },
      { name: 'SA0', x: 79, y: 20, signals: [] },
      { name: 'RST', x: 89, y: 20, signals: [] },
      { name: 'CS', x: 99, y: 20, signals: [] },
      { name: 'VDD', x: 109, y: 20, signals: [{ type: 'power', signal: 'VCC', voltage: 3.3 }] },
      { name: 'VIN', x: 119, y: 20, signals: [{ type: 'power', signal: 'VCC' }] },
      { name: 'GND', x: 129, y: 20, signals: [{ type: 'power', signal: 'GND' }] },
    ];
  }

  constructor() {
    super();
    this.pins = 'i2c';
    this.imageData = new ImageData(this.screenWidth, this.screenHeight);
  }

  update(changed: PropertyValues): void {
    if (changed.has('pins')) this.dispatchEvent(new CustomEvent('pininfo-change'));
    super.update(changed);
  }

  public redraw(): void {
    this.canvas?.getContext('2d')?.putImageData(this.imageData, 0, 0);
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    if (!this.canvas) {
      const svg = this.renderRoot.querySelector('svg');
      const rect = svg ? screenRectOf(svg) : null;
      if (!svg || !rect) return;
      const fo = document.createElementNS(SVG_NS, 'foreignObject');
      fo.setAttribute('x', String(rect.x));
      fo.setAttribute('y', String(rect.y));
      fo.setAttribute('width', String(rect.w));
      fo.setAttribute('height', String(rect.h));
      const canvas = document.createElementNS(XHTML_NS, 'canvas') as HTMLCanvasElement;
      canvas.width = this.screenWidth;
      canvas.height = this.screenHeight;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.imageRendering = 'pixelated';
      fo.appendChild(canvas);
      svg.appendChild(fo);
      this.canvas = canvas;
    }
    this.redraw();
  }

  render() {
    return html`
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="${SVG_NS}">${unsafeSVG(drawing)}</svg>
    `;
  }
}

if (!customElements.get('kablix-ssd1306')) {
  customElements.define('kablix-ssd1306', SSD1306Element);
}
