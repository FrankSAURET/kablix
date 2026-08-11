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
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { boumOverlay } from './utils/boum.mjs';
import { packageText } from './utils/package-text.mjs';
import to92 from './externe/to92.svg';
import to220 from './externe/to220.svg';

/**
 * Habillage par boîtier : dessin, boîte, pattes et calage de l'inscription.
 * `tx`/`cy` = centre de la FACE PLATE (mesurée sur le dessin : 13,53→26,01 en x,
 * 9,89→21,04 en y pour le TO-92 ; 11,49→48,49 et 39,14→61,36 pour le TO-220),
 * `tw` la largeur utilisable, `font` la taille maximale de l'inscription (elle
 * rétrécit si la ligne est trop longue).
 */
export const PACKAGES = {
  to92: { svg: to92, w: 40, h: 50, pinY: 40, pinX: [10, 20, 30], tx: 19.77, cy: 15.47, tw: 11.8, font: 3.8, fill: '#e6e6e6' },
  // TO-220 : boîtier de puissance à semelle, face avant noire beaucoup plus
  // large — une référence entière y tient sur une seule ligne.
  to220: { svg: to220, w: 60, h: 90, pinY: 80, pinX: [20, 30, 40], tx: 30, cy: 50.25, tw: 32, font: 5.5, fill: '#e6e6e6' },
} as const;

/** Libellé de chaque boîtier (créateur de composants). */
export const PACKAGE_LABELS: Record<keyof typeof PACKAGES, string> = { to92: 'TO-92', to220: 'TO-220' };

export type TransistorPackage = keyof typeof PACKAGES;

/** Électrodes d'un bipolaire, dans l'ordre d'affichage des propriétés. */
export const ELECTRODES = ['e', 'b', 'c'] as const;
export type Electrode = (typeof ELECTRODES)[number];

/** Électrodes d'un MOSFET : grille, drain, source (la grille ne consomme rien). */
export const MOS_ELECTRODES = ['g', 'd', 's'] as const;
export type MosElectrode = (typeof MOS_ELECTRODES)[number];

/** Un MOSFET porte G/D/S là où un bipolaire porte E/B/C. */
export const isMosSymbol = (symbol: string): boolean => symbol === 'nmos';

export class TransistorElement extends LitElement {
  /** Boîtier (dessin externe). D'autres viendront s'ajouter au fil des dessins. */
  declare pkg: TransistorPackage;
  /** Famille : 'npn', 'pnp', 'darlington-npn', 'darlington-pnp', 'nmos'. */
  declare symbol: string;
  /** Inscription du boîtier, une ligne par saut de ligne (« PN\n2222A »). */
  declare text: string;
  /** Numéro de patte (1..3) de chaque électrode — bipolaire. */
  declare e: number;
  declare b: number;
  declare c: number;
  /** Idem pour un MOSFET : grille, drain, source. */
  declare g: number;
  declare d: number;
  declare s: number;
  /** Gain en courant (β = Ic/Ib). */
  declare gain: number;
  /** Tension collecteur-émetteur maximale (V) — informative. */
  declare vcemax: number;
  /** Courant de collecteur maximal (A) — informatif. */
  declare icmax: number;
  /** Broches nommées d'après les électrodes (référence figée) plutôt que 1/2/3. */
  declare named: boolean;
  /** Transistor DÉTRUIT : commande d'une charge inductive (moteur, bobine de
   *  relais) sans diode de roue libre — la surtension de coupure l'a percé. */
  declare burned: boolean;

  static properties = {
    pkg: { type: String },
    symbol: { type: String },
    text: { type: String },
    e: { type: Number },
    b: { type: Number },
    c: { type: Number },
    g: { type: Number },
    d: { type: Number },
    s: { type: Number },
    gain: { type: Number },
    vcemax: { type: Number },
    icmax: { type: Number },
    named: { type: Boolean },
    burned: { type: Boolean },
  };

  constructor() {
    super();
    this.pkg = 'to92';
    this.symbol = 'npn';
    this.text = '';
    this.e = 1;
    this.b = 2;
    this.c = 3;
    this.g = 1;
    this.d = 2;
    this.s = 3;
    this.gain = 100;
    this.vcemax = 40;
    this.icmax = 0.6;
    this.named = false;
    this.burned = false;
  }

  private get skin() {
    return PACKAGES[this.pkg] ?? PACKAGES.to92;
  }

  /**
   * Nom de chaque patte, de la première à la dernière. Un MOSFET porte G/D/S,
   * un bipolaire E/B/C : ce sont deux jeux d'attributs distincts, pour qu'un
   * changement de famille ne fasse pas lire un brochage pour l'autre.
   */
  private get pinNames(): string[] {
    const out = ['1', '2', '3'];
    if (!this.named) return out;
    const roles: readonly string[] = isMosSymbol(this.symbol) ? MOS_ELECTRODES : ELECTRODES;
    for (const el of roles) {
      const n = Number((this as unknown as Record<string, unknown>)[el]);
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
      /* position: relative — requis par boumOverlay (span centré en absolu). */
      :host { display: inline-block; position: relative; }
      text { font-family: 'OCR A Std', 'Consolas', monospace; text-anchor: middle; pointer-events: none; }
    `;
  }

  render() {
    const s = this.skin;
    return html`
      <svg width=${s.w} height=${s.h} viewBox="0 0 ${s.w} ${s.h}" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(s.svg)}
        ${packageText(this.text, s)}
      </svg>
      ${this.burned ? boumOverlay(40) : null}
    `;
  }
}

if (!customElements.get('kablix-transistor')) {
  customElements.define('kablix-transistor', TransistorElement);
}
