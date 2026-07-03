// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — led-ring-element.ts.
// Balise <kablix-led-ring> (ex <wokwi-led-ring>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/led-ring.svg,
// capturée à la taille par défaut 16 pixels — pixels/pixelSpacing/background ne sont pas
// exposés dans l'inspecteur, cf. catalog.mts, donc pas de perte de fonctionnalité). Broches
// recalées sur la grille de 10 px. Pixels pilotés nativement via les 16 `rect.pixel` déjà
// présents dans le dessin importé (même ordre DOM que l'ancien rendu procédural).
import { html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { RGB } from './types/rgb.mjs';
import drawing from './externe/led-ring.svg';

export class LEDRingElement extends LitElement {
  declare pixels: number;
  declare animation: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    pixels: {},
    animation: {},
  };

  constructor() {
    super();
    this.pixels = 16;
    this.animation = false;
  }

  private pixelElements: SVGRectElement[] | null = null;

  private animationFrame: number | null = null;

  // Broches recalées sur grille 10 px (surcharges pin-overrides.mts « led-ring »).
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 60, y: 160, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'VCC', x: 70, y: 160, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'DIN', x: 80, y: 160, signals: [] },
    { name: 'DOUT', x: 90, y: 160, signals: [] },
  ];

  private getPixelElements() {
    if (!this.pixelElements) {
      this.pixelElements = Array.from(this.renderRoot.querySelectorAll('rect.pixel'));
    }
    return this.pixelElements;
  }

  setPixel(pixel: number, { r, g, b }: RGB) {
    const pixelElements = this.getPixelElements();
    if (pixel < 0 || pixel >= pixelElements.length) {
      return;
    }
    pixelElements[pixel].style.fill = `rgb(${r * 255},${g * 255},${b * 255})`;
  }

  /**
   * Resets all the pixels to off state (r=0, g=0, b=0).
   */
  reset() {
    for (const element of this.getPixelElements()) {
      element.style.fill = '';
    }
  }

  private animateStep = () => {
    const time = new Date().getTime();
    const { pixels } = this;
    const pixelValue = (n: number) => (n % 2000 > 1000 ? 1 - (n % 1000) / 1000 : (n % 1000) / 1000);
    for (let pixel = 0; pixel < pixels; pixel++) {
      this.setPixel(pixel, {
        r: pixelValue(pixel * 100 + time),
        g: pixelValue(pixel * 100 + time + 200),
        b: pixelValue(pixel * 100 + time + 400),
      });
    }
    this.animationFrame = requestAnimationFrame(this.animateStep);
  };

  updated(changed: PropertyValues) {
    super.updated(changed);
    if (this.animation && !this.animationFrame) {
      this.animationFrame = requestAnimationFrame(this.animateStep);
    } else if (!this.animation && this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  render() {
    return html`
      <svg width="150" height="165" viewBox="0 0 150 165" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-led-ring')) {
  customElements.define('kablix-led-ring', LEDRingElement);
}
