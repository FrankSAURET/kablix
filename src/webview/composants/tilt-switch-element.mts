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
//     Déformation visuelle = bascule TRAPÉZOÏDALE mesurée sur tilt-incline.svg de
//     Frank (contour du boîtier : bord droit — proche des broches — quasi fixe,
//     bord gauche resserré symétriquement d'environ 5 px en haut ET en bas). Un
//     `matrix()` 2D affine unique ne peut pas produire ce resserrement symétrique
//     (un skew ne penche que d'un côté) ; `perspective`+`rotateY` CSS a été
//     essayé mais Chrome ne rend PAS les `<g>` SVG en 3D (transform reste
//     l'identité, vérifié en headless — SVG n'établit pas de contexte de rendu
//     3D hérité comme le HTML). Solution retenue : le SVG entier est dupliqué en
//     deux copies superposées (`.tilt-stack`, voir render()), chacune rognée à
//     une moitié (clip-path inset 50%) avec son propre skewY ancré sur le bord
//     droit fixe — la copie du haut penche vers le bas, celle du bas vers le
//     haut, recréant le trapèze symétrique mesuré. Les pattes/fils (broches
//     `pinInfo`, fixes hors SVG) ne bougent jamais.
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
      /* Trapèze symétrique = deux copies superposées du même SVG (voir render()) :
         .half-top montre seulement la moitié haute (clip-path), skewY ancré à
         droite pour faire DESCENDRE le bord gauche haut ; .half-bottom montre la
         moitié basse, skewY inverse pour faire REMONTER le bord gauche bas. Non
         tiltées, les deux moitiés se recollent exactement (mêmes coordonnées),
         visuellement identique à un SVG plat unique. */
      .tilt-stack {
        position: relative;
        width: 105.82864px;
        height: 60px;
      }
      .tilt-svg.half {
        position: absolute;
        top: 0;
        left: 0;
        transition: clip-path 0.15s ease, transform 0.15s ease;
      }
      .tilt-svg.half-top {
        clip-path: inset(0 0 50% 0);
        transform-origin: 82.221863px 30px;
      }
      .tilt-svg.half-bottom {
        clip-path: inset(50% 0 0 0);
        transform-origin: 82.221863px 30px;
      }
      .tilt-svg.half-top.tilted {
        transform: skewY(-6deg);
      }
      .tilt-svg.half-bottom.tilted {
        transform: skewY(6deg);
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
        <div class="tilt-stack">
          <svg
            class="tilt-svg half half-top ${this.tilted ? 'tilted' : ''}"
            width="105.82864"
            height="60"
            viewBox="0 0 105.82864 60"
            xmlns="http://www.w3.org/2000/svg"
          >
            ${unsafeSVG(drawing)}
          </svg>
          <svg
            class="tilt-svg half half-bottom ${this.tilted ? 'tilted' : ''}"
            width="105.82864"
            height="60"
            viewBox="0 0 105.82864 60"
            xmlns="http://www.w3.org/2000/svg"
          >
            ${unsafeSVG(drawing)}
          </svg>
        </div>
        ${bubble ? html`<div class="bubble">${bubble}</div>` : null}
      </div>
    `;
  }
}

if (!customElements.get('kablix-tilt-switch')) {
  customElements.define('kablix-tilt-switch', TiltSwitchElement);
}
