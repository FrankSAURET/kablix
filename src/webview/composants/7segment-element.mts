// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — 7segment-element.ts.
// Balise <kablix-7segment> (ex <wokwi-7segment>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/7seg*.svg,
// une par nombre de chiffres — seuls 1/2/4 exposés dans l'inspecteur, cf. catalog.mts ;
// `pins`/`background`/`offColor` ne sont pas exposés, dessin figé). `colon` (mode
// horloge 88:88) n'est proposé QUE pour le 4 chiffres : masque les DP au profit de
// 2 points centraux qui s'allument avec n'importe quel dp.
// Broches recalées sur la grille de 10 px (pas de broche POWER/GND dédiée : les pins
// communs COM/DIGn font office de retour). Segments pilotés nativement via `updated()` :
// les 7 `polygon` (+ 1 `circle`/`ellipse` DP) par chiffre, dans l'ordre A,B,C,D,E,F,G,DP,
// déjà présents dans le dessin importé (même ordre DOM que l'ancien rendu procédural) —
// couleur éteinte mémorisée au premier passage (comme l'ancien `reflectSevenSeg`).
import { html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing1 from './externe/7seg.svg';
import drawing2 from './externe/7seg-2dig.svg';
import drawing4 from './externe/7seg-4dig.svg';
import { boumOverlay } from './utils/boum.mjs';

interface Variant {
  drawing: string;
  w: number;
  h: number;
  pins: Record<string, { x: number; y: number }>;
}

const VARIANTS: Record<number, Variant> = {
  1: {
    drawing: drawing1,
    w: 59.994762,
    h: 90,
    pins: {
      'COM.2': { x: 30, y: 10 },
      A: { x: 40, y: 10 },
      B: { x: 50, y: 10 },
      F: { x: 20, y: 10 },
      G: { x: 10, y: 10 },
      'COM.1': { x: 30, y: 80 },
      C: { x: 40, y: 80 },
      D: { x: 20, y: 80 },
      E: { x: 10, y: 80 },
      DP: { x: 50, y: 80 },
    },
  },
  2: {
    drawing: drawing2,
    w: 100.37129,
    h: 85.806129,
    pins: {
      DIG1: { x: 50, y: 10 },
      DIG2: { x: 60, y: 10 },
      A: { x: 30, y: 10 },
      B: { x: 40, y: 10 },
      F: { x: 70, y: 10 },
      C: { x: 30, y: 80 },
      D: { x: 60, y: 80 },
      E: { x: 50, y: 80 },
      G: { x: 70, y: 80 },
      DP: { x: 40, y: 80 },
    },
  },
  4: {
    drawing: drawing4,
    w: 200,
    h: 90,
    pins: {
      A: { x: 80, y: 10 },
      B: { x: 120, y: 10 },
      F: { x: 90, y: 10 },
      DIG1: { x: 70, y: 10 },
      DIG2: { x: 100, y: 10 },
      DIG3: { x: 110, y: 10 },
      C: { x: 100, y: 80 },
      D: { x: 80, y: 80 },
      E: { x: 70, y: 80 },
      G: { x: 110, y: 80 },
      DP: { x: 90, y: 80 },
      DIG4: { x: 120, y: 80 },
    },
  },
};

export class SevenSegmentElement extends LitElement {
  declare color: string;
  declare digits: number;
  declare values: number[];
  declare simulating: boolean;
  declare burned: boolean;
  // Mode « horloge » : n'a de sens que sur l'afficheur 4 chiffres (cf. catalog.mts).
  // Actif → les 4 DP disparaissent, remplacés par 2 points centraux (88:88) qui
  // s'allument dès qu'UN dp est piloté (peu importe lequel : cathode ou anode commune).
  declare colon: string;

  static properties = {
    color: {},
    digits: { type: Number },
    values: { type: Array },
    simulating: { type: Boolean },
    burned: { type: Boolean },
    colon: {},
  };

  constructor() {
    super();
    this.color = 'red';
    this.digits = 1;
    this.values = [0, 0, 0, 0, 0, 0, 0, 0];
    this.simulating = false;
    this.burned = false;
    this.colon = '';
  }

  private get variant(): Variant {
    return VARIANTS[this.digits] ?? VARIANTS[1];
  }

  get pinInfo(): ElementPin[] {
    return Object.entries(this.variant.pins).map(([name, { x, y }]) => ({ name, x, y, signals: [] }));
  }

  private polys: SVGElement[] | null = null;
  private dps: SVGElement[] | null = null;
  private colonGroup: SVGElement | null = null;
  private colonDots: SVGElement[] | null = null;

  update(changed: PropertyValues) {
    if (changed.has('digits')) this.dispatchEvent(new CustomEvent('pininfo-change'));
    super.update(changed);
  }

  updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('digits')) {
      this.polys = null;
      this.dps = null;
      this.colonGroup = null;
      this.colonDots = null;
    }
    if (!this.polys) {
      this.polys = Array.from(this.renderRoot.querySelectorAll('polygon'));
      this.dps = (Array.from(this.renderRoot.querySelectorAll('circle, ellipse')) as SVGElement[]).filter(
        (e) => !e.closest('defs') && !e.closest('#colon-4dig'),
      );
      // Groupe des 2 points d'horloge (présent seulement dans le dessin 4 chiffres).
      this.colonGroup = this.renderRoot.querySelector('#colon-4dig');
      this.colonDots = this.colonGroup
        ? (Array.from(this.colonGroup.querySelectorAll('circle')) as SVGElement[])
        : [];
    }
    const { digits, color, values, simulating } = this;
    const polys = this.polys;
    const dps = this.dps!;
    const setSeg = (el: SVGElement, level: number) => {
      const e = el as SVGElement & { dataset: DOMStringMap };
      // Deux couleurs « éteint » mémorisées au premier passage : le gris clair
      // d'ÉDITION (style inline du dessin) et le gris sombre réaliste porté par
      // l'attribut fill (#444444) — utilisé pendant la simulation (attribut
      // `simulating` posé par l'éditeur) : un segment éteint y est à peine
      // visible, comme sur un vrai afficheur.
      if (e.dataset.off === undefined) e.dataset.off = el.style.fill || el.getAttribute('fill') || '#444';
      if (e.dataset.offSim === undefined) e.dataset.offSim = el.getAttribute('fill') || '#444';
      const off = simulating ? e.dataset.offSim : e.dataset.off;
      // Niveau fractionnaire (résistance série trop forte) : couleur allumée
      // atténuée vers la couleur éteinte (color-mix), plein à partir de 1.
      const fill =
        level >= 0.999
          ? color
          : level <= 0.001
            ? off
            : `color-mix(in srgb, ${color} ${Math.round(level * 100)}%, ${off})`;
      el.style.fill = fill;
      // Contour de segment retiré (Frank) : les segments sont pleins, sans liseré.
      // Un très fin stroke de la même couleur comble seulement le filet
      // d'anti-aliasing entre segments adjacents, sans épaissir le tracé.
      el.style.stroke = fill;
      el.style.strokeWidth = '0.05';
    };
    // Horloge : uniquement sur le 4 chiffres. Les DP laissent la place à 2 points
    // centraux qui s'allument dès qu'un dp (n'importe lequel) est piloté.
    const clockMode = digits === 4 && this.colon === 'true';
    for (let d = 0; d < digits; d++) {
      for (let s = 0; s < 7; s++) {
        const poly = polys[d * 7 + s];
        if (poly) setSeg(poly, Number(values[d * 8 + s]) || 0);
      }
      const dpLevel = Number(values[d * 8 + 7]) || 0;
      if (dps[d]) {
        // En mode horloge les DP sont masqués (remplacés par le colon central).
        dps[d].style.display = clockMode ? 'none' : '';
        if (!clockMode) setSeg(dps[d], dpLevel);
      }
    }
    if (this.colonGroup) {
      this.colonGroup.style.display = clockMode ? '' : 'none';
      if (clockMode && this.colonDots) {
        // Les 2 points suivent le dp le plus fort de tout l'afficheur.
        let level = 0;
        for (let d = 0; d < digits; d++) level = Math.max(level, Number(values[d * 8 + 7]) || 0);
        for (const dot of this.colonDots) setSeg(dot, level);
      }
    }
  }

  render() {
    const { drawing, w, h } = this.variant;
    return html`
      <span style="position:relative;display:inline-block;line-height:0">
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
          ${unsafeSVG(drawing)}
        </svg>
        ${this.burned ? boumOverlay() : null}
      </span>
    `;
  }
}

if (!customElements.get('kablix-7segment')) {
  customElements.define('kablix-7segment', SevenSegmentElement);
}
