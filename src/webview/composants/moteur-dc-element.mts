// Composant maison <kablix-moteur-dc> : moteur à courant continu, dessin de
// Frank (Composants.svg, groupe « moteurDC » → ./externe/moteur-dc.svg). Le
// groupe `moteurDC-axe-rotatif` — le pignon de sortie — tourne autour de son
// axe, à la vitesse imposée par le moteur de simulation : `speed` = tours par
// seconde RÉELS (0 = arrêté). Même principe que le ventilateur : un pignon à
// 6000 tr/min n'est qu'une bouillie, la rotation est donc RALENTIE — mais elle
// accélère avec la tension, ce que l'œil doit pouvoir lire (voir spinDisplay).
//
// Simulation : voir motorStates (model.mts) — la vitesse suit la TENSION
// appliquée, le moteur ne démarre pas si la source ne fournit pas son courant,
// et il GRILLE au-delà de 1,5 fois sa tension nominale.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { boumOverlay } from './utils/boum.mjs';
import { measureSpin, spinDisplay, SPOKES_FALLBACK, type Spin } from './utils/spin.mjs';
import drawing from './externe/moteur-dc.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Régime nominal d'un petit moteur 5 V : 6000 tr/min = 100 tours/s. */
const NOMINAL_TURNS_PER_S = 100;
/** Flou de bougé du pignon à plein régime (unités du dessin). Léger : c'est la
 *  rotation qui dit la vitesse, le flou ne fait que l'appuyer. */
const MAX_BLUR = 1;

/** Repère du pignon, mesuré une seule fois : le dessin est le même pour tous les
 *  moteurs (axe de rotation + nombre de dents). */
let spin: Spin | null = null;

export class MoteurDcElement extends LitElement {
  /** Tension nominale (V) — inspecteur. */
  declare voltage: number;
  /** Courant à vide (A) — inspecteur. */
  declare current: number;
  /** Vitesse imposée par la simulation, en TOURS PAR SECONDE (0 = arrêté). */
  declare speed: number;
  /** Moteur grillé (surtension) : l'explosion remplace la rotation. */
  declare burned: boolean;

  static properties = {
    voltage: { type: Number },
    current: { type: Number },
    speed: { type: Number },
    burned: { type: Boolean },
  };

  constructor() {
    super();
    this.voltage = 5;
    this.current = 0.2;
    this.speed = 0;
    this.burned = false;
  }

  /** Dents trouvées dans le dessin (mesure de symétrie) — lecture seule. */
  get bladeCount(): number {
    return spin?.blades ?? SPOKES_FALLBACK;
  }

  // Broches : centre des pastilles du dessin (grille de 10 px). Un moteur à
  // courant continu n'a pas de polarité imposée — les deux fils sont nommés
  // comme sur le dessin de Frank, et la simulation essaie les deux sens.
  readonly pinInfo: ElementPin[] = [
    { name: '1', x: 30, y: 90, signals: [] },
    { name: '2', x: 60, y: 90, signals: [] },
  ];

  /** Enveloppe neutre qui porte l'animation (créée au premier rendu). */
  private spinner: SVGGElement | null = null;

  /**
   * Le groupe du pignon porte SON PROPRE `transform` (mise à l'échelle
   * Inkscape) : une animation CSS posée dessus l'écraserait — le pignon
   * sauterait et changerait de taille dès le démarrage. On l'emballe donc dans
   * un groupe neutre, qui seul porte la rotation.
   */
  private ensureSpinner(): SVGGElement | null {
    if (this.spinner?.isConnected) return this.spinner;
    const shaft = this.renderRoot.querySelector('#moteurDC-axe-rotatif') as SVGGElement | null;
    if (!shaft?.parentNode) return null;
    const wrap = document.createElementNS(SVG_NS, 'g');
    wrap.setAttribute('class', 'spin');
    shaft.parentNode.insertBefore(wrap, shaft);
    wrap.appendChild(shaft);
    this.spinner = wrap;
    return wrap;
  }

  static get styles() {
    return css`
      /* position: relative — requis par boumOverlay (span centré en absolu). */
      :host { display: inline-block; position: relative; }
      /* fill-box : l'origine est comptée depuis le coin de la boîte du pignon,
         donc valable où qu'il soit dans le viewBox (pas de coordonnées codées en
         dur). Le 50 % n'est qu'un repli : l'axe réel est mesuré. */
      .spin {
        transform-box: fill-box;
        transform-origin: 50% 50%;
        animation-name: kablix-motor-spin;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      @keyframes kablix-motor-spin {
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
    // Un moteur grillé ne tourne plus, quoi que dise la simulation.
    const turns = this.burned ? 0 : this.speed;
    // Rotation ralentie mais MONOTONE sur toute la plage utile : c'est elle qui
    // dit la vitesse, le flou ne fait que l'appuyer à haut régime.
    const { turns: shown, blur } = spinDisplay(
      turns, NOMINAL_TURNS_PER_S, spin?.blades ?? SPOKES_FALLBACK
    );
    // Durée d'un tour (au millième de seconde). Vitesse nulle → animation
    // coupée (pignon figé).
    wrap.style.animationDuration = shown > 0 ? `${(1 / shown).toFixed(3)}s` : '0s';
    wrap.style.animationPlayState = shown > 0 ? 'running' : 'paused';
    wrap.style.filter = blur > 0 ? `blur(${(blur * MAX_BLUR).toFixed(2)}px)` : '';
  }

  render() {
    return html`
      <svg width="90" height="100" viewBox="0 0 90 100" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
      ${this.burned ? boumOverlay(60) : null}
    `;
  }
}

if (!customElements.get('kablix-moteur-dc')) {
  customElements.define('kablix-moteur-dc', MoteurDcElement);
}
