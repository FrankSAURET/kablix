// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — rgb-led-element.ts.
// Balise <kablix-rgb-led> (ex <wokwi-rgb-led>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/rgb-led.svg) ;
//   - R/COM/G/B recalées sur la grille de 10 px (repère du dessin retouché) ;
//   - halo RGB piloté nativement via `updated()` : le dessin retouché contient
//     déjà les filtres `feGaussianBlur33/34/35` et les cercles `circle35..39`
//     capturés depuis ce même rendu, il suffit de les remuter au lieu de les
//     reconstruire.
import { css, html, LitElement, PropertyValues, svg } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/rgb-led.svg';

export class RGBLedElement extends LitElement {
  declare ledRed: number;
  declare ledGreen: number;
  declare ledBlue: number;
  declare burned: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    ledRed: {},
    ledGreen: {},
    ledBlue: {},
    burned: { type: Boolean },
  };

  constructor() {
    super();
    this.ledRed = 0;
    this.ledGreen = 0;
    this.ledBlue = 0;
    this.burned = false;
  }

  static get styles() {
    return css`
      /* Flamme de LED grillée : léger vacillement autour de sa base (même
         dessin que le fork led-element). */
      .led-flame {
        transform-box: fill-box;
        transform-origin: 50% 100%;
        animation: led-flicker 0.35s ease-in-out infinite alternate;
      }

      @keyframes led-flicker {
        from {
          transform: scale(1);
          opacity: 1;
        }
        to {
          transform: scale(1.12, 0.9);
          opacity: 0.85;
        }
      }

      /* Corps carbonisé d'une LED grillée (la flamme, hors de ce groupe,
         garde ses couleurs vives). */
      .rgb-burned {
        filter: grayscale(1) brightness(0.55);
      }
    `;
  }

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: 'R', x: 10, y: 50, signals: [] },
    { name: 'COM', x: 20, y: 60, signals: [] },
    { name: 'G', x: 30, y: 50, signals: [] },
    { name: 'B', x: 40, y: 50, signals: [] },
  ];

  updated(changed: PropertyValues) {
    super.updated(changed);
    const root = this.renderRoot;
    const set = (id: string, attrs: Record<string, string | number>) => {
      const el = root.querySelector('#' + id);
      if (!el) return;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    };

    // Grillée (sur-courant sur un canal) : tous les halos éteints — le corps
    // est noirci par le filtre CSS .rgb-burned (voir render/styles).
    const burned = this.burned;
    const r = burned ? 0 : this.ledRed;
    const g = burned ? 0 : this.ledGreen;
    const b = burned ? 0 : this.ledBlue;
    const brightness = Math.max(r, g, b);
    const opacity = brightness ? 0.2 + brightness * 0.6 : 0;

    set('feGaussianBlur33', { stdDeviation: r * 3 });
    set('feGaussianBlur34', { stdDeviation: g * 3 });
    set('feGaussianBlur35', { stdDeviation: b * 3 });
    set('circle35', { r: r * 5 + 2, opacity: Math.min(r * 20, 0.3) });
    set('circle36', { r: g * 5 + 2, opacity: Math.min(g * 20, 0.3) });
    set('circle37', { r: b * 5 + 2, opacity: Math.min(b * 20, 0.3) });
    set('circle38', { fill: `rgb(${r * 255}, ${g * 255 + b * 90}, ${b * 255})`, opacity });
    set('circle39', { opacity });
  }

  render() {
    return html`
      <svg
        width="49.873417"
        height="70"
        viewBox="0 0 49.873417 70"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g class="${this.burned ? 'rgb-burned' : ''}">${unsafeSVG(drawing)}</g>
        ${this.burned
          ? svg`
            <g transform="translate(23 24)">
              <g class="led-flame">
                <path d="M 0,-11 C 4,-6 6,-3 6,0 A 6,6.5 0 1 1 -6,0 C -6,-3 -4,-6 0,-11 Z" fill="#ff7a1a" />
                <path d="M 0,-5.5 C 2,-3 3,-1.5 3,0.6 A 3,3.4 0 1 1 -3,0.6 C -3,-1.5 -2,-3 0,-5.5 Z" fill="#ffd23e" />
              </g>
            </g>`
          : null}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-rgb-led')) {
  customElements.define('kablix-rgb-led', RGBLedElement);
}
