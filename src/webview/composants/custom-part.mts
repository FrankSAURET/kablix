// Élément <kablix-custom-part> : héberge le dessin SVG d'un composant créé par
// l'utilisateur, expose `pinInfo` comme les composants forkés, et un
// retour visuel minimal (halo lumineux quand `active` est vrai — LED, buzzer…).
// Pour le modèle « bouton », il émet button-press / button-release au clic.

import type { PartDef } from '../diagram/catalog.mjs';

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

export class CustomPartElement extends HTMLElement {
  pinInfo: PinInfo[] = [];

  private wrapper: HTMLDivElement;
  private activeValue = false;
  /** Calque de texte superposé (afficheurs I²C : LCD). */
  private screen: HTMLDivElement | null = null;

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
    if (def.kind === 'pushbutton') {
      this.wrapper.addEventListener('pointerdown', () => {
        this.dispatchEvent(new Event('button-press'));
      });
      const release = () => this.dispatchEvent(new Event('button-release'));
      this.wrapper.addEventListener('pointerup', release);
      this.wrapper.addEventListener('pointerleave', release);
    }
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
}

if (!customElements.get('kablix-custom-part')) {
  customElements.define('kablix-custom-part', CustomPartElement);
}
