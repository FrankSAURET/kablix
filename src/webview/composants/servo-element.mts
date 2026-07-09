// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — servo-element.ts.
// Balise <kablix-servo> (ex <wokwi-servo>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs ; le DESSIN (corps + 3 palonniers) vient du fichier
//     RETOUCHABLE ./externe/servo.edit.svg. Ce fichier contient :
//       <g id="body">          le corps du servo,
//       <g id="horn-single|double|cross">  un palonnier par forme (centré sur l'axe),
//       <g id="grid"> / <g id="pins">       des REPÈRES (grille + pastilles) retirés ici.
//   - l'axe (moyeu) est recentré dans la boîte 170×125 → HORN_HUB = (85 ; 62.5).
//   - selon `horn`, seul le bon groupe est gardé et tourné de `angle` autour de l'axe.
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import editDrawing from './externe/servo.edit.svg';

// Axe de rotation (moyeu), centre de la boîte 170×125 — cf. servo.edit.svg.
const HORN_HUB = { x: 85, y: 62.5 };

/**
 * Extrait le groupe `<g id="ID" …> … </g>` complet du SVG retouché, en comptant
 * la profondeur des `<g>`/`</g>` (le corps du servo contient des groupes
 * imbriqués). Retourne le groupe entier (balise ouvrante + contenu + fermeture).
 */
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
      // <g …> ouvrant (pas <g …/> auto-fermant, qui n'imbrique rien).
      depth++;
    }
  }
  return '';
}

// Retire les commentaires XML (ils peuvent contenir des balises `<g …>` de
// documentation qui fausseraient l'extraction des groupes).
const cleanDrawing = editDrawing.replace(/<!--[\s\S]*?-->/g, '');

const BODY = extractGroup(cleanDrawing, 'body');
const HORNS: Record<string, string> = {
  single: extractGroup(cleanDrawing, 'horn-single'),
  double: extractGroup(cleanDrawing, 'horn-double'),
  cross: extractGroup(cleanDrawing, 'horn-cross'),
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
    { name: 'GND', x: 10, y: 60, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'V+', x: 10, y: 70, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'PWM', x: 10, y: 80, signals: [{ type: 'pwm' }] },
  ];

  render() {
    const horn = HORNS[this.horn] ?? HORNS.single;
    return html`
      <svg width="170" height="125" viewBox="0 0 170 125" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(BODY)}
        <g transform=${`rotate(${this.angle ?? 0} ${HORN_HUB.x} ${HORN_HUB.y})`}>
          ${unsafeSVG(horn)}
        </g>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-servo')) {
  customElements.define('kablix-servo', ServoElement);
}
