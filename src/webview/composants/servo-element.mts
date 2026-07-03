// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — servo-element.ts.
// Balise <kablix-servo> (ex <wokwi-servo>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN remplacé par la version retouchée (./externe/servo.svg) ;
//   - GND/V+/PWM recalées sur la grille de 10 px (repère du dessin retouché) ;
//   - palonnier piloté nativement via `updated()` (couleur + rotation autour
//     du moyeu `circle48/49/50`, cx=114.85249 cy=80.182098) ; le dessin
//     retouché ne fige qu'UNE forme de palonnier (contrairement à l'ancien
//     rendu procédural qui en proposait 3 via `horn`) — comportement déjà
//     perdu sous l'ancien mécanisme d'overlay, non restauré ici.
import { html, LitElement, PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/servo.svg';

const hornHub = { x: 114.85249, y: 80.182098 };

export class ServoElement extends LitElement {
  declare angle: number;
  declare horn: 'single' | 'double' | 'cross';
  declare hornColor: string;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    angle: {},
    horn: {},
    hornColor: {},
  };

  constructor() {
    super();
    this.angle = 0;
    this.horn = 'single';
    this.hornColor = '#ccc';
  }

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 10, y: 60, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'V+', x: 10, y: 70, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'PWM', x: 10, y: 80, signals: [{ type: 'pwm' }] },
  ];

  updated(changed: PropertyValues) {
    super.updated(changed);
    const horn = this.renderRoot.querySelector('path[fill="#cccccc"], path[fill="#ccc"]');
    if (!horn) return;
    horn.setAttribute('fill', this.hornColor);
    horn.setAttribute(
      'transform',
      `translate(${hornHub.x} ${hornHub.y}) rotate(${this.angle ?? 0}) translate(${-hornHub.x} ${-hornHub.y})`,
    );
  }

  render() {
    return html`
      <svg width="170" height="100" viewBox="0 0 170 100" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-servo')) {
  customElements.define('kablix-servo', ServoElement);
}
