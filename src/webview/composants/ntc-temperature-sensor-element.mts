// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — ntc-temperature-sensor-element.ts.
// Balise <kablix-ntc-temperature-sensor> (ex <wokwi-ntc-temperature-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs ; DESSIN retouché (./externe/ntc-temp.svg).
//   - EN SIMULATION : un curseur règle la température (-55 → +125 °C). La sortie
//     OUT est analogique et suit une NTC (thermistance à coefficient négatif) :
//     quand la température MONTE, la tension DIMINUE (`analogLevel`). Le moteur lit
//     `el.temperature` / `el.analogLevel` en direct (cf. sim.mts).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/ntc-temp.svg';

const T_MIN = -55;
const T_MAX = 125;
// Paramètres NTC typiques : R0=10 kΩ à 25 °C, B=3950 K, résistance série 10 kΩ.
const R0 = 10000;
const T0 = 298.15; // 25 °C en kelvin
const BETA = 3950;
const R_SERIES = 10000;

export class NTCTemperatureSensorElement extends LitElement {
  declare temperature: number;
  declare simulating: boolean;

  static properties = {
    temperature: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.temperature = 25;
    this.simulating = false;
  }

  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 140, y: 30, number: 1, signals: [GND()] },
    { name: 'VCC', x: 140, y: 40, number: 2, signals: [VCC()] },
    { name: 'OUT', x: 140, y: 50, number: 3, signals: [analog(0)] },
  ];

  /** Tension de sortie normalisée 0..1 : diviseur VCC·Rntc/(Rntc+Rsérie).
   *  Rntc décroît quand T croît → la tension décroît quand T croît. */
  get analogLevel(): number {
    const tK = this.temperature + 273.15;
    const rNtc = R0 * Math.exp(BETA * (1 / tK - 1 / T0));
    return rNtc / (rNtc + R_SERIES);
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      .sim-control {
        display: flex; align-items: center; gap: 4px; margin-top: 2px;
        font: 11px sans-serif; color: #333;
      }
      .sim-control input[type='range'] { flex: 1; min-width: 90px; }
      .sim-control .val { width: 48px; text-align: right; color: #666; }
    `;
  }

  private onRange = (e: Event) => {
    this.temperature = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(new Event('input'));
  };

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
      ${this.simulating
        ? html`
            <div class="sim-control">
              <input type="range" min=${T_MIN} max=${T_MAX} step="1" .value=${String(this.temperature)} @input=${this.onRange} />
              <span class="val">${Math.round(this.temperature)} °C</span>
            </div>
          `
        : null}
    `;
  }
}

if (!customElements.get('kablix-ntc-temperature-sensor')) {
  customElements.define('kablix-ntc-temperature-sensor', NTCTemperatureSensorElement);
}
