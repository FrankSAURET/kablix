// Élément personnalisé « microsim-pico-board » : représentation SVG du
// Raspberry Pi Pico avec 40 broches, LED intégrée GP25 et connecteur USB.
// Fonctionnement identique aux éléments @wokwi/elements : propriété pinInfo
// accessible immédiatement, sans Lit ni shadow DOM.

const PIN_PITCH = 12;
const PIN_START = 20;   // x du premier pad
const TOP_Y = 6;        // centre y des pads du haut
const BOTTOM_Y = 74;    // centre y des pads du bas
const W = 264;
const H = 80;

const TOP_NAMES = [
  'GP0', 'GP1', 'GND.1', 'GP2', 'GP3', 'GND.2',
  'GP4', 'GP5', 'GND.3', 'GP6', 'GP7', 'GND.4',
  'GP8', 'GP9', 'GND.5', 'GP10', 'GP11', 'GND.6',
  'GP12', 'GP13',
];

// Bottom row pin 40 → pin 21 (left → right)
const BOTTOM_NAMES = [
  'VBUS', 'VSYS', 'GND.7', '3V3_EN', '3V3', 'ADC_VREF',
  'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND.8',
  'GP21', 'GP20', 'GP19', 'GP18', 'GND.9', 'GP17', 'GP16',
];

function padColor(name: string): string {
  if (name.startsWith('GND') || name === 'AGND') return '#888';
  if (name === 'VBUS' || name === 'VSYS' || name === '3V3' || name === '3V3_EN' || name === 'ADC_VREF') return '#c84400';
  return '#c8a000';
}

export const PICO_PIN_INFO: readonly { name: string; x: number; y: number }[] = [
  ...TOP_NAMES.map((name, i) => ({ name, x: PIN_START + i * PIN_PITCH, y: TOP_Y })),
  ...BOTTOM_NAMES.map((name, i) => ({ name, x: PIN_START + i * PIN_PITCH, y: BOTTOM_Y })),
];

function buildSVG(gp25: boolean): string {
  const topPads = TOP_NAMES.map((name, i) => {
    const cx = PIN_START + i * PIN_PITCH;
    return `<rect x="${cx - 3}" y="1" width="6" height="11" fill="${padColor(name)}" rx="1"/>`;
  }).join('');

  const bottomPads = BOTTOM_NAMES.map((name, i) => {
    const cx = PIN_START + i * PIN_PITCH;
    return `<rect x="${cx - 3}" y="${H - 12}" width="6" height="11" fill="${padColor(name)}" rx="1"/>`;
  }).join('');

  const ledFill = gp25 ? '#22ee22' : '#0a2a0a';
  const ledGlow = gp25
    ? `<circle cx="66" cy="40" r="7" fill="#22ee22" opacity="0.25"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${topPads}
  ${bottomPads}
  <rect x="8" y="10" width="${W - 8}" height="60" fill="#145214" rx="3"/>
  <rect x="0" y="22" width="14" height="26" fill="#555" rx="2"/>
  <rect x="2" y="24" width="10" height="22" fill="#2a2a2a" rx="1"/>
  <rect x="88" y="15" width="78" height="50" fill="#191919" rx="3"/>
  <text x="127" y="44" font-size="7.5" fill="#666" text-anchor="middle" font-family="monospace">RP2040</text>
  <rect x="200" y="22" width="17" height="13" fill="#2a2a2a" rx="3"/>
  <text x="208" y="31" font-size="5" fill="#999" text-anchor="middle" font-family="sans-serif">BOOT</text>
  ${ledGlow}
  <circle cx="66" cy="40" r="3.5" fill="${ledFill}"/>
  <text x="66" y="57" font-size="4" fill="#3a8a3a" text-anchor="middle" font-family="sans-serif">LED</text>
  <text x="127" y="68" font-size="5" fill="#3a7a3a" text-anchor="middle" font-family="sans-serif">Raspberry Pi Pico</text>
</svg>`;
}

export class MicroSimPicoBoard extends HTMLElement {
  readonly pinInfo = PICO_PIN_INFO;

  private _gp25 = false;

  get gp25(): boolean {
    return this._gp25;
  }
  set gp25(v: boolean) {
    if (this._gp25 === v) return;
    this._gp25 = v;
    if (this.isConnected) this._paint();
  }

  connectedCallback(): void {
    this.style.display = 'inline-block';
    this._paint();
  }

  private _paint(): void {
    this.innerHTML = buildSVG(this._gp25);
  }
}

customElements.define('microsim-pico-board', MicroSimPicoBoard);
