// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — heart-beat-sensor-element.ts.
// Balise <kablix-heart-beat-sensor> (ex <wokwi-heart-beat-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/heartbeat.svg,
// broches recalées sur la grille de 10 px).
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/heartbeat.svg';

export class HeartBeatSensorElement extends LitElement {
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 100, y: 20, number: 1, signals: [GND()] },
    { name: 'VCC', x: 100, y: 30, number: 2, signals: [VCC()] },
    { name: 'OUT', x: 100, y: 40, number: 3, signals: [] },
  ];

  render() {
    return html`
      <svg width="110" height="85" viewBox="0 0 110 85" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-heart-beat-sensor')) {
  customElements.define('kablix-heart-beat-sensor', HeartBeatSensorElement);
}
