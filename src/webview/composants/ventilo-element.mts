// Composant maison <kablix-ventilo> : ventilateur 5 V, dessin de Frank
// (Composants.svg, groupe « ventilo » → ./externe/ventilo.svg). Le groupe
// `ventilo-helices` tourne autour de l'AXE du moyeu, à la vitesse imposée par
// le moteur : `speed` = tours par seconde RÉELS (0 = arrêté). L'élément décide
// seul de ce qui est affichable : au-delà de ce qu'un écran à 60 Hz sait
// montrer, la rotation est plafonnée et la vitesse se lit au flou de bougé.
// Simulation : voir fanState (model.mts) — tension d'alimentation ET courant
// disponible ; sans courant suffisant, l'hélice ne tourne pas.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/ventilo.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Rafraîchissement d'écran retenu pour le calcul de l'alias (Hz). */
const SCREEN_HZ = 60;
/**
 * Fraction de la période de pale qu'une image d'écran a le droit d'avaler. À la
 * moitié l'image devient ambiguë (roue de charrette : l'hélice paraît ralentir
 * puis tourner À L'ENVERS), on s'arrête donc au quart.
 */
const ALIAS_MARGIN = 4;
/** Pales supposées si la mesure échoue. Repli PRUDENT (le dessin en a 7) : une
 *  hélice un peu lente se voit moins qu'une hélice qui recule. */
const BLADES_FALLBACK = 8;
/** Régime nominal d'un petit ventilateur 5 V : 3000 tr/min = 50 tours/s. */
const NOMINAL_TURNS_PER_S = 50;
/** Flou de bougé des pales à plein régime (unités du dessin). */
const MAX_BLUR = 3;
/** Transparence des pales à plein régime : un ventilateur lancé se traverse. */
const MAX_FADE = 0.35;

/** Repère de l'hélice, mesuré une seule fois : le dessin est le même pour tous
 *  les ventilateurs. `x`/`y` = axe de rotation, relatif au coin de la boîte de
 *  l'enveloppe (repère `transform-box: fill-box`) ; `blades` = nombre de pales,
 *  qui fixe la vitesse au-delà de laquelle l'écran ne suit plus. */
let spin: { x: number; y: number; blades: number } | null = null;

/**
 * Nombre de pales : on fait le tour d'un CERCLE centré sur l'axe et on compte
 * les passages vide → matière. Un profil de RAYON ne dirait rien (les bouts de
 * pale forment un disque plein, mesuré : symétrie indécidable) ; ce que l'on
 * traverse, si. La mesure est reprise à plusieurs rayons et l'on garde la
 * valeur la plus fréquente — une pale ne s'interrompt pas en chemin.
 */
function countBlades(
  wrap: SVGGElement,
  toLocal: DOMMatrix,
  ax: number,
  ay: number,
  radius: number
): number {
  const shapes: { el: SVGGeometryElement; inv: DOMMatrix }[] = [];
  for (const el of wrap.querySelectorAll<SVGGeometryElement>('path,circle,ellipse,rect,polygon')) {
    const ctm = el.getCTM();
    if (!ctm || typeof el.isPointInFill !== 'function') continue;
    shapes.push({ el, inv: toLocal.multiply(ctm).inverse() });
  }
  if (!shapes.length || !(radius > 0)) return BLADES_FALLBACK;
  const filled = (x: number, y: number): boolean =>
    shapes.some(({ el, inv }) =>
      el.isPointInFill(new DOMPoint(inv.a * x + inv.c * y + inv.e, inv.b * x + inv.d * y + inv.f))
    );
  const votes = new Map<number, number>();
  for (const frac of [0.5, 0.65, 0.8, 0.9]) {
    const r = radius * frac;
    const N = 360;
    let fronts = 0;
    let previous = filled(ax + r, ay);
    const first = previous;
    for (let i = 1; i <= N; i++) {
      const a = (i * 2 * Math.PI) / N;
      const here = i === N ? first : filled(ax + r * Math.cos(a), ay + r * Math.sin(a));
      if (here && !previous) fronts++;
      previous = here;
    }
    if (fronts >= 2) votes.set(fronts, (votes.get(fronts) ?? 0) + 1);
  }
  let best = BLADES_FALLBACK;
  let bestVotes = 0;
  for (const [pales, n] of votes) {
    if (n > bestVotes) {
      bestVotes = n;
      best = pales;
    }
  }
  return best;
}

/**
 * Cherche l'axe de l'hélice : les BOUTS de pale sont tous à la même distance de
 * l'axe, donc le centre du plus petit cercle contenant les contours EST l'axe.
 * On l'approche en se déplaçant vers le point le plus lointain d'un pas
 * décroissant. Le centre de la BOÎTE des pales ne convient pas : avec un nombre
 * impair de pales elle est dissymétrique (≈ 5 px de balourd sur ce dessin).
 */
function measureSpin(wrap: SVGGElement): { x: number; y: number; blades: number } | null {
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
  let far = 0;
  for (let i = 0; i < 300; i++) {
    let best = pts[0];
    far = -1;
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
  // `far` est le carré du rayon de l'hélice : le bout de pale le plus éloigné.
  return { x: ax - box.x, y: ay - box.y, blades: countBlades(wrap, toLocal, ax, ay, Math.sqrt(far)) };
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

  /** Pales trouvées dans le dessin (mesure de symétrie) — lecture seule. */
  get bladeCount(): number {
    return spin?.blades ?? BLADES_FALLBACK;
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
    if (!spin) spin = measureSpin(wrap);
    if (spin) wrap.style.transformOrigin = `${spin.x.toFixed(3)}px ${spin.y.toFixed(3)}px`;
    const turns = Number.isFinite(this.speed) ? Math.max(0, this.speed) : 0;
    // Un écran ne montre qu'une image tous les 1/60 s : au-delà d'un quart de
    // pale par image, l'hélice paraît RALENTIR puis tourner à l'envers, si bien
    // que baisser la tension l'accélérait. La rotation affichée est donc
    // plafonnée là, et c'est le flou de bougé qui dit la vitesse au-dessus —
    // exactement ce que voit l'œil sur un vrai ventilateur.
    const maxTurns = SCREEN_HZ / (spin?.blades ?? BLADES_FALLBACK) / ALIAS_MARGIN;
    const shown = Math.min(turns, maxTurns);
    // Durée d'un tour, arrondie vers le HAUT (au millième de seconde) : arrondir
    // vers le bas repasserait de justesse au-dessus du plafond. Vitesse nulle →
    // animation coupée (hélice figée).
    wrap.style.animationDuration = shown > 0 ? `${(Math.ceil(1000 / shown) / 1000).toFixed(3)}s` : '0s';
    wrap.style.animationPlayState = shown > 0 ? 'running' : 'paused';
    const excess = Math.max(0, Math.min(1, (turns - maxTurns) / Math.max(1, NOMINAL_TURNS_PER_S - maxTurns)));
    wrap.style.filter = excess > 0 ? `blur(${(excess * MAX_BLUR).toFixed(2)}px)` : '';
    wrap.style.opacity = excess > 0 ? (1 - excess * MAX_FADE).toFixed(3) : '';
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
