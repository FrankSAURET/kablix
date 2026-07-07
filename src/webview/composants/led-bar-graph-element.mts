// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — led-bar-graph-element.ts.
// Balise <kablix-led-bar-graph> (ex <wokwi-led-bar-graph>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/led-bar.svg) ;
//   - A1-A10/C1-C10 recalées sur la grille de 10 px (repère du dessin retouché,
//     numéro de broche physique du boîtier inchangé) ;
//   - les 10 barres (`#g53 rect`) sont déjà dans l'ordre haut→bas du dessin
//     retouché, pilotées nativement via `updated()`.
import { html, LitElement, PropertyValues } from 'lit';
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

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    color: {},
    offColor: {},
    values: { type: Array },
  };

  constructor() {
    super();
    this.color = 'red';
    this.offColor = '#444';
    this.values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
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
      el.style.fill = values[i] ? (palette?.[i] ?? color) : offColor;
    });
  }

  render() {
    return html`
      <svg width="50" height="110" viewBox="0 0 50 110" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-led-bar-graph')) {
  customElements.define('kablix-led-bar-graph', LedBarGraphElement);
}
