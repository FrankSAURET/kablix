// Composant maison <kablix-ventilo> : ventilateur 5 V, dessin de Frank
// (Composants.svg, groupe « ventilo » → ./externe/ventilo.svg). Le groupe
// `ventilo-helices` tourne autour de l'AXE du moyeu, à la vitesse imposée par
// le moteur : `speed` = tours par seconde (0 = arrêté).
// Simulation : voir fanState (model.mts) — tension d'alimentation ET courant
// disponible ; sans courant suffisant, l'hélice ne tourne pas.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/ventilo.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Origine de rotation, mesurée une seule fois : le dessin est le même pour
 *  tous les ventilateurs. Coordonnées relatives au coin de la boîte de
 *  l'enveloppe (repère `transform-box: fill-box`). */
let spinOrigin: { x: number; y: number } | null = null;

/**
 * Cherche l'axe de l'hélice : les BOUTS de pale sont tous à la même distance de
 * l'axe, donc le centre du plus petit cercle contenant les contours EST l'axe.
 * On l'approche en se déplaçant vers le point le plus lointain d'un pas
 * décroissant. Le centre de la BOÎTE des pales ne convient pas : avec un nombre
 * impair de pales elle est dissymétrique (≈ 5 px de balourd sur ce dessin).
 */
function measureSpinOrigin(wrap: SVGGElement): { x: number; y: number } | null {
  const toLocal = wrap.getCTM()?.inverse();
  const box = wrap.getBBox();
  if (!toLocal || !(box.width > 0)) return null; // pas encore rendu
  const pts: { x: number; y: number }[] = [];
  for (const el of wrap.querySelectorAll<SVGGeometryElement>('path,circle,ellipse,rect,polygon,polyline')) {
    if (typeof el.getTotalLength !== 'function') continue;
    const len = el.getTotalLength();
    const ctm = el.getCTM();
    if (!(len > 0) || !ctm) continue;
    const m = toLocal.multiply(ctm);
    const n = Math.min(120, Math.max(12, Math.round(len / 4)));
    for (let i = 0; i < n; i++) {
      const p = el.getPointAtLength((len * i) / n);
      pts.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
    }
  }
  if (pts.length < 3) return null;
  let ax = box.x + box.width / 2;
  let ay = box.y + box.height / 2;
  for (let i = 0; i < 300; i++) {
    let best = pts[0];
    let far = -1;
    for (const p of pts) {
      const d = (p.x - ax) ** 2 + (p.y - ay) ** 2;
      if (d > far) {
        far = d;
        best = p;
      }
    }
    const k = 1 / (i + 2);
    ax += (best.x - ax) * k;
    ay += (best.y - ay) * k;
  }
  return { x: ax - box.x, y: ay - box.y };
}

export class VentiloElement extends LitElement {
  /** Tension nominale (V) — inspecteur. */
  declare voltage: number;
  /** Courant consommé à pleine vitesse (A) — inspecteur. */
  declare current: number;
  /** Vitesse imposée par la simulation, en TOURS PAR SECONDE (0 = arrêté). */
  declare speed: number;

  static properties = {
    voltage: { type: Number },
    current: { type: Number },
    speed: { type: Number },
  };

  constructor() {
    super();
    this.voltage = 5;
    this.current = 0.85;
    this.speed = 0;
  }

  // Broches : centre des pastilles du dessin (grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: '+', x: 10, y: 180, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: '-', x: 10, y: 190, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  /** Enveloppe neutre qui porte l'animation (créée au premier rendu). */
  private spinner: SVGGElement | null = null;

  /**
   * Le groupe des pales porte SON PROPRE `transform` (mise à l'échelle
   * Inkscape) : une animation CSS posée dessus l'écraserait — l'hélice sautait
   * de 40 px et changeait de taille dès le démarrage. On l'emballe donc dans un
   * groupe neutre, qui seul porte la rotation.
   */
  private ensureSpinner(): SVGGElement | null {
    if (this.spinner?.isConnected) return this.spinner;
    const blades = this.renderRoot.querySelector('#ventilo-helices') as SVGGElement | null;
    if (!blades?.parentNode) return null;
    const wrap = document.createElementNS(SVG_NS, 'g');
    wrap.setAttribute('class', 'spin');
    blades.parentNode.insertBefore(wrap, blades);
    wrap.appendChild(blades);
    this.spinner = wrap;
    return wrap;
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      /* fill-box : l'origine est comptée depuis le coin de la boîte des pales,
         donc valable où que soit l'hélice dans le viewBox (pas de coordonnées
         codées en dur). Le 50 % n'est qu'un repli : l'axe réel est mesuré. */
      .spin {
        transform-box: fill-box;
        transform-origin: 50% 50%;
        animation-name: kablix-fan-spin;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      @keyframes kablix-fan-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    const wrap = this.ensureSpinner();
    if (!wrap) return;
    if (!spinOrigin) spinOrigin = measureSpinOrigin(wrap);
    if (spinOrigin) wrap.style.transformOrigin = `${spinOrigin.x.toFixed(3)}px ${spinOrigin.y.toFixed(3)}px`;
    // Durée d'un tour ; vitesse nulle → animation coupée (hélice figée).
    const turns = Number.isFinite(this.speed) ? Math.max(0, this.speed) : 0;
    wrap.style.animationDuration = turns > 0 ? `${(1 / turns).toFixed(3)}s` : '0s';
    wrap.style.animationPlayState = turns > 0 ? 'running' : 'paused';
  }

  render() {
    return html`
      <svg width="230" height="220" viewBox="0 0 230 220" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-ventilo')) {
  customElements.define('kablix-ventilo', VentiloElement);
}
