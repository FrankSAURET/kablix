// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — buzzer-element.ts.
// Balise <kablix-buzzer> (ex <wokwi-buzzer>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/buzzer.svg) ;
//   - 1/2 recalées sur la grille de 10 px (repère du dessin retouché) ;
//   - taille d'affichage (64x75) conservée à l'identique de l'ancien rendu
//     (17mm x 20mm ≈ 64.25x75.59px) pour que la note de musique flottante
//     (.music-note, animation CSS indépendante du corps du buzzer) reste calée.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/buzzer.svg';

export class BuzzerElement extends LitElement {
  declare hasSignal: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    hasSignal: {},
  };

  constructor() {
    super();
    this.hasSignal = false;
  }

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: '1', x: 20, y: 50, signals: [] },
    { name: '2', x: 30, y: 50, signals: [] },
  ];

  static get styles() {
    return css`
      :host {
        display: inline-block;
      }

      .buzzer-container {
        display: flex;
        flex-direction: column;
        width: 75px;
      }

      .music-note {
        position: relative;
        left: 40px;
        animation-duration: 1.5s;
        animation-name: animate-note;
        animation-iteration-count: infinite;
        animation-timing-function: linear;
        transform: scale(1.5);
        fill: blue;
        offset-path: path(
          'm0 0c-0.9-0.92-1.8-1.8-2.4-2.8-0.56-0.92-0.78-1.8-0.58-2.8 0.2-0.92 0.82-1.8 1.6-2.8 0.81-0.92 1.8-1.8 2.6-2.8 0.81-0.92 1.4-1.8 1.6-2.8 0.2-0.92-0.02-1.8-0.58-2.8-0.56-0.92-1.5-1.8-2.4-2.8'
        );
        offset-rotate: 0deg;
      }

      @keyframes animate-note {
        0% {
          offset-distance: 0%;
          opacity: 0;
        }
        10% {
          offset-distance: 10%;
          opacity: 1;
        }
        75% {
          offset-distance: 75%;
          opacity: 1;
        }
        100% {
          offset-distance: 100%;
          opacity: 0;
        }
      }
    `;
  }

  renderSVG() {
    return html`
      <svg width="64" height="75" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }

  render() {
    const buzzerOn = this.hasSignal;
    return html`
      <div class="buzzer-container">
        <svg
          class="music-note"
          style="visibility: ${buzzerOn ? '' : 'hidden'}"
          xmlns="http://www.w3.org/2000/svg"
          width="8"
          height="8"
          viewBox="0 0 8 8"
        >
          <path
            d="M8 0c-5 0-6 1-6 1v4.09c-.15-.05-.33-.09-.5-.09-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5v-3.97c.73-.23 1.99-.44 4-.5v2.06c-.15-.05-.33-.09-.5-.09-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5v-5.5z"
          />
        </svg>
        ${this.renderSVG()}
      </div>
    `;
  }
}

if (!customElements.get('kablix-buzzer')) {
  customElements.define('kablix-buzzer', BuzzerElement);
}
