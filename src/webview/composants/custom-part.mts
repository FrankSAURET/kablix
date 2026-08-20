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

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Marqueurs des LED sorties d'un chemin groupé, et du chemin qu'elles remplacent. */
const LED_CLONE = 'data-kx-led';
const LED_SOURCE = 'data-kx-led-src';
/** Id du dégradé des LED allumées (un par shadow root, donc sans collision). */
const LED_GRAD_ID = 'kx-led-glow';

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

  /**
   * Colore un groupe nommé du dessin (projecteur DMX : le groupe « LED »).
   *
   * Les formes du dessin portent leur remplissage en style INLINE, souvent un
   * dégradé (`fill:url(#…)`) : poser un `fill` sur le groupe ne se verrait pas.
   * On écrase donc la propriété sur chaque descendant, en `!important`, après
   * avoir mis de côté le style d'origine — `color = null` le restitue tel quel.
   *
   * La peinture n'est pas un aplat : chaque LED reçoit un DÉGRADÉ RADIAL en
   * `objectBoundingBox` (cœur clair décalé vers le haut-gauche, bord assombri)
   * qui la fait paraître bombée plutôt que découpée dans du papier.
   */
  setGroupColor(groupId: string, color: string | null, glow = 0): void {
    const group = this.wrapper.querySelector(`#${CSS.escape(groupId)}`);
    if (!(group instanceof SVGElement)) return;
    // Appelé à CHAQUE image de simulation : ne retoucher le DOM que si l'état
    // demandé a changé — ou si le dessin a été re-rendu sous nos pieds.
    const etat = color === null ? '' : `${groupId}|${color}|${glow.toFixed(2)}`;
    if (etat === this.ledState && (color === null || this.ledGrad?.isConnected)) return;
    this.ledState = etat;
    if (color === null) {
      for (const clone of group.querySelectorAll(`[${LED_CLONE}]`)) clone.remove();
      for (const source of group.querySelectorAll(`[${LED_SOURCE}]`)) source.removeAttribute(LED_SOURCE);
      this.ledDefs?.remove();
      this.ledDefs = null;
      this.ledGrad = null;
      for (const el of this.savedStyles.keys()) {
        const orig = this.savedStyles.get(el);
        if (orig === null || orig === undefined) el.removeAttribute('style');
        else el.setAttribute('style', orig);
      }
      this.savedStyles.clear();
      group.style.removeProperty('filter');
      return;
    }
    this.splitLeds(group);
    const paint = this.ledGradient(group, color, glow);
    for (const el of [group, ...group.querySelectorAll('*')] as SVGElement[]) {
      if (el.hasAttribute(LED_SOURCE)) continue; // chemin groupé, remplacé par ses LED
      if (!el.hasAttribute(LED_CLONE) && !this.savedStyles.has(el)) {
        this.savedStyles.set(el, el.getAttribute('style'));
      }
      el.style.setProperty('fill', paint, 'important');
      // Le dessin peint ses LED éteintes en translucide (fill-opacity 0,8 sur
      // opacity 0,62) : allumées, elles doivent être franches.
      el.style.setProperty('fill-opacity', '1', 'important');
      el.style.setProperty('opacity', '1', 'important');
    }
    // Halo : c'est ce qui distingue un projecteur ALLUMÉ d'un projecteur peint.
    group.style.setProperty('filter', glow > 0 ? `drop-shadow(0 0 ${(6 * glow).toFixed(1)}px ${color})` : 'none');
  }

  /**
   * Sort chaque LED dans son propre `<path>`.
   *
   * Une couronne de LED est dessinée comme UN chemin de 13, 20 puis 26
   * sous-chemins : un dégradé en `objectBoundingBox` posé là s'étalerait sur la
   * couronne entière au lieu de bomber chaque LED. Les sous-chemins repartant
   * d'un `M` absolu, chacun tient debout seul — un `m` relatif, lui, se
   * déplacerait : ces chemins-là sont laissés tels quels.
   */
  private splitLeds(group: SVGElement): void {
    if (group.querySelector(`[${LED_CLONE}]`)) return; // déjà éclaté
    for (const el of Array.from(group.querySelectorAll('path'))) {
      const d = el.getAttribute('d') ?? '';
      if (d.includes('m')) continue;
      const leds = d.split(/(?=M)/).filter((s) => s.trim());
      if (leds.length < 2) continue;
      if (!this.savedStyles.has(el)) this.savedStyles.set(el, el.getAttribute('style'));
      for (const led of leds) {
        const forme = el.cloneNode(false) as SVGElement;
        forme.removeAttribute('id');
        forme.setAttribute('d', led);
        forme.setAttribute(LED_CLONE, '');
        el.parentNode?.insertBefore(forme, el);
      }
      el.setAttribute(LED_SOURCE, '');
      el.style.setProperty('display', 'none', 'important');
    }
  }

  /**
   * Dégradé radial d'une LED allumée : cœur clair (d'autant plus blanc que la
   * LED brille fort), couleur demandée à mi-course, bord assombri. Il vit dans
   * un `<defs>` ajouté au SVG — donc dans le shadow root du composant, où son
   * id ne peut se cogner à celui d'une autre instance.
   */
  private ledGradient(group: SVGElement, color: string, glow: number): string {
    const svg = group.ownerSVGElement;
    if (!svg) return color;
    const rgb = (color.match(/\d+/g) ?? ['255', '255', '255']).map(Number);
    const vers = (cible: number, k: number): string =>
      `rgb(${rgb.map((v) => Math.round(v + (cible - v) * k)).join(',')})`;
    const coeur = 0.35 + 0.5 * Math.min(1, Math.max(0, glow));
    const stops: [number, string][] = [
      [0, vers(255, coeur)],
      [0.3, vers(255, coeur * 0.4)],
      [0.65, color],
      [1, vers(0, 0.45)],
    ];
    if (!this.ledGrad?.isConnected) {
      this.ledDefs = document.createElementNS(SVG_NS, 'defs');
      this.ledGrad = document.createElementNS(SVG_NS, 'radialGradient');
      this.ledGrad.setAttribute('id', LED_GRAD_ID);
      this.ledGrad.setAttribute('cx', '0.36');
      this.ledGrad.setAttribute('cy', '0.3');
      this.ledGrad.setAttribute('r', '0.75');
      this.ledDefs.appendChild(this.ledGrad);
      svg.appendChild(this.ledDefs);
    }
    this.ledGrad.textContent = '';
    for (const [offset, teinte] of stops) {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', String(offset));
      stop.setAttribute('stop-color', teinte);
      this.ledGrad.appendChild(stop);
    }
    return `url(#${LED_GRAD_ID})`;
  }

  /** Styles d'origine des formes recolorées (`null` = pas d'attribut style). */
  private savedStyles = new Map<SVGElement, string | null>();
  /** Dégradé des LED allumées, et le `<defs>` qui le porte. */
  private ledGrad: SVGElement | null = null;
  private ledDefs: SVGElement | null = null;
  /** Dernier état peint (`groupe|couleur|intensité`) : évite un DOM retouché par image. */
  private ledState = '';

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
