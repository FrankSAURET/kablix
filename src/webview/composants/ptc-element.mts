// Composant maison <kablix-ptc> : thermistance CTP nue (type KTY), dessin de
// Frank (svg retouche/PTC.edit.svg, nettoyé → ./externe/ptc.svg).
// Deux pattes 1/2 sans polarité : dans la netlist la CTP est une résistance
// dont la valeur suit la température — R = R25 · (1 + tc/100 · (T − 25)), cf.
// variableResistorOhms (model.mts). EN SIMULATION : un curseur règle la
// température (-55 → +125 °C) ; toute entrée ADC reliée au réseau résistif
// suit le pont diviseur réel, résistances adjointes comprises (sim.mts).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { simControlStyles } from './utils/sim-control-styles.mjs';
import drawing from './externe/ptc.svg';

const T_MIN = -55;
const T_MAX = 125;

export class PtcElement extends LitElement {
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

  // Broches : centre des pastilles du dessin retouché (grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: '1', x: 10, y: 70, signals: [] },
    { name: '2', x: 30, y: 70, signals: [] },
  ];

  static get styles() {
    return [simControlStyles, css`:host { display: inline-block; }`];
  }

  private onRange = (e: Event) => {
    this.temperature = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(new Event('input'));
  };

  render() {
    return html`
      <svg width="40" height="80" viewBox="0 0 40 80" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
      ${this.simulating
        ? html`
            <div class="sim-control">
              <input type="range" min=${T_MIN} max=${T_MAX} step="1" .value=${String(this.temperature)} @input=${this.onRange} />
              <span class="val val--wide">${Math.round(this.temperature)} °C</span>
            </div>
          `
        : null}
    `;
  }
}

if (!customElements.get('kablix-ptc')) {
  customElements.define('kablix-ptc', PtcElement);
}
