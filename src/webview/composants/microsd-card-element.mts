// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — microsd-card-element.ts.
// Balise <kablix-microsd-card> (ex <wokwi-microsd-card>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/microsd.svg,
// broches recalées sur la grille de 10 px ; plus de pinScale, cf. catalog.mts).
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, spi } from './pin.mjs';
import drawing from './externe/microsd.svg';

export class MicrosdCardElement extends LitElement {
  readonly pinInfo: ElementPin[] = [
    { name: 'CD', x: 80, y: 10, signals: [] },
    { name: 'DO', x: 80, y: 20, signals: [spi('MISO')] },
    { name: 'GND', x: 80, y: 30, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'SCK', x: 80, y: 40, signals: [spi('SCK')] },
    { name: 'VCC', x: 80, y: 50, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'DI', x: 80, y: 60, signals: [spi('MOSI')] },
    { name: 'CS', x: 80, y: 70, signals: [spi('SS')] },
  ];

  render() {
    return html`
      <svg
        width="87.062523"
        height="80.5448"
        viewBox="0 0 87.062523 80.5448"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-microsd-card')) {
  customElements.define('kablix-microsd-card', MicrosdCardElement);
}
