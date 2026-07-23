// Élément visuel maison <kablix-pca9685> : module Grove « 16-Channel PWM
// Driver (PCA9685) » de Seeed, dessin Fritzing retouché par Frank
// (./externe/pca9685.svg, pastilles connectorNNterminal sur la grille de 10 px,
// bloc P11/P12 recalé au nettoyage). 300×200 px.
//
// Brochage (sérigraphie de la carte) :
//  - gauche (connecteur Grove) : GND / VCC / SDA / SCL — bus logique I²C ;
//  - droite (bornier à vis)    : GND.2 (haut) / V+ (bas) — ALIMENTATION DES
//    SERVOS : sans alim de laboratoire 5 V au courant suffisant reliée ici, les
//    sorties ne bougent pas (pca9685PowerState, model.mts) ;
//  - 16 connecteurs servo (P1..P8 en haut, P9..P16 en bas), chacun 3 broches :
//    signal PWMn (P1 = canal 0 … P16 = canal 15, comme les bibliothèques),
//    Pn.5V (rail V+) et Pn.GND (masse) — colorées rouge/noir par
//    pinElectricalRole. Les rails internes vivent dans buildNets (model.mts).
import { render } from 'lit';
import drawing from './externe/pca9685.svg';
import { boumOverlay } from './utils/boum.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const PCA_W = 300;
export const PCA_H = 200;

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

/** Broches du PCA9685 natif — partagées avec la netlist (model.mts). */
export function pca9685Pins(): Array<{ name: string; x: number; y: number }> {
  const pins: Array<{ name: string; x: number; y: number }> = [
    // Connecteur Grove (bus logique).
    { name: 'GND', x: 10, y: 80 },
    { name: 'VCC', x: 10, y: 90 },
    { name: 'SDA', x: 10, y: 100 },
    { name: 'SCL', x: 10, y: 110 },
    // Bornier d'alimentation servo (à droite).
    { name: 'GND.2', x: 290, y: 90 },
    { name: 'V+', x: 290, y: 110 },
  ];
  // Connecteurs servo : P1..P8 en haut (PWM0..7), P9..P16 en bas (PWM8..15).
  const topX = [240, 230, 200, 190, 110, 100, 70, 60]; // P1..P8
  const botX = [60, 70, 100, 110, 190, 200, 230, 240]; // P9..P16
  for (let n = 1; n <= 8; n++) {
    const x = topX[n - 1];
    pins.push({ name: `PWM${n - 1}`, x, y: 30 });
    pins.push({ name: `P${n}.5V`, x, y: 40 });
    pins.push({ name: `P${n}.GND`, x, y: 50 });
  }
  for (let n = 9; n <= 16; n++) {
    const x = botX[n - 9];
    pins.push({ name: `PWM${n - 1}`, x, y: 150 });
    pins.push({ name: `P${n}.5V`, x, y: 160 });
    pins.push({ name: `P${n}.GND`, x, y: 170 });
  }
  return pins;
}

export class Pca9685Element extends HTMLElement {
  readonly pinInfo: PinInfo[] = pca9685Pins().map((p) => ({ ...p, signals: [] }));

  private root: ShadowRoot;
  private rendered = false;
  private _burned = false;
  /** Conteneur de l'explosion « Boum » (carte grillée par surtension V+ > 5,5 V). */
  private boumHost: HTMLElement | null = null;

  /** Carte grillée : affiche l'explosion (piloté par sim.mts en surtension). */
  set burned(v: boolean) {
    const on = !!v;
    if (on === this._burned) return;
    this._burned = on;
    this.updateBoum();
  }
  get burned(): boolean {
    return this._burned;
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
  }

  /** Monte/démonte l'overlay d'explosion selon `burned`. */
  private updateBoum(): void {
    if (!this.boumHost) return;
    render(this._burned ? boumOverlay(90) : null, this.boumHost);
  }

  private render(): void {
    this.rendered = true;
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';
    // `position: relative` requis par boumOverlay (span centré en absolu).
    wrap.style.position = 'relative';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(PCA_W));
    svg.setAttribute('height', String(PCA_H));
    svg.setAttribute('viewBox', `0 0 ${PCA_W} ${PCA_H}`);

    // DOMParser : parsing SVG fidèle (viewBox Fritzing, <style> embarquée).
    const doc = new DOMParser().parseFromString(drawing.slice(drawing.indexOf('<svg')), 'image/svg+xml');
    if (doc.documentElement.nodeName.toLowerCase() === 'svg') {
      const inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(PCA_W));
      inner.setAttribute('height', String(PCA_H));
      svg.appendChild(inner);
    }

    wrap.appendChild(svg);
    // Hôte de l'explosion, par-dessus le dessin (centré par boumOverlay).
    this.boumHost = document.createElement('span');
    wrap.appendChild(this.boumHost);

    this.root.replaceChildren(wrap);
    this.updateBoum();
  }
}

if (!customElements.get('kablix-pca9685')) {
  customElements.define('kablix-pca9685', Pca9685Element);
}
