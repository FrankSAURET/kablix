// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — gas-sensor-element.ts.
// Balise <kablix-gas-sensor> (ex <wokwi-gas-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/gas-sensor.svg) ;
//   - AOUT/DOUT/GND/VCC recalés sur la grille de 10 px (repère du dessin retouché) ;
//   - LED PWR/D0 réimplémentées par-dessus le dessin (absentes du SVG retouché,
//     positions recalculées sur les rectangles de boîtier LED du dessin).
import { html, svg, TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import { AnalogDigitalSensorElement } from './utils/analog-digital-sensor.mjs';
import drawing from './externe/gas-sensor.svg';

export class GasSensorElement extends AnalogDigitalSensorElement {
  protected intensityLabel(): string {
    return 'Gaz';
  }

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: 'AOUT', x: 140, y: 20, number: 1, signals: [] },
    { name: 'DOUT', x: 140, y: 30, number: 2, signals: [] },
    { name: 'GND', x: 140, y: 40, number: 3, signals: [GND()] },
    { name: 'VCC', x: 140, y: 50, number: 4, signals: [VCC()] },
  ];

  protected renderBody(): TemplateResult {
    const ledPower = this.simulating;
    const ledD0 = this.detected;
    return html`
      <svg width="150" height="70" viewBox="0 0 150 70" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        <defs>
          <filter id="gasLedGlow" x="-0.8" y="-0.8" height="5.2" width="5.8">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>
        ${ledPower &&
        svg`<circle cx="86.708" cy="12.667" r="1.9" fill="#03f704" filter="url(#gasLedGlow)" />`}
        ${ledD0 &&
        svg`<circle cx="86.396" cy="56.738" r="1.9" fill="#03f704" filter="url(#gasLedGlow)" />`}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-gas-sensor')) {
  customElements.define('kablix-gas-sensor', GasSensorElement);
}
