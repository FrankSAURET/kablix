// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — led-bar-graph-element.ts.
// Balise <kablix-led-bar-graph> (ex <wokwi-led-bar-graph>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/led-bar.svg) ;
//   - A1-A10/C1-C10 recalées sur la grille de 10 px (repère du dessin retouché,
//     numéro de broche physique du boîtier inchangé) ;
//   - les 10 barres (`#g53 rect`) sont déjà dans l'ordre haut→bas du dessin
//     retouché, pilotées nativement via `updated()`.
import { css, html, LitElement, PropertyValues, svg } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/led-bar.svg';

const green = '#9eff3c';
const blue = '#2c95fa';
const cyan = '#6cf9dc';
const yellow = '#f1d73c';
const red = '#dc012d';

const colorPalettes: Record<string, string[]> = {
  GYR: [green, green, green, green, green, yellow, yellow, yellow, red, red],
  BCYR: [blue, cyan, cyan, cyan, cyan, yellow, yellow, yellow, red, red],
};

export class LedBarGraphElement extends LitElement {
  declare color: string;
  declare offColor: string;
  declare values: number[];

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: 'A1', x: 10, y: 10, number: 1, description: 'Anode 1', signals: [] },
    { name: 'A2', x: 10, y: 20, number: 2, description: 'Anode 2', signals: [] },
    { name: 'A3', x: 10, y: 30, number: 3, description: 'Anode 3', signals: [] },
    { name: 'A4', x: 10, y: 40, number: 4, description: 'Anode 4', signals: [] },
    { name: 'A5', x: 10, y: 50, number: 5, description: 'Anode 5', signals: [] },
    { name: 'A6', x: 10, y: 60, number: 6, description: 'Anode 6', signals: [] },
    { name: 'A7', x: 10, y: 70, number: 7, description: 'Anode 7', signals: [] },
    { name: 'A8', x: 10, y: 80, number: 8, description: 'Anode 8', signals: [] },
    { name: 'A9', x: 10, y: 90, number: 9, description: 'Anode 9', signals: [] },
    { name: 'A10', x: 10, y: 100, number: 10, description: 'Anode 10', signals: [] },
    { name: 'C1', x: 40, y: 10, number: 20, description: 'Cathode 1', signals: [] },
    { name: 'C2', x: 40, y: 20, number: 19, description: 'Cathode 2', signals: [] },
    { name: 'C3', x: 40, y: 30, number: 18, description: 'Cathode 3', signals: [] },
    { name: 'C4', x: 40, y: 40, number: 17, description: 'Cathode 4', signals: [] },
    { name: 'C5', x: 40, y: 50, number: 16, description: 'Cathode 5', signals: [] },
    { name: 'C6', x: 40, y: 60, number: 15, description: 'Cathode 6', signals: [] },
    { name: 'C7', x: 40, y: 70, number: 14, description: 'Cathode 7', signals: [] },
    { name: 'C8', x: 40, y: 80, number: 13, description: 'Cathode 8', signals: [] },
    { name: 'C9', x: 40, y: 90, number: 12, description: 'Cathode 9', signals: [] },
    { name: 'C10', x: 40, y: 100, number: 11, description: 'Cathode 10', signals: [] },
  ];

  declare burned: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    color: {},
    offColor: {},
    values: { type: Array },
    burned: { type: Boolean },
  };

  constructor() {
    super();
    this.color = 'red';
    this.offColor = '#444';
    this.values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.burned = false;
  }

  static get styles() {
    return css`
      /* Flamme de barre grillée (sur-courant sur une LED) : même dessin et
         vacillement que le fork led-element. */
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
    `;
  }

  updated(changed: PropertyValues) {
    super.updated(changed);
    // Le dessin retouché fixe `fill` dans l'attribut `style` de chaque rect (export
    // Inkscape) : en SVG, ce style inline l'emporte toujours sur l'attribut de
    // présentation `fill`. `setAttribute('fill', …)` serait donc sans effet visuel
    // (barres figées dans leur couleur d'origine) — on doit passer par `style.fill`.
    const bars = this.renderRoot.querySelectorAll('#g53 rect') as NodeListOf<SVGElement>;
    const { values, color, offColor } = this;
    const palette = colorPalettes[color];
    bars.forEach((el, i) => {
      // Niveau fractionnaire (résistance série trop forte) : couleur allumée
      // atténuée vers la couleur éteinte (color-mix), pleine à partir de 1.
      const level = Number(values[i]) || 0;
      const lit = palette?.[i] ?? color;
      el.style.fill =
        level >= 0.999
          ? lit
          : level <= 0.001
            ? offColor
            : `color-mix(in srgb, ${lit} ${Math.round(level * 100)}%, ${offColor})`;
    });
  }

  render() {
    return html`
      <svg width="50" height="110" viewBox="0 0 50 110" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        ${this.burned
          ? svg`
            <g transform="translate(25 60)">
              <g class="led-flame">
                <path d="M 0,-15.4 C 5.6,-8.4 8.4,-4.2 8.4,0 A 8.4,9.1 0 1 1 -8.4,0 C -8.4,-4.2 -5.6,-8.4 0,-15.4 Z" fill="#ff7a1a" />
                <path d="M 0,-7.7 C 2.8,-4.2 4.2,-2.1 4.2,0.84 A 4.2,4.76 0 1 1 -4.2,0.84 C -4.2,-2.1 -2.8,-4.2 0,-7.7 Z" fill="#ffd23e" />
              </g>
            </g>`
          : null}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-led-bar-graph')) {
  customElements.define('kablix-led-bar-graph', LedBarGraphElement);
}
