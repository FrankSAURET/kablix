// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — analog-joystick-element.ts.
// Balise <kablix-analog-joystick> (ex <wokwi-analog-joystick>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/joystick.svg), où les 4
//     flèches sont désormais toujours visibles (simplification du dessin retouché,
//     plus de survol requis) ;
//   - `#knob` (bouton central) est injecté via `unsafeSVG` donc hors du template
//     Lit : son déplacement (`moveKnob`) et la mise en surbrillance de l'indicateur
//     SEL (`#circle46`) sont appliqués nativement dans `updated()`, même logique
//     que l'ancien `attachInteractiveFeedback` de drawing-feedback.mts (déplacement
//     du knob validé en production sur ce même dessin retouché depuis v2026.6.83) ;
//   - zones de clic (haut/bas/gauche/droite/SEL) : un groupe `<g>` invisible,
//     rendu directement par Lit (donc éligible aux bindings `@mousedown`), calé sur
//     le dessin retouché via le transform composé `translate(g65) translate(g64)
//     matrix(knob)` — reproduit exactement la position/taille des zones de clic
//     d'origine (repère local de l'ancien dessin 27.2×31.8, non retouché) sans
//     recalcul de géométrie au runtime ;
//   - manche ANALOGIQUE : glisser le knob au clic maintenu donne des valeurs
//     continues −1..1 sur les deux axes (course = pleine déflexion du dessin,
//     bornée au cercle unité) ; au relâchement le manche revient au centre,
//     sauf Ctrl/Cmd tenu = position verrouillée. Les flèches (clic ou clavier)
//     gardent la déflexion tout-ou-rien d'origine.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, ElementPin, GND, VCC } from './pin.mjs';
import { SPACE_KEYS } from './utils/keys.mjs';
import drawing from './externe/joystick.svg';

const W = 120;
const H = 134.5677;
const OVERLAY_TRANSFORM =
  'translate(-10,-10) translate(-4.3800011,-0.63000488) matrix(3.937,0,0,3.937,20,20)';

export class AnalogJoystickElement extends LitElement {
  declare xValue: number;
  declare yValue: number;
  declare pressed: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    xValue: { type: Number },
    yValue: { type: Number },
    pressed: {},
  };

  constructor() {
    super();
    this.xValue = 0;
    this.yValue = 0;
    this.pressed = false;
  }

  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 40, y: 130, signals: [VCC()] },
    { name: 'VERT', x: 50, y: 130, signals: [analog(0)] },
    { name: 'HORZ', x: 60, y: 130, signals: [analog(1)] },
    { name: 'SEL', x: 70, y: 130, signals: [] },
    { name: 'GND', x: 80, y: 130, signals: [GND()] },
  ];

  private knobEl: SVGElement | null = null;
  private knobBase = '';
  private selEl: SVGElement | null = null;
  private selOff = '#aaa';
  private dragCenter: { x: number; y: number } | null = null;

  static get styles() {
    return css`
      /* Pas d'anneau de focus du navigateur : le knob reçoit le focus pour le
         clavier et l'anneau dessinait un gros carré sur le composant actif. */
      *:focus {
        outline: none;
      }

      #knob {
        cursor: grab;
      }
    `;
  }

  /** Repère `#knob`/`#circle46` du dessin retouché et branche clavier + glisse (une fois). */
  private setup(): void {
    if (this.knobEl) return;
    const svgEl = this.renderRoot.querySelector('svg');
    if (!svgEl) return;
    this.knobEl = svgEl.querySelector('#knob');
    if (this.knobEl) {
      this.knobBase = this.knobEl.getAttribute('transform') ?? '';
      this.knobEl.addEventListener('keydown', (e) => this.keydown(e as KeyboardEvent));
      this.knobEl.addEventListener('keyup', (e) => this.keyup(e as KeyboardEvent));
      this.knobEl.setAttribute('tabindex', '0');
      this.knobEl.addEventListener('pointerdown', this.onKnobDown as EventListener);
    }
    this.selEl = svgEl.querySelector('#circle46');
    if (this.selEl) {
      this.selOff = this.selEl.style.fill || this.selEl.getAttribute('fill') || '#aaa';
    }
  }

  /** Facteur d'échelle du knob (matrice du dessin retouché). */
  private knobScale(): number {
    return Number(/matrix\(\s*([-\d.]+)/.exec(this.knobBase)?.[1] ?? 96 / 25.4);
  }

  private moveKnob(): void {
    if (!this.knobEl) return;
    const s = this.knobScale();
    const dx = -2.5 * this.xValue * s;
    const dy = -2.5 * this.yValue * s;
    this.knobEl.setAttribute('transform', `translate(${dx} ${dy}) ${this.knobBase}`);
  }

  /** Point (unités du viewBox racine) sous le curseur, via la CTM du <svg>. */
  private toSvgPoint(clientX: number, clientY: number): DOMPointReadOnly | null {
    const svg = this.renderRoot.querySelector('svg') as SVGSVGElement | null;
    const m = svg?.getScreenCTM();
    if (!m) return null;
    return new DOMPointReadOnly(clientX, clientY).matrixTransform(m.inverse());
  }

  // --- Glisse analogique du manche ------------------------------------------
  private onKnobDown = (e: PointerEvent): void => {
    if (e.button !== 0) return; // clic droit = déplacement du composant (éditeur)
    const p = this.toSvgPoint(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    const r = 2.5 * this.knobScale(); // pleine déflexion (px du viewBox racine)
    // Centre de repos déduit du point saisi et de la déflexion courante
    // (glisse relative : pas de saut du manche sous le curseur).
    this.dragCenter = { x: p.x + this.xValue * r, y: p.y + this.yValue * r };
    this.knobEl?.focus();
    window.addEventListener('pointermove', this.onKnobMove);
    window.addEventListener('pointerup', this.onKnobUp);
  };

  private onKnobMove = (e: PointerEvent): void => {
    if (!this.dragCenter) return;
    const p = this.toSvgPoint(e.clientX, e.clientY);
    if (!p) return;
    const r = 2.5 * this.knobScale();
    let x = -(p.x - this.dragCenter.x) / r;
    let y = -(p.y - this.dragCenter.y) / r;
    const n = Math.hypot(x, y);
    if (n > 1) {
      x /= n;
      y /= n;
    }
    this.xValue = Math.round(x * 100) / 100;
    this.yValue = Math.round(y * 100) / 100;
    this.valueChanged();
  };

  private onKnobUp = (e: PointerEvent): void => {
    this.dragCenter = null;
    window.removeEventListener('pointermove', this.onKnobMove);
    window.removeEventListener('pointerup', this.onKnobUp);
    // Ctrl/Cmd tenu au relâchement : la position reste verrouillée ;
    // sinon le manche revient au centre (ressort du vrai joystick).
    if (!e.ctrlKey && !e.metaKey) {
      this.xValue = 0;
      this.yValue = 0;
      this.valueChanged();
    }
  };

  updated(changed: PropertyValues): void {
    super.updated(changed);
    this.setup();
    this.moveKnob();
    if (this.selEl) this.selEl.style.fill = this.pressed ? '#fff' : this.selOff;
  }

  render() {
    return html`
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        <g transform="${OVERLAY_TRANSFORM}" fill="none" style="pointer-events:fill;cursor:pointer">
          <rect
            y="8.5"
            x="1"
            height="10"
            width="7"
            @mousedown=${(e: MouseEvent) => this.mousedown(e, 1, 0)}
            @mouseup=${() => this.mouseup(true, false)}
          />
          <rect
            y="1.38"
            x="7.9"
            height="7"
            width="10"
            @mousedown=${(e: MouseEvent) => this.mousedown(e, 0, 1)}
            @mouseup=${() => this.mouseup(false, true)}
          />
          <rect
            y="8.5"
            x="18"
            height="10"
            width="7"
            @mousedown=${(e: MouseEvent) => this.mousedown(e, -1, 0)}
            @mouseup=${() => this.mouseup(true, false)}
          />
          <rect
            y="17"
            x="7.9"
            height="7"
            width="10"
            @mousedown=${(e: MouseEvent) => this.mousedown(e, 0, -1)}
            @mouseup=${() => this.mouseup(false, true)}
          />
          <circle
            cx="13.6"
            cy="13.6"
            r="3"
            @mousedown=${(e: MouseEvent) => this.press(e)}
            @mouseup=${() => this.release()}
          />
        </g>
      </svg>
    `;
  }

  private keydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowUp':
        this.yValue = 1;
        this.valueChanged();
        break;
      case 'ArrowDown':
        this.yValue = -1;
        this.valueChanged();
        break;
      case 'ArrowLeft':
        this.xValue = 1;
        this.valueChanged();
        break;
      case 'ArrowRight':
        this.xValue = -1;
        this.valueChanged();
        break;
    }
    if (SPACE_KEYS.includes(e.key)) {
      this.press();
    }
  }

  private keyup(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        this.yValue = 0;
        this.valueChanged();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        this.xValue = 0;
        this.valueChanged();
        break;
    }
    if (SPACE_KEYS.includes(e.key)) {
      this.release();
    }
  }

  private mousedown(e: MouseEvent, dx: number, dy: number) {
    if (dx) {
      this.xValue = dx;
    }
    if (dy) {
      this.yValue = dy;
    }
    this.valueChanged();
    this.knobEl?.focus();
    e.preventDefault(); // Prevents stealing focus
  }

  private mouseup(x: boolean, y: boolean) {
    if (x) {
      this.xValue = 0;
    }
    if (y) {
      this.yValue = 0;
    }
    this.valueChanged();
    this.knobEl?.focus();
  }

  private press(e?: MouseEvent) {
    this.pressed = true;
    this.dispatchEvent(new InputEvent('button-press'));
    this.knobEl?.focus();
    e?.preventDefault(); // Prevents stealing focus
  }

  private release() {
    this.pressed = false;
    this.dispatchEvent(new InputEvent('button-release'));
    this.knobEl?.focus();
  }

  private valueChanged() {
    this.dispatchEvent(new InputEvent('input'));
  }
}

if (!customElements.get('kablix-analog-joystick')) {
  customElements.define('kablix-analog-joystick', AnalogJoystickElement);
}
