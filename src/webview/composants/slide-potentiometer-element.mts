// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — slide-potentiometer-element.ts.
// Balise <kablix-slide-potentiometer> (ex <wokwi-slide-potentiometer>). Licence : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix (fusion de l'ancien slide-pot.mts) :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/slide-pot.svg) ;
//   - VCC/SIG/GND recalés sur la grille de 10 px (espacement multiple de 10, le
//     centre de chaque patte tombe sur un croisement après accrochage) ;
//   - glisse du curseur réimplémentée (le calcul d'origine, calibré sur l'ancien
//     dessin, faisait sauter le curseur loin de la souris) ; l'ancienne machinerie
//     de drag (CTM workaround, zoom storybook) a été retirée avec son dessin.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, GND, VCC, type ElementPin } from './pin.mjs';
import { clamp } from './utils/clamp.mjs';
import drawing from './externe/slide-pot.svg';

// Translation de base du groupe #tip dans le dessin (position de repos).
const TIP_BASE = 'translate(0.26640716 -10.449811)';
// Abscisse (unités SVG) du centre du curseur quand l'offset horizontal vaut 0.
const TIP_CENTER0 = 27.78;
// Demi-course horizontale du curseur (unités SVG) = travelLength / 2.
const TIP_RANGE = 15;

export class SlidePotentiometerElement extends LitElement {
  declare travelLength: number;
  declare value: number;
  declare min: number;
  declare max: number;
  declare step: number;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    travelLength: { type: Number },
    value: { type: Number },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
  };

  constructor() {
    super();
    this.travelLength = 30;
    this.value = 0;
    this.min = 0;
    this.max = 100;
    this.step = 2;
  }

  private dragging = false;
  private grabDelta = 0;

  // Broches : centre de chaque patte. L'espacement (0,10) et (190,0) est multiple
  // de 10 → après accrochage de la 1re broche, toutes tombent sur un croisement.
  get pinInfo(): ElementPin[] {
    return [
      { name: 'VCC', x: 10, y: 8.77, number: 1, signals: [VCC()] },
      { name: 'SIG', x: 10, y: 18.77, number: 2, signals: [analog(0)] },
      { name: 'GND', x: 200, y: 8.77, number: 3, signals: [GND()] },
    ];
  }

  static get styles() {
    return css`
      .hide-input {
        position: absolute;
        clip: rect(0 0 0 0);
        width: 1px;
        height: 1px;
        margin: -1px;
      }
      input:focus + svg #tip {
        /* some style to add when the element has focus */
        filter: url(#outline);
      }
    `;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('travelLength')) {
      this.dispatchEvent(new CustomEvent('pininfo-change'));
    }
    super.update(changedProperties);
  }

  renderSVG() {
    return html`<svg
      width="209.9903"
      height="27.537193"
      viewBox="0 0 55.559932 7.2858823"
      xmlns="http://www.w3.org/2000/svg"
    >${unsafeSVG(drawing)}</svg>`;
  }

  render() {
    return html`
      <input
        tabindex="0"
        type="range"
        min="${this.min}"
        max="${this.max}"
        value="${this.value}"
        step="${this.step}"
        aria-valuemin="${this.min}"
        aria-valuenow="${this.value}"
        aria-valuemax="${this.max}"
        @input="${this.onInputValueChange}"
        class="hide-input"
      />
      ${this.renderSVG()}
    `;
  }

  firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    this.renderRoot.querySelector('#tip')?.addEventListener('pointerdown', this.onPointerDown as EventListener);
    this.positionTip();
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    this.positionTip();
  }

  /** Centre courant du curseur (unités SVG) d'après la valeur. */
  private currentCenter(): number {
    const span = this.max - this.min || 1;
    return TIP_CENTER0 + ((this.value - this.min) / span) * this.travelLength - TIP_RANGE;
  }

  /** Déplace le groupe #tip selon la valeur (translate horizontal + base). */
  private positionTip(): void {
    const offsetX = this.currentCenter() - TIP_CENTER0;
    this.renderRoot.querySelector('#tip')?.setAttribute('transform', `translate(${offsetX} 0) ${TIP_BASE}`);
  }

  /** Abscisse (unités SVG) d'un point écran, via la CTM du <svg>. */
  private toSvgX(clientX: number, clientY: number): number | null {
    const svg = this.renderRoot.querySelector('svg') as SVGSVGElement | null;
    const m = svg?.getScreenCTM();
    if (!m) return null;
    return new DOMPointReadOnly(clientX, clientY).matrixTransform(m.inverse()).x;
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Clic droit (déplacement du composant) et Ctrl+clic (sélection multiple) :
    // ne pas saisir le curseur, laisser l'éditeur gérer.
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
    const x = this.toSvgX(e.clientX, e.clientY);
    if (x === null) return;
    e.preventDefault();
    (this.renderRoot.querySelector('.hide-input') as HTMLElement | null)?.focus();
    this.grabDelta = x - this.currentCenter(); // glisse relative → pas de saut
    this.dragging = true;
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const x = this.toSvgX(e.clientX, e.clientY);
    if (x === null) return;
    const center = x - this.grabDelta;
    const frac = Math.min(1, Math.max(0, (center - (TIP_CENTER0 - TIP_RANGE)) / this.travelLength));
    const v = Math.round(this.min + frac * (this.max - this.min));
    if (v !== this.value) {
      this.value = v;
      this.positionTip();
      this.dispatchEvent(new InputEvent('input'));
    }
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  };

  private onInputValueChange(event: KeyboardEvent): void {
    const target = event.target as HTMLInputElement;
    if (target.value) {
      this.value = clamp(this.min, this.max, Number(target.value));
      this.dispatchEvent(new InputEvent('input', { detail: this.value }));
    }
  }
}

if (!customElements.get('kablix-slide-potentiometer')) {
  customElements.define('kablix-slide-potentiometer', SlidePotentiometerElement);
}
