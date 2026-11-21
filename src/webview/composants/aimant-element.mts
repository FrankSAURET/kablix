// Composant maison <kablix-aimant> : aimant droit, SANS broche (piste 7 / lot D0
// de la piste 11). Premier composant MÉCANIQUE : il ne porte aucun signal, il se
// FIXE sur un autre composant (attribut `mount` = repère du porteur, un servo
// pour commencer) et le suit pendant la simulation. Les capteurs à effet Hall
// posés sur la feuille le voient quand il passe à portée (sim.mts, montage.mts).
//
// Dessin provisoire (en attendant celui de Frank dans Composants2D.svg) : barreau
// 20 × 10, pôle Nord rouge, pôle Sud bleu — les couleurs de l'aimant glissant
// du capteur Hall.
import { css, html, svg, LitElement } from 'lit';
import type { ElementPin } from './pin.mjs';

/** Taille du barreau (px du monde, grille de 10 px). */
export const AIMANT_W = 20;
export const AIMANT_H = 10;

export class AimantElement extends LitElement {
  /** Repère du composant porteur (`S1`…), vide = aimant libre. */
  declare mount: string;
  declare simulating: boolean;

  static properties = {
    mount: { type: String },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.mount = '';
    this.simulating = false;
  }

  /** Aucune broche : rien ne se câble sur un aimant. */
  readonly pinInfo: ElementPin[] = [];

  /** Centre du barreau en coordonnées ÉCRAN (rotation, miroir et zoom compris). */
  centerClient(): { x: number; y: number } | null {
    const root = this.renderRoot.querySelector('svg') as SVGSVGElement | null;
    const m = root?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPointReadOnly(AIMANT_W / 2, AIMANT_H / 2).matrixTransform(m);
    return { x: p.x, y: p.y };
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      text { font-family: 'Consolas', monospace; text-anchor: middle; pointer-events: none; }
    `;
  }

  render() {
    const half = AIMANT_W / 2;
    // Fixé sur un porteur : petit maillon au-dessus du barreau, pour qu'on voie
    // hors simulation que la pièce n'est pas libre.
    const link = this.mount.trim()
      ? svg`<circle cx=${half} cy="-2.5" r="1.6" fill="none" stroke="#666" stroke-width="0.6" />`
      : null;
    return html`
      <svg width=${AIMANT_W} height=${AIMANT_H} viewBox="0 0 ${AIMANT_W} ${AIMANT_H}"
           overflow="visible" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width=${half} height=${AIMANT_H} fill="#d02b2b" />
        <rect x=${half} y="0" width=${half} height=${AIMANT_H} fill="#2b57d0" />
        <rect x="0" y="0" width=${AIMANT_W} height=${AIMANT_H} fill="none" stroke="#333" stroke-width="0.5" />
        <text x=${half / 2} y="7.2" font-size="6" fill="#fff">N</text>
        <text x=${half + half / 2} y="7.2" font-size="6" fill="#fff">S</text>
        ${link}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-aimant')) {
  customElements.define('kablix-aimant', AimantElement);
}
