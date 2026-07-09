// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — servo-element.ts.
// Balise <kablix-servo> (ex <wokwi-servo>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : le DESSIN vient du fichier RETOUCHABLE ./externe/servo.edit.svg.
//   - <g id="body">    : corps du servo.
//   - <g id="horn-single|double|cross"> : les TROIS palonniers, chacun DESSINÉ à
//     la main par Frank (au repos). Le composant affiche celui choisi (`horn`) et
//     le tourne autour de l'axe selon l'angle simulé.
//   - <g id="axis">    : marqueur (croix magenta) = centre de rotation, lu ici.
//   - <g id="grid"> / <g id="pins"> : repères, ignorés au rendu.
//   Le viewBox (taille de feuille) est repris tel quel du fichier : Frank peut
//   l'ajuster librement.
import { html, LitElement } from 'lit';
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

/** Centre de l'axe : cercle du marqueur `axis`, en appliquant le `translate` que
 *  Inkscape pose sur le groupe quand Frank le déplace. */
function readAxis(svgText: string, fallback: { x: number; y: number }): { x: number; y: number } {
  const g = extractGroup(svgText, 'axis');
  const cxm = /cx="([\d.\-]+)"/.exec(g);
  const cym = /cy="([\d.\-]+)"/.exec(g);
  if (!cxm || !cym) return fallback;
  let x = Number(cxm[1]);
  let y = Number(cym[1]);
  // translate(tx[,ty]) éventuel sur <g id="axis" transform="…">.
  const tr = /<g\s+id="axis"[^>]*\btransform="translate\(\s*([\d.\-]+)[ ,]+([\d.\-]+)?\s*\)"/.exec(svgText);
  if (tr) {
    x += Number(tr[1]);
    y += Number(tr[2] ?? 0);
  }
  return { x, y };
}

const VB = readViewBox(cleanDrawing);
const BODY = extractGroup(cleanDrawing, 'body');
// Trois palonniers DESSINÉS à la main par Frank dans le .edit.svg (chacun au
// repos). Le code affiche celui choisi et le tourne autour de l'axe.
const HORNS: Record<string, string> = {
  single: extractGroup(cleanDrawing, 'horn-single'),
  double: extractGroup(cleanDrawing, 'horn-double'),
  cross: extractGroup(cleanDrawing, 'horn-cross'),
};
const AXIS = readAxis(cleanDrawing, { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 });

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
  // Recalé sur les pastilles pin-* de servo.edit.svg (groupe pins translaté par
  // Frank : cx=20 − 9,5 ; cy=80/90/100 − 20,25 ≈ 10,5 ; 60/70/80 → arrondi grille).
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 10, y: 60, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'V+', x: 10, y: 70, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'PWM', x: 10, y: 80, signals: [{ type: 'pwm' }] },
  ];

  render() {
    const horn = HORNS[this.horn] ?? HORNS.single;
    return html`
      <svg
        width=${VB.w}
        height=${VB.h}
        viewBox=${`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(BODY)}
        <g transform=${`rotate(${this.angle ?? 0} ${AXIS.x} ${AXIS.y})`}>${unsafeSVG(horn)}</g>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-servo')) {
  customElements.define('kablix-servo', ServoElement);
}
