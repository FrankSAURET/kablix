// Élément <kablix-custom-part> : héberge le dessin SVG d'un composant créé par
// l'utilisateur, expose `pinInfo` comme les éléments @wokwi/elements, et un
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

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .frame { display: inline-block; line-height: 0; transition: filter 0.05s; }
      .frame--active { filter: drop-shadow(0 0 6px rgba(255, 230, 80, 0.95)); }
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
