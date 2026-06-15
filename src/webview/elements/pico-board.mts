// Élément visuel maison <kablix-pico-board> : Raspberry Pi Pico avec ses
// 40 broches colorées (GP = or, GND = gris, alimentation = rouge), la LED
// embarquée GP25 (pilotable via la propriété `ledPower`), le connecteur USB et
// le chip RP2040. Compatible avec l'éditeur : expose `pinInfo` comme les
// éléments @wokwi/elements.

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

// Rangée du haut (broches physiques 1 → 20, USB à gauche).
const TOP_ROW = [
  'GP0', 'GP1', 'GND.1', 'GP2', 'GP3', 'GP4', 'GP5', 'GND.2', 'GP6', 'GP7',
  'GP8', 'GP9', 'GND.3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND.4', 'GP14', 'GP15',
];
// Rangée du bas (broches physiques 40 → 21, USB à gauche).
const BOTTOM_ROW = [
  'VBUS', 'VSYS', 'GND.5', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'GND.6', 'GP27', 'GP26',
  'RUN', 'GP22', 'GND.7', 'GP21', 'GP20', 'GP19', 'GP18', 'GND.8', 'GP17', 'GP16',
];

// Géométrie alignée sur la grille de 10 px (= pas des broches 0,1" et des trous
// de platine) : toutes les broches tombent sur la grille.
const PIN_START_X = 40;
const PIN_STEP = 10;
const TOP_Y = 10;
const BOTTOM_Y = 80;
const LED_PAD = { name: 'GP25', x: 60, y: 50 };

function pinColor(name: string): string {
  if (name.startsWith('GND')) return '#5a5a5a';
  if (name === 'VBUS' || name === 'VSYS' || name === '3V3') return '#d23b3b';
  if (name.startsWith('GP')) return '#e6b830';
  return '#b7c4c9'; // RUN, ADC_VREF, 3V3_EN…
}

export class PicoBoardElement extends HTMLElement {
  readonly pinInfo: PinInfo[] = [
    ...TOP_ROW.map((name, i) => ({ name, x: PIN_START_X + i * PIN_STEP, y: TOP_Y, signals: [] })),
    ...BOTTOM_ROW.map((name, i) => ({ name, x: PIN_START_X + i * PIN_STEP, y: BOTTOM_Y, signals: [] })),
    { ...LED_PAD, signals: [] },
  ];

  private ledEl: SVGRectElement | null = null;
  private ledValue = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = this.buildSvg();
    this.ledEl = shadow.querySelector('#led-gp25');
  }

  /** Allume/éteint la LED embarquée (GP25). */
  set ledPower(value: boolean) {
    if (value === this.ledValue) return;
    this.ledValue = value;
    if (!this.ledEl) return;
    this.ledEl.setAttribute('fill', value ? '#8cff5a' : '#3a4a3a');
    this.ledEl.setAttribute('filter', value ? 'url(#led-glow)' : 'none');
  }

  get ledPower(): boolean {
    return this.ledValue;
  }

  private buildSvg(): string {
    const pins: string[] = [];
    const labels: string[] = [];
    const drawRow = (row: string[], y: number, labelAbove: boolean): void => {
      row.forEach((name, i) => {
        const x = PIN_START_X + i * PIN_STEP;
        // Pastille de la broche (trou métallisé), au pas de 10 px.
        pins.push(
          `<circle cx="${x}" cy="${y}" r="3" fill="${pinColor(name)}" stroke="#222" stroke-width="0.6"/>`,
          `<circle cx="${x}" cy="${y}" r="1.2" fill="#101010"/>`
        );
        const short = name.replace(/^GND\.\d+$/, 'GND');
        const ly = labelAbove ? y + 6 : y - 6;
        labels.push(
          `<text x="${x + 1.4}" y="${ly}" transform="rotate(${labelAbove ? 90 : -90} ${x} ${ly})"` +
            ` font-size="4" fill="#dddddd" font-family="monospace"` +
            ` text-anchor="start">${short}</text>`
        );
      });
    };
    drawRow(TOP_ROW, TOP_Y, true);
    drawRow(BOTTOM_ROW, BOTTOM_Y, false);

    return `
<svg width="250" height="90" viewBox="0 0 250 90" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="led-glow" x="-150%" y="-150%" width="400%" height="400%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- PCB -->
  <rect x="18" y="2" width="224" height="86" rx="8" fill="#1d6334" stroke="#114223" stroke-width="2"/>

  <!-- Connecteur USB micro-B (à gauche) -->
  <rect x="0" y="34" width="24" height="22" rx="3" fill="#c9ced1" stroke="#888" stroke-width="1"/>
  <rect x="0" y="40" width="18" height="10" rx="2" fill="#9aa2a6"/>

  <!-- Chip RP2040 (centre, entre les deux rangées) -->
  <rect x="118" y="34" width="34" height="22" rx="3" fill="#1a1a1a" stroke="#000"/>
  <text x="135" y="47" font-size="6" fill="#cccccc" text-anchor="middle" font-family="monospace">RP2040</text>

  <!-- LED embarquée GP25 -->
  <rect id="led-gp25" x="${LED_PAD.x - 5}" y="${LED_PAD.y - 4}" width="10" height="8" rx="1.5"
        fill="#3a4a3a" stroke="#222" stroke-width="0.8"/>

  <!-- Sérigraphie -->
  <text x="170" y="44" font-size="7" fill="#e8e8e8" font-weight="bold" font-family="sans-serif">Pi Pico</text>

  ${pins.join('\n  ')}
  ${labels.join('\n  ')}
</svg>`;
  }
}

if (!customElements.get('kablix-pico-board')) {
  customElements.define('kablix-pico-board', PicoBoardElement);
}
