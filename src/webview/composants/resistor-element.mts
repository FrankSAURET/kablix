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
import drawing from './externe/resistor.svg';
import drawingVert from './externe/res-vert.svg';

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

export class ResistorElement extends LitElement {
  declare value: string;
  /** Pose du composant : 'h' couchée (défaut), 'v' debout. */
  declare orientation: ResistorOrientation;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    value: {},
    orientation: { type: String },
  };

  constructor() {
    super();
    this.value = '1000';
    this.orientation = 'h';
  }

  private get skin() {
    return SKINS[this.orientation] ?? SKINS.h;
  }

  // Broches : centre de chaque patte, recalé sur la grille de 10 px (repère du
  // dessin retouché, tel quel — pas de pinScale, cf. catalog.mts).
  get pinInfo(): ElementPin[] {
    return this.skin.pins.map((p, i) => ({ name: String(i + 1), x: p.x, y: p.y, signals: [] }));
  }

  static get styles() {
    return css`
      :host {
        display: flex;
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
    const colors = this.bandColorsFor(this.value);
    // ids du dessin nettoyé (cf. SKINS) : anneaux 1, 2 et 3 dans cet ordre.
    this.skin.bands.forEach((sel, i) => {
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
    `;
  }
}

if (!customElements.get('kablix-resistor')) {
  customElements.define('kablix-resistor', ResistorElement);
}
