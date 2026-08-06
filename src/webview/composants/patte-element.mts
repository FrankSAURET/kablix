// Composant <kablix-patte> : patte de robot à 2 articulations (hanche, genou),
// PLACEHOLDER dessiné par Claude (pas par Frank — dessin ./externe/patte.svg à
// refaire une fois le robot araignée PMMA visible). Chaque articulation est un
// servo interne (0-180°, même formule que <kablix-servo>) : la hanche tourne le
// segment "cuisse", le genou tourne le segment "tibia" EMBOÎTÉ dans la cuisse
// (rotation SVG imbriquée : le pivot genou suit la cuisse automatiquement).
import { html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/patte.svg';

const cleanDrawing = drawing.replace(/<!--[\s\S]*?-->/g, '');

/** Extrait le groupe `<g id="ID" …> … </g>` complet (gère l'imbrication). */
function extractGroup(svgText: string, id: string): string {
  const open = new RegExp(`<g\\s+id="${id}"[^>]*>`);
  const m = open.exec(svgText);
  if (!m) return '';
  const start = m.index;
  let depth = 0;
  const tag = /<g\b[^>]*?(\/?)>|<\/g\s*>/g;
  tag.lastIndex = start;
  let t: RegExpExecArray | null;
  while ((t = tag.exec(svgText))) {
    if (t[0].startsWith('</g')) {
      depth--;
      if (depth === 0) return svgText.slice(start, t.index + t[0].length);
    } else if (t[1] !== '/') {
      depth++;
    }
  }
  return '';
}

const SEGMENT1 = extractGroup(cleanDrawing, 'segment1');
const SEGMENT2 = extractGroup(cleanDrawing, 'segment2');
// Pivots mécaniques (grille du dessin, viewBox 0 0 140 90) — fixes, PAS relus
// dynamiquement : dessin hardcodé par Claude, pas retouché par Frank.
const HIP = { x: 40, y: 45 };
const KNEE = { x: 85, y: 45 };

/** Anime UN angle vers sa consigne à vitesse limitée (rattrapage image par
 *  image) — même mécanique que <kablix-servo>, factorisée car la patte a DEUX
 *  articulations indépendantes (hanche, genou) tournant chacune à son rythme. */
class JointAnimator {
  shown = 90;
  private target = 90;
  private degPerSec = 0;
  private raf = 0;
  private timer = 0;
  private last = 0;

  constructor(private onFrame: () => void) {}

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.raf = 0;
    this.timer = 0;
  }

  sync(target: number, degPerSec: number): void {
    this.target = target;
    this.degPerSec = degPerSec;
    if (degPerSec <= 0) {
      this.stop();
      this.shown = target;
      return;
    }
    if (Math.abs(target - this.shown) < 0.01 || this.raf || this.timer) return;
    this.last = performance.now();
    this.schedule();
  }

  private schedule(): void {
    this.raf = requestAnimationFrame(this.frame);
    this.timer = window.setTimeout(this.frame, 32);
  }

  private frame = (): void => {
    this.stop();
    const now = performance.now();
    const dt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    const delta = this.target - this.shown;
    const maxStep = this.degPerSec * dt;
    if (Math.abs(delta) <= maxStep) {
      this.shown = this.target;
    } else {
      this.shown += Math.sign(delta) * maxStep;
      this.schedule();
    }
    this.onFrame();
  };
}

export class PatteElement extends LitElement {
  /** Consigne d'angle (0-180°, 90° = patte tendue) de chaque articulation. */
  declare hipAngle: number;
  declare kneeAngle: number;
  /** Temps d'un tour complet (360°) à pleine vitesse, en secondes. 0 = instantané. */
  declare speed: number;

  static properties = {
    hipAngle: {},
    kneeAngle: {},
    speed: { type: Number },
    hipShown: { state: true },
    kneeShown: { state: true },
  };

  declare hipShown: number;
  declare kneeShown: number;
  private hip = new JointAnimator(() => { this.hipShown = this.hip.shown; });
  private knee = new JointAnimator(() => { this.kneeShown = this.knee.shown; });

  constructor() {
    super();
    this.hipAngle = 90;
    this.kneeAngle = 90;
    this.speed = 2;
    this.hipShown = 90;
    this.kneeShown = 90;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.hip.stop();
    this.knee.stop();
  }

  willUpdate(changed: Map<string, unknown>): void {
    if (!changed.has('hipAngle') && !changed.has('kneeAngle') && !changed.has('speed')) return;
    const degPerSec = this.degPerSec();
    this.hip.sync(this.clampAngle(this.hipAngle), degPerSec);
    this.knee.sync(this.clampAngle(this.kneeAngle), degPerSec);
  }

  private clampAngle(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(180, n)) : 90;
  }

  private degPerSec(): number {
    const s = Number(this.speed);
    if (!Number.isFinite(s) || s <= 0) return 0;
    return 360 / s;
  }

  // Broches : 2 connecteurs 3 fils (hanche, genou), calés en dehors de la zone
  // mécanique (colonne x=10, grille 10 px). Non dessinées dans le SVG (comme la
  // diode) : la pastille est posée génériquement par l'éditeur.
  readonly pinInfo: ElementPin[] = [
    { name: 'hanche.GND', x: 10, y: 10, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'hanche.V+', x: 10, y: 20, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'hanche.PWM', x: 10, y: 30, signals: [{ type: 'pwm' }] },
    { name: 'genou.GND', x: 10, y: 55, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'genou.V+', x: 10, y: 65, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'genou.PWM', x: 10, y: 75, signals: [{ type: 'pwm' }] },
  ];

  render() {
    // 90° = patte tendue (les deux segments alignés) : la commande est décalée
    // de -90° pour que 90° donne une rotation visuelle nulle.
    return html`
      <svg width="140" height="90" viewBox="0 0 140 90" xmlns="http://www.w3.org/2000/svg">
        <g transform=${`rotate(${(this.hipShown ?? 90) - 90} ${HIP.x} ${HIP.y})`}>
          ${unsafeSVG(SEGMENT1)}
          <g transform=${`rotate(${(this.kneeShown ?? 90) - 90} ${KNEE.x} ${KNEE.y})`}>
            ${unsafeSVG(SEGMENT2)}
          </g>
        </g>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-patte')) {
  customElements.define('kablix-patte', PatteElement);
}
