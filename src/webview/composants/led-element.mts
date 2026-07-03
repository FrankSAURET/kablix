// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — led-element.ts.
// Balise <kablix-led> (ex <wokwi-led>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/led.svg) ;
//   - A/C recalées sur la grille de 10 px (repère du dessin retouché), le flip
//     échange les 2 pastilles (le dessin retouché reste identique, seul le
//     pinInfo change — restaure un comportement perdu sous l'ancien overlay) ;
//   - halo lumineux (`.light`) piloté nativement via `updated()` : le dessin
//     retouché contient déjà le groupe `#g30` (ellipses `#ellipse28/29/30`)
//     capturé depuis ce même rendu, il suffit de le montrer/masquer et de
//     recolorer/opaciser au lieu de le reconstruire.
import { css, html, LitElement, PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/led.svg';

const lightColors: { [key: string]: string } = {
  red: '#ff8080',
  green: '#80ff80',
  blue: '#8080ff',
  yellow: '#ffff80',
  orange: '#ffcf80',
  white: '#ffffff',
  purple: '#ff80ff',
};

export class LEDElement extends LitElement {
  declare value: boolean;
  declare brightness: number;
  declare color: string;
  declare lightColor: string | null;
  declare label: string;
  declare flip: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    value: {},
    brightness: {},
    color: {},
    lightColor: {},
    label: {},
    flip: { type: Boolean },
  };

  constructor() {
    super();
    this.value = false;
    this.brightness = 1.0;
    this.color = 'red';
    this.lightColor = null;
    this.label = '';
    this.flip = false;
  }

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  get pinInfo(): ElementPin[] {
    const anodeX = this.flip ? 10 : 20;
    const cathodeX = this.flip ? 20 : 10;

    return [
      { name: 'A', x: anodeX, y: 40, signals: [], description: 'Anode' },
      { name: 'C', x: cathodeX, y: 40, signals: [], description: 'Cathode' },
    ];
  }

  static get styles() {
    return css`
      :host {
        display: inline-block;
      }

      .led-container {
        display: flex;
        flex-direction: column;
        width: 30px;
      }

      .led-label {
        font-size: 10px;
        text-align: center;
        color: gray;
        position: relative;
        line-height: 1;
        top: -8px;
      }
    `;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('flip')) {
      this.dispatchEvent(new CustomEvent('pininfo-change'));
    }
    super.update(changedProperties);
  }

  updated(changed: PropertyValues) {
    super.updated(changed);
    const root = this.renderRoot;
    const light = root.querySelector('#g30') as SVGGElement | null;
    if (!light) return;

    const { color, lightColor } = this;
    const lightColorActual = lightColor || lightColors[color?.toLowerCase()] || color;
    const opacity = this.brightness ? 0.3 + this.brightness * 0.7 : 0;
    const lightOn = this.value && this.brightness > Number.EPSILON;

    light.style.display = lightOn ? '' : 'none';
    root.querySelector('#ellipse28')?.setAttribute('fill', lightColorActual);
    (root.querySelector('#ellipse28') as SVGElement | null)?.style.setProperty(
      'opacity',
      String(opacity),
    );
    (root.querySelector('#ellipse30') as SVGElement | null)?.style.setProperty(
      'opacity',
      String(opacity),
    );
  }

  renderSVG() {
    const { flip } = this;
    const xScale = flip ? -1 : 1;

    return html`
      <svg
        width="30"
        height="50"
        transform="scale(${xScale} 1)"
        viewBox="0 0 30 50"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }

  render() {
    return html`
      <div class="led-container">
        ${this.renderSVG()}
        <span class="led-label">${this.label}</span>
      </div>
    `;
  }
}

if (!customElements.get('kablix-led')) {
  customElements.define('kablix-led', LEDElement);
}
