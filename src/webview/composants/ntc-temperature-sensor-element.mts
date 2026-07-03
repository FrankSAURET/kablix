// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — ntc-temperature-sensor-element.ts.
// Balise <kablix-ntc-temperature-sensor> (ex <wokwi-ntc-temperature-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/ntc-temp.svg,
// broches recalées sur la grille de 10 px ; plus de pinScale, cf. catalog.mts).
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/ntc-temp.svg';

export class NTCTemperatureSensorElement extends LitElement {
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 140, y: 30, number: 1, signals: [GND()] },
    { name: 'VCC', x: 140, y: 40, number: 2, signals: [VCC()] },
    { name: 'OUT', x: 140, y: 50, number: 3, signals: [analog(0)] },
  ];

  render() {
    return html`
      <svg
        width="145.24001"
        height="77.485306"
        viewBox="0 0 145.24001 77.485306"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-ntc-temperature-sensor')) {
  customElements.define('kablix-ntc-temperature-sensor', NTCTemperatureSensorElement);
}
