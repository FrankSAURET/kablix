// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — arduino-uno-element.ts.
// Balise <kablix-arduino-uno> (ex <wokwi-arduino-uno>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/uno.svg,
// export réaliste type Eagle/KiCad, broches recalées sur la grille de 10 px). Halos LED
// (L/TX/RX/ON) rendus en frères du dessin importé (positions mesurées empiriquement sur
// le dessin retouché, cf. groupes led-0603_N_) ; filtre #ledFilter défini dans le dessin
// importé, réutilisable ici via url(#ledFilter). Bouton reset : le dessin retouché ne
// contient aucun élément visuel dédié pour le reset (juste le texte silkscreen), donc
// on cale un cercle transparent #reset-button (même convention que les autres
// interactifs : « élément transparent calé ») à la position mesurée du bouton physique.
import { css, html, LitElement, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, ElementPin, i2c, spi, usart } from './pin.mjs';
import { SPACE_KEYS } from './utils/keys.mjs';
import drawing from './externe/uno.svg';

export class ArduinoUnoElement extends LitElement {
  declare led13: boolean;
  declare ledRX: boolean;
  declare ledTX: boolean;
  declare ledPower: boolean;
  declare resetPressed: boolean;
  get resetButton(): SVGCircleElement {
    return this.renderRoot.querySelector('#reset-button')!;
  }

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    led13: {},
    ledRX: {},
    ledTX: {},
    ledPower: {},
    resetPressed: {},
  };

  constructor() {
    super();
    this.led13 = false;
    this.ledRX = false;
    this.ledTX = false;
    this.ledPower = false;
    this.resetPressed = false;
  }

  // Broches recalées sur grille 10 px (surcharges pin-overrides.mts « uno », vérifiées
  // contre une extraction fraîche du dessin retouché) ; signaux électriques inchangés.
  readonly pinInfo: ElementPin[] = [
    { name: 'A5.2', x: 100, y: 20, signals: [analog(5), i2c('SCL')] },
    { name: 'A4.2', x: 110, y: 20, signals: [analog(4), i2c('SDA')] },
    { name: 'AREF', x: 120, y: 20, signals: [] },
    { name: 'GND.1', x: 130, y: 20, signals: [{ type: 'power', signal: 'GND' }] },
    { name: '13', x: 140, y: 20, signals: [spi('SCK')] },
    { name: '12', x: 150, y: 20, signals: [spi('MISO')] },
    { name: '11', x: 160, y: 20, signals: [spi('MOSI'), { type: 'pwm' }] },
    { name: '10', x: 170, y: 20, signals: [spi('SS'), { type: 'pwm' }] },
    { name: '9', x: 180, y: 20, signals: [{ type: 'pwm' }] },
    { name: '8', x: 190, y: 20, signals: [] },
    { name: '7', x: 210, y: 20, signals: [] },
    { name: '6', x: 220, y: 20, signals: [{ type: 'pwm' }] },
    { name: '5', x: 230, y: 20, signals: [{ type: 'pwm' }] },
    { name: '4', x: 240, y: 20, signals: [] },
    { name: '3', x: 250, y: 20, signals: [{ type: 'pwm' }] },
    { name: '2', x: 260, y: 20, signals: [] },
    { name: '1', x: 270, y: 20, signals: [usart('TX')] },
    { name: '0', x: 280, y: 20, signals: [usart('RX')] },
    { name: 'IOREF', x: 140, y: 200, signals: [] },
    { name: 'RESET', x: 150, y: 200, signals: [] },
    { name: '3.3V', x: 160, y: 200, signals: [{ type: 'power', signal: 'VCC', voltage: 3.3 }] },
    { name: '5V', x: 170, y: 200, signals: [{ type: 'power', signal: 'VCC', voltage: 5 }] },
    { name: 'GND.2', x: 180, y: 200, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'GND.3', x: 190, y: 200, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'VIN', x: 200, y: 200, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'A0', x: 220, y: 200, signals: [analog(0)] },
    { name: 'A1', x: 230, y: 200, signals: [analog(1)] },
    { name: 'A2', x: 240, y: 200, signals: [analog(2)] },
    { name: 'A3', x: 250, y: 200, signals: [analog(3)] },
    { name: 'A4', x: 260, y: 200, signals: [analog(4), i2c('SDA')] },
    { name: 'A5', x: 270, y: 200, signals: [analog(5), i2c('SCL')] },
  ];

  static get styles() {
    return css`
      circle[tabindex]:hover,
      circle[tabindex]:focus {
        stroke: white;
        outline: none;
      }
    `;
  }

  render() {
    const { ledPower, led13, ledRX, ledTX } = this;
    return html`
      <svg width="300.00001" height="219.99999" viewBox="0 0 300.00001 219.99999" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        ${led13 && svg`<circle cx="134.784" cy="54.571" r="5" fill="#ff8080" filter="url(#ledFilter)" />`}
        ${ledPower && svg`<circle cx="253.855" cy="72.531" r="5" fill="#80ff80" filter="url(#ledFilter)" />`}
        ${ledTX && svg`<circle cx="134.706" cy="72.235" r="5" fill="yellow" filter="url(#ledFilter)" />`}
        ${ledRX && svg`<circle cx="134.707" cy="80.875" r="5" fill="yellow" filter="url(#ledFilter)" />`}
        <circle
          id="reset-button"
          cx="50.640"
          cy="38.232"
          r="6.5"
          fill="transparent"
          tabindex="0"
        />
      </svg>
    `;
  }

  firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    const btn = this.resetButton;
    btn.addEventListener('mousedown', () => this.down());
    btn.addEventListener('touchstart', () => this.down());
    btn.addEventListener('mouseup', () => this.up());
    btn.addEventListener('mouseleave', () => this.leave());
    btn.addEventListener('touchend', () => this.leave());
    btn.addEventListener('keydown', (e) => SPACE_KEYS.includes((e as KeyboardEvent).key) && this.down());
    btn.addEventListener('keyup', (e) => SPACE_KEYS.includes((e as KeyboardEvent).key) && this.up());
  }

  private down() {
    if (this.resetPressed) {
      return;
    }
    this.resetPressed = true;
    this.resetButton.style.stroke = '#333';
    this.dispatchEvent(
      new CustomEvent('button-press', {
        detail: 'reset',
      }),
    );
  }

  private up() {
    if (!this.resetPressed) {
      return;
    }
    this.resetPressed = false;
    this.resetButton.style.stroke = '';
    this.dispatchEvent(
      new CustomEvent('button-release', {
        detail: 'reset',
      }),
    );
  }

  private leave() {
    this.resetButton.blur();
    this.up();
  }
}

if (!customElements.get('kablix-arduino-uno')) {
  customElements.define('kablix-arduino-uno', ArduinoUnoElement);
}
