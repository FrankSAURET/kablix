// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — heart-beat-sensor-element.ts.
// Balise <kablix-heart-beat-sensor> (ex <wokwi-heart-beat-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs ; DESSIN retouché (./externe/heartbeat.svg).
//   - EN SIMULATION : un curseur règle le POULS (0-200 bpm). Le moteur génère sur
//     OUT une courbe de pulsation cardiaque (forme PPG) à ce rythme, régénérée à
//     chaque frame (cf. sim.mts pulseTargets). `bpm` est lu par le moteur.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import { simControlStyles } from './utils/sim-control-styles.mjs';
import drawing from './externe/heartbeat.svg';

export class HeartBeatSensorElement extends LitElement {
  declare bpm: number;
  declare simulating: boolean;

  static properties = {
    bpm: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.bpm = 72;
    this.simulating = false;
  }

  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 100, y: 20, number: 1, signals: [GND()] },
    { name: 'VCC', x: 100, y: 30, number: 2, signals: [VCC()] },
    { name: 'OUT', x: 100, y: 40, number: 3, signals: [] },
  ];

  static get styles() {
    return [simControlStyles, css`:host { display: inline-block; }`];
  }

  private onRange = (e: Event) => {
    this.bpm = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(new Event('input'));
  };

  render() {
    return html`
      <svg width="110" height="85" viewBox="0 0 110 85" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
      ${this.simulating
        ? html`
            <div class="sim-control">
              <input type="range" min="0" max="200" step="1" .value=${String(this.bpm)} @input=${this.onRange} />
              <span class="val val--wide">${Math.round(this.bpm)} bpm</span>
            </div>
          `
        : null}
    `;
  }
}

if (!customElements.get('kablix-heart-beat-sensor')) {
  customElements.define('kablix-heart-beat-sensor', HeartBeatSensorElement);
}
