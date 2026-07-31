// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — dht22-element.ts.
// Balise <kablix-dht22> (ex <wokwi-dht22>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs ; DESSIN retouché (./externe/dht22.svg).
//   - broche de données renommée SDA → DATA (nom réel du DHT22) ;
//   - EN SIMULATION : deux curseurs règlent l'humidité et la température.
//     Le moteur lit `el.humidity` / `el.temperature` en direct.
//   - PROPRIÉTÉ `model` : le même élément habille le DHT11 (dessin de Frank,
//     Composants.svg → ./externe/DHT11.svg), balise <kablix-dht11>. Le modèle
//     fixe le boîtier, la position des broches ET les plages des curseurs
//     (DHT11 : 20-90 %HR, 0-50 °C ; DHT22 : 0-100 %HR, -40-80 °C).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing22 from './externe/dht22.svg';
import drawing11 from './externe/DHT11.svg';

export type DhtModel = 'dht11' | 'dht22';

/**
 * Caractéristiques par modèle (datasheet) : boîtier, ordonnée des broches et
 * plages de mesure. Le DHT11 ne descend pas sous 0 °C ni sous 20 %HR — ses
 * curseurs sont bornés à sa plage réelle (précision ±2 °C / ±5 %HR, résolution
 * 1 °C / 1 %HR : c'est l'encodage des trames qui la reproduit, cf. engines/dht22.mts).
 */
const MODELS = {
  dht22: { svg: drawing22, w: 70, h: 124.99033, pinY: 120, hmin: 0, hmax: 100, tmin: -40, tmax: 80 },
  dht11: { svg: drawing11, w: 70, h: 100, pinY: 90, hmin: 20, hmax: 90, tmin: 0, tmax: 50 },
} as const;

export class DHT22Element extends LitElement {
  declare model: DhtModel;
  declare temperature: number;
  declare humidity: number;
  declare simulating: boolean;

  static properties = {
    model: { type: String },
    temperature: { type: Number },
    humidity: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.model = 'dht22';
    this.temperature = 22;
    this.humidity = 50;
    this.simulating = false;
  }

  private get spec() {
    return MODELS[this.model] ?? MODELS.dht22;
  }

  get pinInfo(): ElementPin[] {
    const y = this.spec.pinY;
    return [
      { name: 'VCC', x: 20, y, signals: [{ type: 'power', signal: 'VCC' }], number: 1 },
      { name: 'DATA', x: 30, y, signals: [], number: 2 },
      { name: 'NC', x: 40, y, signals: [], number: 3 },
      { name: 'GND', x: 50, y, signals: [{ type: 'power', signal: 'GND' }], number: 4 },
    ];
  }

  static get styles() {
    return css`
      :host { display: inline-block; position: relative; }
      /* Hors flux et PAR-DESSUS le dessin, centré (mêmes raisons que
         sim-control-styles.mts : pas de décalage du centre de rotation,
         curseurs affichés sur le composant). */
      .sim-control {
        position: absolute; left: 0; right: 0; top: 50%;
        transform: translateY(-50%);
        display: flex; flex-direction: column; gap: 1px;
        font: 10px sans-serif; color: #333;
        background: rgba(255, 255, 255, 0.65); border-radius: 3px; padding: 1px 2px;
      }
      .sim-control .row { display: flex; align-items: center; gap: 2px; }
      .sim-control label { width: 14px; }
      .sim-control input[type='range'] { flex: 1; min-width: 44px; }
      .sim-control .val { width: 34px; text-align: right; color: #666; }
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
    const s = this.spec;
    return html`
      <svg
        width=${s.w}
        height=${s.h}
        viewBox="0 0 ${s.w} ${s.h}"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(s.svg)}
      </svg>
      ${this.simulating
        ? html`
            <div class="sim-control">
              <div class="row">
                <label title="Humidité">💧</label>
                <input type="range" min=${s.hmin} max=${s.hmax} step="1" .value=${String(this.humidity)} @input=${this.onHumidity} />
                <span class="val">${Math.round(this.humidity)} %</span>
              </div>
              <div class="row">
                <label title="Température">🌡</label>
                <input type="range" min=${s.tmin} max=${s.tmax} step="1" .value=${String(this.temperature)} @input=${this.onTemperature} />
                <span class="val">${Math.round(this.temperature)} °C</span>
              </div>
            </div>
          `
        : null}
    `;
  }
}

/** Variante DHT11 : même élément, modèle figé (balise dédiée pour la palette). */
export class DHT11Element extends DHT22Element {
  constructor() {
    super();
    this.model = 'dht11';
    this.temperature = 22;
    this.humidity = 50;
  }
}

if (!customElements.get('kablix-dht22')) {
  customElements.define('kablix-dht22', DHT22Element);
}
if (!customElements.get('kablix-dht11')) {
  customElements.define('kablix-dht11', DHT11Element);
}
