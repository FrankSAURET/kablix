// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — tilt-switch-element.ts.
// Balise <kablix-tilt-switch> (ex <wokwi-tilt-switch>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN retouché (./externe/tilt.svg, broches recalées sur la
// grille de 10 px ; plus de pinScale, cf. catalog.mts).
//   - PLUS de propriété d'état dans l'inspecteur : EN SIMULATION (attribut
//     `simulating`) : MAINTENIR le clic incline (comme si on faisait vraiment
//     basculer le composant du doigt) ; RELÂCHER annule la déformation et repasse
//     `tilted` à false — sauf si Ctrl+clic a verrouillé l'inclinaison (`sticky`),
//     auquel cas elle reste active jusqu'à un nouveau Ctrl+clic. L'état `tilted`
//     est relu par le moteur (event `input` à chaque changement).
//     Déformation visuelle = bascule TRAPÉZOÏDALE mesurée sur la grille lattice2
//     de tilt-incline.svg de Frank : seuls les 2 coins GAUCHES du boîtier rentrent
//     de 5,0 px chacun (haut ET bas, symétrique autour de y≈30), la colonne x=100
//     — la ligne des EXTRÉMITÉS de pattes — est fixe. Un `matrix()` 2D affine ne
//     sait pas resserrer des deux côtés (un skew ne penche que d'un côté), et
//     l'ancienne solution « deux moitiés clipées skewY » (v2026.7.69) déplaçait
//     les bouts de pattes (l'origine du skew était le bord du boîtier x=82.2, pas
//     x=100) et faisait se chevaucher les moitiés à la couture. Solution : UNE
//     homographie CSS `matrix3d` (trapèze keystone) appliquée à l'élément <svg>
//     racine — c'est un élément HTML, les transforms 3D s'y appliquent (l'échec
//     v2026.7.69 de perspective/rotateY concernait les <g> INTERNES du SVG).
//     y' = cy + (y−cy)/w(x) avec w(x) = A + B·x et w(100) = 1 : tout point de la
//     verticale x=100 est exactement fixe (les extrémités des pattes ne bougent
//     pas), le côté gauche se resserre symétriquement, le corps entier se déforme
//     globalement (la légère compression horizontale de la perspective fait
//     visuellement basculer le boîtier). Constantes calées sur la référence :
//     resserrement 5,0 px en x=8.727 → A = 1.23125, B = −0.0023125, cy = 30.0725.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/tilt.svg';

export class TiltSwitchElement extends LitElement {
  declare tilted: boolean;
  declare simulating: boolean;
  declare sticky: boolean;
  declare hovering: boolean;

  static properties = {
    tilted: { type: Boolean },
    simulating: { type: Boolean },
    sticky: { state: true },
    hovering: { state: true },
  };

  constructor() {
    super();
    this.tilted = false;
    this.simulating = false;
    this.sticky = false;
    this.hovering = false;
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
      .wrap {
        position: relative;
        cursor: default;
      }
      .wrap.simulating {
        cursor: pointer;
      }
      /* Trapèze keystone (voir commentaire d'en-tête) : homographie matrix3d,
         origine (0,0) pour que les formules soient en coordonnées du viewBox
         (rendu 1:1 px). Colonnes de la matrice (ordre CSS column-major) :
         x' = x ; y' = m12·x + y + m42 ; w = m14·x + m44, puis division par w.
         m12 = cy·B, m42 = cy·(A−1), m14 = B, m44 = A — la verticale x=100
         (extrémités des pattes) vérifie w=1 et reste exactement en place. */
      .tilt-svg {
        display: block;
        transform-origin: 0 0;
        transition: transform 0.15s ease;
      }
      .tilt-svg.tilted {
        transform: matrix3d(
          1, -0.069543, 0, -0.0023125,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 6.95427, 0, 1.23125
        );
      }
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
        z-index: 1;
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

  private setTilted(value: boolean): void {
    if (this.tilted === value) return;
    this.tilted = value;
    this.dispatchEvent(new Event('input'));
  }

  private onEnter = () => {
    this.hovering = true;
  };
  private onLeave = () => {
    this.hovering = false;
  };
  private onWindowPointerUp = () => {
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    if (this.sticky) return;
    this.setTilted(false);
  };
  private onPointerDown = (e: PointerEvent) => {
    if (!this.simulating) return;
    if (e.ctrlKey) {
      // Ctrl+clic : verrouille/déverrouille l'inclinaison en permanence.
      this.sticky = !this.sticky;
      this.setTilted(this.sticky);
      return;
    }
    if (this.sticky) return;
    // Maintien du clic = incliné, comme si on faisait basculer le composant.
    // Écoute sur window (pas juste l'élément) pour capter le relâchement même
    // si le pointeur a quitté le composant entre-temps.
    this.setTilted(true);
    window.addEventListener('pointerup', this.onWindowPointerUp);
  };

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('pointerup', this.onWindowPointerUp);
  }

  render() {
    let bubble: string | null = null;
    if (this.simulating && this.hovering) {
      bubble = this.sticky
        ? 'Maintenir le clic pour incliner / Ctrl + clic pour arrêter le maintien'
        : 'Maintenir le clic pour incliner / Ctrl + clic pour verrouiller incliné';
    }
    return html`
      <div
        class="wrap ${this.simulating ? 'simulating' : ''}"
        @pointerenter=${this.onEnter}
        @pointerleave=${this.onLeave}
        @pointerdown=${this.onPointerDown}
      >
        <svg
          class="tilt-svg ${this.tilted ? 'tilted' : ''}"
          width="105.82864"
          height="60"
          viewBox="0 0 105.82864 60"
          xmlns="http://www.w3.org/2000/svg"
        >
          ${unsafeSVG(drawing)}
        </svg>
        ${bubble ? html`<div class="bubble">${bubble}</div>` : null}
      </div>
    `;
  }
}

if (!customElements.get('kablix-tilt-switch')) {
  customElements.define('kablix-tilt-switch', TiltSwitchElement);
}
