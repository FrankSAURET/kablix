// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — neopixel-element.ts.
// Balise <kablix-neopixel> (ex <wokwi-neopixel>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/neopixel.svg),
// broches recalées sur la grille de 10 px. Halo RGB piloté nativement via `updated()` :
// le dessin retouché contient déjà le flou dynamique (#feGaussianBlur13, filtre #light1),
// le fond (#rect14) et les 3 spots + le halo (#ellipse23..26) capturés depuis ce même
// rendu, il suffit de les remuter au lieu de les reconstruire.
import { html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/neopixel.svg';

export class NeoPixelElement extends LitElement {
  declare r: number;
  declare g: number;
  declare b: number;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    r: {},
    g: {},
    b: {},
  };

  constructor() {
    super();
    this.r = 0;
    this.g = 0;
    this.b = 0;
  }

  // Broches recalées sur grille 10 px (surcharges pin-overrides.mts « neopixel »).
  readonly pinInfo: ElementPin[] = [
    { name: 'VDD', x: 10, y: 10, number: 1, signals: [VCC()] },
    { name: 'DOUT', x: 10, y: 20, number: 2, signals: [] },
    { name: 'VSS', x: 30, y: 20, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'DIN', x: 30, y: 10, number: 4, signals: [GND()] },
  ];

  updated(changed: PropertyValues) {
    super.updated(changed);
    const root = this.renderRoot;
    const set = (id: string, attrs: Record<string, string | number>) => {
      const el = root.querySelector('#' + id);
      if (!el) return;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    };

    const { r, g, b } = this;
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
    const bkgWhite =
      242 -
      (maxOpacity > 0.1 && opacityDelta < 0.2
        ? Math.floor(maxOpacity * 50 * (1 - opacityDelta / 0.2))
        : 0);
    const background = `rgb(${bkgWhite}, ${bkgWhite}, ${bkgWhite})`;

    set('feGaussianBlur13', { stdDeviation: Math.max(0.1, maxOpacity) });
    set('rect14', { fill: background });
    set('ellipse23', { opacity: spotOpacity(r) });
    set('ellipse24', { opacity: spotOpacity(g) });
    set('ellipse25', { opacity: spotOpacity(b) });
    set('ellipse26', { opacity: glowOpacity(maxOpacity), fill: cssColor });
  }

  render() {
    return html`
      <svg
        width="39.999996"
        height="30"
        viewBox="0 0 39.999996 30"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-neopixel')) {
  customElements.define('kablix-neopixel', NeoPixelElement);
}
