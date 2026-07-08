// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — servo-element.ts.
// Balise <kablix-servo> (ex <wokwi-servo>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSIN du CORPS repris de la version retouchée (./externe/servo.svg) ;
//   - GND/V+/PWM recalées sur la grille de 10 px (repère du dessin retouché) ;
//   - PALONNIER dessiné en procédural (3 formes : single/double/cross) tournant
//     autour du moyeu (114.85 ; 80.18). Le bras figé du SVG retouché (path49,
//     un seul galet très long qui débordait la boîte) est RETIRÉ au montage et
//     remplacé par ces palonniers courts — restaure le choix single/double/cross
//     et corrige le débordement (le bras sortait de la zone d'affichage en bas).
//   - boîte agrandie en hauteur (viewBox 0 0 170 125) : le moyeu est bas (y=80),
//     un bras qui tourne descend jusqu'à ~y=118 ; on étend vers le BAS seulement,
//     le haut du repère (donc les broches y=60/70/80) est inchangé.
import { html, LitElement, svg } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/servo.svg';

const hornHub = { x: 114.85249, y: 80.182098 };
// Longueur du bras (rayon depuis le moyeu). 34 px : au repos la pointe monte à
// y≈46 (>0) et à 180° descend à y≈114 (<125) — jamais coupée par la boîte.
const HORN_LEN = 34;

// Retire du dessin retouché l'ancien palonnier figé (path49) : c'est le seul
// tracé fill #cccccc de grande taille ; on cible son id pour ne rien casser d'autre.
const bodyDrawing = drawing.replace(/<path[^>]*\bid="path49"[^>]*><\/path>/, '');

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

  /** Tracé du palonnier (repère du dessin, moyeu à hornHub). `horn` choisit la forme. */
  private renderHorn() {
    const { x: cx, y: cy } = hornHub;
    const L = HORN_LEN;
    const w = 6; // demi-largeur d'un bras
    const rEnd = 5; // rayon de l'embout arrondi
    const hub = 9; // rayon du moyeu central du palonnier
    const color = this.hornColor;
    // Un bras = capsule du moyeu vers l'extérieur (angle a en degrés, 0 = haut).
    const arm = (a: number) => {
      const rad = ((a - 90) * Math.PI) / 180; // 0° → vers le haut
      const ex = cx + L * Math.cos(rad);
      const ey = cy + L * Math.sin(rad);
      return svg`<line x1=${cx} y1=${cy} x2=${ex} y2=${ey}
        stroke=${color} stroke-width=${w * 2} stroke-linecap="round" />
        <circle cx=${ex} cy=${ey} r=${rEnd} fill="#888" />`;
    };
    let arms;
    if (this.horn === 'double') {
      arms = [arm(0), arm(180)];
    } else if (this.horn === 'cross') {
      arms = [arm(0), arm(90), arm(180), arm(270)];
    } else {
      arms = [arm(0)]; // single
    }
    return svg`<g
      transform=${`rotate(${this.angle ?? 0} ${cx} ${cy})`}>
      ${arms}
      <circle cx=${cx} cy=${cy} r=${hub} fill=${color} stroke="#999" stroke-width="0.8" />
      <circle cx=${cx} cy=${cy} r="2" fill="#666" />
    </g>`;
  }

  render() {
    return html`
      <svg width="170" height="125" viewBox="0 0 170 125" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(bodyDrawing)}
        ${this.renderHorn()}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-servo')) {
  customElements.define('kablix-servo', ServoElement);
}
