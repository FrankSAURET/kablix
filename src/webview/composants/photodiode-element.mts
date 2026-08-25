// Composant maison <kablix-photodiode> : photodiode nue, dessin de Frank
// (planche Composants2D.svg → ./externe/photodiode.svg).
// Deux pattes K/A : dans la netlist elle est vue comme une RÉSISTANCE dont la
// valeur suit l'éclairement reçu — R = Ron · Eemax/Ee, cf. variableResistorOhms
// (model.mts). Même loi que le phototransistor, mais SANS son gain : à lumière
// égale une photodiode laisse passer cent fois moins de courant, d'où un Ron
// cent fois plus grand (20 kΩ contre 200 Ω).
// EN SIMULATION : un curseur règle l'éclairement (0 → irradiance max) ; toute
// entrée ADC reliée au réseau résistif suit le pont diviseur réel (sim.mts).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { simControlStyles } from './utils/sim-control-styles.mjs';
import drawing from './externe/photodiode.svg';

const EE_MAX = 5;

export class PhotodiodeElement extends LitElement {
  declare ee: number;
  declare eemax: number;
  declare simulating: boolean;

  static properties = {
    // Éclairement énergétique reçu (mW/cm²) et borne haute du curseur.
    ee: { type: Number },
    eemax: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.ee = 1;
    this.eemax = EE_MAX;
    this.simulating = false;
  }

  // Broches : centre des pastilles du dessin extrait (grille de 10 px).
  // Polarisée : la cathode va vers le plus (la diode travaille en INVERSE).
  readonly pinInfo: ElementPin[] = [
    { name: 'K', x: 10, y: 40, signals: [] },
    { name: 'A', x: 20, y: 40, signals: [] },
  ];

  static get styles() {
    return [simControlStyles, css`:host { display: inline-block; }`];
  }

  private onRange = (e: Event) => {
    this.ee = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(new Event('input'));
  };

  /** Borne haute du curseur, assainie (attribut vide/invalide → défaut). */
  private rangeMax(): number {
    return Number.isFinite(this.eemax) && this.eemax > 0 ? this.eemax : EE_MAX;
  }

  render() {
    const max = this.rangeMax();
    return html`
      <svg width="30" height="50" viewBox="0 0 30 50" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
      ${this.simulating
        ? html`
            <div class="sim-control">
              <input type="range" min="0" max=${max} step=${max / 100} .value=${String(this.ee)} @input=${this.onRange} />
              <span class="val val--wide">${this.ee.toFixed(2)}</span>
            </div>
          `
        : null}
    `;
  }
}

if (!customElements.get('kablix-photodiode')) {
  customElements.define('kablix-photodiode', PhotodiodeElement);
}
