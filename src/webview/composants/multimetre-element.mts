// Élément visuel maison <kablix-multimetre> : multimètre de table à deux
// prises banane (dessin de Frank ./externe/multimetre.svg, 270×90 px).
//
// L'INTER À BASCULE choisit ce qu'il mesure : levier EN HAUT = courant continu,
// levier EN BAS = tension continue (position dessinée = en haut). C'est un
// réglage d'appareil, donc il vit dans l'attribut `mode` du composant : la
// bascule appelle l'inspecteur comme le ferait un clic dans le panneau, et le
// schéma le retient.
//
// Ce que la mesure implique côté câblage :
//  - VOLTMÈTRE : se met EN PARALLÈLE, ne consomme rien (10 MΩ), invisible pour
//    le reste du montage ;
//  - AMPÈREMÈTRE : se met EN SÉRIE, c'est un FIL (0 Ω) — d'où l'union de ses
//    deux pattes dans la netlist (model.mts) et le court-circuit si on le pose
//    en travers de l'alimentation, comme un vrai appareil.
//
// EN SIMULATION : sim.mts pose `reading` (volts ou ampères selon le mode) à
// chaque image ; l'écran l'affiche avec son unité, dans la police LED Board-7
// des écrans LCD.
import { t } from '../i18n.mjs';
import drawing from './externe/multimetre.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const MULTI_W = 270;
export const MULTI_H = 90;

/** Zone cliquable de l'inter à bascule (px du dessin, cadre bleu du dessin). */
const SWITCH_ZONE = { x: 220.5, y: 9.2, w: 39, h: 42 };

/** Bord DROIT de la mesure sur l'écran. Le texte du dessin porte un
 *  `scale(0.99169514, …)` : la coordonnée écrite est donc divisée par ce
 *  facteur pour tomber au bon endroit une fois la mise à l'échelle appliquée
 *  (écran : 171,98 → 224,90 ; on garde un cheveu de marge à droite). */
const DISPLAY_RIGHT = 224 / 0.99169514;

/** Corps de la mesure et de son unité (px du dessin). Un vrai multimètre écrit
 *  la valeur en gros et l'unité en petit à côté : sans ça « 999,9 mA » déborde
 *  de l'écran. */
const VALUE_SIZE = 11.5;
const UNIT_SIZE = 6;

/** Pivot du levier, en unités locales du groupe `inter-bascule`. */
const LEVER_PIVOT = { x: 295.93643, y: 221.85312 };

/** Pièces MOBILES du levier : la tige, ses deux ombres, la boule, ses reflets.
 *  Tout le reste (embase hexagonale, collerettes, rondelle) ne bouge pas. */
const LEVER_PARTS = ['path55-3', 'path57-8', 'path58-2', 'circle58', 'ellipse58', 'ellipse59'];

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

export type MeterMode = 'current' | 'voltage';

export class MultimetreElement extends HTMLElement {
  // Centres des prises banane du dessin (+ rouge à gauche, GND noire à droite).
  readonly pinInfo: PinInfo[] = [
    { name: '+', x: 230, y: 70, signals: [] },
    { name: 'GND', x: 250, y: 70, signals: [] },
  ];

  static get observedAttributes(): string[] {
    return ['mode', 'simulating'];
  }

  /** Dernière mesure posée par sim.mts : volts ou ampères selon le mode. */
  private _reading: number | null = null;

  private root: ShadowRoot;
  private rendered = false;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  get reading(): number | null {
    return this._reading;
  }

  set reading(v: number | null) {
    const val = Number.isFinite(v as number) ? (v as number) : null;
    if (this._reading === val) return;
    this._reading = val;
    this.updateDisplay();
  }

  /** Ce que l'inter mesure ; tout ce qui n'est pas `current` est une tension. */
  get mode(): MeterMode {
    return this.getAttribute('mode') === 'current' ? 'current' : 'voltage';
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
  }

  attributeChangedCallback(name: string): void {
    if (!this.rendered) return;
    // Changement de calibre ou arrêt de la simulation : la mesure précédente
    // n'a plus de sens (des ampères lus comme des volts).
    if (name === 'mode' || name === 'simulating') this._reading = null;
    this.updateLever();
    this.updateDisplay();
    this.updateSwitchZone();
  }

  private render(): void {
    this.rendered = true;
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(MULTI_W));
    svg.setAttribute('height', String(MULTI_H));
    svg.setAttribute('viewBox', `0 0 ${MULTI_W} ${MULTI_H}`);

    const doc = new DOMParser().parseFromString(drawing.slice(drawing.indexOf('<svg')), 'image/svg+xml');
    if (doc.documentElement.nodeName.toLowerCase() === 'svg') {
      const inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(MULTI_W));
      inner.setAttribute('height', String(MULTI_H));
      svg.appendChild(inner);
    }

    // Zone cliquable de l'inter (simulation seulement, comme le bouton de
    // l'alim : en édition le clic doit sélectionner et déplacer le composant).
    // `data-no-export` : elle ne fait pas partie du dessin de Frank.
    const zone = document.createElementNS(SVG_NS, 'rect');
    zone.id = 'multi-switch-zone';
    zone.setAttribute('x', String(SWITCH_ZONE.x));
    zone.setAttribute('y', String(SWITCH_ZONE.y));
    zone.setAttribute('width', String(SWITCH_ZONE.w));
    zone.setAttribute('height', String(SWITCH_ZONE.h));
    zone.setAttribute('fill', 'transparent');
    zone.setAttribute('data-no-export', '');
    zone.addEventListener('pointerdown', this.onSwitch);
    svg.appendChild(zone);

    wrap.appendChild(svg);
    this.root.replaceChildren(wrap);

    // Libellés du dessin traduits (le dessin de Frank les porte en français).
    const haut = this.root.querySelector('#text-courant-limite tspan') ?? this.root.querySelector('#text-courant-limite');
    if (haut) haut.textContent = t('Current');
    const bas = this.root.querySelector('#text-courant-limite-6 tspan') ?? this.root.querySelector('#text-courant-limite-6');
    if (bas) bas.textContent = t('Voltage');

    // Écran : mesure alignée à DROITE, comme celui de l'alim, mais en DEUX
    // morceaux — la valeur en gros, l'unité en petit juste après. Les tspans
    // s'enchaînent sans `x` : c'est le `text-anchor="end"` du texte qui cale
    // l'ensemble sur le bord droit de l'écran.
    const disp = this.root.querySelector('#Text-Affichage');
    if (disp) {
      disp.setAttribute('text-anchor', 'end');
      disp.setAttribute('x', String(DISPLAY_RIGHT));
      const valeur = document.createElementNS(SVG_NS, 'tspan');
      valeur.id = 'multi-valeur';
      valeur.setAttribute('font-size', String(VALUE_SIZE));
      const unite = document.createElementNS(SVG_NS, 'tspan');
      unite.id = 'multi-unite';
      unite.setAttribute('font-size', String(UNIT_SIZE));
      disp.replaceChildren(valeur, unite);
    }

    // Groupe rotatif du levier, RECRÉÉ à l'affichage : les pièces mobiles sont
    // des frères des pièces fixes dans le dessin, un `transform` posé sur
    // chacune écraserait leur matrix de placement. Le groupe porte la rotation,
    // leurs matrix restent intacts. `data-unwrap-export` : à l'export il est
    // aplati, pour ne pas ajouter d'objet au dessin de Frank.
    const first = this.root.querySelector(`#${LEVER_PARTS[0]}`);
    if (first && first.parentNode) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.id = 'multi-levier';
      g.setAttribute('data-unwrap-export', '');
      first.parentNode.insertBefore(g, first);
      for (const id of LEVER_PARTS) {
        const el = this.root.querySelector(`#${id}`);
        if (el) g.appendChild(el);
      }
    }

    this.updateLever();
    this.updateDisplay();
    this.updateSwitchZone();
  }

  /** Clic sur l'inter : bascule courant ↔ tension, l'hôte enregistre le choix. */
  private onSwitch = (e: PointerEvent): void => {
    if (!this.hasAttribute('simulating')) return;
    e.preventDefault();
    e.stopPropagation();
    const next: MeterMode = this.mode === 'current' ? 'voltage' : 'current';
    this.setAttribute('mode', next);
    this.dispatchEvent(new CustomEvent('meter-mode', { detail: next, bubbles: true, composed: true }));
  };

  private updateSwitchZone(): void {
    const zone = this.root.querySelector('#multi-switch-zone') as SVGElement | null;
    if (zone) zone.style.cursor = this.hasAttribute('simulating') ? 'pointer' : '';
  }

  /** Levier en haut (courant, position dessinée) ou basculé en bas (tension). */
  private updateLever(): void {
    const g = this.root.querySelector('#multi-levier') as SVGElement | null;
    if (!g) return;
    if (this.mode === 'current') g.removeAttribute('transform');
    else g.setAttribute('transform', `rotate(180 ${LEVER_PIVOT.x} ${LEVER_PIVOT.y})`);
  }

  /** Écran : la mesure avec son unité, virgule décimale (police LED Board-7). */
  private updateDisplay(): void {
    const [valeur, unite] = this.displayText();
    const cv = this.root.querySelector('#multi-valeur');
    const cu = this.root.querySelector('#multi-unite');
    if (cv) cv.textContent = valeur;
    if (cu) cu.textContent = ` ${unite}`;
    // Repli si le dessin n'a pas été découpé (aucun tspan préparé).
    if (!cv && !cu) {
      const brut = this.root.querySelector('#Text-Affichage');
      if (brut) brut.textContent = `${valeur} ${unite}`;
    }
  }

  /** Mesure formatée : [valeur, unité]. Quatre chiffres utiles au plus, comme
   *  un vrai appareil — au-delà l'écran ne suit pas et la précision est fausse. */
  private displayText(): [string, string] {
    const v = this._reading ?? 0;
    // Trois calibres : sous 10 deux décimales, sous 100 une seule, au-delà
    // aucune. C'est ce que fait un appareil à 3 chiffres et demi.
    const cal = (x: number): string => {
      const a = Math.abs(x);
      const d = a < 10 ? 2 : a < 100 ? 1 : 0;
      return x.toFixed(d).replace('.', ',');
    };
    if (this.mode === 'current') {
      // Sous l'ampère on lit des milliampères : c'est ce qu'affiche un vrai
      // appareil, et 0,000021 A ne dirait rien à personne.
      return Math.abs(v) < 1 ? [cal(v * 1000), 'mA'] : [cal(v), 'A'];
    }
    return [cal(v), 'V'];
  }
}

if (!customElements.get('kablix-multimetre')) {
  customElements.define('kablix-multimetre', MultimetreElement);
}
