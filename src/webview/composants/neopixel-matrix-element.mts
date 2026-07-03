// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — neopixel-matrix-element.ts.
// Balise <kablix-neopixel-matrix> (ex <wokwi-neopixel-matrix>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/neopixel-matrix.svg,
// capturée à la taille par défaut 8×8 — rows/cols ne sont pas exposés dans l'inspecteur,
// cf. catalog.mts, donc pas de perte de fonctionnalité). Broches recalées sur la grille de
// 10 px. Pixels pilotés nativement via les 64 groupes `.pixel` déjà présents dans le dessin
// importé (4 cercles R/G/B/halo par pixel, ordre DOM = ordre ligne-major, identique à
// l'ancien rendu procédural).
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import { RGB } from './types/rgb.mjs';
import drawing from './externe/neopixel-matrix.svg';

export class NeopixelMatrixElement extends LitElement {
  declare rows: number;
  declare cols: number;
  declare animation: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    rows: {},
    cols: {},
    animation: {},
  };

  constructor() {
    super();
    this.rows = 8;
    this.cols = 8;
    this.animation = false;
  }

  // Broches recalées sur grille 10 px (surcharges pin-overrides.mts « neopixel-matrix »).
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 90, y: 190, signals: [GND()] },
    { name: 'VCC', x: 100, y: 190, signals: [VCC()] },
    { name: 'DIN', x: 110, y: 190, signals: [] },
    { name: 'DOUT', x: 120, y: 190, signals: [] },
  ];

  private pixelElements: Array<[SVGElement, SVGElement, SVGElement, SVGElement]> | null = null;

  private animationFrame: number | null = null;

  static get styles() {
    return css`
      :host {
        display: flex;
      }
    `;
  }

  private getPixelElements() {
    if (!this.pixelElements) {
      this.pixelElements = Array.from(this.renderRoot.querySelectorAll('g.pixel')).map(
        (e) =>
          Array.from(e.querySelectorAll('circle')) as unknown as [
            SVGElement,
            SVGElement,
            SVGElement,
            SVGElement,
          ],
      );
    }
    return this.pixelElements;
  }

  /**
   * Resets all the pixels to off state (r=0, g=0, b=0).
   */
  reset() {
    for (const [rElement, gElement, bElement, colorElement] of this.getPixelElements()) {
      rElement.style.opacity = '0';
      gElement.style.opacity = '0';
      bElement.style.opacity = '0';
      colorElement.style.opacity = '0';
    }
  }

  /**
   * Sets the color of a single neopixel in the matrix
   * @param row Row number of the pixel to set
   * @param col Column number of the pixel to set
   * @param rgb An object containing the {r, g, b} values for the pixel
   */
  setPixel(row: number, col: number, rgb: RGB) {
    if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) {
      return null;
    }
    const pixelElement = this.getPixelElements()[row * this.cols + col];
    if (!pixelElement) return;
    const { r, g, b } = rgb;
    const spotOpacity = (value: number) => (value > 0.001 ? 0.7 + value * 0.3 : 0);
    const maxOpacity = Math.max(r, g, b);
    const minOpacity = Math.min(r, g, b);
    const opacityDelta = maxOpacity - minOpacity;
    const multiplier = Math.max(1, 2 - opacityDelta * 20);
    const glowBase = 0.1 + Math.max(maxOpacity * 2 - opacityDelta * 5, 0);
    const glowColor = (value: number) => (value > 0.005 ? 0.1 + value * 0.9 : 0);
    const glowOpacity = (value: number) => (value > 0.005 ? glowBase + value * (1 - glowBase) : 0);
    const cssVal = (value: number) =>
      maxOpacity ? Math.floor(Math.min(glowColor(value / maxOpacity) * multiplier, 1) * 255) : 255;
    const cssColor = `rgb(${cssVal(r)}, ${cssVal(g)}, ${cssVal(b)})`;
    const [rElement, gElement, bElement, colorElement] = pixelElement;
    rElement.style.opacity = spotOpacity(r).toFixed(2);
    gElement.style.opacity = spotOpacity(g).toFixed(2);
    bElement.style.opacity = spotOpacity(b).toFixed(2);
    colorElement.style.opacity = glowOpacity(maxOpacity).toFixed(2);
    colorElement.style.fill = cssColor;
  }

  private animateStep = () => {
    const time = new Date().getTime();
    const { rows, cols } = this;
    const pixelValue = (n: number) => (n % 2000 > 1000 ? 1 - (n % 1000) / 1000 : (n % 1000) / 1000);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const radius = Math.sqrt((row - rows / 2 + 0.5) ** 2 + (col - cols / 2 + 0.5) ** 2);
        this.setPixel(row, col, {
          r: pixelValue(radius * 100 + time),
          g: pixelValue(radius * 100 + time + 200),
          b: pixelValue(radius * 100 + time + 400),
        });
      }
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
      <svg
        width="205.82635"
        height="193.45"
        viewBox="0 0 205.82635 193.45"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-neopixel-matrix')) {
  customElements.define('kablix-neopixel-matrix', NeopixelMatrixElement);
}
