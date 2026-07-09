// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — hc-sr04-element.ts.
// Balise <kablix-hc-sr04> (ex <wokwi-hc-sr04>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/hcsr04.svg,
// broches recalées sur la grille de 10 px).
//   - EN SIMULATION (attribut `simulating` posé par l'éditeur en mode verrouillé) :
//     un curseur + une zone de saisie, bornés par distanceMin/distanceMax, permettent
//     de choisir la distance mesurée. `distance` (cm) est la valeur courante lue par
//     le moteur ; un event `input` est émis à chaque changement.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { simControlStyles } from './utils/sim-control-styles.mjs';
import drawing from './externe/hcsr04.svg';

export class HCSR04Element extends LitElement {
  declare distance: number;
  declare distanceMin: number;
  declare distanceMax: number;
  declare simulating: boolean;

  static properties = {
    distance: { type: Number },
    distanceMin: { type: Number, attribute: 'distancemin' },
    distanceMax: { type: Number, attribute: 'distancemax' },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.distanceMin = 2;
    this.distanceMax = 400;
    this.distance = 20;
    this.simulating = false;
  }

  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 80, y: 110, signals: [{ type: 'power', signal: 'VCC', voltage: 5 }] },
    { name: 'TRIG', x: 90, y: 110, signals: [] },
    { name: 'ECHO', x: 100, y: 110, signals: [] },
    { name: 'GND', x: 110, y: 110, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  static get styles() {
    return [
      simControlStyles,
      css`
        :host {
          display: inline-block;
        }
        .sim-control input[type='number'] {
          width: 40px;
        }
        .sim-control .unit {
          color: #666;
        }
      `,
    ];
  }

  /** Recale `distance` dans [min,max] et notifie (event `input`). */
  private setDistance(v: number) {
    const lo = Math.min(this.distanceMin, this.distanceMax);
    const hi = Math.max(this.distanceMin, this.distanceMax);
    this.distance = Math.max(lo, Math.min(hi, v));
    this.dispatchEvent(new Event('input'));
  }

  private onRange = (e: Event) => this.setDistance(Number((e.target as HTMLInputElement).value));
  private onNumber = (e: Event) => this.setDistance(Number((e.target as HTMLInputElement).value));

  render() {
    const lo = Math.min(this.distanceMin, this.distanceMax);
    const hi = Math.max(this.distanceMin, this.distanceMax);
    return html`
      <svg width="190" height="115" viewBox="0 0 190 115" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
      ${this.simulating
        ? html`
            <div class="sim-control">
              <input
                type="range"
                min=${lo}
                max=${hi}
                step="1"
                .value=${String(this.distance)}
                @input=${this.onRange}
              />
              <input
                type="number"
                min=${lo}
                max=${hi}
                step="1"
                .value=${String(this.distance)}
                @input=${this.onNumber}
              />
              <span class="unit">cm</span>
            </div>
          `
        : null}
    `;
  }
}

if (!customElements.get('kablix-hc-sr04')) {
  customElements.define('kablix-hc-sr04', HCSR04Element);
}
