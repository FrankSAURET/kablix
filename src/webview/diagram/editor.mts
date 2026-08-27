// Éditeur visuel : palette, placement, déplacement, câblage multi-points et
// éditeur de composants (inspecteur). Le modèle logique vit dans model.mts ;
// ici on gère le DOM et les interactions.
//
// Câblage : cliquer une broche démarre un fil ; chaque clic sur le canvas pose
// un point intermédiaire (aimanté horizontal/vertical) ; cliquer une autre
// broche termine le fil. Échap annule. Les fils sont tracés avec un congé à
// chaque changement de direction et colorés selon la nappe Dupont.
import {
  CATEGORY_ORDER,
  PALETTE_CATALOG,
  capacitorDefOf,
  hasPca9685Pads,
  isPicoBoard,
  listCustomParts,
  migratePartAttrs,
  partCategory,
  partDef,
  pca9685AddressText,
  pinElectricalRole,
  registerCustomPart,
  setSimModelPresets,
  unregisterCustomPart,
  type BoardId,
  type CustomPartData,
  type PartDef,
  type PropCondition,
  type PropDef,
  type SimModelPreset,
} from './catalog.mjs';
import {
  DEFAULT_TRANSISTOR_FILTER,
  TRANSISTOR_FILTER_OPTIONS,
  TRANSISTOR_TYPES,
  TYPE_LABELS,
  customRefOf,
  customRefType,
  filterTransistors,
  isCustomRef,
  isMosType,
  transistorAttrs,
  transistorSummary,
  type TransistorFilter,
  type TransistorType,
} from './transistors.mjs';
import { icAttrs, icRef } from './ics.mjs';
import { PACKAGE_LABELS, type TransistorPackage } from '../composants/transistor-element.mjs';
import { nextPartId } from './refnames.mjs';
import { colorDisplayName, colorSwatchBackground } from './colors.mjs';
import { breadboardPins, normalizeSize, stripOfPin } from './breadboard.mjs';
import { embedClipboardInSvg, encodeClipboard, extractClipboard, type ClipboardPayload } from './clipboard.mjs';
import { groveSignalGpio, groveSocketPins } from './grove-shield.mjs';
import { shieldSignalTarget } from './shield.mjs';
import { internalWiringSvg, type PinPoint } from './internal-wiring.mjs';
import { hasPinout, pinoutPoster, loadPinoutSvg } from './pinout.mjs';
import { boardSize } from '../composants/pico-board.mjs';
import { buildNets, nameEquipotentials, type Diagram, type Endpoint, type Part, type Wire } from './model.mjs';
import { DEFAULT_WIRE_COLORS, DUPONT_COLORS, dupontHex, roundedWirePath, snapPoint, type XY } from './geometry.mjs';
import { startAutoPan, type AutoPan } from './autopan.mjs';
import { installerListeCrantee } from './liste-crantee.mjs';
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
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 10; // 1000 %
/** Pas de la grille magnétique d'alignement (px) = écartement des broches. */
const GRID = 10;
/** Côté du carré posé au bout d'un fil, sur sa pastille de connexion : un poil
 *  plus large que le trait (3 px) pour se voir sans manger la broche voisine. */
const WIRE_CAP = 5;
/** Décalage d'un collage par rapport à la copie : 2 pas de grille — la copie
 *  reste visible sous l'original ET ses broches restent enfichables (un décalage
 *  hors grille les aurait toutes désalignées). */
const PASTE_OFFSET = 2 * GRID;
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
 * Cale l'origine d'un composant sur UN axe pour que son DESSIN reste sur la
 * feuille. `v` = origine (`part.x` ou `part.y`), `d` = ce que le dessin dépasse
 * de cette origine vers le haut/la gauche, `size` = son encombrement, `sheet` =
 * la dimension de la feuille.
 *
 * L'ancien `Math.max(0, …)` ne bornait que le haut et la gauche, et le faisait
 * sur l'ORIGINE et non sur le dessin : un composant sortait librement à droite
 * et en bas (constaté par Frank avec la patte de l'araignée), et sa marge de
 * dessin l'arrêtait trop tôt en haut. Les quatre bords sont désormais traités
 * pareil, sur le dessin.
 *
 * Un dessin plus grand que la feuille ne peut pas y tenir : il est alors collé
 * au bord haut/gauche plutôt que renvoyé n'importe où.
 */
const clampAxis = (v: number, d: number, size: number, sheet: number): number => {
  const min = -d; // le dessin touche le bord haut / gauche
  const max = sheet - size - d; // il touche le bord bas / droite
  return max < min ? min : Math.min(Math.max(v, min), max);
};
/**
 * Vrai si l'élément est une SAISIE DE TEXTE en cours : champ de l'inspecteur,
 * recherche de la palette, liste déroulante, ou zone éditable (le terminal
 * série est un `contentEditable`). Sert deux fois : les raccourcis d'édition
 * (Suppr, Ctrl+…) laissent la frappe au texte, et un clic sur la feuille quitte
 * le champ pour rendre le clavier à l'éditeur.
 */
const isTextEntry = (el: Element | null | undefined): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  return (el as HTMLElement).isContentEditable === true;
};
/**
 * Vrai si le type est au catalogue de CE poste (composants standard ou
 * personnalisés enregistrés). Un schéma collé depuis un autre atelier peut citer
 * un composant personnalisé absent d'ici : `partDef` lèverait, on l'ignore.
 */
const knownPartType = (type: string): boolean => {
  try {
    partDef(type);
    return true;
  } catch {
    return false;
  }
};
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

/** « NPN personnalisé », « MOSFET canal N personnalisé »… */
function customTransistorName(type: string): string {
  return t('Custom {0}', t(TYPE_LABELS[type as TransistorType] ?? type));
}

/** Minuscules SANS accents : « Résistance » se trouve en tapant « resistance ». */
function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, ''); // signes diacritiques décomposés par NFD
}

/**
 * Clé de recherche d'un composant : son libellé AFFICHÉ, mais aussi son libellé
 * d'origine (anglais), son `type` et sa catégorie. Frank cherche indifféremment
 * « bouton » ou « button », « pot-rot2 » ou « ajustable » — un seul champ, une
 * seule frappe, quelle que soit la langue de l'interface.
 */
function partSearchKey(def: PartDef, label: string): string {
  const cat = partCategory(def);
  return foldText([label, def.label, def.type, cat, t(cat)].filter(Boolean).join(' '));
}

export class Editor {
  readonly diagram: Diagram = { parts: [], wires: [] };
  onChange: (() => void) | null = null;

  /** Appelé quand la liste des composants personnalisés change (persistance). */
  onCustomPartsChange: ((parts: CustomPartData[]) => void) | null = null;
  /** Appelé pour exporter un composant personnalisé en fichier .kompix. */
  onExportCustomPart: ((part: CustomPartData) => void) | null = null;
  /** Appelé pour ouvrir le gestionnaire de composants (téléchargement depuis les dépôts). */
  onOpenComponentManager: ((() => void)) | null = null;
  /** Appelé quand les préréglages de modèles de simulation changent (persistance). */
  onSimModelsChange: ((models: SimModelPreset[]) => void) | null = null;
  /** Appelé quand le tri de la palette ou les derniers utilisés changent. */
  onPaletteStateChange: ((state: PaletteState) => void) | null = null;
  /** Appelé à l'ajout d'un composant (pose ou glisser-déposer) — sélection auto de la carte. */
  onPartAdded: ((part: Part) => void) | null = null;
  /** Appelé pour ouvrir un lien externe (doc Wokwi d'un composant). */
  onOpenExternal: ((url: string) => void) | null = null;
  /** Appelé pour ouvrir l'aide locale d'un composant (fiche docs/<lang>/composants/<type>.md). */
  onComponentHelp: ((type: string) => void) | null = null;
  /** Appelé pour retoucher un dessin du créateur dans l'éditeur SVG du système. */
  onEditSvg: ((which: 'ext' | 'int', svg: string) => void) | null = null;
  /** Appelé à la fermeture du créateur : plus de dessin à surveiller. */
  onStopEditSvg: (() => void) | null = null;

  /** Dessin revenu de l'éditeur externe (fichier enregistré) → créateur. */
  applyEditedSvg(which: 'ext' | 'int', svg: string): void {
    this.creator.applyEditedSvg(which, svg);
  }
  /**
   * Appelé quand la sélection change : `schema` indique si le composant
   * sélectionné dispose d'un câblage interne ou d'un poster de brochage (pour
   * activer le bouton ☢ de la barre d'outils), et `shown` s'il est affiché.
   */
  onSelectionChange: ((info: { partId: string | null; schema: boolean; shown: boolean }) => void) | null = null;
  /** Appelé quand une action d'ÉDITION est tentée pendant la simulation (verrouillé). */
  onBlockedEdit: (() => void) | null = null;
  /**
   * Écriture du presse-papier SYSTÈME par l'hôte VS Code (repli). L'API
   * `navigator.clipboard` d'une webview peut être refusée (focus, permission) :
   * l'extension, elle, a toujours accès au presse-papier.
   */
  onClipboardWrite: ((text: string) => void) | null = null;
  /**
   * Lecture du presse-papier SYSTÈME par l'hôte VS Code. C'est ce chemin qui
   * permet de coller un schéma copié dans un AUTRE atelier Kablix : chaque
   * webview a son propre presse-papier interne, seul le presse-papier du
   * système leur est commun.
   */
  onClipboardRead: (() => Promise<string | null>) | null = null;
  /** Appelé au changement de VUE (zoom / déplacement de la page). Léger : persiste
   *  la caméra dans l'état webview + le schéma côté hôte, SANS empiler d'edit
   *  (pas de point ● : un zoom n'est pas une modification annulable). */
  onCameraChange: (() => void) | null = null;

  private paletteSort: PaletteSort = 'category';
  private paletteFilter = '';
  /** Message « aucun résultat », posé sous la barre de recherche. */
  private paletteEmpty: HTMLElement | null = null;
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
  /**
   * Composant en cours de POSE depuis la bibliothèque (clic maintenu sur un
   * bouton de palette). Sert à ne recentrer sur le curseur que tant que
   * l'utilisateur n'a pas commencé à le déplacer : la taille réelle du dessin
   * peut n'arriver qu'après plusieurs frames, et un recentrage tardif ferait
   * sauter un composant déjà positionné à la main.
   */
  private placingFromPalette: string | null = null;
  private wirePaths = new Map<string, SVGPathElement>();
  /** Surbrillance « fourmis » des fils sélectionnés (groupe de 2 tracés pointillés). */
  private wireAnts = new Map<string, SVGGElement>();
  /** Carrés de connexion posés aux DEUX bouts de chaque fil (couleur du fil). */
  private wireCaps = new Map<string, SVGGElement>();
  /** Points d'embranchement (jonctions en T des fils d'une même équipotentielle). */
  private junctionsG: SVGGElement | null = null;
  private junctionsQueued = false;
  private pending: PendingWire | null = null;
  /** Défilement automatique du câblage en cours (arrêté avec `pending`). */
  private pendingAutoPan: AutoPan<PointerEvent> | null = null;
  private tempPath: SVGPathElement | null = null;
  /** Bulle de nom de broche affichée pendant le câblage (showPinBubble). */
  private pinBubble: HTMLDivElement | null = null;
  /** Broche que la bulle affichée nomme (pour ne pas la reconstruire à chaque image). */
  private pinBubbleFor: Endpoint | null = null;
  /** Vrai tant qu'on tire l'EXTRÉMITÉ d'un fil existant : la bulle de nom doit
   *  s'afficher là aussi, comme pendant un câblage neuf (retour de Frank). */
  private endpointDrag = false;
  /** Couche (au-dessus des fils) où l'on dessine le rond de sélection de la broche
   *  atteignable au survol, sans hisser le corps du composant. */
  private pinHoistLayer!: HTMLDivElement;
  private pinHoistDot: HTMLDivElement | null = null;
  /** Couche des EXPLICATIONS de défaut, tout en haut de la pile : hisser le
   *  composant fautif (z=65) ne suffisait pas, un SECOND composant fautif (même
   *  z, plus loin dans le DOM) passait encore devant son étiquette
   *  (relais-pico, retour de Frank). L'étiquette sort donc de `.part`. */
  private faultLayer!: HTMLDivElement;
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
    c.onEditSvg = (which, svg) => this.onEditSvg?.(which, svg);
    c.onStopEditSvg = () => this.onStopEditSvg?.();
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
  /** Index d'historique correspondant au dernier ENREGISTREMENT (ou à l'état
   *  chargé). « modifié » = historyIndex différent de celui-ci — ainsi un
   *  aller-retour (pose puis annulation, ou suppression puis annulation) qui
   *  ramène au même état efface bien le point ●. */
  private savedHistoryIndex = 0;
  /** Vrai pendant une restauration (annuler/refaire) : ne pas réenregistrer l'historique. */
  private restoring = false;
  /** Vrai pendant la fenêtre de settle qui suit un chargement (re-snap différé des
   *  composants tournés, mise à l'échelle des dessins Lit). Les notify émis dans
   *  cette fenêtre déplacent des composants au pixel près SANS action utilisateur :
   *  ils sont enregistrés dans l'historique (pour l'undo) mais la référence
   *  « enregistré » suit, de sorte que `isDirty()` reste faux — sinon un projet
   *  propre rouvert apparaît « à enregistrer » (faux point ● natif). */
  private settling = false;
  /** Minuterie qui clôt la fenêtre `settling` (après le dernier re-snap différé). */
  private settleEndTimer: ReturnType<typeof setTimeout> | undefined;
  /** Presse-papier interne pour dupliquer une sélection (Ctrl+C / Ctrl+V / Ctrl+D). */
  private clipboard: ClipboardPayload | null = null;
  /** Décalage des collages successifs d'une MÊME copie : 20, 40, 60 px… (sinon
   *  deux Ctrl+V posaient les copies exactement l'une sur l'autre). La clé est
   *  la charge utile collée : coller autre chose repart de 20 px. */
  private pasteRun: { key: string; n: number } | null = null;
  /** Quadrillage de la feuille affiché (bouton ▦ de la barre de dessin). */
  private gridShown = true;
  /** Explications de défaut affichées (bouton ⚠ de la barre de simulation). */
  private faultNotesShown = true;

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
    // Couche du rond de sélection de broche (au-dessus des fils) : cf. onPointerHover.
    this.pinHoistLayer = document.createElement('div');
    this.pinHoistLayer.className = 'pin-hoist-layer';
    this.world.appendChild(this.pinHoistLayer);
    // Couche des explications de défaut : posée EN DERNIER dans le monde, elle
    // couvre tout le reste quoi qu'il arrive (cf. setFaultNote).
    this.faultLayer = document.createElement('div');
    this.faultLayer.className = 'fault-layer';
    this.world.appendChild(this.faultLayer);

    this.buildPalette();
    this.renderInspector();
    this.buildZoomBadge();
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);
    // Le clic droit sert au déplacement des composants : pas de menu contextuel.
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Toucher la feuille REND LE CLAVIER à l'éditeur (v2026.8.70). L'appui sur
    // un composant est `preventDefault()` (startDrag, pour ne pas sélectionner
    // de texte pendant le glissé) — or c'est justement ce preventDefault qui
    // empêche le navigateur de déplacer le focus. Après une saisie dans
    // l'inspecteur ou dans la recherche de la palette, le focus RESTAIT dans le
    // champ : la touche Suppr allait au texte, jamais au composant sélectionné.
    // Le champ est donc quitté (son `change` part au passage) et le canvas,
    // focusable par `tabindex="-1"`, prend le relais.
    this.canvas.tabIndex = -1;
    this.canvas.addEventListener(
      'pointerdown',
      (e) => {
        // Champ posé DANS la feuille (curseur de simulation, saisie d'un
        // composant) : on le laisse prendre le focus normalement.
        if (isTextEntry(e.composedPath()[0] as Element | null)) return;
        const active = document.activeElement as HTMLElement | null;
        if (isTextEntry(active)) active?.blur();
        if (document.activeElement !== this.canvas) this.canvas.focus({ preventScroll: true });
      },
      true
    );
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
    // Broche recouverte par un voisin : quand le curseur en approche une, on
    // hisse SON composant au-dessus des corps qui la masquent (cf. onPointerHover),
    // pour qu'elle reste survolable et cliquable.
    this.canvas.addEventListener('pointermove', this.onPointerHover);
    // Zoom à la molette, centré sur le curseur.
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // (Le glisser-déposer HTML5 depuis la palette a été retiré en v2026.7.136 :
    // la pose se fait désormais par DÉPLACEMENT — cf. startPlaceFromPalette.)
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
      // EXCEPTION : l'alim (kind psu) est un GROS dessin traversé par des câbles ;
      // la hisser à z=60 la ferait passer devant TOUT le câblage au lancement de
      // la sim (moche — demande de Frank). Son bouton de tension est un dessin SVG
      // plein (pas un <input> HTML) : il reste cliquable sous les fils dès que le
      // corps recapte les pointeurs. On la garde donc SOUS les fils en sim.
      if (partDef(r.part.type).simControl) {
        const def = partDef(r.part.type);
        // Contrôle DESSINÉ (bouton SVG plein, bascule du dessin) : il répond dès
        // que le corps recapte les pointeurs, sans passer devant le câblage.
        // L'alim, le multimètre et l'oscilloscope sont dans ce cas — Frank ne
        // veut pas voir les fils disparaître derrière un appareil de mesure —,
        // et un composant de bibliothèque dont tout le contrôle tient dans ses
        // bascules (le cavalier et la flèche du lecteur de badges) aussi.
        const keepUnderWires =
          def.kind === 'psu' ||
          def.kind === 'meter' ||
          def.kind === 'scope' ||
          (!def.custom?.control && (def.custom?.toggles?.length ?? 0) > 0);
        r.container.classList.toggle('part--sim-active', locked && !keepUnderWires);
        r.container.classList.toggle('part--sim-under-wires', locked && keepUnderWires);
        // `makeDrawingHitPainted` a posé `pointer-events:none` EN INLINE sur le
        // host kablix-* (letterbox du viewBox) : le curseur/bouton HTML du
        // contrôle de simulation (un <input>, pas un trait SVG) héritait ce
        // `none` et devenait insaisissable à la souris → « les curseurs ne
        // marchent plus ». En sim on rend le host captant (le dessin reste
        // peint) ; au déverrouillage on rétablit l'état letterbox-transparent.
        (r.el as unknown as HTMLElement).style.pointerEvents = locked ? 'auto' : 'none';
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

  /** L'état courant diffère-t-il du dernier enregistrement ? (point ●) */
  isDirty(): boolean {
    return this.historyIndex !== this.savedHistoryIndex;
  }

  /** Marque l'état courant comme « enregistré » (après un save ou un chargement)
   *  — le point ● s'efface tant qu'on ne s'en écarte pas. */
  markSaved(): void {
    this.savedHistoryIndex = this.historyIndex;
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
    // Le facteur est publié en variable CSS : les bulles d'aide des composants
    // s'en servent pour se CONTRE-mettre à l'échelle et garder leur taille (et
    // leur distance à la souris) de 100 % quel que soit le zoom. Une propriété
    // personnalisée est héritée et traverse le shadow DOM des composants.
    this.world.style.setProperty('--kablix-zoom', String(this.zoom));
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
    this.onCameraChange?.();
  };

  /** Caméra courante (zoom + translation de la page), pour la persistance .projix. */
  getCamera(): { zoom: number; panX: number; panY: number } {
    return { zoom: this.zoom, panX: this.panX, panY: this.panY };
  }

  /** Restaure une caméra enregistrée. Ignore les valeurs invalides (schéma ancien). */
  setCamera(cam?: { zoom?: number; panX?: number; panY?: number } | null): boolean {
    if (!cam) return false;
    const { zoom, panX, panY } = cam;
    if (![zoom, panX, panY].every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom as number));
    this.panX = panX as number;
    this.panY = panY as number;
    this.applyTransform();
    return true;
  }

  /**
   * Broche recouverte par un composant voisin : le corps d'un composant (surtout
   * ceux à gros viewBox ou à fond plein) capte le clic sur tout son rectangle et
   * masque les broches d'un autre placé dessous — impossible de les câbler. Au
   * survol, on repère la broche la plus proche du curseur et on hisse SON composant
   * (`.part--pin-reachable`, z=4) au-dessus des corps VOISINS pour que la vraie
   * pastille reçoive le clic — mais TOUJOURS SOUS LES FILS (z=5) : le dessin ne
   * masque jamais les autres fils (demande de Frank). Seuls le rond de sélection
   * de la broche (dessiné dans `pinHoistLayer`, z=46) et sa bulle passent au premier
   * plan. Le hissage suit le curseur et disparaît dès qu'on s'en éloigne. Sans effet
   * pendant un drag/pan ou en simulation (broches inertes).
   */
  private pinReachablePart: string | null = null;
  private pinReachablePin: string | null = null;
  private onPointerHover = (e: PointerEvent): void => {
    // Inerte en simulation, ou quand un bouton est enfoncé hors câblage
    // (déplacement/pan/marquee en cours) : le hissage ne doit pas perturber un geste.
    //
    // PENDANT un câblage, au contraire, c'est là qu'il sert le plus : Frank ne
    // pouvait pas TERMINER un fil sur un trou de platine dès qu'un composant
    // était posé à côté (son dessin plein vole le clic), alors que la même
    // broche s'attrapait très bien sans fil en cours. Le halo cliquable
    // (`pin-hoist-dot`, au-dessus de tout) rattrape le clic pour elle.
    if (this.locked || (e.buttons !== 0 && !this.pending)) {
      this.clearPinReachable();
      return;
    }
    // Broche la plus proche du curseur, dans un petit rayon (en pixels écran).
    const R = 9; // ~ rayon d'une pastille, généreux pour la viser
    let bestPart: string | null = null;
    let bestPin: string | null = null;
    let bestD = R * R;
    for (const [id, r] of this.rendered) {
      for (const [name, dot] of r.hotspots) {
        const b = dot.getBoundingClientRect();
        const dx = e.clientX - (b.left + b.width / 2);
        const dy = e.clientY - (b.top + b.height / 2);
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestPart = id;
          bestPin = name;
        }
      }
    }
    if (bestPart === this.pinReachablePart && bestPin === this.pinReachablePin) return;
    if (this.pinReachablePart) {
      this.rendered.get(this.pinReachablePart)?.container.classList.remove('part--pin-reachable');
    }
    this.pinReachablePart = bestPart;
    this.pinReachablePin = bestPin;
    if (bestPart) {
      // Le container est hissé au-dessus des corps voisins (mais SOUS les fils),
      // pour que la vraie pastille reçoive le clic.
      this.rendered.get(bestPart)?.container.classList.add('part--pin-reachable');
    }
    this.updatePinHoistDot();
  };

  /** Retire le hissage et le rond de sélection de broche (fin de survol, geste,
   *  câblage, simulation). */
  private clearPinReachable(): void {
    if (this.pinReachablePart) {
      this.rendered.get(this.pinReachablePart)?.container.classList.remove('part--pin-reachable');
    }
    this.pinReachablePart = null;
    this.pinReachablePin = null;
    this.pinHoistDot?.remove();
    this.pinHoistDot = null;
  }

  /** Dessine (ou retire) le rond de sélection de la broche atteignable dans la
   *  couche au-dessus des fils, à son centre en coordonnées monde. */
  private updatePinHoistDot(): void {
    const part = this.pinReachablePart;
    const pin = this.pinReachablePin;
    const center = part && pin ? this.hotspotCenter({ partId: part, pin }) : null;
    if (!center) {
      this.pinHoistDot?.remove();
      this.pinHoistDot = null;
      return;
    }
    if (!this.pinHoistDot) {
      this.pinHoistDot = document.createElement('div');
      this.pinHoistDot.className = 'pin-hoist-dot';
      // Le halo n'est pas qu'un repère : il CÂBLE. Une broche recouverte par le
      // dessin plein d'un voisin restait inaccessible malgré le hissage — celui
      // d'une PLATINE ne peut d'ailleurs pas jouer (elle passerait devant les
      // composants enfichés dessus, z figé à 1). Comme le halo est déjà posé
      // au-dessus de tout, à l'aplomb exact de la broche visée, il relaie le
      // clic à celle-ci : le trou de platine redevient câblable, composant
      // voisin ou pas, en câblage comme au repos.
      this.pinHoistDot.addEventListener('pointerdown', (ev) => {
        // …sauf au CLIC DROIT, qui n'a jamais servi à câbler : il attrape le
        // composant. Le halo posé au-dessus de tout l'avalait, et un composant
        // enfiché sur une platine devenait impossible à saisir dès qu'une
        // pastille jaune s'allumait dessus (signalé par Frank).
        if (this.pinRightClick(ev)) {
          this.grabPartUnder(ev, this.pinReachablePart);
          return;
        }
        const target = this.pinHoistTarget();
        if (!target) return;
        ev.stopPropagation();
        this.onPinDown(target, ev);
      });
      this.pinHoistDot.addEventListener('pointerup', (ev) => {
        if (this.pinRightClick(ev)) return; // relâché du clic droit : c'est le composant qui l'a
        const target = this.pinHoistTarget();
        if (!target) return;
        ev.stopPropagation();
        this.onPinUp(target, ev);
      });
      this.pinHoistLayer.appendChild(this.pinHoistDot);
    }
    this.pinHoistDot.style.left = `${center.x}px`;
    this.pinHoistDot.style.top = `${center.y}px`;
    this.pinHoistDot.title = this.pinHoistTitle();
  }

  /** Broche actuellement sous le halo (celle que le clic doit atteindre). */
  private pinHoistTarget(): Endpoint | null {
    const partId = this.pinReachablePart;
    const pin = this.pinReachablePin;
    return partId && pin ? { partId, pin } : null;
  }

  /** Nom affiché de la broche sous le halo (le halo masque le `title` de la pastille). */
  private pinHoistTitle(): string {
    const target = this.pinHoistTarget();
    if (!target) return '';
    const part = this.diagram.parts.find((p) => p.id === target.partId);
    if (!part) return '';
    return pinDisplayName(partDef(part.type).kind, target.pin, part.type, part.attrs);
  }

  /**
   * Clic DROIT sur une pastille (halo jaune de survol d'une broche, ou rond de
   * hissage) : à réserver au composant. Le clic droit ne câble pas — il
   * sélectionne et déplace —, or les pastilles avalaient tout bouton confondu.
   * Les trous d'une platine d'essai en couvrent le corps des composants
   * enfichés dessus : la LED ou la résistance devenait impossible à attraper
   * dès qu'une pastille jaune s'allumait. Sans effet en simulation ni pendant
   * un câblage, où le comportement d'origine des pastilles est conservé.
   */
  private pinRightClick(ev: PointerEvent): boolean {
    return ev.button === 2 && !this.locked && !this.pending;
  }

  /**
   * Composant réellement DESSINÉ sous un point de l'écran, pastilles et halo
   * mis de côté : celui que l'utilisateur voit et croit attraper. On relit
   * l'empilement au point visé (`elementsFromPoint`, du dessus vers le dessous)
   * et on retient le premier qui appartient à un composant — le vide d'un
   * dessin creux laisse donc passer vers celui du dessous, exactement comme un
   * clic ordinaire (cf. `makeDrawingHitPainted`).
   */
  private partUnderPoint(x: number, y: number): Part | null {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.classList.contains('pin') || el.classList.contains('pin-hoist-dot')) continue;
      const container = el.closest('.part');
      if (!container) continue;
      for (const [id, r] of this.rendered) {
        if (r.container === container) return this.diagram.parts.find((p) => p.id === id) ?? null;
      }
    }
    return null;
  }

  /**
   * Attrape au clic droit le composant sous la pastille cliquée. À défaut de
   * dessin sous le curseur (pastille posée dans le vide), c'est le composant
   * propriétaire de la pastille qui est pris — le comportement d'un clic droit
   * sur son corps.
   */
  private grabPartUnder(ev: PointerEvent, ownerId: string | null): void {
    const part =
      this.partUnderPoint(ev.clientX, ev.clientY) ??
      (ownerId ? this.diagram.parts.find((p) => p.id === ownerId) ?? null : null);
    if (!part) return;
    ev.stopPropagation();
    this.startDrag(ev, part);
  }

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
    // Le DESSIN, pas le cadre du composant (v2026.8.68) : un cadre est toujours
    // plus grand que ce qu'il montre — celui du robot araignée déborde de plus
    // de 200 px, et le recentrage ajustait donc le zoom sur du vide. `drawExtent`
    // mesure le rectangle de sélection, rotation et miroir compris.
    for (const r of this.rendered.values()) {
      const e = this.drawExtent(r.part.id);
      grow(r.part.x + e.dx, r.part.y + e.dy);
      grow(r.part.x + e.dx + e.w, r.part.y + e.dy + e.h);
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
    this.onCameraChange?.();
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
      this.onCameraChange?.();
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
   * Fait suivre la vue au curseur pendant un glissé (voir `autopan.mts`) :
   * composant déplacé, coude de fil, câblage en cours, boîte de sélection. Le
   * geste en cours est REJOUÉ après chaque pas de défilement — sans ça, la vue
   * filerait sous un composant resté immobile dans le monde.
   *
   * La caméra n'est publiée (persistance) qu'à la fin du geste, comme pour le
   * déplacement au bouton du milieu : un `onCameraChange` par pas d'horloge
   * inonderait l'historique.
   */
  private beginAutoPan<E extends { clientX: number; clientY: number }>(
    replay: (ev: E) => void
  ): AutoPan<E> {
    let bouge = false;
    const auto = startAutoPan<E>(
      {
        viewport: () => this.canvas.getBoundingClientRect(),
        pan: (dx, dy) => {
          bouge = true;
          this.panX += dx;
          this.panY += dy;
          this.applyTransform();
        },
      },
      replay
    );
    return {
      track: (ev: E) => auto.track(ev),
      tick: () => auto.tick(),
      stop: () => {
        auto.stop();
        if (bouge) this.onCameraChange?.();
      },
    };
  }

  /**
   * Garde le pointeur jusqu'au relâché : sans capture, un `pointerup` survenu
   * HORS de la fenêtre n'est jamais délivré et le geste reste collé au curseur
   * — d'autant plus gênant depuis que la vue suit la souris au-delà du bord.
   * Rend la fonction de libération, à appeler à la fin du geste.
   */
  private capturePointer(e: PointerEvent): () => void {
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointeur déjà disparu : rien à libérer */
    }
    return () => {
      if (this.canvas.hasPointerCapture?.(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    };
  }

  /**
   * Affiche ou masque le quadrillage de la feuille (bouton ▦ de la barre de
   * dessin). Le fond blanc de la feuille est conservé : seul le quadrillage
   * disparaît, la zone de travail reste donc délimitée comme avant. La grille
   * MAGNÉTIQUE (pose des composants au pas de 10 px) n'est pas touchée — c'est
   * un réglage d'affichage, pas de comportement.
   */
  toggleGrid(on?: boolean): boolean {
    const next = on ?? !this.gridShown;
    this.gridShown = next;
    this.canvas.classList.toggle('canvas--no-grid', !next);
    return next;
  }

  /** Le quadrillage est-il affiché ? */
  isGridShown(): boolean {
    return this.gridShown;
  }

  /**
   * Affiche ou masque les ÉTIQUETTES d'explication des défauts (bouton ⚠ de la
   * barre de simulation). Le cadre rouge, lui, reste : il désigne le coupable
   * sans rien recouvrir, alors que le texte finit par masquer un schéma serré
   * quand plusieurs composants tombent en défaut en même temps.
   */
  toggleFaultNotes(on?: boolean): boolean {
    const next = on ?? !this.faultNotesShown;
    this.faultNotesShown = next;
    this.canvas.classList.toggle('canvas--no-faults', !next);
    return next;
  }

  /** Les explications de défaut sont-elles affichées ? */
  isFaultNotesShown(): boolean {
    return this.faultNotesShown;
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
    this.onCameraChange?.();
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
   * Composant venu d'ailleurs que de la bibliothèque : créé ici (créateur) ou
   * importé à la main. C'est LUI qui porte l'étoile ★ — un composant téléchargé
   * depuis un dépôt est un composant comme les autres, l'étoile n'apprendrait
   * rien (Frank, v2026.8.89). Elle sert aussi de garde aux boutons d'export :
   * on n'exporte que ce qu'on a fabriqué soi-même.
   */
  private isHomeMade(def: PartDef): boolean {
    if (!def.custom) return false;
    return this.customData.get(def.type)?.kompixMeta?.origin !== 'remote';
  }

  /**
   * Bouton de la palette : miniature du composant + libellé (liste d'items).
   * Clic = pose au centre ; glisser = pose au lâcher, avec la miniature comme
   * image de glissement (on voit le composant suivre le curseur).
   */
  private paletteButton(def: PartDef, star: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'palette__item';
    // Un composant personnalisé garde son libellé tel quel (il vient du
    // manifeste, pas du catalogue traduit).
    const label = star ? `★ ${def.label}` : def.custom ? def.label : t(def.label);
    btn.title = label;
    btn.dataset.search = partSearchKey(def, label);
    const thumb = this.thumbnail(def);
    const text = document.createElement('span');
    text.className = 'palette__item-label';
    text.textContent = label;
    btn.append(thumb, text);
    // Pose par DÉPLACEMENT (v2026.7.136, remplace le glisser-déposer HTML5 dont
    // l'image de glissement ne correspondait pas à ce qui se posait) : le
    // composant est créé sous le curseur dès l'appui et suit la souris jusqu'au
    // relâché. Un clic SANS déplacement pose simplement le composant là, sous le
    // curseur, et le sélectionne (`startDrag` s'en charge) — le clavier reste
    // servi par l'activation `keydown` ci-dessous.
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.locked || this.pending) return;
      this.startPlaceFromPalette(e, def.type);
    });
    // Accessibilité : le bouton reste activable au clavier (Entrée / Espace),
    // qui n'a pas de position de curseur — pose au centre de la zone visible.
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!this.locked) this.addPartAtVisibleCenter(def.type);
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
  /**
   * Ligne de palette d'un composant personnalisé.
   *
   * Deux boutons ont disparu en v2026.8.89, à la demande de Frank :
   * - l'export ⇩ n'a de sens que pour un composant fabriqué ICI — un composant
   *   téléchargé, son .kompix existe déjà chez celui qui l'a publié ;
   * - la suppression ✕ vit maintenant dans le GESTIONNAIRE de composants, qui
   *   demande confirmation et liste ce qui est réellement installé.
   */
  private appendCustomRow(def: PartDef): void {
    const data = this.customData.get(def.type);
    const homeMade = this.isHomeMade(def);
    const row = document.createElement('div');
    row.className = 'palette__custom';
    row.dataset.search = partSearchKey(def, homeMade ? `★ ${def.label}` : def.label);
    const btn = this.paletteButton(def, homeMade);
    btn.title = t('Click: place on canvas — double-click: edit the model');
    btn.addEventListener('dblclick', () => {
      if (data) this.creator.open(data);
    });
    row.append(btn);
    if (homeMade) {
      const exp = document.createElement('button');
      exp.className = 'palette__custom-del';
      exp.style.color = 'inherit';
      exp.textContent = '⇩';
      exp.title = t('Export this part (.kompix)');
      exp.addEventListener('click', () => {
        if (data) this.onExportCustomPart?.(data);
      });
      row.append(exp);
    }
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
    // Échap vide la recherche SANS quitter le champ : on peut retaper aussitôt.
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || search.value === '') return;
      e.stopPropagation(); // sinon l'éditeur comprend « annuler le geste en cours »
      search.value = '';
      this.paletteFilter = '';
      this.filterPalette();
    });
    this.palette.appendChild(search);

    // Recherche sans réponse : la palette resterait VIDE sans un mot d'explication.
    this.paletteEmpty = document.createElement('p');
    this.paletteEmpty.className = 'palette__empty';
    this.paletteEmpty.textContent = t('No component matches this search.');
    this.paletteEmpty.style.display = 'none';
    this.palette.appendChild(this.paletteEmpty);

    const customs = listCustomParts();
    const byLabel = (a: PartDef, b: PartDef): number =>
      t(a.label).localeCompare(t(b.label), undefined, { sensitivity: 'base' });

    // Derniers utilisés (10 max), en tête — sauf si masqués par le bouton 🕘.
    const recentDefs = this.recentTypes
      .map((type) => PALETTE_CATALOG.find((d) => d.type === type) ?? customs.find((d) => d.type === type))
      .filter((d): d is PartDef => d !== undefined);

    // Applique le mode de pliage aux sections présentes (avant leur création).
    if (this.paletteFold !== 'auto') {
      const presentKeys: string[] = [];
      if (this.showRecents && recentDefs.length > 0) presentKeys.push('recent');
      if (this.paletteSort === 'category') {
        for (const c of CATEGORY_ORDER) {
          if (PALETTE_CATALOG.some((d) => partCategory(d) === c) || customs.some((d) => d.custom?.category === c)) {
            presentKeys.push(c);
          }
        }
        if (customs.some((d) => !CATEGORY_ORDER.includes(d.custom?.category ?? ''))) presentKeys.push('custom');
      }
      this.paletteCollapsed = this.paletteFold === 'collapse' ? new Set(presentKeys) : new Set();
    }

    if (this.showRecents && recentDefs.length > 0) {
      this.paletteSection(t('Recently used'), 'recent');
      for (const def of recentDefs) this.palette.appendChild(this.paletteButton(def, this.isHomeMade(def)));
    }

    if (this.paletteSort === 'alpha') {
      // En-tête séparant les derniers utilisés de la liste alphabétique complète.
      this.paletteSection(t('All components'));
      // Liste plate, tous composants confondus, triée sur le libellé traduit.
      for (const def of [...PALETTE_CATALOG, ...customs].sort(byLabel)) {
        if (def.custom) this.appendCustomRow(def);
        else this.palette.appendChild(this.paletteButton(def, false));
      }
    } else {
      for (const category of CATEGORY_ORDER) {
        const defs = PALETTE_CATALOG.filter((d) => partCategory(d) === category).sort(byLabel);
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
    create.className = 'palette__item palette__item--action palette__item--create';
    create.textContent = t('+ Create a part');
    create.addEventListener('click', () => this.creator.open());
    this.palette.appendChild(create);

    // Ouverture du gestionnaire de composants (installer, télécharger, retirer).
    // Mis en évidence aux couleurs du bouton principal du thème (demande de
    // Frank, v2026.8.91) : c'est de là qu'on peuple la palette.
    const importBtn = document.createElement('button');
    importBtn.className = 'palette__item palette__item--action palette__item--manage';
    importBtn.textContent = t('⚙ Manage components');
    // window.postMessage ne sort pas de la webview : c'est l'hôte qui ouvre le
    // gestionnaire, donc il faut passer par le rappel branché sur vscode.postMessage.
    importBtn.addEventListener('click', () => {
      this.onOpenComponentManager?.();
    });
    this.palette.appendChild(importBtn);

    this.filterPalette();
  }

  /**
   * Met à jour l'affichage des items selon la recherche ET le repli des sections,
   * et masque les en-têtes vides en recherche — sans reconstruire la palette (le
   * champ garde le focus). Une recherche active ignore le repli (les résultats
   * d'une section repliée restent visibles).
   */
  private filterPalette(): void {
    // Recherche par MOTS (ordre libre, accents indifférents) : « pot ajust »
    // trouve le potentiomètre ajustable, « rgb led » comme « led rgb ».
    const words = foldText(this.paletteFilter).split(/\s+/).filter(Boolean);
    const q = words.length > 0 ? words.join(' ') : '';
    let header: HTMLElement | null = null;
    let headerHasVisible = false;
    let collapsed = false;
    let found = 0;
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
      // Les boutons d'ACTION (« + Créer », « ⚙ Gérer ») ne sont pas des composants :
      // ni la recherche ni le repli de la dernière section ne doivent les masquer.
      // Ils sont posés après la dernière section, donc `collapsed` vaut encore celui
      // de cette section — sans cette exclusion, replier la dernière les fait disparaître.
      const isItem =
        (child.classList.contains('palette__item') && !child.classList.contains('palette__item--action')) ||
        child.classList.contains('palette__custom');
      if (!isItem) continue;
      const label = child.dataset.search ?? foldText(child.textContent ?? '');
      const match = words.every((w) => label.includes(w));
      // Hors recherche, une section repliée masque ses items (l'en-tête reste).
      child.style.display = match && (q !== '' || !collapsed) ? '' : 'none';
      if (match) {
        headerHasVisible = true;
        found++;
      }
    }
    flush();
    if (this.paletteEmpty) this.paletteEmpty.style.display = q && found === 0 ? '' : 'none';
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
  /**
   * Recharge les composants personnalisés persistés (envoyés par l'extension).
   *
   * Les instances DÉJÀ posées sont re-rendues : la définition de la
   * bibliothèque arrive après le schéma d'un .projix, qui embarque, lui, le
   * dessin tel qu'il était à l'enregistrement. Sans ce re-rendu, le registre et
   * la palette étaient à jour mais les composants du schéma gardaient leur
   * ancien corps (Frank, v2026.8.91).
   */
  loadCustomParts(parts: CustomPartData[]): void {
    const types = new Set<string>();
    for (const data of parts) {
      this.customData.set(data.type, data);
      registerCustomPart(data);
      types.add(data.type);
    }
    let touched = false;
    for (const [id, r] of [...this.rendered]) {
      if (!types.has(r.part.type)) continue;
      this.rerenderPart(id);
      touched = true;
    }
    // Un corps re-rendu déplace ses pattes : les fils doivent suivre.
    if (touched) {
      this.redrawWires();
      this.scheduleSettle();
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

  /** Oublie un modèle personnalisé : instances posées, registre, données. */
  private forgetCustomPart(type: string): void {
    // Retire d'abord les instances posées sur le canvas.
    for (const part of [...this.diagram.parts]) {
      if (part.type === type) this.removePart(part.id);
    }
    this.customData.delete(type);
    unregisterCustomPart(type);
  }

  /**
   * Retire des modèles supprimés AILLEURS (gestionnaire de composants) : le
   * fichier .kompix est déjà effacé, il ne faut donc surtout pas renvoyer la
   * liste à l'extension — elle réécrirait ce qu'on vient d'enlever.
   */
  dropCustomParts(types: string[]): void {
    let touched = false;
    for (const type of types) {
      if (!this.customData.has(type)) continue;
      this.forgetCustomPart(type);
      touched = true;
    }
    if (touched) this.buildPalette();
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
    // silent : addPart + centrage + snap = UNE pose ; seul le snap final notifie.
    const part = this.addPart(type, center.x, center.y, true);
    this.centerPartOn(part.id, center);
    this.snapPartToGrid(part.id);
    return part;
  }

  /**
   * Pose depuis la BIBLIOTHÈQUE en un seul geste (v2026.7.136, item « il serait
   * plus simple que cette fonction corresponde à un déplacement ») : au clic
   * maintenu sur un bouton de palette, le composant est créé tout de suite,
   * centré sur le curseur, puis confié à `startDrag` — la même mécanique que le
   * déplacement d'un composant déjà posé. Il hérite donc SANS code neuf de la
   * grille magnétique, de l'enfichage sur platine (aperçu compris), du
   * déplacement de groupe et de la persistance au relâché.
   *
   * Le glisser-déposer HTML5 n'y arrivait pas : le navigateur pose une IMAGE de
   * glissement dont il fixe lui-même l'ancrage à l'écran, et le composant réel
   * n'était créé qu'au lâcher — d'où un décalage entre ce qu'on voit et ce qui
   * se pose, que le recentrage après coup ne rattrapait qu'imparfaitement.
   * Ici, ce qu'on déplace EST le composant : il n'y a plus d'écart possible.
   */
  private startPlaceFromPalette(e: PointerEvent, type: string): void {
    if (this.locked || this.pending) return;
    e.preventDefault();
    const part = this.addPart(type, 0, 0, true); // silent : seul le notify() du lâcher compte
    this.placingFromPalette = part.id;
    // Distingue un simple clic (pas de déplacement) d'un glisser : le curseur
    // d'appui est sur la palette (à gauche) ; un clic sec doit poser le composant
    // au CENTRE de la vue, pas sous la palette. Passé ce seuil, on suit le curseur.
    const startX = e.clientX;
    const startY = e.clientY;
    let dragged = false;
    // Suivi ABSOLU du curseur (et non par delta comme `startDrag`) : la taille
    // réelle du dessin n'arrive qu'après le rendu Lit, et peut encore grandir
    // plusieurs frames plus tard (`scheduleSettle` / `applyPinScale`). En
    // recentrant à CHAQUE mouvement sur la position courante, le composant reste
    // collé au curseur quelle que soit la taille connue à l'instant t — un
    // ancrage figé à l'appui laissait, lui, un écart permanent (mesuré : 16 px).
    // Ancrage initial au centre de la vue (le curseur d'appui est sur la palette) :
    // un clic sec y reste ; le premier déplacement réel bascule le suivi au curseur.
    let at = this.visibleWorldCenter();
    this.centerPartOn(part.id, at);
    // Aperçu d'enfichage PENDANT le geste (comme un déplacement ordinaire) : sans
    // lui, les bandes de la platine ne s'allumaient qu'après avoir posé puis
    // repris le composant. Mêmes règles d'éligibilité que `startDrag` ; les trous
    // ne bougent pas pendant le geste, une seule collecte suffit.
    const def = partDef(type);
    const kind = def.kind;
    const holes = this.collectBreadboardHoles(part.id, plugRule(def));
    const preview = (): void => {
      if (holes.length > 0) this.previewBreadboardSnap(part, holes);
    };
    const follow = (): void => {
      if (this.placingFromPalette !== part.id) return;
      this.centerPartOn(part.id, at);
      preview(); // les broches n'existent qu'après le rendu : on ré-essaie à chaque passage
    };
    // Le dessin peut grossir après coup : on recentre sur quelques frames, avec
    // repli par minuterie (hors écran, rAF n'est jamais appelé).
    for (const d of [0, 16, 32, 64, 120]) setTimeout(follow, d);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(follow);

    // PAS de défilement automatique ici (demande de Frank) : le geste PART de la
    // palette, donc du bord gauche de la vue. La bande sensible se déclencherait
    // dès l'appui et la vue filerait avant même qu'on ait choisi où poser. Le
    // composant une fois lâché se déplace, lui, avec la vue qui suit.
    const move = (ev: PointerEvent): void => {
      if (!dragged && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) dragged = true;
      at = this.canvasPoint(ev.clientX, ev.clientY);
      this.centerPartOn(part.id, at);
      this.redrawWires();
      preview();
    };
    const end = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      this.clearBreadboardHighlights();
      // Clic sec (jamais déplacé) : pose au centre de la vue. Sinon : sous le curseur.
      at = dragged ? this.canvasPoint(ev.clientX, ev.clientY) : this.visibleWorldCenter();
      this.centerPartOn(part.id, at);
      this.placingFromPalette = null;
      // Alignement final sur la grille (comme toute pose) puis enfichage
      // éventuel sur une platine posée dessous, via le chemin ordinaire.
      // silent : la pose entière = UNE entrée d'historique via le notify() final.
      this.snapPartToGrid(part.id, true);
      this.plugPlacedPart(part);
      this.redrawWires();
      this.select({ kind: 'part', id: part.id });
      this.notify();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  /**
   * Enfiche un composant fraîchement posé dans la platine (ou le socle Grove)
   * situé sous lui, s'il y a lieu — même règle que le déplacement ordinaire :
   * ni les platines ni les cartes ne s'enfichent, sauf la Pico sur son socle.
   */
  private plugPlacedPart(part: Part): void {
    const rule = plugRule(partDef(part.type));
    if (!rule) return;
    const holes = this.collectBreadboardHoles(part.id, rule);
    // silent : la pose depuis palette fusionne l'enfichage dans son notify() final.
    if (holes.length > 0) this.plugIntoBreadboard(part, holes, true);
  }

  /**
   * Recale un composant pour que son CORPS soit centré sur un point du monde.
   * `addPart` positionne le coin haut-gauche ; la taille réelle n'est connue
   * qu'après le rendu Lit, d'où l'appel possible en deux temps (tout de suite,
   * puis au cycle suivant quand la taille est enfin non nulle).
   */
  private centerPartOn(partId: string, center: XY): void {
    const r = this.rendered.get(partId);
    const body = r?.container.querySelector('.part__body') as HTMLElement | null;
    if (!r || !body) return;
    const p = this.clampToSheet(partId, center.x - (body.offsetWidth || 40) / 2,
      center.y - (body.offsetHeight || 40) / 2);
    r.part.x = p.x;
    r.part.y = p.y;
    r.container.style.left = `${r.part.x}px`;
    r.container.style.top = `${r.part.y}px`;
  }

  /**
   * Encombrement RÉEL du dessin d'un composant, exprimé autour de son origine
   * (`part.x` / `part.y`) et en px monde : `dx` / `dy` = ce que le dessin dépasse
   * vers la gauche et le haut, `w` / `h` = sa taille visible. C'est le rectangle
   * de sélection qui est mesuré — donc rotation et miroir compris, et sans le
   * vide du viewBox (51 px sous un servomoteur, par exemple).
   *
   * Repli sur la boîte DOM quand le SVG n'est pas mesurable (largeur en %,
   * viewport non résolu, composant pas encore rendu).
   */
  private drawExtent(partId: string): { dx: number; dy: number; w: number; h: number } {
    const r = this.rendered.get(partId);
    const body = r?.container.querySelector('.part__body') as HTMLElement | null;
    const repli = { dx: 0, dy: 0, w: body?.offsetWidth || 40, h: body?.offsetHeight || 40 };
    if (!r) return repli;
    try {
      this.fitSelectionBox(partId);
      const sel = r.container.querySelector('.part__selbox') as HTMLElement | null;
      const svg = (r.el.shadowRoot ?? r.el).querySelector('svg');
      const b = (sel ?? svg)?.getBoundingClientRect();
      if (b && b.width > 0 && b.height > 0) {
        const tl = this.canvasPoint(b.left, b.top);
        const br = this.canvasPoint(b.right, b.bottom);
        return {
          dx: Math.min(tl.x, br.x) - r.part.x,
          dy: Math.min(tl.y, br.y) - r.part.y,
          w: Math.abs(br.x - tl.x),
          h: Math.abs(br.y - tl.y),
        };
      }
    } catch {
      // SVG non mesurable : repli sur la boîte DOM.
    }
    return repli;
  }

  /** Position d'origine ramenée dans la feuille, dessin compris (cf. `clampAxis`). */
  private clampToSheet(partId: string, x: number, y: number): XY {
    const e = this.drawExtent(partId);
    return {
      x: clampAxis(x, e.dx, e.w, SHEET_W),
      y: clampAxis(y, e.dy, e.h, SHEET_H),
    };
  }


  addPart(type: string, x = 40 + this.diagram.parts.length * 30, y = 60, silent = false): Part {
    const def = partDef(type);
    const part: Part = { id: this.freeRef(type), type, x, y, attrs: { ...def.attrs } };
    this.diagram.parts.push(part);
    this.renderPart(part);
    this.recordRecent(type);
    this.select({ kind: 'part', id: part.id }); // à la pose : montre le câblage interne
    this.onPartAdded?.(part); // ex. : sélection automatique de la carte de simulation
    // `silent` : la pose (palette / centre) enchaîne addPart puis positionnement ;
    // seul le notify() FINAL doit empiler une entrée d'historique, sinon 1 pose =
    // 2 undos (origine puis suppression).
    if (!silent) this.notify();
    return part;
  }

  /** Repère libre du prochain composant de ce type (R1, R2, BP1…). */
  private freeRef(type: string): string {
    return nextPartId(type, this.diagram.parts.map((p) => p.id));
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
   *  `silent` : pas d'entrée d'historique (recollages internes en lot).
   *  `onlyRotated` : ne recolle QUE les composants tournés (chargement d'un
   *  schéma) — un composant droit posé volontairement hors grille garde sa
   *  position, alors que le balayage inconditionnel le déplaçait jusqu'à 5 px
   *  par axe à chaque ouverture (visible surtout sur les composants non câblés,
   *  aucun fil ne venant masquer le glissement). */
  private snapPartToGrid(partId: string, silent = false, onlyRotated = false): void {
    const off = this.gridOffset(partId);
    const r = this.rendered.get(partId);
    if (!off || !r) return;
    if (onlyRotated && !(r.part.rotation ?? 0)) return;
    const cale = this.clampToSheet(partId, snapToGrid(r.part.x + off.x) - off.x,
      snapToGrid(r.part.y + off.y) - off.y);
    r.part.x = cale.x;
    r.part.y = cale.y;
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
    // L'explication de défaut vit hors du composant (couche `faultLayer`) :
    // elle ne part donc plus avec lui, il faut la retirer à la main.
    this.faultLayer.querySelector(`.part__fault[data-part="${CSS.escape(id)}"]`)?.remove();
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
   * Composant grillé : hisse son conteneur (classe `.part--burned`, z=70) pour
   * que l'explosion « Boum », enfermée dans le shadow DOM du composant (donc
   * dans le contexte d'empilement de `.part`, z=3), passe par-dessus les fils
   * (z=5) et tout le reste. Appelé par sim.mts en même temps que `el.burned`.
   */
  setBurned(id: string, burned: boolean): void {
    this.rendered.get(id)?.container.classList.toggle('part--burned', burned);
  }

  /**
   * Composant mis en cause par un message de défaut : cadre ROUGE aux dimensions
   * exactes du rectangle de sélection (c'est la même boîte mesurée). Le message
   * de la barre d'état nomme le coupable, le cadre le montre — sur un schéma
   * chargé, lire « (Mod2) » ne suffisait pas à le trouver des yeux.
   */
  setFaulty(id: string, faulty: boolean, note = ''): void {
    const r = this.rendered.get(id);
    if (!r) return;
    r.container.classList.toggle('part--faulty', faulty);
    this.setFaultNote(id, r.container, faulty ? note : '');
  }

  /**
   * L'étiquette qui EXPLIQUE le défaut, posée à côté du composant encadré (jaune
   * sur rouge, pendant la simulation seulement). Le cadre désigne le coupable,
   * l'étiquette dit quoi corriger — la barre d'état, elle, ne garde que la
   * dernière phrase et se perd de vue sur un grand schéma.
   *
   * Elle vit dans `faultLayer` et NON dans `.part` : hisser le composant fautif
   * (z=65) ne la sortait pas d'affaire dès qu'un SECOND composant tombait en
   * défaut — même z-index, plus loin dans le DOM, il passait devant l'étiquette
   * du premier (relais-pico, retour de Frank). Une couche à part, posée en
   * dernier dans le monde, ne peut être recouverte par aucun composant.
   *
   * Elle n'est donc pas non plus portée par `.part__body` : le corps subit la
   * rotation du composant, un relais tourné à 90° aurait écrit son message de
   * bas en haut. La position est calculée en pixels du MONDE (la couche subit
   * le même zoom/translation que les composants).
   */
  private setFaultNote(id: string, container: HTMLElement, text: string): void {
    const sel = `.part__fault[data-part="${CSS.escape(id)}"]`;
    let note = this.faultLayer.querySelector(sel) as HTMLElement | null;
    if (!text) {
      note?.remove();
      return;
    }
    if (!note) {
      note = document.createElement('div');
      note.className = 'part__fault';
      note.dataset.part = id;
      this.faultLayer.appendChild(note);
    }
    note.textContent = text;
    const body = container.querySelector('.part__body') as HTMLElement | null;
    // Position calée sur le DESSIN mesuré (`.part__selbox`, la boîte du cadre
    // rouge) plutôt que sur le corps : un composant tourné à 90° déborde de sa
    // boîte de mise en page, l'étiquette lui serait tombée dessus. Les rectangles
    // écran se ramènent en pixels du monde par le zoom.
    const box = (container.querySelector('.part__selbox') as HTMLElement | null) ?? body;
    const z = this.zoom || 1;
    const wr = this.world.getBoundingClientRect();
    const br = box?.getBoundingClientRect();
    if (br && br.width > 0) {
      note.style.left = `${(br.right - wr.left) / z + 12}px`;
      note.style.top = `${(br.top - wr.top) / z}px`;
    } else {
      const cr = container.getBoundingClientRect();
      note.style.left = `${(cr.left - wr.left) / z + (body?.offsetWidth ?? 0) + 12}px`;
      note.style.top = `${(cr.top - wr.top) / z}px`;
    }
  }

  /** Retire tous les cadres rouges (nouveau lancement, arrêt, réinitialisation). */
  clearFaults(): void {
    for (const r of this.rendered.values()) r.container.classList.remove('part--faulty');
    this.faultLayer.replaceChildren();
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
    for (const g of this.wireCaps.values()) g.remove();
    this.wireCaps.clear();
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
  serialize(): { parts: Part[]; wires: Wire[]; camera: { zoom: number; panX: number; panY: number } } {
    const d = JSON.parse(JSON.stringify(this.diagram)) as { parts: Part[]; wires: Wire[] };
    // Caméra (zoom + position de la page) jointe au schéma : elle est ainsi
    // enregistrée dans le .projix et restaurée à la réouverture.
    return { ...d, camera: this.getCamera() };
  }

  /**
   * Recharge un schéma sauvegardé. Les identifiants sont régénérés (et les fils
   * ré-aiguillés) pour éviter toute collision avec d'éventuels composants déjà
   * créés pendant la session.
   */
  loadDiagram(data: {
    parts?: Part[];
    wires?: Wire[];
    camera?: { zoom?: number; panX?: number; panY?: number } | null;
  }): void {
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
    // Fenêtre de settle : tout notify émis d'ici la dernière passe de re-snap ne
    // compte pas comme une édition (cf. `notify`), le projet reste « propre ».
    this.settling = true;
    if (this.settleEndTimer) clearTimeout(this.settleEndTimer);
    this.settleEndTimer = setTimeout(() => {
      this.settling = false;
      this.settleEndTimer = undefined;
    }, 1000); // > dernière minuterie (800 ms) + marge
    for (const ms of [120, 350, 800]) {
      setTimeout(() => {
        for (const id of [...this.rendered.keys()]) this.snapPartToGrid(id, true, true);
      }, ms);
    }
    // Les repères du fichier sont CONSERVÉS : R1 reste R1 d'une ouverture à
    // l'autre (c'est le nom que porte le schéma sur le papier et dans les
    // messages de simulation). Seuls un doublon ou un repère vide — vieux
    // fichier, fusion à la main — reçoivent un repère neuf, les fils suivant
    // par la table de correspondance.
    const idMap = new Map<string, string>();
    for (const p of data.parts ?? []) {
      const free = !p.id || this.diagram.parts.some((q) => q.id === p.id);
      const np: Part = { ...p, id: free ? this.freeRef(p.type) : p.id, attrs: migratePartAttrs(p) };
      idMap.set(p.id, np.id);
      this.diagram.parts.push(np);
      this.renderPart(np);
    }
    for (const w of data.wires ?? []) {
      // Composant devenu SANS broches (le robot araignée, v2026.8.24 : il porte
      // sa propre carte) : les fils qu'un vieux schéma lui avait câblés ne
      // mènent plus nulle part. On les écarte à l'ouverture plutôt que de les
      // garder invisibles dans le fichier — un fil qu'on ne voit pas mais qui
      // pèse dans la netlist est pire qu'un fil absent.
      if ([w.a, w.b].some((e) => this.isPinless(idMap.get(e.partId) ?? e.partId))) continue;
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
    // Caméra enregistrée : restaurée telle quelle (l'appelant ne fera pas fitView).
    this.setCamera(data.camera);
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
    const power = this.powerRoleOf([a, b]);
    if (power === 'gnd') return 'black';
    if (power === 'vcc') return 'red';
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
    const role = this.powerRoleOf([wire.a, wire.b]);
    return role === 'gnd' ? 'black' : role === 'vcc' ? 'red' : null;
  }

  /**
   * Rôle d'alimentation d'un fil : celui de ses propres extrémités, sinon celui
   * d'une broche d'alim posée sur le MÊME nœud électrique. Un CI (ou n'importe
   * quel composant) enfiché sur une platine d'essai amène son VCC/GND à toute
   * la bande : les fils plantés dans les autres trous de cette bande doivent en
   * prendre la couleur. La masse l'emporte quand le nœud voit les deux.
   */
  private powerRoleOf(ends: readonly Endpoint[]): 'gnd' | 'vcc' | null {
    let vcc = false;
    for (const e of ends) {
      const role = this.pinPowerRole(e);
      if (role === 'gnd') return 'gnd';
      if (role === 'vcc') vcc = true;
    }
    if (vcc) return 'vcc';
    // Rien en direct : on interroge le nœud. `joinResistors: false` évite qu'une
    // alim traverse une résistance (l'autre patte n'est plus un rail d'alim).
    const nets = buildNets(this.diagram, false);
    const targets = new Set(ends.map((e) => nets.netOf(e)));
    for (const w of this.diagram.wires) {
      for (const e of [w.a, w.b]) {
        if (!targets.has(nets.netOf(e))) continue;
        const role = this.pinPowerRole(e);
        if (role === 'gnd') return 'gnd';
        if (role === 'vcc') vcc = true;
      }
    }
    return vcc ? 'vcc' : null;
  }

  /**
   * Rôle d'alim d'une broche ('gnd' / 'vcc'), sinon null. Potentiomètre exclu :
   * ses extrémités ne sont pas des rails d'alimentation (cohérent avec
   * l'affichage des pastilles).
   */
  private pinPowerRole(e: Endpoint): 'gnd' | 'vcc' | null {
    const part = this.diagram.parts.find((p) => p.id === e.partId);
    if (!part || partDef(part.type).kind === 'potentiometer') return null;
    const role = pinElectricalRole(part.type, e.pin);
    return role === 'gnd' || role === 'vcc' ? role : null;
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
    // Un shield-socle descend d'un cran de plus (z=0) : la Pico (mcu, z=1)
    // enfichée dessus doit rester visible par-dessus le shield. Une carte fille
    // posée SUR sa carte hôte fait l'inverse : elle passe devant elle (z=2).
    if (def.kind === 'grove-shield') {
      container.classList.add(def.custom?.shield?.host ? 'part--shield-top' : 'part--shield');
    }
    // Platine d'essai : marquée pour qu'elle NE REMONTE JAMAIS devant les
    // composants enfichés dessus au survol de ses trous (cf. styles.css).
    if (def.kind === 'breadboard') container.classList.add('part--board');
    // Trous serrés (pas de 10 px) : pastilles réduites pour rester cliquables.
    if (def.kind === 'breadboard' || def.kind === 'grove-shield') container.classList.add('part--dense');
    container.style.left = `${part.x}px`;
    container.style.top = `${part.y}px`;

    const head = document.createElement('div');
    head.className = 'part__head';
    // Identifiant du composant, affiché par la case « Afficher l'id des
    // composants » du menu Noms (classe `canvas--show-ids`). Le séparateur est
    // un span à part : il ne sort que si l'id ET le nom sont visibles.
    const pid = document.createElement('span');
    pid.className = 'part__id';
    pid.textContent = part.id;
    head.appendChild(pid);
    const sep = document.createElement('span');
    sep.className = 'part__sep';
    sep.textContent = ' - ';
    head.appendChild(sep);
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
    this.makeDrawingHitPainted(el);

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
      const attr = def.custom?.shield?.switch?.attr ?? 'pwr';
      const defaut = def.attrs?.[attr] ?? '3v3';
      el.addEventListener('pwr-change', () => {
        part.attrs = { ...part.attrs, [attr]: el.getAttribute(attr) ?? defaut };
        if (this.selection?.kind === 'part' && this.selection.id === part.id) {
          this.renderPartInspector(part.id);
        }
        this.notify();
      });
    }
    // Bascules du dessin (cavalier de mode, badge RFID…) : le clic sur la pièce
    // écrit son attribut et émet `toggle-change` → on persiste dans le schéma et
    // on resynchronise l'inspecteur s'il montre ce composant.
    if (def.custom?.toggles?.length) {
      el.addEventListener('toggle-change', (e) => {
        const attr = (e as CustomEvent<{ attr: string; value: string }>).detail?.attr;
        if (!attr) return;
        part.attrs = { ...part.attrs, [attr]: el.getAttribute(attr) ?? '' };
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

  /** Ce composant du schéma n'a AUCUNE broche (drapeau `pinless` du catalogue) :
   *  rien ne peut lui être câblé. Lu sur la définition, pas sur l'élément, dont
   *  le `pinInfo` peut n'arriver qu'après le rendu. */
  private isPinless(partId: string): boolean {
    const type = this.diagram.parts.find((p) => p.id === partId)?.type;
    if (!type) return false;
    try {
      return partDef(type).pinless === true;
    } catch {
      return false;
    }
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
  /**
   * Le corps (`.part__body`) est `pointer-events: none` (cf. styles.css) : sa
   * zone rectangulaire vide — le letterbox du viewBox — ne doit pas recouvrir les
   * broches d'un composant voisin. Le DESSIN reste néanmoins déplaçable là où il
   * est peint : on remet son `<svg>` (dans le shadow DOM du fork Lit, hors de
   * portée du CSS global) en `visiblePainted`, qui laisse passer les clics sur le
   * vide interne mais capte les traits. Le clic sur un trait remonte au listener de
   * glissement posé sur le corps. Appelé après le rendu Lit (updateComplete).
   */
  private makeDrawingHitPainted(el: WokwiElement): void {
    // Le HOST (élément HTML kablix-*) capterait tout son rectangle, letterbox
    // compris : on le neutralise et on rend son <svg> interne captant sur ses
    // seuls traits peints.
    (el as unknown as HTMLElement).style.pointerEvents = 'none';
    const apply = () => {
      const root = (el as unknown as { shadowRoot?: ShadowRoot }).shadowRoot ?? el;
      for (const svg of root.querySelectorAll('svg')) {
        (svg as SVGSVGElement).style.pointerEvents = 'visiblePainted';
      }
    };
    const uc = (el as unknown as { updateComplete?: Promise<unknown> }).updateComplete;
    if (uc && typeof uc.then === 'function') void uc.then(apply);
    else apply();
    // Filet de sécurité : certains forks publient leur SVG un cycle plus tard.
    requestAnimationFrame(apply);
  }

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
    // rouge/noire (les rôles restent actifs pour la couleur auto des fils), et
    // le multimètre et l'oscilloscope pour la même raison.
    const role = kind === 'potentiometer' ? 'other' : pinElectricalRole(type, pin.name);
    if (type !== 'alim' && type !== 'multimetre' && type !== 'oscillo') {
      if (role === 'vcc') dot.classList.add('pin--vcc');
      else if (role === 'gnd') dot.classList.add('pin--gnd');
    }
    const pos = this.pinPos(type, kind, pin, anchor);
    dot.style.left = `${pos.x}px`;
    dot.style.top = `${pos.y}px`;
    dot.title = pinDisplayName(kind, pin.name, type, attrs);
    dot.addEventListener('pointerdown', (e) => {
      // Clic droit : la pastille s'efface devant le composant qu'elle recouvre
      // (cf. pinRightClick) — sinon un trou de platine volait la saisie de la
      // LED enfichée dessus.
      if (this.pinRightClick(e)) {
        this.grabPartUnder(e, partId);
        return;
      }
      e.stopPropagation();
      this.onPinDown({ partId, pin: pin.name }, e);
    });
    dot.addEventListener('pointerup', (e) => {
      if (this.pinRightClick(e)) return;
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

  /**
   * Bulle de nom sur la broche VISÉE pendant qu'on tire une extrémité de fil
   * existante. Le survol ne peut rien déclencher dans ce geste (la poignée reste
   * collée au curseur), et la broche d'arrivée était donc muette alors qu'elle
   * se nomme pendant un câblage neuf. On suit ici l'accrochage lui-même :
   * la bulle nomme exactement la broche qui sera reliée en lâchant.
   */
  private trackPinBubble(endpoint: Endpoint | null): void {
    const memo = this.pinBubbleFor;
    if (endpoint && memo && endpoint.partId === memo.partId && endpoint.pin === memo.pin) return;
    this.hidePinBubble();
    if (!endpoint) return;
    const dot = this.rendered.get(endpoint.partId)?.hotspots.get(endpoint.pin);
    if (dot) this.showPinBubble(dot, endpoint);
  }

  /** Bulle de nom instantanée sur la broche visée pendant le câblage. */
  private showPinBubble(dot: HTMLDivElement, endpoint: Endpoint): void {
    if ((!this.pending && !this.endpointDrag) || this.locked) return;
    this.hidePinBubble();
    this.pinBubbleFor = endpoint;
    const p = this.hotspotCenter(endpoint);
    if (!p) return;
    const part = this.diagram.parts.find((q) => q.id === endpoint.partId);
    if (!part) return;
    const bubble = document.createElement('div');
    bubble.className = 'pin-bubble';
    bubble.textContent = pinDisplayName(partDef(part.type).kind, endpoint.pin, part.type, part.attrs);
    // Ancrée au CENTRE de la broche : l'écart de 9 px est posé dans la transform
    // de `.pin-bubble`, pour rester 9 px à l'écran quel que soit le zoom.
    bubble.style.left = `${p.x}px`;
    bubble.style.top = `${p.y}px`;
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
    this.pinBubbleFor = null;
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
    // Le composant repart neuf, sans son cadre rouge : son explication, qui vit
    // désormais dans une couche à part, ne doit pas rester seule à l'écran.
    this.faultLayer.querySelector(`.part__fault[data-part="${CSS.escape(id)}"]`)?.remove();
    this.renderPart(r.part);
  }

  // --- Rotation / retournement -------------------------------------------------
  private applyRotation(part: Part, body: HTMLDivElement): void {
    const deg = part.rotation ?? 0;
    const sx = part.flipH ? -1 : 1;
    const sy = part.flipV ? -1 : 1;
    body.style.transformOrigin = 'center center';
    // Le miroir est posé AVANT la rotation dans la liste CSS (= appliqué APRÈS
    // elle sur le dessin : la fonction la plus à gauche est la plus externe).
    // Autrement le miroir jouait dans le repère LOCAL du composant : sur une
    // diode couchée à 90°, « retourner horizontalement » la retournait
    // verticalement à l'écran — les deux axes paraissaient échangés.
    const tf: string[] = [];
    if (sx !== 1 || sy !== 1) tf.push(`scale(${sx}, ${sy})`);
    if (deg) tf.push(`rotate(${deg}deg)`);
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
    const inMulti = this.selectedParts.has(part.id) && this.selectedParts.size > 1;
    // Un composant est sélectionné DÈS L'APPUI, sans attendre le relâchement :
    // le panneau montre ses propriétés pendant qu'on le glisse. Exception, le
    // membre d'une sélection multiple — réduire tout de suite la sélection à lui
    // seul empêcherait de déplacer le lot ; c'est le clic sans glissé (plus bas)
    // qui la réduit.
    const dejaSeul = this.selection?.kind === 'part' && this.selection.id === part.id;
    if (!inMulti && !dejaSeul) {
      this.select({ kind: 'part', id: part.id });
    }
    const roots = inMulti ? [...this.selectedParts] : [part.id];
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
    const pluggable = isGroup ? null : plugRule(partDef(part.type));
    const holes = this.collectBreadboardHoles(part.id, pluggable);

    // Grille magnétique pour faciliter l'alignement, sauf pour un composant
    // enfichable au-dessus d'une platine (il s'aligne alors sur les trous).
    const useGrid = holes.length === 0;
    const primary = members.find((m) => m.rr.part.id === part.id) ?? members[0];
    // Décalage de la première broche par rapport à l'origine du composant : on
    // aligne CETTE broche sur la grille (et donc toutes les autres, espacées de
    // multiples du pas), pas le coin du composant.
    const pinOff = this.gridOffset(part.id) ?? { x: 0, y: 0 };
    // Bornes du geste : elles portent sur le DÉCALAGE COMMUN, pas sur chaque
    // composant pris à part. Un lot borné membre par membre se déformerait au
    // premier qui touche un bord (les autres continueraient d'avancer) — le lot
    // s'arrête donc ensemble, dès que l'un d'eux atteint la marge.
    // Mesuré une seule fois à l'appui : la taille du dessin ne change pas pendant
    // le glissé, et mesurer à chaque `pointermove` coûterait un reflow par image.
    const bornes = members.map((m) => {
      const e = this.drawExtent(m.rr.part.id);
      return {
        minDx: -(m.ox + e.dx),
        maxDx: SHEET_W - e.w - e.dx - m.ox,
        minDy: -(m.oy + e.dy),
        maxDy: SHEET_H - e.h - e.dy - m.oy,
      };
    });
    const minDx = Math.max(...bornes.map((b) => b.minDx));
    const maxDx = Math.min(...bornes.map((b) => b.maxDx));
    const minDy = Math.max(...bornes.map((b) => b.minDy));
    const maxDy = Math.min(...bornes.map((b) => b.maxDy));
    // Caméra à l'appui : le suivi se fait par DELTA d'écran, il faut donc
    // retrancher ce que la vue a défilé toute seule depuis (cf. autopan.mts),
    // sinon le composant s'échapperait du curseur d'autant.
    const startPanX = this.panX;
    const startPanY = this.panY;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      auto.track(ev);
      // Le déplacement écran est converti en déplacement monde (zoom courant).
      let wdx = (dx - (this.panX - startPanX)) / this.zoom;
      let wdy = (dy - (this.panY - startPanY)) / this.zoom;
      if (useGrid && primary) {
        // Aligne la première broche du meneur sur la grille ; le même décalage
        // s'applique au groupe pour préserver les positions relatives.
        wdx = snapToGrid(primary.ox + wdx + pinOff.x) - pinOff.x - primary.ox;
        wdy = snapToGrid(primary.oy + wdy + pinOff.y) - pinOff.y - primary.oy;
      }
      // Le bornage vient APRÈS l'accrochage à la grille : au bord de la feuille
      // c'est le bord qui gagne, comme le faisait déjà l'ancienne butée à zéro.
      wdx = maxDx < minDx ? minDx : Math.min(Math.max(wdx, minDx), maxDx);
      wdy = maxDy < minDy ? minDy : Math.min(Math.max(wdy, minDy), maxDy);
      for (const m of members) {
        m.rr.part.x = m.ox + wdx;
        m.rr.part.y = m.oy + wdy;
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
    const auto = this.beginAutoPan<PointerEvent>(move);
    const release = this.capturePointer(e);
    const end = () => {
      auto.stop();
      release();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
      this.clearBreadboardHighlights();
      if (!moved) {
        // Déjà sélectionné à l'appui ; ne reste que le cas d'une sélection
        // multiple, qu'un clic sans glissé réduit à ce seul composant.
        if (inMulti) this.select({ kind: 'part', id: part.id });
      } else if (pluggable) {
        this.plugIntoBreadboard(part, holes); // notifie si des fils auto changent
        this.notify(); // persiste la nouvelle position même sans enfichage
      } else {
        this.notify(); // déplacement (carte, platine, groupe) : à persister
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    // Filets : pointeur perdu ou fenêtre défocalisée — le défilement
    // automatique ne doit jamais rester en marche après le geste.
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
  }

  // --- Platine d'essai : surbrillance et enfichage -----------------------------
  /**
   * Trous des supports d'enfichage posés, en coordonnées canvas, selon la règle
   * du composant déplacé (voir `plugRule`). Sur un shield-socle, seuls les trous
   * du socle comptent : les prises Grove et le connecteur SPI sont femelles.
   */
  private collectBreadboardHoles(excludeId: string, rule: PlugRule | null): BreadboardHole[] {
    const holes: BreadboardHole[] = [];
    if (!rule) return holes;
    for (const r of this.rendered.values()) {
      if (r.part.id === excludeId) continue;
      const d = partDef(r.part.type);
      if (d.kind !== rule.host) continue;
      const spec = d.custom?.shield;
      // Une carte fille qui s'emboîte elle-même ailleurs n'est pas un socle.
      if (rule.onSupport && spec?.host) continue;
      const socket = rule.onSupport ? new Set(spec ? spec.socket : groveSocketPins()) : null;
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
    // Carte fille : seules ses pastilles mâles entrent dans la carte hôte.
    const own = plugRule(partDef(part.type))?.own;
    const matches: Array<{ pin: string; hole: BreadboardHole; dx: number; dy: number }> = [];
    for (const pin of r.hotspots.keys()) {
      if (own && !own.has(pin)) continue;
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
  private plugIntoBreadboard(part: Part, holes: BreadboardHole[], silent = false): void {
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
    if (changed && !silent) this.notify();
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
    // Le fil suit la souris jusqu'au bord : la vue défile pour découvrir la
    // broche visée quand elle est hors champ (le geste dure jusqu'au fil posé,
    // bouton relâché compris — d'où l'arrêt dans `cancelPending`).
    this.pendingAutoPan = this.beginAutoPan<PointerEvent>((ev) => this.onPointerMove(ev));

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
    // Un fil qu'on vient de tracer est le fil sur lequel on travaille : il
    // devient la sélection (couleur, coudes, Suppr) sans un clic de plus.
    this.select({ kind: 'wire', id: wire.id });
  }

  private cancelPending(): void {
    this.pending = null;
    this.tempPath?.remove();
    this.tempPath = null;
    this.pendingAutoPan?.stop();
    this.pendingAutoPan = null;
    this.hidePinBubble();
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pending || !this.tempPath) return;
    this.pendingAutoPan?.track(e);
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
    // Saisie en cours : la frappe appartient au texte, pas au schéma. On regarde
    // la CIBLE RÉELLE (`composedPath`, sinon un champ dans le shadow d'un
    // composant remonte sous la forme de son hôte) et, à défaut, l'élément qui a
    // le focus — les deux diffèrent quand un handler a redirigé l'événement.
    const target = (e.composedPath()[0] ?? e.target) as Element | null;
    const typing = isTextEntry(target) || isTextEntry(document.activeElement);
    // Raccourcis Ctrl : annuler/refaire, copier (toujours), coller/dupliquer.
    if (e.ctrlKey && !typing) {
      const k = e.key.toLowerCase();
      // Annuler/refaire : NE PAS traiter ici. Dans le CustomEditor VS Code
      // (onglet .projix), Ctrl+Z/Y sont captés par VS Code, qui pilote la pile
      // du document et rappelle la webview (messages 'undo'/'redo'). Intercepter
      // ici (preventDefault) empêcherait VS Code de recevoir le raccourci et
      // désynchroniserait le point ● « non enregistré ».
      if (k === 'z' || k === 'y') {
        return;
      }
      if (k === 'c') {
        // Copie autorisée même en simulation (lecture seule).
        e.preventDefault();
        this.copySelection();
        return;
      }
      if (k === 'v' && !this.locked) {
        // preventDefault : le collage natif (qui ne saurait de toute façon rien
        // faire d'un schéma) est écarté, un SEUL chemin colle — la lecture
        // asynchrone du presse-papier système, qui atteint aussi les copies
        // faites dans un AUTRE atelier Kablix.
        e.preventDefault();
        void this.pasteFromSystem();
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
      // Retour arrière : sans ça, la webview pourrait encore l'entendre comme un
      // « page précédente » de navigateur.
      e.preventDefault();
      if (this.selectedParts.size > 0) {
        // Lot MIXTE (rectangle de sélection) : les câbles pris dans la boîte
        // partent avec les composants. Les traiter d'abord évite de courir après
        // ceux que `removePart` a déjà emportés (fils branchés sur le composant).
        const wires = [...this.selectedWires];
        const ids = [...this.selectedParts];
        this.selectedWires.clear();
        for (const id of wires) this.removeWire(id);
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
    // Carrés de connexion : ils marquent le point d'accrochage du fil, comme la
    // goutte de soudure d'un vrai montage. Dessinés APRÈS le tracé (donc
    // au-dessus) et inertes au pointeur — le fil reste sélectionnable dessous.
    const caps = document.createElementNS(SVG_NS, 'g');
    caps.setAttribute('class', 'wire-caps');
    for (let i = 0; i < 2; i++) {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('width', String(WIRE_CAP));
      r.setAttribute('height', String(WIRE_CAP));
      caps.appendChild(r);
    }
    this.svg.appendChild(caps);
    this.wireCaps.set(wire.id, caps);
    this.setCapsColor(wire);
    this.positionWire(wire);
  }

  /** Couleur des deux carrés d'un fil (suit `wire.color`). */
  private setCapsColor(wire: Wire): void {
    const caps = this.wireCaps.get(wire.id);
    if (!caps) return;
    const hex = dupontHex(wire.color ?? 'green');
    for (const r of caps.children) (r as SVGRectElement).style.fill = hex;
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
    this.endpointDrag = true;
    const move = (ev: PointerEvent): void => {
      auto.track(ev);
      const at = this.canvasPoint(ev.clientX, ev.clientY);
      handle.style.left = `${at.x}px`;
      handle.style.top = `${at.y}px`;
      // La broche d'arrivée se nomme, comme pendant un câblage neuf : c'est
      // l'accrochage réel qu'on suit, donc la bulle annonce ce que le lâcher fera.
      const vise = this.nearestPin(at);
      const autre = which === 'a' ? wire.b : wire.a;
      const bon = vise && !(vise.partId === autre.partId && vise.pin === autre.pin);
      this.trackPinBubble(bon ? vise : null);
      if (path) {
        const other = this.hotspotCenter(which === 'a' ? wire.b : wire.a);
        const mids = wire.points ?? [];
        const pts = which === 'a' ? [at, ...mids, ...(other ? [other] : [])] : [...(other ? [other] : []), ...mids, at];
        path.setAttribute('d', roundedWirePath(pts));
      }
    };
    // L'extrémité tirée au bord entraîne la vue, comme un coude ou un composant
    // (retour de Frank) : sans ça, rebrancher un fil sur une broche hors écran
    // obligeait à lâcher, déplacer la vue, puis reprendre l'extrémité.
    const auto = this.beginAutoPan<PointerEvent>(move);
    const end = (ev: PointerEvent): void => {
      auto.stop();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      this.endpointDrag = false;
      this.hidePinBubble();
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
   * retenue est celle du DESSIN, c'est-à-dire **exactement le rectangle de
   * sélection** (`fitSelectionBox` → `getBBox` du SVG) : un viewBox est presque
   * toujours plus grand que ce qu'il dessine — mesuré sur `7seg-uno.projix`, une
   * résistance occupe 60×11 px dans un viewBox de 80×20, et le 7 segments 50×78
   * dans 60×90. L'autoroutage voyait donc des composants collés là où il reste
   * 10 px de couloir bien visible, et détournait des fils pour rien (retour
   * Frank : « visuellement on a la place », broche DIG1 déclarée inatteignable
   * sous deux résistances qui ne la recouvrent pas).
   *
   * La boîte du viewBox est conservée dans `outer` : les broches vivent dans CE
   * repère, et `pinStubs` a besoin de savoir qu'une broche du bord appartient
   * bien au composant.
   *
   * (La boîte DOM `.part__body`, elle, n'est qu'un repli : elle peut être plus
   * haute de quelques px — interligne du span d'étiquette sous le dessin.)
   */
  private partObstacles(): PartRect[] {
    const rects: PartRect[] = [];
    for (const r of this.rendered.values()) {
      const body = r.container.querySelector('.part__body') as HTMLElement | null;
      let x = r.part.x;
      let y = r.part.y;
      let w = 0;
      let h = 0;
      let outer: PartRect['outer'];
      try {
        const svg = (r.el.shadowRoot ?? r.el).querySelector('svg');
        // Boîte ÉCRAN, ramenée en coordonnées monde : elle tient compte de la
        // ROTATION (appliquée en CSS sur `.part__body`, autour de son centre) et
        // du miroir. La mesure « x/y du composant + taille nominale du SVG »
        // ignorait la rotation : une résistance à 90° (dessin 80×20) était
        // déclarée en 80×20 à partir de son coin haut-gauche alors qu'elle occupe
        // 20×80 autour de son centre — la boîte tombait à côté du vrai corps, et
        // l'autoroutage faisait tranquillement passer un fil au travers
        // (repro Frank : schema-kablix.projix, fil LED A → GP13).
        const toWorld = (b: DOMRect): { x: number; y: number; w: number; h: number } => {
          const tl = this.canvasPoint(b.left, b.top);
          const br = this.canvasPoint(b.right, b.bottom);
          return {
            x: Math.min(tl.x, br.x),
            y: Math.min(tl.y, br.y),
            w: Math.abs(br.x - tl.x),
            h: Math.abs(br.y - tl.y),
          };
        };
        const vbox = svg?.getBoundingClientRect();
        // Le rectangle de sélection est (re)calé maintenant : c'est LUI la boîte
        // du dessin, et le mesurer en DOM donne rotation et miroir gratuitement.
        this.fitSelectionBox(r.part.id);
        const sel = r.container.querySelector('.part__selbox') as HTMLElement | null;
        const sbox = sel?.getBoundingClientRect();
        if (sbox && sbox.width > 0 && sbox.height > 0) {
          ({ x, y, w, h } = toWorld(sbox));
          if (vbox && vbox.width > 0 && vbox.height > 0) outer = toWorld(vbox);
        } else if (vbox && vbox.width > 0 && vbox.height > 0) {
          ({ x, y, w, h } = toWorld(vbox));
        } else {
          w = svg?.width?.baseVal?.value || 0;
          h = svg?.height?.baseVal?.value || 0;
        }
      } catch {
        // Largeur svg en % sans viewport résolu : repli sur la boîte DOM.
      }
      rects.push({
        id: r.part.id,
        x,
        y,
        w: w || body?.offsetWidth || 40,
        h: h || body?.offsetHeight || 40,
        outer,
        board: partDef(r.part.type).kind === 'breadboard',
      });
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
   * traverser le corps pour l'atteindre. Renvoie **tous** les bords quasi
   * équidistants (±5 px) : pour une broche d'angle — dernier plot d'une rangée de
   * carte, coins d'un bouton, patte d'une résistance — le bord strictement le plus
   * proche n'est pas toujours la bonne sortie ; l'autoroutage essaie chaque
   * combinaison et garde le tracé le moins coûteux. (v2026.7.184 : la liste était
   * tronquée aux DEUX premiers, ce qui privait la patte 2 d'une résistance de sa
   * sortie AXIALE — bord droit à 10,2 px contre 10,0 px pour le haut et le bas —
   * et coûtait un coude de plus qu'à la main.) Renvoie [] seulement pour une broche
   * franchement **hors du corps** (patte saillante d'un petit composant : aucune
   * traversée à craindre).
   *
   * Chaque candidat est un **chemin** (1 point en général, 2 pour une échappée
   * latérale) : le fil suit ce chemin depuis la broche avant que l'A\* ne prenne
   * le relais. Toute la patte est exemptée du coût de traversée du corps.
   */
  private pinStubs(
    end: Endpoint,
    center: XY,
    rects: Map<string, PartRect>,
    len: number,
    foreignPins?: XY[]
  ): XY[][] {
    const r = this.rendered.get(end.partId);
    if (!r) return [];
    const box = rects.get(end.partId);
    if (!box) return [];
    // PLATINE : surtout ne pas sortir de la carte. La sortie perpendiculaire au
    // bord est faite pour les composants pleins (le fil ne doit pas traverser le
    // dessin) ; sur une platine elle envoyait le fil faire le tour du pâté de
    // maisons alors qu'on câble AU-DESSUS d'elle. Le trou n'a besoin que d'un
    // DEMI-PAS pour rejoindre le couloir entre deux rangées : de là, toutes les
    // voies de l'A\* (espacées d'un pas entier) restent à mi-chemin des trous et
    // n'en recouvrent aucun.
    if (box.board) {
      const h = GRID / 2;
      return [
        [{ x: center.x, y: center.y - h }],
        [{ x: center.x, y: center.y + h }],
        [{ x: center.x - h, y: center.y }],
        [{ x: center.x + h, y: center.y }],
      ];
    }
    const dTop = center.y - box.y;
    const dBot = box.y + box.h - center.y;
    const dLeft = center.x - box.x;
    const dRight = box.x + box.w - center.x;
    // Broche franchement en dehors du corps (patte saillante) : aucune sortie à
    // forcer. En revanche, une broche SUR le bord (dX ≈ 0) reçoit bien un stub
    // sortant (le fil ne doit pas repasser par le corps pour l'atteindre).
    // L'appartenance se juge sur le VIEWBOX (`outer`), pas sur le dessin : les
    // broches sont posées dans ce repère et tombent volontiers dans sa marge (le
    // 7 segments dessine à 6 px du haut de son viewBox, ses broches sont au ras).
    const own = box.outer ?? box;
    const OUT = 2;
    if (
      center.y - own.y < -OUT ||
      own.y + own.h - center.y < -OUT ||
      center.x - own.x < -OUT ||
      own.x + own.w - center.x < -OUT
    ) {
      return [];
    }
    const m = Math.min(dTop, dBot, dLeft, dRight);
    const TIE = GRID / 2; // bords considérés équivalents à ±5 px près
    const top: XY = { x: center.x, y: box.y - len };
    const bot: XY = { x: center.x, y: box.y + box.h + len };
    const left: XY = { x: box.x - len, y: center.y };
    const right: XY = { x: box.x + box.w + len, y: center.y };
    const cands: Array<{ d: number; p: XY }> = [];
    if (dTop <= m + TIE) cands.push({ d: dTop, p: top });
    if (dBot <= m + TIE) cands.push({ d: dBot, p: bot });
    if (dLeft <= m + TIE) cands.push({ d: dLeft, p: left });
    if (dRight <= m + TIE) cands.push({ d: dRight, p: right });
    cands.sort((u, v) => u.d - v.d); // tri stable : à égalité, ordre haut/bas/gauche/droite
    const picked: XY[][] = cands.map((c) => [c.p]);
    if (!foreignPins || foreignPins.length === 0) return picked;
    // Une patte est PROPRE si aucun de ses segments ne passe sur une broche étrangère.
    const clean = (path: XY[]): boolean => {
      let prev = center;
      for (const p of path) {
        if (foreignPins.some((c) => pointOnSegment(c, prev, p, 4))) return false;
        prev = p;
      }
      return true;
    };
    if (picked.some(clean)) return picked;
    // Broches ALIGNÉES en colonne/rangée (cas du PCA : PWM6 / P7.5V / P7.GND à
    // x=1730, espacées de 10 px) : la sortie perpendiculaire par le bord le plus
    // proche PASSE SUR les broches voisines. On propose alors les autres bords —
    // le coût (onPin) gardera celui qui n'écrase rien.
    const extra: XY[][] = [];
    for (const lat of [top, bot, left, right]) {
      if (picked.some((p) => p[0] === lat)) continue;
      if (clean([lat])) extra.push([lat]);
    }
    if (extra.length > 0) return [...picked, ...extra];
    // Broche ENCLAVÉE (P2.5V..P7.5V du PCA : broche du MILIEU d'une colonne de 3,
    // colonnes voisines à 10 px) : aucune sortie franche ne l'atteint sans écraser
    // une voisine — ni verticalement (PWMn / Pn.GND), ni horizontalement (les 5V
    // des ports voisins). On dégage alors d'un pas de grille jusqu'à la première
    // voie LIBRE puis on sort de la carte par là, exactement le geste de la main
    // (repro « 16 servo + alim.projix », v2026.7.217).
    const escapes: XY[][] = [];
    for (const step of [
      { dx: GRID, dy: 0 },
      { dx: -GRID, dy: 0 },
      { dx: 0, dy: GRID },
      { dx: 0, dy: -GRID },
    ]) {
      for (let k = 1; k <= 3; k++) {
        const e: XY = { x: center.x + step.dx * k, y: center.y + step.dy * k };
        // Voie barrée par une voisine : inutile de pousser plus loin dans ce sens.
        if (!clean([e])) break;
        const outs: XY[] = [
          { x: e.x, y: box.y - len },
          { x: e.x, y: box.y + box.h + len },
          { x: box.x - len, y: e.y },
          { x: box.x + box.w + len, y: e.y },
        ];
        outs.sort((u, v) => Math.hypot(u.x - e.x, u.y - e.y) - Math.hypot(v.x - e.x, v.y - e.y));
        const out = outs.find((o) => clean([e, o]));
        if (out) {
          escapes.push([e, out]);
          break;
        }
      }
    }
    // Les échappées passent devant : elles seules atteignent la broche proprement.
    // On garde deux sorties franches en repli (l'A* peut échouer sur une échappée).
    if (escapes.length > 0) return [...escapes, ...picked.slice(0, 2)];
    return picked;
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
    for (const _ of this.autoRouteSteps()) { /* déroulé d'un trait */ }
  }

  /**
   * Autoroutage progressif : le même travail, mais la main est rendue au
   * navigateur toutes les ~40 ms. Un schéma chargé (CI enfichés, des centaines
   * de fils) occupait la page plusieurs minutes sans rien afficher, et rien ne
   * permettait d'en sortir — même en fermant les schémas (Frank, v2026.7.265).
   * `onProgress` alimente la barre d'avancement, `shouldCancel` l'arrête net :
   * les fils déjà routés le restent, les suivants gardent leur tracé.
   */
  async autoRouteProgressive(opts: {
    onProgress?: (done: number, total: number) => void;
    shouldCancel?: () => boolean;
    /** Durée d'une tranche de calcul, en ms (0 = rendre la main à chaque fil). */
    sliceMs?: number;
  } = {}): Promise<{ done: number; total: number; cancelled: boolean }> {
    const slice = opts.sliceMs ?? 40;
    let etat = { done: 0, total: 0 };
    let cancelled = false;
    let repere = performance.now();
    const it = this.autoRouteSteps();
    let pas = it.next();
    while (!pas.done) {
      etat = pas.value;
      // Un fil se route en une fraction de milliseconde : rendre la main à
      // CHAQUE fil coûterait plus cher que le calcul lui-même.
      if (performance.now() - repere < slice) { pas = it.next(false); continue; }
      opts.onProgress?.(etat.done, etat.total);
      await new Promise<void>((r) => setTimeout(r, 0));
      repere = performance.now();
      // L'annulation est rendue AU générateur : il sort de sa boucle et range
      // proprement (poignées, notification) ce qui est déjà routé.
      cancelled = opts.shouldCancel?.() === true;
      pas = it.next(cancelled);
    }
    // Le générateur va au bout de lui-même : sans annulation, tout est routé.
    if (!cancelled) etat = { done: etat.total, total: etat.total };
    opts.onProgress?.(etat.done, etat.total);
    return { ...etat, cancelled };
  }

  /**
   * Cœur de l'autoroutage, fil par fil : rend `{ done, total }` avant chaque
   * fil et s'arrête si l'appelant lui repasse `true`.
   */
  private *autoRouteSteps(): Generator<{ done: number; total: number }, void, boolean | undefined> {
    if (this.locked) return;
    const sel = this.selectedParts;
    const all = sel.size === 0;
    const obstacles = this.partObstacles();
    const rectOf = new Map(obstacles.map((o) => [o.id, o]));
    // Une platine n'est pas un obstacle mais le plan de travail : le fil la
    // traverse comme on le fait à la main. Elle est donc retirée de TOUS les
    // calculs de survol de composant — sinon le routeur payait un détour pour
    // sortir de la carte, exactement ce que Frank voyait.
    const solidObs = obstacles.filter((o) => !o.board);
    const boardIds = new Set(obstacles.filter((o) => o.board).map((o) => o.id));
    const STUB = GRID; // sortie perpendiculaire = 1 pas de grille hors du corps
    // Écart mini entre deux fils parallèles d'équipotentielles DIFFÉRENTES : 5 px
    // (2 px en v2026.7.120, 3 px en v2026.7.124 — toujours trop serré à l'œil,
    // un demi-pas de grille sépare enfin nettement deux fils qui longent).
    // Deux fils de MÊME `eqp` peuvent, eux, se superposer.
    const GAP = 5;
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
    // Les TROUS d'une platine sont mis à part : ils se comptent par centaines.
    // Les déclarer « interdits » comme les broches d'un composant noyait le
    // graphe de l'A\* (une paire de voies de contournement par trou) — il rendait
    // les armes et l'appelant retombait sur un coude en L qui, lui, passe
    // allègrement sur les trous. Ils deviennent donc un COÛT, calculable sans
    // balayer la platine grâce à un index par cellule de grille.
    const pinCenters: Array<{ partId: string; pin: string; c: XY }> = [];
    const holeGrid = new Map<string, Array<{ id: string; c: XY }>>();
    const cellKey = (x: number, y: number): string => `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
    for (const [id, r] of this.rendered) {
      for (const pin of r.hotspots.keys()) {
        const c = this.hotspotCenter({ partId: id, pin });
        if (!c) continue;
        if (boardIds.has(id)) {
          const k = cellKey(c.x, c.y);
          const cell = holeGrid.get(k);
          const hole = { id: `${id}|${pin}`, c };
          if (cell) cell.push(hole);
          else holeGrid.set(k, [hole]);
        } else {
          pinCenters.push({ partId: id, pin, c });
        }
      }
    }
    // Trous recouverts par un segment : on ne visite que les cellules qu'il
    // traverse (plus leurs voisines : une pastille déborde de sa cellule).
    const PIN_CLR = 4; // pastille de 9 px : au-delà de 4 px du centre, on ne la couvre plus
    const holesOnSeg = (p: XY, q: XY, hit: Set<string>): void => {
      if (holeGrid.size === 0) return;
      const i0 = Math.floor((Math.min(p.x, q.x) - PIN_CLR) / GRID);
      const i1 = Math.floor((Math.max(p.x, q.x) + PIN_CLR) / GRID);
      const j0 = Math.floor((Math.min(p.y, q.y) - PIN_CLR) / GRID);
      const j1 = Math.floor((Math.max(p.y, q.y) + PIN_CLR) / GRID);
      // Garde-fou : un segment en diagonale sur toute la feuille balaierait une
      // surface, pas une ligne. Le routage ne produit que du H/V, mais un fil
      // ORIGINAL peut être diagonal (fil neuf) — on ne s'y attarde pas.
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4000) return;
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const cell = holeGrid.get(`${i},${j}`);
          if (!cell) continue;
          for (const h of cell) if (pointOnSegment(h.c, p, q, PIN_CLR)) hit.add(h.id);
        }
      }
    };
    /** Nombre de trous de platine recouverts par une polyligne (hors `own` : les
     *  deux trous où le fil est branché, forcément touchés). */
    const holesOnPoly = (poly: XY[], own?: Set<string>): number => {
      if (holeGrid.size === 0) return 0;
      const hit = new Set<string>();
      for (let i = 0; i < poly.length - 1; i++) holesOnSeg(poly[i], poly[i + 1], hit);
      if (own) for (const k of own) hit.delete(k);
      return hit.size;
    };
    let changed = false;
    // Liste arrêtée d'avance : elle donne le total de la barre d'avancement, et
    // le routage progressif ne doit pas courir après un schéma qui bouge.
    const todo = this.diagram.wires.filter(
      (w) => !w.auto && (all || sel.has(w.a.partId) || sel.has(w.b.partId)),
    );
    const total = todo.length;
    let done = 0;
    for (const wire of todo) {
      if (yield { done, total }) break; // annulé : on garde ce qui est routé
      done++;
      // Le fil a pu disparaître entre deux pauses (suppression au clavier).
      if (!this.diagram.wires.includes(wire)) continue;
      const a = this.hotspotCenter(wire.a);
      const b = this.hotspotCenter(wire.b);
      if (!a || !b) continue;
      // Les deux trous où CE fil est branché : il les recouvre par définition.
      const ownHoles = new Set([`${wire.a.partId}|${wire.a.pin}`, `${wire.b.partId}|${wire.b.pin}`]);
      const holesOf = (poly: XY[]): number => holesOnPoly(poly, ownHoles);
      // Même mesure, arête par arête, pour l'A\* : appelée des milliers de fois,
      // elle réutilise un seul Set au lieu d'en allouer un par arête.
      const holeHit = new Set<string>();
      const holeCost = (p: XY, q: XY): number => {
        holeHit.clear();
        holesOnSeg(p, q, holeHit);
        let n = 0;
        for (const k of holeHit) if (!ownHoles.has(k)) n++;
        return n;
      };
      // Tolérance de traversée d'un corps d'EXTRÉMITÉ : la patte doit pouvoir aller
      // de la broche jusqu'au bord, donc au moins la PROFONDEUR de la broche dans le
      // corps — les 16 connecteurs servo du PCA sont à 34 px du bord — plus la marge
      // historique d'un pas et demi (échappée latérale comprise). Un plafond fixe
      // condamnait tout fil de ces broches à « perforer » son propre corps, et le
      // garde-fou anti-dégradation préférait alors le tracé qui écrase une voisine
      // (repro « 16 servo + alim.projix », v2026.7.217).
      const ENDCAP = 1.5 * GRID;
      const capOf = (o: PartRect): number => {
        let depth = 0;
        for (const [end, c] of [
          [wire.a, a],
          [wire.b, b],
        ] as Array<[Endpoint, XY]>) {
          if (end.partId !== o.id) continue;
          const d = Math.min(c.x - o.x, o.x + o.w - c.x, c.y - o.y, o.y + o.h - c.y);
          depth = Math.max(depth, Math.max(0, d));
        }
        return depth + ENDCAP;
      };
      // Fil DÉJÀ bien tracé (demande de Frank : ne pas rajouter de coude à un fil
      // propre). Un fil est préservé TEL QUEL si sa polyligne complète (broches
      // comprises) est faite de segments H/V, compte 4 coudes ou moins, ne survole
      // aucun composant (hors le ras du corps de ses deux extrémités), ne se
      // superpose à aucun autre fil et ne passe sur aucune broche étrangère.
      {
        const full = [a, ...(wire.points ?? []), b];
        const { bends } = polyLenBends(full);
        let hv = true;
        for (let i = 0; i < full.length - 1; i++) {
          const dx = Math.abs(full[i].x - full[i + 1].x);
          const dy = Math.abs(full[i].y - full[i + 1].y);
          if (dx > TOL && dy > TOL) { hv = false; break; }
        }
        if (hv && bends <= 4) {
          // Survol de composant. Demande de Frank (préserver un bon fil sauf s'il
          // TRAVERSE un composant) : le simple RAS d'un composant voisin (fil qui
          // longe son bord, cas d'une rangée de résistances serrées à 10 px) ne
          // disqualifie plus le fil — seule une traversée DE PART EN PART, mesurée
          // contre le cœur du corps (rétréci de DEEP), le fait rerouter. Les deux
          // corps d'extrémité gardent la tolérance de ras historique (ENDCAP).
          const DEEP = 4; // marge sur chaque bord : cœur du composant
          let overComp = false;
          for (const o of solidObs) {
            const isEnd = o.id === wire.a.partId || o.id === wire.b.partId;
            let ov = 0;
            for (let i = 0; i < full.length - 1; i++) {
              ov += isEnd ? segRectOverlap(full[i], full[i + 1], o) : segRectDeepCross(full[i], full[i + 1], o, DEEP);
            }
            if (ov > (isEnd ? capOf(o) : TOL)) { overComp = true; break; }
          }
          // Superposition avec un AUTRE fil (équipotentielle différente).
          const others: Array<[XY, XY]> = [];
          for (const [wid, s] of wireSegs) {
            if (wid !== wire.id && !sameEqpWire(wid, wire.id)) others.push(...s);
          }
          const overWire = polylineWireCost(full, others, GAP).overlap > TOL;
          // Broche étrangère survolée (les 2 broches propres du fil exclues).
          const onForeignPin = pinCenters.some(
            (p) =>
              !(p.partId === wire.a.partId && p.pin === wire.a.pin) &&
              !(p.partId === wire.b.partId && p.pin === wire.b.pin) &&
              full.some((_, i) => i < full.length - 1 && pointOnSegment(p.c, full[i], full[i + 1], 4))
          );
          // Trous de platine recouverts : un fil qui longe une rangée en masque
          // vingt. Ce n'est pas un « bon fil » — il repasse par le routeur.
          if (!overComp && !overWire && !onForeignPin && holesOf(full) === 0) {
            // Fil propre : on le garde intact (seule l'optimisation colinéaire
            // s'applique, elle ne déplace rien).
            const kept = collapseColinear(full, 1).slice(1, -1);
            if ((kept.length) !== (wire.points?.length ?? 0)) changed = true;
            wire.points = kept.length > 0 ? kept : undefined;
            wireSegs.set(wire.id, toSegs([a, ...kept, b]));
            this.positionWire(wire);
            continue;
          }
        }
      }
      // Ligne droite prioritaire : broches alignées H/V et segment direct
      // dégagé → AUCUN coude, même au ras des composants. Les corps des DEUX
      // extrémités tolèrent chacun ~1 pas de grille de chevauchement (la broche
      // vit au bord de son corps) ; un fil droit qui TRANCHERAIT un corps de
      // part en part (broches sous le corps, ex. deux LED superposées) dépasse
      // ce plafond et repasse par le routeur ; idem pour un fil déjà couché sur
      // la ligne (le créneau anti-superposition du routeur reprend la main).
      if (Math.abs(a.x - b.x) <= TOL || Math.abs(a.y - b.y) <= TOL) {
        const ENDCAP = 1.5 * GRID; // chevauchement toléré dans un corps d'extrémité
        const DEEP = 4; // marge : seule une traversée du cœur d'un tiers bloque
        let blocked = false;
        for (const o of solidObs) {
          const isEnd = o.id === wire.a.partId || o.id === wire.b.partId;
          const ov = isEnd ? segRectOverlap(a, b, o) : segRectDeepCross(a, b, o, DEEP);
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
            pointOnSegment(p.c, a, b, 4)
        );
        // … ni sur une rangée de trous : deux trous d'une même colonne de platine
        // sont alignés, la « ligne droite » les enfilerait tous.
        if (
          !blocked &&
          !crossesForeignPin &&
          holesOf([a, b]) === 0 &&
          polylineWireCost([a, b], others, GAP).overlap <= TOL
        ) {
          if ((wire.points?.length ?? 0) > 0) changed = true;
          wire.points = undefined;
          wireSegs.set(wire.id, toSegs([a, b]));
          this.positionWire(wire);
          continue;
        }
      }
      // Broches étrangères au fil (ni a ni b) : sert à écarter une sortie de
      // broche qui écraserait une broche voisine (colonne dense du PCA).
      const foreignPinC = pinCenters
        .filter(
          (p) =>
            !(p.partId === wire.a.partId && p.pin === wire.a.pin) &&
            !(p.partId === wire.b.partId && p.pin === wire.b.pin)
        )
        .map((p) => p.c);
      const saList = this.pinStubs(wire.a, a, rectOf, STUB, foreignPinC);
      const sbList = this.pinStubs(wire.b, b, rectOf, STUB, foreignPinC);
      const saCands: Array<XY[] | null> = saList.length > 0 ? saList : [null];
      const sbCands: Array<XY[] | null> = sbList.length > 0 ? sbList : [null];
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
      // Score d'une polyligne complète [a..b]. `innerForComp` = tronçon dont le
      // survol de composant est mesuré (les pattes d'extrémité ont le droit de
      // toucher leur propre corps ; on les exclut). Utilisé pour départager les
      // tracés candidats ET pour comparer le tracé ORIGINAL au meilleur rerouté.
      const scorePoly = (poly: XY[], innerForComp: XY[], compObstacles: PartRect[] = solidObs): number => {
        const comp = polylineRectOverlap(innerForComp, compObstacles);
        const { overlap, near } = polylineWireCost(poly, otherSegs, GAP);
        const { len, bends } = polyLenBends(poly);
        let selfOv = 0;
        for (let i = 0; i < poly.length - 1; i++) {
          for (let j = i + 1; j < poly.length - 1; j++) {
            selfOv += collinearOverlap(poly[i], poly[i + 1], poly[j], poly[j + 1]);
          }
        }
        let cross = 0;
        for (let i = 0; i < poly.length - 1; i++) {
          for (const [s, t] of otherSegs) if (segsCross(poly[i], poly[i + 1], s, t)) cross++;
        }
        const sameOv = sameSegs.length > 0 ? Math.min(len, polylineWireCost(poly, sameSegs, GAP).overlap) : 0;
        let onPin = 0;
        for (const fp of foreignPins) {
          for (let i = 0; i < poly.length - 1; i++) {
            if (pointOnSegment(fp.c, poly[i], poly[i + 1], 4)) { onPin++; break; }
          }
        }
        // Trou de platine masqué : cher, mais moins qu'une broche de composant
        // écrasée — « autant que possible » et non « à tout prix » (demande de
        // Frank). Un fil aura toujours le droit de couper une rangée en travers
        // (1 trou) plutôt que de faire trois fois le tour de la carte.
        return (
          onPin * 2000 + holesOf(poly) * 250 + comp * 1000 + (overlap + selfOv) * 100 +
          cross * BEND * 1.5 + near * 0.6 + len + bends * BEND - sameOv * RIDE
        );
      };
      // Une patte se lit de la broche vers l'extérieur : celle de `b` est donc
      // parcourue à l'envers dans le tracé final (… → pb → … → b).
      const cost = (sa: XY[] | null, sb: XY[] | null, c: XY[]): number => {
        const legA = sa ?? [];
        const legB = sb ? [...sb].reverse() : [];
        const pa = legA.length > 0 ? legA[legA.length - 1] : a;
        const pb = legB.length > 0 ? legB[0] : b;
        // Le tracé interne [pa..pb] (sans les pattes a→pa / pb→b) porte la mesure de
        // survol de composant : seules les pattes ont le droit de toucher leur corps.
        return scorePoly([a, ...legA, ...c, ...legB, b], [pa, ...c, pb]);
      };
      // Routeur A* (contourne les obstacles et les fils), essayé pour CHAQUE
      // combinaison de sorties candidates (≤ 2 par extrémité) : pour une broche
      // d'angle, le bord le plus proche n'est pas forcément la bonne sortie — on
      // garde le tracé complet le moins coûteux. On passe à l'A\* tous les
      // composants PLEINS (`solidObs` : la platine d'essais n'en est pas un, on
      // câble AU-DESSUS d'elle), y compris les deux d'extrémité : la broche est déjà sortie du
      // corps par `pinStubs`, donc l'A\* ne doit plus jamais retraverser un corps —
      // ni celui d'où part le fil, ni celui d'arrivée. (Le filtre `solid` interne à
      // `astarRoute` exclut malgré tout le bloc qui contient encore le point de
      // départ/arrivée, pour laisser la broche s'échapper.) Le chemin va de pa à
      // pb inclus ; on retire ces deux bornes (réinjectées via sa/sb ou a/b).
      let sa: XY[] | null = saCands[0];
      let sb: XY[] | null = sbCands[0];
      let routed: XY[] | null = null;
      let bestCost = Infinity;
      // Direction dominante d'un déplacement (encodage de l'A* : 0..3).
      const dirOf = (from: XY, to: XY): number =>
        Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? (to.x > from.x ? 0 : 1) : to.y > from.y ? 2 : 3;
      // Bout de patte où l'A* prend le relais, et point d'où il vient (pour ne pas
      // repartir en marche arrière sur le dernier segment de la patte).
      const tip = (leg: XY[] | null, pin: XY): XY => (leg && leg.length > 0 ? leg[leg.length - 1] : pin);
      const prev = (leg: XY[] | null, pin: XY): XY => (leg && leg.length > 1 ? leg[leg.length - 2] : pin);
      for (const ca of saCands) {
        for (const cb of sbCands) {
          const path = astarRoute(tip(ca, a), tip(cb, b), solidObs, otherSegs, {
            clr: GRID / 2,
            bend: BEND,
            gap: GAP,
            startDir: ca ? dirOf(prev(ca, a), tip(ca, a)) : undefined,
            endDir: cb ? dirOf(tip(cb, b), prev(cb, b)) : undefined,
            same: sameSegs,
            pins: foreignPins.map((p) => p.c),
            // Les trous ne barrent pas la route, ils la taxent : l'A\* préfère
            // le couloir entre deux rangées, mais peut couper en travers si le
            // détour coûte plus cher.
            holes: holeGrid.size > 0 ? holeCost : undefined,
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
      const legA = sa ?? [];
      const legB = sb ? [...sb].reverse() : [];
      const pa = tip(sa, a); // point de départ du routage (après sortie perpendiculaire)
      const pb = legB.length > 0 ? legB[0] : b;
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
      let pts = [...legA, ...inner, ...legB];
      // Passe d'optimisation : supprime les coudes intermédiaires quand 3 points
      // consécutifs sont alignés (points de connexion a/b compris) — ne laisse que
      // 2. Purement géométrique (le tracé ne bouge pas), donc toujours sûr : pas
      // de nouveau survol de broche ni de composant.
      pts = collapseColinear([a, ...pts, b], 1).slice(1, -1);
      // Survol de composant mesuré contre les corps TIERS (hors les deux d'extrémité,
      // dont le ras est toléré). Même règle appliquée à tous les tracés comparés.
      const thirdParty = solidObs.filter((o) => o.id !== wire.a.partId && o.id !== wire.b.partId);
      // Perforation PROFONDE des corps d'EXTRÉMITÉ (au-delà du ras toléré) : un fil
      // droit dont la broche est sous son propre corps peut le trancher de part en
      // part (ex. 2 LED superposées). Le survol tiers étant déjà couvert par
      // `thirdParty`, on ne taxe ici QUE le cœur des deux corps d'extrémité, pour
      // que l'original perforant ne soit pas jugé « parfait » face au détour (qui,
      // lui, approche la broche par le côté et perce moins).
      // Même règle que partout ailleurs pour un corps d'extrémité : le ras est
      // toléré jusqu'à `capOf` (profondeur de la broche + une marge), au-delà c'est
      // une perforation. (Un inset fixe ne marchait pas : sur un corps étroit — la
      // LED fait 17 px de large — son « cœur » devient si mince que la broche du
      // bord tombe en dehors, et la traversée mesurée retombait à zéro.)
      const endBodies = solidObs.filter((o) => o.id === wire.a.partId || o.id === wire.b.partId);
      const deepEnds = (poly: XY[]): number => {
        let ov = 0;
        for (const o of endBodies) {
          let cross = 0;
          for (let i = 0; i < poly.length - 1; i++) cross += segRectOverlap(poly[i], poly[i + 1], o);
          ov += Math.max(0, cross - capOf(o));
        }
        return ov;
      };
      // Coût d'une polyligne COMPLÈTE [a..b], sert à départager deux tracés du même
      // fil (rerouté / original / redressé).
      const polyScore = (poly: XY[]): number => scorePoly(poly, poly, thirdParty) + deepEnds(poly) * 1000;
      // Redressement des escaliers : un décroché d'un demi-pas collé à une broche
      // (le « zigouigoui » de `A Examiner/bug routage.png`) coûte deux coudes pour
      // rien. On réaligne les deux tronçons quand le tracé redressé est meilleur.
      pts = unstairPoly([a, ...pts, b], GRID, polyScore, TOL).slice(1, -1);
      // NE JAMAIS DÉGRADER UN FIL EXISTANT : dans un montage dense (composants à
      // 10 px), l'A* peut être contraint de pondre un tracé qui traverse un
      // composant ou ajoute des coudes — parfois PIRE que le fil déjà en place
      // (repro Frank : bons fils droits reroutés, certains traversant un composant).
      // On compare le coût du tracé rerouté à celui de l'ORIGINAL et on garde le
      // meilleur. Pour l'original, le survol de composant se mesure contre tous les
      // corps SAUF les deux d'extrémité (les pattes broche→coude ont le droit de
      // toucher leur propre corps, comme pour le tracé interne d'un rerouté).
      const origPts = wire.points ?? [];
      const origPoly = [a, ...origPts, b];
      // Le garde-fou « ne jamais dégrader » ne compare QUE des originaux déjà
      // orthogonaux (H/V) : un fil diagonal (ex. fil neuf non encore routé, ou fil
      // sale) n'a rien à préserver et laisse toujours la main au tracé rerouté —
      // sinon `segRectDeepCross` (aveugle aux diagonales) fausserait la balance en
      // faveur d'un original diagonal qui « ne perce rien » par construction.
      let origOrtho = true;
      for (let i = 0; i < origPoly.length - 1; i++) {
        if (Math.abs(origPoly[i].x - origPoly[i + 1].x) > TOL && Math.abs(origPoly[i].y - origPoly[i + 1].y) > TOL) {
          origOrtho = false;
          break;
        }
      }
      const newPoly = [a, ...pts, b];
      const origScore = polyScore(origPoly);
      const newScore = polyScore(newPoly);
      // … MAIS un fil de plus de 4 coudes n'est PAS un bon fil (définition Kablix) :
      // le garde-fou ne doit pas le protéger sous prétexte qu'il longe une dorsale du
      // même net (le bonus `sameOv` peut à lui seul lui donner le meilleur score).
      // On le remplace dès que le rerouté a moins de coudes SANS ajouter de défaut
      // (survol de composant, de broche étrangère, superposition d'un autre net).
      const flaws = (poly: XY[]): number => {
        let onPin = 0;
        for (const fp of foreignPins) {
          for (let i = 0; i < poly.length - 1; i++) {
            if (pointOnSegment(fp.c, poly[i], poly[i + 1], 4)) { onPin++; break; }
          }
        }
        return (
          polylineRectOverlap(poly, thirdParty) +
          deepEnds(poly) +
          polylineWireCost(poly, otherSegs, GAP).overlap +
          onPin +
          // Recouvrir un trou de platine est un défaut comme un autre : sans ça,
          // le sauvetage anti-coudes pouvait remplacer un fil propre par un tracé
          // couché sur une rangée entière.
          holesOf(poly)
        );
      };
      const origBends = polyLenBends(origPoly).bends;
      const rescue =
        origBends > 4 &&
        polyLenBends(newPoly).bends < origBends &&
        flaws(newPoly) <= flaws(origPoly) + 0.01;
      if (origOrtho && !rescue && origScore <= newScore + 0.01) {
        // Le reroutage n'améliore rien (ou dégrade) : on garde le fil tel quel, en
        // n'appliquant que l'optimisation colinéaire et le redressement des
        // escaliers — deux passes qui ne peuvent que faire baisser son coût.
        const kept = unstairPoly(origPoly, GRID, polyScore, 1).slice(1, -1);
        if (kept.length !== origPts.length) changed = true;
        wire.points = kept.length > 0 ? kept : undefined;
        wireSegs.set(wire.id, toSegs([a, ...kept, b]));
        this.positionWire(wire);
        continue;
      }
      wire.points = pts.length > 0 ? pts : undefined;
      wireSegs.set(wire.id, toSegs([a, ...pts, b]));
      changed = true;
      this.positionWire(wire);
    }
    // Vaut aussi pour un arrêt anticipé : ce qui est routé est rangé et enregistré.
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
      auto.track(ev);
      let pos = this.canvasPoint(ev.clientX, ev.clientY);
      if (ev.ctrlKey && group.length === 1) {
        // Réticule + forçage : aligne le coude sur ses voisins (segments H/V).
        pos = this.alignToNeighbours(wire, index, pos);
        this.showGuides(pos);
      } else {
        this.clearGuides();
      }
      const o0 = orig.get(index)!;
      let dx = pos.x - o0.x;
      let dy = pos.y - o0.y;
      // Ctrl maintenu sur un LOT de coudes : le déplacement du groupe est
      // contraint à un seul axe (l'axe dominant du geste) — horizontal pur si
      // |dx| ≥ |dy|, vertical pur sinon. Relâcher Ctrl rend le geste libre en 2D
      // (recalculé à chaque pointermove, la contrainte suit l'état courant).
      if (ev.ctrlKey && group.length > 1) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
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
    // Le coude tiré au bord entraîne la vue : un fil peut ainsi être rallongé
    // au-delà de ce que l'écran montre, sans lâcher la poignée.
    const auto = this.beginAutoPan<PointerEvent>(move);
    const end = () => {
      auto.stop();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
      this.clearGuides();
      this.notify();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
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
    this.wireCaps.get(id)?.remove();
    this.wireCaps.delete(id);
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
    this.setCapsColor(wire);
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
    // Les carrés se recentrent sur les deux pastilles.
    const caps = this.wireCaps.get(wire.id);
    if (caps) {
      const ends = [a, b];
      caps.childNodes.forEach((node, i) => {
        const r = node as SVGRectElement;
        r.setAttribute('x', String(ends[i].x - WIRE_CAP / 2));
        r.setAttribute('y', String(ends[i].y - WIRE_CAP / 2));
      });
    }
    this.scheduleJunctions();
  }

  redrawWires(): void {
    // Nom d'équipotentielle posé sur le fil DESSINÉ (`data-eqp` = eqp-x,
    // `data-eqp-wire` = eqp-x-y) : jusqu'ici le nommage n'existait que dans
    // l'export SVG, donc « n'apparaissait pas » à l'inspection du canvas.
    const eqp = nameEquipotentials(this.diagram);
    for (const wire of this.diagram.wires) {
      this.positionWire(wire);
      const path = this.wirePaths.get(wire.id);
      if (!path) continue;
      const name = eqp.nameOfWire(wire.id);
      const group = eqp.eqpOfWire(wire.id);
      if (name && group) {
        path.setAttribute('data-eqp', group);
        path.setAttribute('data-eqp-wire', name);
      } else {
        path.removeAttribute('data-eqp');
        path.removeAttribute('data-eqp-wire');
      }
    }
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
        for (const id of [...this.rendered.keys()]) this.snapPartToGrid(id, true, true);
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
    const keptId = sel?.kind === 'part' ? sel.id : null;
    for (const id of this.selectedParts) {
      const c = this.rendered.get(id)?.container;
      c?.querySelector('.part__internal')?.remove();
      c?.querySelector('.part__pinout')?.remove();
      c?.classList.remove('part--pinout-shown');
      // Quitter le composant relâche l'affichage du schéma : un nouveau clic sur
      // le bouton ☢ (K) sera nécessaire pour le réafficher au retour. On préserve
      // l'état quand le composant reste le sélectionné (re-render après édition).
      if (id === keptId) continue;
      this.internalShown.delete(id);
      this.pinoutShown.delete(id);
      c?.querySelector('.part__internal-toggle')?.classList.remove('part__internal-toggle--active');
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
    if (hasPinout(r.part.type)) return true;
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
    if (hasPinout(this.rendered.get(partId)!.part.type)) this.togglePinout(partId);
    else this.toggleInternalWiring(partId);
    this.notifySelection();
  }
  private setPartHighlight(): void {
    for (const [id, r] of this.rendered) {
      const on = this.selectedParts.has(id);
      r.container.classList.toggle('part--selected', on);
      if (on) this.fitSelectionBox(id);
    }
  }

  /**
   * Cale le rectangle de sélection AU PLUS PRÈS du dessin.
   *
   * Le pointillé était porté par `.part__body`, c'est-à-dire par le viewBox du
   * SVG : or le dessin ne le remplit presque jamais (mesuré — 51 px de vide sous
   * le servomoteur, 14 px sous la LED, 10 px de chaque côté d'une résistance),
   * d'où un cadre visiblement trop large. Il est désormais posé sur la boîte
   * RÉELLEMENT dessinée (`getBBox` du SVG), calculée en pixels du corps.
   *
   * La géométrie du composant n'est pas touchée : ni sa position, ni sa taille,
   * ni ses broches — donc les pattes restent sur la grille. Seul le cadre change.
   * Repli sur le corps entier quand rien n'est mesurable. Un dessin qui déborde
   * de son viewBox n'annule plus la mesure : il est ROGNÉ comme le fait le SVG
   * lui-même, au lieu de laisser le cadre revenir à tout le corps.
   */
  private fitSelectionBox(partId: string): void {
    const r = this.rendered.get(partId);
    const body = r?.container.querySelector('.part__body') as HTMLElement | null;
    if (!r || !body) return;
    let box: { l: number; t: number; w: number; h: number } | null = null;
    try {
      // Le PLUS GRAND svg de premier niveau, pas le premier venu : le buzzer place
      // une note de musique de 8×8 px AVANT son dessin (visible en simulation),
      // et se serait donc vu encadrer sur 8 px de côté.
      const svgs = [...(r.el.shadowRoot ?? r.el).querySelectorAll('svg')].filter(
        (s) => !s.parentElement?.closest('svg')
      );
      const svg = svgs.reduce<SVGSVGElement | null>((best, s) => {
        const area = (s.width?.baseVal?.value || 0) * (s.height?.baseVal?.value || 0);
        const bestArea = best ? (best.width?.baseVal?.value || 0) * (best.height?.baseVal?.value || 0) : -1;
        return area > bestArea ? s : best;
      }, null);
      const bb = svg?.getBBox();
      const vw = svg?.width?.baseVal?.value || 0;
      const vh = svg?.height?.baseVal?.value || 0;
      const vb = svg?.viewBox?.baseVal;
      if (bb && vw && vh && bb.width > 0 && bb.height > 0) {
        // Du repère du viewBox vers les pixels du corps.
        const sx = vb && vb.width ? vw / vb.width : 1;
        const sy = vb && vb.height ? vh / vb.height : 1;
        const ox = vb ? vb.x : 0;
        const oy = vb ? vb.y : 0;
        // Un SVG racine ROGNE ce qui déborde de son viewport : le cadre se limite
        // donc à ce qui est réellement peint, débord compris dans le calcul mais
        // pas dans le résultat.
        const l = Math.max(0, (bb.x - ox) * sx);
        const t = Math.max(0, (bb.y - oy) * sy);
        const w = Math.min(vw, (bb.x - ox + bb.width) * sx) - l;
        const h = Math.min(vh, (bb.y - oy + bb.height) * sy) - t;
        if (w > 4 && h > 4) box = { l, t, w, h };
      }
    } catch {
      // SVG non mesurable (largeur en %, viewport non résolu) : repli.
    }
    let sel = body.querySelector('.part__selbox') as HTMLElement | null;
    if (!box) {
      sel?.remove();
      return;
    }
    if (!sel) {
      sel = document.createElement('div');
      sel.className = 'part__selbox';
      body.appendChild(sel);
    }
    sel.style.left = `${box.l}px`;
    sel.style.top = `${box.t}px`;
    sel.style.width = `${box.w}px`;
    sel.style.height = `${box.h}px`;
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

  /**
   * Sélectionne TOUS les fils d'une équipotentielle (clic sur « Nœud n » dans
   * l'inspecteur du fil). Les fils `auto` (invisibles, enfichage) n'ont pas
   * d'eqp et ne sont donc jamais pris.
   */
  private selectEquipotential(eqp: string): void {
    const eqps = nameEquipotentials(this.diagram);
    const ids = this.diagram.wires
      .filter((w) => eqps.eqpOfWire(w.id) === eqp)
      .map((w) => w.id);
    if (ids.length === 0) return;
    // On repart d'une sélection vierge : le lot, c'est l'équipotentielle.
    this.selectedParts.clear();
    this.setPartHighlight();
    this.clearHandles();
    this.selection = null;
    this.selectedWires = new Set(ids);
    for (const wid of this.wirePaths.keys()) {
      this.setWireHighlight(wid, this.selectedWires.has(wid));
    }
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
      auto.track(ev); // la boîte peut s'étendre au-delà de l'écran
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
    const auto = this.beginAutoPan<PointerEvent>(move);
    const up = (): void => {
      auto.stop();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
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
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
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
   * dans un autre logiciel, ex. Inkscape). Le SVG copié porte EN PLUS le schéma
   * de la sélection dans une balise `<metadata>` : c'est lui qui permet de
   * coller les composants dans un AUTRE atelier Kablix (cf. clipboard.mts).
   */
  copySelection(): void {
    if (this.selectedParts.size === 0) return;
    const ids = new Set(this.selectedParts);
    const parts = this.diagram.parts.filter((p) => ids.has(p.id));
    // Seuls les fils entièrement contenus dans la sélection sont copiés — les
    // fils implicites d'enfichage compris (une Pico copiée avec son socle garde
    // ses connexions, exactement comme à l'enregistrement du projet).
    const wires = this.diagram.wires.filter((w) => ids.has(w.a.partId) && ids.has(w.b.partId));
    const payload = JSON.parse(JSON.stringify({ parts, wires })) as ClipboardPayload;
    this.clipboard = payload;
    this.pasteRun = null; // nouvelle copie : le décalage des collages repart de zéro
    void this.copyAsVectorImage(embedClipboardInSvg(this.buildSvg(ids), encodeClipboard(payload)));
  }

  /**
   * Colle : d'abord le schéma trouvé dans le presse-papier SYSTÈME (donc copié
   * dans n'importe quel atelier Kablix), sinon le presse-papier interne. Un
   * texte quelconque dans le presse-papier ne colle rien : on retombe alors sur
   * la dernière copie faite ici.
   */
  async pasteFromSystem(): Promise<void> {
    if (this.locked) return;
    const text = await this.readSystemClipboard();
    const external = text ? extractClipboard(text) : null;
    if (external) {
      this.insertPayload(external);
      return;
    }
    this.paste();
  }

  /** Colle le presse-papier interne (composants décalés, fils internes conservés). */
  paste(): void {
    if (!this.clipboard || this.clipboard.parts.length === 0) return;
    this.insertPayload(this.clipboard);
  }

  /**
   * Pose une charge utile (interne ou venue d'un autre atelier) : identifiants
   * neufs, décalage d'un cran de grille, fils rattachés aux copies. Les types de
   * composants inconnus de ce poste sont ignorés — plutôt que de faire échouer
   * tout le collage.
   */
  private insertPayload(payload: ClipboardPayload): void {
    const parts = payload.parts.filter((p) => knownPartType(p.type));
    if (parts.length === 0) return;
    // Collages successifs de la MÊME copie : chaque coller s'écarte d'un cran de
    // plus (20 px = 2 pas de grille), sinon les copies s'empilent au même point.
    const key = `${parts.length}:${parts.map((p) => `${p.type}@${p.x},${p.y}`).join('|')}`;
    this.pasteRun = this.pasteRun?.key === key ? { key, n: this.pasteRun.n + 1 } : { key, n: 1 };
    // Le décalage est BORNÉ pour que les copies restent sur la feuille : sans
    // cela, coller douze fois de suite finissait par les poser dehors. Une copie
    // a exactement l'encombrement de son original (même type, mêmes attributs,
    // même rotation) : on le mesure donc sur l'original, avant de poser quoi que
    // ce soit — la copie, elle, n'est pas encore dessinée. Collage venu d'un
    // autre atelier (aucun original ici) : rien à mesurer, décalage inchangé.
    const offset = parts.reduce((off, p) => {
      if (!this.rendered.has(p.id)) return off;
      const e = this.drawExtent(p.id);
      // Le décalage est positif : seuls les bords droite et bas peuvent être
      // franchis.
      return Math.max(0, Math.min(off, SHEET_W - e.w - e.dx - p.x, SHEET_H - e.h - e.dy - p.y));
    }, PASTE_OFFSET * this.pasteRun.n);
    const idMap = new Map<string, string>();
    const newIds = new Set<string>();
    for (const p of parts) {
      const np: Part = {
        ...p,
        id: this.freeRef(p.type),
        x: p.x + offset,
        y: p.y + offset,
        attrs: migratePartAttrs(p),
      };
      idMap.set(p.id, np.id);
      this.diagram.parts.push(np);
      this.renderPart(np);
      newIds.add(np.id);
    }
    for (const w of payload.wires) {
      const a = idMap.get(w.a.partId);
      const b = idMap.get(w.b.partId);
      if (!a || !b) continue;
      const nw: Wire = {
        ...w,
        id: uid('w-'),
        a: { partId: a, pin: w.a.pin },
        b: { partId: b, pin: w.b.pin },
        points: w.points?.map((pt) => ({ x: pt.x + offset, y: pt.y + offset })),
      };
      this.diagram.wires.push(nw);
      // Les fils implicites d'enfichage ne sont jamais tracés (cf. loadDiagram).
      if (!nw.auto) this.drawWire(nw);
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

  /**
   * Texte du presse-papier système : API du navigateur d'abord, hôte VS Code
   * ensuite. Dans une webview, `navigator.clipboard.readText()` peut être
   * refusée sans erreur exploitable — l'extension (`vscode.env.clipboard`), elle,
   * y accède toujours.
   */
  private async readSystemClipboard(): Promise<string | null> {
    try {
      const text = await navigator.clipboard?.readText();
      if (text) return text;
    } catch {
      // lecture refusée (permission / focus) : on passe par l'hôte.
    }
    try {
      return (await this.onClipboardRead?.()) ?? null;
    } catch {
      return null;
    }
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
      return;
    } catch {
      // presse-papier indisponible (focus/permission) : repli sur l'hôte.
    }
    // Dernier recours : c'est l'extension qui écrit le presse-papier système —
    // sans quoi la copie ne sortirait pas de cette webview.
    this.onClipboardWrite?.(svg);
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

  /**
   * Affiche le poster de brochage en surimpression de la carte (comme le câblage
   * interne). Asynchrone : le markup est chargé depuis dist/pinout/ au premier
   * affichage (il n'est plus inliné dans le bundle), puis gardé en cache. Le
   * chargement passe AVANT la mesure — celle-ci lit des rects qui peuvent avoir
   * changé pendant l'attente — et l'on revérifie que le poster est toujours
   * demandé (l'utilisateur a pu re-cliquer sur ☢ ou désélectionner entre-temps).
   */
  private async renderPinout(partId: string): Promise<void> {
    const r0 = this.rendered.get(partId);
    if (!r0) return;
    const poster = pinoutPoster(r0.part.type);
    if (!poster) return;
    const svg = await loadPinoutSvg(r0.part.type);
    if (svg === null) return;
    const r = this.rendered.get(partId);
    if (!r || !this.pinoutShown.has(partId) || !this.isSelected(partId)) return;
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
    // Taille nominale de CETTE variante : les Pico 2 sont dessinées en portrait,
    // les Pico 1 en paysage.
    const nominal = boardSize(r.part.type);
    let width = nominal.w;
    let height = nominal.h;
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
    overlay.innerHTML = svg;
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
    const prevAttrs = { ...r.part.attrs };
    r.part.attrs = { ...prevAttrs, [attr]: value };
    // Transistor : une patte ne porte qu'UNE électrode. Poser E sur la patte
    // déjà occupée par C échange les deux (plutôt que d'empiler deux électrodes
    // au même endroit) ; l'inspecteur est redessiné pour montrer l'échange.
    // Un MOSFET porte G/D/S là où un bipolaire porte E/B/C (Frank, v2026.7.252) :
    // l'échange vaut pour les deux triplets, jamais entre les deux.
    const electrodes = (['e', 'b', 'c'] as const).includes(attr as 'e')
      ? (['e', 'b', 'c'] as const)
      : (['g', 'd', 's'] as const).includes(attr as 'g') ? (['g', 'd', 's'] as const) : null;
    if (electrodes && partDef(r.part.type).kind === 'transistor') {
      const prev = prevAttrs[attr] ?? '';
      const other = electrodes.find((k) => k !== attr && (prevAttrs[k] ?? '') === value);
      if (other && prev !== '') {
        r.part.attrs = { ...r.part.attrs, [other]: prev };
        r.el.setAttribute(other, prev);
        queueMicrotask(() => this.renderInspector());
      }
    }
    // Condensateur : la tension maximale par défaut n'est pas la même selon le
    // type — 400 V pour un plastique, 16 V pour un tantale ou un chimique. Les
    // trois se posent depuis UNE entrée de palette : passer un condensateur en
    // chimique lui laissait les 400 V du plastique, que la nomenclature
    // recopiait telle quelle (Frank, v2026.7.251). La tension suit donc le type,
    // TANT QU'ELLE n'a pas été saisie à la main — une valeur choisie est gardée.
    if (attr === 'ctype' && partDef(r.part.type).kind === 'capacitor') {
      const avant = capacitorDefOf(prevAttrs.ctype ?? '')?.attrs?.vmax ?? '';
      const apres = capacitorDefOf(value)?.attrs?.vmax ?? '';
      if (apres && (prevAttrs.vmax ?? '') === avant) {
        r.part.attrs = { ...r.part.attrs, vmax: apres };
        queueMicrotask(() => this.renderInspector());
      }
    }
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
    // l'adresse affichée suive le pad qu'on vient de (dé)cocher. Vaut aussi pour
    // le robot araignée, qui embarque un PCA9685 adressé de la même façon.
    if (/^ad[0-5]$/.test(attr) && hasPca9685Pads(partDef(r.part.type))) {
      r.part.attrs = { ...r.part.attrs, address: pca9685AddressText(r.part.attrs) };
      r.el.setAttribute('address', r.part.attrs.address);
      queueMicrotask(() => this.renderInspector());
    }
    // Circuit intégré : la référence (et, en série 74, la famille) pose d'un coup
    // l'inscription, le symbole interne et le BROCHAGE. Changer de référence
    // rebaptise donc les pattes — et le 74xx02 ne met pas ses sorties là où le
    // 74xx00 met les siennes. Les fils sont ancrés au NOM de la broche : on les
    // reporte patte par patte (même numéro, nouveau nom), sinon ils sauteraient
    // d'une patte à l'autre (« A1 » n'est pas la même patte d'une référence à
    // l'autre) ou deviendraient orphelins (le CD40106 nomme les siennes a, a̅…).
    if ((attr === 'ref' || attr === 'family') && partDef(r.part.type).kind === 'logic-ic') {
      const family = attr === 'family' ? value : (r.part.attrs?.family ?? '');
      const before = icRef(prevAttrs.ref ?? '')?.pins;
      r.part.attrs = { ...r.part.attrs, ...icAttrs(r.part.attrs?.ref ?? '', family) };
      const after = icRef(r.part.attrs.ref ?? '')?.pins;
      if (before && after && before !== after) {
        for (const w of this.diagram.wires) {
          for (const end of [w.a, w.b]) {
            if (end.partId !== partId) continue;
            const n = before.indexOf(end.pin);
            if (n >= 0 && after[n]) end.pin = after[n];
          }
        }
      }
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
    // Transistor à pattes NOMMÉES : changer l'affectation d'une électrode change
    // le nom porté par chaque pastille (E passe de la patte 1 à la patte 3 en
    // adoptant un BC547) — re-rendu, sinon les pastilles gardent leur ancien nom.
    // Condensateur : `ctype` change de DESSIN, donc de boîte (30×50 pour le film,
    // 30×70 pour les polarisés) et de hauteur de pattes (y = 40 → 60). Sans
    // re-rendu, le dessin plus haut était comprimé dans l'ancienne boîte et les
    // pastilles restaient à mi-corps ; les noms affichés (« − »/« + ») aussi.
    // Transistor : changer de RÉFÉRENCE pose d'un coup son boîtier, sa famille,
    // son symbole interne et son brochage. Sans re-rendu, l'IRF530 (TO-220,
    // G/D/S) gardait les pastilles du TO-92 bipolaire précédent : trois pastilles
    // E/B/C à mi-corps, loin des pattes dessinées (Frank, v2026.7.252). Le BD911
    // n'y échappait que par accident, ses attributs e/b/c déclenchant le re-rendu.
    const movesElectrode = electrodes !== null
      && partDef(r.part.type).kind === 'transistor' && (r.part.attrs?.named ?? '') !== '';
    const rebuildsTransistor = (attr === 'pkg' || attr === 'symbol' || attr === 'schema' || attr === 'named' || attr === 'ref')
      && partDef(r.part.type).kind === 'transistor';
    // Circuit intégré : la référence rebaptise les pattes, la famille réécrit
    // l'inscription du boîtier — les deux se voient sur le dessin.
    const rebuildsIc = (attr === 'ref' || attr === 'family') && partDef(r.part.type).kind === 'logic-ic';
    // Résistance : `orientation` change de DESSIN (80×20 couchée, 50×70 debout),
    // donc de boîte et de position des pattes — même raison que `ctype`.
    if (movesElectrode || rebuildsTransistor || rebuildsIc || attr === 'ctype' || attr === 'orientation' || attr === 'angle' || attr === 'flip' || attr === 'size' || attr === 'pins' || attr === 'lcdSize' || attr === 'columns' || attr === 'digits') {
      this.rerenderPart(partId); // renderPart restaure le câblage interne s'il était affiché
      if (this.selection?.kind === 'part' && this.selection.id === partId) {
        const again = this.rendered.get(partId);
        again?.container.classList.add('part--selected');
        // Le re-rendu a DÉTRUIT le corps, donc le rectangle de sélection avec
        // lui : sans ce recalage, changer de référence pendant que le composant
        // est sélectionné laissait le cadre du modèle précédent — un TO-92 encore
        // encadré alors qu'un TO-220 y était dessiné (Frank, v2026.7.252). On
        // attend que Lit ait rendu, sinon il n'y a rien à mesurer.
        void (again?.el as { updateComplete?: Promise<unknown> })?.updateComplete
          ?.then(() => this.fitSelectionBox(partId));
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
    // Afficheur 4 chiffres : `colon` (mode horloge 88:88) choisit un AUTRE schéma
    // interne (2 points d'horloge). S'il est affiché, le régénérer sur-le-champ —
    // sinon il faut quitter puis re-cliquer sur K pour voir le bon schéma.
    if (attr === 'colon' && this.internalShown.has(partId)) {
      this.renderInternalWiring(partId);
    }
    // Attribut dont dépend la VISIBILITÉ d'une autre propriété (showIf) : l'inspecteur
    // est reconstruit pour faire apparaître/disparaître la propriété conditionnelle
    // (ex. « Colon » n'existe que pour l'afficheur 4 chiffres).
    const def = partDef(r.part.type);
    const gatesAProp = (def.props ?? []).some((p) => {
      if (!p.showIf) return false;
      const conds = Array.isArray(p.showIf) ? p.showIf : [p.showIf as PropCondition];
      return conds.some((c) => c.attr === attr);
    });
    if (gatesAProp && this.selection?.kind === 'part' && this.selection.id === partId) {
      this.renderInspector();
    }
    this.notify();
  }

  private renderInspector(): void {
    this.inspector.replaceChildren();
    this.propGroup = null; // le corps de section du rendu précédent est détaché
    this.propPanels.length = 0; // ses tiroirs aussi (l'accordéon repart sur les neufs)
    const title = document.createElement('h3');
    title.textContent = t('Properties');
    this.inspector.appendChild(title);

    // Sélection multiple : résumé + actions de groupe (rotation/miroir/suppression).
    if (this.selectedParts.size > 1) {
      this.renderMultiInspector();
      return;
    }

    // Lot de câbles (Ctrl+clic sur les fils) : résumé + recoloriage + suppression
    // groupée. Le sélecteur de couleur applique la teinte à TOUT le lot d'un coup
    // (même widget que l'inspecteur d'un fil unique).
    if (this.selectedWires.size > 0) {
      const sub = document.createElement('p');
      sub.className = 'inspector__hint';
      sub.textContent = t('{0} wire(s) selected', this.selectedWires.size);
      this.inspector.appendChild(sub);

      const label = document.createElement('label');
      label.className = 'inspector__label';
      label.textContent = t('Color (Dupont cables)');
      this.inspector.appendChild(label);

      // Pastille active = couleur commune au lot, s'ils la partagent tous.
      const ids = [...this.selectedWires];
      const colors = new Set(
        ids.map((id) => this.diagram.wires.find((w) => w.id === id)?.color ?? 'green')
      );
      const common = colors.size === 1 ? [...colors][0] : null;

      const swatches = document.createElement('div');
      swatches.className = 'inspector__swatches';
      for (const color of DUPONT_COLORS) {
        const sw = document.createElement('button');
        sw.className = 'inspector__swatch' + (common === color.id ? ' inspector__swatch--active' : '');
        sw.style.background = color.hex;
        sw.title = t(color.label);
        sw.addEventListener('click', () => {
          for (const id of this.selectedWires) this.setWireColor(id, color.id);
          this.notify();
          this.renderInspector();
        });
        swatches.appendChild(sw);
      }
      this.inspector.appendChild(swatches);

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

  /** Inspecteur d'une sélection multiple : nombre + transformations de groupe.
   *  Si TOUS les composants sélectionnés sont du même type, ses propriétés sont
   *  éditables ici et chaque changement s'applique à TOUTE la sélection. */
  private renderMultiInspector(): void {
    const ids = [...this.selectedParts];
    const parts = ids.map((id) => this.rendered.get(id)?.part).filter((p): p is Part => !!p);
    const types = new Set(parts.map((p) => p.type));
    const homogeneous = types.size === 1 && parts.length > 1;

    const subtitle = document.createElement('p');
    subtitle.className = 'inspector__subtitle';
    subtitle.textContent =
      homogeneous
        ? t('{0} × {1} — shared properties', String(parts.length), t(partDef(parts[0].type).label))
        : t('{0} parts selected', this.selectedParts.size);
    this.inspector.appendChild(subtitle);

    // Propriétés partagées : même type pour tous → on édite le groupe d'un coup.
    if (homogeneous) {
      const def = partDef(parts[0].type);
      const memberIds = parts.map((p) => p.id);
      for (const prop of def.props ?? []) {
        if (!this.propVisible(def, parts[0], prop)) continue;
        this.appendPropControl(memberIds, parts, prop);
      }
      if ((def.props ?? []).length === 0) {
        const hint = document.createElement('p');
        hint.className = 'inspector__hint';
        hint.textContent = t('No editable property for this part.');
        this.inspector.appendChild(hint);
      }
    }

    this.appendTransformControl(null);
    this.appendDeleteButton(t('Delete the selection'), () => {
      const ids = [...this.selectedParts];
      for (const id of ids) this.removePart(id);
      this.select(null);
    });
    const help = [
      t('+ or − to rotate the parts'),
      t('Drag a part to move the whole selection.'),
      t('Ctrl+C / Ctrl+V: copy / paste, from one project to another too — Ctrl+D: duplicate.'),
    ];
    if (homogeneous) help.unshift(t('Changing a property applies to the whole selection.'));
    this.appendHelp(help);
  }

  private renderWireInspector(wireId: string): void {
    const wire = this.diagram.wires.find((w) => w.id === wireId);
    if (!wire) return;

    const subtitle = document.createElement('p');
    subtitle.className = 'inspector__subtitle';
    // Nom de l'équipotentielle du fil accolé au titre — « Fil A → B (Nœud 3) » :
    // deux fils au même potentiel portent le même (Nœud <n>). Un fil `auto`
    // (invisible, enfichage) n'est pas nommé : titre inchangé dans ce cas.
    const eqp = nameEquipotentials(this.diagram).eqpOfWire(wireId);
    subtitle.textContent = t('Wire {0} → {1}', wire.a.pin, wire.b.pin);
    if (eqp) {
      // Le nom du nœud est CLIQUABLE : il sélectionne d'un coup tous les fils
      // au même potentiel (repérage visuel, suppression ou recoloriage en lot).
      subtitle.append(' (');
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'inspector__eqp';
      link.textContent = t('Node {0}', eqp.replace(/^eqp-/, ''));
      link.title = t('Select every wire of this node');
      link.addEventListener('click', () => this.selectEquipotential(eqp));
      subtitle.appendChild(link);
      subtitle.append(')');
    }
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
        this.notify(); // couleur sauvegardée et annulable
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
    // Identifiant du composant devant son libellé (« relay-1 - Relais OMRON G5V ») :
    // c'est ce nom que portent les messages de simulation et les fils de la netlist,
    // il doit se retrouver d'un coup d'œil depuis les propriétés.
    subtitle.textContent = `${partId} - ${t(def.label)}`;
    this.inspector.appendChild(subtitle);

    // Bouton d'aide locale sur le composant (fiche hors-ligne, docs/<lang>/composants).
    // Un composant intégré a toujours la sienne ; un composant de bibliothèque
    // n'en a que si son .kompix en embarque une (`hasHelp`) — le fait maison
    // dessiné ici, lui, n'a rien à ouvrir.
    if (def.tag !== 'kablix-custom-part' || def.custom?.hasHelp) {
      const help = document.createElement('button');
      help.className = 'inspector__doc';
      help.textContent = t('Component help'); // l'icône vient du CSS (--kx-help-icon)
      help.title = t('Open the help for this part');
      help.addEventListener('click', () => this.onComponentHelp?.(def.type));
      this.inspector.appendChild(help);
    }

    // Transistor de la bibliothèque : tant qu'aucune référence n'est choisie
    // (ou qu'on demande à en changer), l'inspecteur montre le SÉLECTEUR à la
    // place des propriétés — critères en haut, modèles retenus en dessous.
    if (def.type === 'transistor' && this.transistorPicking(partId, r.part)) {
      this.appendTransistorPicker(partId, r.part);
      this.appendTransformControl(r.part);
      this.appendDeleteButton(t('Delete the part'), () => this.removePart(partId));
      this.appendHelp([t('Pick a model, or a custom NPN/PNP to set everything yourself.')]);
      return;
    }

    // PCA9685 (nu ou embarqué dans l'araignée) : l'adresse résultant des six
    // pads AD0..AD5, écrite comme sur la fiche du module (0x40..0x7F) — c'est
    // elle qu'attend le programme. TOUT EN HAUT (v2026.8.64) : c'est le rappel
    // qu'on vient chercher, il ne doit pas être à chercher sous 27 réglages.
    if (hasPca9685Pads(def)) {
      const addr = document.createElement('p');
      addr.className = 'inspector__hint inspector__address';
      addr.textContent = `${t('I²C address')} : ${pca9685AddressText(r.part.attrs)}`;
      this.inspector.appendChild(addr);
    }

    for (const prop of def.props ?? []) {
      if (!this.propVisible(def, r.part, prop)) continue;
      this.appendPropControl(partId, r.part, prop);
    }
    this.propGroup = null; // fin des propriétés : la suite retourne au fil
    if (def.type === 'transistor') this.appendTransistorSummary(partId, r.part);
    // Prototypes génériques (types npn / pnp) : tout est réglable, donc tout est
    // enregistrable — même bouton que sur le modèle personnalisé du sélecteur.
    if (def.type === 'npn' || def.type === 'pnp') this.appendSaveTransistorButton(partId, r.part);
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

  // --- Sélecteur de transistor -------------------------------------------------
  // Un seul « Transistor » dans la bibliothèque : le modèle se choisit ici, par
  // critères. Les critères sont un état d'INTERFACE (ils ne partent pas dans le
  // .projix) ; seul le résultat du choix est écrit dans les attributs.
  private transistorFilter: TransistorFilter = { ...DEFAULT_TRANSISTOR_FILTER };
  /** Composant dont on est en train de (re)choisir le modèle, le cas échéant. */
  private pickingTransistor: string | null = null;

  private transistorPicking(partId: string, part: Part): boolean {
    return this.pickingTransistor === partId || (part.attrs?.ref ?? '') === '';
  }

  /** Ouvre (ou rouvre) le sélecteur, critères calés sur le modèle en place. */
  private openTransistorPicker(partId: string, part: Part): void {
    this.pickingTransistor = partId;
    const type = (part.attrs?.symbol ?? 'npn') as TransistorType;
    this.transistorFilter = {
      ...DEFAULT_TRANSISTOR_FILTER,
      symbol: TRANSISTOR_TYPES.includes(type) ? type : 'npn',
      pkg: part.attrs?.pkg ?? 'to92',
    };
    this.renderInspector();
  }

  private appendTransistorPicker(partId: string, part: Part): void {
    const f = this.transistorFilter;
    // Une liste déroulante de critère : le seuil vide vaut « peu importe ».
    const criterion = (
      label: string,
      key: keyof TransistorFilter,
      options: readonly string[],
      text: (v: string) => string
    ): void => {
      const lab = document.createElement('label');
      lab.className = 'inspector__label';
      lab.textContent = t(label);
      this.inspector.appendChild(lab);
      const select = document.createElement('select');
      select.className = 'inspector__control';
      for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt === '' ? t('Any') : text(opt);
        if (opt === f[key]) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => {
        this.transistorFilter = { ...this.transistorFilter, [key]: select.value } as TransistorFilter;
        this.renderInspector(); // la liste des modèles suit les critères
      });
      this.inspector.appendChild(select);
    };

    const mos = isMosType(f.symbol);
    criterion('Type', 'symbol', TRANSISTOR_TYPES, (v) => t(TYPE_LABELS[v as TransistorType]));
    criterion('Package', 'pkg', TRANSISTOR_FILTER_OPTIONS.pkg,
      (v) => PACKAGE_LABELS[v as TransistorPackage] ?? v);
    // Les deux familles ne se choisissent pas sur les mêmes chiffres : un MOSFET
    // n'a pas de gain (sa grille ne consomme rien), un bipolaire pas de Rds(on).
    criterion(mos ? 'Max Id at least' : 'Max Ic at least', 'icmax', TRANSISTOR_FILTER_OPTIONS.icmax,
      (v) => (Number(v) < 1 ? `${Math.round(Number(v) * 1000)} mA` : `${v} A`));
    criterion(mos ? 'Max Vds at least' : 'Max Vce at least', 'vcemax',
      TRANSISTOR_FILTER_OPTIONS.vcemax, (v) => `${v} V`);
    if (mos) criterion('Rds(on) at most', 'rdson', TRANSISTOR_FILTER_OPTIONS.rdson, (v) => `${v} Ω`);
    else criterion('Gain at least', 'gain', TRANSISTOR_FILTER_OPTIONS.gain, (v) => `β ${v}`);

    const title = document.createElement('label');
    title.className = 'inspector__label';
    title.textContent = t('Matching models');
    this.inspector.appendChild(title);

    const list = document.createElement('div');
    list.className = 'inspector__reflist';
    // Molette et flèches d'ascenseur : UN cran = UN modèle, jamais de ligne
    // coupée en deux. Tout le calage vit dans `liste-crantee.mts` (éprouvé au
    // clic réel par verify:ascenseur).
    installerListeCrantee(list);
    const choose = (choice: string): void => {
      for (const [attr, value] of Object.entries(transistorAttrs(choice, this.transistorFilter))) {
        this.updatePartAttr(partId, attr, value);
      }
      this.pickingTransistor = null;
      this.renderInspector(); // retour à l'affichage normal des propriétés
    };
    const entry = (value: string, name: string, detail: string, nouveau = false): void => {
      const btn = document.createElement('button');
      // `--nouveau` : les modèles de la dernière liste de Frank, écrits en bleu
      // pour se repérer d'un coup d'œil parmi les anciens.
      btn.className = 'inspector__ref'
        + (part.attrs?.ref === value ? ' inspector__ref--active' : '')
        + (nouveau ? ' inspector__ref--nouveau' : '');
      const strong = document.createElement('strong');
      strong.textContent = name;
      const small = document.createElement('small');
      small.textContent = detail;
      btn.append(strong, small);
      btn.addEventListener('click', () => choose(value));
      list.appendChild(btn);
    };

    const matches = filterTransistors(f);
    for (const ref of matches) entry(ref.ref, ref.ref, transistorSummary(ref), ref.nouveau);
    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'inspector__hint';
      empty.textContent = t('No model matches these criteria.');
      list.appendChild(empty);
    }
    // Le modèle personnalisé reste TOUJOURS proposé : c'est la porte de sortie
    // quand aucune référence du commerce ne convient, et il arrive pré-rempli
    // avec les critères demandés — dans la famille choisie.
    entry(customRefOf(f.symbol), customTransistorName(f.symbol),
      t('Every characteristic stays editable'));
    this.inspector.appendChild(list);
  }

  /** Sous les propriétés : le modèle en place et le bouton pour en changer. */
  private appendTransistorSummary(partId: string, part: Part): void {
    const ref = part.attrs?.ref ?? '';
    const custom = isCustomRef(ref);
    const line = document.createElement('p');
    line.className = 'inspector__hint';
    const ic = Number(part.attrs?.icmax ?? 0);
    const icText = ic < 1 ? `${Math.round(ic * 1000)} mA` : `${ic} A`;
    const type = part.attrs?.symbol ?? 'npn';
    const mos = isMosType(type);
    const name = custom ? customTransistorName(customRefType(ref)) : ref;
    // Un MOSFET se juge sur sa résistance de passage, un bipolaire sur son gain.
    const dernier = mos ? `Rds(on) ${part.attrs?.rdson ?? ''} Ω` : `β ${part.attrs?.gain ?? ''}`;
    line.textContent = `${name} — ${part.attrs?.vcemax ?? ''} V, ${icText}, ${dernier}`;
    this.inspector.appendChild(line);
    // Brochage : il change d'un modèle à l'autre (la famille BC5xx est C-B-E)
    // alors que les NOMS de broches, eux, ne bougent jamais.
    const pinout = document.createElement('p');
    pinout.className = 'inspector__hint';
    const roles = mos ? (['g', 'd', 's'] as const) : (['e', 'b', 'c'] as const);
    const legs = ['1', '2', '3'].map((n) => {
      const el = roles.find((k) => (part.attrs?.[k] ?? '') === n);
      return el ? el.toUpperCase() : '–';
    });
    pinout.textContent = `${t('Pinout (flat face)')} : ${legs.join(' ')}`;
    this.inspector.appendChild(pinout);

    const change = document.createElement('button');
    change.className = 'inspector__button';
    change.textContent = t('Change transistor…');
    change.addEventListener('click', () => this.openTransistorPicker(partId, part));
    this.inspector.appendChild(change);
    // Un modèle du commerce est figé par sa fiche : il n'y a rien à enregistrer.
    // Le personnalisé, lui, n'existe que dans ce schéma tant qu'on ne le range
    // pas dans la bibliothèque.
    if (custom) this.appendSaveTransistorButton(partId, part);
  }

  /** Bouton « Enregistrer dans mes composants » d'un transistor générique. */
  private appendSaveTransistorButton(partId: string, part: Part): void {
    const btn = document.createElement('button');
    btn.className = 'inspector__button';
    btn.textContent = t('Save to my parts…');
    btn.title = t('Add this transistor to the library, under “Custom parts”');
    btn.addEventListener('click', () => this.saveTransistorAsPart(partId, part));
    this.inspector.appendChild(btn);
  }

  /**
   * Range le transistor générique courant dans les composants personnalisés :
   * son dessin (inscription comprise), son schéma interne et ses caractéristiques
   * deviennent un composant à part entière, reposable depuis la bibliothèque et
   * conservé d'un projet à l'autre. Réenregistrer la même inscription MET À JOUR
   * le composant au lieu d'en empiler un second.
   */
  private saveTransistorAsPart(partId: string, part: Part): void {
    const r = this.rendered.get(partId);
    const src = r ? ((r.el.shadowRoot ?? r.el).querySelector('svg') as SVGSVGElement | null) : null;
    if (!r || !src) return;
    const w = src.width?.baseVal?.value || 50;
    const h = src.height?.baseVal?.value || 50;
    // Le dessin quitte le shadow DOM de l'élément : sa feuille de style ne le
    // suit pas. L'inscription emporte donc sa police et son centrage avec elle,
    // sans quoi elle partirait à gauche du boîtier dans le composant enregistré.
    const svg = src.outerHTML.replace(
      /^(<svg[^>]*>)/,
      `$1<style>text{font-family:'OCR A Std','Consolas',monospace;text-anchor:middle}</style>`
    );
    const pins = ((r.el.pinInfo ?? []) as PinPoint[]).map((p) => ({ name: p.name, x: p.x, y: p.y }));
    // Les électrodes deviennent des RÔLES : le modèle de simulation les retrouve
    // par là, y compris quand les pattes s'appellent 1/2/3 (prototype générique).
    const legName = (k: string): string => {
      const n = Number(part.attrs?.[k] ?? 0);
      return pins[n - 1]?.name ?? k.toUpperCase();
    };
    const inner = internalWiringSvg('transistor', pins, part.attrs, part.type, { w, h });
    const innerSvg = inner
      ? `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="${SVG_NS}">` +
        `<g fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`
      : undefined;
    const marking = String(part.attrs?.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
    const famille = part.attrs?.symbol ?? (part.type === 'pnp' ? 'pnp' : 'npn');
    const mos = isMosType(famille);
    const label = marking || customTransistorName(famille);
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'transistor';
    const type = `custom-${famille}-${slug}`;
    const known = this.customData.has(type);
    this.saveCustomPart({
      type,
      label,
      kind: 'transistor',
      svg,
      pins,
      // Rôles lus par la simulation : G/D/S sur un MOSFET, E/B/C sinon.
      pinRoles: mos
        ? { G: legName('g'), D: legName('d'), S: legName('s') }
        : { E: legName('e'), B: legName('b'), C: legName('c') },
      // Le gain (ou Rds(on)) est ce que lit la simulation ; les tensions et
      // courants maximaux restent informatifs, comme sur une référence.
      attrs: {
        symbol: famille,
        gain: part.attrs?.gain ?? '100',
        rdson: part.attrs?.rdson ?? '0.5',
        vcemax: part.attrs?.vcemax ?? '40',
        icmax: part.attrs?.icmax ?? '0.6',
      },
      innerSvg,
      innerOffset: innerSvg ? { x: 0, y: 0 } : undefined,
    });
    this.showInspectorNote(
      known
        ? t('“{0}” updated in the library, under “Custom parts”.', label)
        : t('“{0}” saved: you will find it in the library, under “Custom parts”.', label)
    );
  }

  /** Message passager sous les propriétés (confirmation d'une action). */
  private showInspectorNote(message: string): void {
    this.inspector.querySelector('.inspector__note')?.remove();
    const note = document.createElement('p');
    note.className = 'inspector__hint inspector__note';
    note.style.color = '#8ae08a';
    note.textContent = message;
    this.inspector.appendChild(note);
    setTimeout(() => note.remove(), 8000);
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

  /** Contrôle de propriété. `partId`/`part` acceptent une LISTE : en sélection
   *  multiple homogène, chaque changement est appliqué à tous les composants.
   *  La valeur affichée est celle du premier ; si les composants divergent, le
   *  contrôle reste utilisable et le premier réglage les aligne tous. */
  /** Valeur effective d'un attribut : celle de la part, sinon le défaut du catalogue. */
  private effectiveAttr(def: PartDef, part: Part, attr: string): string {
    return part.attrs?.[attr] ?? def.attrs?.[attr] ?? '';
  }

  /** Une propriété conditionnelle (showIf) n'est affichée que si sa condition est remplie. */
  private propVisible(def: PartDef, part: Part, prop: PropDef): boolean {
    if (!prop.showIf) return true;
    // Conditions cumulatives : toutes doivent être remplies.
    const conds = Array.isArray(prop.showIf) ? prop.showIf : [prop.showIf as PropCondition];
    return conds.every((c) => c.equals.includes(this.effectiveAttr(def, part, c.attr)));
  }

  /** Section repliable de propriétés en cours de remplissage (son titre, son corps). */
  private propGroup: string | null = null;
  private propGroupBody: HTMLElement | null = null;
  /**
   * Sections de propriétés DÉPLIÉES, par « type:groupe ». Repliées à l'ouverture
   * (demande de Frank) : un robot araignée aligne 27 réglages, sa fiche tient
   * autrement sur trois écrans. L'état vit ici et non dans le schéma — c'est du
   * confort d'affichage, il ne part pas dans le .projix.
   */
  private readonly openPropGroups = new Set<string>();
  /**
   * Tiroirs du rendu EN COURS (clé + bascule d'affichage). Sert à l'accordéon :
   * ouvrir un tiroir referme celui d'avant, il faut donc pouvoir agir sur les
   * autres panneaux sans reconstruire l'inspecteur.
   */
  private readonly propPanels: { key: string; show: (open: boolean) => void }[] = [];

  /**
   * Où poser la propriété suivante : le corps de sa section repliable, créé à la
   * volée au premier réglage du groupe, ou l'inspecteur lui-même si elle n'est pas
   * groupée. Les propriétés d'un même groupe se suivent dans le catalogue.
   */
  private propHost(type: string, group?: string, note?: string): HTMLElement {
    if (!group) {
      this.propGroup = null;
      return this.inspector;
    }
    if (this.propGroup === group && this.propGroupBody) return this.propGroupBody;

    const key = `${type}:${group}`;
    const head = document.createElement('h4');
    head.className = 'inspector__group';
    const chevron = document.createElement('span');
    chevron.className = 'inspector__group-chevron';
    chevron.textContent = '▾';
    const text = document.createElement('span');
    text.textContent = t(group);
    head.append(chevron, text);

    const body = document.createElement('div');
    body.className = 'inspector__group-body';
    // Note du tiroir : ce que les libellés ne peuvent pas dire (la plage
    // attendue, le marquage de la carte…). Posée en tête du corps, elle se
    // replie avec lui.
    if (note) {
      const p = document.createElement('p');
      p.className = 'inspector__group-note';
      p.textContent = t(note);
      body.appendChild(p);
    }
    const show = (open: boolean): void => {
      head.classList.toggle('inspector__group--collapsed', !open);
      body.style.display = open ? '' : 'none';
    };
    show(this.openPropGroups.has(key));
    head.addEventListener('click', () => {
      const open = !this.openPropGroups.has(key);
      // Accordéon (v2026.8.68, demande de Frank) : un seul tiroir ouvert à la
      // fois. Sans ça, cinq tiroirs dépliés rendent le panneau aussi long
      // qu'avant qu'on les range.
      if (open) {
        for (const panel of this.propPanels) {
          if (panel.key === key || !this.openPropGroups.delete(panel.key)) continue;
          panel.show(false);
        }
        this.openPropGroups.add(key);
      } else this.openPropGroups.delete(key);
      show(open);
    });
    this.propPanels.push({ key, show });

    this.inspector.append(head, body);
    this.propGroup = group;
    this.propGroupBody = body;
    return body;
  }

  /**
   * Le libellé de la propriété qui porte DÉJÀ cette valeur, parmi celles du même
   * groupe d'unicité (`unique`) — vide si la valeur est libre. Sert à refuser un
   * canal de servo saisi deux fois.
   */
  private uniqueTakenBy(part: Part, prop: PropDef, value: string): string {
    const def = partDef(part.type);
    const jumelle = (def.props ?? []).find(
      (p) => p.unique === prop.unique && p.attr !== prop.attr && (part.attrs?.[p.attr] ?? '') === value
    );
    return jumelle ? t(jumelle.label) : '';
  }

  private appendPropControl(partId: string | string[], part: Part | Part[], prop: PropDef): void {
    const ids = Array.isArray(partId) ? partId : [partId];
    const first = Array.isArray(part) ? part[0] : part;
    const setAttr = (attr: string, value: string): void => {
      for (const id of ids) this.updatePartAttr(id, attr, value);
    };
    // Propriété groupée : tout part dans le corps de sa section repliable.
    const host = this.propHost(first.type, prop.group, prop.groupNote);
    const label = document.createElement('label');
    label.className = 'inspector__label';
    label.textContent = t(prop.label);
    host.appendChild(label);

    const current = first.attrs?.[prop.attr] ?? '';
    if (prop.kind === 'checkbox') {
      // Case à cocher : attr '1' quand cochée, vidé sinon (removeAttribute côté
      // élément — un attribut booléen Lit absent = false). Insérée DANS le
      // libellé pour que le clic sur le texte coche aussi.
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'inspector__checkbox';
      box.checked = current !== '';
      box.addEventListener('change', () => {
        setAttr(prop.attr, box.checked ? '1' : '');
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
        sw.title = colorDisplayName(opt);
        sw.addEventListener('click', () => {
          setAttr(prop.attr, opt);
          this.renderInspector();
        });
        swatches.appendChild(sw);
      }
      host.appendChild(swatches);
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
      select.addEventListener('change', () => setAttr(prop.attr, select.value));
      host.appendChild(select);
    } else if (prop.kind === 'text') {
      // Texte libre sur PLUSIEURS lignes (inscription d'un boîtier partagé) :
      // les sauts de ligne sont gardés tels quels dans l'attribut, le composant
      // en fait une ligne de sérigraphie chacun.
      const area = document.createElement('textarea');
      area.className = 'inspector__control inspector__textarea';
      area.rows = prop.rows ?? 2;
      area.value = current;
      area.addEventListener('change', () => setAttr(prop.attr, area.value));
      host.appendChild(area);
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
        setAttr(prop.attr, String(parsed));
        input.value = formatSiValue(parsed);
      });
      host.appendChild(input);
    } else if (prop.compact) {
      // Numéro qu'on RECOPIE de la carte (canal d'un servo), pas qu'on ajuste :
      // petite case de deux caractères, SANS la toupie du navigateur ni les
      // boutons +/− (v2026.8.68 — Frank : les deux façons d'incrémenter ne
      // servaient qu'à parcourir 16 valeurs une par une). Un `type=number`
      // ramènerait la toupie : c'est donc un champ texte filtré aux chiffres.
      const input = document.createElement('input');
      input.className = 'inspector__control inspector__compact';
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 2;
      input.value = current;
      const plage = t('Channel {0} to {1} (marked {2} to {3} on the board).',
        String(prop.min ?? 0), String(prop.max ?? 15), String((prop.min ?? 0) + 1), String((prop.max ?? 15) + 1));
      input.title = plage;
      // Saisie refusée (hors plage, ou canal déjà pris) : le champ revient à sa
      // valeur et clignote en rouge. Rien n'est enregistré — c'est le sens de
      // « empêcher la saisie », plutôt qu'accepter puis se plaindre plus tard.
      const refuse = (why: string): void => {
        input.value = first.attrs?.[prop.attr] ?? '';
        input.classList.remove('inspector__compact--bad');
        void input.offsetWidth; // relance l'animation même sur deux refus de suite
        input.classList.add('inspector__compact--bad');
        input.title = why;
        setTimeout(() => {
          input.classList.remove('inspector__compact--bad');
          input.title = plage;
        }, 1200);
      };
      input.addEventListener('input', () => {
        const chiffres = input.value.replace(/\D/g, '').slice(0, 2);
        if (chiffres !== input.value) input.value = chiffres;
      });
      input.addEventListener('change', () => {
        const txt = input.value.trim();
        if (txt === '') {
          setAttr(prop.attr, ''); // vide autorisé : signalé au lancement de la simulation
          return;
        }
        const v = Number(txt);
        if (
          !Number.isFinite(v) ||
          (prop.min !== undefined && v < prop.min) ||
          (prop.max !== undefined && v > prop.max)
        ) {
          refuse(plage);
          return;
        }
        // Unicité : deux servos ne se branchent pas sur la même sortie.
        if (prop.unique && this.uniqueTakenBy(first, prop, String(v))) {
          refuse(t('Channel {0} is already used by another servo.', String(v)));
          return;
        }
        input.value = String(v);
        setAttr(prop.attr, String(v));
      });
      host.appendChild(input);
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
      // Pas fractionnaire : on arrondit au nombre de décimales DU PAS (5,1 + 0,1
      // → 5,2, jamais 5.199999999999999 — demandé pour l'alim, vaut partout).
      // Un pas de 0,1 borne donc la saisie à une décimale (gain d'un transistor).
      const decimals = step < 1 ? (String(step).split('.')[1]?.length ?? 2) : 0;
      const commit = (v: number): void => {
        const c = clamp(v);
        const p = 10 ** decimals;
        const value = String(decimals > 0 ? Math.round(c * p) / p : c);
        input.value = value;
        setAttr(prop.attr, value);
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
      host.appendChild(row);
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
    // Pendant le settle post-chargement, un notify ne traduit AUCUNE édition
    // utilisateur (re-snap différé, mise à l'échelle des dessins) : on cale la
    // référence « enregistré » sur le nouvel index pour que `isDirty()` reste
    // faux (pas de faux point ● à la réouverture d'un projet propre). L'undo
    // reste possible : l'entrée est bien empilée, seule la base dirty suit.
    if (this.settling) this.savedHistoryIndex = this.historyIndex;
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
    const defsParts: string[] = []; // <defs> remontées au niveau racine (dégroupage Inkscape)
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

    // Les platines d'essai et les shields-socles sont dessinés en premier (donc
    // derrière) : sans cela un support ajouté après un composant passait devant
    // lui dans le SVG (la Pico enfichée doit rester visible sur son shield). Une
    // carte fille posée sur une carte hôte vient juste après elle, avant les
    // composants ordinaires.
    const behind = (d: PartDef): number => {
      if (d.kind === 'breadboard' || (d.kind === 'grove-shield' && !d.custom?.shield?.host)) return 0;
      if (d.kind === 'mcu') return 1;
      if (d.kind === 'grove-shield') return 2;
      return 3;
    };
    const order = [...this.rendered.values()].sort(
      (a, b) => behind(partDef(a.part.type)) - behind(partDef(b.part.type))
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
      // Retournement : même convention qu'à l'écran (miroir appliqué APRÈS la
      // rotation, autour du centre du corps). Il ne change pas le cadrage — un
      // miroir autour du centre laisse la boîte englobante identique.
      const fx = r.part.flipH ? -1 : 1;
      const fy = r.part.flipV ? -1 : 1;

      // CENTRE de rotation = centre RÉEL du corps en unités monde. `.part__body`
      // n'est PAS à (part.x, part.y) : le conteneur porte d'abord le bandeau de
      // nom (`.part__head`), le corps est donc décalé plus bas. La rotation CSS à
      // l'écran tourne le corps autour de SON centre — pas autour de x+w/2,y+h/2.
      // Prendre ce dernier faisait tourner l'export autour du mauvais point : les
      // servos à 270° sortaient décalés de ~96 px (offset PUR, échelle déjà à 1).
      // Mesuré depuis la boîte du corps, ramené en monde par le zoom.
      const bodyRectC = bodyEl.getBoundingClientRect();
      const cCenter = this.canvasPoint(bodyRectC.left + bodyRectC.width / 2, bodyRectC.top + bodyRectC.height / 2);
      const cx = cCenter.x;
      const cy = cCenter.y;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // Cadrage : les 4 coins du corps (boîte w×h centrée sur C, non tournée)
      // pivotés autour de C.
      for (const [px, py] of [
        [cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2],
        [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2],
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
        // Échelle prise sur la boîte RÉELLEMENT RENDUE du dessin, pas sur celle
        // du corps. `.part__body` englobe aussi l'étiquette sous le composant :
        // le dessin du servo est rendu 160×140 dans un corps de 160×144, et
        // `h / vbH` donnait donc sy = 1,0286 pour sx = 1 — un étirement
        // vertical de 2,8 % que le dessin ne subit PAS à l'écran (mesuré :
        // facteur réel 1 et 1). Les fils, eux, sont en coordonnées monde et ne
        // sont pas étirés : une broche dessinée à y=100 partait à y=102,9
        // pendant que son fil restait à 100. Le décalage croissant avec y, des
        // fils partant de broches voisines divergeaient — le biais visible dans
        // Inkscape (led : +7,4 %, servo : +2,8 %).
        // Troisième fois que `.part__body` ment sur la géométrie du dessin
        // (cf. v2026.7.48 overlay interne, v2026.7.133 cadre de sélection).
        const svgRect = svgEl.getBoundingClientRect();
        // Boîte rendue ramenée en unités monde (le canvas peut être zoomé). ATTENTION
        // la ROTATION est appliquée en CSS sur `.part__body` : `getBoundingClientRect`
        // renvoie donc la boîte DÉJÀ TOURNÉE. Pour un servo à 90°/270°, largeur et
        // hauteur écran sont ÉCHANGÉES par rapport au viewBox (non tourné), alors que
        // l'échelle et l'offset doivent s'exprimer dans le repère LOCAL non tourné du
        // composant — le `<g rotate>` externe (plus bas) refait la rotation. Sans
        // cela le servo tourné sortait avec sx=0,875 sy=1,143 (grossi + étiré) et ses
        // broches à ~103 px de leurs fils.
        // On dé-tourne : dimensions de la boîte et vecteur d'offset ramenés de −deg
        // autour du centre du corps (centre = point fixe de la rotation).
        const rd = (-deg * Math.PI) / 180;
        const rc = Math.cos(rd);
        const rs = Math.sin(rd);
        // Boîte rendue (locale) : la rotation autour d'un axe échange largeur/hauteur
        // pour ±90° ; formule générale via |cos|/|sin| pour rester robuste.
        const rw = (Math.abs(rc) * svgRect.width + Math.abs(rs) * svgRect.height) / this.zoom;
        const rh = (Math.abs(rs) * svgRect.width + Math.abs(rc) * svgRect.height) / this.zoom;
        // Letterbox : décalage du dessin DANS le corps, mesuré depuis le CENTRE du
        // corps (invariant par rotation) puis dé-tourné, sinon l'offset d'un
        // composant tourné pointe dans la mauvaise direction. La DIFFÉRENCE de deux
        // positions écran annule le pan : /zoom suffit ici (pas besoin de canvasPoint).
        const vx = (svgRect.left + svgRect.width / 2 - (bodyRectC.left + bodyRectC.width / 2)) / this.zoom;
        const vy = (svgRect.top + svgRect.height / 2 - (bodyRectC.top + bodyRectC.height / 2)) / this.zoom;
        // Dé-MIROIR puis dé-tournage vers le repère local du composant : à l'écran
        // le miroir s'applique APRÈS la rotation (cf. applyRotation), l'offset
        // mesuré est donc S(R(local)) — et S est sa propre réciproque.
        const uvx = vx * fx;
        const uvy = vy * fy;
        const lvx = uvx * rc - uvy * rs;
        const lvy = uvx * rs + uvy * rc;
        // Repli sur le corps si la boîte rendue est inexploitable (élément pas
        // encore mis en page, hors écran) : l'ancien comportement.
        const useRect = rw > 0.5 && rh > 0.5;
        const dw = useRect ? rw : w;
        const dh = useRect ? rh : h;
        const sx = dw / vbW;
        const sy = dh / vbH;
        // Coin haut-gauche du dessin NON TOURNÉ, en unités monde : centre du corps
        // (C = cx,cy) + décalage local vers le centre du dessin − demi-boîte. Le
        // wrapper `<g rotate(deg cx cy)>` (plus bas) refait la rotation autour de C,
        // exactement comme la rotation CSS à l'écran.
        const drawX = useRect ? cx + lvx - dw / 2 : x;
        const drawY = useRect ? cy + lvy - dh / 2 : y;
        const groupId = `kpart-${idSeq++}`;
        // Le dessin sort du shadow DOM : purge des résidus Inkscape (sans quoi
        // l'export n'est pas du XML bien formé), APLATISSEMENT des <svg> imbriqués
        // en <g> (sous-documents qui faisaient planter/déplacer/disparaître les
        // composants au dégroupage dans Inkscape), retrait des masks/clipPath (dont
        // le délien récursif faisait PLANTER Inkscape sur la carte 16 servos),
        // FUSION des <g> à enfant unique (moins de dégroupages), puis unicité des
        // ids (deux composants du même type partagent leurs défs).
        stripEditorMarkup(clone);
        flattenNestedSvgs(clone);
        stripClipAndMask(clone);
        collapseSingleChildGroups(clone);
        uniquifyIds(clone, groupId);
        // Chaînes de dégradés RÉSOLUES : un <radialGradient xlink:href="#…linear…">
        // hérite ses stops d'un autre gradient (pattern Inkscape/Fritzing). Au
        // dégroupage, Inkscape CASSE souvent ces liens `href` → gradient sans stops
        // → rendu NOIR (le rond noir du bouton de l'alim). On copie les stops
        // hérités DANS chaque gradient : chacun devient autonome, plus de chaîne.
        inlineGradientHrefs(clone);
        // Les <defs> (dégradés, filtres…) sont REMONTÉS au niveau du <svg> racine
        // de l'export, hors du <g> composant. Sinon, quand Inkscape dégroupe le
        // composant, un <defs> resté DANS un sous-groupe détruit orpheline sa
        // référence `url(#…)` — le fill retombe alors à NOIR (le bouton de l'alim
        // se retrouvait avec un rond noir après dégroupage). Au niveau racine, la
        // référence résout toujours, quel que soit le nombre de dégroupages.
        hoistDefs(clone, defsParts);
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
          `<g id="${groupId}" transform="translate(${drawX - vbX * sx} ${drawY - vbY * sy}) scale(${sx} ${sy})">` +
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
      // Enveloppe d'orientation : miroir (le plus externe, comme à l'écran) puis
      // rotation, tous deux autour du centre du corps.
      const xform: string[] = [];
      if (fx !== 1 || fy !== 1) xform.push(`translate(${cx} ${cy}) scale(${fx} ${fy}) translate(${-cx} ${-cy})`);
      if (deg) xform.push(`rotate(${deg} ${cx} ${cy})`);
      parts.push(xform.length ? `<g transform="${xform.join(' ')}">${inner}</g>` : inner);
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

    // <defs> de tous les composants regroupées à la racine (résolution des
    // dégradés préservée après dégroupage dans Inkscape).
    const rootDefs = defsParts.length ? `<defs>${defsParts.join('')}</defs>` : '';

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" ` +
        `viewBox="${vx} ${vy} ${vw} ${vh}">`,
      `<!-- Schéma exporté par Kablix -->`,
      ...(rootDefs ? [rootDefs] : []),
      ...parts,
      ...wires,
      `</svg>`,
    ].join('\n');
  }
}


/**
 * Sur quoi ce composant peut-il s'enficher, et avec quelles broches ? Trois cas :
 *   - une carte fille (Grove Shield (Uno)…) s'emboîte sur sa carte hôte par ses
 *     pastilles mâles — ses prises Grove sont femelles, elles ne comptent pas ;
 *   - une Pico / Pico W s'enfiche sur le SOCLE d'un shield qui, lui, attend une
 *     carte (`onSupport`) et nulle part ailleurs ;
 *   - tout le reste va sur les platines d'essai.
 * Une platine et un shield-socle, eux, ne s'enfichent sur rien : `null`.
 */
export type PlugRule = { host: string; own?: Set<string>; onSupport?: boolean };

export function plugRule(def: PartDef): PlugRule | null {
  const shield = def.custom?.shield;
  if (shield?.host) return { host: shield.host, own: new Set(shield.socket) };
  const kind = def.kind;
  if (kind === 'breadboard' || kind === 'grove-shield') return null;
  if (kind === 'mcu') {
    return isPicoBoard(def.board as BoardId) ? { host: 'grove-shield', onSupport: true } : null;
  }
  return { host: 'breadboard' };
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
  // Condensateur : les broches restent nommées 1/2 dans la netlist (changer de
  // type ne doit jamais orphéliner un fil), mais un modèle polarisé affiche sa
  // polarité — c'est elle qui compte au câblage.
  if (kind === 'capacitor' && attrs?.ctype !== 'np') {
    if (pinName === '1') return '−';
    if (pinName === '2') return '+';
  }
  // Relais : le commun sort des deux côtés du boîtier, mais c'est la MÊME lame.
  // Les deux pastilles (Com.1 / Com.2) s'affichent donc simplement « Com ».
  if (kind === 'relay' && /^Com\.\d+$/.test(pinName)) return 'Com';
  // Carte fille : un signal de prise ne dit pas où il aboutit sur la carte
  // (« A1.A0 » est sur GP26, pas GP27 ; « UART.TX » sur la patte 1 de la Uno).
  // La bulle ajoute donc la broche réelle — c'est elle qu'il faut écrire dans
  // le programme : « A1.A0.GP26 ».
  if (kind === 'grove-shield') {
    const spec = type ? partDef(type).custom?.shield : undefined;
    const cible = spec ? shieldSignalTarget(spec, pinName) : groveSignalGpio(pinName);
    if (cible) return `${pinName}.${cible}`;
  }
  // Composant de la bibliothèque externe : un point dans le nom d'une pastille
  // ne sert qu'à distinguer deux pastilles du MÊME signal (barrière optique :
  // « Vcc.e » côté émetteur, « Vcc.r » côté récepteur). Ce qui suit le point est
  // un repère de dessin, pas une information pour l'utilisateur : la bulle
  // n'affiche que « Vcc ». Un nom qui EST un nombre à virgule (« 3.3V ») n'est
  // évidemment pas coupé.
  if (type && partDef(type).custom && pinName.includes('.') && !/^\d/.test(pinName)) {
    return pinName.slice(0, pinName.indexOf('.'));
  }
  return pinName;
}

/**
 * Retire d'un dessin cloné tout ce qui vient de l'éditeur Inkscape et n'a aucun
 * effet de rendu : attributs `sodipodi:*` / `inkscape:*` et nœuds de service
 * (`sodipodi:namedview`…). Sans cette purge l'export n'est pas du XML bien
 * formé — le `<svg>` racine ne déclare pas ces préfixes, et un seul
 * `sodipodi:type` (le servo en porte un) suffit à faire refuser le fichier par
 * Firefox, Chrome et VS Code, et à faire planter Inkscape au dégroupage.
 * Mesuré : sans la purge, l'export échoue en « Namespace prefix sodipodi for
 * type on path is not defined ».
 */
function stripEditorMarkup(root: SVGElement): void {
  // Éléments d'INTERACTION seulement (zones de clic transparentes ajoutées par
  // les composants pour la simulation) : marqués `data-no-export`, ils ne font
  // pas partie du dessin et sortiraient sinon dans le SVG — la zone de clic du
  // bouton de l'alim (`fill="transparent"`, rendue NOIRE par Inkscape) donnait
  // un rond noir sur le bouton (« circle1282 »).
  for (const el of Array.from(root.querySelectorAll('[data-no-export]'))) el.remove();
  // Groupes d'interaction (rotation du bouton de l'alim en simulation) : APLATIS.
  // Leur rotation CSS (`style.transform: rotate(deg)` autour de `transform-origin`)
  // est bakée en attribut `transform` SVG sur chaque enfant, puis les enfants
  // remontent et le `<g>` disparaît — le dessin garde ses objets nets, sans
  // groupe technique surnuméraire.
  for (const g of Array.from(root.querySelectorAll('[data-unwrap-export]'))) {
    const parent = g.parentNode;
    if (!parent) continue;
    const st = (g as SVGElement).style;
    const rotM = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(st.transform || '');
    const deg = rotM ? parseFloat(rotM[1]) : 0;
    const origin = (st.transformOrigin || '').trim().split(/\s+/).map((v) => parseFloat(v));
    const [ox, oy] = origin.length >= 2 ? origin : [0, 0];
    const rot = deg ? `rotate(${deg} ${ox || 0} ${oy || 0})` : '';
    for (const child of Array.from(g.children)) {
      if (rot) {
        const prev = child.getAttribute('transform');
        child.setAttribute('transform', prev ? `${rot} ${prev}` : rot);
      }
      parent.insertBefore(child, g);
    }
    g.remove();
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (tag.startsWith('sodipodi:') || tag.startsWith('inkscape:')) el.remove();
  }
  const scrub = (el: Element): void => {
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (n.startsWith('sodipodi:') || n.startsWith('inkscape:')) el.removeAttribute(attr.name);
    }
    for (const child of Array.from(el.children)) scrub(child);
  };
  scrub(root);
}

/**
 * APLATIT les `<svg>` imbriqués d'un dessin cloné en `<g transform>` équivalents.
 *
 * Un `<svg>` imbriqué (celui du dessin source de Frank, ré-injecté par le
 * composant : alim 74×29 affiché 280×110, carte PCA9685 issue de Fritzing…) est
 * un SOUS-DOCUMENT : Inkscape le gère mal au dégroupage — l'alim DISPARAÎT, le
 * clavier et le pico se DÉPLACENT (il faut dégrouper plusieurs fois), et la
 * carte 16 servos FAIT PLANTER Inkscape (son viewBox Fritzing est démesuré :
 * -33528 -43298 79375 52916, soit un scale interne de ~264×). Le cadre de
 * sélection d'Inkscape sortait aussi décalé du dessin (cf. alim.png).
 *
 * On remplace donc chaque `<svg x y w h viewBox="minx miny vbw vbh">` par un
 * `<g transform="translate(x - minx·sx, y - miny·sy) scale(sx, sy)">` avec
 * sx = w/vbw, sy = h/vbh — la transformation EXACTE qu'applique un viewBox. Un
 * `<g>` se dégroupe proprement, sans sous-document ni clip. Les attributs de
 * présentation portés par le `<svg>` (fill-rule, stroke-*…) migrent sur le
 * `<g>` ; les attributs de service (xmlns, version, x/y/width/height/viewBox)
 * sont retirés. Le clip implicite du viewBox est perdu, sans effet : les
 * dessins remplissent leur viewBox (mesuré), et Inkscape ne clippe pas non plus
 * un `<svg>` imbriqué au dégroupage.
 *
 * Repli : sans width/height explicites, un `<svg>` imbriqué vaudrait 100 % du
 * viewport (le viewBox de l'export ENTIER) et sortirait géant — on lui donne
 * alors la taille de son viewBox avant d'aplatir.
 */
function flattenNestedSvgs(root: SVGElement): void {
  // De l'intérieur vers l'extérieur : aplatir un parent d'abord invaliderait les
  // références aux enfants encore imbriqués. On collecte puis on traite en
  // profondeur décroissante.
  const nested = Array.from(root.querySelectorAll('svg'));
  nested.sort((a, b) => depthOf(b) - depthOf(a));
  for (const el of nested) {
    const parent = el.parentNode;
    if (!parent) continue; // pas la racine du clone (jamais un enfant querySelectorAll)
    const vbAttr = el.getAttribute('viewBox');
    const vb = vbAttr ? vbAttr.trim().split(/[\s,]+/).map(Number) : null;
    const valid = vb && vb.length === 4 && vb.every((v) => Number.isFinite(v)) && vb[2] && vb[3];
    // Taille d'affichage : width/height explicites, sinon celle du viewBox (repli
    // anti-géant). Sans viewBox exploitable, on ne peut pas calculer d'échelle
    // fiable — on garde alors le comportement d'origine (taille explicite posée).
    const wAttr = parseFloat(el.getAttribute('width') || '');
    const hAttr = parseFloat(el.getAttribute('height') || '');
    if (!valid) {
      if (Number.isFinite(vb?.[2] as number) && !Number.isFinite(wAttr)) {
        el.setAttribute('width', String(vb?.[2] ?? 0));
      }
      continue;
    }
    const [minx, miny, vbw, vbh] = vb as number[];
    const w = Number.isFinite(wAttr) ? wAttr : vbw;
    const h = Number.isFinite(hAttr) ? hAttr : vbh;
    const x = parseFloat(el.getAttribute('x') || '0') || 0;
    const y = parseFloat(el.getAttribute('y') || '0') || 0;
    const sx = w / vbw;
    const sy = h / vbh;
    const g = root.ownerDocument!.createElementNS('http://www.w3.org/2000/svg', 'g');
    // Attributs de présentation conservés (le reste = service du <svg>).
    const drop = new Set(['x', 'y', 'width', 'height', 'viewBox', 'version', 'xmlns', 'xml:space', 'preserveaspectratio']);
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (drop.has(n) || n.startsWith('xmlns')) continue;
      g.setAttribute(attr.name, attr.value);
    }
    // translate(x - minx·sx, y - miny·sy) scale(sx, sy) = transformation du viewBox.
    const tx = x - minx * sx;
    const ty = y - miny * sy;
    const existing = el.getAttribute('transform');
    const vbXform = `translate(${tx} ${ty}) scale(${sx} ${sy})`;
    g.setAttribute('transform', existing ? `${existing} ${vbXform}` : vbXform);
    while (el.firstChild) g.appendChild(el.firstChild);
    parent.replaceChild(g, el);
  }
}

/** Profondeur d'un nœud dans son arbre (nb d'ancêtres). */
function depthOf(el: Element): number {
  let d = 0;
  let p: Node | null = el.parentNode;
  while (p) {
    d++;
    p = p.parentNode;
  }
  return d;
}

/**
 * REMONTE les `<defs>` d'un dessin cloné vers la racine de l'export : leur
 * contenu est poussé dans `sink` (émis dans un `<defs>` unique du `<svg>`
 * racine), et les `<defs>` sont retirés du clone.
 *
 * Motif : Inkscape, au dégroupage, peut détruire un sous-groupe contenant un
 * `<defs>` local ; les `url(#…)` qui le visaient deviennent alors orphelins et
 * le fill retombe à NOIR (le bouton de l'alim se retrouvait avec un rond noir).
 * À la racine, la définition reste toujours résoluble, quel que soit le nombre
 * de dégroupages. Les ids ayant déjà été rendus uniques par composant
 * (`uniquifyIds`), il n'y a pas de collision entre les défs regroupées.
 */
/**
 * RÉSOUT les chaînes de dégradés (`xlink:href` / `href` entre gradients) en
 * copiant les `<stop>` hérités dans chaque gradient qui n'en a pas.
 *
 * Motif Inkscape/Fritzing : un `<radialGradient>` porte la géométrie (cx/cy/r,
 * gradientTransform) et hérite ses couleurs d'un `<linearGradient>` via
 * `xlink:href`, sans `<stop>` propre. Au dégroupage, Inkscape CASSE souvent ces
 * liens — le gradient se retrouve sans stops et son rendu tombe à NOIR (le rond
 * noir sur le bouton de l'alim, `circle3` selon Inkscape). En inlinant les
 * stops, chaque gradient devient autonome : plus de lien fragile à casser. La
 * référence `href` est ensuite retirée (les stops sont désormais locaux).
 * Résolution récursive (une chaîne peut avoir plusieurs maillons).
 */
function inlineGradientHrefs(root: SVGElement): void {
  const byId = new Map<string, Element>();
  for (const g of Array.from(root.querySelectorAll('linearGradient, radialGradient'))) {
    const id = g.getAttribute('id');
    if (id) byId.set(id, g);
  }
  const hrefOf = (el: Element): string | null => {
    const h = el.getAttribute('href') || el.getAttribute('xlink:href');
    return h && h.startsWith('#') ? h.slice(1) : null;
  };
  // Stops effectifs d'un gradient : les siens, sinon ceux de son parent href
  // (récursif). `seen` coupe un éventuel cycle.
  const stopsOf = (el: Element, seen: Set<Element>): Element[] => {
    const own = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'stop');
    if (own.length) return own;
    const pid = hrefOf(el);
    const parent = pid ? byId.get(pid) : null;
    if (!parent || seen.has(parent)) return [];
    seen.add(parent);
    return stopsOf(parent, seen);
  };
  for (const g of byId.values()) {
    const own = Array.from(g.children).filter((c) => c.tagName.toLowerCase() === 'stop');
    if (own.length) continue; // a déjà ses stops
    const stops = stopsOf(g, new Set([g]));
    for (const s of stops) g.appendChild(s.cloneNode(true));
    // Le lien n'est plus nécessaire : on le retire pour qu'aucun dégroupage ne
    // puisse le rompre (les stops sont maintenant locaux).
    if (stops.length) {
      g.removeAttribute('href');
      g.removeAttribute('xlink:href');
    }
  }
}

function hoistDefs(root: SVGElement, sink: string[]): void {
  const serializer = new XMLSerializer();
  for (const defs of Array.from(root.querySelectorAll('defs'))) {
    for (const child of Array.from(defs.childNodes)) {
      sink.push(serializer.serializeToString(child));
    }
    defs.remove();
  }
}

/**
 * Retire les masques et détourages (`mask` / `clip-path`) d'un dessin cloné, et
 * leurs définitions `<mask>` / `<clipPath>`.
 *
 * La carte 16 servos (PCA9685, issue de Fritzing) en porte 6 + 5. Au dégroupage,
 * Inkscape DÉLIE récursivement chaque item de son masque/détourage
 * (`DrawingItem::unlink` → `SPItem::release` en cascade) : sur cet arbre profond
 * aux coordonnées démesurées, la récursion DÉBORDE LA PILE et fait PLANTER
 * Inkscape (`_chkstk`, stacktrace de Frank). Le rendu à l'export est
 * quasi inchangé (comparé pixel à pixel : seuls quelques reflets internes de
 * composants CMS varient — silhouette, connecteurs, sérigraphie identiques),
 * car ces masques Fritzing ne servent qu'à des découpes fines internes.
 */
function stripClipAndMask(root: SVGElement): void {
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'mask' || tag === 'clippath') {
      el.remove();
      continue;
    }
    el.removeAttribute('mask');
    el.removeAttribute('clip-path');
  }
}

/**
 * FUSIONNE les `<g>` qui n'ont qu'un seul enfant lui-même `<g>`, en composant
 * leurs `transform` — un `<g transform=A><g transform=B>…` devient
 * `<g transform="A B">…`. Sans cela, un dessin Inkscape empile des groupes
 * (pico : 6 niveaux) et il faut dégrouper 5 ou 6 fois dans Inkscape pour tout
 * défaire. Chaque niveau supprimé = un dégroupage de moins.
 *
 * On ne fusionne QUE les groupes « purs » : pas d'id porteur de sens (référencé
 * ailleurs), pas d'autre attribut que `transform` (style, classe, filtre… d'un
 * groupe changent le rendu de tous ses enfants — les fusionner le casserait).
 * Le `<g id="kpart-…">` racine du composant n'est jamais touché (il porte l'id
 * de groupe et sert d'ancre). Répété jusqu'à stabilité (chaînes de longueur > 2).
 */
function collapseSingleChildGroups(root: SVGElement): void {
  const fusionnable = (g: Element): boolean => {
    if (g.tagName.toLowerCase() !== 'g') return false;
    // Un seul enfant, et c'est un <g>.
    if (g.children.length !== 1) return false;
    const child = g.children[0];
    if (child.tagName.toLowerCase() !== 'g') return false;
    // Le parent ne doit porter que transform (rien qui affecte le rendu global).
    for (const attr of Array.from(g.attributes)) {
      if (attr.name.toLowerCase() !== 'transform') return false;
    }
    return true;
  };
  let changed = true;
  while (changed) {
    changed = false;
    // Ne jamais fusionner le kpart racine (querySelectorAll ne renvoie pas la
    // racine du clone ; on protège en plus tout <g id> déjà porteur de sens).
    for (const g of Array.from(root.querySelectorAll('g'))) {
      if (!fusionnable(g)) continue;
      const child = g.children[0] as SVGElement;
      // Compose les transforms : parent d'abord (appliqué en dernier, à gauche).
      const pt = g.getAttribute('transform');
      const ct = child.getAttribute('transform');
      const combined = pt && ct ? `${pt} ${ct}` : pt || ct;
      if (combined) child.setAttribute('transform', combined);
      else child.removeAttribute('transform');
      g.replaceWith(child);
      changed = true;
    }
  }
}

/**
 * Rend uniques, dans le document exporté, les identifiants d'un dessin cloné.
 * Deux composants du même type portent les mêmes ids (dégradés, filtres,
 * masques — `alim-radialGradient115`…) : sans préfixe par composant, le
 * `url(#…)` de la seconde alim pointe sur les défs de la première. C'est ce qui
 * rendait le bouton de l'alimentation NOIR à l'export et le faisait disparaître
 * au dégroupage.
 */
function uniquifyIds(root: SVGElement, prefix: string): void {
  const map = new Map<string, string>();
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const id = el.getAttribute('id');
    if (id) {
      const next = `${prefix}-${id}`;
      map.set(id, next);
      el.setAttribute('id', next);
    }
  }
  if (!map.size) return;
  // Les guillemets sont tolérés : quand un composant a touché `element.style`
  // (rotation du bouton de l'alim en simulation), le navigateur re-sérialise les
  // références en `url("#id")`. Sans les accepter, la référence n'était PAS
  // préfixée et pointait vers un id inexistant après export → dégradé perdu.
  const remap = (v: string): string =>
    v.replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g, (m, id) => (map.has(id) ? `url(#${map.get(id)})` : m));
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (n === 'id') continue;
      if (attr.value.includes('url(')) {
        const next = remap(attr.value);
        if (next !== attr.value) el.setAttribute(attr.name, next);
        continue;
      }
      if ((n === 'href' || n.endsWith(':href')) && attr.value.startsWith('#')) {
        const id = attr.value.slice(1);
        if (map.has(id)) el.setAttribute(attr.name, `#${map.get(id)}`);
      }
    }
  }
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
  /**
   * Boîte du VIEWBOX (dessin + son vide), quand elle diffère de l'encombrement
   * réel ci-dessus. Les broches sont positionnées dans ce repère : une broche du
   * bord d'un composant tombe souvent HORS du dessin (le 7 segments a 6 px de
   * marge en haut). `pinStubs` teste l'appartenance là-dessus, sinon il croirait
   * la broche « franchement en dehors » et ne sortirait plus perpendiculairement.
   */
  outer?: { x: number; y: number; w: number; h: number };
  /**
   * Platine d'essais : ce n'est PAS un obstacle, c'est le plan de travail. Un
   * fil a le droit de la traverser de part en part (c'est même ce qu'on fait à
   * la main) ; ce qu'il doit éviter, ce sont les TROUS, et cela se règle par le
   * coût, pas en contournant la carte.
   */
  board?: boolean;
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

/** Longueur d'un segment aligné qui passe par le CŒUR d'un rectangle (rétréci de
 *  `inset` sur chaque bord) : distingue une vraie traversée de part en part d'un
 *  simple ras du bord (une broche vit au bord de son corps ; un fil qui longe le
 *  bord d'un composant voisin ne le « traverse » pas). Renvoie 0 si le rect
 *  rétréci est vide ou si le segment reste en dehors de son cœur. */
function segRectDeepCross(p: XY, q: XY, r: { x: number; y: number; w: number; h: number }, inset: number): number {
  const rr = { x: r.x + inset, y: r.y + inset, w: r.w - 2 * inset, h: r.h - 2 * inset };
  if (rr.w <= 0 || rr.h <= 0) return 0;
  return segRectOverlap(p, q, rr);
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

/**
 * Retire les points colinéaires/doublons consécutifs d'une polyligne H/V : si
 * trois points d'affilée sont alignés (à `tol` près), le point du milieu — un
 * coude inutile — disparaît. Passer `[a, ...points, b]` inclut les points de
 * connexion, donc un coude collé à une broche s'efface aussi. La construction en
 * un seul passage est déjà récursive de fait (chaque point ajouté est retesté
 * contre les deux précédents déjà simplifiés). `tol` par défaut 0.5 px (usages
 * historiques) ; l'autoroutage passe 1 px pour absorber les coords fractionnaires
 * des composants tournés (servos à 270°).
 */
function collapseColinear(pts: XY[], tol = 0.5): XY[] {
  const out: XY[] = [];
  for (const p of pts) {
    const n = out.length;
    if (n >= 1 && Math.abs(out[n - 1].x - p.x) <= tol && Math.abs(out[n - 1].y - p.y) <= tol) continue;
    if (n >= 2) {
      const a = out[n - 2];
      const b = out[n - 1];
      const colX = Math.abs(a.x - b.x) <= tol && Math.abs(b.x - p.x) <= tol;
      const colY = Math.abs(a.y - b.y) <= tol && Math.abs(b.y - p.y) <= tol;
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
 * Redresse les « escaliers » d'un tracé orthogonal : un segment COURT (≤ `maxStep`)
 * coincé entre deux segments du MÊME axe décale le fil d'un demi-pas et coûte deux
 * coudes pour rien — le petit zigouigoui collé à une broche (repro Frank :
 * `A Examiner/bug routage.png`). On réaligne les deux tronçons sur une seule ligne :
 * le segment perpendiculaire voisin s'allonge d'autant, et les deux extrémités (les
 * points de connexion) ne bougent JAMAIS — d'où deux candidats par escalier (amont
 * ramené sur l'aval, ou l'inverse), le premier interdit quand l'amont touche la
 * broche, le second quand c'est l'aval. Chaque candidat passe par `score` (survol de
 * composant, de broche étrangère, superposition d'un autre fil, longueur, coudes) et
 * n'est retenu que s'il fait BAISSER le coût : un décroché qui esquive vraiment
 * quelque chose reste en place. Plusieurs passes, car redresser une marche peut en
 * démasquer une autre.
 */
export function unstairPoly(pts: XY[], maxStep: number, score: (poly: XY[]) => number, tol = 1): XY[] {
  let cur = collapseColinear(pts, tol);
  for (let pass = 0; pass < 4; pass++) {
    let best: XY[] | null = null;
    let bestK = score(cur) - 0.01;
    for (let i = 1; i + 2 < cur.length; i++) {
      const p0 = cur[i - 1];
      const p1 = cur[i];
      const p2 = cur[i + 1];
      const p3 = cur[i + 2];
      // Deux segments du même axe séparés par une marche perpendiculaire.
      const horiz =
        Math.abs(p0.y - p1.y) <= tol && Math.abs(p2.y - p3.y) <= tol && Math.abs(p1.x - p2.x) <= tol;
      const vert =
        Math.abs(p0.x - p1.x) <= tol && Math.abs(p2.x - p3.x) <= tol && Math.abs(p1.y - p2.y) <= tol;
      if (horiz === vert) continue; // virage normal (ou tracé non orthogonal)
      const step = horiz ? Math.abs(p2.y - p1.y) : Math.abs(p2.x - p1.x);
      if (step <= tol || step > maxStep) continue; // marche nulle ou vrai détour
      const cands: XY[][] = [];
      const moved = (from: number, to: number, ref: XY): XY[] => {
        const c = cur.map((p) => ({ x: p.x, y: p.y }));
        for (let k = from; k <= to; k++) {
          if (horiz) c[k].y = ref.y;
          else c[k].x = ref.x;
        }
        return collapseColinear(c, tol);
      };
      if (i - 1 > 0) cands.push(moved(i - 1, i, p2)); // amont ramené sur l'aval
      if (i + 2 < cur.length - 1) cands.push(moved(i + 1, i + 2, p1)); // aval sur l'amont
      for (const c of cands) {
        const k = score(c);
        if (k < bestK) {
          bestK = k;
          best = c;
        }
      }
    }
    if (!best) break;
    cur = best;
  }
  return cur;
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
  // `pins` : centres des broches ÉTRANGÈRES au fil routé — un tracé ne doit
  // JAMAIS passer dessus. Contrainte DURE ici (arête refusée), là où le poids
  // ×2000 du coût d'appel ne faisait que départager des tracés déjà produits :
  // si toutes les sorties candidates passaient sur une borne, l'A\* en posait
  // une quand même.
  // `holes` : trous d'une platine d'essais recouverts par une arête. Eux ne sont
  // PAS interdits (ils se comptent par centaines : autant de voies de
  // contournement noieraient le graphe, l'A\* rendrait les armes et l'appelant
  // retomberait sur un coude en L qui, lui, les recouvre tous). Ils sont TAXÉS :
  // le tracé préfère le couloir entre deux rangées, mais coupe en travers quand
  // le détour coûterait plus cher.
  o: {
    clr: number;
    bend: number;
    gap: number;
    startDir?: number;
    endDir?: number;
    same?: Array<[XY, XY]>;
    pins?: XY[];
    holes?: (p: XY, q: XY) => number;
  },
): XY[] | null {
  const { clr, bend, gap } = o;
  const same = o.same ?? [];
  const pins = o.pins ?? [];
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
  // Voies de CONTOURNEMENT des broches étrangères : passer dessus étant
  // désormais interdit (arête refusée), il faut que le graphe contienne des
  // lignes à côté — sinon l'A\* n'a plus de chemin et l'appelant retombe sur un
  // coude en L qui, lui, ne respecte rien.
  for (const c of o.pins ?? []) {
    xsSet.add(c.x + GRID / 2);
    xsSet.add(c.x - GRID / 2);
    ysSet.add(c.y + GRID / 2);
    ysSet.add(c.y - GRID / 2);
  }
  // Couloirs ENTRE les rangées de trous (platine d'essais) : les trous étant sur
  // la grille, toutes les voies ci-dessus tombent PILE dessus dès qu'une borne y
  // est alignée. Le demi-pas donne au tracé une ligne qui passe à 5 px de chaque
  // trou — assez pour ne plus les recouvrir.
  if (o.holes) {
    for (let k = -8; k <= 8; k++) {
      for (const v of [pa.x, pb.x]) xsSet.add(v + k * GRID + GRID / 2);
      for (const v of [pa.y, pb.y]) ysSet.add(v + k * GRID + GRID / 2);
    }
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
    // Ras du corps (la broche sort de sa pastille) : taxe douce, identique pour
    // tous les chemins. Traversée du CŒUR : prohibitive — un corps devient « soft »
    // parce qu'une borne tombe dans sa CLEARANCE (composants jointifs à 10 px), pas
    // pour qu'un fil le coupe en deux (repro 7seg-uno : le fil COM.1 → GND coupait
    // une résistance voisine sur 12 px, la taxe ×20 ne pesait pas assez face au
    // détour).
    for (const r of soft) c += segRectOverlap(p, q, r) * 20 + segRectDeepCross(p, q, r, 4) * 1000;
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
  // Interdit DUR : une arête qui passe sur une broche étrangère. Les bornes du
  // fil (pa/pb) sont exclues en amont par l'appelant, donc aucune sortie de
  // broche n'est bloquée ici.
  // Une pastille fait 9 px (rayon 4,5) : un tracé qui la RECOUVRE (centre à moins
  // de ~4 px du fil) est interdit. Seuil 4 (et non 2) pour que le fil ne se pose
  // plus SUR une broche voisine, tout en laissant le passage à mi-chemin entre
  // deux broches distantes de 10 px (à 5 px de chacune, > 4, donc autorisé).
  const PIN_CLR = 4;
  const pinBlocked = (p: XY, q: XY): boolean => {
    for (const c of pins) if (pointOnSegment(c, p, q, PIN_CLR)) return true;
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
      if (pinBlocked(p, q)) continue;
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
      // Taxe des trous de platine : 3 pas de grille par trou recouvert. Assez
      // cher pour qu'un décalage d'un demi-pas (2 coudes) soit préféré à une
      // rangée entière longée, assez doux pour ne pas envoyer le fil au bout de
      // la carte.
      const holeTax = o.holes ? o.holes(p, q) * GRID * 3 : 0;
      const g =
        cur.g + len - ride * RIDE + wireCost(p, q) + crossCost(p, q) + softCost(p, q) + holeTax + turn;
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
