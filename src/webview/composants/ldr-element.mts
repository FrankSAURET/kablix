// Composant maison <kablix-ldr> : photorésistance (LDR) nue, dessin de Frank
// (svg retouche/LDR.edit.svg, nettoyé → ./externe/ldr.svg).
// Deux pattes 1/2 sans polarité : dans la netlist la LDR est une résistance
// dont la valeur suit l'éclairement — R = R1lx · E^(-γ), cf. variableResistorOhms
// (model.mts). EN SIMULATION : un curseur règle l'éclairement (0 → 1000 lx) ;
// toute entrée ADC reliée au réseau résistif suit le pont diviseur réel,
// résistances adjointes comprises (sim.mts).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { simControlStyles } from './utils/sim-control-styles.mjs';
import drawing from './externe/ldr.svg';

const LUX_MIN = 0;
const LUX_MAX = 1000;

export class LdrElement extends LitElement {
  declare lux: number;
  declare simulating: boolean;

  static properties = {
    lux: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.lux = 500;
    this.simulating = false;
  }

  // Broches : centre des pastilles du dessin retouché (grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: '1', x: 10, y: 30, signals: [] },
    { name: '2', x: 90, y: 30, signals: [] },
  ];

  static get styles() {
    return [simControlStyles, css`:host { display: inline-block; }`];
  }

  private onRange = (e: Event) => {
    this.lux = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(new Event('input'));
  };

  render() {
    return html`
      <svg width="100" height="60" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
      ${this.simulating
        ? html`
            <div class="sim-control">
              <input type="range" min=${LUX_MIN} max=${LUX_MAX} step="1" .value=${String(this.lux)} @input=${this.onRange} />
              <span class="val val--wide">${Math.round(this.lux)} lx</span>
            </div>
          `
        : null}
    `;
  }
}

if (!customElements.get('kablix-ldr')) {
  customElements.define('kablix-ldr', LdrElement);
}
