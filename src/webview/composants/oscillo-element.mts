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
// DÉCLENCHEMENT (v2026.8.102.31) : sans lui la courbe glisse sans arrêt, parce
// que chaque image commence là où le hasard l'a laissée. L'appareil cale donc le
// début de l'écran sur un passage du signal par une TENSION DE DÉCLENCHEMENT,
// toujours dans le même sens — comme on recale un film sur la même image. Deux
// réglages :
//  - le petit BOUTON du dessin (`trigger-button`) choisit le sens : sa moitié
//    bleue en haut = front montant, en bas = front descendant ;
//  - le CURSEUR au bord gauche de l'écran donne la tension. Tant qu'on n'y
//    touche pas, il se pose tout seul à mi-hauteur du signal.
// Sans passage trouvé (tension continue), la trace redéfile comme avant.
//
// EN SIMULATION : les trois lignes du cartouche `text-info` du dessin rappellent
// les deux calibres et la tension de déclenchement.
//
// ÉCHANTILLONNAGE (v2026.8.102.36) : quand la prise « + » est posée sur une
// broche de la carte, c'est le MOTEUR qui date chaque bascule du signal, au
// cycle près, et sim.mts verse la salve par `pushMany`. Avant, la page prenait
// un point par image — 60 par seconde : un signal de quelques centaines de
// hertz était pris n'importe où dans sa période et la courbe sautait d'une image
// à l'autre (retour de Frank). Ailleurs dans le montage (pont diviseur, bornes
// d'un condensateur), il n'y a pas de broche à sonder : l'appareil retombe sur
// un point par image, et ces signaux-là sont lents.
import drawing from './externe/oscillo.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const SCOPE_W = 220;
export const SCOPE_H = 270;

/** Grille DESSINÉE : 10 carreaux de 19,82 px, zéro au croisement des axes. */
const DIV = 19.82;
const PLOT = { x: 10.34, y: 9.76, w: 198.2, h: 198.2 };
const ZERO = { x: 109.44, y: 108.86 };

/** Cartouche de texte DESSINÉ sous l'écran : trois lignes empilées (calibre
 *  vertical, calibre horizontal, tension de déclenchement). */
const INFO_ID = 'text-info';

/** Bouton de sens du déclenchement : le rectangle gris et sa moitié bleue, qui
 *  descend d'une demi-hauteur pour dire « front descendant ». */
const TRIG_BTN = 'trigger-button';
const TRIG_MOVER = 'trigger-button-mover';
/** Zone cliquable posée sur ce bouton (px du dessin, mesurés au rendu). */
const TRIG_ZONE = { x: 178.6, y: 223.7, w: 10.5, h: 24 };

/** Curseur de déclenchement : petit triangle collé au bord gauche de l'écran. */
const TRIG_CURSOR_W = 7;

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
const KNOB_PIVOT = { x: 243.662, y: 74.82 };
/** Aiguille et zone cliquable de chaque bouton (le reste ne tourne pas). */
const KNOBS: Record<KnobRole, { needle: string; cx: number; cy: number }> = {
  volts: { needle: 'path1704', cx: 129.3, cy: 233.01 },
  time: { needle: 'path2-6-0', cx: 161.87, cy: 233.01 },
};
/** Rayon de la zone cliquable posée sur un bouton (px du dessin). */
const KNOB_R = 11;

/** Bouton s/div : un tour = un facteur 10, en trois crans (voir SDIV_STEPS). */
const TIME_STEPS = 3;
/** Pas de butée dessinée, mais pas d'infini non plus : dix décades de chaque
 *  côté de la seconde suffisent largement à tout ce qui se simule. */
const SDIV_MIN = 1e-6;
const SDIV_MAX = 1e4;
/**
 * Crans du bouton s/div : la suite **1 - 2 - 5** par décade, celle de tous les
 * oscilloscopes de paillasse (0,1 ms, 0,2 ms, 0,5 ms, 1 ms, 2 ms, 5 ms, 10 ms…).
 * Le bouton avançait avant d'un huitième de décade à la fois, ce qui donnait des
 * « calibres » comme 1,778 ms/div — illisibles et introuvables sur un vrai
 * appareil (retour de Frank).
 */
export const SDIV_STEPS: readonly number[] = (() => {
  const out: number[] = [];
  for (let e = -6; e <= 4; e++) {
    for (const m of [1, 2, 5]) {
      const v = round4(m * Math.pow(10, e));
      if (v >= SDIV_MIN && v <= SDIV_MAX) out.push(v);
    }
  }
  return out;
})();
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
    { name: '+', x: 50, y: 250, signals: [] },
    { name: 'GND', x: 70, y: 250, signals: [] },
  ];

  static get observedAttributes(): string[] {
    return ['voltsdiv', 'sdiv', 'trigger', 'triggeredge', 'simulating'];
  }

  private root: ShadowRoot;
  private rendered = false;
  // Tampon circulaire : temps (s) et tension (V) relevés à chaque image.
  private bufT = new Float64Array(BUF);
  private bufV = new Float64Array(BUF);
  private head = 0;
  /**
   * Vrai quand les relevés viennent de la SONDE du moteur (pushMany) : ce sont
   * des bascules datées, le signal ne bouge pas entre deux, donc la courbe tient
   * son palier puis saute d'un coup. Faux pour la mesure par image (push) : là
   * les points sont des instantanés d'un signal qui varie sans arrêt, et les
   * relier en pente est ce qu'il faut faire.
   */
  private hold = false;
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

  /** Sens du front qui déclenche : montant (défaut) ou descendant. */
  get triggerEdge(): 'rising' | 'falling' {
    return this.getAttribute('triggeredge') === 'falling' ? 'falling' : 'rising';
  }

  /** Tension de déclenchement RÉGLÉE À LA MAIN, ou null tant que le curseur n'a
   *  pas été touché — dans ce cas elle se pose à mi-hauteur du signal. */
  get triggerVolts(): number | null {
    const s = this.getAttribute('trigger');
    // Attribut ABSENT ou VIDE : personne n'a touché au curseur, il se pose tout
    // seul. Une valeur vide n'est surtout pas « 0 V » — le schéma part avec.
    if (s === null || s.trim() === '') return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }

  /** Rang du calibre horizontal dans SDIV_STEPS (le cran le plus proche). */
  private get sdivIndex(): number {
    const v = Number(this.getAttribute('sdiv'));
    if (!Number.isFinite(v) || v <= 0) return SDIV_STEPS.indexOf(SDIV_DEFAULT);
    let best = 0;
    for (let i = 1; i < SDIV_STEPS.length; i++) {
      // Comparaison en RAPPORT et non en écart : d'une décade à l'autre les
      // valeurs n'ont pas du tout la même taille, et 1 s serait toujours « plus
      // proche » que 2 µs de n'importe quoi.
      if (Math.abs(Math.log(SDIV_STEPS[i] / v)) < Math.abs(Math.log(SDIV_STEPS[best] / v))) best = i;
    }
    return best;
  }

  /** Calibre horizontal : secondes par carreau, toujours un cran 1 - 2 - 5. */
  get secondsDiv(): number {
    return SDIV_STEPS[this.sdivIndex];
  }

  /** Un relevé de plus (temps en ms de simulation, tension en volts). Prises en
   *  l'air : le modèle rend `null`, il n'y a rien à tracer, on saute l'image. */
  push(tMs: number, volts: number | null): void {
    if (volts === null) return;
    this.hold = false;
    this.verser([tMs, volts]);
  }

  /**
   * Une SALVE de relevés d'un coup, à plat ([ms, volts, ms, volts…]) : c'est ce
   * que rend la sonde du moteur, qui date chaque bascule du signal au cycle
   * près. L'écran n'est redessiné qu'UNE fois pour toute la salve — un redessin
   * par point coûterait des milliers de tracés par seconde.
   */
  pushMany(flat: ArrayLike<number>): void {
    this.hold = true;
    this.verser(flat);
  }

  private verser(flat: ArrayLike<number>): void {
    if (!this.rendered || flat.length < 2) return;
    let pris = 0;
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const tMs = flat[i];
      const volts = flat[i + 1];
      if (!Number.isFinite(tMs) || !Number.isFinite(volts)) continue;
      this.bufT[this.head] = tMs / 1000;
      this.bufV[this.head] = volts;
      this.head = (this.head + 1) % BUF;
      if (this.count < BUF) this.count++;
      pris++;
    }
    if (pris === 0) return;
    this.redraw();
    // Curseur POSÉ TOUT SEUL : il suit la mi-hauteur du signal, qui change à
    // chaque image. Réglé à la main, il ne bouge plus : rien à refaire.
    if (this.triggerVolts === null) {
      this.updateTrigger();
      this.updateCalibre();
    }
  }

  /** Écran effacé (nouveau lancement de la simulation). */
  clearTrace(): void {
    this.head = 0;
    this.count = 0;
    this.hold = false;
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
    this.updateTrigger();
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

    // Curseur de déclenchement : petit triangle collé au bord gauche de l'écran,
    // à la hauteur de la tension qui déclenche. Il se prend à la souris.
    // `data-no-export` : il ne fait pas partie du dessin de Frank.
    const curseur = document.createElementNS(SVG_NS, 'path');
    curseur.id = 'oscillo-trigger-cursor';
    curseur.setAttribute('fill', TRACE_COLOR);
    curseur.setAttribute('data-no-export', '');
    curseur.addEventListener('pointerdown', (e) => this.onCursor(e as PointerEvent));
    svg.appendChild(curseur);

    // Zone cliquable du bouton de sens (montant / descendant).
    const zoneTrig = document.createElementNS(SVG_NS, 'rect');
    zoneTrig.id = 'oscillo-zone-trigger';
    zoneTrig.setAttribute('x', String(TRIG_ZONE.x));
    zoneTrig.setAttribute('y', String(TRIG_ZONE.y));
    zoneTrig.setAttribute('width', String(TRIG_ZONE.w));
    zoneTrig.setAttribute('height', String(TRIG_ZONE.h));
    zoneTrig.setAttribute('fill', 'transparent');
    zoneTrig.setAttribute('data-no-export', '');
    zoneTrig.addEventListener('pointerdown', (e) => this.onTriggerButton(e as PointerEvent));
    svg.appendChild(zoneTrig);

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
    this.updateTrigger();
    this.updateCalibre();
    this.updateZones();
    this.redraw();
  }

  /** Clic sur le bouton de sens : montant ↔ descendant, comme un inverseur. */
  private onTriggerButton(e: PointerEvent): void {
    if (!this.hasAttribute('simulating')) return;
    e.preventDefault();
    e.stopPropagation();
    this.setAttribute('triggeredge', this.triggerEdge === 'rising' ? 'falling' : 'rising');
    this.announce();
  }

  /** Curseur de déclenchement pris à la souris : il suit le doigt tant qu'on ne
   *  lâche pas, et la tension se lit sur la graduation verticale de l'écran. */
  private onCursor(e: PointerEvent): void {
    if (!this.hasAttribute('simulating')) return;
    e.preventDefault();
    e.stopPropagation();
    const cible = e.currentTarget as SVGElement;
    const svg = cible.ownerSVGElement;
    if (!svg) return;
    const suivre = (ev: PointerEvent): void => {
      const boite = svg.getBoundingClientRect();
      // Le dessin est posé à l'échelle 1:1 dans une boîte de SCOPE_H de haut :
      // la règle de trois suffit à repasser des pixels d'écran à ceux du dessin.
      const yDessin = ((ev.clientY - boite.top) / boite.height) * SCOPE_H;
      const volts = (ZERO.y - yDessin) / (DIV / this.voltsDiv);
      this.setAttribute('trigger', String(round4(volts)));
      this.updateTrigger();
      this.updateCalibre();
      this.redraw();
    };
    const lacher = (): void => {
      window.removeEventListener('pointermove', suivre);
      window.removeEventListener('pointerup', lacher);
      this.announce();
    };
    window.addEventListener('pointermove', suivre);
    window.addEventListener('pointerup', lacher);
    suivre(e);
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
      const i = Math.min(SDIV_STEPS.length - 1, Math.max(0, this.sdivIndex - dir));
      const v = SDIV_STEPS[i];
      if (v === this.secondsDiv) return;
      this.setAttribute('sdiv', String(v));
    }
    this.announce();
  }

  /** L'hôte enregistre les réglages dans le schéma (comme le mode du multimètre). */
  private announce(): void {
    this.dispatchEvent(new CustomEvent('scope-scale', {
      detail: {
        voltsdiv: this.voltsDiv,
        sdiv: this.secondsDiv,
        trigger: this.getAttribute('trigger') ?? '',
        triggeredge: this.triggerEdge,
      },
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
    const zt = this.root.querySelector('#oscillo-zone-trigger') as SVGElement | null;
    if (zt) zt.style.cursor = curseur;
    const cur = this.root.querySelector('#oscillo-trigger-cursor') as SVGElement | null;
    if (cur) cur.style.cursor = this.hasAttribute('simulating') ? 'ns-resize' : '';
  }

  /**
   * Tension à laquelle la trace se cale. Réglée à la main, c'est celle du
   * curseur ; sinon elle se pose À MI-HAUTEUR du signal vu à l'écran, ce qui
   * tombe juste sur à peu près tout (créneau, sinus, dent de scie).
   */
  private triggerLevel(): number {
    const regle = this.triggerVolts;
    if (regle !== null) return regle;
    const bornes = this.envelope();
    return bornes ? (bornes.min + bornes.max) / 2 : 0;
  }

  /** Plus basse et plus haute tension de la fenêtre affichée, ou null si vide. */
  private envelope(): { min: number; max: number } | null {
    if (this.count === 0) return null;
    const fin = this.bufT[(this.head - 1 + BUF) % BUF];
    const debut = fin - this.secondsDiv * 10;
    let min = Infinity;
    let max = -Infinity;
    for (let n = 0; n < this.count; n++) {
      const i = (this.head - this.count + n + 2 * BUF) % BUF;
      if (this.bufT[i] < debut) continue;
      const v = this.bufV[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return min <= max ? { min, max } : null;
  }

  /** Bouton de sens et curseur latéral remis à leur place. */
  private updateTrigger(): void {
    // Moitié bleue du bouton : en haut pour le front montant, descendue d'une
    // demi-hauteur (la sienne) pour le descendant.
    const mover = this.root.querySelector(`#${TRIG_MOVER}`) as SVGRectElement | null;
    if (mover) {
      const h = mover.height?.baseVal?.value ?? 0;
      mover.setAttribute('transform', this.triggerEdge === 'falling' ? `translate(0,${h})` : 'translate(0,0)');
    }
    const cur = this.root.querySelector('#oscillo-trigger-cursor') as SVGElement | null;
    if (!cur) return;
    const y = Math.min(PLOT.y + PLOT.h, Math.max(PLOT.y, ZERO.y - this.triggerLevel() * (DIV / this.voltsDiv)));
    const x = PLOT.x;
    cur.setAttribute('d', `M${x},${(y - TRIG_CURSOR_W / 2).toFixed(2)}L${x + TRIG_CURSOR_W},${y.toFixed(2)}L${x},${(y + TRIG_CURSOR_W / 2).toFixed(2)}Z`);
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

  /** Cartouche DESSINÉ sous l'écran : trois lignes empilées, dans l'ordre où
   *  Frank les a posées (calibre vertical, calibre horizontal, déclenchement). */
  private updateCalibre(): void {
    const info = this.root.querySelector(`#${INFO_ID}`);
    if (!info) return;
    const lignes = info.querySelectorAll('tspan');
    const textes = [
      `Vert : ${fmt(this.voltsDiv)} V/div`,
      `Hor : ${timeLabel(this.secondsDiv)}`,
      `Dec : ${fmt(this.triggerLevel())} V`,
    ];
    for (let i = 0; i < lignes.length && i < textes.length; i++) lignes[i].textContent = textes[i];
  }

  /** Trace la courbe : une colonne par pixel de large, chacune tirée du plus bas
   *  au plus haut vu dans ce pixel — c'est ce que fait un oscilloscope
   *  numérique, et c'est ce qui donne son épaisseur à un signal qui pulse. */
  /**
   * Instant posé au BORD GAUCHE de l'écran. Sans déclenchement, c'est « il y a
   * une largeur d'écran » : la trace défile, le présent au bord droit. Avec, on
   * remonte le temps jusqu'au dernier passage du signal par la tension de
   * déclenchement, dans le bon sens, ET assez ancien pour qu'un écran entier
   * tienne derrière : la courbe se redessine alors toujours au même endroit,
   * comme un film recalé sur la même image. Aucun passage (tension continue) :
   * on redéfile, mieux vaut une trace qui glisse qu'un écran vide.
   */
  private windowStart(win: number): number {
    const fin = this.bufT[(this.head - 1 + BUF) % BUF];
    const defaut = fin - win;
    if (this.count < 2) return defaut;
    const niveau = this.triggerLevel();
    const monte = this.triggerEdge === 'rising';
    for (let n = this.count - 1; n >= 1; n--) {
      const i = (this.head - this.count + n + 2 * BUF) % BUF;
      const t = this.bufT[i];
      if (t > defaut) continue; // trop récent : il manquerait la fin de l'écran
      const j = (i - 1 + BUF) % BUF;
      const a = this.bufV[j];
      const b = this.bufV[i];
      if (monte ? a < niveau && b >= niveau : a > niveau && b <= niveau) return t;
    }
    return defaut;
  }

  private redraw(): void {
    const path = this.root.querySelector('#oscillo-trace') as SVGElement | null;
    if (!path) return;
    if (this.count === 0) {
      path.setAttribute('d', '');
      path.style.display = 'none';
      return;
    }
    const win = this.secondsDiv * 10;
    const t0 = this.windowStart(win);
    const perVolt = DIV / this.voltsDiv;
    const mins = new Float64Array(COLS);
    const maxs = new Float64Array(COLS);
    // Première et dernière valeur de la colonne : en mode retenue elles disent
    // par où la plume entre et par où elle sort, donc dans quel sens tracer le
    // saut vertical et quel palier tenir jusqu'à la colonne suivante.
    const debuts = new Float64Array(COLS);
    const fins = new Float64Array(COLS);
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
        debuts[c] = v;
      } else {
        if (v < mins[c]) mins[c] = v;
        if (v > maxs[c]) maxs[c] = v;
      }
      fins[c] = v;
    }
    const pas = PLOT.w / (COLS - 1);
    const y = (v: number): number => {
      const py = ZERO.y - v * perVolt;
      return py < PLOT.y ? PLOT.y : py > PLOT.y + PLOT.h ? PLOT.y + PLOT.h : py;
    };
    let d = '';
    // Dernière tension tracée (mode retenue) : c'est le palier que tient la
    // courbe jusqu'à la colonne suivante.
    let tenu: number | null = null;
    for (let c = 0; c < COLS; c++) {
      if (!vus[c]) continue;
      const px = (PLOT.x + c * pas).toFixed(2);
      const haut = y(maxs[c]).toFixed(2);
      const bas = y(mins[c]).toFixed(2);
      if (!this.hold) {
        d += `${d ? 'L' : 'M'}${px},${haut}`;
        if (haut !== bas) d += `L${px},${bas}`;
        continue;
      }
      // Signal daté front par front : entre deux colonnes vues, le signal n'a
      // PAS bougé. On rejoint donc la colonne à plat, puis on saute d'un coup.
      // Sans ce palier, un créneau se dessinait en pente d'un front au suivant :
      // il ressemblait à un triangle (retour de Frank sur oscillo-pico2).
      if (!d) d += `M${px},${y(debuts[c]).toFixed(2)}`;
      else if (tenu !== null) d += `L${px},${y(tenu).toFixed(2)}`;
      if (haut !== bas) {
        // Ordre du saut : la plume doit FINIR sur la dernière tension de la
        // colonne, sinon le palier suivant repartirait du mauvais bord.
        const fin = y(fins[c]);
        const versHaut = Math.abs(fin - Number(haut)) <= Math.abs(fin - Number(bas));
        d += `L${px},${versHaut ? bas : haut}L${px},${versHaut ? haut : bas}`;
      } else {
        d += `L${px},${haut}`;
      }
      tenu = fins[c];
    }
    path.setAttribute('d', d);
    path.style.display = d ? '' : 'none';
  }
}

if (!customElements.get('kablix-oscillo')) {
  customElements.define('kablix-oscillo', OscilloElement);
}
