// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — arduino-nano-element.ts.
// Balise <kablix-arduino-nano> (ex <wokwi-arduino-nano>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/nano.svg,
// broches recalées sur la grille de 10 px ; plus de pinScale, cf. catalog.mts). Halos LED
// (TX/RX/Power/13) rendus en frères du dessin importé (repère « tel quel », calculé depuis
// les transforms matrix(3.937,...) des groupes LED du dessin) ; filtre #ledFilter défini
// dans le dessin importé, réutilisable ici via url(#ledFilter). Bouton reset : le cercle
// #reset-button du dessin importé sert de cible d'interaction (câblage évènementiel en
// firstUpdated, la liaison déclarative @event= de Lit ne peut pas cibler l'intérieur d'un
// unsafeSVG).
import { css, html, LitElement, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { analog, ElementPin, i2c, spi, usart } from './pin.mjs';
import { SPACE_KEYS } from './utils/keys.mjs';
import drawing from './externe/nano.svg';

export class ArduinoNanoElement extends LitElement {
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

  // Broches recalées sur grille 10 px (surcharges pin-overrides.mts « nano », vérifiées
  // contre une extraction fraîche du dessin retouché) ; signaux électriques inchangés.
  readonly pinInfo: ElementPin[] = [
    { name: '12', x: 30, y: 10, signals: [spi('MISO')] },
    { name: '11', x: 40, y: 10, signals: [spi('MOSI'), { type: 'pwm' }] },
    { name: '10', x: 50, y: 10, signals: [spi('SS'), { type: 'pwm' }] },
    { name: '9', x: 60, y: 10, signals: [{ type: 'pwm' }] },
    { name: '8', x: 70, y: 10, signals: [] },
    { name: '7', x: 80, y: 10, signals: [] },
    { name: '6', x: 90, y: 10, signals: [{ type: 'pwm' }] },
    { name: '5', x: 100, y: 10, signals: [{ type: 'pwm' }] },
    { name: '4', x: 110, y: 10, signals: [] },
    { name: '3', x: 120, y: 10, signals: [{ type: 'pwm' }] },
    { name: '2', x: 130, y: 10, signals: [] },
    { name: 'GND.2', x: 140, y: 10, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'RESET.2', x: 150, y: 10, signals: [] },
    { name: '0', x: 160, y: 10, signals: [usart('TX')] },
    { name: '1', x: 170, y: 10, signals: [usart('RX')] },
    { name: '13', x: 30, y: 70, signals: [spi('SCK')] },
    { name: '3.3V', x: 40, y: 70, signals: [{ type: 'power', signal: 'VCC', voltage: 3.3 }] },
    { name: 'AREF', x: 50, y: 70, signals: [] },
    { name: 'A0', x: 60, y: 70, signals: [analog(0)] },
    { name: 'A1', x: 70, y: 70, signals: [analog(1)] },
    { name: 'A2', x: 80, y: 70, signals: [analog(2)] },
    { name: 'A3', x: 90, y: 70, signals: [analog(3)] },
    { name: 'A4', x: 100, y: 70, signals: [analog(4), i2c('SDA')] },
    { name: 'A5', x: 110, y: 70, signals: [analog(5), i2c('SCL')] },
    { name: 'A6', x: 120, y: 70, signals: [analog(6)] },
    { name: 'A7', x: 130, y: 70, signals: [analog(7)] },
    { name: '5V', x: 140, y: 70, signals: [{ type: 'power', signal: 'VCC', voltage: 5 }] },
    { name: 'RESET', x: 150, y: 70, signals: [] },
    { name: 'GND.1', x: 160, y: 70, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'VIN', x: 170, y: 70, signals: [{ type: 'power', signal: 'VCC' }] },

    { name: '12.2', x: 180, y: 50, signals: [spi('MISO')], noBreadboard: true },
    {
      name: '5V.2',
      x: 170,
      y: 50,
      signals: [{ type: 'power', signal: 'VCC', voltage: 5 }],
      noBreadboard: true,
    },
    { name: '13.2', x: 180, y: 40, signals: [spi('SCK')], noBreadboard: true },
    {
      name: '11.2',
      x: 170,
      y: 40,
      signals: [spi('MOSI'), { type: 'pwm' }],
      noBreadboard: true,
    },
    { name: 'RESET.3', x: 180, y: 30, signals: [], noBreadboard: true },
    {
      name: 'GND.3',
      x: 170,
      y: 30,
      signals: [{ type: 'power', signal: 'GND' }],
      noBreadboard: true,
    },
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
      <svg width="190" height="80" viewBox="0 0 190 80" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        ${ledTX &&
        svg`<circle cx="129.165" cy="26.850" r="5.118" fill="#ff8080" filter="url(#ledFilter)" />`}
        ${ledRX &&
        svg`<circle cx="129.165" cy="34.724" r="5.118" fill="#80ff80" filter="url(#ledFilter)" />`}
        ${ledPower &&
        svg`<circle cx="129.165" cy="42.598" r="5.118" fill="#80ff80" filter="url(#ledFilter)" />`}
        ${led13 &&
        svg`<circle cx="129.165" cy="50.472" r="5.118" fill="#ffff80" filter="url(#ledFilter)" />`}
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

if (!customElements.get('kablix-arduino-nano')) {
  customElements.define('kablix-arduino-nano', ArduinoNanoElement);
}
