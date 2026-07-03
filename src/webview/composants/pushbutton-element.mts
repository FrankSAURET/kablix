// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — pushbutton-element.ts.
// Balise <kablix-pushbutton> (ex <wokwi-pushbutton>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/button.svg) ;
//   - broches recalées sur la grille de 10 px (repère du dessin retouché) ;
//   - couleur du capuchon (dégradés `linearGradient` + cercle plein, mêmes id que
//     le rendu Wokwi d'origine, conservés dans le dessin retouché) et capuchon
//     enfoncé (`.button-active-circle`, masqué au repos) pilotés nativement via
//     `updated()` — même logique que l'ancien `reflectButtonColor`/
//     `attachInteractiveFeedback` de drawing-feedback.mts, portée ici.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { ctrlCmdPressed, SPACE_KEYS } from './utils/keys.mjs';
import drawing from './externe/button.svg';

const W = 90;
const H = 60;

export class PushbuttonElement extends LitElement {
  declare color: string;
  declare pressed: boolean;
  declare label: string;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    color: {},
    pressed: {},
    label: {},
  };

  private sticky = false;

  readonly pinInfo: ElementPin[] = [
    { name: '1.l', x: 10, y: 20, signals: [] },
    { name: '2.l', x: 10, y: 40, signals: [] },
    { name: '1.r', x: 80, y: 20, signals: [] },
    { name: '2.r', x: 80, y: 40, signals: [] },
  ];

  constructor() {
    super();
    this.color = 'red';
    this.pressed = false;
    this.label = '';
  }

  static get styles() {
    return css`
      :host {
        display: inline-flex;
        flex-direction: column;
      }

      button {
        border: none;
        background: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
      }

      .label {
        width: 0;
        min-width: 100%;
        font-size: 12px;
        text-align: center;
        color: gray;
        position: relative;
        line-height: 1;
        top: -2px;
      }
    `;
  }

  private active: SVGElement | null = null;

  updated(changed: PropertyValues): void {
    super.updated(changed);
    if (!this.active) {
      this.active = (this.renderRoot.querySelector('svg') as SVGElement | null)?.querySelector(
        '.button-active-circle'
      ) ?? null;
      if (this.active) this.active.style.display = 'none';
    }
    if (changed.has('color')) this.applyColor();
    if (changed.has('pressed') && this.active) {
      this.active.style.display = this.pressed ? '' : 'none';
    }
  }

  /** Retouche la couleur du capuchon (dégradés + cercle plein), comme le fait le
   * composant Wokwi d'origine à chaque changement de l'attribut `color`. */
  private applyColor(): void {
    const svgEl = this.renderRoot.querySelector('svg');
    if (!svgEl) return;
    for (const g of svgEl.querySelectorAll('linearGradient')) {
      const stops = g.querySelectorAll('stop');
      stops[1]?.setAttribute('stop-color', this.color);
      stops[2]?.setAttribute('stop-color', this.color);
    }
    const cap = this.active?.nextElementSibling;
    if (cap && (cap.tagName === 'circle' || cap.tagName === 'ellipse')) {
      cap.setAttribute('fill', this.color);
    }
  }

  render() {
    const { color, label } = this;
    return html`
      <button
        aria-label="${label} ${color} pushbutton"
        @mousedown=${this.down}
        @mouseup=${this.up}
        @touchstart=${this.down}
        @touchend=${this.up}
        @pointerleave=${this.leave}
        @keydown=${(e: KeyboardEvent) => SPACE_KEYS.includes(e.key) && this.down()}
        @keyup=${(e: KeyboardEvent) => SPACE_KEYS.includes(e.key) && this.up(e)}
      >
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${unsafeSVG(
          drawing
        )}</svg>
      </button>
      <span class="label">${this.label}</span>
    `;
  }

  private down() {
    if (!this.pressed) {
      this.pressed = true;
      this.dispatchEvent(new Event('button-press'));
    }
  }

  private up(e: KeyboardEvent | MouseEvent) {
    if (!this.pressed) {
      return;
    }
    if (ctrlCmdPressed(e)) {
      this.sticky = true;
    } else {
      this.sticky = false;
      this.pressed = false;
      this.dispatchEvent(new Event('button-release'));
    }
  }

  private leave(e: MouseEvent) {
    if (!this.sticky) {
      this.up(e);
    }
  }
}

if (!customElements.get('kablix-pushbutton')) {
  customElements.define('kablix-pushbutton', PushbuttonElement);
}
