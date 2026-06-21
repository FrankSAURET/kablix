// Élément visuel maison <kablix-pico-board> : Raspberry Pi Pico / Pico W.
// @wokwi/elements ne fournit AUCUN élément Pico → on dessine la carte à partir
// de deux SVG (paysage, USB à gauche) importés comme texte :
//   - pico.svg  : Pico (dessin schématique, LED verte intégrée = #circle16)
//   - picow.svg : Pico W (rendu Fritzing ; LED ajoutée en surimpression)
// La variante est choisie par l'attribut `variant` ("pico" par défaut, "picow").
//
// Les 40 broches (deux rangées horizontales au pas de 10 px) sont identiques aux
// deux cartes (même brochage physique). Le nom de chaque broche est imprimé
// verticalement à l'extérieur (au-dessus pour la rangée du haut, en dessous pour
// celle du bas). La LED embarquée GP25 (propriété `ledPower`) s'allume en vert.

import picoSvg from './pico.svg';
import picowSvg from './picow.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Boîte de dessin de la carte (px), commune aux deux SVG (rendus à cette taille).
const BOARD_W = 208.663;
const BOARD_H = 82.678;
// Marges haut/bas pour loger les noms de broches imprimés verticalement.
const MARGIN = 48;
const TOTAL_H = BOARD_H + 2 * MARGIN;

// Position des plots dans le dessin (mêmes coordonnées pour Pico et Pico W).
const PIN_X0 = 13.26; // abscisse du 1er plot
const PIN_STEP = 10; // pas de 10 px
const TOP_Y = 6.4; // rangée du haut (broches 40→21, gauche→droite)
const BOTTOM_Y = 76.4; // rangée du bas (broches 1→20, gauche→droite)
// LED verte (côté USB, à gauche) — coïncide avec #circle16 du dessin Pico.
const LED = { x: 25.9, y: 64.08 };

// Noms des broches, gauche→droite (USB à gauche, GP0 en bas à gauche).
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

/** Nom affiché : les masses GND.1, GND.2… sont toutes étiquetées « GND ». */
function shortName(name: string): string {
  return name.replace(/^GND\.\d+$/, 'GND');
}

/**
 * Construit la liste des broches (coordonnées en pixels, marge haute incluse).
 * Les masses sont numérotées GND.1, GND.2… car l'éditeur indexe les pastilles
 * par nom (la simulation ignore de toute façon le nom des masses). La pastille
 * GP25 (LED interne) est ajoutée côté USB.
 */
function buildPins(): PinInfo[] {
  let gnd = 0;
  const pins: PinInfo[] = [];
  const add = (name: string, x: number, y: number): void => {
    pins.push({ name: name === 'GND' ? `GND.${++gnd}` : name, x, y, signals: [] });
  };
  TOP_NAMES.forEach((n, i) => add(n, PIN_X0 + i * PIN_STEP, TOP_Y + MARGIN));
  BOTTOM_NAMES.forEach((n, i) => add(n, PIN_X0 + i * PIN_STEP, BOTTOM_Y + MARGIN));
  pins.push({ name: 'GP25', x: LED.x, y: LED.y + MARGIN, signals: [] });
  return pins;
}

export class PicoBoardElement extends HTMLElement {
  readonly pinInfo: PinInfo[] = buildPins();

  static get observedAttributes(): string[] {
    return ['variant'];
  }

  private ledEl: SVGElement | null = null;
  private ledMode: 'opacity' | 'fill' = 'opacity';
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

  private get isPicoW(): boolean {
    return this.getAttribute('variant') === 'picow';
  }

  /** (Re)construit le dessin : carte imbriquée + noms de broches + LED. */
  private render(): void {
    const shadow = this.shadowRoot;
    if (!shadow) return;
    shadow.replaceChildren();
    this.rendered = true;

    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(BOARD_W));
    svg.setAttribute('height', String(TOTAL_H));
    svg.setAttribute('viewBox', `0 0 ${BOARD_W} ${TOTAL_H}`);

    // Carte imbriquée : son viewBox propre est mis à l'échelle pour remplir la
    // boîte BOARD_W×BOARD_H, décalée de MARGIN vers le bas (place pour les noms).
    // DOMParser (image/svg+xml) → parsing SVG fidèle (viewBox, dégradés, espaces
    // de noms Inkscape/Illustrator) sans les pièges du parseur HTML d'innerHTML.
    const board = document.createElementNS(SVG_NS, 'g');
    board.setAttribute('transform', `translate(0 ${MARGIN})`);
    const raw = this.isPicoW ? picowSvg : picoSvg;
    const text = raw.slice(raw.indexOf('<svg')); // retire <?xml?> / commentaires
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    let inner: SVGElement | null = null;
    if (doc.documentElement && doc.documentElement.nodeName.toLowerCase() === 'svg') {
      inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(BOARD_W));
      inner.setAttribute('height', String(BOARD_H));
      board.appendChild(inner);
    }
    svg.appendChild(board);

    this.addLabels(svg);
    this.ledEl = this.addLed(svg, inner);
    // Réapplique l'état courant de la LED après reconstruction.
    const v = this.ledValue;
    this.ledValue = !v;
    this.ledPower = v;

    wrap.appendChild(svg);
    shadow.appendChild(wrap);
  }

  /** Imprime les noms de broches verticalement, à l'extérieur de la carte. */
  private addLabels(svg: SVGSVGElement): void {
    for (const pin of this.pinInfo) {
      if (pin.name === 'GP25') continue; // LED interne : pas de label d'en-tête
      const top = pin.y < MARGIN + BOARD_H / 2;
      const text = document.createElementNS(SVG_NS, 'text');
      const anchorY = top ? MARGIN - 4 : MARGIN + BOARD_H + 4;
      text.setAttribute('transform', `rotate(-90 ${pin.x} ${anchorY})`);
      text.setAttribute('x', String(pin.x));
      text.setAttribute('y', String(anchorY));
      text.setAttribute('text-anchor', top ? 'start' : 'end');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-family', 'monospace');
      text.setAttribute('font-size', '6');
      text.setAttribute('style', 'fill: var(--vscode-editor-foreground, #c8c8c8)');
      text.textContent = shortName(pin.name);
      svg.appendChild(text);
    }
  }

  /**
   * Localise (Pico) ou crée (Pico W) la LED verte pilotable.
   * - Pico : le dessin contient déjà #circle16 (vert, filtre de halo) → on pilote
   *   son opacité.
   * - Pico W : aucune LED dans le rendu → pastille ajoutée près de l'USB.
   */
  private addLed(svg: SVGSVGElement, inner: SVGElement | null): SVGElement | null {
    const native = inner?.querySelector('#circle16') as SVGElement | null;
    if (!this.isPicoW && native) {
      this.ledMode = 'opacity';
      return native;
    }
    this.ledMode = 'fill';
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('id', 'led-gp25');
    c.setAttribute('cx', String(LED.x));
    c.setAttribute('cy', String(LED.y + MARGIN));
    c.setAttribute('r', '2.6');
    c.setAttribute('fill', '#3a4a3a');
    c.setAttribute('stroke', '#222');
    c.setAttribute('stroke-width', '0.5');
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
    if (this.ledMode === 'opacity') {
      el.setAttribute('opacity', value ? '1' : '0');
    } else {
      el.setAttribute('fill', value ? '#8cff5a' : '#3a4a3a');
    }
    (el as SVGElement).style.filter = value ? 'drop-shadow(0 0 3px #8cff5a)' : 'none';
  }

  get ledPower(): boolean {
    return this.ledValue;
  }
}

if (!customElements.get('kablix-pico-board')) {
  customElements.define('kablix-pico-board', PicoBoardElement);
}
