// Élément visuel maison <kablix-breadboard> : platine d'essai multi-tailles
// (mini / half / full). Expose `pinInfo` comme les composants forkés et
// une méthode `setHighlight()` pour mettre en surbrillance des trous pendant
// la pose d'un composant.

import {
  BB_STEP,
  BREADBOARD_SIZES,
  breadboardDims,
  breadboardPins,
  normalizeSize,
  type BreadboardSize,
} from '../diagram/breadboard.mjs';

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

const HOLE_FILL = '#1c1c1c';
const HIGHLIGHT_FILL = '#ffd633';

export class BreadboardElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['size'];
  }

  private root: ShadowRoot;
  private highlighted: string[] = [];

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  get size(): BreadboardSize {
    return normalizeSize(this.getAttribute('size'));
  }

  get pinInfo(): PinInfo[] {
    return breadboardPins(this.size).map((p) => ({ ...p, signals: [] }));
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  /** Met en surbrillance les trous donnés (remplace la surbrillance courante). */
  setHighlight(pins: string[]): void {
    for (const name of this.highlighted) {
      this.holeEl(name)?.setAttribute('fill', HOLE_FILL);
    }
    this.highlighted = pins;
    for (const name of pins) {
      this.holeEl(name)?.setAttribute('fill', HIGHLIGHT_FILL);
    }
  }

  private holeEl(pin: string): SVGRectElement | null {
    return this.root.querySelector(`rect[data-pin="${pin}"]`);
  }

  private render(): void {
    const size = this.size;
    const spec = BREADBOARD_SIZES[size];
    const { width, height } = breadboardDims(size);
    const pins = breadboardPins(size);

    const holes: string[] = [];
    let railMinX = Infinity;
    let railMaxX = -Infinity;
    const railYs = new Set<number>();
    for (const pin of pins) {
      holes.push(
        `<rect data-pin="${pin.name}" x="${pin.x - 2}" y="${pin.y - 2}" width="4" height="4" ` +
          `rx="0.8" fill="${HOLE_FILL}"/>`
      );
      if (/^[tb][pn]\./.test(pin.name)) {
        railMinX = Math.min(railMinX, pin.x);
        railMaxX = Math.max(railMaxX, pin.x);
        railYs.add(pin.y);
      }
    }

    // Lignes rouge/bleue le long des rails (+ au-dessus, − en dessous).
    const railLines: string[] = [];
    if (spec.rails) {
      const ys = [...railYs].sort((a, b) => a - b); // [+haut, −haut, +bas, −bas]
      const line = (y: number, color: string): string =>
        `<line x1="${railMinX - 8}" y1="${y}" x2="${railMaxX + 8}" y2="${y}" ` +
        `stroke="${color}" stroke-width="1.6"/>`;
      railLines.push(
        line(ys[0] - 6, '#d23b3b'),
        line(ys[1] + 6, '#2b6cd2'),
        line(ys[2] - 6, '#d23b3b'),
        line(ys[3] + 6, '#2b6cd2')
      );
    }

    // Numéros de colonnes (1, 5, 10, 15…) et lettres de rangées.
    const labels: string[] = [];
    const aPin = pins.find((p) => p.name === 'a1')!;
    const fPin = pins.find((p) => p.name === 'f1')!;
    for (let c = 1; c <= spec.cols; c++) {
      if (c !== 1 && c % 5 !== 0) continue;
      const x = aPin.x + (c - 1) * BB_STEP;
      labels.push(
        `<text x="${x}" y="${aPin.y - 6}" font-size="5" fill="#7a7264" ` +
          `text-anchor="middle" font-family="monospace">${c}</text>`
      );
    }
    for (const [row, y] of [
      ['a', aPin.y],
      ['e', aPin.y + 4 * BB_STEP],
      ['f', fPin.y],
      ['j', fPin.y + 4 * BB_STEP],
    ] as Array<[string, number]>) {
      labels.push(
        `<text x="${aPin.x - 9}" y="${y + 2}" font-size="5" fill="#7a7264" ` +
          `text-anchor="middle" font-family="monospace">${row}</text>`
      );
    }

    // Rigole centrale entre les rangées e et f.
    const channelY = aPin.y + 4 * BB_STEP + 3;
    const channelH = fPin.y - 3 - channelY;

    this.root.innerHTML = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="#ece7da" stroke="#c5bda9" stroke-width="1.5"/>
  <rect x="2" y="${channelY}" width="${width - 4}" height="${channelH}" fill="#ddd6c4"/>
  ${railLines.join('\n  ')}
  ${holes.join('\n  ')}
  ${labels.join('\n  ')}
</svg>`;
    // Réapplique la surbrillance éventuelle après reconstruction du SVG.
    const keep = this.highlighted;
    this.highlighted = [];
    if (keep.length > 0) this.setHighlight(keep);
  }
}

if (!customElements.get('kablix-breadboard')) {
  customElements.define('kablix-breadboard', BreadboardElement);
}
