// Élément visuel maison <kablix-oscillo> : oscilloscope de table à deux prises
// banane (dessin de Frank ./externe/oscillo.svg, 220×270 px).
//
// L'ÉCRAN porte une grille de 10 carreaux sur 10, dessinée à la main : ses
// traits tombent tous les 19,82 px (et non 20), les deux axes au milieu. La
// trace suit CETTE grille au pixel près, sinon la courbe glisserait par rapport
// aux carreaux.
//
// DEUX BOUTONS, aiguille dessinée au repos sur la graduation « 0,1 » :
//  - VOLTS/DIV (à gauche) : cinq crans dessinés (0,1 · 0,5 · 1 · 2 · 5 volts par
//    carreau), 75° d'un cran à l'autre, avec butée aux deux bouts ;
//  - S/DIV (à droite) : SANS butée, il tourne tant qu'on veut. Vers la DROITE la
//    courbe se dilate (moins de secondes par carreau), vers la gauche elle se
//    rétracte. Un tour complet vaut un facteur 10, soit huit crans de 45°.
//
// EN SIMULATION : sim.mts appelle push(temps, volts) à chaque image ; la trace
// défile vers la gauche (le présent est au bord droit de l'écran) et le coin bas
// droit rappelle les deux calibres. Un point par image, donc ~60 par seconde :
// l'appareil montre les signaux lents, pas la forme d'une PWM à 500 Hz.
import drawing from './externe/oscillo.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const SCOPE_W = 220;
export const SCOPE_H = 270;

/** Grille DESSINÉE : 10 carreaux de 19,82 px, zéro au croisement des axes. */
const DIV = 19.82;
const PLOT = { x: 6.89, y: 9.76, w: 198.2, h: 198.2 };
const ZERO = { x: 105.99, y: 108.86 };

/** Coin bas droit de l'écran : rappel des deux calibres. */
const CAL = { x: 202, y: 204, size: 8 };

/** Couleur de la courbe : bleu franc, l'écran est gris clair et la grille noire. */
const TRACE_COLOR = '#1a5fb4';

/** Calibres verticaux : les cinq graduations du dessin, en volts par carreau. */
export const VOLTS_DIV: readonly number[] = [0.1, 0.5, 1, 2, 5];
/** Cran de départ : 1 V par carreau, le plus utile sur du 3,3 V / 5 V. */
const VOLTS_DEFAULT_INDEX = 2;
/** Écart angulaire entre deux graduations du dessin (l'aiguille au repos est
 *  déjà posée sur la première, à −150° : la rotation part donc de zéro). */
const STEP_DEG = 75;

type KnobRole = 'volts' | 'time';

/** Pivot des deux boutons, dans le repère local de leur groupe. */
const KNOB_PIVOT = { x: 243.68, y: 74.82 };
/** Aiguille et zone cliquable de chaque bouton (le reste ne tourne pas). */
const KNOBS: Record<KnobRole, { needle: string; cx: number; cy: number }> = {
  volts: { needle: 'path1704', cx: 131.21, cy: 233.92 },
  time: { needle: 'path2-6-0', cx: 173.58, cy: 233.92 },
};
/** Rayon de la zone cliquable posée sur un bouton (px du dessin). */
const KNOB_R = 11;

/** Bouton s/div : un tour = un facteur 10, en huit crans. */
const TIME_STEPS = 8;
const TIME_RATIO = Math.pow(10, 1 / TIME_STEPS);
/** Pas de butée dessinée, mais pas d'infini non plus : dix décades de chaque
 *  côté de la seconde suffisent largement à tout ce qui se simule. */
const SDIV_MIN = 1e-6;
const SDIV_MAX = 1e4;
export const SDIV_DEFAULT = 1;

/** Tampon de trace : ~68 s d'historique à 60 images/s. */
const BUF = 4096;
/** Une colonne de trace par pixel de large. */
const COLS = 199;

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

/** Trois chiffres utiles, virgule décimale, sans zéro inutile en queue. */
function fmt(x: number): string {
  const a = Math.abs(x);
  let s = x.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

/** Calibre horizontal dans l'unité qui parle : s, ms ou µs par carreau. */
function timeLabel(s: number): string {
  if (s >= 1) return `${fmt(s)} s/div`;
  if (s >= 1e-3) return `${fmt(s * 1e3)} ms/div`;
  return `${fmt(s * 1e6)} µs/div`;
}

/** Quatre chiffres utiles : l'attribut du schéma reste lisible, et un
 *  aller-retour sur le bouton retombe bien sur la valeur de départ. */
function round4(x: number): number {
  if (!Number.isFinite(x) || x === 0) return 0;
  const p = Math.pow(10, 3 - Math.floor(Math.log10(Math.abs(x))));
  return Math.round(x * p) / p;
}

export class OscilloElement extends HTMLElement {
  // Centres des prises banane du dessin (+ rouge à gauche, GND noire à droite).
  readonly pinInfo: PinInfo[] = [
    { name: '+', x: 40, y: 250, signals: [] },
    { name: 'GND', x: 60, y: 250, signals: [] },
  ];

  static get observedAttributes(): string[] {
    return ['voltsdiv', 'sdiv', 'simulating'];
  }

  private root: ShadowRoot;
  private rendered = false;
  // Tampon circulaire : temps (s) et tension (V) relevés à chaque image.
  private bufT = new Float64Array(BUF);
  private bufV = new Float64Array(BUF);
  private head = 0;
  private count = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  /** Cran du bouton Volts/Div : le plus proche de ce que dit l'attribut. */
  private get voltsIndex(): number {
    const v = Number(this.getAttribute('voltsdiv'));
    if (!Number.isFinite(v) || v <= 0) return VOLTS_DEFAULT_INDEX;
    let best = 0;
    for (let i = 1; i < VOLTS_DIV.length; i++) {
      if (Math.abs(VOLTS_DIV[i] - v) < Math.abs(VOLTS_DIV[best] - v)) best = i;
    }
    return best;
  }

  /** Calibre vertical : volts par carreau. */
  get voltsDiv(): number {
    return VOLTS_DIV[this.voltsIndex];
  }

  /** Calibre horizontal : secondes par carreau. */
  get secondsDiv(): number {
    const v = Number(this.getAttribute('sdiv'));
    if (!Number.isFinite(v) || v <= 0) return SDIV_DEFAULT;
    return Math.min(SDIV_MAX, Math.max(SDIV_MIN, v));
  }

  /** Un relevé de plus (temps en ms de simulation, tension en volts). Prises en
   *  l'air : le modèle rend `null`, il n'y a rien à tracer, on saute l'image. */
  push(tMs: number, volts: number | null): void {
    if (!this.rendered) return;
    if (!Number.isFinite(tMs) || volts === null || !Number.isFinite(volts)) return;
    this.bufT[this.head] = tMs / 1000;
    this.bufV[this.head] = volts;
    this.head = (this.head + 1) % BUF;
    if (this.count < BUF) this.count++;
    this.redraw();
  }

  /** Écran effacé (nouveau lancement de la simulation). */
  clearTrace(): void {
    this.head = 0;
    this.count = 0;
    if (this.rendered) this.redraw();
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
  }

  attributeChangedCallback(name: string, old: string | null, val: string | null): void {
    if (!this.rendered) return;
    // Nouveau lancement : l'écran repart vide, comme un appareil qu'on rallume.
    if (name === 'simulating' && old === null && val !== null) this.clearTrace();
    this.updateKnobs();
    this.updateCalibre();
    this.updateZones();
    this.redraw();
  }

  private render(): void {
    this.rendered = true;
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(SCOPE_W));
    svg.setAttribute('height', String(SCOPE_H));
    svg.setAttribute('viewBox', `0 0 ${SCOPE_W} ${SCOPE_H}`);

    const doc = new DOMParser().parseFromString(drawing.slice(drawing.indexOf('<svg')), 'image/svg+xml');
    if (doc.documentElement.nodeName.toLowerCase() === 'svg') {
      const inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(SCOPE_W));
      inner.setAttribute('height', String(SCOPE_H));
      svg.appendChild(inner);
    }

    // Fenêtre de tracé : la courbe ne doit jamais déborder de l'écran, même
    // quand le calibre est trop petit pour le signal.
    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.id = 'oscillo-clip';
    const cr = document.createElementNS(SVG_NS, 'rect');
    cr.setAttribute('x', String(PLOT.x));
    cr.setAttribute('y', String(PLOT.y));
    cr.setAttribute('width', String(PLOT.w));
    cr.setAttribute('height', String(PLOT.h));
    clip.appendChild(cr);
    defs.appendChild(clip);
    svg.appendChild(defs);

    const trace = document.createElementNS(SVG_NS, 'path');
    trace.id = 'oscillo-trace';
    trace.setAttribute('fill', 'none');
    trace.setAttribute('stroke', TRACE_COLOR);
    trace.setAttribute('stroke-width', '1.2');
    trace.setAttribute('stroke-linecap', 'round');
    trace.setAttribute('stroke-linejoin', 'round');
    trace.setAttribute('clip-path', 'url(#oscillo-clip)');
    svg.appendChild(trace);

    const cal = document.createElementNS(SVG_NS, 'text');
    cal.id = 'oscillo-calibre';
    cal.setAttribute('x', String(CAL.x));
    cal.setAttribute('y', String(CAL.y));
    cal.setAttribute('text-anchor', 'end');
    cal.setAttribute('font-size', String(CAL.size));
    cal.setAttribute('font-family', 'sans-serif');
    cal.setAttribute('fill', '#101010');
    svg.appendChild(cal);

    // Zones cliquables des deux boutons (simulation seulement, comme l'inter du
    // multimètre : en édition le clic sert à sélectionner et déplacer).
    // `data-no-export` : elles ne font pas partie du dessin de Frank.
    for (const role of Object.keys(KNOBS) as KnobRole[]) {
      const k = KNOBS[role];
      const zone = document.createElementNS(SVG_NS, 'circle');
      zone.id = `oscillo-zone-${role}`;
      zone.setAttribute('cx', String(k.cx));
      zone.setAttribute('cy', String(k.cy));
      zone.setAttribute('r', String(KNOB_R));
      zone.setAttribute('fill', 'transparent');
      zone.setAttribute('data-no-export', '');
      zone.addEventListener('pointerdown', (e) => this.onKnob(role, e as PointerEvent));
      zone.addEventListener('wheel', (e) => this.onWheel(role, e as WheelEvent), { passive: false });
      svg.appendChild(zone);
    }

    wrap.appendChild(svg);
    this.root.replaceChildren(wrap);

    // Groupe rotatif de chaque aiguille, RECRÉÉ à l'affichage : l'aiguille porte
    // déjà une matrix de placement, un `transform` posé dessus l'écraserait. Le
    // groupe porte la rotation, la matrix reste intacte. `data-unwrap-export` :
    // à l'export il est aplati, pour ne rien ajouter au dessin de Frank.
    for (const role of Object.keys(KNOBS) as KnobRole[]) {
      const needle = this.root.querySelector(`#${KNOBS[role].needle}`);
      if (!needle || !needle.parentNode) continue;
      const g = document.createElementNS(SVG_NS, 'g');
      g.id = `oscillo-aiguille-${role}`;
      g.setAttribute('data-unwrap-export', '');
      needle.parentNode.insertBefore(g, needle);
      g.appendChild(needle);
    }

    this.updateKnobs();
    this.updateCalibre();
    this.updateZones();
    this.redraw();
  }

  /** Clic sur un bouton : la moitié droite le tourne à droite, la gauche à
   *  gauche — comme un vrai bouton qu'on pousse d'un côté ou de l'autre. */
  private onKnob(role: KnobRole, e: PointerEvent): void {
    if (!this.hasAttribute('simulating')) return;
    e.preventDefault();
    e.stopPropagation();
    const box = (e.currentTarget as SVGCircleElement).getBoundingClientRect();
    this.turn(role, e.clientX >= box.x + box.width / 2 ? 1 : -1);
  }

  /** Molette sur un bouton : vers le haut = vers la droite. */
  private onWheel(role: KnobRole, e: WheelEvent): void {
    if (!this.hasAttribute('simulating')) return;
    e.preventDefault();
    e.stopPropagation();
    this.turn(role, e.deltaY < 0 ? 1 : -1);
  }

  /** Un cran de bouton : `dir` vaut +1 vers la droite, −1 vers la gauche. */
  private turn(role: KnobRole, dir: number): void {
    if (role === 'volts') {
      const i = Math.min(VOLTS_DIV.length - 1, Math.max(0, this.voltsIndex + dir));
      if (VOLTS_DIV[i] === this.voltsDiv) return;
      this.setAttribute('voltsdiv', String(VOLTS_DIV[i]));
    } else {
      // Vers la DROITE la courbe se dilate : moins de secondes par carreau.
      const brut = this.secondsDiv * (dir > 0 ? 1 / TIME_RATIO : TIME_RATIO);
      const v = round4(Math.min(SDIV_MAX, Math.max(SDIV_MIN, brut)));
      if (v === this.secondsDiv) return;
      this.setAttribute('sdiv', String(v));
    }
    // L'hôte enregistre le réglage dans le schéma (comme le mode du multimètre).
    this.dispatchEvent(new CustomEvent('scope-scale', {
      detail: { voltsdiv: this.voltsDiv, sdiv: this.secondsDiv },
      bubbles: true,
      composed: true,
    }));
  }

  private updateZones(): void {
    const curseur = this.hasAttribute('simulating') ? 'pointer' : '';
    for (const role of Object.keys(KNOBS) as KnobRole[]) {
      const zone = this.root.querySelector(`#oscillo-zone-${role}`) as SVGElement | null;
      if (zone) zone.style.cursor = curseur;
    }
  }

  /** Aiguilles : le cran dessiné pour les volts, la position dans la décade
   *  pour le temps (un tour complet = un facteur 10). */
  private updateKnobs(): void {
    const volts = this.root.querySelector('#oscillo-aiguille-volts') as SVGElement | null;
    if (volts) {
      volts.setAttribute('transform', `rotate(${this.voltsIndex * STEP_DEG} ${KNOB_PIVOT.x} ${KNOB_PIVOT.y})`);
    }
    const time = this.root.querySelector('#oscillo-aiguille-time') as SVGElement | null;
    if (time) {
      const tours = Math.log10(SDIV_DEFAULT / this.secondsDiv);
      const deg = (tours * TIME_STEPS * (360 / TIME_STEPS)).toFixed(2);
      time.setAttribute('transform', `rotate(${deg} ${KNOB_PIVOT.x} ${KNOB_PIVOT.y})`);
    }
  }

  /** Coin bas droit de l'écran : « Vert : 2 V/div | Hor : 1 s/div ». */
  private updateCalibre(): void {
    const el = this.root.querySelector('#oscillo-calibre');
    if (el) el.textContent = `Vert : ${fmt(this.voltsDiv)} V/div | Hor : ${timeLabel(this.secondsDiv)}`;
  }

  /** Trace la courbe : une colonne par pixel de large, chacune tirée du plus bas
   *  au plus haut vu dans ce pixel — c'est ce que fait un oscilloscope
   *  numérique, et c'est ce qui donne son épaisseur à un signal qui pulse. */
  private redraw(): void {
    const path = this.root.querySelector('#oscillo-trace') as SVGElement | null;
    if (!path) return;
    if (this.count === 0) {
      path.setAttribute('d', '');
      path.style.display = 'none';
      return;
    }
    const win = this.secondsDiv * 10;
    const t0 = this.bufT[(this.head - 1 + BUF) % BUF] - win;
    const perVolt = DIV / this.voltsDiv;
    const mins = new Float64Array(COLS);
    const maxs = new Float64Array(COLS);
    const vus = new Uint8Array(COLS);
    for (let n = 0; n < this.count; n++) {
      const i = (this.head - this.count + n + 2 * BUF) % BUF;
      const t = this.bufT[i];
      if (t < t0) continue;
      let c = Math.round(((t - t0) / win) * (COLS - 1));
      if (c < 0) c = 0;
      else if (c > COLS - 1) c = COLS - 1;
      const v = this.bufV[i];
      if (!vus[c]) {
        vus[c] = 1;
        mins[c] = v;
        maxs[c] = v;
      } else {
        if (v < mins[c]) mins[c] = v;
        if (v > maxs[c]) maxs[c] = v;
      }
    }
    const pas = PLOT.w / (COLS - 1);
    const y = (v: number): number => {
      const py = ZERO.y - v * perVolt;
      return py < PLOT.y ? PLOT.y : py > PLOT.y + PLOT.h ? PLOT.y + PLOT.h : py;
    };
    let d = '';
    for (let c = 0; c < COLS; c++) {
      if (!vus[c]) continue;
      const px = (PLOT.x + c * pas).toFixed(2);
      const haut = y(maxs[c]).toFixed(2);
      const bas = y(mins[c]).toFixed(2);
      d += `${d ? 'L' : 'M'}${px},${haut}`;
      if (haut !== bas) d += `L${px},${bas}`;
    }
    path.setAttribute('d', d);
    path.style.display = d ? '' : 'none';
  }
}

if (!customElements.get('kablix-oscillo')) {
  customElements.define('kablix-oscillo', OscilloElement);
}
