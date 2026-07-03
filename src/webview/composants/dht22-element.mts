// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — dht22-element.ts.
// Balise <kablix-dht22> (ex <wokwi-dht22>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/dht22.svg,
// broches recalées sur la grille de 10 px ; plus de pinScale, cf. catalog.mts).
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/dht22.svg';

export class DHT22Element extends LitElement {
  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 20, y: 120, signals: [{ type: 'power', signal: 'VCC' }], number: 1 },
    { name: 'SDA', x: 30, y: 120, signals: [], number: 2 },
    { name: 'NC', x: 40, y: 120, signals: [], number: 3 },
    { name: 'GND', x: 50, y: 120, signals: [{ type: 'power', signal: 'GND' }], number: 4 },
  ];

  render() {
    return html`
      <svg
        width="70"
        height="124.99033"
        viewBox="0 0 70 124.99033"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-dht22')) {
  customElements.define('kablix-dht22', DHT22Element);
}
