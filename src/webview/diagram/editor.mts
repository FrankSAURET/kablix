// Éditeur visuel : palette, placement, déplacement et câblage des composants.
// Le modèle logique vit dans model.mts ; ici on gère le DOM et les interactions.
import { CATALOG, partDef } from './catalog.mjs';
import type { Diagram, Endpoint, Part, Wire } from './model.mjs';

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

const SVG_NS = 'http://www.w3.org/2000/svg';
let idSeq = 0;
const uid = (prefix: string): string => `${prefix}${++idSeq}`;

export class Editor {
  readonly diagram: Diagram = { parts: [], wires: [] };
  onChange: (() => void) | null = null;

  private rendered = new Map<string, Rendered>();
  private wireLines = new Map<string, SVGLineElement>();
  private pending: Endpoint | null = null;
  private tempLine: SVGLineElement | null = null;

  constructor(
    private readonly canvas: HTMLDivElement,
    private readonly palette: HTMLDivElement,
    private readonly svg: SVGSVGElement
  ) {
    this.buildPalette();
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  // --- Palette ---------------------------------------------------------------
  private buildPalette(): void {
    for (const def of CATALOG) {
      const btn = document.createElement('button');
      btn.className = 'palette__item';
      btn.textContent = def.label;
      btn.addEventListener('click', () => this.addPart(def.type));
      this.palette.appendChild(btn);
    }
  }

  // --- Ajout / suppression de composants -------------------------------------
  addPart(type: string, x = 40 + this.diagram.parts.length * 30, y = 60): Part {
    const part: Part = { id: uid(type + '-'), type, x, y };
    this.diagram.parts.push(part);
    this.renderPart(part);
    this.notify();
    return part;
  }

  removePart(id: string): void {
    this.diagram.wires = this.diagram.wires.filter((w) => {
      if (w.a.partId === id || w.b.partId === id) {
        this.wireLines.get(w.id)?.remove();
        this.wireLines.delete(w.id);
        return false;
      }
      return true;
    });
    this.rendered.get(id)?.container.remove();
    this.rendered.delete(id);
    this.diagram.parts = this.diagram.parts.filter((p) => p.id !== id);
    this.redrawWires();
    this.notify();
  }

  elementOf(id: string): WokwiElement | undefined {
    return this.rendered.get(id)?.el;
  }

  /** Vide entièrement l'atelier (changement de carte, nouveau schéma). */
  clear(): void {
    for (const line of this.wireLines.values()) line.remove();
    this.wireLines.clear();
    for (const r of this.rendered.values()) r.container.remove();
    this.rendered.clear();
    this.diagram.parts = [];
    this.diagram.wires = [];
    this.notify();
  }

  /** Ajoute un fil par programme (utilisé pour le schéma de démarrage). */
  addWire(a: Endpoint, b: Endpoint): void {
    const wire: Wire = { id: uid('w-'), a, b };
    this.diagram.wires.push(wire);
    this.drawWire(wire);
    this.notify();
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
    head.addEventListener('pointerdown', (e) => this.startDrag(e, part));
    container.appendChild(head);

    const body = document.createElement('div');
    body.className = 'part__body';
    const el = document.createElement(def.tag) as WokwiElement;
    for (const [k, v] of Object.entries(def.attrs ?? {})) el.setAttribute(k, v);
    body.appendChild(el);
    container.appendChild(body);
    this.canvas.appendChild(container);

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
        this.startWire({ partId: part.id, pin: pin.name });
      });
      dot.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        this.completeWire({ partId: part.id, pin: pin.name });
      });
      body.appendChild(dot);
      hotspots.set(pin.name, dot);
    }

    this.rendered.set(part.id, { part, container, el, hotspots });
    this.redrawWires();
  }

  // --- Déplacement -----------------------------------------------------------
  private startDrag(e: PointerEvent, part: Part): void {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = part.x;
    const origY = part.y;
    const r = this.rendered.get(part.id);
    if (!r) return;

    const move = (ev: PointerEvent) => {
      part.x = Math.max(0, origX + (ev.clientX - startX));
      part.y = Math.max(0, origY + (ev.clientY - startY));
      r.container.style.left = `${part.x}px`;
      r.container.style.top = `${part.y}px`;
      this.redrawWires();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  // --- Câblage ---------------------------------------------------------------
  private startWire(endpoint: Endpoint): void {
    this.pending = endpoint;
    this.tempLine = document.createElementNS(SVG_NS, 'line');
    this.tempLine.setAttribute('class', 'wire wire--temp');
    const p = this.hotspotCenter(endpoint);
    if (p) {
      this.tempLine.setAttribute('x1', String(p.x));
      this.tempLine.setAttribute('y1', String(p.y));
      this.tempLine.setAttribute('x2', String(p.x));
      this.tempLine.setAttribute('y2', String(p.y));
    }
    this.svg.appendChild(this.tempLine);
  }

  private completeWire(endpoint: Endpoint): void {
    if (!this.pending) return;
    const from = this.pending;
    this.cancelTempWire();
    if (from.partId === endpoint.partId && from.pin === endpoint.pin) return;
    const wire: Wire = { id: uid('w-'), a: from, b: endpoint };
    this.diagram.wires.push(wire);
    this.drawWire(wire);
    this.notify();
  }

  private cancelTempWire(): void {
    this.pending = null;
    this.tempLine?.remove();
    this.tempLine = null;
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.tempLine) return;
    const p = this.canvasPoint(e.clientX, e.clientY);
    this.tempLine.setAttribute('x2', String(p.x));
    this.tempLine.setAttribute('y2', String(p.y));
  };

  private onPointerUp = (): void => {
    // Relâchement hors d'une broche : on annule le fil en cours.
    if (this.pending) this.cancelTempWire();
  };

  // --- Tracé des fils --------------------------------------------------------
  private drawWire(wire: Wire): void {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'wire');
    line.style.cursor = 'pointer';
    line.addEventListener('click', () => this.removeWire(wire.id));
    this.svg.appendChild(line);
    this.wireLines.set(wire.id, line);
    this.positionWire(wire);
  }

  private removeWire(id: string): void {
    this.diagram.wires = this.diagram.wires.filter((w) => w.id !== id);
    this.wireLines.get(id)?.remove();
    this.wireLines.delete(id);
    this.notify();
  }

  private positionWire(wire: Wire): void {
    const line = this.wireLines.get(wire.id);
    if (!line) return;
    const a = this.hotspotCenter(wire.a);
    const b = this.hotspotCenter(wire.b);
    if (!a || !b) return;
    line.setAttribute('x1', String(a.x));
    line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x));
    line.setAttribute('y2', String(b.y));
  }

  redrawWires(): void {
    for (const wire of this.diagram.wires) this.positionWire(wire);
  }

  // --- Conversion de coordonnées ---------------------------------------------
  private canvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private hotspotCenter(e: Endpoint): { x: number; y: number } | null {
    const dot = this.rendered.get(e.partId)?.hotspots.get(e.pin);
    if (!dot) return null;
    const dr = dot.getBoundingClientRect();
    return this.canvasPoint(dr.left + dr.width / 2, dr.top + dr.height / 2);
  }

  private notify(): void {
    this.onChange?.();
  }
}
