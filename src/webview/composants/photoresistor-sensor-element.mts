// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — photoresistor-sensor-element.ts.
// Balise <kablix-photoresistor-sensor> (ex <wokwi-photoresistor-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/photoresistor.svg) ;
//   - VCC/GND/DO/AO recalés sur la grille de 10 px (repère du dessin retouché) ;
//   - LED PWR/DO réimplémentées par-dessus le dessin (absentes du SVG retouché,
//     positions recalculées sur les rectangles de boîtier LED du dessin ; le
//     filtre `ledFilter` du dessin retouché est conservé).
import { html, LitElement, svg } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/photoresistor.svg';

export class PhotoresistorSensorElement extends LitElement {
  declare ledDO: boolean;
  declare ledPower: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    ledDO: {},
    ledPower: {},
  };

  constructor() {
    super();
    this.ledDO = false;
    this.ledPower = false;
  }

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 180, y: 20, signals: [VCC()] },
    { name: 'GND', x: 180, y: 30, signals: [GND()] },
    { name: 'DO', x: 180, y: 40, signals: [] },
    { name: 'AO', x: 180, y: 50, signals: [analog(0)] },
  ];

  render() {
    const { ledPower, ledDO } = this;
    return html`
      <svg
        width="185.38074"
        height="66.60199"
        viewBox="0 0 185.38074 66.60199"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
        ${ledPower &&
        svg`<circle cx="130.981" cy="10.658" r="4.3" fill="green" filter="url(#ledFilter)" />`}
        ${ledDO &&
        svg`<circle cx="130.981" cy="59.678" r="4.3" fill="red" filter="url(#ledFilter)" />`}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-photoresistor-sensor')) {
  customElements.define('kablix-photoresistor-sensor', PhotoresistorSensorElement);
}
