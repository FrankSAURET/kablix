// Composant maison <kablix-transistor> : transistor bipolaire, dessin de Frank
// (Composants.svg, groupe de BOÎTIER « to92 » → ./externe/to92.svg ; symboles
// internes « NPN1 » / « PNP1 »). Premier composant à boîtier PARTAGÉ : le dessin
// externe ne dit rien du modèle, c'est le composant qui écrit sa référence
// dessus (attribut `text`, une ligne par saut de ligne) et qui choisit son
// symbole interne (`symbol`).
//
// Broches : trois pastilles au pas de 10 px. Deux nommages, selon `named` :
//   - référence figée (PN2222A) : « E », « B », « C » aux places dites par les
//     attributs e/b/c ;
//   - prototype générique : « 1 », « 2 », « 3 » — l'affectation des électrodes
//     reste dans e/b/c, que l'utilisateur règle dans l'inspecteur.
// Le nom des broches ne change donc PAS quand on change l'affectation d'un
// prototype : aucun fil ne devient orphelin.
//
// Simulation : voir transistorState (model.mts) — on vise la SATURATION, le
// courant de collecteur étant plafonné à Gain × Ib.
import { css, html, svg, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import to92 from './externe/to92.svg';

/**
 * Habillage par boîtier : dessin, boîte, pattes et calage de l'inscription.
 * `tx`/`cy` = centre de la FACE PLATE (mesurée sur le dessin : 23,53→36,01 en x,
 * 9,89→21,04 en y pour le TO-92), `tw` la largeur utilisable, `font` la taille
 * maximale de l'inscription (elle rétrécit si la ligne est trop longue).
 */
const PACKAGES = {
  to92: { svg: to92, w: 50, h: 50, pinY: 40, pinX: [20, 30, 40], tx: 29.77, cy: 15.47, tw: 11.8, font: 3.8, fill: '#e6e6e6' },
} as const;

export type TransistorPackage = keyof typeof PACKAGES;

/** Électrodes, dans l'ordre d'affichage des propriétés. */
export const ELECTRODES = ['e', 'b', 'c'] as const;
export type Electrode = (typeof ELECTRODES)[number];

export class TransistorElement extends LitElement {
  /** Boîtier (dessin externe). D'autres viendront s'ajouter au fil des dessins. */
  declare pkg: TransistorPackage;
  /** Symbole du schéma interne : 'npn' ou 'pnp'. */
  declare symbol: 'npn' | 'pnp';
  /** Inscription du boîtier, une ligne par saut de ligne (« PN\n2222A »). */
  declare text: string;
  /** Numéro de patte (1..3) de chaque électrode. */
  declare e: number;
  declare b: number;
  declare c: number;
  /** Gain en courant (β = Ic/Ib). */
  declare gain: number;
  /** Tension collecteur-émetteur maximale (V) — informative. */
  declare vcemax: number;
  /** Courant de collecteur maximal (A) — informatif. */
  declare icmax: number;
  /** Broches nommées d'après les électrodes (référence figée) plutôt que 1/2/3. */
  declare named: boolean;

  static properties = {
    pkg: { type: String },
    symbol: { type: String },
    text: { type: String },
    e: { type: Number },
    b: { type: Number },
    c: { type: Number },
    gain: { type: Number },
    vcemax: { type: Number },
    icmax: { type: Number },
    named: { type: Boolean },
  };

  constructor() {
    super();
    this.pkg = 'to92';
    this.symbol = 'npn';
    this.text = '';
    this.e = 1;
    this.b = 2;
    this.c = 3;
    this.gain = 100;
    this.vcemax = 40;
    this.icmax = 0.6;
    this.named = false;
  }

  private get skin() {
    return PACKAGES[this.pkg] ?? PACKAGES.to92;
  }

  /** Nom de chaque patte, de la première à la dernière. */
  private get pinNames(): string[] {
    const out = ['1', '2', '3'];
    if (!this.named) return out;
    for (const el of ELECTRODES) {
      const n = Number(this[el]);
      if (n >= 1 && n <= 3) out[n - 1] = el.toUpperCase();
    }
    return out;
  }

  get pinInfo(): ElementPin[] {
    const s = this.skin;
    return this.pinNames.map((name, i) => ({ name, x: s.pinX[i], y: s.pinY, signals: [] }));
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      text { font-family: 'OCR A Std', 'Consolas', monospace; text-anchor: middle; pointer-events: none; }
    `;
  }

  render() {
    const s = this.skin;
    // Inscription centrée sur la face plate : une ligne par saut de ligne, le
    // bloc reste centré quel que soit leur nombre. Une ligne trop longue pour
    // la face fait rétrécir TOUTE l'inscription (monospace : ~0,62 em/caractère)
    // — une référence à rallonge ne déborde donc jamais du boîtier.
    const lines = String(this.text ?? '').split('\n').filter((l) => l.length > 0);
    const longest = Math.max(1, ...lines.map((l) => l.length));
    const font = Math.min(s.font, s.tw / (0.62 * longest));
    const step = font * 1.2;
    // Le centre du bloc est une LIGNE DE BASE : décalé d'un tiers de la hauteur
    // de capitale sous le centre géométrique de la face.
    const top = s.cy + 0.36 * font - ((lines.length - 1) * step) / 2;
    return html`
      <svg width=${s.w} height=${s.h} viewBox="0 0 ${s.w} ${s.h}" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(s.svg)}
        ${lines.map(
          // Balise `svg` OBLIGATOIRE ici : un fragment enfant écrit avec `html`
          // serait analysé hors du contexte SVG — le <text> naîtrait dans le
          // namespace HTML et resterait invisible (inscription disparue).
          (line, i) => svg`<text x=${s.tx} y=${top + i * step} font-size=${font} fill=${s.fill}>${line}</text>`
        )}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-transistor')) {
  customElements.define('kablix-transistor', TransistorElement);
}
