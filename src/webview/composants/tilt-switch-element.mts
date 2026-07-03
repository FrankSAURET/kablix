// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — tilt-switch-element.ts.
// Balise <kablix-tilt-switch> (ex <wokwi-tilt-switch>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/tilt.svg,
// broches recalées sur la grille de 10 px ; plus de pinScale, cf. catalog.mts).
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/tilt.svg';

export class TiltSwitchElement extends LitElement {
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 100, y: 20, number: 1, signals: [GND()] },
    { name: 'VCC', x: 100, y: 30, number: 2, signals: [VCC()] },
    { name: 'OUT', x: 100, y: 40, number: 3, signals: [] },
  ];

  render() {
    return html`
      <svg
        width="105.82864"
        height="60"
        viewBox="0 0 105.82864 60"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-tilt-switch')) {
  customElements.define('kablix-tilt-switch', TiltSwitchElement);
}
