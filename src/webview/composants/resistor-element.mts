// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — resistor-element.ts.
// Balise <kablix-resistor> (ex <wokwi-resistor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/resistor.svg,
// broches recalées sur la grille de 10 px) ; anneaux de couleur mis à jour par updated()
// (le dessin importé est statique, l'ancien template liait ${bandColor} directement).
//
// DEUX POSES, un seul élément (attribut `orientation`) :
//   h → couchée, corps horizontal, pattes de part et d'autre (80×20) ;
//   v → DEBOUT, corps vertical et une patte repliée par-dessus (dessin de Frank
//       « res-vert » ; schéma interne « res-vert-interne »). Les anneaux y
//       sont courbés : debout, la résistance est vue de biais, ses bandes sont
//       des ellipses (déformation portée par la planche, pas par le code).
// Les broches gardent leurs noms ('1' et '2') dans les deux cas : changer la pose
// ne casse aucun fil.
//
// DEUX RÉSISTANCES DE PUISSANCE en plus (attribut `rtype`, dessins RP1/RP2 de la
// planche) : boîtier aluminium à ailettes (rp1) et boîtier céramique (rp2). Elles
// n'ont pas d'anneaux de couleur — la valeur et la puissance sont ÉCRITES dessus,
// en code d'atelier : « 10W 4R7 » pour 4,7 Ω sous 10 W, « 10W 4K7 » pour 4,7 kΩ.
// Le rp2 porte un Ω à la place du R (« 10W 4Ω7 »), c'est ainsi qu'il est marqué.
// Leur corps est trop massif pour être posé debout : la pose ne les concerne pas
// (l'inspecteur masque la propriété, cf. catalog.mts).
//
// RACCOURCI de la pose debout : le dessin source mesure 40×70 (53 px de haut à
// l'écran), soit deux fois l'encombrement d'une résistance couchée pour la même
// pièce. Il est ÉCRASÉ DE MOITIÉ en hauteur — `vb` (repère du dessin) découplé
// de `w`/`h` (boîte réelle), le svg étant étiré par `preserveAspectRatio="none"`.
// C'est exactement ce que fait la perspective quand on regarde une résistance
// debout de plus haut : les anneaux elliptiques s'aplatissent, la patte repliée
// se raccourcit, la largeur ne bouge pas. Le facteur 1/2 est choisi pour que les
// broches restent sur la grille de 10 px (y = 60 → 30).
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { boumOverlay } from './utils/boum.mjs';
import drawing from './externe/resistor.svg';
import drawingVert from './externe/res-vert.svg';
import drawingRp1 from './externe/rp1.svg';
import drawingRp2 from './externe/rp2.svg';

const bandColors: { [key: number]: string } = {
  [-2]: '#C3C7C0', // Silver
  [-1]: '#F1D863', // Gold
  0: '#000000', // Black
  1: '#8F4814', // Brown
  2: '#FB0000', // Red
  3: '#FC9700', // Orange
  4: '#FCF800', // Yellow
  5: '#00B800', // Green
  6: '#0000FF', // Blue
  7: '#A803D6', // Violet
  8: '#808080', // Gray
  9: '#FCFCFC', // White
};

/**
 * Habillage par pose : dessin, repère du dessin (`vb` = son viewBox), boîte
 * réelle (`w`/`h`), position des pattes et ids des trois anneaux à recolorer
 * (le 4e, doré, est fixe = tolérance). Les deux dessins ont été nettoyés
 * séparément, d'où des ids d'anneaux différents.
 *
 * `vb` ≠ `w`/`h` = le dessin est ÉTIRÉ dans la boîte (cf. en-tête) : c'est le cas
 * de la pose debout, écrasée de moitié en hauteur.
 */
const SKINS = {
  h: {
    svg: drawing,
    vb: { w: 80.164619, h: 20 },
    w: 80.164619,
    h: 20,
    pins: [{ x: 10, y: 10 }, { x: 70, y: 10 }],
    bands: ['#rect19', '#path19', '#path20'],
  },
  v: {
    svg: drawingVert,
    vb: { w: 40, h: 70 },
    w: 40,
    h: 35,
    pins: [{ x: 10, y: 30 }, { x: 30, y: 30 }],
    bands: ['#rect19', '#path19-0', '#path20-1'],
  },
} as const;

export type ResistorOrientation = keyof typeof SKINS;

/**
 * Habillage des deux résistances de PUISSANCE (dessins RP1/RP2 de la planche).
 * Pas d'anneaux : `mark` désigne le <text> où écrire l'inscription, et `ohmSign`
 * dit si l'unité s'y écrit R (rp1) ou Ω (rp2) — c'est le seul écart entre les
 * deux marquages.
 */
const POWER_SKINS = {
  rp1: {
    svg: drawingRp1,
    vb: { w: 220, h: 100.0001 },
    w: 220,
    h: 100,
    pins: [{ x: 10, y: 50 }, { x: 210, y: 50 }],
    mark: '#text27-6',
    ohmSign: false,
  },
  rp2: {
    svg: drawingRp2,
    vb: { w: 130, h: 60 },
    w: 130,
    h: 60,
    pins: [{ x: 10, y: 30 }, { x: 120, y: 30 }],
    mark: '#text11',
    ohmSign: true,
  },
} as const;

export type ResistorType = 'film' | keyof typeof POWER_SKINS;

/**
 * Taille écran de l'explosion, par boîtier (px). L'overlay Boum est dimensionné
 * en pixels fixes, pas à l'échelle du dessin : une 10 W qui grille se voit donc
 * plus large qu'une ¼ W, à l'image de son corps.
 */
const BOUM_PX = { film: 40, rp1: 70, rp2: 55 } as const;

/**
 * Valeur en CODE D'ATELIER : le symbole de l'unité prend la place de la virgule.
 * 4,7 Ω → « 4R7 », 4,7 kΩ → « 4K7 », 470 Ω → « 470R », 1 MΩ → « 1M ».
 * `ohmSign` remplace le R par un Ω (marquage du boîtier céramique).
 */
export function resistorCode(ohms: number, ohmSign = false): string {
  if (!Number.isFinite(ohms) || ohms <= 0) return '';
  const unites: Array<[number, string]> = [
    [1e6, 'M'],
    [1e3, 'K'],
    [1, ohmSign ? 'Ω' : 'R'],
  ];
  const [echelle, lettre] = unites.find(([e]) => ohms >= e) ?? unites[2];
  // Trois chiffres significatifs au plus, comme sur une vraie inscription.
  const n = ohms / echelle;
  const texte = n >= 100 ? String(Math.round(n)) : n.toFixed(n >= 10 ? 1 : 2);
  const [ent, dec = ''] = texte.split('.');
  const reste = dec.replace(/0+$/, '');
  return reste ? `${ent}${lettre}${reste}` : `${ent}${lettre}`;
}

/** Puissance telle qu'elle est inscrite sur le boîtier : « 10W », « 0.5W ». */
function powerCode(watts: number): string {
  if (!Number.isFinite(watts) || watts <= 0) return '';
  return `${watts >= 1 ? Math.round(watts * 10) / 10 : watts}W`;
}

export class ResistorElement extends LitElement {
  declare value: string;
  /** Pose du composant : 'h' couchée (défaut), 'v' debout. Sans objet sur une
   *  résistance de puissance, qui n'a qu'un dessin. */
  declare orientation: ResistorOrientation;
  /** Boîtier : 'film' (la petite résistance à anneaux), 'rp1' ou 'rp2'. */
  declare rtype: ResistorType;
  /** Puissance que le boîtier dissipe sans mourir (W) — inscrite sur rp1/rp2. */
  declare power: string;
  /** Résistance grillée (puissance dissipée au-delà du boîtier) : montre l'explosion. */
  declare burned: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    value: {},
    orientation: { type: String },
    rtype: { type: String },
    power: { type: String },
    burned: { type: Boolean },
  };

  constructor() {
    super();
    this.value = '1000';
    this.orientation = 'h';
    this.rtype = 'film';
    this.power = '0.25';
    this.burned = false;
  }

  /** Habillage de puissance en cours, ou null pour la résistance à anneaux. */
  private get powerSkin() {
    return POWER_SKINS[this.rtype as keyof typeof POWER_SKINS] ?? null;
  }

  private get skin() {
    return this.powerSkin ?? SKINS[this.orientation] ?? SKINS.h;
  }

  // Broches : centre de chaque patte, recalé sur la grille de 10 px (repère du
  // dessin retouché, tel quel — pas de pinScale, cf. catalog.mts).
  get pinInfo(): ElementPin[] {
    return this.skin.pins.map((p, i) => ({ name: String(i + 1), x: p.x, y: p.y, signals: [] }));
  }

  static get styles() {
    return css`
      /* position: relative — requis par boumOverlay (span centré en absolu). */
      :host {
        display: flex;
        position: relative;
      }
    `;
  }

  private breakValue(value: number) {
    const exponent =
      value >= 1e10
        ? 9
        : value >= 1e9
          ? 8
          : value >= 1e8
            ? 7
            : value >= 1e7
              ? 6
              : value >= 1e6
                ? 5
                : value >= 1e5
                  ? 4
                  : value >= 1e4
                    ? 3
                    : value >= 1e3
                      ? 2
                      : value >= 1e2
                        ? 1
                        : value >= 1e1
                          ? 0
                          : value >= 1
                            ? -1
                            : -2;
    const base = Math.round(value / 10 ** exponent);
    if (value === 0) {
      return [0, 0];
    }
    return [Math.round(base % 100), exponent];
  }

  /** Couleurs des 3 anneaux d'après `value` (mêmes règles que le rendu d'origine). */
  private bandColorsFor(value: string): [string, string, string] {
    const numValue = parseFloat(value);
    const [base, exponent] = this.breakValue(numValue);
    return [bandColors[Math.floor(base / 10)], bandColors[base % 10], bandColors[exponent]];
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    const puissance = this.powerSkin;
    if (puissance) {
      // Rien à colorier : l'inscription du boîtier PORTE la valeur. Le <text>
      // vient de la planche de Frank, on n'en change que le contenu.
      const cible = this.renderRoot.querySelector(puissance.mark);
      if (cible) {
        const p = powerCode(Number(this.power));
        const r = resistorCode(Number(this.value), puissance.ohmSign);
        cible.textContent = [p, r].filter(Boolean).join(' ');
      }
      return;
    }
    const colors = this.bandColorsFor(this.value);
    // ids du dessin nettoyé (cf. SKINS) : anneaux 1, 2 et 3 dans cet ordre.
    (SKINS[this.orientation] ?? SKINS.h).bands.forEach((sel, i) => {
      this.renderRoot.querySelector(sel)?.setAttribute('fill', colors[i]);
    });
  }

  render() {
    const s = this.skin;
    // `preserveAspectRatio="none"` : le dessin remplit la boîte sans garder son
    // ratio — sans lui, la pose debout serait rétrécie des DEUX côtés (et centrée
    // sur du vide) au lieu d'être écrasée en hauteur seule. Sans effet sur la
    // pose couchée, dont la boîte est celle du dessin.
    return html`
      <svg
        width=${s.w}
        height=${s.h}
        viewBox="0 0 ${s.vb.w} ${s.vb.h}"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(s.svg)}
      </svg>
      ${this.burned ? boumOverlay(BOUM_PX[this.rtype] ?? BOUM_PX.film) : null}
    `;
  }
}

if (!customElements.get('kablix-resistor')) {
  customElements.define('kablix-resistor', ResistorElement);
}
