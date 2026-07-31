// Composant maison <kablix-capacitor> : condensateur, dessins de Frank
// (Composants.svg, groupes « condo-np », « condo.p-1 », « condo-p-2 » ; schémas
// internes « condo-np-interne » et « condo-p-interne », partagé par les deux
// polarisés). UN élément, trois habillages choisis par l'attribut `ctype` :
//   np   → film plastique (non polarisé, 30×50) ;
//   p    → tantale goutte (polarisé, 30×70) ;
//   chem → électrochimique aluminium (30×70).
// Les BROCHES gardent les mêmes noms ('1' et '2') dans les trois cas : changer
// le type dans l'inspecteur ne casse donc aucun fil. La polarité est affichée
// par l'éditeur (pinDisplayName : '1' → « − », '2' → « + » pour p et chem).
// Simulation : voir capacitorNodes (model.mts) — charge/décharge exponentielle.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawingNp from './externe/condo-np.svg';
import drawingP from './externe/condo-p-1.svg';
import drawingChem from './externe/condo-p-2.svg';

/** Habillage par type : dessin, boîte, y des pattes et calage de la valeur. */
const SKINS = {
  np: { svg: drawingNp, w: 30, h: 50, pinY: 40, tx: 15.5, ty: 13, fill: '#ffffff' },
  p: { svg: drawingP, w: 30, h: 70, pinY: 60, tx: 16, ty: 22, fill: '#3a2400' },
  chem: { svg: drawingChem, w: 30, h: 70, pinY: 60, tx: 16, ty: 30, fill: '#ffffff' },
} as const;

export type CapacitorType = keyof typeof SKINS;

/** Formate une capacité en farads pour l'inscription du corps (1e-5 → « 10µ »). */
export function formatFarads(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const units: Array<[number, string]> = [
    [1, 'F'], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  for (const [factor, suffix] of units) {
    // Marge de 1e-9 relative : 1e-5 / 1e-6 vaut 9.999999999 en flottant.
    if (value >= factor * (1 - 1e-9)) return `${parseFloat((value / factor).toPrecision(3))}${suffix}`;
  }
  return `${parseFloat((value / 1e-12).toPrecision(3))}p`;
}

export class CapacitorElement extends LitElement {
  declare ctype: CapacitorType;
  /** Valeur nominale, en FARADS (l'inspecteur accepte les suffixes m µ n p). */
  declare value: number;
  /** Tension maximale admissible (V) — informative sur le dessin. */
  declare vmax: number;

  static properties = {
    ctype: { type: String },
    value: { type: Number },
    vmax: { type: Number },
  };

  constructor() {
    super();
    this.ctype = 'np';
    this.value = 1e-7;
    this.vmax = 400;
  }

  private get skin() {
    return SKINS[this.ctype] ?? SKINS.np;
  }

  get pinInfo(): ElementPin[] {
    const y = this.skin.pinY;
    return [
      { name: '1', x: 10, y, signals: [] },
      { name: '2', x: 20, y, signals: [] },
    ];
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      text { font: 7px/1 sans-serif; text-anchor: middle; pointer-events: none; }
    `;
  }

  render() {
    const s = this.skin;
    return html`
      <svg width=${s.w} height=${s.h} viewBox="0 0 ${s.w} ${s.h}" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(s.svg)}
        <text x=${s.tx} y=${s.ty} fill=${s.fill}>${formatFarads(this.value)}</text>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-capacitor')) {
  customElements.define('kablix-capacitor', CapacitorElement);
}
