// Composant maison <kablix-ic> : circuit intégré en boîtier DIL, dessin de Frank
// (Composants.svg, groupe de BOÎTIER « ic14 » → ./externe/ic14.svg ; symboles
// internes « CD4081 », « 7400 »… → ../diagram/ics.mts).
//
// Deuxième composant à boîtier PARTAGÉ après le transistor, et le plus partagé de
// tous : UN dessin de DIL-14 sert aux onze références (et à toutes celles qui
// viendront). Le dessin ne dit donc rien du modèle — c'est le composant qui écrit
// sa référence dessus (attribut `text`) et qui nomme ses pattes (`pinnames`).
//
// Broches : 14 pastilles au pas de 10 px, numérotées comme un vrai boîtier DIL —
// patte 1 en bas à gauche (côté encoche), 1→7 vers la droite, 8→14 en haut de
// DROITE à gauche. Leur NOM vient de `pinnames` (14 noms séparés par des
// virgules, dans cet ordre) : c'est le schéma interne qui le donne, et il change
// d'une référence à l'autre — le 7402 sort sa porte 1 sur la patte 1 là où le
// 7400 y entre. Changer de référence recâble donc vraiment le brochage : c'est
// le propre d'un circuit intégré, contrairement au transistor dont les pattes
// gardent toujours les mêmes noms.
//
// Simulation : voir logicGateStates (model.mts) — les portes sont combinatoires
// et le boîtier ne fonctionne que dans la plage d'alimentation de sa famille.
import { css, html, svg, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { boumOverlay } from './utils/boum.mjs';
import ic14 from './externe/ic14.svg';

/**
 * Habillage par boîtier : dessin, boîte, disposition des pattes et calage de
 * l'inscription. `cx`/`cy` = centre du corps (mesuré sur le dessin : 5→75 en x,
 * 12,71→36,62 en y pour le DIL-14), `tw` la largeur utilisable, `font` la taille
 * maximale de l'inscription (elle rétrécit si la ligne est trop longue).
 */
export const IC_PACKAGES = {
  ic14: { svg: ic14, w: 80, h: 50, pins: 14, x0: 10, dx: 10, topY: 10, botY: 40, cx: 40, cy: 24.67, tw: 62, font: 7, fill: '#e6e6e6' },
} as const;

/** Libellé de chaque boîtier (inspecteur). */
export const IC_PACKAGE_LABELS: Record<keyof typeof IC_PACKAGES, string> = { ic14: 'DIL-14' };

export type IcPackage = keyof typeof IC_PACKAGES;

/**
 * Position de la patte n° `n` (1..pins) d'un boîtier DIL : la première moitié en
 * bas, de gauche à droite, la seconde en haut, de droite à gauche.
 */
export function icPinXY(pkg: keyof typeof IC_PACKAGES, n: number): { x: number; y: number } {
  const s = IC_PACKAGES[pkg];
  const half = s.pins / 2;
  return n <= half
    ? { x: s.x0 + (n - 1) * s.dx, y: s.botY }
    : { x: s.x0 + (s.pins - n) * s.dx, y: s.topY };
}

export class LogicIcElement extends LitElement {
  /** Boîtier (dessin externe). D'autres viendront (DIL-16, DIL-18 sont dessinés). */
  declare pkg: IcPackage;
  /** Inscription du boîtier, une ligne par saut de ligne (« CD4081 »). */
  declare text: string;
  /** Noms des 14 pattes, dans l'ordre 1..14, séparés par des virgules. */
  declare pinnames: string;
  /** Boîtier DÉTRUIT : alimenté au-delà de la tension que sa famille supporte. */
  declare burned: boolean;

  static properties = {
    pkg: { type: String },
    text: { type: String },
    pinnames: { type: String },
    burned: { type: Boolean },
  };

  constructor() {
    super();
    this.pkg = 'ic14';
    this.text = '';
    this.pinnames = '';
    this.burned = false;
  }

  private get skin() {
    return IC_PACKAGES[this.pkg] ?? IC_PACKAGES.ic14;
  }

  /**
   * Nom de chaque patte, de la première à la dernière. À défaut de `pinnames`
   * (projet plus ancien que le composant, import), les pattes portent leur
   * NUMÉRO : aucun fil ne devient orphelin, on lit simplement « 3 » au lieu de
   * « Q1 ».
   */
  private get pinNames(): string[] {
    const s = this.skin;
    const given = String(this.pinnames ?? '').split(',').map((n) => n.trim());
    return Array.from({ length: s.pins }, (_, i) => given[i] || String(i + 1));
  }

  get pinInfo(): ElementPin[] {
    return this.pinNames.map((name, i) => ({ name, ...icPinXY(this.pkg, i + 1), signals: [] }));
  }

  static get styles() {
    return css`
      /* position: relative — requis par boumOverlay (span centré en absolu). */
      :host { display: inline-block; position: relative; }
      text { font-family: 'OCR A Std', 'Consolas', monospace; text-anchor: middle; pointer-events: none; }
    `;
  }

  render() {
    const s = this.skin;
    // Inscription centrée sur le corps : une ligne par saut de ligne, le bloc
    // reste centré quel que soit leur nombre. Une ligne trop longue pour le corps
    // fait rétrécir TOUTE l'inscription (monospace : ~0,62 em/caractère) — une
    // référence à rallonge ne déborde donc jamais du boîtier.
    const lines = String(this.text ?? '').split('\n').filter((l) => l.length > 0);
    const longest = Math.max(1, ...lines.map((l) => l.length));
    const font = Math.min(s.font, s.tw / (0.62 * longest));
    const step = font * 1.2;
    // Le centre du bloc est une LIGNE DE BASE : décalé d'un tiers de la hauteur
    // de capitale sous le centre géométrique du corps.
    const top = s.cy + 0.36 * font - ((lines.length - 1) * step) / 2;
    return html`
      <svg width=${s.w} height=${s.h} viewBox="0 0 ${s.w} ${s.h}" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(s.svg)}
        ${lines.map(
          // Balise `svg` OBLIGATOIRE ici : un fragment enfant écrit avec `html`
          // serait analysé hors du contexte SVG — le <text> naîtrait dans le
          // namespace HTML et resterait invisible (inscription disparue).
          (line, i) => svg`<text x=${s.cx} y=${top + i * step} font-size=${font} fill=${s.fill}>${line}</text>`
        )}
      </svg>
      ${this.burned ? boumOverlay(60) : null}
    `;
  }
}

if (!customElements.get('kablix-ic')) {
  customElements.define('kablix-ic', LogicIcElement);
}
