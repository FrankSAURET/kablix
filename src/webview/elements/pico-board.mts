// Élément visuel maison <kablix-pico-board> : Raspberry Pi Pico W. Le dessin et
// les 40 broches (deux rangées verticales, pas de 10 px) proviennent de la
// bibliothèque de composants — parts/picow-module.kablix-part.json — qui est
// elle-même générée depuis media/parts/. @wokwi/elements ne fournit AUCUN
// élément Pico : c'est donc ce dessin qui sert pour Pico et Pico W.
//
// Le nom de chaque broche est imprimé À L'EXTÉRIEUR du composant (marges gauche
// et droite ajoutées autour du dessin). La LED embarquée GP25 (pilotable via la
// propriété `ledPower`) est ajoutée en surimpression. L'élément expose `pinInfo`
// comme les éléments @wokwi/elements.

import picowPart from '../../../parts/picow-module.kablix-part.json';

const SVG_NS = 'http://www.w3.org/2000/svg';

const PICOW = picowPart as unknown as {
  svg: string;
  pins: Array<{ name: string; x: number; y: number }>;
};

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

// Marges ajoutées de part et d'autre du dessin pour loger les noms de broches
// (la marge droite est plus large : noms longs type ADC_VREF / 3V3_EN).
const MARGIN_LEFT = 26;
const MARGIN_RIGHT = 46;
// Abscisse séparant la rangée gauche (≤ 60) de la rangée droite dans le dessin.
const COL_SPLIT = 60;
// Repère de la LED GP25 (dans la marge gauche, en haut), en coordonnées dessin.
const LED_PAD = { name: 'GP25', x: 10, y: 15 };

/** Nom affiché : les masses GND.1, GND.2… sont toutes étiquetées « GND ». */
function shortName(name: string): string {
  return name.replace(/^GND\.\d+$/, 'GND');
}

/**
 * Construit la liste des broches à partir du dessin importé : les broches GND y
 * sont toutes nommées « GND », or l'éditeur indexe les pastilles par nom → on
 * les numérote GND.1, GND.2… pour les garder distinctes (la simulation ignore
 * de toute façon le nom des masses). Les abscisses sont décalées de MARGIN_LEFT
 * (le dessin est translaté d'autant). La pastille GP25 (LED) est ajoutée.
 */
function buildPins(): PinInfo[] {
  let gnd = 0;
  const pins = PICOW.pins.map((p) => ({
    name: p.name === 'GND' ? `GND.${++gnd}` : p.name,
    x: p.x + MARGIN_LEFT,
    y: p.y,
    signals: [] as unknown[],
  }));
  pins.push({ name: LED_PAD.name, x: LED_PAD.x + MARGIN_LEFT, y: LED_PAD.y, signals: [] });
  return pins;
}

export class PicoBoardElement extends HTMLElement {
  readonly pinInfo: PinInfo[] = buildPins();

  private ledEl: SVGElement | null = null;
  private ledValue = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';
    wrap.innerHTML = PICOW.svg;
    const svg = wrap.querySelector('svg');
    if (svg) this.decorate(svg);
    shadow.appendChild(wrap);
  }

  /**
   * Ajoute les marges, translate le dessin, imprime les noms de broches à
   * l'extérieur et pose la LED GP25.
   */
  private decorate(svg: SVGSVGElement): void {
    const ow = parseFloat(svg.getAttribute('width') || '119') || 119;
    const oh = parseFloat(svg.getAttribute('height') || '240') || 240;
    const w = ow + MARGIN_LEFT + MARGIN_RIGHT;

    // Décale tout le dessin existant vers la droite (place pour la marge gauche).
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${MARGIN_LEFT} 0)`);
    while (svg.firstChild) g.appendChild(svg.firstChild);
    svg.appendChild(g);

    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(oh));
    svg.setAttribute('viewBox', `0 0 ${w} ${oh}`);

    // Noms de broches, à l'extérieur : rangée gauche → à gauche, rangée droite →
    // à droite. Les coordonnées sont celles (déjà décalées) de `pinInfo`.
    for (const pin of this.pinInfo) {
      if (pin.name === LED_PAD.name) continue;
      const left = pin.x - MARGIN_LEFT < COL_SPLIT; // colonne d'origine
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(left ? pin.x - 7 : pin.x + 7));
      text.setAttribute('y', String(pin.y));
      text.setAttribute('text-anchor', left ? 'end' : 'start');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-family', 'monospace');
      text.setAttribute('font-size', '7');
      text.setAttribute('style', 'fill: var(--vscode-editor-foreground, #c8c8c8)');
      text.textContent = shortName(pin.name);
      svg.appendChild(text);
    }

    this.ledEl = this.addLed(svg);
  }

  /** Ajoute la pastille LED GP25 en surimpression du dessin. */
  private addLed(svg: SVGSVGElement): SVGElement {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('id', 'led-gp25');
    c.setAttribute('cx', String(LED_PAD.x + MARGIN_LEFT));
    c.setAttribute('cy', String(LED_PAD.y));
    c.setAttribute('r', '4');
    c.setAttribute('fill', '#3a4a3a');
    c.setAttribute('stroke', '#222');
    c.setAttribute('stroke-width', '0.6');
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
    if (!this.ledEl) return;
    this.ledEl.setAttribute('fill', value ? '#8cff5a' : '#3a4a3a');
    this.ledEl.style.filter = value ? 'drop-shadow(0 0 3px #8cff5a)' : 'none';
  }

  get ledPower(): boolean {
    return this.ledValue;
  }
}

if (!customElements.get('kablix-pico-board')) {
  customElements.define('kablix-pico-board', PicoBoardElement);
}
