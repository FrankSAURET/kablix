// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — pir-motion-sensor-element.ts.
// Balise <kablix-pir-motion-sensor> (ex <wokwi-pir-motion-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/pir.svg) ;
//   - VCC/OUT/GND recalés sur la grille de 10 px (repère du dessin retouché).
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/pir.svg';

export class PIRMotionSensorElement extends LitElement {
  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 40, y: 100, number: 1, signals: [VCC()] },
    { name: 'OUT', x: 50, y: 100, number: 2, signals: [] },
    { name: 'GND', x: 60, y: 100, number: 3, signals: [GND()] },
  ];

  render() {
    return html`
      <svg width="100" height="103.45" viewBox="0 0 100 103.45" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-pir-motion-sensor')) {
  customElements.define('kablix-pir-motion-sensor', PIRMotionSensorElement);
}
