// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — arduino-mega-element.ts.
// Balise <kablix-arduino-mega> (ex <wokwi-arduino-mega>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/mega.svg,
// export réaliste type Eagle/KiCad, broches recalées sur la grille de 10 px). Halos LED
// (L/TX/RX/ON) rendus en frères du dessin importé (positions mesurées empiriquement,
// groupes led-body dupliqués en ligne près de chaque étiquette) ; filtre #ledFilter défini
// dans le dessin importé, réutilisable ici via url(#ledFilter). Bouton reset : le dessin
// retouché affiche un vrai capuchon rouge à cet endroit mais sans id exploitable ; on cale
// un cercle transparent #reset-button par-dessus (même convention que les autres
// interactifs : « élément transparent calé »).
import { css, html, LitElement, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, ElementPin, i2c, spi, usart } from './pin.mjs';
import { SPACE_KEYS } from './utils/keys.mjs';
import drawing from './externe/mega.svg';

export class ArduinoMegaElement extends LitElement {
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

  // Broches recalées sur grille 10 px (surcharges pin-overrides.mts « mega », vérifiées
  // contre une extraction fraîche du dessin retouché) ; signaux électriques inchangés.
  readonly pinInfo: ElementPin[] = [
    { name: 'SCL', x: 100, y: 10, signals: [i2c('SCL')] },
    { name: 'SDA', x: 110, y: 10, signals: [i2c('SDA')] },
    { name: 'AREF', x: 120, y: 10, signals: [] },
    { name: 'GND.1', x: 130, y: 10, signals: [{ type: 'power', signal: 'GND' }] },
    { name: '13', x: 140, y: 10, signals: [{ type: 'pwm' }] },
    { name: '12', x: 150, y: 10, signals: [{ type: 'pwm' }] },
    { name: '11', x: 160, y: 10, signals: [{ type: 'pwm' }] },
    { name: '10', x: 170, y: 10, signals: [{ type: 'pwm' }] },
    { name: '9', x: 180, y: 10, signals: [{ type: 'pwm' }] },
    { name: '8', x: 190, y: 10, signals: [{ type: 'pwm' }] },
    { name: '7', x: 210, y: 10, signals: [{ type: 'pwm' }] },
    { name: '6', x: 220, y: 10, signals: [{ type: 'pwm' }] },
    { name: '5', x: 230, y: 10, signals: [{ type: 'pwm' }] },
    { name: '4', x: 240, y: 10, signals: [{ type: 'pwm' }] },
    { name: '3', x: 250, y: 10, signals: [{ type: 'pwm' }] },
    { name: '2', x: 260, y: 10, signals: [{ type: 'pwm' }] },
    { name: '1', x: 270, y: 10, signals: [usart('TX')] },
    { name: '0', x: 280, y: 10, signals: [usart('RX')] },
    { name: '14', x: 300, y: 10, signals: [usart('TX', 3)] },
    { name: '15', x: 310, y: 10, signals: [usart('RX', 3)] },
    { name: '16', x: 320, y: 10, signals: [usart('TX', 2)] },
    { name: '17', x: 330, y: 10, signals: [usart('RX', 2)] },
    { name: '18', x: 340, y: 10, signals: [usart('TX', 1)] },
    { name: '19', x: 350, y: 10, signals: [usart('RX', 1)] },
    { name: '20', x: 360, y: 10, signals: [i2c('SDA')] },
    { name: '21', x: 370, y: 10, signals: [i2c('SCL')] },

    { name: '5V.1', x: 400, y: 10, signals: [{ type: 'power', signal: 'VCC', voltage: 5 }] },
    { name: '5V.2', x: 410, y: 10, signals: [{ type: 'power', signal: 'VCC', voltage: 5 }] },
    { name: '22', x: 400, y: 20, signals: [] },
    { name: '23', x: 410, y: 20, signals: [] },
    { name: '24', x: 400, y: 30, signals: [] },
    { name: '25', x: 410, y: 30, signals: [] },
    { name: '26', x: 400, y: 40, signals: [] },
    { name: '27', x: 410, y: 40, signals: [] },
    { name: '28', x: 400, y: 50, signals: [] },
    { name: '29', x: 410, y: 50, signals: [] },
    { name: '30', x: 400, y: 60, signals: [] },
    { name: '31', x: 410, y: 60, signals: [] },
    { name: '32', x: 400, y: 70, signals: [] },
    { name: '33', x: 410, y: 70, signals: [] },
    { name: '34', x: 400, y: 80, signals: [] },
    { name: '35', x: 410, y: 80, signals: [] },
    { name: '36', x: 400, y: 90, signals: [] },
    { name: '37', x: 410, y: 90, signals: [] },
    { name: '38', x: 400, y: 100, signals: [] },
    { name: '39', x: 410, y: 100, signals: [] },
    { name: '40', x: 400, y: 110, signals: [] },
    { name: '41', x: 410, y: 110, signals: [] },
    { name: '42', x: 400, y: 120, signals: [] },
    { name: '43', x: 410, y: 120, signals: [] },
    { name: '44', x: 400, y: 130, signals: [{ type: 'pwm' }] },
    { name: '45', x: 410, y: 130, signals: [{ type: 'pwm' }] },
    { name: '46', x: 400, y: 140, signals: [{ type: 'pwm' }] },
    { name: '47', x: 410, y: 140, signals: [] },
    { name: '48', x: 400, y: 150, signals: [] },
    { name: '49', x: 410, y: 150, signals: [] },
    { name: '50', x: 400, y: 160, signals: [spi('MISO')] },
    { name: '51', x: 410, y: 160, signals: [spi('MOSI')] },
    { name: '52', x: 400, y: 170, signals: [spi('SCK')] },
    { name: '53', x: 410, y: 170, signals: [] },
    { name: 'GND.4', x: 400, y: 180, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'GND.5', x: 410, y: 180, signals: [{ type: 'power', signal: 'GND' }] },

    { name: 'IOREF', x: 130, y: 200, signals: [] },
    { name: 'RESET', x: 140, y: 200, signals: [] },
    { name: '3.3V', x: 150, y: 200, signals: [{ type: 'power', signal: 'VCC', voltage: 3.3 }] },
    { name: '5V', x: 160, y: 200, signals: [{ type: 'power', signal: 'VCC', voltage: 5 }] },
    { name: 'GND.2', x: 170, y: 200, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'GND.3', x: 180, y: 200, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'VIN', x: 190, y: 200, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'A0', x: 210, y: 200, signals: [analog(0)] },
    { name: 'A1', x: 220, y: 200, signals: [analog(1)] },
    { name: 'A2', x: 230, y: 200, signals: [analog(2)] },
    { name: 'A3', x: 240, y: 200, signals: [analog(3)] },
    { name: 'A4', x: 250, y: 200, signals: [analog(4)] },
    { name: 'A5', x: 260, y: 200, signals: [analog(5)] },
    { name: 'A6', x: 270, y: 200, signals: [analog(6)] },
    { name: 'A7', x: 280, y: 200, signals: [analog(7)] },
    { name: 'A8', x: 300, y: 200, signals: [analog(8)] },
    { name: 'A9', x: 310, y: 200, signals: [analog(9)] },
    { name: 'A10', x: 320, y: 200, signals: [analog(10)] },
    { name: 'A11', x: 330, y: 200, signals: [analog(11)] },
    { name: 'A12', x: 340, y: 200, signals: [analog(12)] },
    { name: 'A13', x: 350, y: 200, signals: [analog(13)] },
    { name: 'A14', x: 360, y: 200, signals: [analog(14)] },
    { name: 'A15', x: 370, y: 200, signals: [analog(15)] },
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
      <svg width="430" height="210" viewBox="0 0 430 210" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        ${led13 && svg`<circle cx="126.77" cy="43.965" r="3" fill="#ff8080" filter="url(#ledFilter)" />`}
        ${ledPower && svg`<circle cx="312.355" cy="64.205" r="3" fill="#80ff80" filter="url(#ledFilter)" />`}
        ${ledTX && svg`<circle cx="133.60" cy="65.17" r="3" fill="yellow" filter="url(#ledFilter)" />`}
        ${ledRX && svg`<circle cx="133.60" cy="73.845" r="3" fill="yellow" filter="url(#ledFilter)" />`}
        <circle
          id="reset-button"
          cx="309.75"
          cy="98.37"
          r="7"
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

if (!customElements.get('kablix-arduino-mega')) {
  customElements.define('kablix-arduino-mega', ArduinoMegaElement);
}
