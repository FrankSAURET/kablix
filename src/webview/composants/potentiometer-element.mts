// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — potentiometer-element.ts.
// Balise <kablix-potentiometer> (ex <wokwi-potentiometer>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/pot.svg) ;
//   - GND/SIG/VCC recalés sur la grille de 10 px (40/50/60, y=80, repère du dessin) ;
//   - rotation du curseur réimplémentée via getScreenCTM natif (l'ancienne machinerie
//     de drag d'origine — CTM workaround — retirée, même principe que slide-pot).
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, GND, VCC, type ElementPin } from './pin.mjs';
import { clamp } from './utils/clamp.mjs';
import drawing from './externe/pot.svg';

// Centre de rotation du curseur (unités du dessin = ellipse #knob du SVG retouché).
const knobCenter = {
  x: 48.787586,
  y: 41.290924,
};

export class PotentiometerElement extends LitElement {
  declare min: number;
  declare max: number;
  declare value: number;
  declare step: number;
  declare startDegree: number;
  declare endDegree: number;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    min: { type: Number },
    max: { type: Number },
    value: {},
    step: {},
    startDegree: {},
    endDegree: {},
  };

  constructor() {
    super();
    this.min = 0;
    this.max = 1023;
    this.value = 0;
    this.step = 1;
    this.startDegree = -135;
    this.endDegree = 135;
  }

  private pressed = false;

  // Broches : centre de chaque pastille (repère du dessin retouché). Espacement
  // multiple de 10 → toutes tombent sur un croisement de la grille.
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 40, y: 80, number: 1, signals: [GND()] },
    { name: 'SIG', x: 50, y: 80, number: 2, signals: [analog(0)] },
    { name: 'VCC', x: 60, y: 80, number: 3, signals: [VCC()] },
  ];

  static get styles() {
    return css`
      #rotating {
        transform-origin: ${knobCenter.x}px ${knobCenter.y}px;
        transform: rotate(var(--knob-angle, 0deg));
      }

      .hide-input {
        position: absolute;
        clip: rect(0 0 0 0);
        width: 1px;
        height: 1px;
        margin: -1px;
      }
      input:focus + svg #knob {
        stroke: #ccdae3;
        filter: url(#outline);
      }
    `;
  }

  mapToMinMax(value: number, min: number, max: number): number {
    return value * (max - min) + min;
  }

  percentFromMinMax(value: number, min: number, max: number): number {
    return (value - min) / (max - min);
  }

  renderSVG() {
    const percent = clamp(0, 1, this.percentFromMinMax(this.value, this.min, this.max));
    const knobDeg = (this.endDegree - this.startDegree) * percent + this.startDegree;

    return html`<svg
      role="slider"
      width="94.25"
      height="90"
      viewBox="0 0 94.25 90"
      xmlns="http://www.w3.org/2000/svg"
      style="--knob-angle: ${knobDeg}deg"
    >${unsafeSVG(drawing)}</svg>`;
  }

  render() {
    return html`
      <input
        tabindex="0"
        type="range"
        class="hide-input"
        max="${this.max}"
        min="${this.min}"
        value="${this.value}"
        step="${this.step}"
        aria-valuemin="${this.min}"
        aria-valuenow="${this.value}"
        @input="${this.onValueChange}"
      />
      ${this.renderSVG()}
    `;
  }

  firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    this.renderRoot.querySelector('svg')?.addEventListener('pointerdown', this.onPointerDown as EventListener);
  }

  private onValueChange(event: KeyboardEvent) {
    const target = event.target as HTMLInputElement;
    this.updateValue(parseFloat(target.value));
  }

  private onPointerDown = (event: PointerEvent): void => {
    // Seul le clic gauche « nu » tourne le bouton : le clic droit (déplacement
    // du composant dans l'éditeur) et le Ctrl+clic (sélection multiple) doivent
    // remonter au .part__body — sinon impossible de saisir le potentiomètre.
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    this.pressed = true;
    event.stopPropagation();
    event.preventDefault();
    (this.renderRoot.querySelector('.hide-input') as HTMLElement | null)?.focus();
    this.rotateFromEvent(event);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.pressed) this.rotateFromEvent(event);
  };

  private onPointerUp = (): void => {
    this.pressed = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  };

  /** Point (unités du dessin) sous le curseur, via la CTM du <svg>. */
  private toSvgPoint(clientX: number, clientY: number): DOMPointReadOnly | null {
    const svg = this.renderRoot.querySelector('svg') as SVGSVGElement | null;
    const m = svg?.getScreenCTM();
    if (!m) return null;
    return new DOMPointReadOnly(clientX, clientY).matrixTransform(m.inverse());
  }

  private rotateFromEvent(event: PointerEvent): void {
    const p = this.toSvgPoint(event.clientX, event.clientY);
    if (!p) return;

    const x = knobCenter.x - p.x;
    const y = knobCenter.y - p.y;
    let deg = Math.round((Math.atan2(y, x) * 180) / Math.PI);
    if (deg < 0) {
      deg += 360;
    }

    deg -= 90;

    if (x > 0 && y <= 0 && deg > 0) {
      deg -= 360;
    }

    deg = clamp(this.startDegree, this.endDegree, deg);
    const percent = this.percentFromMinMax(deg, this.startDegree, this.endDegree);
    const value = this.mapToMinMax(percent, this.min, this.max);

    this.updateValue(value);
  }

  private updateValue(value: number) {
    const clamped = clamp(this.min, this.max, value);
    const updated = Math.round(clamped / this.step) * this.step;
    this.value = Math.round(updated * 100) / 100;
    this.dispatchEvent(new InputEvent('input', { detail: this.value }));
  }
}

if (!customElements.get('kablix-potentiometer')) {
  customElements.define('kablix-potentiometer', PotentiometerElement);
}
