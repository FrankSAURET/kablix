// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — slide-switch-element.ts.
// Balise <kablix-slide-switch> (ex <wokwi-slide-switch>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/slide-switch.svg,
// broches recalées sur la grille de 10 px ; plus de pinScale, cf. catalog.mts). L'animation du
// curseur reste 100 % CSS (id="handle" préservé dans le dessin retouché).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/slide-switch.svg';

export class SlideSwitchElement extends LitElement {
  declare value: number;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    value: {},
  };

  constructor() {
    super();
    this.value = 0;
  }

  readonly pinInfo: ElementPin[] = [
    { name: '1', number: 1, x: 10, y: 40, signals: [] },
    { name: '2', number: 2, x: 20, y: 40, signals: [] },
    { name: '3', number: 3, x: 30, y: 40, signals: [] },
  ];

  static get styles() {
    return css`
      .hide-input {
        position: absolute;
        clip: rect(0 0 0 0);
        width: 1px;
        height: 1px;
        margin: -1px;
      }
      svg #handle {
        transition: transform 0.2s linear;
      }
      input:checked + svg #handle {
        transform: translate(2px, 0);
      }
      input:focus + svg #handle {
        stroke-width: 0.4px;
        stroke: #8080ff;
      }
    `;
  }

  private onClick() {
    const inputEl = this.shadowRoot?.querySelector<HTMLInputElement>('.hide-input');
    if (inputEl) {
      inputEl.checked = !inputEl.checked;
      this.onValueChange(inputEl);
      inputEl?.focus();
    }
  }

  private onValueChange(target: HTMLInputElement) {
    this.value = target.checked ? 1 : 0;
    this.dispatchEvent(new InputEvent('input', { detail: this.value }));
  }

  renderSVG() {
    return html`<svg
      width="40"
      height="45"
      viewBox="0 0 40 45"
      xmlns="http://www.w3.org/2000/svg"
      @click="${this.onClick}"
    >
      ${unsafeSVG(drawing)}
    </svg>`;
  }

  render() {
    const { value } = this;
    return html`
      <input
        tabindex="0"
        type="checkbox"
        class="hide-input"
        .checked=${value}
        @input="${(e: InputEvent) => this.onValueChange(e.target as HTMLInputElement)}"
      />
      ${this.renderSVG()}
    `;
  }
}

if (!customElements.get('kablix-slide-switch')) {
  customElements.define('kablix-slide-switch', SlideSwitchElement);
}
