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
  listCustomParts,
  partDef,
  registerCustomPart,
  unregisterCustomPart,
  type CustomPartData,
  type PropDef,
} from './catalog.mjs';
import type { Diagram, Endpoint, Part, Wire } from './model.mjs';
import { DUPONT_COLORS, dupontHex, roundedWirePath, snapPoint, type XY } from './geometry.mjs';
import { PartCreator } from './creator.mjs';
import '../elements/custom-part.mjs';

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

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 4;
let idSeq = 0;
const uid = (prefix: string): string => `${prefix}${++idSeq}`;

export class Editor {
  readonly diagram: Diagram = { parts: [], wires: [] };
  onChange: (() => void) | null = null;

  /** Appelé quand la liste des composants personnalisés change (persistance). */
  onCustomPartsChange: ((parts: CustomPartData[]) => void) | null = null;

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

  constructor(
    private readonly canvas: HTMLDivElement,
    private readonly palette: HTMLDivElement,
    private readonly svg: SVGSVGElement,
    private readonly inspector: HTMLDivElement
  ) {
    this.buildPalette();
    this.renderInspector();
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);
    // Clic sur le fond : pose un point de fil, ou désélectionne.
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.target !== this.canvas && e.target !== this.svg) return;
      if (this.pending) {
        this.addPendingPoint(this.canvasPoint(e.clientX, e.clientY));
      } else {
        this.select(null);
      }
    });
  }

  // --- Palette ---------------------------------------------------------------
  private buildPalette(): void {
    this.palette.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Composants';
    this.palette.appendChild(title);

    for (const def of CATALOG) {
      const btn = document.createElement('button');
      btn.className = 'palette__item';
      btn.textContent = def.label;
      btn.addEventListener('click', () => this.addPart(def.type));
      this.palette.appendChild(btn);
    }

    // Composants personnalisés : bouton d'ajout + suppression du modèle (✕).
    for (const def of listCustomParts()) {
      const row = document.createElement('div');
      row.className = 'palette__custom';
      const btn = document.createElement('button');
      btn.className = 'palette__item';
      btn.textContent = `★ ${def.label}`;
      btn.addEventListener('click', () => this.addPart(def.type));
      const del = document.createElement('button');
      del.className = 'palette__custom-del';
      del.textContent = '✕';
      del.title = 'Supprimer ce modèle de composant';
      del.addEventListener('click', () => this.removeCustomPart(def.type));
      row.append(btn, del);
      this.palette.appendChild(row);
    }

    const create = document.createElement('button');
    create.className = 'palette__item palette__item--create';
    create.textContent = '+ Créer un composant';
    create.addEventListener('click', () => this.creator.open());
    this.palette.appendChild(create);
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
    const color = opts?.color ?? this.nextColor();
    const wire: Wire = { id: uid('w-'), a, b, points: opts?.points, color };
    this.diagram.wires.push(wire);
    this.drawWire(wire);
    this.notify();
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
    container.style.left = `${part.x}px`;
    container.style.top = `${part.y}px`;

    const head = document.createElement('div');
    head.className = 'part__head';
    head.textContent = def.label;
    const del = document.createElement('span');
    del.className = 'part__del';
    del.textContent = '✕';
    del.title = 'Supprimer';
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
    this.canvas.appendChild(container);
    this.applyRotation(part, body);

    // Déplacement : par tout le corps, sauf pour les composants interactifs
    // (bouton, potentiomètre) qu'on déplace par leur bandeau uniquement.
    head.addEventListener('pointerdown', (e) => this.startDrag(e, part));
    if (!def.interactive) {
      body.addEventListener('pointerdown', (e) => this.startDrag(e, part));
    } else {
      body.addEventListener('pointerdown', () => this.select({ kind: 'part', id: part.id }));
    }

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

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      part.x = Math.max(0, origX + dx);
      part.y = Math.max(0, origY + dy);
      r.container.style.left = `${part.x}px`;
      r.container.style.top = `${part.y}px`;
      this.redrawWires();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      if (!moved) this.select({ kind: 'part', id: part.id }); // simple clic = sélection
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
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
      color: this.nextColor(),
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
      handle.title = 'Glisser pour déplacer — Ctrl : alignement H/V';
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.dragHandle(wire, index, handle);
      });
      this.canvas.appendChild(handle);
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
    // L'angle (résistance) déplace les broches : re-rendu complet nécessaire.
    if (attr === 'angle' || attr === 'flip') {
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
    title.textContent = 'Propriétés';
    this.inspector.appendChild(title);

    if (!this.selection) {
      const hint = document.createElement('p');
      hint.className = 'inspector__hint';
      hint.textContent =
        'Cliquez un composant ou un fil pour le modifier. ' +
        'Câblage : cliquez une broche, posez des coudes en cliquant le fond, terminez sur une broche (Échap : annuler).';
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
    subtitle.textContent = `Fil ${wire.a.pin} → ${wire.b.pin}`;
    this.inspector.appendChild(subtitle);

    const label = document.createElement('label');
    label.className = 'inspector__label';
    label.textContent = 'Couleur (nappe Dupont)';
    this.inspector.appendChild(label);

    const swatches = document.createElement('div');
    swatches.className = 'inspector__swatches';
    for (const color of DUPONT_COLORS) {
      const sw = document.createElement('button');
      sw.className = 'inspector__swatch' + (wire.color === color.id ? ' inspector__swatch--active' : '');
      sw.style.background = color.hex;
      sw.title = color.label;
      sw.addEventListener('click', () => {
        this.setWireColor(wireId, color.id);
        this.renderInspector();
      });
      swatches.appendChild(sw);
    }
    this.inspector.appendChild(swatches);

    this.appendDeleteButton('Supprimer le fil', () => this.removeWire(wireId));
  }

  private renderPartInspector(partId: string): void {
    const r = this.rendered.get(partId);
    if (!r) return;
    const def = partDef(r.part.type);

    const subtitle = document.createElement('p');
    subtitle.className = 'inspector__subtitle';
    subtitle.textContent = def.label;
    this.inspector.appendChild(subtitle);

    for (const prop of def.props ?? []) {
      this.appendPropControl(partId, r.part, prop);
    }
    if ((def.props ?? []).length === 0) {
      const hint = document.createElement('p');
      hint.className = 'inspector__hint';
      hint.textContent = 'Aucune propriété modifiable pour ce composant.';
      this.inspector.appendChild(hint);
    }

    this.appendDeleteButton('Supprimer le composant', () => this.removePart(partId));
  }

  private appendPropControl(partId: string, part: Part, prop: PropDef): void {
    const label = document.createElement('label');
    label.className = 'inspector__label';
    label.textContent = prop.label;
    this.inspector.appendChild(label);

    const current = part.attrs?.[prop.attr] ?? '';
    if (prop.kind === 'select') {
      const select = document.createElement('select');
      select.className = 'inspector__control';
      for (const opt of prop.options ?? []) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt === '' ? 'non' : opt;
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
  private canvasPoint(clientX: number, clientY: number): XY {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
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
   * Sérialise le schéma en SVG autonome : dessin de chaque composant (extrait
   * de son shadow DOM), rotations appliquées, puis les fils colorés par-dessus.
   */
  exportSvg(): string {
    const serializer = new XMLSerializer();
    const parts: string[] = [];
    let maxX = 400;
    let maxY = 300;

    for (const r of this.rendered.values()) {
      const root = r.el.shadowRoot ?? r.el;
      const svgEl = root.querySelector('svg');
      if (!svgEl) continue;
      const body = r.container.querySelector('.part__body') as HTMLElement | null;
      const x = r.part.x;
      const y = r.part.y + (body?.offsetTop ?? 0);
      const w = r.el.offsetWidth || svgEl.width.baseVal.value || 80;
      const h = r.el.offsetHeight || svgEl.height.baseVal.value || 60;
      maxX = Math.max(maxX, x + w + 60);
      maxY = Math.max(maxY, y + h + 60);

      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('x', String(x));
      clone.setAttribute('y', String(y));
      const inner = serializer.serializeToString(clone);
      const deg = r.part.rotation ?? 0;
      parts.push(
        deg
          ? `<g transform="rotate(${deg} ${x + w / 2} ${y + h / 2})">${inner}</g>`
          : inner
      );
    }

    const wires: string[] = [];
    for (const wire of this.diagram.wires) {
      const a = this.hotspotCenter(wire.a);
      const b = this.hotspotCenter(wire.b);
      if (!a || !b) continue;
      const d = roundedWirePath([a, ...(wire.points ?? []), b]);
      wires.push(
        `<path d="${d}" fill="none" stroke="${dupontHex(wire.color ?? 'green')}" ` +
          `stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
      );
      for (const p of wire.points ?? []) {
        maxX = Math.max(maxX, p.x + 40);
        maxY = Math.max(maxY, p.y + 40);
      }
    }

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(maxX)}" height="${Math.ceil(maxY)}" ` +
        `viewBox="0 0 ${Math.ceil(maxX)} ${Math.ceil(maxY)}">`,
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
