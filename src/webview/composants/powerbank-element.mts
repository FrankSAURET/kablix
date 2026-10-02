// Élément visuel maison <kablix-powerbank> : batterie externe USB (dessin de
// Frank, Composants.svg groupe « Powerbank » → ./externe/Powerbank.svg ;
// schéma interne générique « bat-interne », ./interne/bat-interne.svg,
// resservira à d'autres composants « pile »). 430×250 px. Deux pastilles V+ /
// GND : sortie régulée, traitée comme une alim de laboratoire (kind 'psu',
// model.mts) mais tension FIXE — pas de bouton, pas de simControl.
//
// LED1..LED4 (jauge de charge du dessin) : blanches avec halo, allumées tant
// que la simulation tourne (Frank : « des LED blanches (avec halo) qui
// s'allument à la simulation »). Depuis v2026.9.7.179 la batterie a une
// capacité et se vide (sim.mts) : la jauge montre la charge restante, une LED
// par quart entamé — plus aucune quand elle est vide.
import { render } from 'lit';
import drawing from './externe/Powerbank.svg';
import { boumOverlay } from './utils/boum.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const POWERBANK_W = 430;
export const POWERBANK_H = 250;

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

const LED_IDS = ['LED1', 'LED2', 'LED3', 'LED4'] as const;
const LED_OFF_STYLE = 'fill:#222222;fill-opacity:0.980392;stroke:#000000;stroke-width:0.105833;stroke-opacity:1';
const LED_ON_STYLE = 'fill:#ffffff;fill-opacity:1;stroke:#e4e4e7;stroke-width:0.105833;stroke-opacity:1';

export class PowerbankElement extends HTMLElement {
  readonly pinInfo: PinInfo[] = [
    { name: 'V+', x: 420, y: 190, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 420, y: 200, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  static get observedAttributes(): string[] {
    return ['simulating'];
  }

  private root: ShadowRoot;
  private rendered = false;
  private chargeValue = 1;

  /** Charge restante (0 à 1), posée par la simulation à chaque image. */
  get charge(): number {
    return this.chargeValue;
  }
  set charge(v: number) {
    const c = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
    if (c === this.chargeValue) return;
    this.chargeValue = c;
    if (this.rendered) this.updateLeds();
  }

  /** Tension de sortie imposée par la simulation (0 = vide) ; absente = nominale. */
  volts: number | undefined = undefined;

  private _burned = false;
  /** Conteneur de l'explosion « Boum » (batterie en court-circuit). */
  private boumHost: HTMLElement | null = null;

  /** Batterie détruite (court-circuit) : affiche l'explosion. */
  set burned(v: boolean) {
    const on = !!v;
    if (on === this._burned) return;
    this._burned = on;
    this.updateBoum();
  }
  get burned(): boolean {
    return this._burned;
  }

  private updateBoum(): void {
    if (!this.boumHost) return;
    render(this._burned ? boumOverlay(120) : null, this.boumHost);
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
  }

  attributeChangedCallback(name: string): void {
    if (name !== 'simulating') return;
    // Nouveau lancement : la batterie repart pleine.
    if (this.hasAttribute('simulating')) this.chargeValue = 1;
    if (this.rendered) this.updateLeds();
  }

  private render(): void {
    this.rendered = true;
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';
    // `position: relative` requis par boumOverlay (span centré en absolu).
    wrap.style.position = 'relative';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(POWERBANK_W));
    svg.setAttribute('height', String(POWERBANK_H));
    svg.setAttribute('viewBox', `0 0 ${POWERBANK_W} ${POWERBANK_H}`);

    const doc = new DOMParser().parseFromString(drawing.slice(drawing.indexOf('<svg')), 'image/svg+xml');
    if (doc.documentElement.nodeName.toLowerCase() === 'svg') {
      const inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(POWERBANK_W));
      inner.setAttribute('height', String(POWERBANK_H));
      svg.appendChild(inner);
    }

    wrap.appendChild(svg);
    this.boumHost = document.createElement('span');
    wrap.appendChild(this.boumHost);
    this.root.replaceChildren(wrap);
    this.prepareLeds();
    this.updateLeds();
    this.updateBoum();
  }

  /**
   * Halo derrière chaque LED (2 ellipses floutées, sur le modèle de l'alim de
   * laboratoire) : posé une fois au rendu, dans le repère local de la LED (même
   * groupe parent, donc même matrice mm→px héritée), masqué par défaut.
   */
  private prepareLeds(): void {
    for (const id of LED_IDS) {
      const led = this.root.querySelector(`#${id}`) as SVGCircleElement | null;
      if (!led) continue;
      const cx = Number(led.getAttribute('cx') ?? 0);
      const cy = Number(led.getAttribute('cy') ?? 0);
      const r = Number(led.getAttribute('r') ?? 0.4);
      const glow = document.createElementNS(SVG_NS, 'g');
      glow.setAttribute('data-glow-for', id);
      // Halo = effet de simulation, pas une forme du dessin : exclu de l'export.
      glow.setAttribute('data-no-export', '');
      glow.style.display = 'none';
      for (const [scale, opacity] of [[5, 0.35], [2.6, 0.6]] as const) {
        const e = document.createElementNS(SVG_NS, 'ellipse');
        e.setAttribute('cx', String(cx));
        e.setAttribute('cy', String(cy));
        e.setAttribute('rx', String(r * scale));
        e.setAttribute('ry', String(r * scale));
        e.setAttribute('fill', '#ffffff');
        e.setAttribute('opacity', String(opacity));
        e.style.filter = 'blur(0.6px)';
        glow.appendChild(e);
      }
      led.parentElement?.insertBefore(glow, led);
    }
  }

  private updateLeds(): void {
    const simule = this.hasAttribute('simulating');
    // Une LED par quart de charge entamé : 100 % → 4, 30 % → 2, 0 → aucune.
    const allumees = simule ? Math.ceil(this.chargeValue * LED_IDS.length - 1e-9) : 0;
    for (const [i, id] of LED_IDS.entries()) {
      const on = i < allumees;
      const led = this.root.querySelector(`#${id}`) as SVGElement | null;
      const glow = this.root.querySelector(`[data-glow-for="${id}"]`) as SVGElement | null;
      led?.setAttribute('style', on ? LED_ON_STYLE : LED_OFF_STYLE);
      if (glow) glow.style.display = on ? '' : 'none';
    }
  }
}

if (!customElements.get('kablix-powerbank')) {
  customElements.define('kablix-powerbank', PowerbankElement);
}
