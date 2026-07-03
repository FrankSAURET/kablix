// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — dip-switch-8-element.ts.
// Balise <kablix-dip-switch-8> (ex <wokwi-dip-switch-8>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/dip-switch.svg) ;
//   - broches recalées sur la grille de 10 px (repère du dessin retouché) ;
//   - les 8 leviers (`use[href=#switch]` + `rect` associé) sont injectés via
//     `unsafeSVG` donc hors du template Lit : les clics et le rendu de l'état
//     (`y=-7.2` levier basculé) sont branchés/appliqués nativement dans `updated()`,
//     même logique que l'ancien `attachInteractiveFeedback` de drawing-feedback.mts.
import { html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/dip-switch.svg';

const W = 90;
const H = 70;

export class DipSwitch8Element extends LitElement {
  declare values: number[];

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    values: { type: Array },
  };

  constructor() {
    super();
    this.values = [0, 0, 0, 0, 0, 0, 0, 0];
  }

  readonly pinInfo: ElementPin[] = [
    { name: '1a', number: 1, x: 10, y: 60, signals: [] },
    { name: '2a', number: 2, x: 20, y: 60, signals: [] },
    { name: '3a', number: 3, x: 30, y: 60, signals: [] },
    { name: '4a', number: 4, x: 40, y: 60, signals: [] },
    { name: '5a', number: 5, x: 50, y: 60, signals: [] },
    { name: '6a', number: 6, x: 60, y: 60, signals: [] },
    { name: '7a', number: 7, x: 70, y: 60, signals: [] },
    { name: '8a', number: 8, x: 80, y: 60, signals: [] },
    { name: '8b', number: 9, x: 80, y: 10, signals: [] },
    { name: '7b', number: 10, x: 70, y: 10, signals: [] },
    { name: '6b', number: 11, x: 60, y: 10, signals: [] },
    { name: '5b', number: 12, x: 50, y: 10, signals: [] },
    { name: '4b', number: 13, x: 40, y: 10, signals: [] },
    { name: '3b', number: 14, x: 30, y: 10, signals: [] },
    { name: '2b', number: 15, x: 20, y: 10, signals: [] },
    { name: '1b', number: 16, x: 10, y: 10, signals: [] },
  ];

  private levers: SVGElement[] = [];

  /**
   * Change switch state
   * @param index Which switch to change
   */
  private toggleSwitch(index: number) {
    this.values[index] = this.values[index] ? 0 : 1;
    this.dispatchEvent(new InputEvent('switch-change', { detail: index }));
    this.requestUpdate(); // force lit to render again
  }

  /** Change switch state by keyboard 1-8 press */
  private onKeyDown(e: KeyboardEvent) {
    e.stopPropagation(); // stop storybook reacting to the key press
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const keyIndex = keys.indexOf(e.key);
    if (keyIndex !== -1) {
      this.toggleSwitch(keyIndex);
    }
  }

  private preventTextSelection(e: MouseEvent) {
    if (e.detail > 1) {
      // On double click
      e.preventDefault();
    }
  }

  /** Repère les 8 leviers du dessin retouché et branche leurs clics (une fois). */
  private setup(): void {
    if (this.levers.length > 0) return;
    const svgEl = this.renderRoot.querySelector('svg');
    if (!svgEl) return;
    const uses = [...svgEl.querySelectorAll('use')]
      .filter((u) => (u.getAttribute('xlink:href') ?? u.getAttribute('href')) === '#switch')
      .sort((a, b) => Number(a.getAttribute('x') ?? 0) - Number(b.getAttribute('x') ?? 0)) as SVGElement[];
    uses.forEach((u, i) => {
      u.addEventListener('click', () => this.toggleSwitch(i));
      u.previousElementSibling?.addEventListener('click', () => this.toggleSwitch(i));
    });
    this.levers = uses;
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    this.setup();
    this.levers.forEach((u, i) => u.setAttribute('y', this.values[i] ? '-7.2' : '0'));
  }

  render() {
    return html`
      <svg
        tabindex="0"
        @keydown=${this.onKeyDown}
        @mousedown=${this.preventTextSelection}
        width="${W}"
        height="${H}"
        viewBox="0 0 ${W} ${H}"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
      >${unsafeSVG(drawing)}</svg>
    `;
  }
}

if (!customElements.get('kablix-dip-switch-8')) {
  customElements.define('kablix-dip-switch-8', DipSwitch8Element);
}
