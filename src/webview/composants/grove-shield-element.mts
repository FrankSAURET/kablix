// Élément visuel maison <kablix-grove-pico> : Grove Shield for Pi Pico v1.0
// (Seeed), dessin retouché par Frank (./externe/grove-pico.svg, pastilles sur la
// grille de 10 px). La Pico / Pico W s'enfiche sur les deux rangées centrales
// (fils `auto` créés par l'éditeur, comme la platine d'essai) ; les connexions
// internes vivent dans ../diagram/grove-shield.mts (netlist).
//
// L'interrupteur 3V3/5V du dessin (id gvp-curseur-switch) est CLIQUABLE : il
// glisse entre les positions 5V (gauche, telle que dessinée) et 3V3 (droite),
// reflète l'attribut `pwr` et émet `pwr-change` (persisté par l'éditeur).

import drawing from './externe/grove-pico.svg';
import { GROVE_H, GROVE_W, groveShieldPins, normalizePower, type GrovePower } from '../diagram/grove-shield.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Course du curseur : dessiné côté 5V (gauche), +4,7 px rendus → 3V3. Le
// transform s'applique DANS le repère du dessin (viewBox en mm, ×96/25,4) :
// 4,7 px ÷ 3,7795 ≈ 1,244 unités locales.
const KNOB_DX_3V3 = 1.244;
// Zone cliquable de l'interrupteur (px, autour du corps gris + du curseur).
const SWITCH_ZONE = { x: 6, y: 11, w: 38, h: 29 };
const HIGHLIGHT_FILL = '#ffd633';

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

export class GroveShieldElement extends HTMLElement {
  readonly pinInfo: PinInfo[] = groveShieldPins().map((p) => ({ ...p, signals: [] }));

  static get observedAttributes(): string[] {
    return ['pwr'];
  }

  private root: ShadowRoot;
  private highlighted: SVGCircleElement[] = [];
  private rendered = false;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  get pwr(): GrovePower {
    return normalizePower(this.getAttribute('pwr'));
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
  }

  attributeChangedCallback(): void {
    if (this.rendered) this.updateKnob();
  }

  /** Surbrillance de trous (pose de la Pico) — remplace la surbrillance courante. */
  setHighlight(pins: string[]): void {
    for (const c of this.highlighted) c.remove();
    this.highlighted = [];
    const svg = this.root.querySelector('svg');
    if (!svg) return;
    const byName = new Map(this.pinInfo.map((p) => [p.name, p]));
    for (const name of pins) {
      const p = byName.get(name);
      if (!p) continue;
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(p.x));
      c.setAttribute('cy', String(p.y));
      c.setAttribute('r', '3.4');
      c.setAttribute('fill', HIGHLIGHT_FILL);
      c.setAttribute('fill-opacity', '0.85');
      c.setAttribute('pointer-events', 'none');
      svg.appendChild(c);
      this.highlighted.push(c);
    }
  }

  private render(): void {
    this.rendered = true;
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';

    // Boîte hôte aux dimensions exactes + dessin par-dessus, dans un SVG englobant
    // au repère 1:1 (px = px du dessin) pour poser surbrillances et zone du switch.
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(GROVE_W));
    svg.setAttribute('height', String(GROVE_H));
    svg.setAttribute('viewBox', `0 0 ${GROVE_W} ${GROVE_H}`);

    // DOMParser : parsing SVG fidèle (viewBox mm, <style> embarquée) sans les
    // pièges du parseur HTML d'innerHTML (cf. pico-board).
    const doc = new DOMParser().parseFromString(drawing.slice(drawing.indexOf('<svg')), 'image/svg+xml');
    if (doc.documentElement.nodeName.toLowerCase() === 'svg') {
      const inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(GROVE_W));
      inner.setAttribute('height', String(GROVE_H));
      svg.appendChild(inner);
    }

    // Zone cliquable de l'interrupteur d'alimentation.
    const zone = document.createElementNS(SVG_NS, 'rect');
    zone.setAttribute('x', String(SWITCH_ZONE.x));
    zone.setAttribute('y', String(SWITCH_ZONE.y));
    zone.setAttribute('width', String(SWITCH_ZONE.w));
    zone.setAttribute('height', String(SWITCH_ZONE.h));
    zone.setAttribute('fill', 'transparent');
    zone.style.cursor = 'pointer';
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = 'VCC Grove : 3V3 / 5V';
    zone.appendChild(title);
    // pointerdown + stopPropagation : le clic bascule l'interrupteur sans
    // démarrer le déplacement du shield (écouteur du corps dans l'éditeur).
    zone.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.toggle();
    });
    svg.appendChild(zone);

    wrap.appendChild(svg);
    this.root.replaceChildren(wrap);
    this.updateKnob();
  }

  /** Bascule 3V3 ↔ 5V : reflète l'attribut et notifie l'éditeur (persistance). */
  private toggle(): void {
    const next: GrovePower = this.pwr === '5v' ? '3v3' : '5v';
    this.setAttribute('pwr', next);
    this.dispatchEvent(new CustomEvent('pwr-change', { detail: next, bubbles: true, composed: true }));
  }

  /** Place le curseur du dessin sur la position courante (transition douce). */
  private updateKnob(): void {
    const knob = this.root.querySelector('#gvp-curseur-switch') as SVGElement | null;
    if (!knob) return;
    knob.style.transition = 'transform 0.15s linear';
    knob.style.transform = this.pwr === '5v' ? 'translate(0,0)' : `translate(${KNOB_DX_3V3}px, 0)`;
  }
}

if (!customElements.get('kablix-grove-pico')) {
  customElements.define('kablix-grove-pico', GroveShieldElement);
}
