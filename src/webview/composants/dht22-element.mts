// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — dht22-element.ts.
// Balise <kablix-dht22> (ex <wokwi-dht22>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs ; DESSIN retouché (./externe/dht22.svg).
//   - broche de données renommée SDA → DATA (nom réel du DHT22) ;
//   - EN SIMULATION : deux curseurs règlent l'humidité (0-100 %) et la température
//     (-40 → +80 °C). Le moteur lit `el.humidity` / `el.temperature` en direct.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/dht22.svg';

export class DHT22Element extends LitElement {
  declare temperature: number;
  declare humidity: number;
  declare simulating: boolean;

  static properties = {
    temperature: { type: Number },
    humidity: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.temperature = 22;
    this.humidity = 50;
    this.simulating = false;
  }

  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 20, y: 120, signals: [{ type: 'power', signal: 'VCC' }], number: 1 },
    { name: 'DATA', x: 30, y: 120, signals: [], number: 2 },
    { name: 'NC', x: 40, y: 120, signals: [], number: 3 },
    { name: 'GND', x: 50, y: 120, signals: [{ type: 'power', signal: 'GND' }], number: 4 },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
      .sim-control {
        display: flex; flex-direction: column; gap: 2px; margin-top: 2px;
        font: 11px sans-serif; color: #333;
      }
      .sim-control .row { display: flex; align-items: center; gap: 4px; }
      .sim-control label { width: 16px; }
      .sim-control input[type='range'] { flex: 1; min-width: 70px; }
      .sim-control .val { width: 44px; text-align: right; color: #666; }
    `;
  }

  private onHumidity = (e: Event) => {
    this.humidity = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(new Event('input'));
  };
  private onTemperature = (e: Event) => {
    this.temperature = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(new Event('input'));
  };

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
      ${this.simulating
        ? html`
            <div class="sim-control">
              <div class="row">
                <label title="Humidité">💧</label>
                <input type="range" min="0" max="100" step="1" .value=${String(this.humidity)} @input=${this.onHumidity} />
                <span class="val">${Math.round(this.humidity)} %</span>
              </div>
              <div class="row">
                <label title="Température">🌡</label>
                <input type="range" min="-40" max="80" step="1" .value=${String(this.temperature)} @input=${this.onTemperature} />
                <span class="val">${Math.round(this.temperature)} °C</span>
              </div>
            </div>
          `
        : null}
    `;
  }
}

if (!customElements.get('kablix-dht22')) {
  customElements.define('kablix-dht22', DHT22Element);
}
