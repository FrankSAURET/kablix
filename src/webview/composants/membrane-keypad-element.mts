// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — membrane-keypad-element.ts.
// Balise <kablix-membrane-keypad> (ex <wokwi-membrane-keypad>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix :
//   - sans décorateurs (static properties + declare + constructeur), imports relatifs .mjs ;
//   - DESSINS remplacés par les versions retouchées (./externe/keypad-3col.svg /
//     keypad-4col.svg), sélectionnées selon `columns` ; broches codées en dur sur
//     la grille de 10 px (repère du dessin retouché, y=320) ;
//   - touches recâblées nativement dans `wireKeys()` : les capuchons du dessin
//     retouché (rects de 42,33 px) sont retrouvés par géométrie (tri ligne/colonne)
//     puis reçoivent tabindex/data-key-name/écouteurs. Contrat conservé pour
//     sim.mts : événements button-press/button-release {key, row, column} et
//     classe `pressed` sur l'élément [data-key-name] (verrouillage Ctrl+clic) ;
//   - `connector` supprimé : la nappe 7/8 fils fait partie du dessin retouché.
import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { SPACE_KEYS } from './utils/keys.mjs';
import drawing3col from './externe/keypad-3col.svg';
import drawing4col from './externe/keypad-4col.svg';

function isNumeric(text: string) {
  return !isNaN(parseFloat(text));
}

export class MembraneKeypadElement extends LitElement {
  declare columns: '3' | '4';
  declare keys: string[];

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    columns: {},
    keys: { type: Array },
  };

  constructor() {
    super();
    this.columns = '4';
    this.keys = [
    '1',  '2',  '3',  'A',
    '4',  '5',  '6',  'B',
    '7',  '8',  '9',  'C',
    '*',  '0',  '#',  'D',
  ];
  }

  // Broches : centre des pastilles du dessin retouché (extrémité de la nappe),
  // toutes sur la grille de 10 px (y=320, pas de 10 en x).
  get pinInfo(): ElementPin[] {
    const names =
      this.columns === '3'
        ? ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3']
        : ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'];
    const x0 = this.columns === '3' ? 80 : 110;
    return names.map((name, i) => ({ name, x: x0 + i * 10, y: 320, signals: [] }));
  }

  static get styles() {
    return css`
      /* L'hôte doit épouser le dessin : en inline (défaut), la boîte de l'hôte
         ne fait qu'une ligne de texte et le svg déborde 316 px au-dessus du
         corps du composant (constaté en sonde headless). */
      :host {
        display: inline-block;
      }

      svg {
        display: block;
      }

      text {
        user-select: none;
        pointer-events: none;
      }

      rect.key {
        cursor: pointer;
      }

      rect.key:focus,
      rect.key:active {
        stroke: white;
        outline: none;
        filter: url(#shadow);
      }

      rect.key--blue.pressed,
      rect.key--blue:active {
        fill: #4e50d7 !important;
      }

      rect.key--red.pressed,
      rect.key--red:active {
        fill: #ab040b !important;
      }
    `;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('columns')) {
      this.dispatchEvent(new CustomEvent('pininfo-change'));
    }
    super.update(changedProperties);
  }

  private pressedKeys = new Set<string>();

  render() {
    const three = this.columns === '3';
    const width = three ? 220 : 285;
    return html`
      <svg
        width="${width}"
        height="330"
        viewBox="0 0 ${width} 330"
        font-family="sans-serif"
        xmlns="http://www.w3.org/2000/svg"
        @keydown=${(e: KeyboardEvent) => this.keyStrokeDown(e.key)}
        @keyup=${(e: KeyboardEvent) => this.keyStrokeUp(e.key)}
      >${unsafeSVG(three ? drawing3col : drawing4col)}</svg>
    `;
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    // (Re)branche les touches au premier rendu et à chaque changement de dessin
    // (`columns` figure dans `changed` au premier update ; un changement ultérieur
    // recrée les rects via unsafeSVG, donc pas de double écouteur).
    if (changed.has('columns')) this.wireKeys();
  }

  /**
   * Retrouve les capuchons de touche du dessin retouché (rects de 42,33 px de
   * côté), les trie en lecture ligne/colonne et leur attache l'interactivité :
   * data-key-name, tabindex, classes de couleur et écouteurs souris/clavier.
   */
  private wireKeys(): void {
    const svgEl = this.renderRoot.querySelector('svg');
    if (!svgEl) return;
    const caps = [...svgEl.querySelectorAll('rect')].filter(
      (r) => Math.round(Number(r.getAttribute('width'))) === 42
    );
    caps.sort((a, b) => {
      const dy = Number(a.getAttribute('y')) - Number(b.getAttribute('y'));
      return dy !== 0 ? dy : Number(a.getAttribute('x')) - Number(b.getAttribute('x'));
    });
    const cols = this.columns === '3' ? 3 : 4;
    caps.forEach((cap, i) => {
      const row = Math.floor(i / cols);
      const column = i % cols;
      const text = this.keys[row * 4 + column] ?? '';
      cap.classList.add('key', isNumeric(text) ? 'key--blue' : 'key--red');
      cap.dataset.keyName = text.toUpperCase();
      cap.setAttribute('tabindex', '0');
      cap.addEventListener('blur', (e) => this.up(text, e.currentTarget as SVGElement));
      cap.addEventListener('mousedown', () => this.down(text));
      cap.addEventListener('mouseup', () => this.up(text));
      cap.addEventListener('touchstart', () => this.down(text));
      cap.addEventListener('touchend', () => this.up(text));
      cap.addEventListener('keydown', (e) => {
        if (SPACE_KEYS.includes(e.key)) this.down(text, e.currentTarget as SVGElement);
      });
      cap.addEventListener('keyup', (e) => {
        if (SPACE_KEYS.includes(e.key)) this.up(text, e.currentTarget as SVGElement);
      });
    });
  }

  private keyIndex(key: string) {
    const index = this.keys.indexOf(key);
    return { row: Math.floor(index / 4), column: index % 4 };
  }

  private down(key: string, element?: Element) {
    if (!this.pressedKeys.has(key)) {
      if (element) {
        element.classList.add('pressed');
      }
      this.pressedKeys.add(key);
      this.dispatchEvent(
        new CustomEvent('button-press', {
          detail: { key, ...this.keyIndex(key) },
        }),
      );
    }
  }

  private up(key: string, element?: Element) {
    if (this.pressedKeys.has(key)) {
      if (element) {
        element.classList.remove('pressed');
      }
      this.pressedKeys.delete(key);
      this.dispatchEvent(
        new CustomEvent('button-release', {
          detail: { key, ...this.keyIndex(key) },
        }),
      );
    }
  }

  private keyStrokeDown(key: string) {
    const text = key.toUpperCase();
    const selectedKey = this.shadowRoot?.querySelector(`[data-key-name="${text}"]`);
    if (selectedKey) {
      this.down(text, selectedKey as SVGElement);
    }
  }

  private keyStrokeUp(key: string) {
    const text = key.toUpperCase();
    const selectedKey = this.shadowRoot?.querySelector(`[data-key-name="${text}"]`);
    const pressedKeys: NodeListOf<SVGElement> | undefined =
      this.shadowRoot?.querySelectorAll('.pressed');

    if (key === 'Shift') {
      pressedKeys?.forEach((pressedKey) => {
        const pressedText = pressedKey.dataset.keyName;
        if (pressedText) {
          this.up(pressedText, pressedKey);
        }
      });
    }

    if (selectedKey) {
      this.up(text, selectedKey as SVGElement);
    }
  }
}

if (!customElements.get('kablix-membrane-keypad')) {
  customElements.define('kablix-membrane-keypad', MembraneKeypadElement);
}
