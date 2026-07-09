// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — servo-element.ts.
// Balise <kablix-servo> (ex <wokwi-servo>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : le DESSIN vient du fichier RETOUCHABLE ./externe/servo.edit.svg.
//   - <g id="body">    : corps du servo.
//   - <g id="horn-arm"> : UN SEUL bras (vers le haut). Le composant le DUPLIQUE en
//                         1 / 2 / 4 branches selon `horn` (single/double/cross).
//   - <g id="axis">    : marqueur (croix magenta) = centre de rotation, lu ici.
//   - <g id="grid"> / <g id="pins"> : repères, ignorés au rendu.
//   Le viewBox (taille de feuille) est repris tel quel du fichier : Frank peut
//   l'ajuster pour laisser juste la place à la rotation complète du bras.
import { html, LitElement, svg } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import editDrawing from './externe/servo.edit.svg';

// Retire les commentaires XML (peuvent contenir des balises `<g …>` de doc).
const cleanDrawing = editDrawing.replace(/<!--[\s\S]*?-->/g, '');

/** Extrait le groupe `<g id="ID" …> … </g>` complet (gère l'imbrication et les
 *  `<g …/>` auto-fermants). */
function extractGroup(svgText: string, id: string): string {
  const open = new RegExp(`<g\\s+id="${id}"[^>]*>`);
  const m = open.exec(svgText);
  if (!m) return '';
  const start = m.index;
  let depth = 0;
  const tag = /<g\b[^>]*?(\/?)>|<\/g\s*>/g;
  tag.lastIndex = start;
  let t: RegExpExecArray | null;
  while ((t = tag.exec(svgText))) {
    if (t[0].startsWith('</g')) {
      depth--;
      if (depth === 0) return svgText.slice(start, t.index + t[0].length);
    } else if (t[1] !== '/') {
      depth++;
    }
  }
  return '';
}

/** viewBox du fichier (largeur/hauteur de la feuille retouchée). */
function readViewBox(svgText: string): { x: number; y: number; w: number; h: number } {
  const m = /viewBox="([\d.\-\s]+)"/.exec(svgText);
  const [x, y, w, h] = (m ? m[1].trim().split(/[\s,]+/).map(Number) : [0, 0, 180, 180]);
  return { x, y, w, h };
}

/** Centre de l'axe : centre géométrique du marqueur `axis` (moyenne des cx). */
function readAxis(svgText: string, fallback: { x: number; y: number }): { x: number; y: number } {
  const g = extractGroup(svgText, 'axis');
  const cxs = [...g.matchAll(/cx="([\d.\-]+)"/g)].map((m) => Number(m[1]));
  const cys = [...g.matchAll(/cy="([\d.\-]+)"/g)].map((m) => Number(m[1]));
  if (!cxs.length || !cys.length) return fallback;
  return { x: cxs[0], y: cys[0] };
}

const VB = readViewBox(cleanDrawing);
const BODY = extractGroup(cleanDrawing, 'body');
const ARM = extractGroup(cleanDrawing, 'horn-arm');
const AXIS = readAxis(cleanDrawing, { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 });

/** Nombre de branches par forme de palonnier. */
const HORN_ANGLES: Record<string, number[]> = {
  single: [0],
  double: [0, 180],
  cross: [0, 90, 180, 270],
};

export class ServoElement extends LitElement {
  declare angle: number;
  declare horn: 'single' | 'double' | 'cross';
  declare hornColor: string;

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
  // À recaler sur les pastilles pin-* de servo.edit.svg après retouche.
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 20, y: 80, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'V+', x: 20, y: 90, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'PWM', x: 20, y: 100, signals: [{ type: 'pwm' }] },
  ];

  render() {
    const branches = HORN_ANGLES[this.horn] ?? HORN_ANGLES.single;
    // Bras dupliqué à chaque angle de branche, l'ensemble tourné de `angle`, tout
    // autour de l'axe (le bras source pointe vers le haut = branche à 0°).
    const arms = branches.map(
      (b) => svg`<g transform=${`rotate(${b} ${AXIS.x} ${AXIS.y})`}>${unsafeSVG(ARM)}</g>`,
    );
    return html`
      <svg
        width=${VB.w}
        height=${VB.h}
        viewBox=${`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(BODY)}
        <g transform=${`rotate(${this.angle ?? 0} ${AXIS.x} ${AXIS.y})`}>${arms}</g>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-servo')) {
  customElements.define('kablix-servo', ServoElement);
}
