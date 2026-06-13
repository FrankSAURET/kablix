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
import type { Diagram, Endpoint, Part, Wire } from './model.mjs';
import { DUPONT_COLORS, dupontHex, roundedWirePath, snapPoint, type XY } from './geometry.mjs';
import { PartCreator } from './creator.mjs';
import '../elements/custom-part.mjs';
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
}

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
const MAX_RECENTS = 10;
/** Type MIME du glisser-déposer palette → canvas (pose d'un composant). */
const DND_MIME = 'application/x-kablix-part';
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;
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

  private paletteSort: PaletteSort = 'category';
  private recentTypes: string[] = [];
  private rendered = new Map<string, Rendered>();
  private wirePaths = new Map<string, SVGPathElement>();
  private pending: PendingWire | null = null;
  private tempPath: SVGPathElement | null = null;
  private selection: Selection = null;
  private colorIndex = 0;
  private customData = new Map<string, CustomPartData>();
  private creator = new PartCreator((data) => this.saveCustomPart(data));
  private handles: HTMLDivElement[] = [];
  private guides: SVGLineElement[] = [];
  /** Platines dont des trous sont actuellement en surbrillance. */
  private highlightedBoards = new Set<string>();

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
      if (this.pending) {
        this.addPendingPoint(this.canvasPoint(e.clientX, e.clientY));
      } else {
        this.select(null);
      }
    });
    // Zoom à la molette, centré sur le curseur.
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // Dépôt d'un composant glissé depuis la palette, là où on le lâche.
    this.canvas.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes(DND_MIME)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    this.canvas.addEventListener('drop', (e) => {
      const type = e.dataTransfer?.getData(DND_MIME);
      if (!type) return;
      e.preventDefault();
      const p = this.canvasPoint(e.clientX, e.clientY);
      this.addPart(type, Math.max(0, Math.round(p.x)), Math.max(0, Math.round(p.y)));
    });
  }

  // --- Zoom / déplacement de la vue -------------------------------------------
  private applyTransform(): void {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    // La grille de fond suit le zoom et la translation pour rester cohérente.
    const step = 20 * this.zoom;
    this.canvas.style.backgroundSize = `${step}px ${step}px`;
    this.canvas.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
    if (this.zoomBadge) this.zoomBadge.textContent = `⟳ ${Math.round(this.zoom * 100)} %`;
  }

  private onWheel = (e: WheelEvent): void => {
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
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
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
    this.buildPalette();
  }

  private notifyPaletteState(): void {
    this.onPaletteStateChange?.({ sort: this.paletteSort, recents: [...this.recentTypes] });
  }

  /** Mémorise un type comme « dernier utilisé » (10 max, plus récent en tête). */
  private recordRecent(type: string): void {
    const next = [type, ...this.recentTypes.filter((x) => x !== type)].slice(0, MAX_RECENTS);
    if (next.join('|') === this.recentTypes.join('|')) return;
    this.recentTypes = next;
    this.buildPalette();
    this.notifyPaletteState();
  }

  private paletteSection(label: string): void {
    const head = document.createElement('h4');
    head.className = 'palette__section';
    head.textContent = label;
    this.palette.appendChild(head);
  }

  /** Bouton simple de la palette : clic = pose au centre ; glisser = pose au lâcher. */
  private paletteButton(def: PartDef, custom: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'palette__item';
    btn.textContent = custom ? `★ ${def.label}` : t(def.label);
    btn.addEventListener('click', () => this.addPart(def.type));
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(DND_MIME, def.type);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    return btn;
  }

  /** Ligne d'un composant personnalisé : pose, édition, export, suppression. */
  private appendCustomRow(def: PartDef): void {
    const data = this.customData.get(def.type);
    const row = document.createElement('div');
    row.className = 'palette__custom';
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
    const head = document.createElement('div');
    head.className = 'palette__title';
    const title = document.createElement('h3');
    title.textContent = t('Components');
    const sortWrap = document.createElement('div');
    sortWrap.className = 'palette__sort';
    for (const [mode, glyph, label] of [
      ['alpha', 'AZ', t('Alphabetical')],
      ['category', '🗂', t('By category')],
    ] as Array<[PaletteSort, string, string]>) {
      const btn = document.createElement('button');
      btn.className = 'palette__sort-btn' + (this.paletteSort === mode ? ' palette__sort-btn--active' : '');
      btn.textContent = glyph;
      btn.title = label;
      btn.addEventListener('click', () => {
        if (this.paletteSort === mode) return;
        this.paletteSort = mode;
        this.buildPalette();
        this.notifyPaletteState();
      });
      sortWrap.appendChild(btn);
    }
    head.append(title, sortWrap);
    this.palette.appendChild(head);

    const customs = listCustomParts();
    const byLabel = (a: PartDef, b: PartDef): number =>
      t(a.label).localeCompare(t(b.label), undefined, { sensitivity: 'base' });

    // Derniers utilisés (10 max), toujours en tête.
    const recentDefs = this.recentTypes
      .map((type) => CATALOG.find((d) => d.type === type) ?? customs.find((d) => d.type === type))
      .filter((d): d is PartDef => d !== undefined);
    if (recentDefs.length > 0) {
      this.paletteSection(t('Recently used'));
      for (const def of recentDefs) this.palette.appendChild(this.paletteButton(def, !!def.custom));
    }

    if (this.paletteSort === 'alpha') {
      // Liste plate, tous composants confondus, triée sur le libellé traduit.
      for (const def of [...CATALOG, ...customs].sort(byLabel)) {
        if (def.custom) this.appendCustomRow(def);
        else this.palette.appendChild(this.paletteButton(def, false));
      }
    } else {
      for (const category of CATEGORY_ORDER) {
        const defs = CATALOG.filter((d) => partCategory(d) === category).sort(byLabel);
        if (defs.length === 0) continue;
        this.paletteSection(t(category));
        for (const def of defs) this.palette.appendChild(this.paletteButton(def, false));
      }
      if (customs.length > 0) {
        this.paletteSection(t('Custom parts'));
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
  addPart(type: string, x = 40 + this.diagram.parts.length * 30, y = 60): Part {
    const def = partDef(type);
    const part: Part = { id: uid(type + '-'), type, x, y, attrs: { ...def.attrs } };
    this.diagram.parts.push(part);
    this.renderPart(part);
    this.recordRecent(type);
    this.notify();
    return part;
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
    this.diagram.parts = this.diagram.parts.filter((p) => p.id !== id);
    if (this.selection?.kind === 'part' && this.selection.id === id) this.select(null);
    this.redrawWires();
    this.notify();
  }

  elementOf(id: string): WokwiElement | undefined {
    return this.rendered.get(id)?.el;
  }

  /** Vide entièrement l'atelier (changement de carte, nouveau schéma). */
  clear(): void {
    this.cancelPending();
    this.select(null);
    for (const path of this.wirePaths.values()) path.remove();
    this.wirePaths.clear();
    for (const r of this.rendered.values()) r.container.remove();
    this.rendered.clear();
    this.diagram.parts = [];
    this.diagram.wires = [];
    this.colorIndex = 0;
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
      return part ? pinElectricalRole(part.type, e.pin) : 'other';
    });
    if (roles.includes('gnd')) return 'black';
    if (roles.includes('vcc')) return 'red';
    return this.nextColor();
  }

  private nextColor(): string {
    const color = DUPONT_COLORS[this.colorIndex % DUPONT_COLORS.length].id;
    this.colorIndex++;
    return color;
  }

  // --- Rendu d'un composant --------------------------------------------------
  private renderPart(part: Part): void {
    const def = partDef(part.type);
    const container = document.createElement('div');
    container.className = 'part';
    // Les cartes et platines passent sous les fils ; le reste au-dessus.
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
    const del = document.createElement('span');
    del.className = 'part__del';
    del.textContent = '✕';
    del.title = t('Delete');
    del.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.removePart(part.id);
    });
    head.appendChild(del);
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
    head.addEventListener('pointerdown', (e) => this.startDrag(e, part));
    body.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        e.stopPropagation();
        this.startDrag(e, part);
      } else if (!def.interactive) {
        this.startDrag(e, part);
      } else {
        this.select({ kind: 'part', id: part.id });
      }
    });
    if (def.interactive) body.title = t('Right-click drag to move');

    const hotspots = new Map<string, HTMLDivElement>();
    const pins = (el.pinInfo ?? []) as WokwiPin[];
    for (const pin of pins) {
      const dot = document.createElement('div');
      dot.className = 'pin';
      dot.style.left = `${pin.x}px`;
      dot.style.top = `${pin.y}px`;
      dot.title = pin.name;
      dot.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.onPinDown({ partId: part.id, pin: pin.name }, e);
      });
      dot.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        this.onPinUp({ partId: part.id, pin: pin.name }, e);
      });
      body.appendChild(dot);
      hotspots.set(pin.name, dot);
    }

    this.rendered.set(part.id, { part, container, el, hotspots });
    this.redrawWires();
  }

  /** Re-rend un composant après un changement d'attribut (angle, couleur…). */
  private rerenderPart(id: string): void {
    const r = this.rendered.get(id);
    if (!r) return;
    r.container.remove();
    this.rendered.delete(id);
    this.renderPart(r.part);
  }

  // --- Rotation ----------------------------------------------------------------
  private applyRotation(part: Part, body: HTMLDivElement): void {
    const deg = part.rotation ?? 0;
    body.style.transformOrigin = 'center center';
    body.style.transform = deg ? `rotate(${deg}deg)` : '';
    const head = body.parentElement?.querySelector('.part__head') as HTMLDivElement | null;
    if (head) this.positionHead(part, head, body);
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

  /** Tourne le composant sélectionné de ±45° (touches + / -). */
  rotateSelection(deltaDeg: number): void {
    if (this.selection?.kind !== 'part') return;
    const r = this.rendered.get(this.selection.id);
    if (!r) return;
    r.part.rotation = (((r.part.rotation ?? 0) + deltaDeg) % 360 + 360) % 360;
    const body = r.container.querySelector('.part__body') as HTMLDivElement | null;
    if (body) this.applyRotation(r.part, body);
    // Les pastilles tournent avec le corps : leurs positions à l'écran changent.
    this.redrawWires();
    this.notify();
  }

  // --- Déplacement -----------------------------------------------------------
  private startDrag(e: PointerEvent, part: Part): void {
    if (this.pending) return; // câblage en cours : pas de déplacement
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = part.x;
    const origY = part.y;
    const r = this.rendered.get(part.id);
    if (!r) return;
    let moved = false;
    // Trous des platines d'essai du canvas (figés au début du geste) pour la
    // surbrillance des bandes survolées et l'enfichage au relâchement.
    const kind = partDef(part.type).kind;
    const pluggable = kind !== 'mcu' && kind !== 'breadboard';
    const holes = pluggable ? this.collectBreadboardHoles(part.id) : [];

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      // Le déplacement écran est converti en déplacement monde (zoom courant).
      part.x = Math.max(0, origX + dx / this.zoom);
      part.y = Math.max(0, origY + dy / this.zoom);
      r.container.style.left = `${part.x}px`;
      r.container.style.top = `${part.y}px`;
      this.redrawWires();
      if (holes.length > 0) this.previewBreadboardSnap(part, holes);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      this.clearBreadboardHighlights();
      if (!moved) this.select({ kind: 'part', id: part.id }); // simple clic = sélection
      else if (pluggable) this.plugIntoBreadboard(part, holes);
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
    if (e.key === 'Escape') {
      this.cancelPending();
      this.select(null);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
      if (this.selection?.kind === 'part') this.removePart(this.selection.id);
      else if (this.selection?.kind === 'wire') this.removeWire(this.selection.id);
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
    this.clearGuides();
  }

  private clearGuides(): void {
    for (const g of this.guides) g.remove();
    this.guides = [];
  }

  /** Affiche une poignée de saisie sur chaque coude du fil sélectionné. */
  private buildHandles(wireId: string): void {
    this.clearHandles();
    const wire = this.diagram.wires.find((w) => w.id === wireId);
    if (!wire?.points) return;
    wire.points.forEach((pt, index) => {
      const handle = document.createElement('div');
      handle.className = 'wire-handle';
      handle.style.left = `${pt.x}px`;
      handle.style.top = `${pt.y}px`;
      handle.title = t('Drag to move — Ctrl: H/V alignment');
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.dragHandle(wire, index, handle);
      });
      this.world.appendChild(handle);
      this.handles.push(handle);
    });
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

  // --- Sélection + éditeur de composants --------------------------------------
  private select(sel: Selection): void {
    // Retire la mise en évidence précédente.
    if (this.selection?.kind === 'part') {
      this.rendered.get(this.selection.id)?.container.classList.remove('part--selected');
    } else if (this.selection?.kind === 'wire') {
      this.wirePaths.get(this.selection.id)?.classList.remove('wire--selected');
    }
    this.selection = sel;
    this.clearHandles();
    if (sel?.kind === 'part') {
      this.rendered.get(sel.id)?.container.classList.add('part--selected');
    } else if (sel?.kind === 'wire') {
      this.wirePaths.get(sel.id)?.classList.add('wire--selected');
      this.buildHandles(sel.id);
    }
    this.renderInspector();
  }

  /** Change un attribut d'un composant (depuis l'inspecteur). */
  updatePartAttr(partId: string, attr: string, value: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    r.part.attrs = { ...r.part.attrs, [attr]: value };
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
    // L'angle ou la taille déplacent les broches : re-rendu complet nécessaire.
    if (attr === 'angle' || attr === 'flip' || attr === 'size') {
      this.rerenderPart(partId);
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
  }

  private renderPartInspector(partId: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    const def = partDef(r.part.type);

    const subtitle = document.createElement('p');
    subtitle.className = 'inspector__subtitle';
    subtitle.textContent = t(def.label);
    this.inspector.appendChild(subtitle);

    for (const prop of def.props ?? []) {
      this.appendPropControl(partId, r.part, prop);
    }
    if ((def.props ?? []).length === 0) {
      const hint = document.createElement('p');
      hint.className = 'inspector__hint';
      hint.textContent = t('No editable property for this part.');
      this.inspector.appendChild(hint);
    }

    this.appendDeleteButton(t('Delete the part'), () => this.removePart(partId));
    // Zone d'aide contextuelle, sous les propriétés du composant sélectionné.
    this.appendHelp(t('+ or − to rotate the part'));
  }

  /** Encart d'aide affiché sous l'inspecteur (raccourcis contextuels). */
  private appendHelp(text: string): void {
    const help = document.createElement('p');
    help.className = 'inspector__help';
    help.textContent = `💡 ${text}`;
    this.inspector.appendChild(help);
  }

  private appendPropControl(partId: string, part: Part, prop: PropDef): void {
    const label = document.createElement('label');
    label.className = 'inspector__label';
    label.textContent = t(prop.label);
    this.inspector.appendChild(label);

    const current = part.attrs?.[prop.attr] ?? '';
    if (prop.kind === 'select') {
      const select = document.createElement('select');
      select.className = 'inspector__control';
      for (const opt of prop.options ?? []) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt === '' ? t('no') : opt;
        if (opt === current) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => this.updatePartAttr(partId, prop.attr, select.value));
      this.inspector.appendChild(select);
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
    const serializer = new XMLSerializer();
    const parts: string[] = [];
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

    for (const r of this.rendered.values()) {
      const root = r.el.shadowRoot ?? r.el;
      const svgEl = root.querySelector('svg');
      const x = r.part.x;
      const y = r.part.y;
      const w = r.el.offsetWidth || svgEl?.width.baseVal.value || 80;
      const h = r.el.offsetHeight || svgEl?.height.baseVal.value || 60;
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
        // Sans viewBox, redimensionner déformerait le dessin : on en pose une
        // d'après la taille intrinsèque avant de forcer la taille d'affichage.
        if (!clone.getAttribute('viewBox')) {
          const vbW = svgEl.viewBox?.baseVal?.width || svgEl.width.baseVal.value || w;
          const vbH = svgEl.viewBox?.baseVal?.height || svgEl.height.baseVal.value || h;
          clone.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
        }
        clone.setAttribute('x', String(x));
        clone.setAttribute('y', String(y));
        clone.setAttribute('width', String(w));
        clone.setAttribute('height', String(h));
        inner = serializer.serializeToString(clone);
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

/** Distance d'un point à un segment [a,b]. */
function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
