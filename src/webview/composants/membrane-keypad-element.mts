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
// Variante « touches dures » (dessins de Frank, nettoyés + ids préfixés kpt3-/kpt4-) :
// mêmes viewBox et mêmes pastilles de broches (80..140@320 / 110..180@320) que la
// membrane — seule l'apparence et la détection des touches changent.
import drawing3touche from './externe/keypad-3col-touche.svg';
import drawing4touche from './externe/keypad-4col-touche.svg';

function isNumeric(text: string) {
  return !isNaN(parseFloat(text));
}

export class MembraneKeypadElement extends LitElement {
  declare columns: '3' | '4';
  declare hardkeys: boolean;
  declare keys: string[];

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    columns: {},
    // Variante « touches dures » (case membrane/touche de l'inspecteur).
    hardkeys: { type: Boolean },
    keys: { type: Array },
  };

  constructor() {
    super();
    this.columns = '4';
    this.hardkeys = false;
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
        font-weight: 300;
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

      /* Touche dure : le filtre url(#shadow) de la règle générique ne se
         résout pas dans le dessin préfixé (kpt3-/kpt4-) → neutralisé au focus,
         puis capuchon assombri + légèrement enfoncé à l'appui (le dégradé du
         dessin de Frank reste visible, juste plus sombre). */
      rect.key--hard:focus {
        stroke: white;
        outline: none;
        filter: none;
      }

      rect.key--hard.pressed,
      rect.key--hard:active {
        filter: brightness(0.72);
        transform: translateY(1px);
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
    const drawing = three
      ? (this.hardkeys ? drawing3touche : drawing3col)
      : (this.hardkeys ? drawing4touche : drawing4col);
    return html`
      <svg
        width="${width}"
        height="330"
        viewBox="0 0 ${width} 330"
        font-family="sans-serif"
        xmlns="http://www.w3.org/2000/svg"
        @keydown=${(e: KeyboardEvent) => this.keyStrokeDown(e.key)}
        @keyup=${(e: KeyboardEvent) => this.keyStrokeUp(e.key)}
      >${unsafeSVG(drawing)}</svg>
    `;
  }

  updated(changed: PropertyValues): void {
    super.updated(changed);
    // (Re)branche les touches au premier rendu et à chaque changement de dessin
    // (`columns`/`hardkeys` figurent dans `changed` au premier update ; un
    // changement ultérieur recrée les rects via unsafeSVG → pas de double écouteur).
    if (changed.has('columns') || changed.has('hardkeys')) this.wireKeys();
  }

  /**
   * Retrouve les capuchons de touche du dessin et leur attache l'interactivité
   * (data-key-name, tabindex, classes et écouteurs souris/clavier), en lecture
   * ligne/colonne. Membrane : rects de 42,33 px repérés par leurs attributs x/y.
   * Touches dures : chaque touche = 2 rects superposés de 32,87 px (socle +
   * capuchon, transforms Inkscape imbriqués — dont 4 touches hors groupe en
   * 4 colonnes) → repérage par la BOÎTE RENDUE, dédoublonné par centre, en
   * gardant le rect dessiné au-dessus (le dernier dans l'ordre du document).
   */
  private wireKeys(): void {
    const svgEl = this.renderRoot.querySelector('svg');
    if (!svgEl) return;
    let caps: SVGRectElement[];
    if (this.hardkeys) {
      const all = [...svgEl.querySelectorAll('rect')].filter(
        (r) => Math.abs(Number(r.getAttribute('width')) - 32.865) < 0.1 && !r.closest('defs')
      ) as SVGRectElement[];
      // Centre rendu de chaque rect ; 2 rects par touche → garde le dernier.
      const byCell = new Map<string, SVGRectElement>();
      const centers = new Map<SVGRectElement, { x: number; y: number }>();
      for (const r of all) {
        const b = r.getBoundingClientRect();
        const c = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        centers.set(r, c);
        byCell.set(`${Math.round(c.x / 8)}:${Math.round(c.y / 8)}`, r);
      }
      caps = [...byCell.values()];
      caps.sort((a, b) => {
        const ca = centers.get(a)!;
        const cb = centers.get(b)!;
        return Math.abs(ca.y - cb.y) > 4 ? ca.y - cb.y : ca.x - cb.x;
      });
    } else {
      caps = [...svgEl.querySelectorAll('rect')].filter(
        (r) => Math.round(Number(r.getAttribute('width'))) === 42
      ) as SVGRectElement[];
      caps.sort((a, b) => {
        const dy = Number(a.getAttribute('y')) - Number(b.getAttribute('y'));
        return dy !== 0 ? dy : Number(a.getAttribute('x')) - Number(b.getAttribute('x'));
      });
    }
    const cols = this.columns === '3' ? 3 : 4;
    const hard = this.hardkeys;
    caps.forEach((cap, i) => {
      const row = Math.floor(i / cols);
      const column = i % cols;
      const text = this.keys[row * 4 + column] ?? '';
      cap.classList.add('key', hard ? 'key--hard' : isNumeric(text) ? 'key--blue' : 'key--red');
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
