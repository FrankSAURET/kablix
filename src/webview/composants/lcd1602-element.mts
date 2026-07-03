// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — lcd1602-element.ts.
// Balise <kablix-lcd1602> (ex <wokwi-lcd1602>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (4 variantes selon
// interface `pins` (i2c/full) × taille `lcdSize` (16x2/20x4) — seuls attrs exposés dans
// l'inspecteur, cf. catalog.mts). `pinInfo` codé en dur par variante (grille 10 px, positions
// reprises telles quelles de l'ancien pin-overrides.mts). Texte affiché nativement en
// `<text>` SVG (une ligne par rangée, police LED) superposé à la zone de caractères du
// dessin importé (repérée par son remplissage `url(#characters)`, conservé dans le dessin
// retouché) — même logique que l'ancien `reflectLcd`/`lcdCharRectOf` de drawing-feedback.mts,
// portée ici. Le rendu bitmap point-par-point d'origine (`path()`/police A00) n'était de
// toute façon jamais visible : l'ancien overlay masquait déjà l'élément Lit et affichait ce
// même texte simplifié.
import { html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin, i2c } from './pin.mjs';
import drawingLcdI2c from './externe/lcd-i2c.svg';
import drawingLcdI2c20x4 from './externe/lcd-i2c-20x4.svg';
import drawingLcdParallel from './externe/lcd.svg';
import drawingLcdParallel20x4 from './externe/lcd-parallel-20x4.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LCD_TEXT_HEIGHT = 0.82;

interface Variant {
  drawing: string;
  w: number;
  h: number;
  rows: number;
  pins: Record<string, { x: number; y: number }>;
}

const PARALLEL_PINS = (y: number): Record<string, { x: number; y: number }> => ({
  VSS: { x: 40, y }, VDD: { x: 50, y }, V0: { x: 60, y }, RS: { x: 70, y }, RW: { x: 80, y },
  E: { x: 90, y }, D0: { x: 100, y }, D1: { x: 110, y }, D2: { x: 120, y }, D3: { x: 130, y },
  D4: { x: 140, y }, D5: { x: 150, y }, D6: { x: 160, y }, D7: { x: 170, y }, A: { x: 180, y }, K: { x: 190, y },
});
const I2C_PINS: Record<string, { x: number; y: number }> = {
  GND: { x: 20, y: 50 }, VCC: { x: 20, y: 60 }, SDA: { x: 20, y: 70 }, SCL: { x: 20, y: 80 },
};

const VARIANTS: Record<string, Variant> = {
  'lcd-i2c': { drawing: drawingLcdI2c, w: 350, h: 175, rows: 2, pins: I2C_PINS },
  'lcd-i2c-20x4': { drawing: drawingLcdI2c20x4, w: 405, h: 220, rows: 4, pins: I2C_PINS },
  lcd: { drawing: drawingLcdParallel, w: 330, h: 150, rows: 2, pins: PARALLEL_PINS(140) },
  'lcd-parallel-20x4': { drawing: drawingLcdParallel20x4, w: 390, h: 200, rows: 4, pins: PARALLEL_PINS(190) },
};

function lcdCharRectOf(
  svg: SVGElement
): { x: number; y: number; w: number; h: number; el: SVGElement } | null {
  for (const r of svg.querySelectorAll('rect')) {
    const fill = `${r.getAttribute('fill') || ''} ${(r as SVGElement).style.fill || ''}`;
    if (!/url\(#characters|url\(#pattern/.test(fill)) continue;
    return {
      x: Number(r.getAttribute('x') ?? 0),
      y: Number(r.getAttribute('y') ?? 0),
      w: Number(r.getAttribute('width') ?? 0),
      h: Number(r.getAttribute('height') ?? 0),
      el: r as SVGElement,
    };
  }
  return null;
}

export class LCD1602Element extends LitElement {
  declare pins: 'full' | 'i2c';
  declare lcdSize: '16x2' | '20x4';

  static properties = {
    pins: {},
    lcdSize: {},
  };

  constructor() {
    super();
    this.pins = 'full';
    this.lcdSize = '16x2';
  }

  private get variantKey(): string {
    const parallel = this.pins === 'full';
    const big = this.lcdSize === '20x4';
    if (parallel) return big ? 'lcd-parallel-20x4' : 'lcd';
    return big ? 'lcd-i2c-20x4' : 'lcd-i2c';
  }

  private get variant(): Variant {
    return VARIANTS[this.variantKey];
  }

  get pinInfo(): ElementPin[] {
    if (this.pins === 'i2c') {
      return [
        { name: 'GND', ...this.variant.pins.GND, number: 1, signals: [{ type: 'power', signal: 'GND' }] },
        { name: 'VCC', ...this.variant.pins.VCC, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
        { name: 'SDA', ...this.variant.pins.SDA, number: 3, signals: [i2c('SDA')] },
        { name: 'SCL', ...this.variant.pins.SCL, number: 4, signals: [i2c('SCL')] },
      ];
    }
    const v = this.variant.pins;
    const empty: ElementPin[] = [
      { name: 'VSS', ...v.VSS, number: 1, signals: [{ type: 'power', signal: 'GND' }] },
      { name: 'VDD', ...v.VDD, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
      { name: 'V0', ...v.V0, number: 3, signals: [] },
      { name: 'RS', ...v.RS, number: 4, signals: [] },
      { name: 'RW', ...v.RW, number: 5, signals: [] },
      { name: 'E', ...v.E, number: 6, signals: [] },
      { name: 'D0', ...v.D0, number: 7, signals: [] },
      { name: 'D1', ...v.D1, number: 8, signals: [] },
      { name: 'D2', ...v.D2, number: 9, signals: [] },
      { name: 'D3', ...v.D3, number: 10, signals: [] },
      { name: 'D4', ...v.D4, number: 11, signals: [] },
      { name: 'D5', ...v.D5, number: 12, signals: [] },
      { name: 'D6', ...v.D6, number: 13, signals: [] },
      { name: 'D7', ...v.D7, number: 14, signals: [] },
      { name: 'A', ...v.A, number: 15, signals: [] },
      { name: 'K', ...v.K, number: 16, signals: [] },
    ];
    return empty;
  }

  private lines: string[] = [];

  get text(): string {
    return this.lines.join('\n');
  }

  set text(value: string) {
    this.lines = value.split('\n');
    this.renderText();
  }

  update(changed: PropertyValues): void {
    if (changed.has('pins') || changed.has('lcdSize')) {
      this.dispatchEvent(new CustomEvent('pininfo-change'));
    }
    super.update(changed);
  }

  private zone: { x: number; y: number; w: number; h: number; el: SVGElement } | null = null;
  private overlay: SVGGElement | null = null;

  updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('pins') || changed.has('lcdSize')) {
      this.zone = null;
      this.overlay = null;
    }
    this.renderText();
  }

  private renderText(): void {
    if (!this.zone) {
      const svg = this.renderRoot.querySelector('svg');
      if (!svg) return;
      this.zone = lcdCharRectOf(svg);
      if (this.zone) this.zone.el.style.opacity = '0';
    }
    const zone = this.zone;
    if (!zone || zone.w <= 0 || zone.h <= 0) return;
    if (!this.overlay) {
      const group = document.createElementNS(SVG_NS, 'g') as SVGGElement;
      group.setAttribute('class', 'lcd-overlay');
      (zone.el.parentNode ?? zone.el).appendChild(group);
      this.overlay = group;
    }
    const group = this.overlay;
    const rows = this.variant.rows;
    const rowH = zone.h / rows;
    const fs = rowH * LCD_TEXT_HEIGHT;
    const lines = this.lines;
    while (group.childElementCount > lines.length) group.lastElementChild?.remove();
    while (group.childElementCount < lines.length) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('text-anchor', 'start');
      t.setAttribute('dominant-baseline', 'central');
      t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      t.setAttribute('fill', '#0b1405');
      t.style.fontFamily = "'LED Board-7', monospace";
      t.style.whiteSpace = 'pre';
      group.appendChild(t);
    }
    for (let i = 0; i < lines.length; i++) {
      const t = group.children[i] as SVGTextElement;
      t.setAttribute('x', String(zone.x));
      t.setAttribute('y', String(zone.y + (i + 0.5) * rowH));
      t.setAttribute('textLength', String(zone.w));
      t.setAttribute('font-size', String(fs));
      t.textContent = lines[i];
    }
  }

  render() {
    const { drawing, w, h } = this.variant;
    return html`
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="${SVG_NS}">${unsafeSVG(drawing)}</svg>
    `;
  }
}

if (!customElements.get('kablix-lcd1602')) {
  customElements.define('kablix-lcd1602', LCD1602Element);
}
