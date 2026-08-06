// Composant <kablix-araignee> : robot araignée quadrupède complet — châssis
// octogonal + 4 pattes à 2 articulations (hanche, genou), électronique embarquée
// (Pico, PCA9685, batterie) dessinée dans le corps.
// PLACEHOLDER dessiné par Claude (pas par Frank — dessin ./externe/araignee.svg
// à refaire une fois le châssis PMMA découpé laser visible).
//
// Les pattes ne sont PAS redessinées ici : c'est la mécanique de <kablix-patte>
// (segments + pivots + animation) réutilisée quatre fois, tournée de 45° par
// coin. Chaque patte garde donc exactement le même comportement qu'une patte
// posée seule sur la planche.
//
// Électriquement, l'araignée n'expose que son bus I²C (SCL, SDA, V+, GND) : le
// PCA9685 embarqué est simulé comme une vraie carte PCA9685 (sim.mts), ses
// canaux 0..7 pilotant les 8 articulations dans l'ordre
// avant-gauche, avant-droite, arrière-gauche, arrière-droite (hanche puis genou).
import { css, html, svg, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { extractGroup, JointAnimator, HIP, KNEE, SEGMENT1, SEGMENT2 } from './patte-element.mjs';
import drawing from './externe/araignee.svg';

const cleanDrawing = drawing.replace(/<!--[\s\S]*?-->/g, '');
const CORPS = extractGroup(cleanDrawing, 'corps');
const CARTES = extractGroup(cleanDrawing, 'cartes');

/** Hanche et orientation de repos de chaque patte (feuille 400x400 du corps).
 *  L'ordre fixe l'ordre des canaux PWM : 0/1 avant-gauche, 2/3 avant-droite,
 *  4/5 arrière-gauche, 6/7 arrière-droite.
 *  `mirror` : patte montée en MIROIR (côté droit du châssis, comme sur le robot).
 *  Le même angle de genou plie alors les deux côtés symétriquement au lieu de
 *  faire tourner l'ensemble comme une roue à aubes. */
const LEGS: readonly { x: number; y: number; dir: number; mirror: boolean }[] = [
  { x: 135, y: 135, dir: -135, mirror: false }, // avant-gauche
  { x: 265, y: 135, dir: -45, mirror: true }, // avant-droite
  { x: 135, y: 265, dir: 135, mirror: false }, // arrière-gauche
  { x: 265, y: 265, dir: 45, mirror: true }, // arrière-droite
];

export class AraigneeElement extends LitElement {
  // Comme <kablix-patte> : sans ceci `:host` reste `display: inline` (boîte
  // haute d'une ligne de texte, `transform` ignoré par le navigateur).
  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  /** Consigne d'angle (0-180°, 90° = patte tendue) des 8 articulations. */
  declare hip0: number;
  declare knee0: number;
  declare hip1: number;
  declare knee1: number;
  declare hip2: number;
  declare knee2: number;
  declare hip3: number;
  declare knee3: number;
  /** Temps d'un tour complet (360°) à pleine vitesse, en secondes. 0 = instantané. */
  declare speed: number;
  /** Non vide : l'électronique embarquée est dessinée dans le corps. */
  declare boards: string;

  static properties = {
    hip0: {}, knee0: {},
    hip1: {}, knee1: {},
    hip2: {}, knee2: {},
    hip3: {}, knee3: {},
    speed: { type: Number },
    boards: { type: String },
    shown: { state: true },
  };

  /** Angles réellement affichés (rattrapage à vitesse limitée), 8 valeurs :
   *  [hanche0, genou0, hanche1, genou1, …] — un seul état pour un seul rendu. */
  declare shown: number[];

  private joints: JointAnimator[] = [];

  constructor() {
    super();
    this.speed = 2;
    this.boards = '';
    this.shown = new Array(8).fill(90);
    for (let i = 0; i < 8; i++) {
      this.hipOrKnee(i, 90);
      // Chaque articulation recopie son angle courant dans le tableau affiché
      // (un nouveau tableau : Lit ne détecte pas la mutation d'un array).
      this.joints.push(new JointAnimator(() => {
        this.shown = this.joints.map((j) => j.shown);
      }));
    }
  }

  /** Écrit la consigne d'une articulation : i pair = hanche, impair = genou. */
  private hipOrKnee(i: number, v: number): void {
    const leg = Math.floor(i / 2);
    const key = (i % 2 === 0 ? 'hip' : 'knee') + leg;
    (this as unknown as Record<string, number>)[key] = v;
  }

  /** Consigne courante d'une articulation (0..7). */
  private target(i: number): number {
    const leg = Math.floor(i / 2);
    const key = (i % 2 === 0 ? 'hip' : 'knee') + leg;
    const n = Number((this as unknown as Record<string, unknown>)[key]);
    return Number.isFinite(n) ? Math.max(0, Math.min(180, n)) : 90;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const j of this.joints) j.stop();
  }

  willUpdate(changed: Map<string, unknown>): void {
    if (![...changed.keys()].some((k) => k.startsWith('hip') || k.startsWith('knee') || k === 'speed')) return;
    const degPerSec = this.degPerSec();
    this.joints.forEach((j, i) => j.sync(this.target(i), degPerSec));
  }

  private degPerSec(): number {
    const s = Number(this.speed);
    if (!Number.isFinite(s) || s <= 0) return 0;
    return 360 / s;
  }

  // Broches : le seul câblage extérieur est le bus I²C (le reste est embarqué).
  // Connecteur 4 points sur le bord gauche du châssis, grille 10 px.
  readonly pinInfo: ElementPin[] = [
    { name: 'SCL', x: 110, y: 170, signals: [{ type: 'i2c', signal: 'SCL', bus: 0 }] },
    { name: 'SDA', x: 110, y: 190, signals: [{ type: 'i2c', signal: 'SDA', bus: 0 }] },
    { name: 'V+', x: 110, y: 210, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 110, y: 230, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  render() {
    // Pattes SOUS le châssis (comme sur le robot : les fémurs passent sous la
    // plaque), électronique embarquée par-dessus. 90° = patte tendue, la
    // commande est donc décalée de -90° pour une rotation visuelle nulle.
    const angles = this.shown ?? new Array(8).fill(90);
    return html`
      <svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
        ${/* Sous-template en `svg` et NON en `html` : un fragment commençant par
             <g> passé à `html` est parsé en XHTML (namespace HTML), les pattes
             existent alors dans le DOM mais ne sont JAMAIS dessinées. */
          LEGS.map((leg, i) => svg`
          <g transform=${`translate(${leg.x} ${leg.y}) rotate(${leg.dir})${leg.mirror ? ' scale(1 -1)' : ''} translate(${-HIP.x} ${-HIP.y})`}>
            <g transform=${`rotate(${(angles[i * 2] ?? 90) - 90} ${HIP.x} ${HIP.y})`}>
              ${unsafeSVG(SEGMENT1)}
              <g transform=${`rotate(${(angles[i * 2 + 1] ?? 90) - 90} ${KNEE.x} ${KNEE.y})`}>
                ${unsafeSVG(SEGMENT2)}
              </g>
            </g>
          </g>
        `)}
        ${unsafeSVG(CORPS)}
        ${this.boards ? unsafeSVG(CARTES) : ''}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-araignee')) {
  customElements.define('kablix-araignee', AraigneeElement);
}
