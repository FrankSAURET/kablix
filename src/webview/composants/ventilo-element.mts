// Composant maison <kablix-ventilo> : ventilateur 5 V, dessin de Frank
// (Composants.svg, groupe « ventilo » → ./externe/ventilo.svg). Le groupe
// `ventilo-helices` tourne autour de l'AXE du moyeu, à la vitesse imposée par
// le moteur : `speed` = tours par seconde RÉELS (0 = arrêté). L'élément décide
// seul de ce qui est affichable : une hélice à 3000 tr/min n'est qu'un
// scintillement, alors la rotation est RALENTIE — mais elle accélère avec le
// régime, ce que l'œil doit pouvoir lire (voir spinDisplay).
// Simulation : voir fanState (model.mts) — tension d'alimentation ET courant
// disponible ; sans courant suffisant, l'hélice ne tourne pas.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { measureSpin, spinDisplay, SPOKES_FALLBACK, type Spin } from './utils/spin.mjs';
import drawing from './externe/ventilo.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Régime nominal d'un petit ventilateur 5 V : 3000 tr/min = 50 tours/s. */
const NOMINAL_TURNS_PER_S = 50;
/** Flou de bougé des pales à plein régime (unités du dessin). Léger : c'est la
 *  rotation qui dit la vitesse, le flou ne fait que l'appuyer. */
const MAX_BLUR = 1.5;

/** Repère de l'hélice, mesuré une seule fois : le dessin est le même pour tous
 *  les ventilateurs (axe de rotation + nombre de pales). */
let spin: Spin | null = null;

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

  /** Pales trouvées dans le dessin (mesure de symétrie) — lecture seule. */
  get bladeCount(): number {
    return spin?.blades ?? SPOKES_FALLBACK;
  }

  // Broches : centre des pastilles du dessin (grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: '+', x: 10, y: 180, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: '-', x: 10, y: 190, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  /** Enveloppe neutre qui porte l'animation (créée au premier rendu). */
  private spinner: SVGGElement | null = null;

  /**
   * Le groupe des pales porte SON PROPRE `transform` (mise à l'échelle
   * Inkscape) : une animation CSS posée dessus l'écraserait — l'hélice sautait
   * de 40 px et changeait de taille dès le démarrage. On l'emballe donc dans un
   * groupe neutre, qui seul porte la rotation.
   */
  private ensureSpinner(): SVGGElement | null {
    if (this.spinner?.isConnected) return this.spinner;
    const blades = this.renderRoot.querySelector('#ventilo-helices') as SVGGElement | null;
    if (!blades?.parentNode) return null;
    const wrap = document.createElementNS(SVG_NS, 'g');
    wrap.setAttribute('class', 'spin');
    blades.parentNode.insertBefore(wrap, blades);
    wrap.appendChild(blades);
    this.spinner = wrap;
    return wrap;
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      /* fill-box : l'origine est comptée depuis le coin de la boîte des pales,
         donc valable où que soit l'hélice dans le viewBox (pas de coordonnées
         codées en dur). Le 50 % n'est qu'un repli : l'axe réel est mesuré. */
      .spin {
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
    const wrap = this.ensureSpinner();
    if (!wrap) return;
    if (!spin) spin = measureSpin(wrap);
    if (spin) wrap.style.transformOrigin = `${spin.x.toFixed(3)}px ${spin.y.toFixed(3)}px`;
    // Rotation ralentie mais MONOTONE sur toute la plage utile : c'est elle qui
    // dit la vitesse, le flou ne fait que l'appuyer à haut régime.
    const { turns: shown, blur } = spinDisplay(
      this.speed, NOMINAL_TURNS_PER_S, spin?.blades ?? SPOKES_FALLBACK
    );
    // Durée d'un tour (au millième de seconde). Vitesse nulle → animation
    // coupée (hélice figée).
    wrap.style.animationDuration = shown > 0 ? `${(1 / shown).toFixed(3)}s` : '0s';
    wrap.style.animationPlayState = shown > 0 ? 'running' : 'paused';
    wrap.style.filter = blur > 0 ? `blur(${(blur * MAX_BLUR).toFixed(2)}px)` : '';
  }

  render() {
    return html`
      <svg width="230" height="220" viewBox="0 0 230 220" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-ventilo')) {
  customElements.define('kablix-ventilo', VentiloElement);
}
