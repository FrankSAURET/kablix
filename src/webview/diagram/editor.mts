// Éditeur visuel : palette, placement, déplacement, câblage multi-points et
// éditeur de composants (inspecteur). Le modèle logique vit dans model.mts ;
// ici on gère le DOM et les interactions.
//
// Câblage : cliquer une broche démarre un fil ; chaque clic sur le canvas pose
// un point intermédiaire (aimanté horizontal/vertical) ; cliquer une autre
// broche termine le fil. Échap annule. Les fils sont tracés avec un congé à
// chaque changement de direction et colorés selon la nappe Dupont.
import {
  CATALOG,
  CATEGORY_ORDER,
  listCustomParts,
  partCategory,
  partDef,
  pinElectricalRole,
  registerCustomPart,
  unregisterCustomPart,
  type CustomPartData,
  type PartDef,
  type PropDef,
} from './catalog.mjs';
import { breadboardPins, normalizeSize, stripOfPin } from './breadboard.mjs';
import { internalWiringSvg, type PinPoint } from './internal-wiring.mjs';
import { overridesFor } from './pin-overrides.mjs';
import { boardDrawing } from './board-drawings.mjs';
import { pinoutSvg, pinoutPoster } from './pinout.mjs';
import { BOARD_W, BOARD_H } from '../composants/pico-board.mjs';
import type { Diagram, Endpoint, Part, Wire } from './model.mjs';
import { DEFAULT_WIRE_COLORS, DUPONT_COLORS, dupontHex, roundedWirePath, snapPoint, type XY } from './geometry.mjs';
import { PartCreator } from './creator.mjs';
import '../composants/custom-part.mjs';
import { t } from '../i18n.mjs';

interface WokwiPin {
  name: string;
  x: number;
  y: number;
}
type WokwiElement = HTMLElement & { pinInfo: WokwiPin[] } & Record<string, unknown>;

interface Rendered {
  part: Part;
  container: HTMLDivElement;
  el: WokwiElement;
  hotspots: Map<string, HTMLDivElement>;
  /** SVG du dessin retouché (board-drawing), s'il y en a un — pour le retour
   * visuel de simulation (l'élément @wokwi étant masqué). */
  drawing?: SVGElement;
}

interface PendingWire {
  from: Endpoint;
  points: XY[];
  /** false : on est encore dans le geste presser-glisser initial. */
  clickMode: boolean;
  downAt: XY;
}

type Selection = { kind: 'part'; id: string } | { kind: 'wire'; id: string } | null;

export type PaletteSort = 'category' | 'alpha';

/** Préférences de palette persistées côté extension. */
export interface PaletteState {
  sort: PaletteSort;
  recents: string[];
  /** Afficher (ou non) la section « Derniers utilisés » en tête de palette. */
  showRecents: boolean;
  /** Clés des sections repliées (catégories, derniers utilisés, personnalisés). */
  collapsed: string[];
  /** Mode de pliage : tout déplier / tout replier / accordéon auto. */
  fold?: PaletteFold;
}

export type PaletteFold = 'expand' | 'collapse' | 'auto';

/** Trou de platine d'essai, en coordonnées canvas (cache pendant un drag). */
interface BreadboardHole {
  partId: string;
  pin: string;
  x: number;
  y: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 4;
/** Distance max (px) entre une broche et un trou de platine pour l'enfichage. */
const BB_SNAP = 6;
/** Rayon d'accrochage (px) pour reconnecter l'extrémité d'un fil à une broche. */
const PIN_SNAP = 14;
const MAX_RECENTS = 10;
/** Type MIME du glisser-déposer palette → canvas (pose d'un composant). */
const DND_MIME = 'application/x-kablix-part';
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 10; // 1000 %
/** Pas de la grille magnétique d'alignement (px) = écartement des broches. */
const GRID = 10;
/** Aligne une coordonnée sur la grille magnétique. */
const snapToGrid = (v: number): number => Math.round(v / GRID) * GRID;
/**
 * Cale une broche sur la grille **par rapport à la 1re broche (ancre)** : on force
 * un pas multiple de 10 depuis l'ancre, sans bouger l'ancre. Les coordonnées Wokwi
 * (× pinScale) dérivent légèrement du pas 10 px (pas de carte irrégulier + arrondi
 * d'échelle) : ce calage rend toutes les broches enfichables. Le seuil (3 px) ne
 * corrige que la dérive et laisse en place une broche volontairement hors-grille.
 */
const snapPinTo = (v: number, anchor: number): number => {
  const r = anchor + Math.round((v - anchor) / GRID) * GRID;
  return Math.abs(r - v) <= 3 ? r : v;
};
/** Dimensions de la vignette de composant dans la palette (px). */
const THUMB_W = 46;
const THUMB_H = 30;

/** Symbole radioactif (trèfle noir sur disque jaune) pour le bouton de câblage interne. */
// Badge du bouton de brochage : « K » (Kablix) gras et jaune, **inversé**
// (miroir horizontal), dans un rond noir. Le SVG remplit le bouton (width/height
// 100 % via CSS) → le rond noir est exactement concentrique au rond blanc.
const KABLIX_BADGE =
  `<svg viewBox="0 0 16 16" xmlns="${SVG_NS}">` +
  `<circle cx="8" cy="8" r="7.2" fill="#000"/>` +
  `<g transform="translate(16,0) scale(-1,1)">` +
  `<text x="8" y="8.4" text-anchor="middle" dominant-baseline="central" ` +
  `font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="12" ` +
  `fill="#f4c20d">K</text></g></svg>`;

/** Icône d'arborescence/classification pour le tri par catégorie de la palette. */
const TREE_ICON =
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ` +
  `stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" xmlns="${SVG_NS}">` +
  `<rect x="5.5" y="1.5" width="5" height="3" rx="0.6"/>` +
  `<rect x="1.5" y="11" width="4" height="3" rx="0.6"/>` +
  `<rect x="10.5" y="11" width="4" height="3" rx="0.6"/>` +
  `<path d="M8 4.5V7M3.5 11V8.5H12.5V11"/></svg>`;
let idSeq = 0;
const uid = (prefix: string): string => `${prefix}${++idSeq}`;

export class Editor {
  readonly diagram: Diagram = { parts: [], wires: [] };
  onChange: (() => void) | null = null;

  /** Appelé quand la liste des composants personnalisés change (persistance). */
  onCustomPartsChange: ((parts: CustomPartData[]) => void) | null = null;
  /** Appelé pour exporter un composant personnalisé en fichier .json. */
  onExportCustomPart: ((part: CustomPartData) => void) | null = null;
  /** Appelé quand le tri de la palette ou les derniers utilisés changent. */
  onPaletteStateChange: ((state: PaletteState) => void) | null = null;
  /** Appelé à l'ajout d'un composant (pose ou glisser-déposer) — sélection auto de la carte. */
  onPartAdded: ((part: Part) => void) | null = null;
  /** Appelé pour ouvrir un lien externe (doc Wokwi d'un composant). */
  onOpenExternal: ((url: string) => void) | null = null;
  /** Appelé pour ouvrir l'aide locale d'un composant (fiche docs/composants/<type>.md). */
  onComponentHelp: ((type: string) => void) | null = null;

  private paletteSort: PaletteSort = 'category';
  private paletteFilter = '';
  private recentTypes: string[] = [];
  private showRecents = true;
  /** Clés des sections de palette repliées (persisté). */
  private paletteCollapsed = new Set<string>();
  /** Mode de pliage des catégories (persisté) : déplier/replier/accordéon. */
  private paletteFold: PaletteFold = 'expand';
  /** Clés des sections repliables présentes au dernier rendu (pour tout replier). */
  private sectionKeys: string[] = [];
  /** Menu de choix du mode de pliage (ouvert à l'appui sur le bouton), et son nettoyage. */
  private foldMenu: HTMLDivElement | null = null;
  private foldMenuOff: (() => void) | null = null;
  private rendered = new Map<string, Rendered>();
  private wirePaths = new Map<string, SVGPathElement>();
  private pending: PendingWire | null = null;
  private tempPath: SVGPathElement | null = null;
  private selection: Selection = null;
  /** Composants sélectionnés (sélection multiple : marquee, Ctrl+clic). */
  private selectedParts = new Set<string>();
  private colorIndex = 0;
  private customData = new Map<string, CustomPartData>();
  private creator = new PartCreator((data) => this.saveCustomPart(data));
  private handles: HTMLDivElement[] = [];
  private guides: SVGLineElement[] = [];
  /** Platines dont des trous sont actuellement en surbrillance. */
  private highlightedBoards = new Set<string>();
  /** Composants dont le câblage interne est actuellement affiché (bouton 🔌). */
  private internalShown = new Set<string>();
  /** Cartes dont le poster de brochage complet est affiché (bouton ☢). */
  private pinoutShown = new Set<string>();
  /** Coude de fil actuellement sélectionné (supprimable avec Suppr). */
  private activeHandle: { wireId: string; index: number } | null = null;
  /** Verrou pendant la simulation : pas d'édition du schéma (sélection/déplacement/câblage). */
  private locked = false;
  /** Bandeau d'avertissement « câblage verrouillé » affiché pendant la simulation. */
  private lockWarning: HTMLDivElement | null = null;
  /** Pile d'annulation (états sérialisés du schéma) et position courante. */
  private history: string[] = [];
  private historyIndex = -1;
  /** Vrai pendant une restauration (annuler/refaire) : ne pas réenregistrer l'historique. */
  private restoring = false;
  /** Presse-papier interne pour dupliquer une sélection (Ctrl+C / Ctrl+V / Ctrl+D). */
  private clipboard: { parts: Part[]; wires: Wire[] } | null = null;

  /** Calque transformable (zoom + translation) contenant fils et composants. */
  private readonly world: HTMLDivElement;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private zoomBadge: HTMLButtonElement | null = null;

  constructor(
    private readonly canvas: HTMLDivElement,
    private readonly palette: HTMLDivElement,
    private readonly svg: SVGSVGElement,
    private readonly inspector: HTMLDivElement
  ) {
    // Le « monde » regroupe les fils et les composants pour les transformer
    // d'un bloc (le canvas reste la fenêtre fixe, qui rogne le débordement).
    this.world = document.createElement('div');
    this.world.className = 'canvas__world';
    this.canvas.appendChild(this.world);
    // Feuille de dessin quadrillée (ancrée à l'origine du monde) : posée AVANT
    // le SVG et les composants pour rester en arrière-plan. La grille vit dans le
    // monde transformé → elle suit le zoom/translation sans calcul manuel.
    const sheet = document.createElement('div');
    sheet.className = 'canvas__sheet';
    this.world.appendChild(sheet);
    this.world.appendChild(this.svg); // reparent le SVG des fils dans le monde

    this.buildPalette();
    this.renderInspector();
    this.buildZoomBadge();
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);
    // Le clic droit sert au déplacement des composants : pas de menu contextuel.
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Clic sur le fond : pose un point de fil, ou désélectionne.
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.target !== this.canvas && e.target !== this.world && e.target !== this.svg) return;
      if (this.locked) return; // simulation : pas d'édition
      if (this.pending) {
        this.addPendingPoint(this.canvasPoint(e.clientX, e.clientY));
      } else if (e.button === 0) {
        this.startMarquee(e); // glisser = sélection multiple ; clic simple = désélection
      }
    });
    // Bouton central de la souris : déplacement de la vue (pan), partout sur le
    // canvas (même au-dessus d'un composant, même en simulation). Capture +
    // stopPropagation pour passer avant les gestes de déplacement/sélection.
    this.canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        this.startPan(e);
      },
      true
    );
    // Zoom à la molette, centré sur le curseur.
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // Dépôt d'un composant glissé depuis la palette, là où on le lâche.
    this.canvas.addEventListener('dragover', (e) => {
      if (!this.locked && e.dataTransfer?.types.includes(DND_MIME)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    this.canvas.addEventListener('drop', (e) => {
      if (this.locked) return;
      const type = e.dataTransfer?.getData(DND_MIME);
      if (!type) return;
      e.preventDefault();
      const p = this.canvasPoint(e.clientX, e.clientY);
      const part = this.addPart(type, Math.max(0, Math.round(p.x)), Math.max(0, Math.round(p.y)));
      // Aligne les broches sur la grille (après rendu : les broches @wokwi
      // peuvent n'être disponibles qu'au cycle suivant).
      requestAnimationFrame(() => this.snapPartToGrid(part.id));
    });
    // État initial enregistré pour l'annulation (feuille vide).
    this.recordHistory();
    // Vue de démarrage centrée (l'origine du monde au centre de la zone utile).
    this.centerOnFirstLayout();
  }

  /**
   * Centre la vue dès que le canvas a une taille réelle. Au montage, la mise en
   * page flex n'est pas encore résolue (`clientWidth/Height` = 0) : un simple
   * `requestAnimationFrame` centrait alors sur les dimensions de repli (800×600),
   * laissant l'origine en haut-gauche au lieu du centre. On attend donc la
   * première taille non nulle (ResizeObserver), puis on se débranche.
   */
  private centerOnFirstLayout(): void {
    if (this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0) {
      this.resetView();
      return;
    }
    const ro = new ResizeObserver(() => {
      if (this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0) {
        ro.disconnect();
        this.resetView();
      }
    });
    ro.observe(this.canvas);
  }

  // --- Verrou de simulation + annuler / refaire -------------------------------
  /** Active/désactive le verrou d'édition (pendant la simulation). */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.cancelPending();
      this.select(null);
    }
    this.canvas.classList.toggle('canvas--locked', locked);
    this.showLockWarning(locked);
    // Bulle des boutons et claviers : « Ctrl+clic… » en simulation, sinon déplacement.
    for (const r of this.rendered.values()) {
      if (!this.isLockable(r.part.type)) continue;
      const b = r.container.querySelector('.part__body') as HTMLElement | null;
      if (b) b.title = this.buttonTitle();
    }
  }

  /** Composant dont une touche/un bouton se verrouille au Ctrl+clic (BP, clavier). */
  private isLockable(type: string): boolean {
    return partDef(type).kind === 'pushbutton' || type === 'keypad';
  }

  /** Bulle d'aide d'un bouton selon l'état : simulation = Ctrl+clic, sinon déplacement. */
  private buttonTitle(): string {
    return this.locked
      ? t('Ctrl+click to lock the unstable state')
      : t('Right-click drag to move');
  }

  /**
   * Bandeau d'avertissement (persistant) signalant le câblage verrouillé pendant
   * la simulation (AVR comme RP2040). Placé en tête de la bibliothèque (zone non
   * utilisée pendant la simulation) ; sa largeur est bornée par celle du panneau.
   */
  private showLockWarning(show: boolean): void {
    // `buildPalette()` vide la palette (replaceChildren) et détache le bandeau :
    // on le recrée/réinsère dès qu'il n'est plus rattaché, sinon il disparaît
    // après la moindre reconstruction de la palette pendant la simulation.
    if (!this.lockWarning || !this.lockWarning.isConnected) {
      const w = this.lockWarning ?? document.createElement('div');
      w.className = 'palette__lock-warning';
      w.textContent = t('⚠ Simulation running: wiring is locked.');
      this.palette.insertBefore(w, this.palette.firstChild);
      this.lockWarning = w;
    }
    this.lockWarning.hidden = !show;
  }

  isLocked(): boolean {
    return this.locked;
  }

  /** Enregistre l'état courant dans la pile d'annulation (ignoré en restauration). */
  private recordHistory(): void {
    if (this.restoring) return;
    const state = JSON.stringify(this.diagram);
    if (this.historyIndex >= 0 && this.history[this.historyIndex] === state) return;
    this.history.splice(this.historyIndex + 1); // efface le « refaire » devenu caduc
    this.history.push(state);
    if (this.history.length > 100) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  undo(): void {
    if (this.locked || this.historyIndex <= 0) return;
    this.historyIndex--;
    this.restoreHistory();
  }

  redo(): void {
    if (this.locked || this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.restoreHistory();
  }

  private restoreHistory(): void {
    const state = this.history[this.historyIndex];
    if (!state) return;
    this.restoring = true;
    try {
      this.loadDiagram(JSON.parse(state) as { parts?: Part[]; wires?: Wire[] });
    } finally {
      this.restoring = false;
    }
  }

  // --- Zoom / déplacement de la vue -------------------------------------------
  private applyTransform(): void {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    // La grille vit dans la feuille (.canvas__sheet), enfant du monde : elle suit
    // donc la transform ci-dessus automatiquement — aucun calage manuel ici.
    if (this.zoomBadge) this.zoomBadge.textContent = `⟳ ${Math.round(this.zoom * 100)} %`;
  }

  private onWheel = (e: WheelEvent): void => {
    // Zoom réservé à Ctrl + molette (le pincement trackpad émet aussi ctrlKey).
    if (!e.ctrlKey) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Point du monde sous le curseur (conservé fixe pendant le zoom).
    const wx = (cx - this.panX) / this.zoom;
    const wy = (cy - this.panY) / this.zoom;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * factor));
    this.panX = cx - wx * z;
    this.panY = cy - wy * z;
    this.zoom = z;
    this.applyTransform();
  };

  private resetView(): void {
    // L'origine du monde (0,0) est posée au centre de la zone utile (sous les
    // barres) plutôt qu'au coin haut-gauche : les composants posés près de
    // l'origine ne se retrouvent plus coincés sous les barres (zone morte où on
    // ne pouvait plus les attraper). Vue de démarrage centrée, zoom 100 %.
    this.zoom = 1;
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;
    const topInset = 56;
    this.panX = cw / 2;
    this.panY = (ch + topInset) / 2;
    this.applyTransform();
  }

  /** Déplacement de la vue à la souris (bouton central), en pixels écran. */
  private startPan(e: PointerEvent): void {
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = this.panX;
    const oy = this.panY;
    const move = (ev: PointerEvent): void => {
      this.panX = ox + (ev.clientX - startX);
      this.panY = oy + (ev.clientY - startY);
      this.applyTransform();
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /**
   * Recentre et ajuste le zoom pour que tout le schéma (composants, coudes de
   * fils) tienne dans la zone visible, avec une marge. Atelier vide → vue 100%.
   */
  fitView(): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x: number, y: number): void => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const r of this.rendered.values()) {
      const body = r.container.querySelector('.part__body') as HTMLElement | null;
      const w = body?.offsetWidth || 40;
      const h = body?.offsetHeight || 40;
      grow(r.part.x, r.part.y);
      grow(r.part.x + w, r.part.y + h);
    }
    for (const wire of this.diagram.wires) {
      for (const p of wire.points ?? []) grow(p.x, p.y);
    }
    if (!isFinite(minX)) {
      this.resetView();
      return;
    }
    const margin = 40;
    // Les barres d'outils flottantes (simulation à gauche, vue à droite)
    // occupent le haut du canvas : on réserve une marge supérieure pour que le
    // contenu recentré ne se retrouve pas dessous.
    const topInset = 56;
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const z = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, (cw - 2 * margin) / contentW, (ch - topInset - 2 * margin) / contentH)
    );
    this.zoom = z;
    // Centre la boîte englobante du contenu dans la zone utile (sous les barres).
    this.panX = cw / 2 - ((minX + maxX) / 2) * z;
    this.panY = (ch + topInset) / 2 - ((minY + maxY) / 2) * z;
    this.applyTransform();
  }

  /** Badge flottant « ⟳ 100 % » : clic = réinitialise zoom et position. */
  private buildZoomBadge(): void {
    const badge = document.createElement('button');
    badge.className = 'canvas__zoom';
    badge.title = t('Reset the view (zoom 100%)');
    badge.addEventListener('click', () => this.resetView());
    badge.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.canvas.appendChild(badge);
    this.zoomBadge = badge;
    this.applyTransform();
  }

  // --- Palette ---------------------------------------------------------------
  /** Recharge les préférences de palette persistées (tri + derniers utilisés). */
  loadPaletteState(state: Partial<PaletteState> | undefined): void {
    if (!state) return;
    if (state.sort === 'alpha' || state.sort === 'category') this.paletteSort = state.sort;
    if (Array.isArray(state.recents)) {
      this.recentTypes = state.recents.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTS);
    }
    if (typeof state.showRecents === 'boolean') this.showRecents = state.showRecents;
    if (Array.isArray(state.collapsed)) {
      this.paletteCollapsed = new Set(state.collapsed.filter((x): x is string => typeof x === 'string'));
    }
    if (state.fold === 'expand' || state.fold === 'collapse' || state.fold === 'auto') {
      this.paletteFold = state.fold;
    }
    this.buildPalette();
  }

  private notifyPaletteState(): void {
    this.onPaletteStateChange?.({
      sort: this.paletteSort,
      recents: [...this.recentTypes],
      showRecents: this.showRecents,
      collapsed: [...this.paletteCollapsed],
      fold: this.paletteFold,
    });
  }

  /**
   * Ouvre le menu de pliage sous le bouton. Geste presser-glisser : on surligne
   * l'option sous le curseur et on la choisit au relâcher. Relâché sur le bouton
   * sans glisser → le menu reste ouvert (mode clic) ; clic extérieur → ferme.
   */
  private openFoldMenu(anchor: HTMLElement): void {
    this.closeFoldMenu();
    const modes: Array<[PaletteFold, string, string]> = [
      ['expand', '⊞', t('Expand all categories')],
      ['collapse', '⊟', t('Collapse all categories')],
      ['auto', '⇕', t('Auto (accordion)')],
    ];
    const menu = document.createElement('div');
    menu.className = 'palette__fold-menu';
    for (const [mode, glyph, label] of modes) {
      const item = document.createElement('div');
      item.className = 'palette__fold-item' + (this.paletteFold === mode ? ' palette__fold-item--current' : '');
      item.dataset.mode = mode;
      item.innerHTML = `<span class="palette__fold-glyph">${glyph}</span><span>${label}</span>`;
      item.addEventListener('click', () => this.chooseFold(mode));
      menu.appendChild(item);
    }
    document.body.appendChild(menu);
    this.foldMenu = menu;
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.top = `${Math.round(r.bottom + 2)}px`;

    const itemAt = (x: number, y: number): HTMLElement | null =>
      ((document.elementFromPoint(x, y) as HTMLElement | null)?.closest(
        '.palette__fold-item'
      ) as HTMLElement | null) ?? null;
    const move = (ev: PointerEvent): void => {
      const hit = itemAt(ev.clientX, ev.clientY);
      for (const it of Array.from(menu.children) as HTMLElement[]) {
        it.classList.toggle('palette__fold-item--active', it === hit);
      }
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const hit = itemAt(ev.clientX, ev.clientY);
      if (hit?.dataset.mode) this.chooseFold(hit.dataset.mode as PaletteFold);
      else if (!anchor.contains(ev.target as Node)) this.closeFoldMenu();
      // relâché sur le bouton sans glisser : le menu reste ouvert (mode clic).
    };
    const outside = (ev: PointerEvent): void => {
      if (!menu.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) this.closeFoldMenu();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    setTimeout(() => window.addEventListener('pointerdown', outside, true), 0);
    this.foldMenuOff = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointerdown', outside, true);
    };
  }

  private chooseFold(mode: PaletteFold): void {
    this.closeFoldMenu();
    if (this.paletteFold === mode) return;
    this.paletteFold = mode;
    this.buildPalette();
    this.notifyPaletteState();
  }

  private closeFoldMenu(): void {
    this.foldMenuOff?.();
    this.foldMenuOff = null;
    this.foldMenu?.remove();
    this.foldMenu = null;
  }

  /** Mémorise un type comme « dernier utilisé » (10 max, plus récent en tête). */
  private recordRecent(type: string): void {
    const next = [type, ...this.recentTypes.filter((x) => x !== type)].slice(0, MAX_RECENTS);
    if (next.join('|') === this.recentTypes.join('|')) return;
    this.recentTypes = next;
    this.buildPalette();
    this.notifyPaletteState();
  }

  /**
   * En-tête de section de palette. Si `key` est fourni, la section est repliable :
   * clic sur l'en-tête → bascule l'affichage de ses items (état persisté).
   */
  private paletteSection(label: string, key?: string): void {
    const head = document.createElement('h4');
    head.className = 'palette__section';
    if (key) {
      this.sectionKeys.push(key);
      head.classList.add('palette__section--collapsible');
      head.dataset.section = key;
      const collapsed = this.paletteCollapsed.has(key);
      head.classList.toggle('palette__section--collapsed', collapsed);
      const chevron = document.createElement('span');
      chevron.className = 'palette__section-chevron';
      chevron.textContent = '▾';
      const text = document.createElement('span');
      text.textContent = label;
      head.append(chevron, text);
      head.addEventListener('click', () => this.toggleSection(key));
    } else {
      head.textContent = label;
    }
    this.palette.appendChild(head);
  }

  /** Replie/déplie une section de palette (sans reconstruire) et persiste l'état. */
  private toggleSection(key: string): void {
    const willExpand = this.paletteCollapsed.has(key);
    if (willExpand) this.paletteCollapsed.delete(key);
    else this.paletteCollapsed.add(key);
    // Mode accordéon : en dépliant une section, on replie toutes les autres.
    if (this.paletteFold === 'auto' && willExpand) {
      for (const k of this.sectionKeys) if (k !== key) this.paletteCollapsed.add(k);
    }
    for (const head of Array.from(
      this.palette.querySelectorAll('.palette__section--collapsible')
    ) as HTMLElement[]) {
      const k = head.dataset.section;
      if (k) head.classList.toggle('palette__section--collapsed', this.paletteCollapsed.has(k));
    }
    this.filterPalette();
    this.notifyPaletteState();
  }

  /**
   * Bouton de la palette : miniature du composant + libellé (liste d'items).
   * Clic = pose au centre ; glisser = pose au lâcher, avec la miniature comme
   * image de glissement (on voit le composant suivre le curseur).
   */
  private paletteButton(def: PartDef, custom: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'palette__item';
    const label = custom ? `★ ${def.label}` : t(def.label);
    btn.title = label;
    btn.dataset.search = label.toLowerCase();
    const thumb = this.thumbnail(def);
    const text = document.createElement('span');
    text.className = 'palette__item-label';
    text.textContent = label;
    btn.append(thumb, text);
    btn.addEventListener('click', () => {
      if (!this.locked) this.addPartAtVisibleCenter(def.type);
    });
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(DND_MIME, def.type);
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        // Image de glissement = miniature du composant (centrée sous le curseur).
        e.dataTransfer.setDragImage(thumb, thumb.offsetWidth / 2, thumb.offsetHeight / 2);
      }
    });
    return btn;
  }

  /**
   * wokwi-lcd1602 : `numCols`/`numRows` ne sont pas des attributs réactifs (champs
   * fixes 16/2 en amont) → on les fixe directement depuis cols/rows avant le rendu
   * pour permettre le format 20×4 (sinon l'afficheur reste bloqué en 16×2).
   */
  private applyLcdSize(el: WokwiElement, def: PartDef, attrs?: Record<string, string>): void {
    if (def.kind !== 'i2c-lcd') return;
    const lcd = el as unknown as { numCols: number; numRows: number };
    lcd.numCols = Number(attrs?.cols ?? 16) || 16;
    lcd.numRows = Number(attrs?.rows ?? 2) || 2;
  }

  /** Miniature live d'un composant (élément réel mis à l'échelle dans une vignette). */
  private thumbnail(def: PartDef): HTMLDivElement {
    const box = document.createElement('div');
    box.className = 'palette__thumb';
    try {
      const el = document.createElement(def.tag) as WokwiElement;
      if (def.custom) {
        (el as unknown as { definition: typeof def }).definition = def;
      }
      for (const [k, v] of Object.entries(def.attrs ?? {})) {
        if (v !== '') el.setAttribute(k, v);
      }
      this.applyLcdSize(el, def, def.attrs);
      this.lightThumbnail(el, def); // afficheurs allumés (7 seg « 8. », barre de LED)
      el.style.transformOrigin = 'center center';
      el.style.pointerEvents = 'none';
      box.appendChild(el);
      // La taille réelle n'est connue qu'après la mise en page (rendu Lit async)
      // OU au dépliage d'une section repliée (taille nulle tant que display:none).
      // Un ResizeObserver recale la vignette dans ces deux cas, sans boucle rAF :
      // c'est ce qui corrige les vignettes « trop grandes » jusqu'au prochain clic.
      const ro = new ResizeObserver(() => this.fitThumbnail(el));
      ro.observe(el);
      requestAnimationFrame(() => this.fitThumbnail(el));
    } catch {
      box.textContent = '▢';
    }
    return box;
  }

  /** Allume les afficheurs dans la vignette pour qu'ils ne soient pas vides/éteints. */
  private lightThumbnail(el: WokwiElement, def: PartDef): void {
    if (def.kind === '7segment') {
      const digits = Math.max(1, Number(def.attrs?.digits ?? 1) || 1);
      // Tous les segments + point décimal = « 8. » dans la couleur choisie.
      (el as unknown as { values?: number[] }).values = new Array(digits * 8).fill(1);
    } else if (def.kind === 'led-bar') {
      (el as unknown as { values?: number[] }).values = new Array(10).fill(1);
    }
  }

  /**
   * Met l'élément à l'échelle pour tenir dans la vignette (sans le déformer). Le
   * `transform: scale` n'affecte pas `offsetWidth/Height` (taille de mise en page),
   * donc la mesure reste la taille intrinsèque. Tant que l'élément n'est pas rendu
   * ou qu'il est masqué (section repliée), la taille est nulle : on n'impose alors
   * aucune échelle et on attend que le ResizeObserver rappelle avec une taille.
   */
  private fitThumbnail(el: HTMLElement): void {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w <= 1 || h <= 1) return;
    const scale = Math.min(THUMB_W / w, THUMB_H / h, 1);
    el.style.transform = `scale(${scale})`;
  }

  /** Ligne d'un composant personnalisé : pose, édition, export, suppression. */
  private appendCustomRow(def: PartDef): void {
    const data = this.customData.get(def.type);
    const row = document.createElement('div');
    row.className = 'palette__custom';
    row.dataset.search = `★ ${def.label}`.toLowerCase();
    const btn = this.paletteButton(def, true);
    btn.title = t('Click: place on canvas — double-click: edit the model');
    btn.addEventListener('dblclick', () => {
      if (data) this.creator.open(data);
    });
    const exp = document.createElement('button');
    exp.className = 'palette__custom-del';
    exp.style.color = 'inherit';
    exp.textContent = '⇩';
    exp.title = t('Export this part (.json)');
    exp.addEventListener('click', () => {
      if (data) this.onExportCustomPart?.(data);
    });
    const del = document.createElement('button');
    del.className = 'palette__custom-del';
    del.textContent = '✕';
    del.title = t('Delete this part model');
    del.addEventListener('click', () => this.removeCustomPart(def.type));
    row.append(btn, exp, del);
    this.palette.appendChild(row);
  }

  private buildPalette(): void {
    this.palette.replaceChildren();
    this.sectionKeys = [];
    // Titre « Composants » seul ; les boutons de tri viennent juste en dessous.
    const title = document.createElement('h3');
    title.textContent = t('Components');
    this.palette.appendChild(title);

    const sortWrap = document.createElement('div');
    sortWrap.className = 'palette__sort';
    for (const [mode, glyph, label] of [
      ['alpha', 'AZ', t('Alphabetical')],
      ['category', '', t('By category')],
    ] as Array<[PaletteSort, string, string]>) {
      const btn = document.createElement('button');
      btn.className = 'palette__sort-btn' + (this.paletteSort === mode ? ' palette__sort-btn--active' : '');
      // Icône d'arborescence pour la catégorie (l'ancien 🗂 était illisible).
      if (mode === 'category') btn.innerHTML = TREE_ICON;
      else btn.textContent = glyph;
      btn.title = label;
      btn.addEventListener('click', () => {
        if (this.paletteSort === mode) return;
        this.paletteSort = mode;
        this.buildPalette();
        this.notifyPaletteState();
      });
      sortWrap.appendChild(btn);
    }
    // Bouton (haut-droite) : affiche ou masque la section « Derniers utilisés ».
    const recentsBtn = document.createElement('button');
    recentsBtn.className =
      'palette__sort-btn palette__recents-toggle' + (this.showRecents ? ' palette__sort-btn--active' : '');
    recentsBtn.textContent = '🕘';
    recentsBtn.title = this.showRecents ? t('Hide recently used') : t('Show recently used');
    recentsBtn.addEventListener('click', () => {
      this.showRecents = !this.showRecents;
      this.buildPalette();
      this.notifyPaletteState();
    });
    sortWrap.appendChild(recentsBtn);

    // Bouton de pliage des catégories : un appui ouvre un menu, on glisse jusqu'au
    // mode voulu et on relâche (ou simple clic puis clic sur un mode). Icône = la
    // grande flèche de repliement (même chevron que les sections).
    const foldBtn = document.createElement('button');
    foldBtn.className = 'palette__sort-btn palette__fold-toggle';
    foldBtn.textContent = '▾';
    const foldTitle = {
      expand: t('Expand all categories'),
      collapse: t('Collapse all categories'),
      auto: t('Auto (accordion)'),
    } as const;
    foldBtn.title = `${t('Folding mode')} — ${foldTitle[this.paletteFold]}`;
    foldBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.openFoldMenu(foldBtn);
    });
    sortWrap.appendChild(foldBtn);
    this.palette.appendChild(sortWrap);

    // Barre de recherche : filtre les composants par libellé (sans reconstruire
    // la palette → le champ garde le focus pendant la frappe).
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'palette__search';
    search.placeholder = t('Search a component…');
    search.value = this.paletteFilter;
    search.addEventListener('input', () => {
      this.paletteFilter = search.value;
      this.filterPalette();
    });
    this.palette.appendChild(search);

    const customs = listCustomParts();
    const byLabel = (a: PartDef, b: PartDef): number =>
      t(a.label).localeCompare(t(b.label), undefined, { sensitivity: 'base' });

    // Derniers utilisés (10 max), en tête — sauf si masqués par le bouton 🕘.
    const recentDefs = this.recentTypes
      .map((type) => CATALOG.find((d) => d.type === type) ?? customs.find((d) => d.type === type))
      .filter((d): d is PartDef => d !== undefined);

    // Applique le mode de pliage aux sections présentes (avant leur création).
    if (this.paletteFold !== 'auto') {
      const presentKeys: string[] = [];
      if (this.showRecents && recentDefs.length > 0) presentKeys.push('recent');
      if (this.paletteSort === 'category') {
        for (const c of CATEGORY_ORDER) if (CATALOG.some((d) => partCategory(d) === c)) presentKeys.push(c);
        if (customs.length > 0) presentKeys.push('custom');
      }
      this.paletteCollapsed = this.paletteFold === 'collapse' ? new Set(presentKeys) : new Set();
    }

    if (this.showRecents && recentDefs.length > 0) {
      this.paletteSection(t('Recently used'), 'recent');
      for (const def of recentDefs) this.palette.appendChild(this.paletteButton(def, !!def.custom));
    }

    if (this.paletteSort === 'alpha') {
      // En-tête séparant les derniers utilisés de la liste alphabétique complète.
      this.paletteSection(t('All components'));
      // Liste plate, tous composants confondus, triée sur le libellé traduit.
      for (const def of [...CATALOG, ...customs].sort(byLabel)) {
        if (def.custom) this.appendCustomRow(def);
        else this.palette.appendChild(this.paletteButton(def, false));
      }
    } else {
      for (const category of CATEGORY_ORDER) {
        const defs = CATALOG.filter((d) => partCategory(d) === category).sort(byLabel);
        if (defs.length === 0) continue;
        this.paletteSection(t(category), category);
        for (const def of defs) this.palette.appendChild(this.paletteButton(def, false));
      }
      if (customs.length > 0) {
        this.paletteSection(t('Custom parts'), 'custom');
        for (const def of [...customs].sort(byLabel)) this.appendCustomRow(def);
      }
    }

    const create = document.createElement('button');
    create.className = 'palette__item palette__item--create';
    create.textContent = t('+ Create a part');
    create.addEventListener('click', () => this.creator.open());
    this.palette.appendChild(create);

    // Import d'un composant depuis un fichier .json (format documenté).
    const importBtn = document.createElement('button');
    importBtn.className = 'palette__item palette__item--create';
    importBtn.textContent = t('⇪ Import (.json)');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      void file.text().then((text) => {
        try {
          this.importCustomPart(JSON.parse(text));
        } catch (err) {
          this.showPaletteError(t('Import failed: {0}', err instanceof Error ? err.message : String(err)));
        }
        fileInput.value = '';
      });
    });
    importBtn.addEventListener('click', () => fileInput.click());
    this.palette.append(importBtn, fileInput);

    // La palette vient d'être reconstruite : on réinsère le bandeau de verrou si
    // la simulation est en cours (sinon il a été emporté par replaceChildren).
    if (this.locked) this.showLockWarning(true);

    this.filterPalette();
  }

  /**
   * Met à jour l'affichage des items selon la recherche ET le repli des sections,
   * et masque les en-têtes vides en recherche — sans reconstruire la palette (le
   * champ garde le focus). Une recherche active ignore le repli (les résultats
   * d'une section repliée restent visibles).
   */
  private filterPalette(): void {
    const q = this.paletteFilter.trim().toLowerCase();
    let header: HTMLElement | null = null;
    let headerHasVisible = false;
    let collapsed = false;
    const flush = (): void => {
      if (header) header.style.display = !q || headerHasVisible ? '' : 'none';
    };
    for (const child of Array.from(this.palette.children) as HTMLElement[]) {
      if (child.classList.contains('palette__section')) {
        flush();
        header = child;
        headerHasVisible = false;
        collapsed = !!child.dataset.section && this.paletteCollapsed.has(child.dataset.section);
        continue;
      }
      const isItem =
        (child.classList.contains('palette__item') && !child.classList.contains('palette__item--create')) ||
        child.classList.contains('palette__custom');
      if (!isItem) continue;
      const label = child.dataset.search ?? child.textContent?.toLowerCase() ?? '';
      const match = !q || label.includes(q);
      // Hors recherche, une section repliée masque ses items (l'en-tête reste).
      child.style.display = match && (q !== '' || !collapsed) ? '' : 'none';
      if (match) headerHasVisible = true;
    }
    flush();
  }

  /** Valide puis enregistre un composant importé (fichier .json). */
  private importCustomPart(raw: unknown): void {
    const data = raw as Partial<CustomPartData>;
    if (typeof data !== 'object' || data === null) throw new Error(t('invalid JSON.'));
    if (typeof data.label !== 'string' || !data.label) throw new Error(t('missing "label" field.'));
    if (typeof data.svg !== 'string' || !data.svg.includes('<svg')) throw new Error(t('missing or invalid "svg" field.'));
    if (!Array.isArray(data.pins)) throw new Error(t('missing "pins" field.'));
    for (const pin of data.pins) {
      if (typeof pin?.name !== 'string' || typeof pin?.x !== 'number' || typeof pin?.y !== 'number') {
        throw new Error(t('each pin needs name, x and y.'));
      }
    }
    this.saveCustomPart({
      type: typeof data.type === 'string' && data.type ? data.type : `custom-${Date.now().toString(36)}`,
      label: data.label,
      kind: (data.kind as CustomPartData['kind']) ?? 'passive',
      svg: data.svg,
      pins: data.pins,
      pinRoles: data.pinRoles,
      attrs: data.attrs,
    });
  }

  private showPaletteError(message: string): void {
    const note = document.createElement('p');
    note.className = 'inspector__hint';
    note.style.color = '#ff8a8a';
    note.textContent = message;
    this.palette.appendChild(note);
    setTimeout(() => note.remove(), 6000);
  }

  // --- Composants personnalisés ------------------------------------------------
  /** Recharge les composants personnalisés persistés (envoyés par l'extension). */
  loadCustomParts(parts: CustomPartData[]): void {
    for (const data of parts) {
      this.customData.set(data.type, data);
      registerCustomPart(data);
    }
    this.buildPalette();
  }

  private saveCustomPart(data: CustomPartData): void {
    this.customData.set(data.type, data);
    registerCustomPart(data);
    this.buildPalette();
    this.onCustomPartsChange?.([...this.customData.values()]);
  }

  private removeCustomPart(type: string): void {
    // Retire d'abord les instances posées sur le canvas.
    for (const part of [...this.diagram.parts]) {
      if (part.type === type) this.removePart(part.id);
    }
    this.customData.delete(type);
    unregisterCustomPart(type);
    this.buildPalette();
    this.onCustomPartsChange?.([...this.customData.values()]);
  }

  // --- Ajout / suppression de composants -------------------------------------
  /** Coordonnées monde du centre de la zone visible (sous les barres d'outils). */
  private visibleWorldCenter(): XY {
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;
    const topInset = 56; // hauteur des barres flottantes en haut du canvas
    return {
      x: (cw / 2 - this.panX) / this.zoom,
      y: ((ch + topInset) / 2 - this.panY) / this.zoom,
    };
  }

  /**
   * Pose un composant au centre de la zone visible (tient compte du zoom et du
   * déplacement de la vue) : le corps est centré sur ce point une fois sa taille
   * réelle connue, puis aligné sur la grille de 10 px.
   */
  addPartAtVisibleCenter(type: string): Part {
    const center = this.visibleWorldCenter();
    const part = this.addPart(type, center.x, center.y);
    const r = this.rendered.get(part.id);
    const body = r?.container.querySelector('.part__body') as HTMLElement | null;
    if (r && body) {
      r.part.x = Math.max(0, center.x - (body.offsetWidth || 40) / 2);
      r.part.y = Math.max(0, center.y - (body.offsetHeight || 40) / 2);
      r.container.style.left = `${r.part.x}px`;
      r.container.style.top = `${r.part.y}px`;
    }
    this.snapPartToGrid(part.id);
    return part;
  }

  addPart(type: string, x = 40 + this.diagram.parts.length * 30, y = 60): Part {
    const def = partDef(type);
    const part: Part = { id: uid(type + '-'), type, x, y, attrs: { ...def.attrs } };
    this.diagram.parts.push(part);
    this.renderPart(part);
    this.recordRecent(type);
    this.select({ kind: 'part', id: part.id }); // à la pose : montre le câblage interne
    this.onPartAdded?.(part); // ex. : sélection automatique de la carte de simulation
    this.notify();
    return part;
  }

  /** Décalage (monde) de la première broche par rapport à l'origine d'un composant. */
  private gridOffset(partId: string): XY | null {
    const r = this.rendered.get(partId);
    if (!r) return null;
    const first = [...r.hotspots.keys()][0];
    if (!first) return null;
    const c = this.hotspotCenter({ partId, pin: first });
    if (!c) return null;
    return { x: c.x - r.part.x, y: c.y - r.part.y };
  }

  /** Décale un composant pour que sa première broche tombe sur la grille. */
  private snapPartToGrid(partId: string): void {
    const off = this.gridOffset(partId);
    const r = this.rendered.get(partId);
    if (!off || !r) return;
    r.part.x = Math.max(0, snapToGrid(r.part.x + off.x) - off.x);
    r.part.y = Math.max(0, snapToGrid(r.part.y + off.y) - off.y);
    r.container.style.left = `${r.part.x}px`;
    r.container.style.top = `${r.part.y}px`;
    this.redrawWires();
    this.notify();
  }

  removePart(id: string): void {
    this.diagram.wires = this.diagram.wires.filter((w) => {
      if (w.a.partId === id || w.b.partId === id) {
        this.wirePaths.get(w.id)?.remove();
        this.wirePaths.delete(w.id);
        return false;
      }
      return true;
    });
    this.rendered.get(id)?.container.remove();
    this.rendered.delete(id);
    this.internalShown.delete(id);
    this.pinoutShown.delete(id);
    this.selectedParts.delete(id);
    this.diagram.parts = this.diagram.parts.filter((p) => p.id !== id);
    if (this.selection?.kind === 'part' && this.selection.id === id) this.select(null);
    this.redrawWires();
    this.notify();
  }

  elementOf(id: string): WokwiElement | undefined {
    return this.rendered.get(id)?.el;
  }

  /** SVG du dessin retouché d'un composant (board-drawing), ou undefined. */
  drawingOf(id: string): SVGElement | undefined {
    return this.rendered.get(id)?.drawing;
  }

  /**
   * Réinitialise l'aspect de tous les composants : chaque élément est recréé à
   * partir de ses attributs initiaux, effaçant l'état piloté par la simulation
   * (LED éteintes, afficheurs vides…). Le schéma (fils, positions) est conservé.
   */
  resetVisuals(): void {
    for (const id of [...this.rendered.keys()]) this.rerenderPart(id);
    this.redrawWires();
    this.scheduleSettle();
  }

  /** Vide entièrement l'atelier (changement de carte, nouveau schéma). */
  clear(): void {
    this.cancelPending();
    this.select(null);
    for (const path of this.wirePaths.values()) path.remove();
    this.wirePaths.clear();
    for (const r of this.rendered.values()) r.container.remove();
    this.rendered.clear();
    this.internalShown.clear();
    this.pinoutShown.clear();
    this.selectedParts.clear();
    this.diagram.parts = [];
    this.diagram.wires = [];
    this.colorIndex = 0;
    this.notify();
  }

  /** Copie sérialisable du schéma (composants + fils) pour la sauvegarde. */
  serialize(): { parts: Part[]; wires: Wire[] } {
    return JSON.parse(JSON.stringify(this.diagram)) as { parts: Part[]; wires: Wire[] };
  }

  /**
   * Recharge un schéma sauvegardé. Les identifiants sont régénérés (et les fils
   * ré-aiguillés) pour éviter toute collision avec d'éventuels composants déjà
   * créés pendant la session.
   */
  loadDiagram(data: { parts?: Part[]; wires?: Wire[] }): void {
    this.clear();
    const idMap = new Map<string, string>();
    for (const p of data.parts ?? []) {
      const np: Part = { ...p, id: uid(`${p.type}-`) };
      idMap.set(p.id, np.id);
      this.diagram.parts.push(np);
      this.renderPart(np);
    }
    for (const w of data.wires ?? []) {
      const nw: Wire = {
        ...w,
        id: uid('w-'),
        a: { partId: idMap.get(w.a.partId) ?? w.a.partId, pin: w.a.pin },
        b: { partId: idMap.get(w.b.partId) ?? w.b.partId, pin: w.b.pin },
      };
      this.diagram.wires.push(nw);
      // Les fils implicites d'enfichage (auto) ne sont jamais tracés : sinon ils
      // apparaissaient comme des fils parasites après une sauvegarde/réouverture.
      if (!nw.auto) this.drawWire(nw);
    }
    this.redrawWires();
    this.scheduleSettle();
    this.notify();
  }

  /** Ajoute un fil par programme (schéma de démarrage). */
  addWire(a: Endpoint, b: Endpoint, opts?: { points?: XY[]; color?: string }): void {
    const color = opts?.color ?? this.autoColor(a, b);
    const wire: Wire = { id: uid('w-'), a, b, points: opts?.points, color };
    this.diagram.wires.push(wire);
    this.drawWire(wire);
    this.notify();
  }

  /**
   * Couleur initiale d'un fil : noir s'il touche une masse, rouge s'il touche
   * une alimentation, sinon rotation de la nappe Dupont. Modifiable ensuite
   * dans l'inspecteur (la couleur n'est jamais ré-imposée).
   */
  private autoColor(a: Endpoint, b: Endpoint): string {
    const roles = [a, b].map((e) => {
      const part = this.diagram.parts.find((p) => p.id === e.partId);
      if (!part) return 'other';
      // Potentiomètre : ses extrémités ne sont pas des rails d'alimentation, on
      // n'impose donc ni rouge ni noir (cohérent avec l'affichage des pastilles).
      if (partDef(part.type).kind === 'potentiometer') return 'other';
      return pinElectricalRole(part.type, e.pin);
    });
    if (roles.includes('gnd')) return 'black';
    if (roles.includes('vcc')) return 'red';
    // Un fil branché sur le même point qu'un fil existant reprend sa couleur
    // (même nœud électrique → même couleur de nappe, plus lisible).
    const inherited = this.inheritedColor(a, b);
    if (inherited) return inherited;
    return this.nextColor();
  }

  /** Couleur d'un fil déjà connecté à l'une des deux broches, ou null. */
  private inheritedColor(a: Endpoint, b: Endpoint): string | null {
    const same = (e1: Endpoint, e2: Endpoint): boolean =>
      e1.partId === e2.partId && e1.pin === e2.pin;
    for (const w of this.diagram.wires) {
      if (w.auto || !w.color) continue;
      if (same(w.a, a) || same(w.b, a) || same(w.a, b) || same(w.b, b)) return w.color;
    }
    return null;
  }

  /** Couleur d'alimentation d'un fil ('black' si masse, 'red' si VCC), sinon null. */
  private powerColorOf(wire: Wire): string | null {
    for (const e of [wire.a, wire.b]) {
      const part = this.diagram.parts.find((p) => p.id === e.partId);
      if (!part || partDef(part.type).kind === 'potentiometer') continue;
      const role = pinElectricalRole(part.type, e.pin);
      if (role === 'gnd') return 'black';
      if (role === 'vcc') return 'red';
    }
    return null;
  }

  private nextColor(): string {
    // Rotation sur les couleurs « ordinaires » (sans rouge ni noir, réservés).
    const color = DEFAULT_WIRE_COLORS[this.colorIndex % DEFAULT_WIRE_COLORS.length].id;
    this.colorIndex++;
    return color;
  }

  // --- Rendu d'un composant --------------------------------------------------
  private renderPart(part: Part): void {
    const def = partDef(part.type);
    const container = document.createElement('div');
    container.className = 'part';
    // Tous les composants passent désormais sous les fils (z=5). Les cartes et
    // platines descendent encore d'un cran (z=1) pour rester sous les composants
    // qu'on enfiche dessus.
    if (def.kind === 'mcu' || def.kind === 'breadboard') {
      container.classList.add('part--under-wires');
    }
    // Trous serrés (pas de 10 px) : pastilles réduites pour rester cliquables.
    if (def.kind === 'breadboard') container.classList.add('part--dense');
    container.style.left = `${part.x}px`;
    container.style.top = `${part.y}px`;

    const head = document.createElement('div');
    head.className = 'part__head';
    const name = document.createElement('span');
    name.className = 'part__name';
    name.textContent = t(def.label);
    head.appendChild(name);
    // Plus de croix d'effacement ici : suppression via l'inspecteur (🗑) ou Suppr.
    container.appendChild(head);

    const body = document.createElement('div');
    body.className = 'part__body';
    const el = document.createElement(def.tag) as WokwiElement;
    if (def.custom) {
      (el as unknown as { definition: typeof def }).definition = def;
    }
    for (const [k, v] of Object.entries(part.attrs ?? def.attrs ?? {})) {
      if (v !== '') el.setAttribute(k, v);
    }
    this.applyLcdSize(el, def, part.attrs ?? def.attrs);
    // Dessin retouché à la main : on l'affiche à la place du rendu @wokwi (dont
    // les broches, étirées par pinScale, ne tombent plus sur les surcharges).
    // L'élément @wokwi est conservé mais masqué (pinInfo + simulation).
    const drawing = boardDrawing(part.type, part.attrs);
    if (drawing) {
      // Élément @wokwi conservé pour pinInfo + simulation, mais rendu invisible
      // et HORS FLUX (pas `display:none`, qui empêche le rendu du shadow DOM dont
      // dépendent clavier/canvas/init). Le corps se dimensionne alors sur le SVG.
      el.classList.add('part__src-el');
      const draw = document.createElement('div');
      draw.className = 'part__drawing';
      draw.innerHTML = drawing.svg;
      const dsvg = draw.querySelector('svg');
      if (dsvg) {
        dsvg.setAttribute('width', String(drawing.w)); // px = unités viewBox (1:1)
        dsvg.setAttribute('height', String(drawing.h));
        dsvg.style.display = 'block';
      }
      body.appendChild(draw);
    }
    body.appendChild(el);
    container.appendChild(body);
    this.world.appendChild(container);
    this.applyRotation(part, body);

    // Déplacement : par tout le corps (clic gauche ou droit), sauf pour les
    // composants interactifs (bouton, potentiomètre) dont le clic gauche
    // actionne le contrôle : clic droit pour les déplacer, ou clic gauche pour
    // les sélectionner puis glisser leur bandeau.
    head.addEventListener('pointerdown', (e) => {
      if (e.ctrlKey && !this.locked) {
        e.stopPropagation();
        this.toggleInSelection(part.id);
        return;
      }
      this.startDrag(e, part);
    });
    body.addEventListener('pointerdown', (e) => {
      if (this.locked) return; // simulation : on laisse le composant réagir, pas d'édition
      if (e.ctrlKey) {
        e.stopPropagation();
        this.toggleInSelection(part.id); // Ctrl+clic : sélection multiple
      } else if (e.button === 2) {
        e.stopPropagation();
        this.startDrag(e, part);
      } else if (!def.interactive) {
        this.startDrag(e, part);
      } else {
        this.select({ kind: 'part', id: part.id });
      }
    });
    if (def.interactive) {
      // Bulle d'aide. Pour un bouton, le texte dépend de l'état : en simulation,
      // on rappelle le Ctrl+clic qui verrouille l'état instable ; sinon le
      // déplacement au clic droit. Mis à jour au verrouillage (setLocked).
      body.title = this.isLockable(part.type) ? this.buttonTitle() : t('Right-click drag to move');
    }

    const hotspots = new Map<string, HTMLDivElement>();
    const ovMap = overridesFor(part.type, part.attrs);
    const pins = this.partPins(part.type, el, ovMap, part.attrs);
    const anchor: XY = pins[0] ? { x: pins[0].x, y: pins[0].y } : { x: 0, y: 0 };
    for (const pin of pins) {
      const dot = this.makeHotspot(part.id, part.type, def.kind, pin, anchor, ovMap);
      body.appendChild(dot);
      hotspots.set(pin.name, dot);
    }

    // Bouton ☢ : à gauche du ✕. Sur une carte Pico/Pico W il affiche le poster de
    // brochage complet ; sinon, s'il existe un schéma pour ce type, il affiche le
    // câblage interne. Il commande l'affichage (plus de déclenchement automatique).
    const internalPins = pins.map((p) => ({ name: p.name, x: p.x, y: p.y }));
    const hasPinout = pinoutSvg(part.type) !== null;
    const shown = hasPinout ? this.pinoutShown : this.internalShown;
    if (hasPinout || internalWiringSvg(def.kind, internalPins, part.attrs, part.type)) {
      const toggle = document.createElement('span');
      toggle.className =
        'part__internal-toggle' + (shown.has(part.id) ? ' part__internal-toggle--active' : '');
      toggle.innerHTML = KABLIX_BADGE;
      toggle.title = hasPinout ? t('Show/hide the full pinout') : t('Show/hide the internal wiring');
      toggle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (hasPinout) this.togglePinout(part.id);
        else this.toggleInternalWiring(part.id);
      });
      // Dans le corps (et non le bandeau) : il déborde à droite de la carte et
      // reste donc visible/cliquable quand le poster recouvre le bandeau de nom.
      body.appendChild(toggle);
    }

    this.rendered.set(part.id, {
      part, container, el, hotspots,
      drawing: (container.querySelector('.part__drawing svg') as SVGElement) ?? undefined,
    });
    // Restaure le câblage interne / le poster de brochage après un re-rendu
    // (rotation…), s'il est activé ET que le composant est sélectionné.
    if (this.internalShown.has(part.id) && this.isSelected(part.id)) this.renderInternalWiring(part.id);
    if (this.pinoutShown.has(part.id) && this.isSelected(part.id)) this.renderPinout(part.id);
    this.redrawWires();
    this.scheduleSettle();
  }

  /**
   * Liste des broches d'un composant. Pour un **dessin retouché** (board-drawing),
   * l'élément @wokwi est masqué : on prend les broches directement dans les
   * surcharges (repère du dessin), indépendamment du `pinInfo` de l'élément.
   * Sinon, `pinInfo` de l'élément @wokwi.
   */
  private partPins(
    type: string,
    el: WokwiElement,
    ovMap?: Record<string, { x: number; y: number }>,
    attrs?: Record<string, string>
  ): WokwiPin[] {
    if (boardDrawing(type, attrs) && ovMap) {
      return Object.entries(ovMap).map(([name, p]) => ({ name, x: p.x, y: p.y }));
    }
    return (el.pinInfo ?? []) as WokwiPin[];
  }

  /**
   * Position px (repère corps) d'une broche : la surcharge retouchée (lue depuis
   * « svg retouche/ », repère = coin haut-gauche du dessin) prime ; sinon calage
   * automatique sur la grille relativement à la 1re broche. S'applique à toutes
   * les broches, y compris alimentation (rouge VCC / noir GND), dont la position
   * est posée à la main dans le SVG retouché.
   */
  private pinPos(
    type: string,
    _kind: string,
    pin: WokwiPin,
    anchor: XY,
    ovMap?: Record<string, { x: number; y: number }>
  ): XY {
    const k = partDef(type).pinScale ?? 1;
    const ov = ovMap?.[pin.name];
    return {
      x: ov ? ov.x : snapPinTo(pin.x * k, anchor.x * k),
      y: ov ? ov.y : snapPinTo(pin.y * k, anchor.y * k),
    };
  }

  /** Crée une pastille de broche (point de connexion cliquable). `anchor` = 1re
   *  broche brute du composant (repère pour caler l'espacement sur la grille). */
  private makeHotspot(
    partId: string,
    type: string,
    kind: string,
    pin: WokwiPin,
    anchor: XY,
    ovMap?: Record<string, { x: number; y: number }>
  ): HTMLDivElement {
    const dot = document.createElement('div');
    dot.className = 'pin';
    // Pastilles d'alimentation reconnaissables : rouge (VCC) / noir (GND). Le
    // potentiomètre est exclu : ses extrémités ne sont pas des broches power.
    const role = kind === 'potentiometer' ? 'other' : pinElectricalRole(type, pin.name);
    if (role === 'vcc') dot.classList.add('pin--vcc');
    else if (role === 'gnd') dot.classList.add('pin--gnd');
    const pos = this.pinPos(type, kind, pin, anchor, ovMap);
    dot.style.left = `${pos.x}px`;
    dot.style.top = `${pos.y}px`;
    dot.title = pinDisplayName(kind, pin.name, type);
    dot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onPinDown({ partId, pin: pin.name }, e);
    });
    dot.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.onPinUp({ partId, pin: pin.name }, e);
    });
    return dot;
  }

  /**
   * Resynchronise les pastilles de broche d'un composant avec son `pinInfo`
   * courant. Les éléments @wokwi (Lit) peuvent ne publier leur `pinInfo` qu'après
   * un cycle de rendu : sans cette resynchronisation, une broche apparue ensuite
   * n'a pas de pastille cliquable (impossible de câbler ce composant) et les fils
   * existants ne trouvent pas leur extrémité.
   */
  private syncHotspots(r: Rendered): void {
    const body = r.container.querySelector('.part__body') as HTMLElement | null;
    if (!body) return;
    const def = partDef(r.part.type);
    const ovMap = overridesFor(r.part.type, r.part.attrs);
    const pins = this.partPins(r.part.type, r.el, ovMap, r.part.attrs);
    const anchor: XY = pins[0] ? { x: pins[0].x, y: pins[0].y } : { x: 0, y: 0 };
    for (const pin of pins) {
      let dot = r.hotspots.get(pin.name);
      if (!dot) {
        dot = this.makeHotspot(r.part.id, r.part.type, def.kind, pin, anchor, ovMap);
        body.appendChild(dot);
        r.hotspots.set(pin.name, dot);
      } else {
        const pos = this.pinPos(r.part.type, def.kind, pin, anchor, ovMap);
        dot.style.left = `${pos.x}px`;
        dot.style.top = `${pos.y}px`;
      }
    }
  }

  /** Re-rend un composant après un changement d'attribut (angle, couleur…). */
  private rerenderPart(id: string): void {
    const r = this.rendered.get(id);
    if (!r) return;
    r.container.remove();
    this.rendered.delete(id);
    this.renderPart(r.part);
  }

  // --- Rotation / retournement -------------------------------------------------
  private applyRotation(part: Part, body: HTMLDivElement): void {
    const deg = part.rotation ?? 0;
    const sx = part.flipH ? -1 : 1;
    const sy = part.flipV ? -1 : 1;
    body.style.transformOrigin = 'center center';
    const tf: string[] = [];
    if (deg) tf.push(`rotate(${deg}deg)`);
    if (sx !== 1 || sy !== 1) tf.push(`scale(${sx}, ${sy})`);
    body.style.transform = tf.join(' ');
    const head = body.parentElement?.querySelector('.part__head') as HTMLDivElement | null;
    if (head) this.positionHead(part, head, body);
  }

  /** Identifiants des composants ciblés par rotation/retournement (sélection multiple ou simple). */
  private transformTargets(): string[] {
    if (this.selectedParts.size > 0) return [...this.selectedParts];
    return this.selection?.kind === 'part' ? [this.selection.id] : [];
  }

  /** Retourne le(s) composant(s) sélectionné(s) sur l'axe horizontal ('h') ou vertical ('v'). */
  flipSelection(axis: 'h' | 'v'): void {
    const ids = this.transformTargets();
    if (ids.length === 0) return;
    for (const id of ids) {
      const r = this.rendered.get(id);
      if (!r) continue;
      if (axis === 'h') r.part.flipH = !r.part.flipH;
      else r.part.flipV = !r.part.flipV;
      const body = r.container.querySelector('.part__body') as HTMLDivElement | null;
      if (body) this.applyRotation(r.part, body);
    }
    this.redrawWires(); // le miroir déplace les broches à l'écran
    this.renderInspector(); // met à jour l'état actif des boutons
    this.notify();
  }

  /**
   * Place le bandeau de nom au-dessus de l'encombrement réel du composant. Sans
   * rotation : ancré sur le corps (CSS par défaut). Avec rotation : calé sur la
   * boîte englobante tournée (calculée à partir des dimensions de mise en page,
   * indépendantes du zoom), centré et large d'au moins cette boîte.
   */
  private positionHead(part: Part, head: HTMLDivElement, body: HTMLDivElement): void {
    const deg = ((part.rotation ?? 0) % 360 + 360) % 360;
    const w = body.offsetWidth;
    const h = body.offsetHeight;
    if (!deg || !w || !h) {
      head.style.bottom = '';
      head.style.top = '';
      head.style.left = '';
      head.style.minWidth = '';
      head.style.transform = '';
      return;
    }
    const rad = (deg * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const bw = w * c + h * s; // largeur de la boîte englobante tournée
    const bh = w * s + h * c; // hauteur de la boîte englobante tournée
    head.style.bottom = 'auto';
    head.style.top = `${(h - bh) / 2}px`;
    head.style.left = `${(w - bw) / 2}px`;
    head.style.minWidth = `${bw}px`;
    head.style.transform = 'translateY(-100%)'; // hisse le bandeau au-dessus
  }

  /** Tourne le(s) composant(s) sélectionné(s) de ±45° (touches + / -). */
  rotateSelection(deltaDeg: number): void {
    const ids = this.transformTargets();
    if (ids.length === 0) return;
    for (const id of ids) {
      const r = this.rendered.get(id);
      if (!r) continue;
      r.part.rotation = (((r.part.rotation ?? 0) + deltaDeg) % 360 + 360) % 360;
      const body = r.container.querySelector('.part__body') as HTMLDivElement | null;
      if (body) this.applyRotation(r.part, body);
    }
    // Les pastilles tournent avec le corps : leurs positions à l'écran changent.
    this.redrawWires();
    this.notify();
  }

  // --- Déplacement -----------------------------------------------------------
  /**
   * Composants à déplacer en bloc avec `rootId` : lui-même plus tout ce qui est
   * enfiché dedans (fils `auto`, côté a = enfiché, côté b = support), de façon
   * transitive (une Pico enfichée sur un module lui-même posé sur la platine
   * suit la platine). On ne remonte pas vers le support : déplacer un composant
   * enfiché ne bouge pas sa platine.
   */
  private connectedGroup(rootId: string): Set<string> {
    const group = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const w of this.diagram.wires) {
        if (w.auto && group.has(w.b.partId) && !group.has(w.a.partId)) {
          group.add(w.a.partId);
          changed = true;
        }
      }
    }
    return group;
  }

  private startDrag(e: PointerEvent, part: Part): void {
    if (this.pending || this.locked) return; // câblage en cours / simulation : pas de déplacement
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const r = this.rendered.get(part.id);
    if (!r) return;
    let moved = false;

    // Si le composant fait partie d'une sélection multiple, tout le lot bouge ;
    // sinon, juste lui + ce qui est enfiché dedans. Chaque racine entraîne sa
    // grappe d'enfichage.
    const roots =
      this.selectedParts.has(part.id) && this.selectedParts.size > 1
        ? [...this.selectedParts]
        : [part.id];
    const groupIds = new Set<string>();
    for (const rid of roots) for (const g of this.connectedGroup(rid)) groupIds.add(g);
    const members = [...groupIds]
      .map((id) => this.rendered.get(id))
      .filter((rr): rr is Rendered => rr !== undefined)
      .map((rr) => ({ rr, ox: rr.part.x, oy: rr.part.y }));
    const isGroup = members.length > 1;

    // Fils entièrement internes au lot déplacé (les deux extrémités sont des
    // composants du groupe) : leurs coudes sont en coordonnées monde absolues et
    // ne suivraient pas le déplacement → on mémorise leurs points d'origine pour
    // les décaler du même vecteur, sinon le tracé se déforme.
    const internalWires = this.diagram.wires
      .filter(
        (w) =>
          w.points &&
          w.points.length > 0 &&
          groupIds.has(w.a.partId) &&
          groupIds.has(w.b.partId)
      )
      .map((w) => ({ wire: w, orig: w.points!.map((p) => ({ x: p.x, y: p.y })) }));

    // Enfichage : seulement pour un composant seul (pas un support qui emmène
    // déjà sa grappe), et hors cartes/platines.
    const kind = partDef(part.type).kind;
    const pluggable = !isGroup && kind !== 'mcu' && kind !== 'breadboard';
    const holes = pluggable ? this.collectBreadboardHoles(part.id) : [];

    // Grille magnétique pour faciliter l'alignement, sauf pour un composant
    // enfichable au-dessus d'une platine (il s'aligne alors sur les trous).
    const useGrid = holes.length === 0;
    const primary = members.find((m) => m.rr.part.id === part.id) ?? members[0];
    // Décalage de la première broche par rapport à l'origine du composant : on
    // aligne CETTE broche sur la grille (et donc toutes les autres, espacées de
    // multiples du pas), pas le coin du composant.
    const pinOff = this.gridOffset(part.id) ?? { x: 0, y: 0 };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      // Le déplacement écran est converti en déplacement monde (zoom courant).
      let wdx = dx / this.zoom;
      let wdy = dy / this.zoom;
      if (useGrid && primary) {
        // Aligne la première broche du meneur sur la grille ; le même décalage
        // s'applique au groupe pour préserver les positions relatives.
        wdx = snapToGrid(primary.ox + wdx + pinOff.x) - pinOff.x - primary.ox;
        wdy = snapToGrid(primary.oy + wdy + pinOff.y) - pinOff.y - primary.oy;
      }
      for (const m of members) {
        m.rr.part.x = Math.max(0, m.ox + wdx);
        m.rr.part.y = Math.max(0, m.oy + wdy);
        m.rr.container.style.left = `${m.rr.part.x}px`;
        m.rr.container.style.top = `${m.rr.part.y}px`;
      }
      // Les coudes des fils internes suivent le même décalage que les composants.
      for (const iw of internalWires) {
        iw.wire.points = iw.orig.map((p) => ({ x: p.x + wdx, y: p.y + wdy }));
      }
      this.redrawWires();
      if (holes.length > 0) this.previewBreadboardSnap(part, holes);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      this.clearBreadboardHighlights();
      if (!moved) {
        this.select({ kind: 'part', id: part.id }); // simple clic = sélection
      } else if (pluggable) {
        this.plugIntoBreadboard(part, holes); // notifie si des fils auto changent
        this.notify(); // persiste la nouvelle position même sans enfichage
      } else {
        this.notify(); // déplacement (carte, platine, groupe) : à persister
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  // --- Platine d'essai : surbrillance et enfichage -----------------------------
  /** Trous de toutes les platines posées, en coordonnées canvas. */
  private collectBreadboardHoles(excludeId: string): BreadboardHole[] {
    const holes: BreadboardHole[] = [];
    for (const r of this.rendered.values()) {
      if (r.part.id === excludeId || partDef(r.part.type).kind !== 'breadboard') continue;
      for (const pin of r.hotspots.keys()) {
        const c = this.hotspotCenter({ partId: r.part.id, pin });
        if (c) holes.push({ partId: r.part.id, pin, x: c.x, y: c.y });
      }
    }
    return holes;
  }

  /** Pour chaque broche du composant, le trou de platine le plus proche (≤ BB_SNAP). */
  private breadboardMatches(
    part: Part,
    holes: BreadboardHole[]
  ): Array<{ pin: string; hole: BreadboardHole; dx: number; dy: number }> {
    const r = this.rendered.get(part.id);
    if (!r) return [];
    const matches: Array<{ pin: string; hole: BreadboardHole; dx: number; dy: number }> = [];
    for (const pin of r.hotspots.keys()) {
      const c = this.hotspotCenter({ partId: part.id, pin });
      if (!c) continue;
      let best: BreadboardHole | null = null;
      let bestD = BB_SNAP;
      for (const hole of holes) {
        const d = Math.hypot(hole.x - c.x, hole.y - c.y);
        if (d <= bestD) {
          bestD = d;
          best = hole;
        }
      }
      if (best) matches.push({ pin, hole: best, dx: best.x - c.x, dy: best.y - c.y });
    }
    return matches;
  }

  private boardHighlighter(partId: string): ((pins: string[]) => void) | null {
    const el = this.rendered.get(partId)?.el as unknown as
      | { setHighlight?: (pins: string[]) => void }
      | undefined;
    return el?.setHighlight ? (pins) => el.setHighlight!(pins) : null;
  }

  /** Surbrillance des bandes qui recevraient les broches du composant déplacé. */
  private previewBreadboardSnap(part: Part, holes: BreadboardHole[]): void {
    const byBoard = new Map<string, Set<string>>();
    for (const m of this.breadboardMatches(part, holes)) {
      const size = normalizeSize(this.rendered.get(m.hole.partId)?.part.attrs?.size);
      const set = byBoard.get(m.hole.partId) ?? new Set<string>();
      for (const p of stripOfPin(size, m.hole.pin)) set.add(p);
      byBoard.set(m.hole.partId, set);
    }
    for (const id of new Set([...this.highlightedBoards, ...byBoard.keys()])) {
      this.boardHighlighter(id)?.([...(byBoard.get(id) ?? [])]);
    }
    this.highlightedBoards = new Set(byBoard.keys());
  }

  private clearBreadboardHighlights(): void {
    for (const id of this.highlightedBoards) this.boardHighlighter(id)?.([]);
    this.highlightedBoards.clear();
  }

  /**
   * Enfichage au relâchement : aligne le composant sur les trous touchés puis
   * crée des fils implicites (invisibles, `auto`) broche ↔ trou pour la netlist.
   */
  private plugIntoBreadboard(part: Part, holes: BreadboardHole[]): void {
    const before = this.diagram.wires.length;
    this.diagram.wires = this.diagram.wires.filter(
      (w) => !(w.auto && (w.a.partId === part.id || w.b.partId === part.id))
    );
    let changed = this.diagram.wires.length !== before;

    let matches = holes.length > 0 ? this.breadboardMatches(part, holes) : [];
    if (matches.length > 0) {
      // Cale le composant pour que la première broche tombe pile sur son trou.
      const { dx, dy } = matches[0];
      if (dx !== 0 || dy !== 0) {
        part.x += dx;
        part.y += dy;
        const r = this.rendered.get(part.id);
        if (r) {
          r.container.style.left = `${part.x}px`;
          r.container.style.top = `${part.y}px`;
        }
        this.redrawWires();
        matches = this.breadboardMatches(part, holes);
      }
      for (const m of matches) {
        this.diagram.wires.push({
          id: uid('w-'),
          a: { partId: part.id, pin: m.pin },
          b: { partId: m.hole.partId, pin: m.hole.pin },
          auto: true,
        });
      }
      changed = true;
    }
    if (changed) this.notify();
  }

  // --- Câblage ---------------------------------------------------------------
  private onPinDown(endpoint: Endpoint, e: PointerEvent): void {
    if (this.locked) return; // simulation : pas de câblage
    if (this.pending) {
      this.completeWire(endpoint);
      return;
    }
    const p = this.hotspotCenter(endpoint);
    if (!p) return;
    this.pending = {
      from: endpoint,
      points: [],
      clickMode: false,
      downAt: this.canvasPoint(e.clientX, e.clientY),
    };
    this.tempPath = document.createElementNS(SVG_NS, 'path');
    this.tempPath.setAttribute('class', 'wire wire--temp');
    this.svg.appendChild(this.tempPath);
    this.updateTempPath(p);

    // Fin du geste initial : sur une autre broche -> fil direct (les broches
    // gèrent leur propre pointerup) ; ailleurs -> passage en mode clic-à-clic.
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      if (!this.pending || this.pending.clickMode) return;
      const at = this.canvasPoint(ev.clientX, ev.clientY);
      const dist = Math.hypot(at.x - this.pending.downAt.x, at.y - this.pending.downAt.y);
      this.pending.clickMode = true;
      // Glissé relâché sur le vide : on garde la position comme premier coude.
      if (dist >= DRAG_THRESHOLD && (ev.target === this.canvas || ev.target === this.svg)) {
        this.addPendingPoint(at);
      }
    };
    window.addEventListener('pointerup', up);
  }

  private onPinUp(endpoint: Endpoint, _e: PointerEvent): void {
    if (!this.pending || this.pending.clickMode) return;
    // Relâchement sur une broche pendant le geste initial : fil direct.
    if (endpoint.partId === this.pending.from.partId && endpoint.pin === this.pending.from.pin) {
      this.pending.clickMode = true; // relâché sur la broche d'origine : mode clic
      return;
    }
    this.completeWire(endpoint);
  }

  /** Pose un point intermédiaire, aimanté H/V par rapport au point précédent. */
  private addPendingPoint(at: XY): void {
    if (!this.pending) return;
    const prev = this.lastPendingPoint();
    if (!prev) return;
    this.pending.points.push(snapPoint(prev, at));
  }

  private lastPendingPoint(): XY | null {
    if (!this.pending) return null;
    return this.pending.points.length > 0
      ? this.pending.points[this.pending.points.length - 1]
      : this.hotspotCenter(this.pending.from);
  }

  private completeWire(endpoint: Endpoint): void {
    if (!this.pending) return;
    const { from, points } = this.pending;
    this.cancelPending();
    if (from.partId === endpoint.partId && from.pin === endpoint.pin) return;
    const wire: Wire = {
      id: uid('w-'),
      a: from,
      b: endpoint,
      points: points.length > 0 ? points : undefined,
      color: this.autoColor(from, endpoint),
    };
    this.diagram.wires.push(wire);
    this.drawWire(wire);
    this.notify();
  }

  private cancelPending(): void {
    this.pending = null;
    this.tempPath?.remove();
    this.tempPath = null;
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pending || !this.tempPath) return;
    const prev = this.lastPendingPoint();
    if (!prev) return;
    this.updateTempPath(snapPoint(prev, this.canvasPoint(e.clientX, e.clientY)));
  };

  private updateTempPath(cursor: XY): void {
    if (!this.pending || !this.tempPath) return;
    const start = this.hotspotCenter(this.pending.from);
    if (!start) return;
    this.tempPath.setAttribute('d', roundedWirePath([start, ...this.pending.points, cursor]));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
    // Raccourcis Ctrl : annuler/refaire, copier (toujours), coller/dupliquer.
    if (e.ctrlKey && !typing) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }
      if (k === 'c') {
        // Copie autorisée même en simulation (lecture seule).
        e.preventDefault();
        this.copySelection();
        return;
      }
      if (k === 'v' && !this.locked) {
        e.preventDefault();
        this.paste();
        return;
      }
      if (k === 'd' && !this.locked) {
        e.preventDefault();
        this.duplicateSelection();
        return;
      }
    }
    if (this.locked) return; // simulation : pas d'édition du schéma
    if (e.key === 'Escape') {
      this.cancelPending();
      this.select(null);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
      if (this.selectedParts.size > 0) {
        const ids = [...this.selectedParts];
        for (const id of ids) this.removePart(id);
        this.select(null);
      } else if (this.selection?.kind === 'wire') {
        // Un coude sélectionné : on supprime ce coude ; sinon le fil entier.
        if (this.activeHandle?.wireId === this.selection.id) {
          this.removeWirePoint(this.selection.id, this.activeHandle.index);
        } else {
          this.removeWire(this.selection.id);
        }
      }
    } else if ((e.key === '+' || e.key === '=') && !typing) {
      this.rotateSelection(45);
    } else if (e.key === '-' && !typing) {
      this.rotateSelection(-45);
    }
  };

  // --- Tracé des fils --------------------------------------------------------
  private drawWire(wire: Wire): void {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'wire');
    path.style.stroke = dupontHex(wire.color ?? 'green');
    path.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.pending) return;
      this.select({ kind: 'wire', id: wire.id });
    });
    // Double-clic : insère un coude à cet endroit (retouche du tracé).
    path.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.insertWirePoint(wire.id, this.canvasPoint(e.clientX, e.clientY));
    });
    this.svg.appendChild(path);
    this.wirePaths.set(wire.id, path);
    this.positionWire(wire);
  }

  /** Insère un point de retouche dans le segment le plus proche du clic. */
  private insertWirePoint(wireId: string, at: XY): void {
    const wire = this.diagram.wires.find((w) => w.id === wireId);
    if (!wire) return;
    const a = this.hotspotCenter(wire.a);
    const b = this.hotspotCenter(wire.b);
    if (!a || !b) return;
    const pts = [a, ...(wire.points ?? []), b];
    // Segment le plus proche du point cliqué.
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSegment(at, pts[i], pts[i + 1]);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    wire.points = wire.points ?? [];
    wire.points.splice(bestIndex, 0, at);
    this.positionWire(wire);
    this.select({ kind: 'wire', id: wireId }); // rafraîchit les poignées
    this.notify();
  }

  // --- Poignées de retouche des coudes ----------------------------------------
  private clearHandles(): void {
    for (const h of this.handles) h.remove();
    this.handles = [];
    this.activeHandle = null;
    this.clearGuides();
  }

  /** Marque un coude comme sélectionné (supprimable au clavier), met en évidence. */
  private setActiveHandle(wireId: string, index: number): void {
    this.activeHandle = { wireId, index };
    this.handles.forEach((h, i) => h.classList.toggle('wire-handle--active', i === index));
  }

  /** Supprime un coude (point intermédiaire) d'un fil. */
  private removeWirePoint(wireId: string, index: number): void {
    const wire = this.diagram.wires.find((w) => w.id === wireId);
    if (!wire?.points || index < 0 || index >= wire.points.length) return;
    wire.points.splice(index, 1);
    if (wire.points.length === 0) wire.points = undefined;
    this.positionWire(wire);
    this.buildHandles(wireId); // réindexe les poignées
    this.notify();
  }

  private clearGuides(): void {
    for (const g of this.guides) g.remove();
    this.guides = [];
  }

  /** Affiche les poignées de saisie : un coude par point + les deux extrémités. */
  private buildHandles(wireId: string): void {
    this.clearHandles();
    const wire = this.diagram.wires.find((w) => w.id === wireId);
    if (!wire) return;
    (wire.points ?? []).forEach((pt, index) => {
      const handle = document.createElement('div');
      handle.className = 'wire-handle';
      handle.style.left = `${pt.x}px`;
      handle.style.top = `${pt.y}px`;
      handle.title = t('Drag to move — Ctrl: H/V alignment — Del: remove this corner');
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.setActiveHandle(wire.id, index);
        this.dragHandle(wire, index, handle);
      });
      this.world.appendChild(handle);
      this.handles.push(handle);
    });
    this.buildEndpointHandles(wire);
  }

  /** Poignées aux deux extrémités du fil : se glissent sur une autre broche. */
  private buildEndpointHandles(wire: Wire): void {
    for (const which of ['a', 'b'] as const) {
      const c = this.hotspotCenter(wire[which]);
      if (!c) continue;
      const handle = document.createElement('div');
      handle.className = 'wire-endpoint';
      handle.style.left = `${c.x}px`;
      handle.style.top = `${c.y}px`;
      handle.title = t('Drag a pin endpoint onto another pin to reconnect it.');
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.dragEndpoint(wire, which, handle);
      });
      this.world.appendChild(handle);
      this.handles.push(handle);
    }
  }

  /** Glisse l'extrémité `which` d'un fil ; au relâché, l'accroche à la broche la plus proche. */
  private dragEndpoint(wire: Wire, which: 'a' | 'b', handle: HTMLDivElement): void {
    const path = this.wirePaths.get(wire.id);
    const move = (ev: PointerEvent): void => {
      const at = this.canvasPoint(ev.clientX, ev.clientY);
      handle.style.left = `${at.x}px`;
      handle.style.top = `${at.y}px`;
      if (path) {
        const other = this.hotspotCenter(which === 'a' ? wire.b : wire.a);
        const mids = wire.points ?? [];
        const pts = which === 'a' ? [at, ...mids, ...(other ? [other] : [])] : [...(other ? [other] : []), ...mids, at];
        path.setAttribute('d', roundedWirePath(pts));
      }
    };
    const end = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      const at = this.canvasPoint(ev.clientX, ev.clientY);
      const target = this.nearestPin(at);
      const other = which === 'a' ? wire.b : wire.a;
      if (target && !(target.partId === other.partId && target.pin === other.pin)) {
        wire[which] = target;
        this.positionWire(wire);
        // Recâblage sur une alimentation/masse : la couleur passe rouge/noir.
        const power = this.powerColorOf(wire);
        if (power) {
          wire.color = power;
          const p = this.wirePaths.get(wire.id);
          if (p) p.style.stroke = dupontHex(power);
        }
        this.notify();
      } else {
        this.positionWire(wire); // pas de cible valide : retour à la broche d'origine
      }
      this.buildHandles(wire.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  /** Broche (hotspot) la plus proche d'un point monde, dans le rayon d'accrochage. */
  private nearestPin(at: XY): Endpoint | null {
    let best: Endpoint | null = null;
    let bestD = PIN_SNAP;
    for (const [id, r] of this.rendered) {
      for (const pin of r.hotspots.keys()) {
        const c = this.hotspotCenter({ partId: id, pin });
        if (!c) continue;
        const d = Math.hypot(c.x - at.x, c.y - at.y);
        if (d <= bestD) {
          bestD = d;
          best = { partId: id, pin };
        }
      }
    }
    return best;
  }

  /** Rectangles d'encombrement de tous les composants (coordonnées monde). */
  private partObstacles(): PartRect[] {
    const rects: PartRect[] = [];
    for (const r of this.rendered.values()) {
      const body = r.container.querySelector('.part__body') as HTMLElement | null;
      const w = body?.offsetWidth || 40;
      const h = body?.offsetHeight || 40;
      rects.push({ id: r.part.id, x: r.part.x, y: r.part.y, w, h });
    }
    return rects;
  }

  /**
   * Point de sortie **perpendiculaire au bord le plus proche** du corps d'un
   * composant : le fil quitte la broche tout droit, vers l'extérieur, au lieu de
   * traverser le composant. S'applique à tout composant dont la broche est *dans*
   * le corps (cartes, platines, gros modules). Renvoie null si la broche est déjà
   * sur le bord ou hors du corps (pattes saillantes d'un petit composant : aucune
   * traversée à craindre).
   */
  private pinStub(end: Endpoint, center: XY, rects: Map<string, PartRect>, len: number): XY | null {
    const r = this.rendered.get(end.partId);
    if (!r) return null;
    const box = rects.get(end.partId);
    if (!box) return null;
    const dTop = center.y - box.y;
    const dBot = box.y + box.h - center.y;
    const dLeft = center.x - box.x;
    const dRight = box.x + box.w - center.x;
    // Broche sur le bord ou hors du corps : pas de sortie à forcer.
    const INSET = 2;
    if (dTop < INSET || dBot < INSET || dLeft < INSET || dRight < INSET) return null;
    const m = Math.min(dTop, dBot, dLeft, dRight);
    if (m === dTop) return { x: center.x, y: box.y - len };
    if (m === dBot) return { x: center.x, y: box.y + box.h + len };
    if (m === dLeft) return { x: box.x - len, y: center.y };
    return { x: box.x + box.w + len, y: center.y };
  }

  /**
   * Autoroutage : réécrit les fils en tracés horizontaux/verticaux. Chaque
   * extrémité posée sur une carte **sort perpendiculairement au bord le plus
   * proche** (le fil ne traverse plus la carte) ; entre les deux sorties, des deux
   * orientations du coude en L on garde celle qui recouvre le moins les *autres*
   * composants (pour les contourner). Sur la sélection si des composants sont
   * sélectionnés, sinon sur tout le dessin.
   */
  autoRoute(): void {
    if (this.locked) return;
    const sel = this.selectedParts;
    const all = sel.size === 0;
    const obstacles = this.partObstacles();
    const rectOf = new Map(obstacles.map((o) => [o.id, o]));
    const STUB = GRID; // sortie perpendiculaire = 1 pas de grille hors du corps
    const GAP = 5; // écart mini entre deux fils parallèles (px)
    const TOL = 1;
    // Segments de chaque fil (repère monde) — pour éviter qu'un nouveau tracé se
    // superpose à un fil existant. Mis à jour au fil des reroutes.
    const toSegs = (pts: XY[]): Array<[XY, XY]> => {
      const s: Array<[XY, XY]> = [];
      for (let i = 0; i < pts.length - 1; i++) s.push([pts[i], pts[i + 1]]);
      return s;
    };
    const wireSegs = new Map<string, Array<[XY, XY]>>();
    for (const w of this.diagram.wires) {
      const ca = this.hotspotCenter(w.a);
      const cb = this.hotspotCenter(w.b);
      if (ca && cb) wireSegs.set(w.id, toSegs([ca, ...(w.points ?? []), cb]));
    }
    let changed = false;
    for (const wire of this.diagram.wires) {
      if (wire.auto) continue;
      if (!all && !(sel.has(wire.a.partId) || sel.has(wire.b.partId))) continue;
      const a = this.hotspotCenter(wire.a);
      const b = this.hotspotCenter(wire.b);
      if (!a || !b) continue;
      const sa = this.pinStub(wire.a, a, rectOf, STUB);
      const sb = this.pinStub(wire.b, b, rectOf, STUB);
      const pa = sa ?? a; // point de départ du routage (après sortie perpendiculaire)
      const pb = sb ?? b;
      const others = obstacles.filter((o) => o.id !== wire.a.partId && o.id !== wire.b.partId);
      const otherSegs: Array<[XY, XY]> = [];
      for (const [wid, segs] of wireSegs) if (wid !== wire.id) otherSegs.push(...segs);
      // Coût d'un tracé : recouvrement de composants + recouvrement (colinéaire) ET
      // proximité (< GAP) d'autres fils. Les fils peuvent se croiser mais pas se
      // chevaucher ni se serrer à moins de GAP.
      const cost = (c: XY[]): number => {
        const poly = [a, pa, ...c, pb, b];
        const comp = polylineRectOverlap(poly, others);
        const { overlap, near } = polylineWireCost(poly, otherSegs, GAP);
        return comp * 3 + overlap * 6 + near * 0.6;
      };
      const pick = (cands: XY[][]): XY[] => {
        let best = cands[0];
        let bestCost = Infinity;
        for (const c of cands) {
          const k = cost(c);
          if (k < bestCost - 0.01) {
            bestCost = k;
            best = c;
          }
        }
        return best;
      };
      let inner: XY[] = [];
      // Routeur A* (contourne les obstacles et les fils). Le chemin va de pa à
      // pb inclus ; on retire ces deux bornes (réinjectées via sa/sb ou a/b).
      const path = astarRoute(pa, pb, others, otherSegs, { clr: GRID / 2, bend: 2 * GRID, gap: GAP });
      if (path && path.length >= 2) {
        inner = path.slice(1, -1);
      } else if (Math.abs(pa.x - pb.x) > TOL && Math.abs(pa.y - pb.y) > TOL) {
        // Repli (A* sans solution) : coude en L / détour en Z de moindre coût.
        const midX = (pa.x + pb.x) / 2;
        const midY = (pa.y + pb.y) / 2;
        const offs = [0, GAP, -GAP, 2 * GAP, -2 * GAP, 3 * GAP, -3 * GAP];
        const candidates: XY[][] = [[{ x: pb.x, y: pa.y }], [{ x: pa.x, y: pb.y }]];
        for (const o of offs) {
          candidates.push([{ x: midX + o, y: pa.y }, { x: midX + o, y: pb.y }]);
          candidates.push([{ x: pa.x, y: midY + o }, { x: pb.x, y: midY + o }]);
        }
        inner = pick(candidates);
      } else if (polylineWireCost([a, pa, pb, b], otherSegs, GAP).overlap > TOL) {
        // Tracé droit qui se superposerait à un fil aligné : on insère un créneau
        // (bosse perpendiculaire) pour le décaler, du côté le plus dégagé.
        const horizontal = Math.abs(pa.y - pb.y) <= TOL;
        const cands: XY[][] = [[]];
        for (const o of [GAP, -GAP, 2 * GAP, -2 * GAP]) {
          if (horizontal) {
            const x1 = pa.x + (pb.x - pa.x) / 3;
            const x2 = pa.x + (2 * (pb.x - pa.x)) / 3;
            const y = pa.y + o;
            cands.push([{ x: x1, y: pa.y }, { x: x1, y }, { x: x2, y }, { x: x2, y: pb.y }]);
          } else {
            const y1 = pa.y + (pb.y - pa.y) / 3;
            const y2 = pa.y + (2 * (pb.y - pa.y)) / 3;
            const x = pa.x + o;
            cands.push([{ x: pa.x, y: y1 }, { x, y: y1 }, { x, y: y2 }, { x: pb.x, y: y2 }]);
          }
        }
        inner = pick(cands);
      }
      const pts = [...(sa ? [sa] : []), ...inner, ...(sb ? [sb] : [])];
      wire.points = pts.length > 0 ? pts : undefined;
      wireSegs.set(wire.id, toSegs([a, ...pts, b]));
      changed = true;
      this.positionWire(wire);
    }
    if (this.selection?.kind === 'wire') this.buildHandles(this.selection.id);
    if (changed) this.notify();
  }

  private dragHandle(wire: Wire, index: number, handle: HTMLDivElement): void {
    const move = (ev: PointerEvent) => {
      if (!wire.points) return;
      let pos = this.canvasPoint(ev.clientX, ev.clientY);
      if (ev.ctrlKey) {
        // Réticule + forçage : aligne le coude sur ses voisins (segments H/V).
        pos = this.alignToNeighbours(wire, index, pos);
        this.showGuides(pos);
      } else {
        this.clearGuides();
      }
      wire.points[index] = pos;
      handle.style.left = `${pos.x}px`;
      handle.style.top = `${pos.y}px`;
      this.positionWire(wire);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      this.clearGuides();
      this.notify();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  /** Force le coude sur l'horizontale/verticale de ses voisins (points ou broches). */
  private alignToNeighbours(wire: Wire, index: number, pos: XY): XY {
    const pts = wire.points ?? [];
    const prev = index > 0 ? pts[index - 1] : this.hotspotCenter(wire.a);
    const next = index < pts.length - 1 ? pts[index + 1] : this.hotspotCenter(wire.b);
    let { x, y } = pos;
    const SNAP = 14;
    for (const n of [prev, next]) {
      if (!n) continue;
      if (Math.abs(x - n.x) <= SNAP) x = n.x; // segment vertical exact
      if (Math.abs(y - n.y) <= SNAP) y = n.y; // segment horizontal exact
    }
    return { x, y };
  }

  /** Réticule horizontal + vertical passant par le point (mode Ctrl). */
  private showGuides(at: XY): void {
    if (this.guides.length === 0) {
      for (let i = 0; i < 2; i++) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'wire-guide');
        this.svg.appendChild(line);
        this.guides.push(line);
      }
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const [hLine, vLine] = this.guides;
    hLine.setAttribute('x1', '0');
    hLine.setAttribute('y1', String(at.y));
    hLine.setAttribute('x2', String(w));
    hLine.setAttribute('y2', String(at.y));
    vLine.setAttribute('x1', String(at.x));
    vLine.setAttribute('y1', '0');
    vLine.setAttribute('x2', String(at.x));
    vLine.setAttribute('y2', String(h));
  }

  removeWire(id: string): void {
    this.diagram.wires = this.diagram.wires.filter((w) => w.id !== id);
    this.wirePaths.get(id)?.remove();
    this.wirePaths.delete(id);
    if (this.selection?.kind === 'wire' && this.selection.id === id) this.select(null);
    this.notify();
  }

  setWireColor(id: string, color: string): void {
    const wire = this.diagram.wires.find((w) => w.id === id);
    if (!wire) return;
    wire.color = color;
    const path = this.wirePaths.get(id);
    if (path) path.style.stroke = dupontHex(color);
  }

  private positionWire(wire: Wire): void {
    const path = this.wirePaths.get(wire.id);
    if (!path) return;
    const a = this.hotspotCenter(wire.a);
    const b = this.hotspotCenter(wire.b);
    if (!a || !b) return;
    path.setAttribute('d', roundedWirePath([a, ...(wire.points ?? []), b]));
  }

  redrawWires(): void {
    for (const wire of this.diagram.wires) this.positionWire(wire);
  }

  /**
   * Agrandit le dessin d'un élément @wokwi (et son hôte) pour que le pas de ses
   * broches passe de 9,6 px (0,1″) à 10 px = la grille / le pas de la platine.
   * Le viewBox restant inchangé, le dessin se redimensionne ; comme les pastilles
   * de broche sont elles aussi placées à `pin.x × pinScale` (cf. makeHotspot /
   * syncHotspots), tout reste aligné — y compris à l'export SVG, qui lit la
   * taille de mise en page agrandie. Idempotent (drapeau posé sur l'élément).
   * Renvoie `false` si le SVG n'est pas encore rendu (à réessayer plus tard).
   */
  private applyPinScale(r: Rendered): boolean {
    // Dessin retouché : l'élément @wokwi est masqué, on ne l'agrandit pas (les
    // broches viennent des surcharges, dans le repère du dessin).
    if (boardDrawing(r.part.type, r.part.attrs)) return true;
    const k = partDef(r.part.type).pinScale ?? 1;
    if (k === 1) return true;
    const el = r.el as HTMLElement & { _pinScaled?: boolean };
    if (el._pinScaled) return true;
    const svg = (el.shadowRoot ?? el).querySelector('svg') as SVGSVGElement | null;
    if (!svg) return false; // élément Lit pas encore rendu : réessai au prochain settle
    const w = svg.width?.baseVal?.value || 0;
    const h = svg.height?.baseVal?.value || 0;
    if (!w || !h) return false;
    svg.setAttribute('width', `${w * k}`);
    svg.setAttribute('height', `${h * k}`);
    el.style.width = `${w * k}px`;
    el.style.height = `${h * k}px`;
    el._pinScaled = true;
    return true;
  }

  /**
   * Recale les bandeaux de nom et les fils une frame plus tard. Les éléments
   * @wokwi (Lit) terminent leur mise en page de façon asynchrone : au premier
   * rendu, offsetWidth/positions de broches peuvent être provisoires. Sans ce
   * second passage, le nom d'un composant tourné se plaçait mal et les fils se
   * décalaient légèrement après un re-rendu (chargement, annuler/refaire,
   * réinitialisation, déplacement d'onglet).
   */
  private settleQueued = false;
  private scheduleSettle(): void {
    if (this.settleQueued || typeof requestAnimationFrame !== 'function') return;
    this.settleQueued = true;
    requestAnimationFrame(() => {
      this.settleQueued = false;
      let pending = false; // un dessin @wokwi pas encore prêt à être agrandi
      for (const r of this.rendered.values()) {
        if (!this.applyPinScale(r)) pending = true; // dessin agrandi au pas de 10 px
        this.syncHotspots(r); // pastilles de broche tardives (pinInfo asynchrone)
        const body = r.container.querySelector('.part__body') as HTMLDivElement | null;
        if (body) this.applyRotation(r.part, body); // repositionne le bandeau (rotation)
      }
      this.redrawWires();
      // Le SVG d'un élément Lit peut arriver après cette frame : on repasse une
      // fois de plus tant qu'une carte attend sa mise à l'échelle.
      if (pending) requestAnimationFrame(() => this.scheduleSettle());
    });
  }

  // --- Sélection + éditeur de composants --------------------------------------
  private select(sel: Selection): void {
    // Retire la mise en évidence précédente (fil + câblages internes affichés).
    if (this.selection?.kind === 'wire') {
      this.wirePaths.get(this.selection.id)?.classList.remove('wire--selected');
    }
    for (const id of this.selectedParts) {
      const c = this.rendered.get(id)?.container;
      c?.querySelector('.part__internal')?.remove();
      c?.querySelector('.part__pinout')?.remove();
      c?.classList.remove('part--pinout-shown');
    }

    this.selection = sel;
    this.selectedParts = sel?.kind === 'part' ? new Set([sel.id]) : new Set();
    this.clearHandles();
    this.setPartHighlight();

    if (sel?.kind === 'part') {
      if (this.internalShown.has(sel.id)) this.renderInternalWiring(sel.id);
      if (this.pinoutShown.has(sel.id)) this.renderPinout(sel.id);
    } else if (sel?.kind === 'wire') {
      this.wirePaths.get(sel.id)?.classList.add('wire--selected');
      this.buildHandles(sel.id);
    }
    this.renderInspector();
  }

  /** Met le contour « sélectionné » sur tous les composants de la sélection. */
  private setPartHighlight(): void {
    for (const [id, r] of this.rendered) {
      r.container.classList.toggle('part--selected', this.selectedParts.has(id));
    }
  }

  /** Ctrl+clic : ajoute/retire un composant de la sélection multiple. */
  private toggleInSelection(id: string): void {
    if (this.selection?.kind === 'wire') {
      this.wirePaths.get(this.selection.id)?.classList.remove('wire--selected');
      this.clearHandles();
    }
    if (this.selectedParts.has(id)) {
      this.selectedParts.delete(id);
      const c = this.rendered.get(id)?.container;
      c?.querySelector('.part__internal')?.remove();
      c?.querySelector('.part__pinout')?.remove();
      c?.classList.remove('part--pinout-shown');
    } else {
      this.selectedParts.add(id);
    }
    const members = [...this.selectedParts];
    this.selection = members.length > 0 ? { kind: 'part', id: members[members.length - 1] } : null;
    this.setPartHighlight();
    this.renderInspector();
  }

  /** Démarre un rectangle de sélection (marquee) sur le fond du canvas. */
  private startMarquee(e: PointerEvent): void {
    const start = this.canvasPoint(e.clientX, e.clientY);
    const baseSet = e.ctrlKey ? new Set(this.selectedParts) : new Set<string>();
    let moved = false;
    const rectEl = document.createElement('div');
    rectEl.className = 'marquee';
    this.world.appendChild(rectEl);

    const move = (ev: PointerEvent): void => {
      const cur = this.canvasPoint(ev.clientX, ev.clientY);
      if (!moved && Math.hypot(cur.x - start.x, cur.y - start.y) < DRAG_THRESHOLD) return;
      moved = true;
      const x = Math.min(start.x, cur.x);
      const y = Math.min(start.y, cur.y);
      const w = Math.abs(cur.x - start.x);
      const h = Math.abs(cur.y - start.y);
      rectEl.style.left = `${x}px`;
      rectEl.style.top = `${y}px`;
      rectEl.style.width = `${w}px`;
      rectEl.style.height = `${h}px`;
      this.selectedParts = new Set([...baseSet, ...this.partsInRect(x, y, w, h)]);
      this.setPartHighlight();
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      rectEl.remove();
      if (!moved) {
        this.select(null); // simple clic sur le fond = désélection
        return;
      }
      const members = [...this.selectedParts];
      this.selection = members.length === 1 ? { kind: 'part', id: members[0] } : null;
      this.renderInspector();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /**
   * Composants dont la boîte englobante est ENTIÈREMENT contenue dans le
   * rectangle (coords monde). Un composant seulement effleuré par le cadre n'est
   * pas pris : il faut l'encadrer complètement pour le sélectionner.
   */
  private partsInRect(x: number, y: number, w: number, h: number): string[] {
    const ids: string[] = [];
    for (const [id, r] of this.rendered) {
      const body = r.container.querySelector('.part__body') as HTMLElement | null;
      const pw = body?.offsetWidth || 40;
      const ph = body?.offsetHeight || 40;
      if (r.part.x >= x && r.part.x + pw <= x + w && r.part.y >= y && r.part.y + ph <= y + h) {
        ids.push(id);
      }
    }
    return ids;
  }

  // --- Copier / coller / dupliquer --------------------------------------------
  /**
   * Copie la sélection : presse-papier interne (pour Coller/Dupliquer dans le
   * schéma) + image vectorielle SVG dans le presse-papier système (pour coller
   * dans un autre logiciel, ex. Inkscape).
   */
  copySelection(): void {
    if (this.selectedParts.size === 0) return;
    const ids = new Set(this.selectedParts);
    const parts = this.diagram.parts.filter((p) => ids.has(p.id));
    // Seuls les fils entièrement contenus dans la sélection sont copiés.
    const wires = this.diagram.wires.filter(
      (w) => !w.auto && ids.has(w.a.partId) && ids.has(w.b.partId)
    );
    this.clipboard = JSON.parse(JSON.stringify({ parts, wires })) as { parts: Part[]; wires: Wire[] };
    void this.copyAsVectorImage(this.buildSvg(ids));
  }

  /** Colle le presse-papier interne (composants décalés, fils internes conservés). */
  paste(): void {
    if (!this.clipboard || this.clipboard.parts.length === 0) return;
    const OFFSET = 24;
    const idMap = new Map<string, string>();
    const newIds = new Set<string>();
    for (const p of this.clipboard.parts) {
      const np: Part = { ...p, id: uid(`${p.type}-`), x: p.x + OFFSET, y: p.y + OFFSET };
      idMap.set(p.id, np.id);
      this.diagram.parts.push(np);
      this.renderPart(np);
      newIds.add(np.id);
    }
    for (const w of this.clipboard.wires) {
      const a = idMap.get(w.a.partId);
      const b = idMap.get(w.b.partId);
      if (!a || !b) continue;
      const nw: Wire = {
        ...w,
        id: uid('w-'),
        a: { partId: a, pin: w.a.pin },
        b: { partId: b, pin: w.b.pin },
        points: w.points?.map((pt) => ({ x: pt.x + OFFSET, y: pt.y + OFFSET })),
      };
      this.diagram.wires.push(nw);
      this.drawWire(nw);
    }
    this.redrawWires();
    // Sélectionne les copies fraîchement posées.
    this.selectedParts = newIds;
    this.selection = newIds.size === 1 ? { kind: 'part', id: [...newIds][0] } : null;
    this.setPartHighlight();
    this.renderInspector();
    this.notify();
  }

  /** Duplique la sélection sur place (copie + colle). */
  duplicateSelection(): void {
    this.copySelection();
    this.paste();
  }

  /** Écrit le SVG fourni dans le presse-papier système (image vectorielle, repli texte). */
  private async copyAsVectorImage(svg: string): Promise<void> {
    try {
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }),
            'text/plain': new Blob([svg], { type: 'text/plain' }),
          }),
        ]);
        return;
      }
    } catch {
      // type image/svg+xml non pris en charge : repli sur le texte brut.
    }
    try {
      await navigator.clipboard?.writeText(svg);
    } catch {
      // presse-papier indisponible (focus/permission) : on n'échoue pas.
    }
  }

  // --- Câblage interne (commandé par le bouton ☢ du bandeau) ------------------
  private isSelected(partId: string): boolean {
    return this.selection?.kind === 'part' && this.selection.id === partId;
  }

  /** Bascule l'affichage du câblage interne d'un composant (visible si sélectionné). */
  private toggleInternalWiring(partId: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    if (this.internalShown.has(partId)) {
      this.internalShown.delete(partId);
      r.container.querySelector('.part__internal')?.remove();
    } else {
      this.internalShown.add(partId);
      if (this.isSelected(partId)) this.renderInternalWiring(partId);
    }
    r.container
      .querySelector('.part__internal-toggle')
      ?.classList.toggle('part__internal-toggle--active', this.internalShown.has(partId));
  }

  /** Bascule l'affichage du poster de brochage complet (visible si sélectionné). */
  private togglePinout(partId: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    if (this.pinoutShown.has(partId)) {
      this.pinoutShown.delete(partId);
      r.container.querySelector('.part__pinout')?.remove();
      r.container.classList.remove('part--pinout-shown');
    } else {
      this.pinoutShown.add(partId);
      if (this.isSelected(partId)) this.renderPinout(partId);
    }
    r.container
      .querySelector('.part__internal-toggle')
      ?.classList.toggle('part__internal-toggle--active', this.pinoutShown.has(partId));
  }

  /** Affiche le poster de brochage en surimpression de la carte (comme le câblage interne). */
  private renderPinout(partId: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    const poster = pinoutPoster(r.part.type);
    if (!poster) return;
    const body = r.container.querySelector('.part__body') as HTMLElement | null;
    if (!body) return;
    body.querySelector('.part__pinout')?.remove();
    // Boîte réelle de la carte, dans le repère local (non zoomé) du corps. On mesure
    // le SVG de la carte plutôt que de supposer une taille fixe calée en (0,0) : la
    // pose s'auto-aligne si la boîte du corps diffère de la carte. Pour une carte
    // tournée/retournée le rect écran serait l'AABB pivotée → on retombe alors sur
    // la taille nominale (le poster suit la rotation via le transform du corps).
    let left = 0;
    let top = 0;
    let width = BOARD_W;
    let height = BOARD_H;
    const rotated = (r.part.rotation ?? 0) % 360 !== 0 || !!r.part.flipH || !!r.part.flipV;
    const boardSvg = (r.el.shadowRoot ?? r.el).querySelector('svg');
    if (!rotated && boardSvg) {
      const z = this.zoom || 1;
      const bb = body.getBoundingClientRect();
      const sb = boardSvg.getBoundingClientRect();
      if (sb.width > 0 && sb.height > 0) {
        left = (sb.left - bb.left) / z;
        top = (sb.top - bb.top) / z;
        width = sb.width / z;
        height = sb.height / z;
      }
    }
    // Poster mis à la largeur de la carte (svg width:100%, hauteur au rapport
    // d'aspect = scaledH). On l'étire verticalement (scaleY) pour que sa bande vide
    // [rTop, rBot] couvre exactement la carte [top, top+height] : les deux rangées
    // de broches s'alignent alors. Posé dans le corps → suit rotation/retournement,
    // n'agrandit pas la boîte de sélection.
    const scaledH = (width * poster.h) / poster.w;
    const k = height / ((poster.rBot - poster.rTop) * scaledH); // étirement vertical
    const ty = top - poster.rTop * scaledH * k; // place le bord haut de la bande
    const overlay = document.createElement('div');
    overlay.className = 'part__pinout';
    overlay.style.left = `${left}px`;
    overlay.style.width = `${width}px`;
    overlay.style.transformOrigin = '0 0';
    overlay.style.transform = `translateY(${ty}px) scaleY(${k})`;
    overlay.innerHTML = poster.svg;
    body.appendChild(overlay);
    r.container.classList.add('part--pinout-shown'); // efface le bandeau de nom
  }

  /** Dessine la surimpression du câblage interne dans le corps du composant. */
  private renderInternalWiring(partId: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    const body = r.container.querySelector('.part__body') as HTMLElement | null;
    if (!body) return;
    body.querySelector('.part__internal')?.remove();
    const pins = ((r.el.pinInfo ?? []) as PinPoint[]).map((p) => ({ name: p.name, x: p.x, y: p.y }));
    const w = body.offsetWidth || 80;
    const h = body.offsetHeight || 60;
    const inner = internalWiringSvg(partDef(r.part.type).kind, pins, r.part.attrs, r.part.type, { w, h });
    if (!inner) return;
    // Inséré dans le corps : suit naturellement rotation et retournement.
    const overlay = document.createElement('div');
    overlay.className = 'part__internal';
    overlay.innerHTML =
      `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="${SVG_NS}">` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="rgba(255,255,255,0.8)"/>` +
      `<g fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>` +
      `</svg>`;
    body.appendChild(overlay);
  }

  /** Change un attribut d'un composant (depuis l'inspecteur). */
  updatePartAttr(partId: string, attr: string, value: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    r.part.attrs = { ...r.part.attrs, [attr]: value };
    // LCD Texte : le format 16×2 / 20×4 pilote cols + rows de l'élément (et du
    // périphérique I²C simulé). Le changement de `pins` (i2c↔parallèle) change le
    // jeu de broches → re-rendu comme pour une taille.
    if (attr === 'lcdSize') {
      const [cols, rows] = value === '20x4' ? ['20', '4'] : ['16', '2'];
      r.part.attrs = { ...r.part.attrs, cols, rows };
    }
    // Platine rétrécie : retire les fils pointant vers des trous disparus.
    if (attr === 'size' && partDef(r.part.type).kind === 'breadboard') {
      const valid = new Set(breadboardPins(normalizeSize(value)).map((p) => p.name));
      this.diagram.wires = this.diagram.wires.filter((w) => {
        for (const end of [w.a, w.b]) {
          if (end.partId === partId && !valid.has(end.pin)) {
            this.wirePaths.get(w.id)?.remove();
            this.wirePaths.delete(w.id);
            return false;
          }
        }
        return true;
      });
    }
    // L'angle, la taille, le jeu de broches (LCD i2c↔parallèle) ou le nombre de
    // colonnes du clavier déplacent les broches : re-rendu complet nécessaire
    // (sinon les pastilles restent aux positions de l'ancienne variante → hors
    // du connecteur pour le clavier 3 colonnes).
    if (attr === 'angle' || attr === 'flip' || attr === 'size' || attr === 'pins' || attr === 'lcdSize' || attr === 'columns') {
      this.rerenderPart(partId); // renderPart restaure le câblage interne s'il était affiché
      if (this.selection?.kind === 'part' && this.selection.id === partId) {
        this.rendered.get(partId)?.container.classList.add('part--selected');
      }
    } else if (value === '') {
      r.el.removeAttribute(attr);
    } else {
      r.el.setAttribute(attr, value);
    }
    this.notify();
  }

  private renderInspector(): void {
    this.inspector.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = t('Properties');
    this.inspector.appendChild(title);

    // Sélection multiple : résumé + actions de groupe (rotation/miroir/suppression).
    if (this.selectedParts.size > 1) {
      this.renderMultiInspector();
      return;
    }

    if (!this.selection) {
      const hint = document.createElement('p');
      hint.className = 'inspector__hint';
      hint.textContent = t('Click a part or a wire to edit it. Wiring: click a pin, add corners by clicking the background, finish on a pin (Esc: cancel).');
      this.inspector.appendChild(hint);
      return;
    }

    if (this.selection.kind === 'wire') {
      this.renderWireInspector(this.selection.id);
    } else {
      this.renderPartInspector(this.selection.id);
    }
  }

  /** Inspecteur d'une sélection multiple : nombre + transformations de groupe. */
  private renderMultiInspector(): void {
    const subtitle = document.createElement('p');
    subtitle.className = 'inspector__subtitle';
    subtitle.textContent = t('{0} parts selected', this.selectedParts.size);
    this.inspector.appendChild(subtitle);

    this.appendTransformControl(null);
    this.appendDeleteButton(t('Delete the selection'), () => {
      const ids = [...this.selectedParts];
      for (const id of ids) this.removePart(id);
      this.select(null);
    });
    this.appendHelp([
      t('+ or − to rotate the parts'),
      t('Drag a part to move the whole selection.'),
      t('Ctrl+C / Ctrl+V: copy / paste — Ctrl+D: duplicate.'),
    ]);
  }

  private renderWireInspector(wireId: string): void {
    const wire = this.diagram.wires.find((w) => w.id === wireId);
    if (!wire) return;

    const subtitle = document.createElement('p');
    subtitle.className = 'inspector__subtitle';
    subtitle.textContent = t('Wire {0} → {1}', wire.a.pin, wire.b.pin);
    this.inspector.appendChild(subtitle);

    const label = document.createElement('label');
    label.className = 'inspector__label';
    label.textContent = t('Color (Dupont ribbon)');
    this.inspector.appendChild(label);

    const swatches = document.createElement('div');
    swatches.className = 'inspector__swatches';
    for (const color of DUPONT_COLORS) {
      const sw = document.createElement('button');
      sw.className = 'inspector__swatch' + (wire.color === color.id ? ' inspector__swatch--active' : '');
      sw.style.background = color.hex;
      sw.title = t(color.label);
      sw.addEventListener('click', () => {
        this.setWireColor(wireId, color.id);
        this.renderInspector();
      });
      swatches.appendChild(sw);
    }
    this.inspector.appendChild(swatches);

    this.appendDeleteButton(t('Delete the wire'), () => this.removeWire(wireId));
    // Aide à l'édition des fils, sous les propriétés du fil sélectionné.
    this.appendHelp([
      t('Cross handle: move a corner.'),
      t('Ctrl: horizontal/vertical alignment.'),
      t('Double-click the wire: add a corner.'),
      t('Click a corner then Del: remove it.'),
    ]);
  }

  private renderPartInspector(partId: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    const def = partDef(r.part.type);

    const subtitle = document.createElement('p');
    subtitle.className = 'inspector__subtitle';
    subtitle.textContent = t(def.label);
    this.inspector.appendChild(subtitle);

    // Bouton d'aide locale sur le composant (fiche FR hors-ligne, docs/composants).
    // Affiché pour les composants intégrés (les composants perso n'ont pas de fiche).
    if (def.tag !== 'kablix-custom-part') {
      const help = document.createElement('button');
      help.className = 'inspector__doc';
      help.textContent = `❔ ${t('Component help')}`;
      help.title = t('Open the help for this part');
      help.addEventListener('click', () => this.onComponentHelp?.(def.type));
      this.inspector.appendChild(help);
    }

    for (const prop of def.props ?? []) {
      this.appendPropControl(partId, r.part, prop);
    }
    if ((def.props ?? []).length === 0) {
      const hint = document.createElement('p');
      hint.className = 'inspector__hint';
      hint.textContent = t('No editable property for this part.');
      this.inspector.appendChild(hint);
    }

    this.appendTransformControl(r.part);
    this.appendDeleteButton(t('Delete the part'), () => this.removePart(partId));
    // Zone d'aide contextuelle, sous les propriétés du composant sélectionné.
    const lines = [t('+ or − to rotate the part')];
    if (def.interactive) lines.push(t('Right-click to move it.'));
    if (def.kind === 'pushbutton') lines.push(t('In simulation: Ctrl+click keeps it pressed.'));
    this.appendHelp(lines);
  }

  /**
   * Barre d'orientation : rotation (↺ ↻, équivalent des touches − / +) et
   * retournement (⇆ ⇅), uniquement des icônes, pour tout composant.
   */
  private appendTransformControl(part: Part | null): void {
    const label = document.createElement('label');
    label.className = 'inspector__label';
    label.textContent = t('Orientation');
    this.inspector.appendChild(label);

    const row = document.createElement('div');
    row.className = 'inspector__transform';
    const buttons: Array<{ glyph: string; title: string; on: () => void; active?: boolean }> = [
      { glyph: '↺', title: t('Rotate left (−45°)'), on: () => this.rotateSelection(-45) },
      { glyph: '↻', title: t('Rotate right (+45°)'), on: () => this.rotateSelection(45) },
      { glyph: '⇆', title: t('Flip horizontally'), on: () => this.flipSelection('h'), active: part?.flipH },
      { glyph: '⇅', title: t('Flip vertically'), on: () => this.flipSelection('v'), active: part?.flipV },
    ];
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'inspector__transform-btn' + (b.active ? ' inspector__transform-btn--active' : '');
      btn.textContent = b.glyph;
      btn.title = b.title;
      btn.addEventListener('click', b.on);
      row.appendChild(btn);
    }
    this.inspector.appendChild(row);
  }

  /** Encart d'aide affiché sous l'inspecteur (une ou plusieurs lignes). */
  private appendHelp(lines: string | string[]): void {
    const help = document.createElement('p');
    help.className = 'inspector__help';
    const arr = Array.isArray(lines) ? lines : [lines];
    help.append(`💡 ${arr[0]}`);
    for (const line of arr.slice(1)) {
      help.append(document.createElement('br'), line);
    }
    this.inspector.appendChild(help);
  }

  private appendPropControl(partId: string, part: Part, prop: PropDef): void {
    const label = document.createElement('label');
    label.className = 'inspector__label';
    label.textContent = t(prop.label);
    this.inspector.appendChild(label);

    const current = part.attrs?.[prop.attr] ?? '';
    if (prop.attr === 'color' && prop.kind === 'select') {
      // Choix de couleur par boutons colorés (au lieu d'une liste déroulante).
      const swatches = document.createElement('div');
      swatches.className = 'inspector__swatches';
      for (const opt of prop.options ?? []) {
        const sw = document.createElement('button');
        sw.className = 'inspector__swatch' + (opt === current ? ' inspector__swatch--active' : '');
        sw.style.background = colorSwatchBackground(opt);
        sw.title = opt;
        sw.addEventListener('click', () => {
          this.updatePartAttr(partId, prop.attr, opt);
          this.renderInspector();
        });
        swatches.appendChild(sw);
      }
      this.inspector.appendChild(swatches);
    } else if (prop.kind === 'select') {
      const select = document.createElement('select');
      select.className = 'inspector__control';
      for (const opt of prop.options ?? []) {
        const o = document.createElement('option');
        o.value = opt;
        const labelKey = prop.optionLabels?.[opt];
        o.textContent = labelKey ? t(labelKey) : opt === '' ? t('no') : opt;
        if (opt === current) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => this.updatePartAttr(partId, prop.attr, select.value));
      this.inspector.appendChild(select);
    } else if (prop.suffixes) {
      // Champ texte acceptant les suffixes SI (p n µ m k M G), ex. « 2.2k ».
      const input = document.createElement('input');
      input.className = 'inspector__control';
      input.type = 'text';
      input.value = current === '' ? '' : formatSiValue(Number(current));
      input.title = t('Suffixes allowed: p n µ m k M G (e.g. 2.2k)');
      input.addEventListener('change', () => {
        const parsed = parseSiValue(input.value);
        if (parsed === null) {
          input.value = current === '' ? '' : formatSiValue(Number(current)); // entrée invalide : on annule
          return;
        }
        this.updatePartAttr(partId, prop.attr, String(parsed));
        input.value = formatSiValue(parsed);
      });
      this.inspector.appendChild(input);
    } else {
      const input = document.createElement('input');
      input.className = 'inspector__control';
      input.type = 'number';
      if (prop.min !== undefined) input.min = String(prop.min);
      if (prop.max !== undefined) input.max = String(prop.max);
      if (prop.step !== undefined) input.step = String(prop.step);
      input.value = current;
      input.addEventListener('change', () => this.updatePartAttr(partId, prop.attr, input.value));
      this.inspector.appendChild(input);
    }
  }

  private appendDeleteButton(text: string, action: () => void): void {
    const btn = document.createElement('button');
    btn.className = 'inspector__delete';
    btn.textContent = `🗑 ${text}`;
    btn.addEventListener('click', action);
    this.inspector.appendChild(btn);
  }

  // --- Conversion de coordonnées ---------------------------------------------
  /** Écran → coordonnées du monde (annule la translation puis le zoom). */
  private canvasPoint(clientX: number, clientY: number): XY {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panX) / this.zoom,
      y: (clientY - rect.top - this.panY) / this.zoom,
    };
  }

  private hotspotCenter(e: Endpoint): XY | null {
    const dot = this.rendered.get(e.partId)?.hotspots.get(e.pin);
    if (!dot) return null;
    const dr = dot.getBoundingClientRect();
    return this.canvasPoint(dr.left + dr.width / 2, dr.top + dr.height / 2);
  }

  private notify(): void {
    this.recordHistory();
    this.onChange?.();
  }

  // --- Export SVG ----------------------------------------------------------------
  /**
   * Sérialise le schéma en SVG autonome. Chaque composant est extrait de son
   * shadow DOM puis forcé à sa taille d'affichage réelle (width/height +
   * viewBox), ce qui garantit que ses broches tombent pile sous les fils ; les
   * rotations sont appliquées autour du centre, comme à l'écran. La zone visible
   * englobe composants, fils et coudes, avec une marge — plus rien n'est rogné.
   */
  exportSvg(): string {
    return this.buildSvg(null);
  }

  /** Construit le SVG du schéma entier (only = null) ou d'une sélection. */
  private buildSvg(only: Set<string> | null): string {
    const serializer = new XMLSerializer();
    const parts: string[] = [];
    let idSeq = 0; // identifiants uniques de groupe (scoping CSS)
    const MARGIN = 30;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x: number, y: number): void => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    // Les platines d'essai sont dessinées en premier (donc derrière) : sans cela
    // une breadboard ajoutée après un composant passait devant lui dans le SVG.
    const order = [...this.rendered.values()].sort(
      (a, b) =>
        (partDef(a.part.type).kind === 'breadboard' ? 0 : 1) -
        (partDef(b.part.type).kind === 'breadboard' ? 0 : 1)
    );
    for (const r of order) {
      if (only && !only.has(r.part.id)) continue; // export limité à la sélection
      const root = r.el.shadowRoot ?? r.el;
      const svgEl = root.querySelector('svg');
      const x = r.part.x;
      const y = r.part.y;
      // Taille d'affichage en unités monde. On lit la mise en page du corps (div
      // bloc, fiable) ; certains éléments @wokwi ont un SVG en millimètres dont
      // l'offsetWidth de l'hôte peut valoir 0 — d'où le repli sur la boîte écran
      // convertie comme les broches (et plus jamais sur la valeur brute en mm,
      // qui rendait la carte minuscule).
      const bodyEl = (r.container.querySelector('.part__body') as HTMLElement | null) ?? r.el;
      let w = bodyEl.offsetWidth;
      let h = bodyEl.offsetHeight;
      if (!w || !h) {
        const rect = bodyEl.getBoundingClientRect();
        const tl = this.canvasPoint(rect.left, rect.top);
        const br = this.canvasPoint(rect.right, rect.bottom);
        w = w || Math.abs(br.x - tl.x) || 80;
        h = h || Math.abs(br.y - tl.y) || 60;
      }
      const deg = r.part.rotation ?? 0;

      // Boîte englobante tournée pour le cadrage (coins pivotés autour du centre).
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      for (const [px, py] of [
        [x, y], [x + w, y], [x + w, y + h], [x, y + h],
      ] as Array<[number, number]>) {
        grow(cx + (px - cx) * cos - (py - cy) * sin, cy + (px - cx) * sin + (py - cy) * cos);
      }

      let inner: string;
      if (svgEl) {
        const clone = svgEl.cloneNode(true) as SVGSVGElement;
        // Taille/origine intrinsèques (viewBox) pour calculer la mise à l'échelle
        // vers la taille d'affichage (w×h) à la position (x, y).
        const vb = svgEl.viewBox?.baseVal;
        const vbW = (vb?.width || svgEl.width?.baseVal?.value || w) || w;
        const vbH = (vb?.height || svgEl.height?.baseVal?.value || h) || h;
        const vbX = vb?.x || 0;
        const vbY = vb?.y || 0;
        const sx = w / vbW;
        const sy = h / vbH;
        const groupId = `kpart-${idSeq++}`;
        // Le composant est exporté comme un <g> (éditable comme un groupe dans
        // Inkscape) et non plus un <svg> imbriqué (sous-document non éditable).
        // Les styles du shadow DOM (tailles de police…) sont réinjectés mais
        // SCOPÉS au groupe, sinon ils s'appliqueraient à tout le document.
        const css = collectShadowCss(root);
        const styleTag = css ? `<style>${scopeSvgCss(css, '#' + groupId)}</style>` : '';
        const body = serializer
          .serializeToString(clone)
          .replace(/^\s*<svg[^>]*>/i, '')
          .replace(/<\/svg>\s*$/i, '');
        inner =
          `<g id="${groupId}" transform="translate(${x - vbX * sx} ${y - vbY * sy}) scale(${sx} ${sy})">` +
          styleTag +
          body +
          `</g>`;
      } else {
        // Repli : composant sans SVG → rectangle étiqueté, pour ne rien perdre.
        const label = t(partDef(r.part.type).label).replace(/[<&>]/g, '');
        inner =
          `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#888" ` +
          `stroke="#444"/><text x="${x + w / 2}" y="${y + h / 2}" font-size="10" ` +
          `fill="#fff" text-anchor="middle" font-family="sans-serif">${label}</text></g>`;
      }
      parts.push(deg ? `<g transform="rotate(${deg} ${cx} ${cy})">${inner}</g>` : inner);
    }

    const wires: string[] = [];
    for (const wire of this.diagram.wires) {
      if (wire.auto) continue; // fils implicites d'enfichage : non dessinés
      // Export de sélection : uniquement les fils entièrement dans la sélection.
      if (only && !(only.has(wire.a.partId) && only.has(wire.b.partId))) continue;
      const a = this.hotspotCenter(wire.a);
      const b = this.hotspotCenter(wire.b);
      if (!a || !b) continue;
      const pts = [a, ...(wire.points ?? []), b];
      for (const p of pts) grow(p.x, p.y);
      wires.push(
        `<path d="${roundedWirePath(pts)}" fill="none" stroke="${dupontHex(wire.color ?? 'green')}" ` +
          `stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }

    // Atelier vide : cadre par défaut plutôt qu'un viewBox dégénéré.
    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 400;
      maxY = 300;
    }
    const vx = Math.floor(minX - MARGIN);
    const vy = Math.floor(minY - MARGIN);
    const vw = Math.ceil(maxX - minX + 2 * MARGIN);
    const vh = Math.ceil(maxY - minY + 2 * MARGIN);

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" ` +
        `viewBox="${vx} ${vy} ${vw} ${vh}">`,
      `<!-- Schéma exporté par Kablix -->`,
      ...parts,
      ...wires,
      `</svg>`,
    ].join('\n');
  }
}

/**
 * Couleur de fond d'un bouton de sélection de couleur de composant. Les noms
 * usuels sont des couleurs CSS valides ; quelques cas particuliers (ex. « GYR »
 * de la barre de LED) sont rendus par un dégradé représentatif.
 */
function colorSwatchBackground(value: string): string {
  switch (value) {
    case 'GYR':
      return 'linear-gradient(90deg, #3c3 0 33%, #fd3 33% 66%, #e33 66%)';
    case 'white':
      return '#fafafa';
    default:
      return value; // red, green, blue, yellow, orange, purple, black… = couleurs CSS
  }
}

/**
 * Nom de broche affiché à l'utilisateur. Pour les LED, la cathode (broche 'C'
 * de @wokwi/elements) est montrée « K » selon l'usage électronique (Anode /
 * Katode). Pour un potentiomètre, les broches @wokwi GND/SIG/VCC ne sont pas de
 * l'alimentation : les extrémités du rail résistif sont montrées « 1 » et « 2 »,
 * le curseur « V » (Variable). L'identifiant interne reste inchangé (simulation).
 */
function pinDisplayName(kind: string, pinName: string, type?: string): string {
  // Clavier matriciel : lignes R{n} → « L{n} » (Ligne), colonnes C{n} inchangées.
  // La lettre des lignes est traduite (R en anglais, L en français).
  if (type === 'keypad') {
    const r = /^R(\d+)$/.exec(pinName);
    if (r) return `${t('R')}${r[1]}`;
  }
  // LED RGB : broches R/G/B affichées avec l'initiale de la couleur traduite
  // (RGB en anglais → RVB en français : Red/Green/Blue → Rouge/Vert/Bleu).
  if (kind === 'rgb-led') {
    if (pinName === 'R') return t('Red').charAt(0);
    if (pinName === 'G') return t('Green').charAt(0);
    if (pinName === 'B') return t('Blue').charAt(0);
  }
  // Cathode notée « K » sur toutes les diodes : LED (C) et barre de LED (C1..C10).
  if (kind === 'led' && pinName === 'C') return 'K';
  if (kind === 'led-bar') {
    const m = /^C(\d+)$/.exec(pinName);
    if (m) return `K${m[1]}`;
  }
  if (kind === 'potentiometer') {
    if (pinName === 'GND') return '1';
    if (pinName === 'VCC') return '2';
    if (pinName === 'SIG') return 'V';
  }
  return pinName;
}

/**
 * Restreint des règles CSS à un sélecteur racine (id du groupe). Nécessaire car,
 * une fois sorti du shadow DOM et placé dans un `<g>`, le CSS s'appliquerait à
 * tout le document SVG (et un composant teinterait les autres). `:host` est
 * traduit en sélecteur du groupe lui-même. Les @keyframes/@font-face sont
 * laissées intactes ; @media/@supports sont scopées récursivement.
 */
function scopeSvgCss(css: string, scope: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith('@')) {
      if (/^@(media|supports)/i.test(prelude)) out += `${prelude}{${scopeSvgCss(body, scope)}}`;
      else out += `${prelude}{${body}}`; // keyframes, font-face : inchangé
    } else {
      const scoped = prelude
        .split(',')
        .map((sel) => {
          const s = sel.trim();
          if (!s) return s;
          if (s.includes(':host')) return s.replace(/:host(\([^)]*\))?/g, (_m, p) => scope + (p ? p.slice(1, -1) : ''));
          return `${scope} ${s}`;
        })
        .filter(Boolean)
        .join(', ');
      if (scoped) out += `${scoped}{${body}}`;
    }
    i = j;
  }
  return out;
}

/**
 * Récupère le CSS d'un shadow root (feuilles adoptées par Lit + balises
 * <style>) pour le réinjecter dans le SVG exporté — sinon les règles de style
 * (tailles de police…) sont perdues et les textes deviennent géants.
 */
function collectShadowCss(root: ShadowRoot | HTMLElement): string {
  let css = '';
  const adopted = (root as ShadowRoot).adoptedStyleSheets;
  if (adopted) {
    for (const sheet of adopted) {
      try {
        for (const rule of sheet.cssRules) css += rule.cssText + '\n';
      } catch {
        // feuille d'une autre origine : ignorée
      }
    }
  }
  root.querySelectorAll?.('style').forEach((s) => {
    css += (s.textContent ?? '') + '\n';
  });
  return css;
}

// --- Valeurs avec suffixes SI (résistances…) ----------------------------------
const SI_MULT: Record<string, number> = {
  p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9,
};

/** Convertit « 2.2k », « 470 », « 1M5 »→non… une valeur SI en nombre, ou null. */
function parseSiValue(text: string): number | null {
  const m = /^\s*([0-9]*\.?[0-9]+)\s*([pnuµmkKMG]?)\s*$/.exec(text);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;
  return base * (m[2] ? SI_MULT[m[2]] : 1);
}

/** Formate un nombre avec le suffixe SI le plus adapté (2200 → « 2.2k »). */
function formatSiValue(n: number): string {
  if (!Number.isFinite(n)) return '';
  const units: Array<[number, string]> = [
    [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  const abs = Math.abs(n);
  for (const [factor, suffix] of units) {
    if (abs >= factor) {
      const v = n / factor;
      return `${parseFloat(v.toFixed(3))}${suffix}`;
    }
  }
  return String(n);
}

/** Rectangle d'encombrement d'un composant (coordonnées monde). */
interface PartRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Longueur d'un segment **aligné sur un axe** [p,q] qui se trouve à l'intérieur du
 * rectangle r. Sert à mesurer combien un fil « passe par dessus » un composant.
 */
function segRectOverlap(p: XY, q: XY, r: PartRect): number {
  const horizontal = Math.abs(p.y - q.y) <= Math.abs(p.x - q.x);
  if (horizontal) {
    const y = (p.y + q.y) / 2;
    if (y < r.y || y > r.y + r.h) return 0;
    return Math.max(0, Math.min(Math.max(p.x, q.x), r.x + r.w) - Math.max(Math.min(p.x, q.x), r.x));
  }
  const x = (p.x + q.x) / 2;
  if (x < r.x || x > r.x + r.w) return 0;
  return Math.max(0, Math.min(Math.max(p.y, q.y), r.y + r.h) - Math.max(Math.min(p.y, q.y), r.y));
}

/** Axe d'un segment aligné : 'h' (horizontal), 'v' (vertical) ou null (diagonale). */
function segAxis(a: XY, b: XY): 'h' | 'v' | null {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dy <= 0.5 && dx > 0.5) return 'h';
  if (dx <= 0.5 && dy > 0.5) return 'v';
  return null;
}

/** Longueur de recouvrement de deux segments COLINÉAIRES (même axe, même ligne),
 *  sinon 0 — deux fils qui se chevauchent. */
function collinearOverlap(a: XY, b: XY, c: XY, d: XY): number {
  const ax = segAxis(a, b);
  if (!ax || ax !== segAxis(c, d)) return 0;
  if (ax === 'h') {
    if (Math.abs(a.y - c.y) > 0.5) return 0;
    return Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
  }
  if (Math.abs(a.x - c.x) > 0.5) return 0;
  return Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
}

/** Pénalité de proximité de deux segments PARALLÈLES distincts plus proches que
 *  `gap` et dont les projections se recouvrent : (gap − écart), sinon 0. */
function parallelPenalty(a: XY, b: XY, c: XY, d: XY, gap: number): number {
  const ax = segAxis(a, b);
  if (!ax || ax !== segAxis(c, d)) return 0;
  if (ax === 'h') {
    const off = Math.abs(a.y - c.y);
    if (off <= 0.5 || off >= gap) return 0;
    const ov = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    return ov > 1 ? gap - off : 0;
  }
  const off = Math.abs(a.x - c.x);
  if (off <= 0.5 || off >= gap) return 0;
  const ov = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
  return ov > 1 ? gap - off : 0;
}

/** Coût d'une polyligne vis-à-vis des segments d'autres fils : longueur totale de
 *  chevauchement colinéaire + somme des pénalités de proximité (< gap). */
function polylineWireCost(pts: XY[], segs: Array<[XY, XY]>, gap: number): { overlap: number; near: number } {
  let overlap = 0;
  let near = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    for (const [c, d] of segs) {
      overlap += collinearOverlap(pts[i], pts[i + 1], c, d);
      near += parallelPenalty(pts[i], pts[i + 1], c, d, gap);
    }
  }
  return { overlap, near };
}

/** Longueur totale d'une polyligne (segments H/V) recouvrant les rectangles. */
function polylineRectOverlap(pts: XY[], rects: PartRect[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    for (const r of rects) total += segRectOverlap(pts[i], pts[i + 1], r);
  }
  return total;
}

/** Retire les points colinéaires/doublons consécutifs d'une polyligne H/V. */
function collapseColinear(pts: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of pts) {
    const n = out.length;
    if (n >= 1 && Math.abs(out[n - 1].x - p.x) < 0.5 && Math.abs(out[n - 1].y - p.y) < 0.5) continue;
    if (n >= 2) {
      const a = out[n - 2];
      const b = out[n - 1];
      const colX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5;
      const colY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5;
      if (colX || colY) {
        out[n - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/**
 * Routeur orthogonal **A\*** sur un graphe de Hanan. Les lignes de coordonnées
 * candidates viennent des deux extrémités, des bords des obstacles (gonflés de la
 * clearance) et de voies décalées (multiples de `gap` autour de la médiane) pour
 * contourner les fils existants. Le coût d'un tracé = longueur + pénalité de
 * chevauchement/proximité d'autres fils + pénalité par changement de direction
 * (`bend`). Renvoie la liste des coudes de `pa` à `pb` (inclus), ou `null` si
 * aucun chemin n'existe (l'appelant retombe alors sur un coude en L).
 */
function astarRoute(
  pa: XY,
  pb: XY,
  obstacles: PartRect[],
  otherSegs: Array<[XY, XY]>,
  o: { clr: number; bend: number; gap: number },
): XY[] | null {
  const { clr, bend, gap } = o;
  // Rectangles gonflés de la clearance : zones interdites de passage.
  const blocks = obstacles.map((r) => ({ x: r.x - clr, y: r.y - clr, w: r.w + 2 * clr, h: r.h + 2 * clr }));
  // Lignes de coordonnées (Hanan) : extrémités + bords des obstacles + voies
  // décalées autour de la médiane (pour s'écarter d'un fil aligné).
  const midX = (pa.x + pb.x) / 2;
  const midY = (pa.y + pb.y) / 2;
  const xsSet = new Set<number>([pa.x, pb.x]);
  const ysSet = new Set<number>([pa.y, pb.y]);
  for (const b of blocks) {
    xsSet.add(b.x);
    xsSet.add(b.x + b.w);
    ysSet.add(b.y);
    ysSet.add(b.y + b.h);
  }
  for (let k = -3; k <= 3; k++) {
    xsSet.add(midX + k * gap);
    ysSet.add(midY + k * gap);
  }
  const xs = [...xsSet].sort((m, n) => m - n);
  const ys = [...ysSet].sort((m, n) => m - n);
  const ny = ys.length;
  const ai = xs.indexOf(pa.x);
  const aj = ys.indexOf(pa.y);
  const bi = xs.indexOf(pb.x);
  const bj = ys.indexOf(pb.y);
  if (ai < 0 || aj < 0 || bi < 0 || bj < 0) return null;

  // Un segment [p,q] aligné traverse-t-il l'intérieur d'un bloc ? (test au milieu :
  // valide car aucun bord d'obstacle ne tombe entre deux lignes consécutives.)
  const blocked = (p: XY, q: XY): boolean => {
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    for (const b of blocks) {
      if (mx > b.x + 0.5 && mx < b.x + b.w - 0.5 && my > b.y + 0.5 && my < b.y + b.h - 0.5) return true;
    }
    return false;
  };
  // Pénalité « fils » d'un segment (chevauchement colinéaire + proximité parallèle).
  const wireCost = (p: XY, q: XY): number => {
    let c = 0;
    for (const [s, t] of otherSegs) {
      c += collinearOverlap(p, q, s, t) * 6;
      c += parallelPenalty(p, q, s, t, gap) * 0.6;
    }
    return c;
  };
  const heur = (i: number, j: number): number => Math.abs(xs[i] - pb.x) + Math.abs(ys[j] - pb.y);

  // A* : état = nœud × direction (0 = horizontal, 1 = vertical, 2 = départ).
  interface St {
    i: number;
    j: number;
    dir: number;
    g: number;
    f: number;
    prev: St | null;
  }
  const keyOf = (i: number, j: number, dir: number): number => (i * ny + j) * 3 + dir;
  const bestG = new Map<number, number>();
  // Tas binaire min sur f.
  const heap: St[] = [];
  const push = (s: St): void => {
    heap.push(s);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p].f <= heap[c].f) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = (): St => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };

  push({ i: ai, j: aj, dir: 2, g: 0, f: heur(ai, aj), prev: null });
  const steps: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (heap.length > 0) {
    const cur = pop();
    if (cur.i === bi && cur.j === bj) {
      const pts: XY[] = [];
      for (let s: St | null = cur; s; s = s.prev) pts.push({ x: xs[s.i], y: ys[s.j] });
      pts.reverse();
      return collapseColinear(pts);
    }
    const ck = keyOf(cur.i, cur.j, cur.dir);
    if (bestG.has(ck) && (bestG.get(ck) as number) < cur.g - 0.01) continue;
    for (const [di, dj] of steps) {
      const ni = cur.i + di;
      const nj = cur.j + dj;
      if (ni < 0 || ni >= xs.length || nj < 0 || nj >= ny) continue;
      const p = { x: xs[cur.i], y: ys[cur.j] };
      const q = { x: xs[ni], y: ys[nj] };
      if (blocked(p, q)) continue;
      const dir = di !== 0 ? 0 : 1;
      const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      const g = cur.g + len + wireCost(p, q) + (cur.dir !== 2 && cur.dir !== dir ? bend : 0);
      const nk = keyOf(ni, nj, dir);
      const prev = bestG.get(nk);
      if (prev !== undefined && prev <= g + 0.01) continue;
      bestG.set(nk, g);
      push({ i: ni, j: nj, dir, g, f: g + heur(ni, nj), prev: cur });
    }
  }
  return null;
}

/** Distance d'un point à un segment [a,b]. */
function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
