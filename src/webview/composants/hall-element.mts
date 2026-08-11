// Composant maison <kablix-hall> : capteur à effet Hall à sortie TOUT OU RIEN
// (A3144 et compagnie), dessin de Frank (Composants.svg — boîtier partagé
// « TO92S » → ./externe/TO92S.svg ; symbole interne « hall-interne »).
//
// Boîtier partagé, comme le transistor : le dessin ne dit rien du modèle, c'est
// le composant qui écrit sa référence dessus (attribut `text`, une ligne par
// saut de ligne) et qui range ses trois électrodes (V+, GND, S) sur les pattes
// 1, 2 ou 3 — le brochage change d'une référence à l'autre.
//
// Sortie DRAIN OUVERT : le transistor de sortie ne sait que TIRER À LA MASSE.
// Sans résistance de rappel (celle du µC ou une résistance vers VCC), la sortie
// n'est jamais haute — c'est le moteur qui le vérifie et le signale (hallState,
// model.mts). Le capteur est actif-bas : aimant présent → sortie à 0.
//
// EN SIMULATION : un aimant apparaît à droite du boîtier ; on le glisse à la
// souris pour l'éloigner ou le rapprocher. Sous la distance de déclenchement
// (`trigger`), le capteur commute. Le moteur lit `el.near` en direct (sim.mts).
import { css, html, svg, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import { clamp } from './utils/clamp.mjs';
import { packageText } from './utils/package-text.mjs';
import drawing from './externe/TO92S.svg';

/** Cadre du boîtier TO92S (repère du dessin) et calage de son inscription. */
const BOX = { w: 50, h: 50 };
const FACE = { tx: 29.92, cy: 14.65, tw: 12.3, font: 3.6, fill: '#e6e6e6' };
/** Pattes : trois pastilles au pas de 10 px, sous le boîtier. */
const PIN_X = [20, 30, 40];
const PIN_Y = 40;

/** Course de l'aimant (mm) : collé au boîtier → hors de portée de tout capteur. */
export const MAGNET_MIN = 0;
export const MAGNET_MAX = 25;
/** Bord droit du boîtier : l'aimant est posé `distance` mm plus loin (1 mm = 1 px). */
const BODY_RIGHT = 38;
const MAG_W = 16;
const MAG_H = 10;

export class HallElement extends LitElement {
  /** Inscription du boîtier, une ligne par saut de ligne. */
  declare text: string;
  /** Numéro de patte (1..3) de chaque électrode. */
  declare vplus: number;
  declare gnd: number;
  declare s: number;
  /** Distance de déclenchement (mm) : au-delà, le capteur relâche sa sortie. */
  declare trigger: number;
  /** Distance actuelle de l'aimant (mm), réglée à la souris en simulation. */
  declare distance: number;
  declare simulating: boolean;

  static properties = {
    text: { type: String },
    vplus: { type: Number },
    gnd: { type: Number },
    s: { type: Number },
    trigger: { type: Number },
    distance: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.text = 'Hall';
    this.vplus = 1;
    this.gnd = 2;
    this.s = 3;
    this.trigger = 10;
    this.distance = 20;
    this.simulating = false;
  }

  /** Aimant assez près pour faire commuter le capteur (lu par le moteur). */
  get near(): boolean {
    return this.distance <= this.trigger;
  }

  /**
   * Nom de chaque patte, de la première à la dernière, d'après les numéros
   * donnés par les propriétés d'électrodes. Une patte qu'aucune électrode ne
   * réclame garde son numéro.
   */
  private get pinNames(): string[] {
    const out = ['1', '2', '3'];
    for (const [n, name] of [[this.vplus, 'V+'], [this.gnd, 'GND'], [this.s, 'S']] as const) {
      if (n >= 1 && n <= 3) out[n - 1] = name;
    }
    return out;
  }

  get pinInfo(): ElementPin[] {
    return this.pinNames.map((name, i) => ({
      name,
      x: PIN_X[i],
      y: PIN_Y,
      number: i + 1,
      signals: name === 'V+' ? [VCC()] : name === 'GND' ? [GND()] : [],
    }));
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      /* Le dessin de l'aimant sort du cadre du boîtier (jusqu'à 25 mm à droite) :
         sans overflow visible, le viewBox le couperait à ras des pattes. */
      svg { overflow: visible; }
      text { font-family: 'OCR A Std', 'Consolas', monospace; text-anchor: middle; pointer-events: none; }
      .magnet { cursor: ew-resize; }
    `;
  }

  private dragging = false;
  /** Écart (unités SVG) entre le point saisi et le bord gauche de l'aimant. */
  private grabDelta = 0;

  /** Abscisse locale (unités du viewBox) d'un point écran. */
  private toSvgX(clientX: number, clientY: number): number | null {
    const root = this.renderRoot.querySelector('svg') as SVGSVGElement | null;
    const m = root?.getScreenCTM();
    if (!m) return null;
    return new DOMPointReadOnly(clientX, clientY).matrixTransform(m.inverse()).x;
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Clic droit (déplacement du composant) et Ctrl+clic (sélection multiple) :
    // laisser l'éditeur gérer.
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
    const x = this.toSvgX(e.clientX, e.clientY);
    if (x === null) return;
    e.preventDefault();
    e.stopPropagation();
    this.grabDelta = x - (BODY_RIGHT + this.distance); // glisse relative : pas de saut
    this.dragging = true;
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const x = this.toSvgX(e.clientX, e.clientY);
    if (x === null) return;
    const d = Math.round(clamp(MAGNET_MIN, MAGNET_MAX, x - this.grabDelta - BODY_RIGHT));
    if (d === this.distance) return;
    this.distance = d;
    this.dispatchEvent(new Event('input'));
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  };

  disconnectedCallback(): void {
    this.onPointerUp();
    super.disconnectedCallback();
  }

  /** Aimant droit (N rouge côté capteur, S bleu) + cote de la distance. */
  private magnet() {
    const d = clamp(MAGNET_MIN, MAGNET_MAX, Number(this.distance) || 0);
    const x = BODY_RIGHT + d;
    const top = FACE.cy - MAG_H / 2;
    const on = d <= this.trigger;
    const ink = on ? '#1a8f3c' : '#888';
    return svg`
      <line x1=${BODY_RIGHT} y1=${FACE.cy} x2=${x} y2=${FACE.cy}
            stroke=${ink} stroke-width="0.6" stroke-dasharray=${on ? 'none' : '1.5 1.5'} />
      <!-- Cote au-dessus de l'AIMANT (pas du trait de mesure) : aimant collé au
           boîtier, le trait n'a plus de place pour la porter. -->
      <text x=${x + MAG_W / 2} y=${top - 1.5} font-size="4" fill=${ink}>${Math.round(d)} mm</text>
      <g class="magnet" @pointerdown=${this.onPointerDown}>
        <rect x=${x} y=${top} width=${MAG_W / 2} height=${MAG_H} fill="#d02b2b" />
        <rect x=${x + MAG_W / 2} y=${top} width=${MAG_W / 2} height=${MAG_H} fill="#2b57d0" />
        <rect x=${x} y=${top} width=${MAG_W} height=${MAG_H} fill="none" stroke="#333" stroke-width="0.5" />
        <text x=${x + MAG_W / 4} y=${FACE.cy + 2.4} font-size="6" fill="#fff">N</text>
        <text x=${x + (MAG_W * 3) / 4} y=${FACE.cy + 2.4} font-size="6" fill="#fff">S</text>
      </g>
    `;
  }

  render() {
    return html`
      <svg width=${BOX.w} height=${BOX.h} viewBox="0 0 ${BOX.w} ${BOX.h}" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        ${packageText(this.text, FACE)}
        ${this.simulating ? this.magnet() : null}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-hall')) {
  customElements.define('kablix-hall', HallElement);
}
