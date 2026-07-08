// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — tilt-switch-element.ts.
// Balise <kablix-tilt-switch> (ex <wokwi-tilt-switch>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/tilt.svg,
// broches recalées sur la grille de 10 px ; plus de pinScale, cf. catalog.mts).
//   - PLUS de propriété d'état dans l'inspecteur : EN SIMULATION (attribut
//     `simulating`), un bouton bascule l'inclinaison (tout ou rien). L'état
//     `tilted` est lu par le moteur ; le composant s'incline visuellement et
//     émet un event `input` à chaque bascule.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/tilt.svg';

export class TiltSwitchElement extends LitElement {
  declare tilted: boolean;
  declare simulating: boolean;

  static properties = {
    tilted: { type: Boolean },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.tilted = false;
    this.simulating = false;
  }

  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 100, y: 20, number: 1, signals: [GND()] },
    { name: 'VCC', x: 100, y: 30, number: 2, signals: [VCC()] },
    { name: 'OUT', x: 100, y: 40, number: 3, signals: [] },
  ];

  static get styles() {
    return css`
      :host {
        display: inline-block;
      }
      .tilt-body {
        transition: transform 0.15s ease;
        transform-origin: 50% 60%;
      }
      .tilt-body.tilted {
        transform: rotate(-22deg);
      }
      .sim-control {
        display: flex;
        justify-content: center;
        margin-top: 2px;
      }
      .sim-control button {
        font: 11px sans-serif;
        padding: 1px 8px;
        border: 1px solid #888;
        border-radius: 3px;
        background: #f4f4f4;
        cursor: pointer;
      }
      .sim-control button.on {
        background: #ffd24d;
        border-color: #c99a00;
      }
    `;
  }

  private toggle = () => {
    this.tilted = !this.tilted;
    this.dispatchEvent(new Event('input'));
  };

  render() {
    return html`
      <svg
        class="tilt-body ${this.tilted ? 'tilted' : ''}"
        width="105.82864"
        height="60"
        viewBox="0 0 105.82864 60"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
      </svg>
      ${this.simulating
        ? html`
            <div class="sim-control">
              <button
                class=${this.tilted ? 'on' : ''}
                @click=${this.toggle}
                title="Incliner le capteur (tout ou rien)"
              >
                ${this.tilted ? 'Incliné' : 'Incliner'}
              </button>
            </div>
          `
        : null}
    `;
  }
}

if (!customElements.get('kablix-tilt-switch')) {
  customElements.define('kablix-tilt-switch', TiltSwitchElement);
}
