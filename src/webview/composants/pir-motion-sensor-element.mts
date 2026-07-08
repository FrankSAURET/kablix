// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — pir-motion-sensor-element.ts.
// Balise <kablix-pir-motion-sensor> (ex <wokwi-pir-motion-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs ; DESSIN retouché (./externe/pir.svg) ;
//   - EN SIMULATION (attribut `simulating`) : détection de MOUVEMENT au survol de
//     la souris sur le composant (OUT=1 tant que la souris est au-dessus).
//     Ctrl+clic = mouvement PERMANENT (indiqué par une bulle), Ctrl+clic à nouveau
//     pour l'annuler. Le moteur lit `el.motion` en direct (cf. sim.mts).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/pir.svg';

export class PIRMotionSensorElement extends LitElement {
  declare simulating: boolean;
  /** Souris actuellement au-dessus du capteur. */
  declare hovering: boolean;
  /** Mouvement verrouillé (Ctrl+clic) : reste actif même sans survol. */
  declare sticky: boolean;

  static properties = {
    simulating: { type: Boolean },
    hovering: { state: true },
    sticky: { state: true },
  };

  constructor() {
    super();
    this.simulating = false;
    this.hovering = false;
    this.sticky = false;
  }

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 40, y: 100, number: 1, signals: [VCC()] },
    { name: 'OUT', x: 50, y: 100, number: 2, signals: [] },
    { name: 'GND', x: 60, y: 100, number: 3, signals: [GND()] },
  ];

  /** Sortie OUT : mouvement détecté (survol ou verrouillage permanent). */
  get motion(): boolean {
    return this.simulating && (this.hovering || this.sticky);
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      .wrap { position: relative; }
      .bubble {
        position: absolute;
        top: -6px;
        left: 50%;
        transform: translate(-50%, -100%);
        background: #222;
        color: #fff;
        font: 10px sans-serif;
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
      }
      .bubble::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 4px solid transparent;
        border-top-color: #222;
      }
    `;
  }

  private onEnter = () => {
    if (this.simulating) this.hovering = true;
  };
  private onLeave = () => {
    this.hovering = false;
  };
  private onDown = (e: PointerEvent) => {
    if (this.simulating && e.ctrlKey) {
      e.stopPropagation();
      this.sticky = !this.sticky;
    }
  };

  render() {
    const active = this.motion;
    return html`
      <div
        class="wrap"
        @pointerenter=${this.onEnter}
        @pointerleave=${this.onLeave}
        @pointerdown=${this.onDown}
      >
        <svg width="100" height="103.45" viewBox="0 0 100 103.45" xmlns="http://www.w3.org/2000/svg">
          ${unsafeSVG(drawing)}
          ${active
            ? html`<circle cx="50" cy="50" r="8" fill="#ff5252" opacity="0.8" />`
            : null}
        </svg>
        ${this.sticky
          ? html`<div class="bubble">Mouvement permanent (Ctrl+clic pour arrêter)</div>`
          : null}
      </div>
    `;
  }
}

if (!customElements.get('kablix-pir-motion-sensor')) {
  customElements.define('kablix-pir-motion-sensor', PIRMotionSensorElement);
}
