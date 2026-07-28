// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — pir-motion-sensor-element.ts.
// Balise <kablix-pir-motion-sensor> (ex <wokwi-pir-motion-sensor>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs ; DESSIN retouché (./externe/pir.svg) ;
//   - EN SIMULATION (attribut `simulating`) : détection du MOUVEMENT de la souris
//     au-dessus du composant (pas juste sa présence statique) — OUT=1 tant que la
//     souris a bougé récemment (tolérance MOTION_GRACE_MS avant coupure, pour ne
//     pas couper au moindre arrêt bref). Ctrl+clic = mouvement PERMANENT (indiqué
//     par une bulle), Ctrl+clic à nouveau pour l'annuler. Le moteur lit `el.motion`
//     en direct (cf. sim.mts).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, GND, VCC } from './pin.mjs';
import drawing from './externe/pir.svg';

/** Délai de grâce (ms) après le dernier mouvement avant de couper OUT (tolérance
 *  aux arrêts brefs de la souris pendant qu'elle survole le capteur). */
const MOTION_GRACE_MS = 400;

export class PIRMotionSensorElement extends LitElement {
  declare simulating: boolean;
  /** Souris actuellement au-dessus du capteur ET en mouvement (avec tolérance). */
  declare hovering: boolean;
  /**
   * Souris au-dessus du capteur, qu'elle bouge ou non. Sert UNIQUEMENT à la bulle
   * d'aide, qui doit rester affichée tant qu'on survole (`hovering`, lui, retombe
   * dès que la souris s'arrête : c'est l'état de la sortie OUT, pas de l'aide).
   */
  declare over: boolean;
  /** Mouvement verrouillé (Ctrl+clic) : reste actif même sans survol. */
  declare sticky: boolean;

  static properties = {
    simulating: { type: Boolean },
    hovering: { state: true },
    over: { state: true },
    sticky: { state: true },
    bubblePos: { state: true },
  };

  constructor() {
    super();
    this.simulating = false;
    this.hovering = false;
    this.over = false;
    this.sticky = false;
    this.bubblePos = null;
  }

  private lastPos: { x: number; y: number } | null = null;
  /** Position souris relative au composant (pour la bulle qui la suit), ou null hors survol. */
  declare bubblePos: { x: number; y: number } | null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  private clearGraceTimer(): void {
    if (this.graceTimer !== null) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  // Broches : centre de chaque pastille (repère du dessin retouché, grille de 10 px).
  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 40, y: 100, number: 1, signals: [VCC()] },
    { name: 'OUT', x: 50, y: 100, number: 2, signals: [] },
    { name: 'GND', x: 60, y: 100, number: 3, signals: [GND()] },
  ];

  /** Sortie OUT : mouvement détecté (survol ou verrouillage permanent). */
  get motion(): boolean {
    return this.simulating && (this.hovering || this.sticky);
  }

  static get styles() {
    return css`
      :host { display: inline-block; }
      .wrap { position: relative; }
      /* Bulle façon tooltip qui suit le curseur (left/top posés dynamiquement
         par le composant). Placement demandé par Frank : 25 px SOUS le pointeur
         et CENTRÉE horizontalement dessus, taille et distance mesurées à l'ÉCRAN
         — donc indépendantes du zoom de l'atelier.
         scale(1/zoom) annule l'agrandissement du monde (l'éditeur publie le
         facteur dans --kablix-zoom) ; le translate qui SUIT est exprimé dans le
         repère déjà mis à l'échelle, d'où un 25px qui vaut 25 px écran, et un
         -50% qui centre la bulle sur son point d'ancrage. L'origine en haut à
         gauche garde ce point d'ancrage fixe pendant la mise à l'échelle. Vaut
         aussi pour le repli sans souris (ancré sous le composant). */
      .bubble {
        position: absolute;
        transform-origin: 0 0;
        transform: scale(calc(1 / var(--kablix-zoom, 1))) translate(-50%, 25px);
        background: #222;
        color: #fff;
        font: 10px sans-serif;
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        z-index: 10;
      }
      /* Bulle jaune façon tooltip natif du navigateur (title), pour la mention
         « Détecte les mouvements de la souris » seulement (choix Frank). */
      .bubble.native {
        background: #ffffcc;
        color: #000;
        border: 1px solid #888;
        border-radius: 2px;
        font: 11px sans-serif;
      }
    `;
  }

  private onEnter = () => {
    this.lastPos = null;
    this.over = true;
  };
  private onLeave = () => {
    this.hovering = false;
    this.over = false;
    this.lastPos = null;
    this.bubblePos = null;
    this.clearGraceTimer();
  };
  private onMove = (e: PointerEvent) => {
    if (!this.simulating) return;
    this.over = true;
    // Position relative au composant (coin haut-gauche de son rectangle) :
    // la bulle suit le curseur au lieu de rester plaquée en haut du dessin.
    // Le rectangle est mesuré à l'ÉCRAN (zoom compris) alors que left/top sont
    // posés dans le repère du composant : on ramène l'écart au zoom pour que la
    // bulle reste sous le pointeur même agrandie.
    const rect = this.getBoundingClientRect();
    const z = rect.width ? rect.width / this.offsetWidth : 1;
    this.bubblePos = { x: (e.clientX - rect.left) / z, y: (e.clientY - rect.top) / z };
    const prev = this.lastPos;
    this.lastPos = { x: e.clientX, y: e.clientY };
    // Pas un vrai mouvement (arrivée sur l'élément, ou position identique) : ne
    // pas (re)armer le délai de grâce sur du bruit.
    if (prev && prev.x === e.clientX && prev.y === e.clientY) return;
    this.hovering = true;
    this.clearGraceTimer();
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      this.hovering = false;
    }, MOTION_GRACE_MS);
  };
  private onDown = (e: PointerEvent) => {
    if (this.simulating && e.ctrlKey) {
      e.stopPropagation();
      this.sticky = !this.sticky;
    }
  };

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.clearGraceTimer();
  }

  render() {
    const active = this.motion;
    // La bulle n'apparaît qu'au survol (ou en sticky, état permanent qu'il reste
    // utile de rappeler même souris partie) — plus d'affichage fixe hors survol.
    // Elle tient tant que la souris est DESSUS (`over`), même immobile : c'est
    // une aide, pas un témoin de la sortie.
    let bubble: string | null = null;
    let native = false;
    if (this.sticky) {
      bubble = 'Mouvement permanent (Ctrl+clic pour arrêter)';
    } else if (this.over && this.simulating) {
      bubble = 'Détecte les mouvements de la souris — Ctrl+clic pour un mouvement permanent';
      native = true;
    }
    const showAtCursor = bubble !== null && this.bubblePos !== null;
    return html`
      <div
        class="wrap"
        @pointerenter=${this.onEnter}
        @pointerleave=${this.onLeave}
        @pointermove=${this.onMove}
        @pointerdown=${this.onDown}
      >
        <svg width="100" height="103.45" viewBox="0 0 100 103.45" xmlns="http://www.w3.org/2000/svg">
          ${unsafeSVG(drawing)}
          ${active
            ? html`<circle cx="50" cy="50" r="8" fill="#ff5252" opacity="0.8" />`
            : null}
        </svg>
        ${bubble
          ? html`<div
              class="bubble ${native ? 'native' : ''}"
              style=${showAtCursor
                ? `left:${this.bubblePos!.x}px;top:${this.bubblePos!.y}px`
                : 'left:50%;top:100%'}
            >
              ${bubble}
            </div>`
          : null}
      </div>
    `;
  }
}

if (!customElements.get('kablix-pir-motion-sensor')) {
  customElements.define('kablix-pir-motion-sensor', PIRMotionSensorElement);
}
