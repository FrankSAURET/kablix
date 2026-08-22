// Élément visuel maison <kablix-pico-board> : Pico, Pico W, Pico 2, Pico 2 W.
// le catalogue Wokwi ne fournit AUCUN élément Pico → on dessine la carte à partir
// de SVG importés comme texte :
//   - pico.svg / picow.svg   : Pico et Pico W, dessin PAYSAGE (USB à gauche) ;
//     picow.svg est un rendu Fritzing (LED ajoutée en surimpression).
//   - pico2.svg / pico2w.svg : Pico 2 et Pico 2 W, dessin PORTRAIT (USB en haut),
//     tracés d'après les visuels officiels de Raspberry Pi Ltd.
// La variante est choisie par l'attribut `variant` ("pico" par défaut).
//
// Les 40 broches (deux rangées au pas de 10 px) portent les mêmes noms sur les
// quatre cartes — même brochage physique : seule leur DISPOSITION change avec
// l'orientation du dessin. Aucun nom n'est imprimé sur la carte : le brochage
// complet s'affiche à la demande via le bouton ☢ de l'éditeur (poster
// <variante>-pinout). La LED embarquée GP25 (`ledPower`) s'allume en vert.

import picoSvg from './externe/pico.svg';
import picowSvg from './externe/picow.svg';
import pico2Svg from './externe/pico2.svg';
import pico2wSvg from './externe/pico2w.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type PicoVariant = 'pico' | 'picow' | 'pico2' | 'pico2w';

/** Dessin de chaque variante. */
const SVGS: Record<PicoVariant, string> = {
  pico: picoSvg,
  picow: picowSvg,
  pico2: pico2Svg,
  pico2w: pico2wSvg,
};

// Cartes dont le dessin vient du rendu Fritzing : un point vert foncé y est
// dessiné en dur à la place de la LED, à retirer.
const FRITZING: ReadonlySet<PicoVariant> = new Set<PicoVariant>(['picow']);

interface Point {
  x: number;
  y: number;
}

/**
 * Disposition d'une variante : boîte du dessin, position des deux rangées de
 * broches et LED embarquée. L'élément fait exactement la taille de la carte : la
 * boîte de sélection de l'éditeur reste circonscrite au composant.
 */
interface BoardGeom {
  w: number;
  h: number;
  /** Position de la i-ème broche de TOP_NAMES (40 → 21). */
  top: (i: number) => Point;
  /** Position de la i-ème broche de BOTTOM_NAMES (1 → 20). */
  bottom: (i: number) => Point;
  /** LED embarquée : centre et rayon de la pastille pilotée. */
  led: { x: number; y: number; r: number };
  /** Sélecteur de la LED déjà présente dans le dessin, pilotée telle quelle. */
  ledNatif?: string;
}

// Dessin PAYSAGE (Pico, Pico W) : USB à gauche, broches 40→21 en haut et 1→20 en
// bas, gauche→droite, 1er plot à 13,26 px.
const paysage = (ledNatif?: string): BoardGeom => ({
  w: 208.663,
  h: 82.678,
  top: (i) => ({ x: 13.26 + i * 10, y: 6.4 }),
  bottom: (i) => ({ x: 13.26 + i * 10, y: 76.4 }),
  led: { x: 25.9, y: 64.08, r: 2.6 },
  ledNatif,
});

// Dessin PORTRAIT (Pico 2, Pico 2 W) : USB en haut, broches 1→20 à gauche et
// 40→21 à droite, haut→bas, 1er plot à 20 px. Extrait de Composants2D.svg par
// `node scripts/_extract-composants.mjs pico2 pico2w` (cadre calé sur la grille).
const portrait = (led: BoardGeom['led']): BoardGeom => ({
  w: 90,
  h: 220,
  top: (i) => ({ x: 80, y: 20 + i * 10 }),
  bottom: (i) => ({ x: 10, y: 20 + i * 10 }),
  led,
});

const GEOM: Record<PicoVariant, BoardGeom> = {
  pico: paysage('#circle16'), // LED verte du dessin schématique (filtre de halo)
  picow: paysage(),
  // Centres relevés sur le dessin de Frank (la LED y est déjà dessinée éteinte,
  // la pastille pilotée vient par-dessus).
  pico2: portrait({ x: 22.55, y: 33.5, r: 2.2 }),
  pico2w: portrait({ x: 22.08, y: 32.93, r: 2.2 }),
};

// Boîte de dessin de la Pico, exportée comme repli de mesure pour l'éditeur.
export const BOARD_W = GEOM.pico.w;
export const BOARD_H = GEOM.pico.h;

/** Boîte de dessin d'une variante (repli quand la mesure du SVG est impossible). */
export function boardSize(type: string): { w: number; h: number } {
  const g = GEOM[type as PicoVariant] ?? GEOM.pico;
  return { w: g.w, h: g.h };
}

// Noms des broches. TOP_NAMES va de la 40 à la 21, BOTTOM_NAMES de la 1 à la 20.
const BOTTOM_NAMES = [
  'GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7',
  'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15',
];
const TOP_NAMES = [
  'VBUS', 'VSYS', 'GND', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'GND', 'GP27', 'GP26',
  'RUN', 'GP22', 'GND', 'GP21', 'GP20', 'GP19', 'GP18', 'GND', 'GP17', 'GP16',
];

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

/**
 * Construit la liste des broches (coordonnées en pixels dans la boîte de la carte).
 * Les masses sont numérotées GND.1, GND.2… car l'éditeur indexe les pastilles
 * par nom (la simulation ignore de toute façon le nom des masses) : l'ordre
 * d'ajout est le même sur les quatre cartes, les indices aussi. La pastille
 * GP25 (LED interne) est ajoutée sur la LED.
 */
function buildPins(variant: PicoVariant): PinInfo[] {
  const g = GEOM[variant];
  let gnd = 0;
  const pins: PinInfo[] = [];
  const add = (name: string, p: Point): void => {
    pins.push({ name: name === 'GND' ? `GND.${++gnd}` : name, x: p.x, y: p.y, signals: [] });
  };
  TOP_NAMES.forEach((n, i) => add(n, g.top(i)));
  BOTTOM_NAMES.forEach((n, i) => add(n, g.bottom(i)));
  pins.push({ name: 'GP25', x: g.led.x, y: g.led.y, signals: [] });
  return pins;
}

export class PicoBoardElement extends HTMLElement {
  // Recalculé à chaque rendu : la disposition dépend de la variante, et
  // l'attribut n'est posé qu'après la construction de l'élément.
  pinInfo: PinInfo[] = buildPins('pico');

  static get observedAttributes(): string[] {
    return ['variant'];
  }

  private ledEl: SVGElement | null = null;
  private ledValue = false;
  private rendered = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
  }

  attributeChangedCallback(name: string): void {
    if (name === 'variant' && this.rendered) this.render();
  }

  private get variante(): PicoVariant {
    const v = this.getAttribute('variant');
    return v && v in SVGS ? (v as PicoVariant) : 'pico';
  }

  /** Dessin issu de Fritzing : point vert en dur à retirer. */
  private get estFritzing(): boolean {
    return FRITZING.has(this.variante);
  }

  /** (Re)construit le dessin : carte imbriquée + broches + LED. */
  private render(): void {
    const shadow = this.shadowRoot;
    if (!shadow) return;
    shadow.replaceChildren();
    this.rendered = true;
    const geom = GEOM[this.variante];
    this.pinInfo = buildPins(this.variante);

    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(geom.w));
    svg.setAttribute('height', String(geom.h));
    svg.setAttribute('viewBox', `0 0 ${geom.w} ${geom.h}`);

    // Carte imbriquée : son viewBox propre est mis à l'échelle pour remplir la
    // boîte de la carte.
    // DOMParser (image/svg+xml) → parsing SVG fidèle (viewBox, dégradés, espaces
    // de noms Inkscape/Illustrator) sans les pièges du parseur HTML d'innerHTML.
    const board = document.createElementNS(SVG_NS, 'g');
    const raw = SVGS[this.variante];
    const text = raw.slice(raw.indexOf('<svg')); // retire <?xml?> / commentaires
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    let inner: SVGElement | null = null;
    if (doc.documentElement && doc.documentElement.nodeName.toLowerCase() === 'svg') {
      inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(geom.w));
      inner.setAttribute('height', String(geom.h));
      // Rendu Fritzing : un point vert foncé est dessiné en dur au centre de la
      // LED (#circle178) — il paraît noir à taille réelle et reste visible LED
      // éteinte. On le retire pour un rendu identique à la Pico (pastille claire
      // éteinte, vert + halo allumée via la LED en surimpression).
      if (this.estFritzing) inner.querySelector('#circle178')?.remove();
      board.appendChild(inner);
    }
    svg.appendChild(board);

    this.ledEl = this.addLed(svg, inner);
    // Réapplique l'état courant de la LED après reconstruction.
    const v = this.ledValue;
    this.ledValue = !v;
    this.ledPower = v;

    wrap.appendChild(svg);
    shadow.appendChild(wrap);
  }

  /**
   * Localise ou crée la LED verte pilotable — même comportement partout :
   * invisible éteinte, verte avec halo allumée.
   * - Pico : le dessin schématique contient déjà #circle16 (vert, filtre de halo).
   * - Pico W, Pico 2, Pico 2 W : pastille verte ajoutée par-dessus le dessin,
   *   pilotée en opacité (rien de sombre à l'arrêt).
   */
  private addLed(svg: SVGSVGElement, inner: SVGElement | null): SVGElement | null {
    const geom = GEOM[this.variante];
    const natif = geom.ledNatif ? (inner?.querySelector(geom.ledNatif) as SVGElement | null) : null;
    if (natif) return natif;
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('id', 'led-gp25');
    c.setAttribute('cx', String(geom.led.x));
    c.setAttribute('cy', String(geom.led.y));
    c.setAttribute('r', String(geom.led.r));
    c.setAttribute('fill', '#8cff5a');
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = 'GP25 (LED)';
    c.appendChild(title);
    svg.appendChild(c);
    return c;
  }

  /** Allume/éteint la LED embarquée (GP25). */
  set ledPower(value: boolean) {
    if (value === this.ledValue) return;
    this.ledValue = value;
    const el = this.ledEl;
    if (!el) return;
    el.setAttribute('opacity', value ? '1' : '0');
    (el as SVGElement).style.filter = value ? 'drop-shadow(0 0 3px #8cff5a)' : 'none';
  }

  get ledPower(): boolean {
    return this.ledValue;
  }
}

if (!customElements.get('kablix-pico-board')) {
  customElements.define('kablix-pico-board', PicoBoardElement);
}
