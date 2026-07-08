// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — small-sound-sensor-element.ts.
// Balise <kablix-small-sound-sensor> (ex <wokwi-small-sound-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/sound.svg,
// broches recalées sur la grille de 10 px). Les halos LED (PWR/DO) restent rendus par le
// fork lui-même (ledPower/ledSignal), positionnés sur les lentilles du dessin retouché
// (repère « tel quel » : rect de la lentille PWR à x=64.33,y=11.62, DO à x=64.33,y=54.63,
// dans le groupe translate(-10,-10) de externe/sound.svg) ; filtre #ledFilter défini dans
// le dessin importé, réutilisable ici via url(#ledFilter).
import { html, svg, TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import { AnalogDigitalSensorElement } from './utils/analog-digital-sensor.mjs';
import drawing from './externe/sound.svg';

export class SmallSoundSensorElement extends AnalogDigitalSensorElement {
  protected intensityLabel(): string {
    return 'Son';
  }

  readonly pinInfo: ElementPin[] = [
    { name: 'AOUT', x: 10, y: 20, number: 1, signals: [] },
    { name: 'GND', x: 10, y: 30, number: 2, signals: [GND()] },
    { name: 'VCC', x: 10, y: 40, number: 3, signals: [VCC()] },
    { name: 'DOUT', x: 10, y: 50, number: 4, signals: [] },
  ];

  protected renderBody(): TemplateResult {
    const ledPower = this.simulating;
    const ledSignal = this.detected;
    return html`
      <svg width="150" height="70" viewBox="0 0 150 70" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        ${ledPower &&
        svg`<circle cx="66.32" cy="13.26" r="7" fill="#80ff80" filter="url(#ledFilter)" />`}
        ${ledSignal &&
        svg`<circle cx="66.32" cy="56.27" r="7" fill="#80ff80" filter="url(#ledFilter)" />`}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-small-sound-sensor')) {
  customElements.define('kablix-small-sound-sensor', SmallSoundSensorElement);
}
