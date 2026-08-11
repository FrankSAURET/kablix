// Composant maison <kablix-pot-rot2> : potentiomètre AJUSTABLE (trimmer) que
// l'on règle au tournevis, dessin de Frank (Composants.svg — groupe « pot-rot2 »,
// symbole interne « pot-rot2-interne »).
//
// Deux choses varient avec les propriétés :
//   - la VIS tourne avec `value` (0 → 100 %), comme le bouton du potentiomètre
//     rotatif ; les pièces du rotor sont regroupées après le premier rendu dans
//     un <g id="rotating"> (le dessin n'a pas à porter ce groupe) ;
//   - le CODE imprimé sur le boîtier suit la valeur nominale `ohms` : trois
//     chiffres à la mode EIA (104 = 100 kΩ, 472 = 4,7 kΩ). Les trois <text> du
//     dessin sont, dans l'ordre du document, les deux chiffres significatifs
//     puis le multiplicateur — chacun avec sa propre inclinaison, puisqu'ils
//     sont écrits en arc de cercle sur le boîtier.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, GND, VCC, type ElementPin } from './pin.mjs';
import { clamp } from './utils/clamp.mjs';
import { potReadout, potReadoutStyles } from './utils/pot-readout.mjs';
import drawing from './externe/pot-rot2.svg';

/** Cadre du dessin (repère des broches, grille de 10 px). */
const BOX = { w: 60, h: 60 };

/**
 * Pièces qui TOURNENT avec la vis : le rotor clair (avec son index) et les
 * quatre facettes de l'empreinte cruciforme. Elles se suivent dans le dessin ;
 * l'anneau du boîtier et ses reflets, dessinés par-dessus, restent fixes.
 */
const ROTOR_IDS = ['path27-8', 'g12-6', 'g13', 'g14-2', 'g15-4'];

/**
 * Centre de la vis, dans les DEUX repères qui servent ici :
 *   - `local` = unités du dessin d'Inkscape (celles où vivent les pièces du
 *     rotor, sous la matrice d'échelle du dessin) → origine de la rotation CSS ;
 *   - `view` = unités du viewBox (celles des broches) → repère du glisser.
 */
const KNOB_LOCAL = { x: 63.4966, y: 10.4824 };
const KNOB_VIEW = { x: 30, y: 29.64 };

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Code à trois chiffres d'une valeur nominale : deux chiffres significatifs
 * suivis du nombre de zéros (100 000 → « 104 », 4700 → « 472 »). Sous 100 Ω le
 * multiplicateur reste 0 (56 Ω → « 560 »), comme sur les vrais boîtiers.
 */
export function eiaCode(ohms: number): string {
  const value = Math.max(10, Number(ohms) || 0);
  const exp = clamp(0, 9, Math.floor(Math.log10(value)) - 1);
  const mant = clamp(10, 99, Math.round(value / 10 ** exp));
  return `${mant}${exp}`;
}

/** Réécrit, dans l'ordre, le contenu des <text> du dessin avec les chiffres du code. */
function printCode(source: string, code: string): string {
  let i = 0;
  return source.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/g, (_all, open: string, body: string, close: string) => {
    const digit = code[i++] ?? '';
    // Le chiffre est porté par le <tspan> intérieur (Inkscape en pose toujours
    // un) ; sans tspan, le texte est écrit directement dans le <text>.
    const filled = body.includes('</tspan>')
      ? body.replace(/(>)([^<]*)(<\/tspan>)/, `$1${digit}$3`)
      : digit;
    return open + filled + close;
  });
}

export class PotRot2Element extends LitElement {
  declare min: number;
  declare max: number;
  declare value: number;
  declare step: number;
  declare startDegree: number;
  declare endDegree: number;
  /** Résistance totale entre les deux extrémités (celle qu'écrit le code du boîtier). */
  declare ohms: number;
  declare simulating: boolean;

  static properties = {
    min: { type: Number },
    max: { type: Number },
    value: {},
    step: {},
    startDegree: {},
    endDegree: {},
    ohms: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.min = 0;
    this.max = 100;
    this.value = 50;
    this.step = 1;
    this.startDegree = -135;
    this.endDegree = 135;
    this.ohms = 10_000;
    this.simulating = false;
  }

  private pressed = false;

  // Broches : le curseur en haut (V), les deux extrémités du rail en bas (1 et
  // 2). Elles portent les noms du modèle de simulation (GND/SIG/VCC) — c'est
  // l'éditeur qui les affiche « 1 », « V » et « 2 », comme sur le boîtier.
  readonly pinInfo: ElementPin[] = [
    { name: 'SIG', x: 30, y: 10, number: 2, signals: [analog(0)] },
    { name: 'GND', x: 20, y: 50, number: 1, signals: [GND()] },
    { name: 'VCC', x: 40, y: 50, number: 3, signals: [VCC()] },
  ];

  static get styles() {
    return [potReadoutStyles, css`
      /* Repère de l'étiquette de lecture (posée hors flux, cf. pot-readout). */
      :host { display: inline-block; position: relative; }
      #rotating {
        transform-origin: ${KNOB_LOCAL.x}px ${KNOB_LOCAL.y}px;
        transform: rotate(var(--knob-angle, 0deg));
      }
      svg { cursor: pointer; }

      .hide-input {
        position: absolute;
        clip: rect(0 0 0 0);
        width: 1px;
        height: 1px;
        margin: -1px;
      }
    `];
  }

  private percentFromMinMax(value: number, min: number, max: number): number {
    return (value - min) / (max - min);
  }

  private mapToMinMax(value: number, min: number, max: number): number {
    return value * (max - min) + min;
  }

  render() {
    const percent = clamp(0, 1, this.percentFromMinMax(this.value, this.min, this.max));
    const knobDeg = (this.endDegree - this.startDegree) * percent + this.startDegree;
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
      <svg
        role="slider"
        width=${BOX.w}
        height=${BOX.h}
        viewBox="0 0 ${BOX.w} ${BOX.h}"
        xmlns="http://www.w3.org/2000/svg"
        style="--knob-angle: ${knobDeg}deg"
      >${unsafeSVG(printCode(drawing, eiaCode(this.ohms)))}</svg>
      ${potReadout(this.simulating, this.value, this.ohms)}
    `;
  }

  firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    this.renderRoot.querySelector('svg')?.addEventListener('pointerdown', this.onPointerDown as EventListener);
  }

  // Changer `ohms` réécrit le code imprimé, donc le dessin entier est reconstruit
  // (unsafeSVG re-analyse la chaîne) : le rotor doit être regroupé à chaque fois,
  // sinon la vis cesse de tourner dès qu'on retouche la valeur nominale.
  updated(changed: PropertyValues): void {
    super.updated(changed);
    this.groupRotor();
  }

  /**
   * Rassemble les pièces du rotor sous un <g id="rotating"> pour n'avoir qu'une
   * rotation à appliquer. Dessin remanié (pièce manquante) : on renonce plutôt
   * que de tourner un morceau isolé — la vis reste alors immobile.
   */
  private groupRotor(): void {
    const root = this.renderRoot.querySelector('svg');
    if (!root || root.querySelector('#rotating')) return;
    const pieces = ROTOR_IDS.map((id) => root.querySelector(`#${id}`));
    if (pieces.some((el) => !el)) return;
    const group = document.createElementNS(SVG_NS, 'g');
    group.id = 'rotating';
    pieces[0]!.parentNode?.insertBefore(group, pieces[0]!);
    for (const piece of pieces) group.appendChild(piece!);
  }

  private onValueChange(event: Event) {
    this.updateValue(parseFloat((event.target as HTMLInputElement).value));
  }

  private onPointerDown = (event: PointerEvent): void => {
    // Seul le clic gauche « nu » tourne la vis : le clic droit (déplacement du
    // composant) et le Ctrl+clic (sélection multiple) doivent remonter au
    // .part__body — sinon impossible de saisir le composant dans l'éditeur.
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

  disconnectedCallback(): void {
    this.onPointerUp();
    super.disconnectedCallback();
  }

  /** Point (unités du viewBox) sous le curseur, via la CTM du <svg>. */
  private toSvgPoint(clientX: number, clientY: number): DOMPointReadOnly | null {
    const svg = this.renderRoot.querySelector('svg') as SVGSVGElement | null;
    const m = svg?.getScreenCTM();
    if (!m) return null;
    return new DOMPointReadOnly(clientX, clientY).matrixTransform(m.inverse());
  }

  private rotateFromEvent(event: PointerEvent): void {
    const p = this.toSvgPoint(event.clientX, event.clientY);
    if (!p) return;

    const x = KNOB_VIEW.x - p.x;
    const y = KNOB_VIEW.y - p.y;
    let deg = Math.round((Math.atan2(y, x) * 180) / Math.PI);
    if (deg < 0) deg += 360;
    deg -= 90;
    if (x > 0 && y <= 0 && deg > 0) deg -= 360;

    deg = clamp(this.startDegree, this.endDegree, deg);
    const percent = this.percentFromMinMax(deg, this.startDegree, this.endDegree);
    this.updateValue(this.mapToMinMax(percent, this.min, this.max));
  }

  private updateValue(value: number) {
    const clamped = clamp(this.min, this.max, value);
    const updated = Math.round(clamped / this.step) * this.step;
    this.value = Math.round(updated * 100) / 100;
    this.dispatchEvent(new InputEvent('input', { detail: this.value }));
  }
}

if (!customElements.get('kablix-pot-rot2')) {
  customElements.define('kablix-pot-rot2', PotRot2Element);
}
