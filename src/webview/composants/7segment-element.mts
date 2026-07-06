// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — 7segment-element.ts.
// Balise <kablix-7segment> (ex <wokwi-7segment>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/7seg*.svg,
// une par nombre de chiffres — seuls 1/2/4 exposés dans l'inspecteur, cf. catalog.mts ;
// `pins`/`colon`/`background`/`offColor` ne sont pas exposés non plus, dessin figé).
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
      CLN: { x: 130, y: 10 },
      C: { x: 100, y: 80 },
      D: { x: 80, y: 80 },
      E: { x: 70, y: 80 },
      G: { x: 110, y: 80 },
      DP: { x: 90, y: 80 },
      DIG4: { x: 120, y: 80 },
      COM: { x: 130, y: 80 },
    },
  },
};

export class SevenSegmentElement extends LitElement {
  declare color: string;
  declare digits: number;
  declare values: number[];

  static properties = {
    color: {},
    digits: { type: Number },
    values: { type: Array },
  };

  constructor() {
    super();
    this.color = 'red';
    this.digits = 1;
    this.values = [0, 0, 0, 0, 0, 0, 0, 0];
  }

  private get variant(): Variant {
    return VARIANTS[this.digits] ?? VARIANTS[1];
  }

  get pinInfo(): ElementPin[] {
    return Object.entries(this.variant.pins).map(([name, { x, y }]) => ({ name, x, y, signals: [] }));
  }

  private polys: SVGElement[] | null = null;
  private dps: SVGElement[] | null = null;

  update(changed: PropertyValues) {
    if (changed.has('digits')) this.dispatchEvent(new CustomEvent('pininfo-change'));
    super.update(changed);
  }

  updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('digits')) {
      this.polys = null;
      this.dps = null;
    }
    if (!this.polys) {
      this.polys = Array.from(this.renderRoot.querySelectorAll('polygon'));
      this.dps = (Array.from(this.renderRoot.querySelectorAll('circle, ellipse')) as SVGElement[]).filter(
        (e) => !e.closest('defs'),
      );
    }
    const { digits, color, values } = this;
    const polys = this.polys;
    const dps = this.dps!;
    const setSeg = (el: SVGElement, lit: boolean) => {
      const e = el as SVGElement & { dataset: DOMStringMap };
      if (e.dataset.off === undefined) e.dataset.off = el.style.fill || el.getAttribute('fill') || '#444';
      const fill = lit ? color : e.dataset.off;
      el.style.fill = fill;
      // Un stroke de même couleur comble le filet noir d'anti-aliasing
      // visible à la jointure entre deux polygones de segments adjacents.
      el.style.stroke = fill;
    };
    for (let d = 0; d < digits; d++) {
      for (let s = 0; s < 7; s++) {
        const poly = polys[d * 7 + s];
        if (poly) setSeg(poly, !!values[d * 8 + s]);
      }
      if (dps[d]) setSeg(dps[d], !!values[d * 8 + 7]);
    }
  }

  render() {
    const { drawing, w, h } = this.variant;
    return html`
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-7segment')) {
  customElements.define('kablix-7segment', SevenSegmentElement);
}
