// Élément visuel maison <kablix-alim> : alimentation de laboratoire réglable
// (dessin de Frank ./externe/alim.svg, 280×110 px). Deux prises banane V+ / GND
// (pastilles sur la grille, espacées de 20 px) — dans la netlist l'alim est une
// SOURCE : son V+ compte comme rail VCC et son GND comme masse (model.mts).
//
// Propriétés (inspecteur) : `voltage` = tension de DÉMARRAGE (V), `maxcurrent` =
// courant max fourni (A). EN SIMULATION : le bouton du dessin se tourne à la
// souris (0 → 30 V sur 300°, dessin à 0 V), l'écran affiche la tension courante
// (police LED Board-7, celle des LCD) et la LED « Courant limite » s'allume en
// rouge vif (+ halo) quand le courant débité dépasse `maxcurrent` (sim.mts pose
// `overAmps` à chaque frame via psuLoadAmps).
import { t } from '../i18n.mjs';
import drawing from './externe/alim.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const ALIM_W = 280;
export const ALIM_H = 110;
/** Centre du bouton (px du dessin) — mesuré sur le dessin de Frank. */
const KNOB_CX = 240.91;
const KNOB_CY = 68.9;
/** Même centre en unités locales du viewBox (mm) pour l'origine de rotation CSS. */
const KNOB_LOCAL = '63.742px 18.230px';
/** Cadran : 0 V pointé vers 120° (bas-gauche), 300° de course horaire → 30 V. */
const DIAL_ZERO_DEG = 120;
const DIAL_SPAN_DEG = 300;
const VOLTS_MAX = 30;

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

export class AlimElement extends HTMLElement {
  // Centres des prises banane du dessin (V+ rouge à gauche, GND noire à droite).
  readonly pinInfo: PinInfo[] = [
    { name: 'V+', x: 95.65, y: 92.87, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 115.65, y: 92.87, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  static get observedAttributes(): string[] {
    return ['voltage', 'simulating'];
  }

  /** Tension courante (V) — suit le bouton en simulation, l'attribut sinon. */
  volts = 5;

  private root: ShadowRoot;
  private rendered = false;
  private dragging = false;
  private ledOriginalFill: string | null = null;
  private _overAmps = false;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  /** Posé par sim.mts à chaque frame : courant débité > courant max. */
  get overAmps(): boolean {
    return this._overAmps;
  }

  set overAmps(v: boolean) {
    if (this._overAmps === !!v) return;
    this._overAmps = !!v;
    this.updateLed();
  }

  private get startVolts(): number {
    const v = Number(this.getAttribute('voltage'));
    return Number.isFinite(v) ? Math.max(0, Math.min(VOLTS_MAX, v)) : 5;
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
  }

  attributeChangedCallback(name: string): void {
    if (!this.rendered) return;
    // Nouvelle tension de démarrage (inspecteur) ou entrée/sortie de simulation :
    // la tension courante repart de la valeur de démarrage.
    this.volts = this.startVolts;
    if (name === 'simulating') this.overAmps = false;
    this.updateVisuals();
  }

  private render(): void {
    this.rendered = true;
    this.volts = this.startVolts;
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';

    // SVG englobant au repère 1:1 (px du dessin) : zone du bouton + coordonnées
    // souris stables via getScreenCTM (zoom et rotation du composant compris).
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(ALIM_W));
    svg.setAttribute('height', String(ALIM_H));
    svg.setAttribute('viewBox', `0 0 ${ALIM_W} ${ALIM_H}`);

    const doc = new DOMParser().parseFromString(drawing.slice(drawing.indexOf('<svg')), 'image/svg+xml');
    if (doc.documentElement.nodeName.toLowerCase() === 'svg') {
      const inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('width', String(ALIM_W));
      inner.setAttribute('height', String(ALIM_H));
      svg.appendChild(inner);
    }

    // Zone circulaire du bouton de tension (active en simulation seulement).
    // `data-no-export` : ce cercle ne sert qu'au clic en simulation, il ne fait
    // PAS partie du dessin. Sans ce marqueur il sortait dans le SVG exporté et,
    // son `fill="transparent"` étant rendu NOIR par Inkscape, apparaissait comme
    // un rond noir sur le bouton (le « circle1282 » signalé par Frank).
    const zone = document.createElementNS(SVG_NS, 'circle');
    zone.setAttribute('cx', String(KNOB_CX));
    zone.setAttribute('cy', String(KNOB_CY));
    zone.setAttribute('r', '26');
    zone.setAttribute('fill', 'transparent');
    zone.setAttribute('data-no-export', '');
    zone.style.cursor = 'grab';
    zone.addEventListener('pointerdown', this.onPointerDown);
    svg.appendChild(zone);

    wrap.appendChild(svg);
    this.root.replaceChildren(wrap);

    // Libellés du dessin traduits (item « textes traduisibles »).
    const tension = this.root.querySelector('#alim-text-tension tspan') ?? this.root.querySelector('#alim-text-tension');
    if (tension) tension.textContent = t('Voltage');
    const limite = this.root.querySelectorAll('#alim-text-courant-limite tspan');
    const words = t('Current limit').split(' ');
    if (limite.length >= 2) {
      limite[0].textContent = words[0] ?? '';
      limite[1].textContent = words.slice(1).join(' ');
    }

    // Écran : tension alignée à DROITE (item de Frank) — ancre de fin posée au
    // bord droit de l'écran (53,74 unités locales ≈ 201 px, même marge que le
    // « 30,00 » du dessin d'origine). Le tspan porte son propre x : réécrit aussi.
    const disp = this.root.querySelector('#alim-Text-Affichage');
    if (disp) {
      disp.setAttribute('text-anchor', 'end');
      disp.setAttribute('x', '53.74');
      const tsp = disp.querySelector('tspan');
      if (tsp) {
        tsp.setAttribute('text-anchor', 'end');
        tsp.setAttribute('x', '53.74');
      }
    }

    const led = this.root.querySelector('#alim-LED-courant-limite');
    this.ledOriginalFill = led?.getAttribute('style') ?? null;
    this.prepareLed();
    this.updateVisuals();
  }

  /**
   * Prépare la LED « Courant limite » allumée : on garde EXACTEMENT le dégradé
   * radial du dessin (mêmes centre, rayon et gradientTransform, donc le même
   * modelé de bille) — seule la couleur change, le rouge sombre `#970202`
   * devenant le rouge vif `#ff0000`. Un halo est ajouté derrière la LED, sur le
   * modèle de la LED simple : deux ellipses concentriques floutées, masquées
   * tant que la LED est éteinte.
   */
  private prepareLed(): void {
    const svg = this.root.querySelector('svg');
    const led = this.root.querySelector('#alim-LED-courant-limite') as SVGElement | null;
    const src = this.root.querySelector('#alim-radialGradient115') as SVGElement | null;
    if (!svg || !led || !src) return;

    // Dégradé jumeau, rouge vif : le clair du reflet est conservé, la butée
    // sombre passe à #ff0000 (les stops sont copiés depuis le linearGradient
    // référencé par le dégradé radial d'origine).
    const defs = src.parentElement;
    const on = src.cloneNode(false) as SVGElement;
    on.id = 'alim-led-on';
    on.removeAttribute('xlink:href');
    on.removeAttribute('href');
    for (const [offset, color] of [['0', '#ffdcdc'], ['1', '#ff0000']]) {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('style', `stop-color:${color};stop-opacity:1`);
      on.appendChild(stop);
    }
    defs?.appendChild(on);

    // Halo : deux ellipses centrées sur la LED (comme le groupe lumineux de la
    // LED simple), insérées AVANT la LED pour rester dessous.
    const cx = Number(led.getAttribute('cx') ?? 0);
    const cy = Number(led.getAttribute('cy') ?? 0);
    const rx = Number(led.getAttribute('rx') ?? 2);
    const glow = document.createElementNS(SVG_NS, 'g');
    glow.id = 'alim-led-glow';
    glow.style.display = 'none';
    for (const [scale, opacity] of [[4.2, 0.35], [2.4, 0.55]]) {
      const e = document.createElementNS(SVG_NS, 'ellipse');
      e.setAttribute('cx', String(cx));
      e.setAttribute('cy', String(cy));
      e.setAttribute('rx', String(rx * scale));
      e.setAttribute('ry', String(rx * scale));
      e.setAttribute('fill', '#ff0000');
      e.setAttribute('opacity', String(opacity));
      e.style.filter = 'blur(1.4px)'; // filtre CSS (l'attribut SVG attend un url(#…))
      glow.appendChild(e);
    }
    led.parentElement?.insertBefore(glow, led);
  }

  // --- Bouton de tension (drag rotatif, simulation seulement) ------------------
  private onPointerDown = (e: PointerEvent): void => {
    if (!this.hasAttribute('simulating')) return; // en édition : le clic déplace le composant
    e.stopPropagation();
    e.preventDefault();
    this.dragging = true;
    this.rotateFromEvent(e);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.dragging) this.rotateFromEvent(e);
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  };

  private rotateFromEvent(e: PointerEvent): void {
    const svg = this.root.querySelector('svg');
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const deg = (Math.atan2(pt.y - KNOB_CY, pt.x - KNOB_CX) * 180) / Math.PI;
    let rel = ((deg - DIAL_ZERO_DEG) % 360 + 360) % 360;
    // Zone morte de 60° en bas du cadran : on colle à l'extrémité la plus proche.
    if (rel > DIAL_SPAN_DEG) rel = rel > DIAL_SPAN_DEG + 30 ? 0 : DIAL_SPAN_DEG;
    const volts = Math.round((rel / DIAL_SPAN_DEG) * VOLTS_MAX * 10) / 10;
    if (volts === this.volts) return;
    this.volts = volts;
    this.updateVisuals();
    this.dispatchEvent(new Event('input'));
  }

  // --- Rendus dérivés de la tension courante -----------------------------------
  private updateVisuals(): void {
    // Rotation du bouton : dessin à 0 V, +10°/V en horaire autour de son centre.
    // Le dessin retouché de Frank n'a plus de groupe `alim-bouton-rot` : le
    // bouton (`alim-bouton`) et son curseur (`alim-curseur-bouton`) sont deux
    // éléments frères. On tourne les DEUX autour du même centre, sans recréer de
    // groupe (le dessin reste tel que Frank l'a nommé, aucun objet ajouté).
    const deg = (this.volts / VOLTS_MAX) * DIAL_SPAN_DEG;
    for (const sel of ['#alim-bouton', '#alim-curseur-bouton', '#alim-bouton-rot']) {
      const rot = this.root.querySelector(sel) as SVGElement | null;
      if (rot) {
        rot.style.transformOrigin = KNOB_LOCAL;
        rot.style.transform = `rotate(${deg}deg)`;
      }
    }
    // Écran : tension courante, virgule décimale (police LED Board-7 du dessin).
    const text = this.root.querySelector('#alim-Text-Affichage tspan') ?? this.root.querySelector('#alim-Text-Affichage');
    if (text) text.textContent = this.volts.toFixed(2).replace('.', ',');
    this.updateLed();
  }

  private updateLed(): void {
    const led = this.root.querySelector('#alim-LED-courant-limite') as SVGElement | null;
    if (!led) return;
    const glow = this.root.querySelector('#alim-led-glow') as SVGElement | null;
    if (this._overAmps) {
      // Même dégradé (même modelé de bille), rouge vif — plus le halo.
      led.setAttribute('style', (this.ledOriginalFill ?? '').replace(
        /fill:url\(#alim-radialGradient115\)/,
        'fill:url(#alim-led-on)',
      ) || 'fill:url(#alim-led-on)');
      led.style.filter = 'drop-shadow(0 0 3px rgba(255, 0, 0, 0.95))';
      if (glow) glow.style.display = '';
    } else {
      if (this.ledOriginalFill !== null) led.setAttribute('style', this.ledOriginalFill);
      led.style.filter = '';
      if (glow) glow.style.display = 'none';
    }
  }
}

if (!customElements.get('kablix-alim')) {
  customElements.define('kablix-alim', AlimElement);
}
