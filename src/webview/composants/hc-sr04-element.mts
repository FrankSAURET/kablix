// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — hc-sr04-element.ts.
// Balise <kablix-hc-sr04> (ex <wokwi-hc-sr04>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/hcsr04.svg,
// broches recalées sur la grille de 10 px).
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/hcsr04.svg';

export class HCSR04Element extends LitElement {
  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 80, y: 110, signals: [{ type: 'power', signal: 'VCC', voltage: 5 }] },
    { name: 'TRIG', x: 90, y: 110, signals: [] },
    { name: 'ECHO', x: 100, y: 110, signals: [] },
    { name: 'GND', x: 110, y: 110, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  render() {
    return html`
      <svg width="190" height="115" viewBox="0 0 190 115" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-hc-sr04')) {
  customElements.define('kablix-hc-sr04', HCSR04Element);
}
