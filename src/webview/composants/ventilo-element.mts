// Composant maison <kablix-ventilo> : ventilateur 5 V, dessin de Frank
// (Composants.svg, groupe « ventilo » → ./externe/ventilo.svg). Le groupe
// `ventilo-helices` tourne autour de l'AXE du moyeu, à la vitesse imposée par
// le moteur : `speed` = tours par seconde RÉELS (0 = arrêté). L'élément décide
// seul de ce qui est affichable : au-delà de ce qu'un écran à 60 Hz sait
// montrer, la rotation est plafonnée et la vitesse se lit au flou de bougé.
// Simulation : voir fanState (model.mts) — tension d'alimentation ET courant
// disponible ; sans courant suffisant, l'hélice ne tourne pas.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { measureSpin, SPOKES_FALLBACK, type Spin } from './utils/spin.mjs';
import drawing from './externe/ventilo.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Rafraîchissement d'écran retenu pour le calcul de l'alias (Hz). */
const SCREEN_HZ = 60;
/**
 * Fraction de la période de pale qu'une image d'écran a le droit d'avaler. À la
 * moitié l'image devient ambiguë (roue de charrette : l'hélice paraît ralentir
 * puis tourner À L'ENVERS), on s'arrête donc au quart.
 */
const ALIAS_MARGIN = 4;
/** Régime nominal d'un petit ventilateur 5 V : 3000 tr/min = 50 tours/s. */
const NOMINAL_TURNS_PER_S = 50;
/** Flou de bougé des pales à plein régime (unités du dessin). */
const MAX_BLUR = 3;
/** Transparence des pales à plein régime : un ventilateur lancé se traverse. */
const MAX_FADE = 0.35;

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
    const turns = Number.isFinite(this.speed) ? Math.max(0, this.speed) : 0;
    // Un écran ne montre qu'une image tous les 1/60 s : au-delà d'un quart de
    // pale par image, l'hélice paraît RALENTIR puis tourner à l'envers, si bien
    // que baisser la tension l'accélérait. La rotation affichée est donc
    // plafonnée là, et c'est le flou de bougé qui dit la vitesse au-dessus —
    // exactement ce que voit l'œil sur un vrai ventilateur.
    const maxTurns = SCREEN_HZ / (spin?.blades ?? SPOKES_FALLBACK) / ALIAS_MARGIN;
    const shown = Math.min(turns, maxTurns);
    // Durée d'un tour, arrondie vers le HAUT (au millième de seconde) : arrondir
    // vers le bas repasserait de justesse au-dessus du plafond. Vitesse nulle →
    // animation coupée (hélice figée).
    wrap.style.animationDuration = shown > 0 ? `${(Math.ceil(1000 / shown) / 1000).toFixed(3)}s` : '0s';
    wrap.style.animationPlayState = shown > 0 ? 'running' : 'paused';
    const excess = Math.max(0, Math.min(1, (turns - maxTurns) / Math.max(1, NOMINAL_TURNS_PER_S - maxTurns)));
    wrap.style.filter = excess > 0 ? `blur(${(excess * MAX_BLUR).toFixed(2)}px)` : '';
    wrap.style.opacity = excess > 0 ? (1 - excess * MAX_FADE).toFixed(3) : '';
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
