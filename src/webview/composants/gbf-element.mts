// Élément visuel maison <kablix-gbf> : générateur BF (générateur de fonctions)
// réglable — dessin de Frank ./externe/GBF.svg, 160×140 px. Deux bornes banane
// Vs / GND (pastilles sur la grille, espacées de 20 px).
//
// Le dessin porte QUATRE boutons rotatifs (Décalage, Rapport cyclique,
// Amplitude, Fréquence), leurs quatre afficheurs de valeur, et un curseur à
// trois crans qui choisit la forme (sinus en haut, triangle, carré en bas).
// Tout se règle À LA SOURIS EN SIMULATION, comme sur l'appareil de la salle de
// TP : c'est le geste qui compte, et les propriétés de l'inspecteur ne servent
// qu'à fixer l'état de DÉPART.
//
// Plages demandées par Frank (et bornes de l'inspecteur) :
//   fréquence       1 Hz .. 1 MHz, au Hz près     — course LOGARITHMIQUE
//   amplitude       0 .. 10 V, au dixième de volt — crête (pas crête-à-crête)
//   décalage        −5 .. +5 V, au dixième
//   rapport cyclique 0 .. 100 %, au pourcent     — déforme carré ET triangle
//
// La fréquence est le seul réglage à course logarithmique, et il le faut : six
// décades sur 300° donneraient 3 300 Hz par degré en linéaire — le premier
// degré de rotation sauterait déjà par-dessus toute la plage audio, et aucun
// réglage fin ne serait possible en bas de plage. En log, chaque demi-tour
// multiplie la fréquence par le même facteur, ce qui est le comportement d'un
// vrai GBF (ses décades sont gravées sur le cadran).
//
// Le signal lui-même est calculé par le MOTEUR, pas ici : voir
// `engines/analog-waves.mts` (`kind: 'gbf'`). À 1 MHz une période dure 1 µs,
// soit seize mille périodes entre deux images — une valeur posée par frame
// n'aurait aucun sens, seule l'évaluation à l'instant de la conversion ADC en a.
import { t } from '../i18n.mjs';
import drawing from './externe/GBF.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const GBF_W = 160;
export const GBF_H = 140;

/** Formes disponibles, dans l'ordre du curseur du dessin (haut → bas). */
export type GbfForme = 'sinus' | 'triangle' | 'carre';
const FORMES: readonly GbfForme[] = ['sinus', 'triangle', 'carre'];

/** Cadran commun aux quatre boutons : minimum à 120° (bas-gauche), 300° horaire. */
const DIAL_ZERO_DEG = 120;
const DIAL_SPAN_DEG = 300;
/** Rayon de la zone cliquable d'un bouton (les boutons font 33,7 px de large). */
const KNOB_R = 19;

/** Bornes des quatre réglages (ordre : min, max, pas d'arrondi). */
const FREQ_MIN = 1;
const FREQ_MAX = 1_000_000;
const AMPL_MAX = 10;
const OFFSET_ABS = 5;

/**
 * Un bouton du dessin : son groupe SVG, l'afficheur qui le suit, le centre
 * mesuré dans le viewBox livré (px, pour la zone de clic et l'angle souris) et
 * le MÊME centre dans le repère du parent (mm de la planche Inkscape) pour
 * `transform-origin`.
 *
 * Les deux repères sont nécessaires et ne se confondent pas : le groupe de
 * rotation est inséré comme FRÈRE du groupe `bouton-*`, il vit donc dans le
 * repère de leur parent — sous le matrix mm→px du dessin. Une origine donnée en
 * pixels du viewBox y serait 3,78 fois trop petite et le bouton pivoterait
 * autour d'un point situé hors de l'appareil.
 *
 * Les identifiants viennent d'Inkscape, qui remplace les accents par `__` :
 * `bouton-d__calage` est bien « bouton-décalage ». On ne les renomme pas — ce
 * sont ceux du dessin de Frank, et les retoucher romprait le lien avec sa
 * planche à la prochaine réextraction.
 */
interface Knob {
  reglage: 'freq' | 'duty' | 'amplitude' | 'offset';
  groupe: string;
  valeur: string;
  cx: number;
  cy: number;
  origine: string;
}

const KNOBS: readonly Knob[] = [
  {
    reglage: 'offset', groupe: 'bouton-d__calage', valeur: 'valeur_d__calage',
    cx: 32.85, cy: 34.04, origine: '280.950px 248.707px',
  },
  {
    reglage: 'duty', groupe: 'bouton-rapport__cyclique', valeur: 'valeur_rapport_cyclique',
    cx: 81.99, cy: 34.04, origine: '293.951px 248.707px',
  },
  {
    reglage: 'amplitude', groupe: 'bouton-amplitude', valeur: 'valeur_amplitude',
    cx: 32.85, cy: 84.25, origine: '280.950px 261.992px',
  },
  {
    reglage: 'freq', groupe: 'bouton-fr__quence', valeur: 'valeur-fr__quence',
    cx: 81.99, cy: 84.25, origine: '293.951px 261.992px',
  },
];

/** Curseur de forme : rail gris et bouton bleu qui coulisse par crans de 12 px. */
const SLIDER_KNOB = 'rect3092';
const SLIDER_X = 114.99;
const SLIDER_Y = 41.04;
const SLIDER_W = 10.5;
const SLIDER_H = 36;
/** Un cran, en PIXELS du viewBox (le rail fait trois crans de 12 px). */
const SLIDER_STEP = 12;
/** Le même cran en MILLIMÈTRES de la planche : c'est la hauteur du rect3092
 *  (3,175 mm = un tiers du rail), et c'est dans ce repère que vit le curseur. */
const SLIDER_STEP_MM = 3.175;

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

/**
 * Pas de réglage de la fréquence, en Hz, selon la plage où l'on se trouve.
 *
 * Un pas CONSTANT ne convient pas sur six décades : au Hz près, il faudrait un
 * million de crans pour monter à 1 MHz ; au kHz près, on ne pourrait plus régler
 * le bas de la plage, où 1 Hz d'écart s'entend. Le pas grossit donc avec la
 * fréquence, comme sur un vrai générateur (plages demandées par Frank, .92) :
 *   1 Hz en dessous de 100 Hz · 10 Hz jusqu'à 10 kHz · 100 Hz au-delà.
 */
function pasDeFreq(hz: number): number {
  if (hz < 100) return 1;
  if (hz < 10_000) return 10;
  return 100;
}

/** Fréquence (Hz) ↔ fraction de course (0..1), en logarithmique. */
function freqDepuisFraction(f: number): number {
  const decades = Math.log10(FREQ_MAX / FREQ_MIN);
  const brute = FREQ_MIN * Math.pow(10, f * decades);
  // Arrondi au pas de SA plage, celle de la valeur brute : arrondir d'abord au
  // Hz puis chercher le pas ferait bégayer la valeur juste sous un seuil.
  const pas = pasDeFreq(brute);
  const cale = Math.round(brute / pas) * pas;
  return Math.max(FREQ_MIN, Math.min(FREQ_MAX, cale));
}
function fractionDepuisFreq(hz: number): number {
  const decades = Math.log10(FREQ_MAX / FREQ_MIN);
  const borne = Math.max(FREQ_MIN, Math.min(FREQ_MAX, hz));
  return Math.log10(borne / FREQ_MIN) / decades;
}

/**
 * Fréquence écrite comme sur un appareil : l'unité suit la valeur (1 Hz,
 * 250 Hz, 12,5 kHz, 1 MHz) et non pas « 1000000 Hz », illisible sur un cadran
 * de 20 px. Trois chiffres significatifs, virgule décimale française (celle du
 * dessin de Frank, qui écrit déjà « 3,8 V »).
 */
export function formaterFreq(hz: number): string {
  const [valeur, unite] = hz >= 1_000_000 ? [hz / 1_000_000, 'MHz'] : hz >= 1000 ? [hz / 1000, 'kHz'] : [hz, 'Hz'];
  const texte = valeur >= 100 ? valeur.toFixed(0) : valeur >= 10 ? valeur.toFixed(1) : valeur.toFixed(2);
  return `${texte.replace(/[.,]?0+$/, '').replace('.', ',')} ${unite}`;
}

export class GbfElement extends HTMLElement {
  // Centres des bornes du dessin (Vs à gauche, GND à droite), mesurés par
  // l'extracteur. Le GBF est une SOURCE : sa masse est une masse du montage.
  readonly pinInfo: PinInfo[] = [
    { name: 'Vs', x: 70, y: 120, signals: [{ type: 'analog', signal: 'OUT' }] },
    { name: 'GND', x: 90, y: 120, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  static get observedAttributes(): string[] {
    return ['frequency', 'amplitude', 'offset', 'duty', 'waveform', 'simulating'];
  }

  /** Réglages courants : suivent les boutons en simulation, les attributs sinon. */
  freq = 1000;
  amplitude = 5;
  offset = 0;
  duty = 50;
  forme: GbfForme = 'sinus';

  private root: ShadowRoot;
  private rendered = false;
  /** Bouton en cours de rotation (null = aucun) ; le curseur de forme n'en est pas. */
  private dragging: Knob | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
  }

  attributeChangedCallback(): void {
    if (!this.rendered) return;
    // Nouveau réglage de départ (inspecteur) ou entrée/sortie de simulation : on
    // repart des attributs. Les boutons tournés à la souris ne sont donc PAS
    // recopiés dans le projet — c'est voulu : l'appareil se règle à chaque
    // séance, sa position de départ est la consigne de l'énoncé.
    this.lireAttributs();
    this.updateVisuals();
  }

  private lireAttributs(): void {
    const nombre = (nom: string, defaut: number, min: number, max: number): number => {
      const v = Number(this.getAttribute(nom));
      return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : defaut;
    };
    this.freq = nombre('frequency', 1000, FREQ_MIN, FREQ_MAX);
    this.amplitude = nombre('amplitude', 5, 0, AMPL_MAX);
    this.offset = nombre('offset', 0, -OFFSET_ABS, OFFSET_ABS);
    this.duty = nombre('duty', 50, 0, 100);
    const w = (this.getAttribute('waveform') ?? '') as GbfForme;
    this.forme = FORMES.includes(w) ? w : 'sinus';
  }

  private render(): void {
    this.rendered = true;
    this.lireAttributs();
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';

    // SVG englobant au repère 1:1 (px du dessin) : les zones de clic y sont
    // posées, et `getScreenCTM` rend des coordonnées souris stables (zoom et
    // rotation du composant compris).
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(GBF_W));
    svg.setAttribute('height', String(GBF_H));
    svg.setAttribute('viewBox', `0 0 ${GBF_W} ${GBF_H}`);

    const doc = new DOMParser().parseFromString(drawing.slice(drawing.indexOf('<svg')), 'image/svg+xml');
    if (doc.documentElement.nodeName.toLowerCase() === 'svg') {
      const inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(GBF_W));
      inner.setAttribute('height', String(GBF_H));
      svg.appendChild(inner);
    }

    wrap.appendChild(svg);
    this.root.replaceChildren(wrap);

    // Groupes de rotation : le groupe `bouton-*` du dessin porte déjà un
    // `transform="matrix(…)"` de PLACEMENT. Un `style.transform` posé dessus
    // écraserait ce matrix et le bouton partirait hors vue (même piège que
    // l'alim de laboratoire). On l'enveloppe donc dans un `<g>` qui, LUI, porte
    // la rotation — le matrix de placement reste intact.
    for (const knob of KNOBS) {
      const g = this.root.querySelector(`[id="${knob.groupe}"]`);
      if (!g?.parentNode) continue;
      const rot = document.createElementNS(SVG_NS, 'g');
      rot.id = `${knob.groupe}-rot`;
      // Ce groupe n'existe que pour porter la rotation : à l'export il est
      // APLATI (ses enfants remontent), pour ne pas ajouter d'objet au dessin.
      rot.setAttribute('data-unwrap-export', '');
      g.parentNode.insertBefore(rot, g);
      rot.appendChild(g);
    }

    // Zones de clic des boutons (simulation seulement). `data-no-export` : ces
    // cercles ne font pas partie du dessin, et un `fill="transparent"` ressort
    // NOIR d'Inkscape — ils apparaîtraient comme des ronds noirs sur les boutons.
    for (const knob of KNOBS) {
      const zone = document.createElementNS(SVG_NS, 'circle');
      zone.setAttribute('cx', String(knob.cx));
      zone.setAttribute('cy', String(knob.cy));
      zone.setAttribute('r', String(KNOB_R));
      zone.setAttribute('fill', 'transparent');
      zone.setAttribute('data-no-export', '');
      zone.style.cursor = 'grab';
      zone.addEventListener('pointerdown', (e) => this.onKnobDown(e as PointerEvent, knob));
      svg.appendChild(zone);
    }

    // Zone de clic du curseur de forme : un clic dans la moitié haute / au
    // milieu / en bas choisit sinus / triangle / carré. Un glissement suit le
    // doigt — c'est le geste qu'on fait sur l'appareil.
    const rail = document.createElementNS(SVG_NS, 'rect');
    rail.setAttribute('x', String(SLIDER_X - 3));
    rail.setAttribute('y', String(SLIDER_Y - 2));
    rail.setAttribute('width', String(SLIDER_W + 6));
    rail.setAttribute('height', String(SLIDER_H + 4));
    rail.setAttribute('fill', 'transparent');
    rail.setAttribute('data-no-export', '');
    rail.style.cursor = 'pointer';
    rail.addEventListener('pointerdown', this.onSliderDown);
    svg.appendChild(rail);

    this.updateVisuals();
  }

  // --- Boutons rotatifs (simulation seulement) ---------------------------------
  private onKnobDown = (e: PointerEvent, knob: Knob): void => {
    if (!this.hasAttribute('simulating')) return; // en édition : le clic déplace le composant
    e.stopPropagation();
    e.preventDefault();
    this.dragging = knob;
    this.tournerDepuisEvent(e, knob);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onSliderDown = (e: Event): void => {
    if (!this.hasAttribute('simulating')) return;
    e.stopPropagation();
    e.preventDefault();
    this.dragging = null;
    this.glisserDepuisEvent(e as PointerEvent);
    window.addEventListener('pointermove', this.onSliderMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.dragging) this.tournerDepuisEvent(e, this.dragging);
  };

  private onSliderMove = (e: PointerEvent): void => {
    this.glisserDepuisEvent(e);
  };

  private onPointerUp = (): void => {
    this.dragging = null;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointermove', this.onSliderMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  };

  /** Coordonnées de l'événement dans le repère du dessin (px du viewBox). */
  private pointLocal(e: PointerEvent): DOMPoint | null {
    const svg = this.root.querySelector('svg');
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  }

  private tournerDepuisEvent(e: PointerEvent, knob: Knob): void {
    const pt = this.pointLocal(e);
    if (!pt) return;
    const deg = (Math.atan2(pt.y - knob.cy, pt.x - knob.cx) * 180) / Math.PI;
    let rel = (((deg - DIAL_ZERO_DEG) % 360) + 360) % 360;
    // Zone morte de 60° en bas du cadran (entre le min et le max) : on colle à
    // l'extrémité la plus proche, sinon le bouton sauterait du mini au maxi en
    // passant la souris sous l'axe.
    if (rel > DIAL_SPAN_DEG) rel = rel > DIAL_SPAN_DEG + 30 ? 0 : DIAL_SPAN_DEG;
    const f = rel / DIAL_SPAN_DEG;
    if (!this.appliquer(knob.reglage, f)) return;
    this.updateVisuals();
    this.dispatchEvent(new Event('input'));
  }

  /**
   * Pose la valeur d'un réglage depuis sa fraction de course. Rend `false` si
   * rien n'a changé (arrondi au pas demandé) : on évite alors un rendu et un
   * événement `input` pour rien — le moteur reçoit une onde par frame, pas une
   * par pixel de souris.
   */
  private appliquer(reglage: Knob['reglage'], f: number): boolean {
    const arrondi = (x: number, pas: number): number => Math.round(x / pas) * pas;
    if (reglage === 'freq') {
      const hz = freqDepuisFraction(f); // au Hz près (précision demandée)
      if (hz === this.freq) return false;
      this.freq = hz;
      return true;
    }
    if (reglage === 'amplitude') {
      const v = Number(arrondi(f * AMPL_MAX, 0.1).toFixed(1));
      if (v === this.amplitude) return false;
      this.amplitude = v;
      return true;
    }
    if (reglage === 'offset') {
      const v = Number(arrondi(-OFFSET_ABS + f * 2 * OFFSET_ABS, 0.1).toFixed(1));
      if (v === this.offset) return false;
      this.offset = v;
      return true;
    }
    const pct = Math.round(f * 100);
    if (pct === this.duty) return false;
    this.duty = pct;
    return true;
  }

  private glisserDepuisEvent(e: PointerEvent): void {
    const pt = this.pointLocal(e);
    if (!pt) return;
    // Le cran est donné par la position du doigt sur le rail : trois zones de
    // 12 px, bornées aux extrémités (glisser au-delà ne sort pas de la course).
    const cran = Math.max(0, Math.min(2, Math.floor((pt.y - SLIDER_Y) / SLIDER_STEP)));
    const forme = FORMES[cran] ?? 'sinus';
    if (forme === this.forme) return;
    this.forme = forme;
    this.updateVisuals();
    this.dispatchEvent(new Event('input'));
  }

  // --- Rendus dérivés des réglages courants ------------------------------------
  private updateVisuals(): void {
    for (const knob of KNOBS) {
      const rot = this.root.querySelector(`[id="${knob.groupe}-rot"]`) as SVGElement | null;
      if (rot) {
        rot.style.transformOrigin = knob.origine;
        rot.style.transform = `rotate(${this.fraction(knob.reglage) * DIAL_SPAN_DEG}deg)`;
      }
      const cible = this.root.querySelector(`[id="${knob.valeur}"] tspan`)
        ?? this.root.querySelector(`[id="${knob.valeur}"]`);
      if (cible) cible.textContent = this.libelle(knob.reglage);
    }
    // Curseur de forme : le bouton bleu coulisse d'un cran par forme.
    const curseur = this.root.querySelector(`[id="${SLIDER_KNOB}"]`) as SVGElement | null;
    if (curseur) {
      const cran = Math.max(0, FORMES.indexOf(this.forme));
      // Translation posée en CSS et exprimée en unités LOCALES du rect (mm de la
      // planche) : le rect vit sous le transform mm→px du dessin, un décalage en
      // pixels du viewBox y serait 3,78 fois trop grand.
      curseur.style.transform = `translateY(${cran * SLIDER_STEP_MM}px)`;
    }
  }

  /** Fraction de course (0..1) d'un réglage — l'inverse de `appliquer`. */
  private fraction(reglage: Knob['reglage']): number {
    if (reglage === 'freq') return fractionDepuisFreq(this.freq);
    if (reglage === 'amplitude') return this.amplitude / AMPL_MAX;
    if (reglage === 'offset') return (this.offset + OFFSET_ABS) / (2 * OFFSET_ABS);
    return this.duty / 100;
  }

  /** Texte de l'afficheur d'un réglage (virgule décimale, comme le dessin). */
  private libelle(reglage: Knob['reglage']): string {
    if (reglage === 'freq') return formaterFreq(this.freq);
    if (reglage === 'amplitude') return `${this.amplitude.toFixed(1).replace('.', ',')} V`;
    if (reglage === 'offset') return `${this.offset.toFixed(1).replace('.', ',')} V`;
    return `${this.duty} %`;
  }

  /** Infobulle du composant : ce que l'appareil sort, en une ligne. */
  get resume(): string {
    const forme = this.forme === 'sinus' ? t('sine') : this.forme === 'triangle' ? t('triangle') : t('square');
    return `${forme} · ${formaterFreq(this.freq)} · ${this.libelle('amplitude')} · ${this.libelle('offset')}`;
  }
}

if (!customElements.get('kablix-gbf')) {
  customElements.define('kablix-gbf', GbfElement);
}
