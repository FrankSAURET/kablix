// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — resistor-element.ts.
// Balise <kablix-resistor> (ex <wokwi-resistor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/resistor.svg,
// broches recalées sur la grille de 10 px) ; anneaux de couleur mis à jour par updated()
// (le dessin importé est statique, l'ancien template liait ${bandColor} directement).
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/resistor.svg';

const bandColors: { [key: number]: string } = {
  [-2]: '#C3C7C0', // Silver
  [-1]: '#F1D863', // Gold
  0: '#000000', // Black
  1: '#8F4814', // Brown
  2: '#FB0000', // Red
  3: '#FC9700', // Orange
  4: '#FCF800', // Yellow
  5: '#00B800', // Green
  6: '#0000FF', // Blue
  7: '#A803D6', // Violet
  8: '#808080', // Gray
  9: '#FCFCFC', // White
};

export class ResistorElement extends LitElement {
  declare value: string;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    value: {},
  };

  constructor() {
    super();
    this.value = '1000';
  }

  // Broches : centre de chaque patte, recalé sur la grille de 10 px (repère du
  // dessin retouché, tel quel — pas de pinScale, cf. catalog.mts).
  readonly pinInfo: ElementPin[] = [
    { name: '1', x: 10, y: 10, signals: [] },
    { name: '2', x: 70, y: 10, signals: [] },
  ];

  static get styles() {
    return css`
      :host {
        display: flex;
      }
    `;
  }

  private breakValue(value: number) {
    const exponent =
      value >= 1e10
        ? 9
        : value >= 1e9
          ? 8
          : value >= 1e8
            ? 7
            : value >= 1e7
              ? 6
              : value >= 1e6
                ? 5
                : value >= 1e5
                  ? 4
                  : value >= 1e4
                    ? 3
                    : value >= 1e3
                      ? 2
                      : value >= 1e2
                        ? 1
                        : value >= 1e1
                          ? 0
                          : value >= 1
                            ? -1
                            : -2;
    const base = Math.round(value / 10 ** exponent);
    if (value === 0) {
      return [0, 0];
    }
    return [Math.round(base % 100), exponent];
  }

  /** Couleurs des 3 anneaux d'après `value` (mêmes règles que le rendu d'origine). */
  private bandColorsFor(value: string): [string, string, string] {
    const numValue = parseFloat(value);
    const [base, exponent] = this.breakValue(numValue);
    return [bandColors[Math.floor(base / 10)], bandColors[base % 10], bandColors[exponent]];
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    const [c1, c2, c3] = this.bandColorsFor(this.value);
    // id du dessin nettoyé (externe/resistor.svg) : rect19 = anneau 1, path19 =
    // anneau 2, path20 = anneau 3 (le 4e, doré, est fixe = tolérance).
    this.renderRoot.querySelector('#rect19')?.setAttribute('fill', c1);
    this.renderRoot.querySelector('#path19')?.setAttribute('fill', c2);
    this.renderRoot.querySelector('#path20')?.setAttribute('fill', c3);
  }

  render() {
    return html`
      <svg width="80.164619" height="20" viewBox="0 0 80.164619 20" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-resistor')) {
  customElements.define('kablix-resistor', ResistorElement);
}
