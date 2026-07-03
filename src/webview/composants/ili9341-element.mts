// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — ili9341-element.ts.
// Balise <kablix-ili9341> (ex <wokwi-ili9341>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/ili9341.svg,
// broches recalées sur la grille de 10 px ; plus de pinScale, cf. catalog.mts). Canvas
// écran calé en pixels CSS EXACTS sur le rect « écran » du dessin (rect60, repère « tel
// quel » = celui du viewBox 200×310) au lieu des décalages approximatifs d'origine.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, spi } from './pin.mjs';
import drawing from './externe/ili9341.svg';

export class ILI9341Element extends LitElement {
  readonly screenWidth = 240;
  readonly screenHeight = 320;
  declare flipHorizontal: boolean;
  declare flipVertical: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    flipHorizontal: {},
    flipVertical: {},
  };

  constructor() {
    super();
    this.flipHorizontal = false;
    this.flipVertical = false;
  }

  // Broches recalées sur grille 10 px (surcharges pin-overrides.mts « ili9341 »,
  // vérifiées contre une extraction fraîche du dessin retouché) ; signaux inchangés.
  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 60, y: 300, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 70, y: 300, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'CS', x: 80, y: 300, signals: [spi('SS')] },
    { name: 'RST', x: 90, y: 300, signals: [] },
    { name: 'D/C', x: 100, y: 300, signals: [] },
    { name: 'MOSI', x: 110, y: 300, signals: [spi('MOSI')] },
    { name: 'SCK', x: 120, y: 300, signals: [spi('SCK')] },
    { name: 'LED', x: 130, y: 300, signals: [] },
    { name: 'MISO', x: 140, y: 300, signals: [spi('MISO')] },
  ];

  static get styles() {
    return css`
      .container {
        position: relative;
        width: 200px;
        height: 310px;
      }

      .container > canvas {
        position: absolute;
        left: 16.023708px;
        top: 27.539915px;
        width: 170.47209px;
        height: 243.7003px;
      }

      .pixelated {
        image-rendering: crisp-edges; /* firefox */
        image-rendering: pixelated; /* chrome/webkit */
      }
    `;
  }

  get canvas() {
    return this.shadowRoot?.querySelector('canvas');
  }

  firstUpdated() {
    this.dispatchEvent(new CustomEvent('canvas-ready'));
  }

  render() {
    const { screenWidth, screenHeight, flipHorizontal, flipVertical } = this;
    const flip = flipHorizontal || flipVertical;
    const scaleX = flipHorizontal ? -1 : 1;
    const scaleY = flipVertical ? -1 : 1;
    const canvasStyle = flip ? `transform: scaleX(${scaleX}) scaleY(${scaleY});` : '';
    return html`
      <div class="container">
        <svg width="200" height="310" viewBox="0 0 200 310" xmlns="http://www.w3.org/2000/svg">
          ${unsafeSVG(drawing)}
        </svg>
        <canvas
          width="${screenWidth}"
          height="${screenHeight}"
          class="pixelated"
          style=${canvasStyle}
        ></canvas>
      </div>
    `;
  }
}

if (!customElements.get('kablix-ili9341')) {
  customElements.define('kablix-ili9341', ILI9341Element);
}
