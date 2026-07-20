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
  migratePartAttrs,
  partCategory,
  partDef,
  pca9685AddressText,
  pinElectricalRole,
  registerCustomPart,
  setSimModelPresets,
  unregisterCustomPart,
  type CustomPartData,
  type PartDef,
  type PropDef,
  type SimModelPreset,
} from './catalog.mjs';
import { breadboardPins, normalizeSize, stripOfPin } from './breadboard.mjs';
import { groveSocketPins } from './grove-shield.mjs';
import { internalWiringSvg, type PinPoint } from './internal-wiring.mjs';
import { pinoutSvg, pinoutPoster } from './pinout.mjs';
import { BOARD_W, BOARD_H } from '../composants/pico-board.mjs';
import { nameEquipotentials, type Diagram, type Endpoint, type Part, type Wire } from './model.mjs';
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
/** Remise par px de tracé couché sur un fil de la MÊME équipotentielle (autoroutage) :
 *  suivre la dorsale coûte (1 − RIDE) = 25 % de la longueur — le recouvrement
 *  même-net est PRÉFÉRÉ, l'embranchement se fait au plus près de la broche. */
const RIDE = 0.75;
/** Dimensions de la feuille de dessin (px monde) : origine (0,0) = coin
 * haut-gauche, centre = (SHEET_W/2, SHEET_H/2). Finie pour que « centrer la
 * feuille » ait un sens (bords jaunes visibles en vue ajustée). */
const SHEET_W = 4000;
const SHEET_H = 3000;
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
export const KABLIX_BADGE =
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
  /** Appelé quand les préréglages de modèles de simulation changent (persistance). */
  onSimModelsChange: ((models: SimModelPreset[]) => void) | null = null;
  /** Appelé quand le tri de la palette ou les derniers utilisés changent. */
  onPaletteStateChange: ((state: PaletteState) => void) | null = null;
  /** Appelé à l'ajout d'un composant (pose ou glisser-déposer) — sélection auto de la carte. */
  onPartAdded: ((part: Part) => void) | null = null;
  /** Appelé pour ouvrir un lien externe (doc Wokwi d'un composant). */
  onOpenExternal: ((url: string) => void) | null = null;
  /** Appelé pour ouvrir l'aide locale d'un composant (fiche docs/composants/<type>.md). */
  onComponentHelp: ((type: string) => void) | null = null;
  /**
   * Appelé quand la sélection change : `schema` indique si le composant
   * sélectionné dispose d'un câblage interne ou d'un poster de brochage (pour
   * activer le bouton ☢ de la barre d'outils), et `shown` s'il est affiché.
   */
  onSelectionChange: ((info: { partId: string | null; schema: boolean; shown: boolean }) => void) | null = null;
  /** Appelé quand une action d'ÉDITION est tentée pendant la simulation (verrouillé). */
  onBlockedEdit: (() => void) | null = null;

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
  /** Surbrillance « fourmis » des fils sélectionnés (groupe de 2 tracés pointillés). */
  private wireAnts = new Map<string, SVGGElement>();
  /** Points d'embranchement (jonctions en T des fils d'une même équipotentielle). */
  private junctionsG: SVGGElement | null = null;
  private junctionsQueued = false;
  private pending: PendingWire | null = null;
  private tempPath: SVGPathElement | null = null;
  /** Bulle de nom de broche affichée pendant le câblage (showPinBubble). */
  private pinBubble: HTMLDivElement | null = null;
  private selection: Selection = null;
  /** Composants sélectionnés (sélection multiple : marquee, Ctrl+clic). */
  private selectedParts = new Set<string>();
  /** Câbles sélectionnés (Ctrl+clic sur les fils) — suppression groupée. */
  private selectedWires = new Set<string>();
  /** Coudes sélectionnés du fil courant (Ctrl+clic / marquee) — déplacement groupé. */
  private selectedHandles = new Set<number>();
  private colorIndex = 0;
  private customData = new Map<string, CustomPartData>();
  private creator = ((): PartCreator => {
    const c = new PartCreator((data) => this.saveCustomPart(data));
    c.onModelsChange = (models) => this.onSimModelsChange?.(models);
    c.onOpenExternal = (url) => this.onOpenExternal?.(url);
    return c;
  })();
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
    sheet.style.width = `${SHEET_W}px`;
    sheet.style.height = `${SHEET_H}px`;
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
      // Aligne les broches sur la grille (après rendu : les broches Lit
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
    // Le bandeau d'avertissement de la palette a été remplacé par un bandeau
    // permanent entre les barres d'outils (géré par sim.mts).
    // Bulle des boutons et claviers : « Ctrl+clic… » en simulation, sinon déplacement.
    for (const r of this.rendered.values()) {
      if (this.isLockable(r.part.type)) {
        const b = r.container.querySelector('.part__body') as HTMLElement | null;
        if (b) b.title = this.buttonTitle(r.part.type);
      }
      // L'attribut `simulating` est posé sur TOUS les composants pendant la
      // simulation : ceux qui le déclarent adaptent leur rendu (contrôles de
      // simulation des capteurs, segments éteints assombris du 7 segments…),
      // les autres l'ignorent.
      (r.el as unknown as HTMLElement).toggleAttribute('simulating', locked);
      // Contrôles de simulation (curseur/bouton dans le composant) : le composant
      // passe aussi par-dessus voisins et fils (z-index), sinon son curseur peut
      // se retrouver caché par un composant posé après lui ou par un fil qui le
      // traverse (les fils sont normalement au-dessus des composants en édition).
      if (partDef(r.part.type).simControl) {
        r.container.classList.toggle('part--sim-active', locked);
      }
    }
  }

  /** Composant dont une touche/un bouton se verrouille au Ctrl+clic (BP, clavier, joystick). */
  private isLockable(type: string): boolean {
    return partDef(type).kind === 'pushbutton' || type === 'keypad' || type === 'joystick';
  }

  /** Bulle d'aide d'un bouton selon l'état : simulation = Ctrl+clic, sinon déplacement. */
  private buttonTitle(type?: string): string {
    if (!this.locked) return t('Right-click drag to move');
    return type === 'joystick'
      ? t('Ctrl+click to lock the position')
      : t('Ctrl+click to lock the unstable state');
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
    // clientLeft/Top : bordure du canvas, même repère que canvasPoint.
    const cx = e.clientX - rect.left - this.canvas.clientLeft;
    const cy = e.clientY - rect.top - this.canvas.clientTop;
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

  /**
   * Boîte englobante du contenu (composants + coudes de fils) en coordonnées
   * monde, ou `null` si l'atelier est vide. Sert au recentrage (resetView/fitView).
   */
  private contentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
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
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }

  /** Centre `(wx, wy)` (monde) dans la zone utile (sous les barres) au zoom courant. */
  private centerOn(wx: number, wy: number): void {
    const topInset = 56;
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;
    this.panX = cw / 2 - wx * this.zoom;
    this.panY = (ch + topInset) / 2 - wy * this.zoom;
    this.applyTransform();
  }

  /**
   * Retour à 100 %, centré sur le dessin (comme « recentrer » mais sans ajuster
   * le zoom). Atelier vide → centre la feuille de dessin dans la zone utile.
   */
  private resetView(): void {
    this.zoom = 1;
    const b = this.contentBounds();
    if (b) this.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    else this.centerOn(SHEET_W / 2, SHEET_H / 2);
  }

  /** Déplacement de la vue à la souris (bouton central), en pixels écran. */
  private startPan(e: PointerEvent): void {
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = this.panX;
    const oy = this.panY;
    // Capture du pointeur : le pointerup est délivré même relâché hors de la
    // fenêtre (sinon le pan restait « collé » au curseur, impossible à lâcher).
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointeur déjà disparu : le filet `buttons` ci-dessous suffit */
    }
    const end = (): void => {
      if (this.canvas.hasPointerCapture?.(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
    };
    const move = (ev: PointerEvent): void => {
      // Filet de sécurité : bouton central plus tenu (pointerup raté — sortie
      // de fenêtre, perte de focus, menu…) → on termine le pan ici.
      if ((ev.buttons & 4) === 0) {
        end();
        return;
      }
      this.panX = ox + (ev.clientX - startX);
      this.panY = oy + (ev.clientY - startY);
      this.applyTransform();
    };
    const up = (ev: PointerEvent): void => {
      if (ev.button === 1) end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
  }

  /**
   * Recentre et ajuste le zoom pour que tout le schéma (composants, coudes de
   * fils) tienne dans la zone visible, avec une marge. Atelier vide → vue 100%.
   */
  fitView(): void {
    const b = this.contentBounds();
    if (!b) {
      this.resetView();
      return;
    }
    const { minX, minY, maxX, maxY } = b;
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
        for (const c of CATEGORY_ORDER) {
          if (CATALOG.some((d) => partCategory(d) === c) || customs.some((d) => d.custom?.category === c)) {
            presentKeys.push(c);
          }
        }
        if (customs.some((d) => !CATEGORY_ORDER.includes(d.custom?.category ?? ''))) presentKeys.push('custom');
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
        // Composants personnalisés ASSIGNÉS à cette catégorie (liste du créateur) :
        // rangés avec les intégrés, en gardant leur ligne à boutons (✎/⇩/✕).
        const cust = customs.filter((d) => d.custom?.category === category).sort(byLabel);
        if (defs.length + cust.length === 0) continue;
        this.paletteSection(t(category), category);
        for (const def of defs) this.palette.appendChild(this.paletteButton(def, false));
        for (const def of cust) this.appendCustomRow(def);
      }
      // Sans catégorie assignée : section « Composants personnalisés » comme avant.
      const uncat = customs.filter((d) => !CATEGORY_ORDER.includes(d.custom?.category ?? ''));
      if (uncat.length > 0) {
        this.paletteSection(t('Custom parts'), 'custom');
        for (const def of [...uncat].sort(byLabel)) this.appendCustomRow(def);
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
      // Vue interne optionnelle (schéma) et son calage sur le dessin externe.
      innerSvg: typeof data.innerSvg === 'string' && data.innerSvg.includes('<svg') ? data.innerSvg : undefined,
      innerOffset:
        typeof data.innerOffset?.x === 'number' && typeof data.innerOffset?.y === 'number'
          ? data.innerOffset
          : undefined,
      extAnchor: data.extAnchor,
      intAnchor: data.intAnchor,
      // Paramètres de définition et contrôle de simulation (validation légère).
      params: Array.isArray(data.params)
        ? data.params.filter(
            (p) => typeof p?.name === 'string' && /^[A-Za-z_]\w*$/.test(p.name) && typeof p?.value === 'number'
          )
        : undefined,
      control:
        data.control?.type === 'slider' || data.control?.type === 'switch' ? data.control : undefined,
      // Catégorie : seulement une clé connue de la palette (sinon ignorée).
      category:
        typeof data.category === 'string' && CATEGORY_ORDER.includes(data.category)
          ? data.category
          : undefined,
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

  /** Recharge les préréglages de modèles de simulation persistés. */
  loadSimModels(models: SimModelPreset[]): void {
    setSimModelPresets(Array.isArray(models) ? models : []);
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

  /** Décale un composant pour que sa première broche tombe sur la grille.
   *  `silent` : pas d'entrée d'historique (recollages internes en lot). */
  private snapPartToGrid(partId: string, silent = false): void {
    const off = this.gridOffset(partId);
    const r = this.rendered.get(partId);
    if (!off || !r) return;
    r.part.x = Math.max(0, snapToGrid(r.part.x + off.x) - off.x);
    r.part.y = Math.max(0, snapToGrid(r.part.y + off.y) - off.y);
    r.container.style.left = `${r.part.x}px`;
    r.container.style.top = `${r.part.y}px`;
    this.redrawWires();
    if (!silent) this.notify();
  }

  removePart(id: string): void {
    this.diagram.wires = this.diagram.wires.filter((w) => {
      if (w.a.partId === id || w.b.partId === id) {
        this.dropWirePath(w.id);
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
    for (const g of this.wireAnts.values()) g.remove();
    this.wireAnts.clear();
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
    // Réalignement doux après rendu : les schémas enregistrés AVANT le re-snap
    // de rotation (v2026.7.105) peuvent porter des composants tournés dont les
    // broches sont à quelques px de la grille — on les recolle au chargement
    // (déplacement ≤ 5 px par définition du snap, les coudes ne bougent pas).
    // Passes au settle (rAF, recollage immédiat sans à-coup visible) PLUS
    // balayages différés par minuterie : la taille d'un dessin Lit peut encore
    // bouger après les frames du settle (police chargée tard → le gap sous le
    // dessin change, le centre de rotation avec), les rAF seuls rataient le
    // recollage d'un composant tourné à 0,5 px près.
    this.snapSettleLeft = 8;
    for (const ms of [120, 350, 800]) {
      setTimeout(() => {
        for (const id of [...this.rendered.keys()]) this.snapPartToGrid(id, true);
      }, ms);
    }
    const idMap = new Map<string, string>();
    for (const p of data.parts ?? []) {
      const np: Part = { ...p, id: uid(`${p.type}-`), attrs: migratePartAttrs(p) };
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
    // LED RGB : chaque canal prend d'office la couleur qu'il pilote
    // (R → rouge, G → vert, B → bleu), plus lisible pour les élèves.
    const rgb = this.rgbLedChannelColor(a) ?? this.rgbLedChannelColor(b);
    if (rgb) return rgb;
    // Un fil branché sur le même point qu'un fil existant reprend sa couleur
    // (même nœud électrique → même couleur de nappe, plus lisible).
    const inherited = this.inheritedColor(a, b);
    if (inherited) return inherited;
    return this.nextColor();
  }

  /** Couleur du canal d'une LED RGB ('red'/'green'/'blue') si la broche en est un, sinon null. */
  private rgbLedChannelColor(e: Endpoint): string | null {
    const part = this.diagram.parts.find((p) => p.id === e.partId);
    if (!part || partDef(part.type).kind !== 'rgb-led') return null;
    if (e.pin === 'R') return 'red';
    if (e.pin === 'G') return 'green';
    if (e.pin === 'B') return 'blue';
    return null;
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
    if (def.kind === 'mcu' || def.kind === 'breadboard' || def.kind === 'grove-shield') {
      container.classList.add('part--under-wires');
    }
    // Le Grove Shield descend d'un cran de plus (z=0) : la Pico (mcu, z=1)
    // enfichée dessus doit rester visible par-dessus le shield.
    if (def.kind === 'grove-shield') container.classList.add('part--shield');
    // Trous serrés (pas de 10 px) : pastilles réduites pour rester cliquables.
    if (def.kind === 'breadboard' || def.kind === 'grove-shield') container.classList.add('part--dense');
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
      if (this.locked) {
        // Simulation : on laisse réagir les composants interactifs / à contrôle de
        // simulation ; un clic gauche « d'édition » sur un composant passif est
        // interdit → clignotement du message de simulation près du curseur.
        if (e.button === 0 && !def.interactive && !def.simControl) this.onBlockedEdit?.();
        return;
      }
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
      body.title = this.isLockable(part.type) ? this.buttonTitle(part.type) : t('Right-click drag to move');
    }
    // Grove Shield : le clic sur l'interrupteur 3V3/5V du dessin change l'attr
    // `pwr` de l'élément et émet `pwr-change` → on persiste dans le schéma (la
    // netlist suit le rail VCC) et on resynchronise l'inspecteur s'il est ouvert.
    if (def.kind === 'grove-shield') {
      el.addEventListener('pwr-change', () => {
        part.attrs = { ...part.attrs, pwr: el.getAttribute('pwr') ?? '3v3' };
        if (this.selection?.kind === 'part' && this.selection.id === part.id) {
          this.renderPartInspector(part.id);
        }
        this.notify();
      });
    }

    const hotspots = new Map<string, HTMLDivElement>();
    const pins = this.partPins(el);
    const anchor: XY = pins[0] ? { x: pins[0].x, y: pins[0].y } : { x: 0, y: 0 };
    for (const pin of pins) {
      const dot = this.makeHotspot(part.id, part.type, def.kind, pin, anchor, part.attrs);
      body.appendChild(dot);
      hotspots.set(pin.name, dot);
    }

    // Le bouton ☢ (afficher le câblage interne / poster de brochage) n'est plus
    // par-composant : il est désormais dans la barre d'outils droite et agit sur
    // le composant SÉLECTIONNÉ qui en dispose (cf. toggleSelectedSchema + panel.ts).

    this.rendered.set(part.id, { part, container, el, hotspots });
    // Restaure le câblage interne / le poster de brochage après un re-rendu
    // (rotation…), s'il est activé ET que le composant est sélectionné.
    if (this.internalShown.has(part.id) && this.isSelected(part.id)) this.renderInternalWiring(part.id);
    if (this.pinoutShown.has(part.id) && this.isSelected(part.id)) this.renderPinout(part.id);
    this.redrawWires();
    this.scheduleSettle();
  }

  /** Liste des broches d'un composant, telles que publiées par son `pinInfo`. */
  private partPins(el: WokwiElement): WokwiPin[] {
    return (el.pinInfo ?? []) as WokwiPin[];
  }

  /**
   * Position px (repère corps) d'une broche : calage automatique sur la grille
   * relativement à la 1re broche. Les forks retouchés publient des `pinInfo`
   * déjà en px finaux sur la grille (le calage relatif les laisse inchangés).
   */
  private pinPos(type: string, _kind: string, pin: WokwiPin, anchor: XY): XY {
    const k = partDef(type).pinScale ?? 1;
    return {
      x: snapPinTo(pin.x * k, anchor.x * k),
      y: snapPinTo(pin.y * k, anchor.y * k),
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
    attrs?: Record<string, string>
  ): HTMLDivElement {
    const dot = document.createElement('div');
    dot.className = 'pin';
    // Pastilles d'alimentation reconnaissables : rouge (VCC) / noir (GND). Le
    // potentiomètre est exclu : ses extrémités ne sont pas des broches power.
    // L'alim de laboratoire aussi : ses prises banane sont DÉJÀ dessinées
    // rouge/noire (les rôles restent actifs pour la couleur auto des fils).
    const role = kind === 'potentiometer' ? 'other' : pinElectricalRole(type, pin.name);
    if (type !== 'alim') {
      if (role === 'vcc') dot.classList.add('pin--vcc');
      else if (role === 'gnd') dot.classList.add('pin--gnd');
    }
    const pos = this.pinPos(type, kind, pin, anchor);
    dot.style.left = `${pos.x}px`;
    dot.style.top = `${pos.y}px`;
    dot.title = pinDisplayName(kind, pin.name, type, attrs);
    dot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onPinDown({ partId, pin: pin.name }, e);
    });
    dot.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.onPinUp({ partId, pin: pin.name }, e);
    });
    // Pendant un câblage en cours, le tooltip natif (title) ne s'affiche pas
    // (bouton enfoncé) ou trop tard : bulle maison instantanée sur la broche
    // visée, en plus du halo jaune du survol.
    dot.addEventListener('pointerenter', () => this.showPinBubble(dot, { partId, pin: pin.name }));
    dot.addEventListener('pointerleave', () => this.hidePinBubble());
    return dot;
  }

  /** Bulle de nom instantanée sur la broche visée pendant le câblage. */
  private showPinBubble(dot: HTMLDivElement, endpoint: Endpoint): void {
    if (!this.pending || this.locked) return;
    this.hidePinBubble();
    const p = this.hotspotCenter(endpoint);
    if (!p) return;
    const part = this.diagram.parts.find((q) => q.id === endpoint.partId);
    if (!part) return;
    const bubble = document.createElement('div');
    bubble.className = 'pin-bubble';
    bubble.textContent = pinDisplayName(partDef(part.type).kind, endpoint.pin, part.type, part.attrs);
    bubble.style.left = `${p.x}px`;
    bubble.style.top = `${p.y - 9}px`;
    this.world.appendChild(bubble);
    this.pinBubble = bubble;
    // Le title natif se tait le temps de la bulle (sinon doublon en mode clic-à-clic).
    if (dot.title) {
      dot.dataset.savedTitle = dot.title;
      dot.title = '';
    }
  }

  private hidePinBubble(): void {
    this.pinBubble?.remove();
    this.pinBubble = null;
    for (const d of this.world.querySelectorAll<HTMLElement>('[data-saved-title]')) {
      d.title = d.dataset.savedTitle ?? '';
      delete d.dataset.savedTitle;
    }
  }

  /**
   * Resynchronise les pastilles de broche d'un composant avec son `pinInfo`
   * courant. Les éléments Lit peuvent ne publier leur `pinInfo` qu'après
   * un cycle de rendu : sans cette resynchronisation, une broche apparue ensuite
   * n'a pas de pastille cliquable (impossible de câbler ce composant) et les fils
   * existants ne trouvent pas leur extrémité.
   */
  private syncHotspots(r: Rendered): void {
    const body = r.container.querySelector('.part__body') as HTMLElement | null;
    if (!body) return;
    const def = partDef(r.part.type);
    const pins = this.partPins(r.el);
    const anchor: XY = pins[0] ? { x: pins[0].x, y: pins[0].y } : { x: 0, y: 0 };
    for (const pin of pins) {
      let dot = r.hotspots.get(pin.name);
      if (!dot) {
        dot = this.makeHotspot(r.part.id, r.part.type, def.kind, pin, anchor, r.part.attrs);
        body.appendChild(dot);
        r.hotspots.set(pin.name, dot);
      } else {
        const pos = this.pinPos(r.part.type, def.kind, pin, anchor);
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
    // Le miroir peut sortir les broches de la grille (boîte mesurée ≠ dessin) :
    // recolle le premier pin de chaque composant retourné sur la grille.
    for (const id of ids) this.snapPartToGrid(id, true);
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
    // La rotation tourne autour du centre de la BOÎTE MESURÉE (gap de mise en
    // page, dimensions impaires) : les broches peuvent quitter la grille de
    // quelques px (constaté : 2 px sur LDR/CTN/CTP/LED à 90°). On recolle donc
    // le premier pin de chaque composant tourné sur la grille.
    for (const id of ids) this.snapPartToGrid(id, true);
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
    // déjà sa grappe), et hors cartes/platines — SAUF la Pico / Pico W, qui
    // s'enfiche sur le socle du Grove Shield (et uniquement là).
    const def2 = partDef(part.type);
    const kind = def2.kind;
    const picoLike = kind === 'mcu' && (def2.board === 'pico' || def2.board === 'picow');
    const pluggable =
      !isGroup && kind !== 'breadboard' && kind !== 'grove-shield' && (kind !== 'mcu' || picoLike);
    const holes = pluggable ? this.collectBreadboardHoles(part.id, picoLike) : [];

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
  /**
   * Trous des supports d'enfichage posés, en coordonnées canvas. Un composant
   * ordinaire s'enfiche sur les platines d'essai ; une Pico / Pico W
   * (`picoSocket`) s'enfiche uniquement sur le SOCLE du Grove Shield (les ports
   * Grove et le connecteur SPI sont des prises femelles : pas d'enfichage).
   */
  private collectBreadboardHoles(excludeId: string, picoSocket = false): BreadboardHole[] {
    const holes: BreadboardHole[] = [];
    const socket = picoSocket ? groveSocketPins() : null;
    for (const r of this.rendered.values()) {
      const kind = partDef(r.part.type).kind;
      if (r.part.id === excludeId) continue;
      if (picoSocket ? kind !== 'grove-shield' : kind !== 'breadboard') continue;
      for (const pin of r.hotspots.keys()) {
        if (socket && !socket.has(pin)) continue;
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
      const support = this.rendered.get(m.hole.partId);
      const set = byBoard.get(m.hole.partId) ?? new Set<string>();
      if (support && partDef(support.part.type).kind === 'grove-shield') {
        // Grove Shield : seul le trou visé s'allume (les bandes internes
        // couvrent toute la carte — rails GND/3V3 —, tout illuminer est illisible).
        set.add(m.hole.pin);
      } else {
        const size = normalizeSize(support?.part.attrs?.size);
        for (const p of stripOfPin(size, m.hole.pin)) set.add(p);
      }
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
    this.hidePinBubble();
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pending || !this.tempPath) return;
    // Aperçu fidèle : le pointillé rejoint le curseur RÉEL. L'aimantation H/V
    // (snapPoint) ne s'applique qu'à la pose du point (addPendingPoint) —
    // appliquée ici, elle écartait le bout du tracé de la souris (jusqu'à
    // ±10° soit des dizaines de px sur un long segment presque axial).
    this.updateTempPath(this.canvasPoint(e.clientX, e.clientY));
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
      if (k === 'a' && !this.locked) {
        e.preventDefault();
        this.selectAllParts();
        return;
      }
    }
    if (this.locked) {
      // Simulation : une touche d'édition (Suppr/Backspace sur une sélection) est
      // interdite → clignotement du message de simulation.
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing &&
          (this.selectedParts.size > 0 || this.selectedWires.size > 0 || this.selection)) {
        this.onBlockedEdit?.();
      }
      return; // pas d'édition du schéma
    }
    if (e.key === 'Escape') {
      this.cancelPending();
      this.select(null);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
      if (this.selectedParts.size > 0) {
        const ids = [...this.selectedParts];
        for (const id of ids) this.removePart(id);
        this.select(null);
      } else if (this.selectedWires.size > 0) {
        // Lot de câbles (Ctrl+clic) : suppression groupée.
        for (const id of [...this.selectedWires]) this.removeWire(id);
        this.selectedWires.clear();
        this.renderInspector();
      } else if (this.selection?.kind === 'wire') {
        // Coude(s) sélectionné(s) : on supprime le lot ; sinon le fil entier.
        if (this.selectedHandles.size > 0 && this.activeHandle?.wireId === this.selection.id) {
          this.removeWirePoints(this.selection.id, [...this.selectedHandles]);
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
      if ((e.ctrlKey || e.metaKey) && !this.locked) {
        this.toggleWireInSelection(wire.id); // Ctrl+clic : lot de câbles
        return;
      }
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
    this.selectedHandles.clear();
    this.clearGuides();
  }

  /** Marque un coude comme sélectionné (supprimable au clavier), met en évidence. */
  private setActiveHandle(wireId: string, index: number): void {
    this.activeHandle = { wireId, index };
    this.selectedHandles = new Set([index]);
    this.refreshHandleClasses();
  }

  /** Ctrl+clic sur un coude : l'ajoute/retire du lot (déplacement/suppression groupés). */
  private toggleHandleInSelection(wireId: string, index: number): void {
    this.activeHandle = { wireId, index };
    if (this.selectedHandles.has(index)) this.selectedHandles.delete(index);
    else this.selectedHandles.add(index);
    this.refreshHandleClasses();
  }

  /** Met la classe « active » sur toutes les poignées de coude du lot. */
  private refreshHandleClasses(): void {
    this.handles.forEach((h, i) =>
      h.classList.toggle(
        'wire-handle--active',
        h.classList.contains('wire-handle') && this.selectedHandles.has(i)
      )
    );
  }

  /** Supprime un coude (point intermédiaire) d'un fil. */
  private removeWirePoint(wireId: string, index: number): void {
    this.removeWirePoints(wireId, [index]);
  }

  /** Supprime un lot de coudes (indices décroissants pour préserver les index). */
  private removeWirePoints(wireId: string, indices: number[]): void {
    const wire = this.diagram.wires.find((w) => w.id === wireId);
    if (!wire?.points) return;
    for (const i of [...indices].sort((u, v) => v - u)) {
      if (i >= 0 && i < wire.points.length) wire.points.splice(i, 1);
    }
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
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+clic : constitution du lot de coudes, pas de glisse.
          this.toggleHandleInSelection(wire.id, index);
          return;
        }
        // Saisir un coude déjà dans le lot déplace tout le lot ; sinon la
        // sélection retombe sur ce seul coude.
        if (this.selectedHandles.has(index)) this.activeHandle = { wireId: wire.id, index };
        else this.setActiveHandle(wire.id, index);
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

  /**
   * Rectangles d'encombrement de tous les composants (coordonnées monde). La boîte
   * retenue est celle du DESSIN (svg de l'élément, déjà mis à l'échelle par
   * `applyPinScale`) : la boîte DOM `.part__body` peut être plus haute de
   * quelques px (interligne du span d'étiquette sous le dessin), ce qui faussait
   * la sortie perpendiculaire des broches du bas — le fil « sortait » de côté au
   * lieu de descendre, d'où des boucles autour des LED.
   */
  private partObstacles(): PartRect[] {
    const rects: PartRect[] = [];
    for (const r of this.rendered.values()) {
      const body = r.container.querySelector('.part__body') as HTMLElement | null;
      let w = 0;
      let h = 0;
      try {
        const svg = (r.el.shadowRoot ?? r.el).querySelector('svg');
        w = svg?.width?.baseVal?.value || 0;
        h = svg?.height?.baseVal?.value || 0;
      } catch {
        // Largeur svg en % sans viewport résolu : repli sur la boîte DOM.
      }
      rects.push({ id: r.part.id, x: r.part.x, y: r.part.y, w: w || body?.offsetWidth || 40, h: h || body?.offsetHeight || 40 });
    }
    return rects;
  }

  /**
   * Points de sortie **perpendiculaires aux bords les plus proches** du corps d'un
   * composant : le fil quitte la broche tout droit, vers l'extérieur, au lieu de
   * traverser le composant. S'applique à tout composant dont la broche est *dans*
   * le corps **ou sur son bord** (cartes, platines, gros modules, broches d'un LCD
   * alignées sur le bord) : la sortie est prolongée de `len` **à l'extérieur** du
   * corps, si bien que l'A\* aborde ensuite la broche depuis l'extérieur au lieu de
   * traverser le corps pour l'atteindre. Renvoie jusqu'à DEUX candidats (bords
   * quasi équidistants, ±5 px) : pour une broche d'angle — dernier plot d'une
   * rangée de carte, coins d'un bouton — le bord strictement le plus proche n'est
   * pas toujours la bonne sortie ; l'autoroutage essaie chaque combinaison et
   * garde le tracé le moins coûteux. Renvoie [] seulement pour une broche
   * franchement **hors du corps** (patte saillante d'un petit composant : aucune
   * traversée à craindre).
   */
  private pinStubs(end: Endpoint, center: XY, rects: Map<string, PartRect>, len: number): XY[] {
    const r = this.rendered.get(end.partId);
    if (!r) return [];
    const box = rects.get(end.partId);
    if (!box) return [];
    const dTop = center.y - box.y;
    const dBot = box.y + box.h - center.y;
    const dLeft = center.x - box.x;
    const dRight = box.x + box.w - center.x;
    // Broche franchement en dehors du corps (patte saillante) : aucune sortie à
    // forcer. En revanche, une broche SUR le bord (dX ≈ 0) reçoit bien un stub
    // sortant (le fil ne doit pas repasser par le corps pour l'atteindre).
    const OUT = 2;
    if (dTop < -OUT || dBot < -OUT || dLeft < -OUT || dRight < -OUT) return [];
    const m = Math.min(dTop, dBot, dLeft, dRight);
    const TIE = GRID / 2; // bords considérés équivalents à ±5 px près
    const cands: Array<{ d: number; p: XY }> = [];
    if (dTop <= m + TIE) cands.push({ d: dTop, p: { x: center.x, y: box.y - len } });
    if (dBot <= m + TIE) cands.push({ d: dBot, p: { x: center.x, y: box.y + box.h + len } });
    if (dLeft <= m + TIE) cands.push({ d: dLeft, p: { x: box.x - len, y: center.y } });
    if (dRight <= m + TIE) cands.push({ d: dRight, p: { x: box.x + box.w + len, y: center.y } });
    cands.sort((u, v) => u.d - v.d); // tri stable : à égalité, ordre haut/bas/gauche/droite
    return cands.slice(0, 2).map((c) => c.p);
  }

  /**
   * Autoroutage : réécrit les fils en tracés horizontaux/verticaux. Chaque
   * extrémité posée sur une carte **sort perpendiculairement au bord le plus
   * proche** (le fil ne traverse plus la carte) ; entre les deux sorties, l'A\*
   * contourne composants et fils existants. En repli (A\* sans solution), coude
   * en L / détour en Z de moindre coût — traverser un composant y coûte bien
   * plus cher que longer un fil. Sur la sélection si des composants sont
   * sélectionnés, sinon sur tout le dessin.
   */
  autoRoute(): void {
    if (this.locked) return;
    const sel = this.selectedParts;
    const all = sel.size === 0;
    const obstacles = this.partObstacles();
    const rectOf = new Map(obstacles.map((o) => [o.id, o]));
    const STUB = GRID; // sortie perpendiculaire = 1 pas de grille hors du corps
    // Écart mini entre deux fils parallèles d'équipotentielles DIFFÉRENTES : 2 px
    // (demande de Frank — des fils parallèles peuvent se serrer jusqu'à 2 px, ils
    // ne se touchent pas). Deux fils de MÊME `eqp` peuvent, eux, se superposer.
    const GAP = 2;
    const BEND = 2 * GRID; // pénalité par coude (A* et départage des tracés)
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
    // Équipotentielle NOMMÉE de chaque fil (`eqp-x`, cf. nameEquipotentials) :
    // deux fils de MÊME `eqp` ont le droit (et intérêt) de se recouvrir et de
    // s'embrancher — le tracé « monte » sur la dorsale existante et s'en détache
    // au plus près de sa broche, ce qui limite les coudes. Deux fils d'`eqp`
    // différentes ne peuvent NI se chevaucher NI s'embrancher. Les fils `auto`
    // (invisibles) ne portent pas d'`eqp` et ne servent jamais de dorsale.
    const eqp = nameEquipotentials(this.diagram);
    const eqpOfWire = new Map<string, string | undefined>();
    const autoWires = new Set<string>();
    for (const w of this.diagram.wires) {
      eqpOfWire.set(w.id, eqp.eqpOfWire(w.id));
      if (w.auto) autoWires.add(w.id);
    }
    const sameEqpWire = (idA: string, idB: string): boolean => {
      const ea = eqpOfWire.get(idA);
      return ea !== undefined && ea === eqpOfWire.get(idB);
    };
    // Centres des pastilles de broche (repère monde) : un fil ne doit JAMAIS
    // passer sur une broche à laquelle il n'est pas connecté (demande de Frank).
    // On exclut, pour chaque fil routé, ses deux propres broches.
    const pinCenters: Array<{ partId: string; pin: string; c: XY }> = [];
    for (const [id, r] of this.rendered) {
      for (const pin of r.hotspots.keys()) {
        const c = this.hotspotCenter({ partId: id, pin });
        if (c) pinCenters.push({ partId: id, pin, c });
      }
    }
    let changed = false;
    for (const wire of this.diagram.wires) {
      if (wire.auto) continue;
      if (!all && !(sel.has(wire.a.partId) || sel.has(wire.b.partId))) continue;
      const a = this.hotspotCenter(wire.a);
      const b = this.hotspotCenter(wire.b);
      if (!a || !b) continue;
      // Ligne droite prioritaire : broches alignées H/V et segment direct
      // dégagé → AUCUN coude, même au ras des composants. Les corps des DEUX
      // extrémités tolèrent chacun ~1 pas de grille de chevauchement (la broche
      // vit au bord de son corps) ; un fil droit qui TRANCHERAIT un corps de
      // part en part (broches sous le corps, ex. deux LED superposées) dépasse
      // ce plafond et repasse par le routeur ; idem pour un fil déjà couché sur
      // la ligne (le créneau anti-superposition du routeur reprend la main).
      if (Math.abs(a.x - b.x) <= TOL || Math.abs(a.y - b.y) <= TOL) {
        const ENDCAP = 1.5 * GRID; // chevauchement toléré dans un corps d'extrémité
        let blocked = false;
        for (const o of obstacles) {
          const ov = segRectOverlap(a, b, o);
          const isEnd = o.id === wire.a.partId || o.id === wire.b.partId;
          if (ov > (isEnd ? ENDCAP : TOL)) {
            blocked = true;
            break;
          }
        }
        // Seuls les fils d'une AUTRE équipotentielle interdisent la ligne
        // droite : un fil de la même `eqp` couché sur la ligne est un
        // recouvrement voulu.
        const others: Array<[XY, XY]> = [];
        for (const [wid, s] of wireSegs) {
          if (wid !== wire.id && !sameEqpWire(wid, wire.id)) others.push(...s);
        }
        // La ligne droite ne doit pas non plus PASSER SUR une broche à laquelle
        // le fil n'est pas connecté (les broches propres du fil sont exclues).
        const crossesForeignPin = pinCenters.some(
          (p) =>
            !(p.partId === wire.a.partId && p.pin === wire.a.pin) &&
            !(p.partId === wire.b.partId && p.pin === wire.b.pin) &&
            pointOnSegment(p.c, a, b, 2)
        );
        if (!blocked && !crossesForeignPin && polylineWireCost([a, b], others, GAP).overlap <= TOL) {
          if ((wire.points?.length ?? 0) > 0) changed = true;
          wire.points = undefined;
          wireSegs.set(wire.id, toSegs([a, b]));
          this.positionWire(wire);
          continue;
        }
      }
      const saList = this.pinStubs(wire.a, a, rectOf, STUB);
      const sbList = this.pinStubs(wire.b, b, rectOf, STUB);
      const saCands: Array<XY | null> = saList.length > 0 ? saList : [null];
      const sbCands: Array<XY | null> = sbList.length > 0 ? sbList : [null];
      // Ségrégation par équipotentielle : `otherSegs` (autres nets) restent des
      // obstacles ; `sameSegs` (même net, fils visibles) deviennent des dorsales
      // que le tracé est encouragé à suivre (bonus de recouvrement).
      const otherSegs: Array<[XY, XY]> = [];
      const sameSegs: Array<[XY, XY]> = [];
      for (const [wid, segs] of wireSegs) {
        if (wid === wire.id) continue;
        if (!autoWires.has(wid) && sameEqpWire(wid, wire.id)) sameSegs.push(...segs);
        else otherSegs.push(...segs);
      }
      // Broches étrangères (ni a ni b du fil) : le tracé ne doit jamais passer
      // dessus — fournies à l'A* et au coût comme points interdits.
      const foreignPins = pinCenters.filter(
        (p) =>
          !(p.partId === wire.a.partId && p.pin === wire.a.pin) &&
          !(p.partId === wire.b.partId && p.pin === wire.b.pin)
      );
      // Coût d'un tracé : recouvrement de composants + recouvrement (colinéaire) ET
      // proximité (< GAP) d'autres fils, PLUS longueur et coudes (départage les
      // combinaisons de sorties de broche). Les fils peuvent se croiser mais pas se
      // chevaucher ni se serrer à moins de GAP. Le recouvrement de composant est
      // mesuré sur le tracé INTERNE [pa..pb] contre TOUS les composants (y compris
      // les deux d'extrémité : seules les pattes a→pa / pb→b ont le droit de
      // traverser un corps — repro Frank : le Z de repli coupait le LCD en plein
      // milieu car `others` excluait les composants d'extrémité).
      const cost = (sa: XY | null, sb: XY | null, c: XY[]): number => {
        const pa = sa ?? a;
        const pb = sb ?? b;
        const poly = [a, pa, ...c, pb, b];
        const comp = polylineRectOverlap([pa, ...c, pb], obstacles);
        const { overlap, near } = polylineWireCost(poly, otherSegs, GAP);
        const { len, bends } = polyLenBends(poly);
        // Aller-retour sur soi-même (la patte d'arrivée qui rebrousse chemin le
        // long du tracé) : aussi laid qu'un chevauchement d'un autre fil.
        let selfOv = 0;
        for (let i = 0; i < poly.length - 1; i++) {
          for (let j = i + 1; j < poly.length - 1; j++) {
            selfOv += collinearOverlap(poly[i], poly[i + 1], poly[j], poly[j + 1]);
          }
        }
        // Croisements transversaux : à éviter quand un petit détour suffit.
        let cross = 0;
        for (let i = 0; i < poly.length - 1; i++) {
          for (const [s, t] of otherSegs) if (segsCross(poly[i], poly[i + 1], s, t)) cross++;
        }
        // Recouvrement d'un fil de la MÊME équipotentielle : un BONUS (le fil
        // « monte » sur la dorsale, chaque px suivi ne coûte plus que 25 % de sa
        // longueur) — borné par la longueur pour ne jamais rendre le coût négatif.
        const sameOv = sameSegs.length > 0 ? Math.min(len, polylineWireCost(poly, sameSegs, GAP).overlap) : 0;
        // Broche étrangère TRAVERSÉE par le tracé : interdit (poids ×2000, pire
        // que traverser un composant) — un fil ne doit jamais recouvrir une
        // broche à laquelle il n'est pas connecté.
        let onPin = 0;
        for (const fp of foreignPins) {
          for (let i = 0; i < poly.length - 1; i++) {
            if (pointOnSegment(fp.c, poly[i], poly[i + 1], 2)) {
              onPin++;
              break;
            }
          }
        }
        // Poids massifs, hiérarchisés : passer sur une broche étrangère (×2000)
        // est le pire, puis traverser un composant (×1000), suivre un autre fil
        // (×100), un croisement (1,5 coude). À coût « dur » égal, le plus court
        // et le moins coudé gagne.
        return onPin * 2000 + comp * 1000 + (overlap + selfOv) * 100 + cross * BEND * 1.5 + near * 0.6 + len + bends * BEND - sameOv * RIDE;
      };
      // Routeur A* (contourne les obstacles et les fils), essayé pour CHAQUE
      // combinaison de sorties candidates (≤ 2 par extrémité) : pour une broche
      // d'angle, le bord le plus proche n'est pas forcément la bonne sortie — on
      // garde le tracé complet le moins coûteux. On passe à l'A\* **tous** les
      // composants, y compris les deux d'extrémité : la broche est déjà sortie du
      // corps par `pinStubs`, donc l'A\* ne doit plus jamais retraverser un corps —
      // ni celui d'où part le fil, ni celui d'arrivée. (Le filtre `solid` interne à
      // `astarRoute` exclut malgré tout le bloc qui contient encore le point de
      // départ/arrivée, pour laisser la broche s'échapper.) Le chemin va de pa à
      // pb inclus ; on retire ces deux bornes (réinjectées via sa/sb ou a/b).
      let sa: XY | null = saCands[0];
      let sb: XY | null = sbCands[0];
      let routed: XY[] | null = null;
      let bestCost = Infinity;
      // Direction dominante d'un déplacement (encodage de l'A* : 0..3).
      const dirOf = (from: XY, to: XY): number =>
        Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? (to.x > from.x ? 0 : 1) : to.y > from.y ? 2 : 3;
      for (const ca of saCands) {
        for (const cb of sbCands) {
          const path = astarRoute(ca ?? a, cb ?? b, obstacles, otherSegs, {
            clr: GRID / 2,
            bend: BEND,
            gap: GAP,
            startDir: ca ? dirOf(a, ca) : undefined,
            endDir: cb ? dirOf(cb, b) : undefined,
            same: sameSegs,
          });
          if (!path || path.length < 2) continue;
          const c = path.slice(1, -1);
          const k = cost(ca, cb, c);
          if (k < bestCost - 0.01) {
            bestCost = k;
            sa = ca;
            sb = cb;
            routed = c;
          }
        }
      }
      const pa = sa ?? a; // point de départ du routage (après sortie perpendiculaire)
      const pb = sb ?? b;
      const pick = (cands: XY[][]): XY[] => {
        let best = cands[0];
        let bestK = Infinity;
        for (const c of cands) {
          const k = cost(sa, sb, c);
          if (k < bestK - 0.01) {
            bestK = k;
            best = c;
          }
        }
        return best;
      };
      let inner: XY[] = [];
      if (routed) {
        inner = routed;
      } else if (Math.abs(pa.x - pb.x) > TOL && Math.abs(pa.y - pb.y) > TOL) {
        // Repli (A* sans solution) : coude en L / détour en Z de moindre coût.
        const midX = (pa.x + pb.x) / 2;
        const midY = (pa.y + pb.y) / 2;
        const offs = [0, GRID, -GRID, 2 * GRID, -2 * GRID, 3 * GRID, -3 * GRID];
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
        for (const o of [GRID, -GRID, 2 * GRID, -2 * GRID]) {
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

  private dragHandle(wire: Wire, index: number, _handle: HTMLDivElement): void {
    // Lot de coudes à déplacer ensemble : la sélection multiple si le coude
    // saisi en fait partie, sinon le coude seul. Positions d'origine mémorisées
    // pour appliquer le même vecteur à tout le lot.
    const group =
      this.selectedHandles.has(index) && this.selectedHandles.size > 1
        ? [...this.selectedHandles].filter((i) => wire.points && i >= 0 && i < wire.points.length)
        : [index];
    const orig = new Map(group.map((i) => [i, { x: wire.points![i].x, y: wire.points![i].y }]));
    const move = (ev: PointerEvent) => {
      if (!wire.points) return;
      let pos = this.canvasPoint(ev.clientX, ev.clientY);
      if (ev.ctrlKey && group.length === 1) {
        // Réticule + forçage : aligne le coude sur ses voisins (segments H/V).
        pos = this.alignToNeighbours(wire, index, pos);
        this.showGuides(pos);
      } else {
        this.clearGuides();
      }
      const o0 = orig.get(index)!;
      const dx = pos.x - o0.x;
      const dy = pos.y - o0.y;
      for (const i of group) {
        const o = orig.get(i)!;
        wire.points[i] = { x: o.x + dx, y: o.y + dy };
        const h = this.handles[i];
        if (h) {
          h.style.left = `${o.x + dx}px`;
          h.style.top = `${o.y + dy}px`;
        }
      }
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
    this.dropWirePath(id);
    if (this.selection?.kind === 'wire' && this.selection.id === id) this.select(null);
    this.notify();
  }

  /** Retire le tracé d'un fil ET sa surbrillance de sélection (fourmis). */
  private dropWirePath(id: string): void {
    this.wirePaths.get(id)?.remove();
    this.wirePaths.delete(id);
    this.wireAnts.get(id)?.remove();
    this.wireAnts.delete(id);
    this.scheduleJunctions();
  }

  /**
   * Met en évidence un fil sélectionné : classe `wire--selected` (fil épaissi,
   * halo d'accent) + « fourmis en marche » — deux tracés pointillés superposés
   * (sombre + clair en alternance), visibles sur toute couleur de fil et de
   * fond. Le `d` des fourmis est resynchronisé par positionWire.
   */
  private setWireHighlight(id: string, on: boolean): void {
    const path = this.wirePaths.get(id);
    path?.classList.toggle('wire--selected', on);
    const ants = this.wireAnts.get(id);
    if (!on) {
      ants?.remove();
      this.wireAnts.delete(id);
      return;
    }
    if (!path || ants) return;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'wire-ants');
    for (const cls of ['wire-ants__dark', 'wire-ants__light']) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', path.getAttribute('d') ?? '');
      g.appendChild(p);
    }
    this.svg.appendChild(g); // en fin de SVG : au-dessus de tous les fils
    this.wireAnts.set(id, g);
  }

  setWireColor(id: string, color: string): void {
    const wire = this.diagram.wires.find((w) => w.id === id);
    if (!wire) return;
    wire.color = color;
    const path = this.wirePaths.get(id);
    if (path) path.style.stroke = dupontHex(color);
    this.scheduleJunctions(); // les points d'embranchement suivent la couleur
  }

  private positionWire(wire: Wire): void {
    const path = this.wirePaths.get(wire.id);
    if (!path) return;
    const a = this.hotspotCenter(wire.a);
    const b = this.hotspotCenter(wire.b);
    if (!a || !b) return;
    const d = roundedWirePath([a, ...(wire.points ?? []), b]);
    path.setAttribute('d', d);
    // La surbrillance de sélection (fourmis) suit le même tracé.
    const ants = this.wireAnts.get(wire.id);
    if (ants) for (const p of ants.children) p.setAttribute('d', d);
    this.scheduleJunctions();
  }

  redrawWires(): void {
    for (const wire of this.diagram.wires) this.positionWire(wire);
  }

  /** Recalcule les points d'embranchement en microtâche (dédoublonne les rafales
   *  de positionWire — drag, redraw, autoroutage). */
  private scheduleJunctions(): void {
    if (this.junctionsQueued) return;
    this.junctionsQueued = true;
    queueMicrotask(() => {
      this.junctionsQueued = false;
      this.updateJunctions();
    });
  }

  /**
   * Points d'embranchement : lorsque deux fils d'une même équipotentielle se
   * recouvrent (autoroutage « dorsale » ou câblage manuel), l'endroit où l'un
   * quitte l'autre est marqué d'un point de la couleur du fil (comme sur un
   * schéma électronique : le point signale la connexion). Détection : chaque
   * coude d'un fil d'où partent AU MOINS TROIS directions distinctes — en
   * comptant tous les fils du net qui passent par ce point — est une jonction.
   * Deux fils qui tournent ensemble (2 directions) ou une broche partagée (la
   * pastille marque déjà la connexion) ne reçoivent pas de point.
   */
  private updateJunctions(): void {
    // Plus AUCUN point d'embranchement (demande de Frank v2026.7.120) : les
    // jonctions en T ne sont plus marquées d'un point. On se contente de retirer
    // un éventuel groupe résiduel (schéma chargé d'une version antérieure).
    this.junctionsG?.remove();
    this.junctionsG = null;
  }

  /**
   * Agrandit le dessin d'un élément Lit (et son hôte) pour que le pas de ses
   * broches passe de 9,6 px (0,1″) à 10 px = la grille / le pas de la platine.
   * Le viewBox restant inchangé, le dessin se redimensionne ; comme les pastilles
   * de broche sont elles aussi placées à `pin.x × pinScale` (cf. makeHotspot /
   * syncHotspots), tout reste aligné — y compris à l'export SVG, qui lit la
   * taille de mise en page agrandie. Idempotent (drapeau posé sur l'élément).
   * Renvoie `false` si le SVG n'est pas encore rendu (à réessayer plus tard).
   */
  private applyPinScale(r: Rendered): boolean {
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
   * Lit terminent leur mise en page de façon asynchrone : au premier
   * rendu, offsetWidth/positions de broches peuvent être provisoires. Sans ce
   * second passage, le nom d'un composant tourné se plaçait mal et les fils se
   * décalaient légèrement après un re-rendu (chargement, annuler/refaire,
   * réinitialisation, déplacement d'onglet).
   */
  private settleQueued = false;
  /** Posé par loadDiagram : nombre de passes de recollage sur grille restantes
   *  après le settle (les tailles Lit se stabilisent sur quelques frames). */
  private snapSettleLeft = 0;
  private scheduleSettle(): void {
    if (this.settleQueued || typeof requestAnimationFrame !== 'function') return;
    this.settleQueued = true;
    requestAnimationFrame(() => {
      this.settleQueued = false;
      let pending = false; // un dessin Lit pas encore prêt à être agrandi
      for (const r of this.rendered.values()) {
        const wasPending = !this.applyPinScale(r); // dessin agrandi au pas de 10 px
        if (wasPending) pending = true;
        this.syncHotspots(r); // pastilles de broche tardives (pinInfo asynchrone)
        const body = r.container.querySelector('.part__body') as HTMLDivElement | null;
        if (body) this.applyRotation(r.part, body); // repositionne le bandeau (rotation)
        // Le câblage interne / poster affiché a pu être dessiné à la mauvaise
        // taille juste après un re-rendu (changement de taille d'afficheur,
        // nb de colonnes du clavier…) car le SVG externe n'était pas encore
        // mesurable : on le redessine une fois le dessin externe stabilisé.
        if (!wasPending) {
          if (this.internalShown.has(r.part.id) && this.isSelected(r.part.id)) this.renderInternalWiring(r.part.id);
          if (this.pinoutShown.has(r.part.id) && this.isSelected(r.part.id)) this.renderPinout(r.part.id);
        }
      }
      this.redrawWires();
      // Le SVG d'un élément Lit peut arriver après cette frame : on repasse une
      // fois de plus tant qu'une carte attend sa mise à l'échelle.
      if (pending) {
        requestAnimationFrame(() => this.scheduleSettle());
      } else if (this.snapSettleLeft > 0) {
        // Chargement d'un schéma : recolle les broches sur la grille (composants
        // tournés d'anciens fichiers aux positions fractionnaires). Un dessin
        // Lit peut encore changer de taille une frame ou deux après le settle
        // (le centre de rotation bouge → mesure périmée) : on repasse plusieurs
        // frames, le recollage est idempotent une fois les tailles stables.
        this.snapSettleLeft--;
        for (const id of [...this.rendered.keys()]) this.snapPartToGrid(id, true);
        if (this.snapSettleLeft > 0) requestAnimationFrame(() => this.scheduleSettle());
      }
    });
  }

  // --- Sélection + éditeur de composants --------------------------------------
  private select(sel: Selection): void {
    // Retire la mise en évidence précédente (fil + câblages internes affichés).
    if (this.selection?.kind === 'wire') {
      this.setWireHighlight(this.selection.id, false);
    }
    // Lot de câbles (Ctrl+clic) : dissous par toute nouvelle sélection.
    if (this.selectedWires.size > 0) {
      for (const wid of this.selectedWires) this.setWireHighlight(wid, false);
      this.selectedWires.clear();
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
      this.setWireHighlight(sel.id, true);
      this.buildHandles(sel.id);
    }
    this.renderInspector();
    this.notifySelection();
  }

  /** Le composant a-t-il un câblage interne ou un poster de brochage (bouton ☢) ? */
  private partHasSchema(partId: string): boolean {
    const r = this.rendered.get(partId);
    if (!r) return false;
    if (pinoutSvg(r.part.type) !== null) return true;
    if (partDef(r.part.type).custom?.innerSvg) return true;
    const pins = this.partPins(r.el).map((p) => ({ name: p.name, x: p.x, y: p.y }));
    return internalWiringSvg(partDef(r.part.type).kind, pins, r.part.attrs, r.part.type) !== null;
  }

  /** Composant sélectionné (sélection simple) ou null. */
  private singleSelectedPart(): string | null {
    return this.selection?.kind === 'part' ? this.selection.id : null;
  }

  /** Notifie le panneau de l'état du bouton ☢ selon la sélection courante. */
  private notifySelection(): void {
    const partId = this.singleSelectedPart();
    const schema = partId ? this.partHasSchema(partId) : false;
    const shown = partId ? this.internalShown.has(partId) || this.pinoutShown.has(partId) : false;
    this.onSelectionChange?.({ partId, schema, shown });
  }

  /**
   * Bascule le câblage interne / poster du composant sélectionné (bouton ☢ de la
   * barre d'outils). Sans effet si rien de sélectionné ou pas de schéma.
   */
  toggleSelectedSchema(): void {
    const partId = this.singleSelectedPart();
    if (!partId || !this.partHasSchema(partId)) return;
    if (pinoutSvg(this.rendered.get(partId)!.part.type) !== null) this.togglePinout(partId);
    else this.toggleInternalWiring(partId);
    this.notifySelection();
  }
  private setPartHighlight(): void {
    for (const [id, r] of this.rendered) {
      r.container.classList.toggle('part--selected', this.selectedParts.has(id));
    }
  }

  /**
   * Ctrl+A : sélectionne tout le schéma — tous les composants passent en
   * sélection multiple ; les fils suivent (déplacement de groupe décale leurs
   * coudes, suppression de groupe retire leurs fils).
   */
  private selectAllParts(): void {
    this.cancelPending();
    if (this.selection?.kind === 'wire') {
      this.setWireHighlight(this.selection.id, false);
      this.clearHandles();
    }
    this.selectedParts = new Set(this.diagram.parts.map((p) => p.id));
    const members = [...this.selectedParts];
    this.selection = members.length === 1 ? { kind: 'part', id: members[0] } : null;
    this.setPartHighlight();
    this.renderInspector();
  }

  /** Ctrl+clic sur un fil : ajoute/retire le câble du lot (suppression groupée). */
  private toggleWireInSelection(id: string): void {
    // Une sélection simple de fil rejoint le lot (Ctrl+clic construit dessus).
    if (this.selection?.kind === 'wire') {
      this.selectedWires.add(this.selection.id);
      this.selection = null;
      this.clearHandles();
    }
    if (this.selectedWires.has(id)) this.selectedWires.delete(id);
    else this.selectedWires.add(id);
    for (const wid of this.wirePaths.keys()) {
      this.setWireHighlight(wid, this.selectedWires.has(wid));
    }
    this.renderInspector();
  }

  /** Ctrl+clic : ajoute/retire un composant de la sélection multiple. */
  private toggleInSelection(id: string): void {
    if (this.selection?.kind === 'wire') {
      this.setWireHighlight(this.selection.id, false);
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
    // Un fil est sélectionné : le rectangle sert d'abord à attraper SES COUDES
    // (déplacement groupé) — on mémorise le fil car la sélection peut bouger.
    const wireId = this.selection?.kind === 'wire' ? this.selection.id : null;
    let moved = false;
    let last = { x: 0, y: 0, w: 0, h: 0 };
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
      last = { x, y, w, h };
      rectEl.style.left = `${x}px`;
      rectEl.style.top = `${y}px`;
      rectEl.style.width = `${w}px`;
      rectEl.style.height = `${h}px`;
      this.selectedParts = new Set([...baseSet, ...this.partsInRect(x, y, w, h)]);
      this.setPartHighlight();
      // Câbles pris dans la boîte : marqués sélectionnés (item de Frank — un
      // marquee ne marquait que les composants). Un fil ne sert de rectangle
      // à coudes que s'il était DÉJÀ le seul sélectionné (wireId) : dans ce
      // mode-là on ne rafle pas de fils.
      if (!wireId) {
        const next = this.wiresInRect(x, y, w, h);
        for (const id of this.selectedWires) {
          if (!next.has(id)) this.setWireHighlight(id, false);
        }
        for (const id of next) this.setWireHighlight(id, true);
        this.selectedWires = next;
      }
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      rectEl.remove();
      if (!moved) {
        this.select(null); // simple clic sur le fond = désélection
        return;
      }
      // Fil sélectionné et aucun composant attrapé : le rectangle sélectionne
      // les coudes du fil qu'il contient (déplacement/suppression groupés).
      if (wireId && this.selectedParts.size === 0) {
        const wire = this.diagram.wires.find((w) => w.id === wireId);
        const caught = new Set<number>();
        (wire?.points ?? []).forEach((pt, i) => {
          if (pt.x >= last.x && pt.x <= last.x + last.w && pt.y >= last.y && pt.y <= last.y + last.h) {
            caught.add(i);
          }
        });
        if (caught.size > 0) {
          this.selectedHandles = caught;
          this.activeHandle = { wireId, index: [...caught][0] };
          this.refreshHandleClasses();
          return;
        }
      }
      const members = [...this.selectedParts];
      // Un seul composant et aucun câble : sélection simple (inspecteur du
      // composant). Sinon (plusieurs composants, ou des câbles) : pas de
      // sélection unique — l'inspecteur montre le lot (composants ou câbles).
      const soleWireSelection = members.length === 0 && this.selectedWires.size > 0;
      this.selection = members.length === 1 && this.selectedWires.size === 0
        ? { kind: 'part', id: members[0] }
        : null;
      // Ré-affirme le surlignage des câbles pris (idempotent) : robuste à tout
      // repositionnement de fil survenu pendant le glissé de la boîte.
      if (soleWireSelection || this.selectedWires.size > 0) {
        for (const id of this.selectedWires) this.setWireHighlight(id, true);
      }
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

  /**
   * Fils VISIBLES dont les DEUX extrémités tombent dans le rectangle (coords
   * monde) : le câble entier est alors dans la boîte. Fils `auto` (invisibles)
   * exclus.
   */
  private wiresInRect(x: number, y: number, w: number, h: number): Set<string> {
    const ids = new Set<string>();
    const inside = (p: XY | null): boolean =>
      p !== null && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
    for (const wire of this.diagram.wires) {
      if (wire.auto) continue;
      if (inside(this.hotspotCenter(wire.a)) && inside(this.hotspotCenter(wire.b))) {
        ids.add(wire.id);
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
    const overlay = document.createElement('div');
    overlay.className = 'part__pinout';
    overlay.style.transformOrigin = '0 0';
    if (poster.mode === 'align') {
      // Pose alignée : transform mesurée coord_carte = s·coord_poster + t. Une unité
      // carte s'affiche à f = width_px / cardW ; une unité poster à f·s. Le SVG est
      // donc posé à width = poster.w·f·s, décalé de (tx·f, ty·f) : un point poster
      // (px,py) tombe alors sur le pin carte (s·px+tx, s·py+ty). Sans déformation
      // (échelle uniforme). Étiquettes hors carte débordent librement.
      const f = width / (poster.cardW as number);
      const s = poster.s as number;
      overlay.style.left = `${left + (poster.tx as number) * f}px`;
      overlay.style.top = `${top + (poster.ty as number) * f}px`;
      overlay.style.width = `${poster.w * f * s}px`;
    } else {
      // Mode 'stretch' (pico/picow) : poster à la largeur de la carte, étiré
      // verticalement (scaleY) pour que sa bande vide [rTop, rBot] couvre exactement
      // la carte [top, top+height]. Les deux rangées de broches s'alignent alors.
      const scaledH = (width * poster.h) / poster.w;
      const k = height / (((poster.rBot as number) - (poster.rTop as number)) * scaledH);
      const ty = top - (poster.rTop as number) * scaledH * k;
      overlay.style.left = `${left}px`;
      overlay.style.width = `${width}px`;
      overlay.style.transform = `translateY(${ty}px) scaleY(${k})`;
    }
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
    // Taille = celle du DESSIN externe (svg de l'élément), PAS du corps DOM :
    // `.part__body` peut être plus haut (span d'étiquette sous le dessin), et le
    // dessin externe garde son ratio (letterbox) alors que l'overlay est étiré sur
    // toute la boîte → l'interne rendait trop grand en hauteur. On calque l'overlay
    // sur le SVG externe (mêmes w/h, mêmes marges de centrage) pour qu'ils coïncident.
    let w = 0;
    let h = 0;
    let offX = 0;
    let offY = 0;
    try {
      const svg = (r.el.shadowRoot ?? r.el).querySelector('svg');
      w = svg?.width?.baseVal?.value || 0;
      h = svg?.height?.baseVal?.value || 0;
      if (svg && w && h) {
        // Marge de centrage du dessin dans le corps (letterbox), pour caler l'overlay.
        const br = svg.getBoundingClientRect();
        const bb = body.getBoundingClientRect();
        offX = br.left - bb.left;
        offY = br.top - bb.top;
      }
    } catch {
      // Repli sur la boîte DOM si le SVG externe n'est pas mesurable.
    }
    w = w || body.offsetWidth || 80;
    h = h || body.offsetHeight || 60;
    // Composant personnalisé avec vue interne fournie (SVG importé dans le
    // créateur) : on l'affiche telle quelle sur fond blanc translucide, calée
    // par le décalage mesuré sur l'ancre verte à l'import.
    const custom = partDef(r.part.type).custom;
    if (custom?.innerSvg) {
      const off = custom.innerOffset ?? { x: 0, y: 0 };
      const overlay = document.createElement('div');
      overlay.className = 'part__internal';
      overlay.style.left = `${offX}px`;
      overlay.style.top = `${offY}px`;
      overlay.style.width = `${w}px`;
      overlay.style.height = `${h}px`;
      overlay.innerHTML =
        `<div style="position:absolute;inset:0;background:rgba(255,255,255,0.8);border-radius:6px"></div>` +
        `<div style="position:absolute;left:${off.x}px;top:${off.y}px">${custom.innerSvg}</div>`;
      body.appendChild(overlay);
      return;
    }
    const inner = internalWiringSvg(partDef(r.part.type).kind, pins, r.part.attrs, r.part.type, { w, h });
    if (!inner) return;
    // Inséré dans le corps : suit naturellement rotation et retournement.
    const overlay = document.createElement('div');
    overlay.className = 'part__internal';
    overlay.style.left = `${offX}px`;
    overlay.style.top = `${offY}px`;
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;
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
    // PCA9685 : l'adresse ne se choisit pas dans une liste, elle DÉCOULE des six
    // pads AD0..AD5 de la carte (cases à cocher). On la recalcule ici — c'est
    // `address` que lit la simulation — puis on redessine l'inspecteur pour que
    // l'adresse affichée suive le pad qu'on vient de (dé)cocher.
    if (/^ad[0-5]$/.test(attr) && partDef(r.part.type).kind === 'i2c-pwm') {
      r.part.attrs = { ...r.part.attrs, address: pca9685AddressText(r.part.attrs) };
      r.el.setAttribute('address', r.part.attrs.address);
      queueMicrotask(() => this.renderInspector());
    }
    // Platine rétrécie : retire les fils pointant vers des trous disparus.
    if (attr === 'size' && partDef(r.part.type).kind === 'breadboard') {
      const valid = new Set(breadboardPins(normalizeSize(value)).map((p) => p.name));
      this.diagram.wires = this.diagram.wires.filter((w) => {
        for (const end of [w.a, w.b]) {
          if (end.partId === partId && !valid.has(end.pin)) {
            this.dropWirePath(w.id);
            return false;
          }
        }
        return true;
      });
    }
    // L'angle, la taille, le jeu de broches (LCD i2c↔parallèle), le nombre de
    // colonnes du clavier ou de chiffres du 7 segments déplacent les broches :
    // re-rendu complet nécessaire (sinon les pastilles restent aux positions de
    // l'ancienne variante — ex. le 7 segments 2/4 chiffres gardait le brochage
    // du 1 chiffre, DIG1..DIG4 absentes).
    if (attr === 'angle' || attr === 'flip' || attr === 'size' || attr === 'pins' || attr === 'lcdSize' || attr === 'columns' || attr === 'digits') {
      this.rerenderPart(partId); // renderPart restaure le câblage interne s'il était affiché
      if (this.selection?.kind === 'part' && this.selection.id === partId) {
        this.rendered.get(partId)?.container.classList.add('part--selected');
      }
    } else if (value === '') {
      r.el.removeAttribute(attr);
    } else {
      r.el.setAttribute(attr, value);
    }
    // La polarité du commun (cathode/anode) change le nom affiché de la broche
    // COM (« K »/« A ») : on rafraîchit les bulles d'aide des pastilles, et le
    // câblage interne s'il est affiché (les diodes cathode/anode sont dessinées
    // à l'envers selon `common` — sinon le schéma affiché reste sur l'ancienne
    // polarité tant qu'on ne masque/réaffiche pas à la main).
    if (attr === 'common') {
      const kind = partDef(r.part.type).kind;
      for (const [name, dot] of r.hotspots) {
        dot.title = pinDisplayName(kind, name, r.part.type, r.part.attrs);
      }
      if (this.internalShown.has(partId)) this.renderInternalWiring(partId);
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

    // Lot de câbles (Ctrl+clic sur les fils) : résumé + suppression groupée.
    if (this.selectedWires.size > 0) {
      const sub = document.createElement('p');
      sub.className = 'inspector__hint';
      sub.textContent = t('{0} wire(s) selected', this.selectedWires.size);
      this.inspector.appendChild(sub);
      this.appendDeleteButton(t('Delete these wires'), () => {
        for (const id of [...this.selectedWires]) this.removeWire(id);
        this.selectedWires.clear();
        this.renderInspector();
      });
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
    label.textContent = t('Color (Dupont cables)');
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
    // PCA9685 : l'adresse résultant des six pads AD0..AD5, écrite comme sur la
    // fiche du module (0x40..0x7F) — c'est elle qu'attend le programme.
    if (def.kind === 'i2c-pwm') {
      const addr = document.createElement('p');
      addr.className = 'inspector__hint inspector__address';
      addr.textContent = `${t('I²C address')} : ${pca9685AddressText(r.part.attrs)}`;
      this.inspector.appendChild(addr);
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
    if (prop.kind === 'checkbox') {
      // Case à cocher : attr '1' quand cochée, vidé sinon (removeAttribute côté
      // élément — un attribut booléen Lit absent = false). Insérée DANS le
      // libellé pour que le clic sur le texte coche aussi.
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'inspector__checkbox';
      box.checked = current !== '';
      box.addEventListener('change', () => {
        this.updatePartAttr(partId, prop.attr, box.checked ? '1' : '');
      });
      label.prepend(box);
      return;
    }
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
      const step = prop.step ?? 1;
      const clamp = (v: number): number => {
        let r = v;
        if (prop.min !== undefined) r = Math.max(prop.min, r);
        if (prop.max !== undefined) r = Math.min(prop.max, r);
        return r;
      };
      const input = document.createElement('input');
      input.className = 'inspector__control inspector__stepper-input';
      input.type = 'number';
      if (prop.min !== undefined) input.min = String(prop.min);
      if (prop.max !== undefined) input.max = String(prop.max);
      input.step = String(step);
      input.value = current;
      const commit = (v: number): void => {
        // Pas fractionnaire : valeur arrondie à 2 décimales (5,1 + 0,1 → 5,2,
        // jamais 5.199999999999999 — demandé pour l'alim, vaut partout).
        const c = clamp(v);
        const value = String(step < 1 ? Math.round(c * 100) / 100 : c);
        input.value = value;
        this.updatePartAttr(partId, prop.attr, value);
      };
      input.addEventListener('change', () => commit(Number(input.value)));

      const row = document.createElement('div');
      row.className = 'inspector__stepper';
      const dec = document.createElement('button');
      dec.className = 'inspector__stepper-btn';
      dec.type = 'button';
      dec.textContent = '−';
      dec.addEventListener('click', () => commit(Number(input.value) - step));
      const inc = document.createElement('button');
      inc.className = 'inspector__stepper-btn';
      inc.type = 'button';
      inc.textContent = '+';
      inc.addEventListener('click', () => commit(Number(input.value) + step));
      row.append(dec, input, inc);
      this.inspector.appendChild(row);
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
  /** Écran → coordonnées du monde (annule la translation puis le zoom).
   *  `rect` est la boîte de BORDURE du canvas, mais l'origine du monde (et de la
   *  grille) est posée au bord INTÉRIEUR : sans soustraire `clientLeft/Top`
   *  (épaisseur de bordure, 1 px), chaque conversion écran→monde était décalée
   *  de 1/zoom px monde — les composants se calaient 1 px hors grille à la pose
   *  (bien visible en zoomant ensuite). */
  private canvasPoint(clientX: number, clientY: number): XY {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.canvas.clientLeft - this.panX) / this.zoom,
      y: (clientY - rect.top - this.canvas.clientTop - this.panY) / this.zoom,
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

    // Les platines d'essai et le Grove Shield sont dessinés en premier (donc
    // derrière) : sans cela un support ajouté après un composant passait devant
    // lui dans le SVG (la Pico enfichée doit rester visible sur son shield).
    const behind = (k: string): number => (k === 'breadboard' || k === 'grove-shield' ? 0 : 1);
    const order = [...this.rendered.values()].sort(
      (a, b) => behind(partDef(a.part.type).kind) - behind(partDef(b.part.type).kind)
    );
    for (const r of order) {
      if (only && !only.has(r.part.id)) continue; // export limité à la sélection
      const root = r.el.shadowRoot ?? r.el;
      const svgEl = root.querySelector('svg');
      const x = r.part.x;
      const y = r.part.y;
      // Taille d'affichage en unités monde. On lit la mise en page du corps (div
      // bloc, fiable) ; certains éléments Lit ont un SVG en millimètres dont
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

    // Nommage des équipotentielles : chaque fil exporté porte son nom unique
    // `eqp-x-y` en id (x = équipotentielle, y = fil), matérialisé dans le SVG.
    const eqp = nameEquipotentials(this.diagram);
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
      const name = eqp.nameOfWire(wire.id);
      wires.push(
        `<path${name ? ` id="${name}"` : ''} d="${roundedWirePath(pts)}" fill="none" ` +
          `stroke="${dupontHex(wire.color ?? 'green')}" ` +
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
 * des composants forkés) est montrée « K » selon l'usage électronique (Anode /
 * Katode). Pour un potentiomètre, les broches GND/SIG/VCC ne sont pas de
 * l'alimentation : les extrémités du rail résistif sont montrées « 1 » et « 2 »,
 * le curseur « V » (Variable). L'identifiant interne reste inchangé (simulation).
 */
function pinDisplayName(
  kind: string,
  pinName: string,
  type?: string,
  attrs?: Record<string, string>
): string {
  // Clavier matriciel : lignes R{n} → « L{n} » (Ligne), colonnes C{n} inchangées.
  // La lettre des lignes est traduite (R en anglais, L en français).
  if (type === 'keypad') {
    const r = /^R(\d+)$/.exec(pinName);
    if (r) return `${t('R')}${r[1]}`;
  }
  // Broche commune (LED RGB, 7 segments…) : « K » (cathode commune) ou « A »
  // (anode commune) selon l'attribut `common`, au lieu de COM.
  if (/^COM(\.\d+)?$/.test(pinName)) {
    const suffix = pinName.includes('.') ? pinName.slice(pinName.indexOf('.')) : '';
    return (attrs?.common === 'anode' ? 'A' : 'K') + suffix;
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
function segRectOverlap(p: XY, q: XY, r: { x: number; y: number; w: number; h: number }): number {
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

/** Longueur totale et nombre de coudes d'une polyligne H/V (doublons ignorés). */
function polyLenBends(pts: XY[]): { len: number; bends: number } {
  let len = 0;
  let bends = 0;
  let prev: 'h' | 'v' | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = Math.abs(pts[i + 1].x - pts[i].x);
    const dy = Math.abs(pts[i + 1].y - pts[i].y);
    if (dx < 0.5 && dy < 0.5) continue;
    len += dx + dy;
    const ax = dx >= dy ? 'h' : 'v';
    if (prev && ax !== prev) bends++;
    prev = ax;
  }
  return { len, bends };
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
  // startDir/endDir : direction (0=+x,1=−x,2=+y,3=−y, 4 = libre) de la patte
  // d'entrée (a→pa) et de sortie (pb→b) — interdit au tracé de rebrousser le
  // stub (aller-retour de quelques px le long de sa propre patte).
  // `same` : segments des fils de la MÊME équipotentielle — les suivre est
  // ENCOURAGÉ (remise RIDE par px couché dessus) au lieu d'être interdit.
  o: { clr: number; bend: number; gap: number; startDir?: number; endDir?: number; same?: Array<[XY, XY]> },
): XY[] | null {
  const { clr, bend, gap } = o;
  const same = o.same ?? [];
  const startDir = o.startDir ?? 4;
  const endDir = o.endDir ?? 4;
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
  // Pas des voies d'évitement = 1 pas de GRILLE (et non `gap`) : chaque fil
  // supplémentaire s'écarte d'un pas entier, au lieu d'empiler des couloirs au
  // demi-pas hors grille (allers-retours de 5 px aux sorties de broches).
  for (let k = -3; k <= 3; k++) {
    xsSet.add(midX + k * GRID);
    ysSet.add(midY + k * GRID);
  }
  // Voies parallèles autour des deux bornes (± k·gap) : le chevauchement
  // colinéaire d'un autre fil étant interdit, la ligne d'une borne (celle des
  // sorties de broches, partagée par tous les fils d'un même bord) sature dès
  // le 2e fil ; sans ces voies décalées l'A\* n'a plus AUCUN chemin et
  // l'appelant retombe sur un coude en L qui traverse les composants.
  for (let k = 1; k <= 8; k++) {
    for (const v of [pa.x, pb.x]) {
      xsSet.add(v + k * GRID);
      xsSet.add(v - k * GRID);
    }
    for (const v of [pa.y, pb.y]) {
      ysSet.add(v + k * GRID);
      ysSet.add(v - k * GRID);
    }
  }
  // Voies des dorsales même-net : sans leurs lignes exactes, le tracé ne peut
  // pas se poser PILE sur le fil à suivre (le recouvrement resterait approximatif).
  for (const [s, t] of same) {
    xsSet.add(s.x);
    xsSet.add(t.x);
    ysSet.add(s.y);
    ysSet.add(t.y);
  }
  const xs = [...xsSet].sort((m, n) => m - n);
  const ys = [...ysSet].sort((m, n) => m - n);
  const ny = ys.length;
  const ai = xs.indexOf(pa.x);
  const aj = ys.indexOf(pa.y);
  const bi = xs.indexOf(pb.x);
  const bj = ys.indexOf(pb.y);
  if (ai < 0 || aj < 0 || bi < 0 || bj < 0) return null;

  // Un pin peut tomber dans la clearance d'un AUTRE composant (composants
  // jointifs) : on n'interdit pas de traverser un bloc contenant une borne,
  // sinon le fil ne pourrait jamais sortir de sa broche.
  const inRect = (b: { x: number; y: number; w: number; h: number }, p: XY): boolean =>
    p.x > b.x - 0.5 && p.x < b.x + b.w + 0.5 && p.y > b.y - 0.5 && p.y < b.y + b.h + 0.5;
  const solid = blocks.filter((b) => !inRect(b, pa) && !inRect(b, pb));
  // Corps « tolérés » (leur bloc gonflé contient une borne : exclus de `solid`
  // pour laisser la broche s'échapper) : leur traversée reste TAXÉE (×20 par px
  // dans le corps nu) — sortir de sa broche coûte pareil pour tous les chemins,
  // mais une vraie traversée de part en part devient dissuasive. Sans cela, un
  // fil libéré du créneau anti-superposition (dorsale même net) filait tout
  // droit À TRAVERS un composant posé sur la ligne.
  const soft: Array<{ x: number; y: number; w: number; h: number }> = [];
  blocks.forEach((b, i) => {
    if (inRect(b, pa) || inRect(b, pb)) soft.push(obstacles[i]);
  });
  const softCost = (p: XY, q: XY): number => {
    let c = 0;
    for (const r of soft) c += segRectOverlap(p, q, r) * 20;
    return c;
  };
  // Un segment [p,q] aligné traverse-t-il l'intérieur d'un composant ? (test au
  // milieu : valide car aucun bord n'est entre deux lignes de Hanan voisines.)
  const blocked = (p: XY, q: XY): boolean => {
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    for (const b of solid) {
      if (mx > b.x + 0.5 && mx < b.x + b.w - 0.5 && my > b.y + 0.5 && my < b.y + b.h - 0.5) return true;
    }
    return false;
  };
  // Interdit : un segment qui se superpose (colinéaire) à un fil existant — un
  // fil ne « suit » jamais un autre. En revanche les fils peuvent se croiser.
  const wireBlocked = (p: XY, q: XY): boolean => {
    for (const [s, t] of otherSegs) if (collinearOverlap(p, q, s, t) > 2) return true;
    return false;
  };
  // Pénalité douce : proximité parallèle d'un autre fil (écarte les fils voisins).
  const wireCost = (p: XY, q: XY): number => {
    let c = 0;
    for (const [s, t] of otherSegs) c += parallelPenalty(p, q, s, t, gap) * 0.6;
    return c;
  };
  // Pénalité de croisement : couper un fil existant coûte 1,5 coude — un petit
  // détour qui l'évite est préféré, un grand contournement non.
  const crossCost = (p: XY, q: XY): number => {
    let c = 0;
    for (const [s, t] of otherSegs) if (segsCross(p, q, s, t)) c += bend * 1.5;
    return c;
  };
  // Heuristique admissible : avec des dorsales même-net, un px peut ne coûter
  // que (1 − RIDE) — l'estimation est réduite d'autant pour ne jamais surestimer.
  const hK = same.length > 0 ? 1 - RIDE : 1;
  const heur = (i: number, j: number): number => hK * (Math.abs(xs[i] - pb.x) + Math.abs(ys[j] - pb.y));

  // A* : état = nœud × direction SIGNÉE (0=+x, 1=−x, 2=+y, 3=−y, 4 = départ).
  // Le signe permet d'interdire les demi-tours (aller-retour de quelques px sur
  // sa propre ligne, jamais utile sur des voies de Hanan).
  interface St {
    i: number;
    j: number;
    dir: number;
    g: number;
    f: number;
    prev: St | null;
  }
  const keyOf = (i: number, j: number, dir: number): number => (i * ny + j) * 5 + dir;
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

  push({ i: ai, j: aj, dir: startDir, g: 0, f: heur(ai, aj), prev: null });
  const steps: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (heap.length > 0) {
    const cur = pop();
    if (cur.i === bi && cur.j === bj) {
      // Arrivée à contresens de la patte de sortie (pb→b) : le fil repasserait
      // sur sa propre patte — on cherche une autre approche.
      if (endDir !== 4 && cur.dir !== 4 && (cur.dir ^ 1) === endDir) continue;
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
      // Chevauchement de fil interdit — sauf sur une arête touchant une borne
      // (plusieurs fils partagent parfois la même broche : la sortie est tolérée).
      const endEdge =
        (cur.i === ai && cur.j === aj) || (cur.i === bi && cur.j === bj) ||
        (ni === ai && nj === aj) || (ni === bi && nj === bj);
      if (!endEdge && wireBlocked(p, q)) continue;
      const dir = di !== 0 ? (di > 0 ? 0 : 1) : dj > 0 ? 2 : 3;
      // Demi-tour (même axe, sens opposé) : interdit.
      if (cur.dir !== 4 && (cur.dir ^ 1) === dir) continue;
      const turn = cur.dir !== 4 && (cur.dir >> 1) !== (dir >> 1) ? bend : 0;
      const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      // Remise « dorsale » : chaque px couché sur un fil de la même équipotentielle
      // ne coûte que (1 − RIDE) — bornée par `len` (coût d'arête jamais négatif).
      let ride = 0;
      if (same.length > 0) {
        for (const [s, t] of same) ride += collinearOverlap(p, q, s, t);
        if (ride > len) ride = len;
      }
      const g = cur.g + len - ride * RIDE + wireCost(p, q) + crossCost(p, q) + softCost(p, q) + turn;
      const nk = keyOf(ni, nj, dir);
      const prev = bestG.get(nk);
      if (prev !== undefined && prev <= g + 0.01) continue;
      bestG.set(nk, g);
      push({ i: ni, j: nj, dir, g, f: g + heur(ni, nj), prev: cur });
    }
  }
  return null;
}

/** Le point `p` est-il sur le segment H/V [a,b] (à `tol` px près) ? Sert à
 *  interdire qu'un fil passe sur une broche à laquelle il n'est pas connecté. */
function pointOnSegment(p: XY, a: XY, b: XY, tol = 1): boolean {
  const minX = Math.min(a.x, b.x) - tol;
  const maxX = Math.max(a.x, b.x) + tol;
  const minY = Math.min(a.y, b.y) - tol;
  const maxY = Math.max(a.y, b.y) + tol;
  if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;
  // Distance point→droite du segment (H ou V) : |écart| sur l'axe transverse.
  const ax = segAxis(a, b);
  if (ax === 'h') return Math.abs(p.y - a.y) <= tol;
  if (ax === 'v') return Math.abs(p.x - a.x) <= tol;
  // Segment dégénéré (point) : distance euclidienne.
  return Math.hypot(p.x - a.x, p.y - a.y) <= tol;
}

/** Croisement transversal STRICT de deux segments H/V (l'un coupe l'autre en
 *  son intérieur — un simple contact d'extrémité n'est pas un croisement). */
function segsCross(p: XY, q: XY, s: XY, t: XY): boolean {
  const pH = Math.abs(p.y - q.y) < 0.5;
  const sH = Math.abs(s.y - t.y) < 0.5;
  if (pH === sH) return false;
  const h1 = pH ? p : s;
  const h2 = pH ? q : t;
  const v1 = pH ? s : p;
  const v2 = pH ? t : q;
  return (
    v1.x > Math.min(h1.x, h2.x) + 0.5 &&
    v1.x < Math.max(h1.x, h2.x) - 0.5 &&
    h1.y > Math.min(v1.y, v2.y) + 0.5 &&
    h1.y < Math.max(v1.y, v2.y) - 0.5
  );
}

/** Distance d'un point à un segment [a,b]. */
function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
