// Élément <kablix-custom-part> : héberge le dessin SVG d'un composant créé par
// l'utilisateur, expose `pinInfo` comme les composants forkés, et un
// retour visuel minimal (halo lumineux quand `active` est vrai — LED, buzzer…).
// Pour le modèle « bouton », il émet button-press / button-release au clic.
// Si un contrôle de simulation est défini (curseur/interrupteur), il apparaît
// sous le dessin pendant la simulation (attribut `simulating`, posé par
// setLocked comme pour les capteurs intégrés) ; le moteur relit `controlValue`
// / `switchOn` sur l'événement `input` (cf. sim.mts).

import type { CustomControl, PartDef } from '../diagram/catalog.mjs';
import { simControlStyles } from './utils/sim-control-styles.mjs';

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

/** Contexte exposé au script behavior.mjs : lire/écrire les broches, accéder aux contrôles. */
export interface BehaviorContext {
  pinInfo: PinInfo[];
  readPin(name: string): 0 | 1;
  writePin(name: string, value: 0 | 1): void;
  active: boolean;
  controlValue: number;
  switchOn: boolean;
}

/** Module behavior.mjs : optionnel, embarqué dans le .kompix. */
export interface BehaviorModule {
  init?(context: BehaviorContext): void;
  tick(context: BehaviorContext): void;
  destroy?(context: BehaviorContext): void;
}

export class CustomPartElement extends HTMLElement {
  pinInfo: PinInfo[] = [];

  /** Valeur courante du curseur de simulation (unités du contrôle, ex. Lx). */
  controlValue = 0;
  /** État courant de l'interrupteur de simulation. */
  switchOn = false;

  private wrapper: HTMLDivElement;
  private activeValue = false;
  /** Calque de texte superposé (afficheurs I²C : LCD). */
  private screen: HTMLDivElement | null = null;
  /** Contrôle de simulation défini dans le créateur (curseur/interrupteur). */
  private control: CustomControl | null = null;
  private controlBox: HTMLDivElement | null = null;

  /** Module behavior.mjs optionnel : init/tick/destroy pour simulation embarquée. */
  private behavior: BehaviorModule | null = null;
  /** Fonctions de lecture/écriture des broches : injectées par sim.mts. */
  private behaviorContext: BehaviorContext | null = null;

  static get observedAttributes(): string[] {
    return ['simulating'];
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .frame { display: inline-block; line-height: 0; transition: filter 0.05s; position: relative; }
      .frame--active { filter: drop-shadow(0 0 6px rgba(255, 230, 80, 0.95)); }
      .lcd {
        position: absolute;
        font-family: 'Courier New', monospace;
        white-space: pre;
        line-height: 1;
        color: #04203a;
        background: rgba(120, 220, 170, 0.0);
        pointer-events: none;
        letter-spacing: 0.05em;
      }
      ${simControlStyles.cssText}
    `;
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'frame';
    shadow.append(style, this.wrapper);
  }

  /** Définition du composant : injecte le SVG et calcule les broches. */
  set definition(def: PartDef) {
    if (!def.custom) return;
    this.wrapper.innerHTML = def.custom.svg;
    this.pinInfo = def.custom.pins.map((p) => ({ name: p.name, x: p.x, y: p.y, signals: [] }));
    this.control = def.custom.control ?? null;
    if (this.control?.type === 'slider') {
      const min = this.control.min ?? 0;
      const max = this.control.max ?? 100;
      this.controlValue = (min + max) / 2;
    }
    if (def.kind === 'pushbutton') {
      this.wrapper.addEventListener('pointerdown', () => {
        this.dispatchEvent(new Event('button-press'));
      });
      const release = () => this.dispatchEvent(new Event('button-release'));
      this.wrapper.addEventListener('pointerup', release);
      this.wrapper.addEventListener('pointerleave', release);
    }
  }

  /** Attribut `simulating` (setLocked) : montre/cache le contrôle de simulation. */
  attributeChangedCallback(name: string): void {
    if (name === 'simulating') this.renderControl();
  }

  private renderControl(): void {
    this.controlBox?.remove();
    this.controlBox = null;
    if (!this.control || !this.hasAttribute('simulating')) return;
    const box = document.createElement('div');
    box.className = 'sim-control';
    if (this.control.label) {
      const label = document.createElement('label');
      label.textContent = this.control.label;
      box.appendChild(label);
    }
    const val = document.createElement('span');
    val.className = 'val val--wide';
    const unit = this.control.unit ? ` ${this.control.unit}` : '';
    if (this.control.type === 'slider') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(this.control.min ?? 0);
      input.max = String(this.control.max ?? 100);
      input.step = String(this.control.step ?? 1);
      input.value = String(this.controlValue);
      val.textContent = `${this.controlValue}${unit}`;
      input.addEventListener('input', (e) => {
        e.stopPropagation();
        this.controlValue = Number(input.value);
        val.textContent = `${this.controlValue}${unit}`;
        this.dispatchEvent(new Event('input'));
      });
      box.append(input, val);
    } else {
      // Interrupteur : case à cocher native (lisible à petite taille).
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.switchOn;
      val.textContent = this.switchOn ? 'ON' : 'OFF';
      input.addEventListener('input', (e) => {
        e.stopPropagation();
        this.switchOn = input.checked;
        val.textContent = this.switchOn ? 'ON' : 'OFF';
        this.dispatchEvent(new Event('input'));
      });
      box.append(input, val);
    }
    this.shadowRoot?.appendChild(box);
    this.controlBox = box;
  }

  /**
   * Affiche le texte d'un afficheur LCD par-dessus le dessin, dans la zone écran
   * (x,y,w,h en px du repère du composant). La police est dimensionnée pour
   * remplir la zone selon le nombre de lignes/colonnes.
   */
  setLcd(lines: string[], rect: { x: number; y: number; w: number; h: number }): void {
    if (!this.screen) {
      this.screen = document.createElement('div');
      this.screen.className = 'lcd';
      this.wrapper.appendChild(this.screen);
    }
    const rows = Math.max(1, lines.length);
    const cols = Math.max(1, ...lines.map((l) => l.length));
    const fontH = rect.h / rows;
    this.screen.style.left = `${rect.x}px`;
    this.screen.style.top = `${rect.y}px`;
    this.screen.style.width = `${rect.w}px`;
    this.screen.style.height = `${rect.h}px`;
    this.screen.style.fontSize = `${Math.max(4, fontH * 0.85)}px`;
    // Largeur de caractère ≈ 0,6 em en monospace : ajuste pour tenir cols colonnes.
    this.screen.style.letterSpacing = `${Math.max(0, rect.w / cols - fontH * 0.6) * 0.5}px`;
    this.screen.textContent = lines.join('\n');
  }

  /** Retour visuel (LED/buzzer actif) : halo lumineux autour du dessin. */
  set active(value: boolean) {
    if (value === this.activeValue) return;
    this.activeValue = value;
    this.wrapper.classList.toggle('frame--active', value);
  }

  get active(): boolean {
    return this.activeValue;
  }

  /**
   * Injecte un module behavior.mjs préalablement compilé (reçu du .kompix).
   * Crée le contexte et appelle init() si présent.
   */
  injectBehavior(
    module: BehaviorModule,
    readPin: (name: string) => 0 | 1,
    writePin: (name: string, value: 0 | 1) => void,
  ): void {
    this.behavior = module;
    const self = this;
    const ctx: any = {
      pinInfo: this.pinInfo,
      readPin,
      writePin,
    };
    Object.defineProperty(ctx, 'active', {
      get: () => self.activeValue,
      enumerable: true,
    });
    Object.defineProperty(ctx, 'controlValue', {
      get: () => self.controlValue,
      enumerable: true,
    });
    Object.defineProperty(ctx, 'switchOn', {
      get: () => self.switchOn,
      enumerable: true,
    });
    this.behaviorContext = ctx;
    if (this.behavior.init) {
      this.behavior.init(ctx);
    }
  }

  /** Appelle tick() du behavior à chaque frame de simulation. */
  tickBehavior(): void {
    if (this.behavior?.tick && this.behaviorContext) {
      this.behavior.tick(this.behaviorContext as any);
    }
  }

  /** Nettoie le behavior à l'arrêt de la simulation. */
  destroyBehavior(): void {
    if (this.behavior?.destroy && this.behaviorContext) {
      this.behavior.destroy(this.behaviorContext as any);
    }
    this.behavior = null;
    this.behaviorContext = null;
  }
}

if (!customElements.get('kablix-custom-part')) {
  customElements.define('kablix-custom-part', CustomPartElement);
}
