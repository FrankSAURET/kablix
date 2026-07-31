// Composant maison <kablix-ventilo> : ventilateur 5 V, dessin de Frank
// (Composants.svg, groupe « ventilo » → ./externe/ventilo.svg). Le groupe
// `ventilo-helices` tourne autour de SON centre (transform-box: fill-box), à la
// vitesse imposée par le moteur : `speed` = tours par seconde (0 = arrêté).
// Simulation : voir fanState (model.mts) — tension d'alimentation ET courant
// disponible ; sans courant suffisant, l'hélice ne tourne pas.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/ventilo.svg';

export class VentiloElement extends LitElement {
  /** Tension nominale (V) — inspecteur. */
  declare voltage: number;
  /** Courant consommé à pleine vitesse (A) — inspecteur. */
  declare current: number;
  /** Vitesse imposée par la simulation, en TOURS PAR SECONDE (0 = arrêté). */
  declare speed: number;

  static properties = {
    voltage: { type: Number },
    current: { type: Number },
    speed: { type: Number },
  };

  constructor() {
    super();
    this.voltage = 5;
    this.current = 0.85;
    this.speed = 0;
  }

  // Broches : centre des pastilles du dessin (grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: '+', x: 10, y: 160, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: '-', x: 10, y: 170, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
      /* fill-box : le centre de rotation est celui de l'hélice elle-même, quelle
         que soit sa place dans le viewBox (pas de coordonnées codées en dur). */
      #ventilo-helices {
        transform-box: fill-box;
        transform-origin: 50% 50%;
        animation-name: kablix-fan-spin;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      @keyframes kablix-fan-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    const blades = this.renderRoot.querySelector('#ventilo-helices') as SVGElement | null;
    if (!blades) return;
    // Durée d'un tour ; vitesse nulle → animation coupée (hélice figée).
    const turns = Number.isFinite(this.speed) ? Math.max(0, this.speed) : 0;
    blades.style.animationDuration = turns > 0 ? `${(1 / turns).toFixed(3)}s` : '0s';
    blades.style.animationPlayState = turns > 0 ? 'running' : 'paused';
  }

  render() {
    return html`
      <svg width="220" height="200" viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-ventilo')) {
  customElements.define('kablix-ventilo', VentiloElement);
}
