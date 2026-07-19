// Grove Shield for Pi Pico v1.0 (Seeed) : géométrie des trous et connexions
// internes, sans DOM — partagé entre l'élément visuel <kablix-grove-pico> et la
// netlist. La Pico (ou Pico W) s'enfiche sur les deux rangées centrales et le
// shield redirige ses E/S vers les ports Grove (brochage vérifié sur le schéma
// officiel Grove_shield_for_PI_PICO v1.0.sch) :
//   I2C0 = GP8/GP9 · I2C1 = GP6/GP7 · UART0 = GP0/GP1 · UART1 = GP4/GP5
//   A0/A1/A2 = GP26/GP27/GP28 (2e signal = analogique précédent, alim fixe 3V3)
//   D16 = GP16/GP17 · D18 = GP18/GP19 · D20 = GP20/GP21
//   SPI0 (2×3) : SCK=GP2, TX=GP3, RX=GP4, CS=GP5
// L'interrupteur 3V3/5V choisit le rail VCC des ports I2C/UART/D16-D20 (les
// ports analogiques restent en 3V3) ; il est stocké dans l'attribut `pwr`.

/** Dimensions du dessin (px, = viewBox du SVG retouché rendu à l'échelle 1). */
export const GROVE_W = 220;
export const GROVE_H = 251.64;

/** Position de l'interrupteur : rail VCC des ports Grove numériques. */
export type GrovePower = '3v3' | '5v';

export function normalizePower(value: string | null | undefined): GrovePower {
  return value === '5v' ? '5v' : '3v3';
}

export interface GrovePin {
  name: string;
  x: number;
  y: number;
}

// Rangées du socle Pico (gauche → droite, USB à gauche — même orientation que
// <kablix-pico-board>). Les masses sont numérotées GND.1..8 comme sur la Pico.
const TOP_SOCKET = [
  '5V', 'VSYS', 'GND.5', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'GND.6', 'GP27', 'GP26',
  'RUN', 'GP22', 'GND.7', 'GP21', 'GP20', 'GP19', 'GP18', 'GND.8', 'GP17', 'GP16',
] as const;
const BOTTOM_SOCKET = [
  'GP0', 'GP1', 'GND.1', 'GP2', 'GP3', 'GP4', 'GP5', 'GND.2', 'GP6', 'GP7',
  'GP8', 'GP9', 'GND.3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND.4', 'GP14', 'GP15',
] as const;

/** Ports Grove : nom d'affichage + colonne x + 4 signaux du haut vers le bas. */
const TOP_PORTS: ReadonlyArray<{ port: string; x: number; pins: readonly string[] }> = [
  { port: 'I2C0', x: 60, pins: ['GND', 'VCC', 'SDA', 'SCL'] },
  { port: 'I2C1', x: 90, pins: ['GND', 'VCC', 'SDA', 'SCL'] },
  { port: 'A0', x: 120, pins: ['GND', '3V3', 'NC', 'A0'] },
  { port: 'A1', x: 150, pins: ['GND', '3V3', 'A0', 'A1'] },
  { port: 'A2', x: 180, pins: ['GND', '3V3', 'A1', 'A2'] },
];
const BOTTOM_PORTS: ReadonlyArray<{ port: string; x: number; pins: readonly string[] }> = [
  { port: 'UART0', x: 60, pins: ['GND', 'VCC', 'TX', 'RX'] },
  { port: 'UART1', x: 90, pins: ['GND', 'VCC', 'TX', 'RX'] },
  { port: 'D16', x: 120, pins: ['GND', 'VCC', 'D17', 'D16'] },
  { port: 'D18', x: 150, pins: ['GND', 'VCC', 'D19', 'D18'] },
  { port: 'D20', x: 180, pins: ['GND', 'VCC', 'D21', 'D20'] },
];

/**
 * Tous les trous du shield, positions locales (grille 10 px). `.b` = trou de
 * dégagement (rangée femelle doublée juste à l'extérieur du socle, même signal).
 */
export function groveShieldPins(): GrovePin[] {
  const pins: GrovePin[] = [];
  TOP_SOCKET.forEach((n, i) => {
    pins.push({ name: n, x: 10 + i * 10, y: 90 });
    pins.push({ name: `${n}.b`, x: 10 + i * 10, y: 80 });
  });
  BOTTOM_SOCKET.forEach((n, i) => {
    pins.push({ name: n, x: 10 + i * 10, y: 160 });
    pins.push({ name: `${n}.b`, x: 10 + i * 10, y: 170 });
  });
  for (const { port, x, pins: names } of TOP_PORTS) {
    names.forEach((n, i) => pins.push({ name: `${port}.${n}`, x, y: 20 + i * 10 }));
  }
  for (const { port, x, pins: names } of BOTTOM_PORTS) {
    names.forEach((n, i) => pins.push({ name: `${port}.${n}`, x, y: 200 + i * 10 }));
  }
  // Connecteur SPI0 (2×3) : rangée haute SCK/TX/RX, rangée basse GND/3V3/CS.
  pins.push(
    { name: 'SPI.SCK', x: 20, y: 210 },
    { name: 'SPI.TX', x: 30, y: 210 },
    { name: 'SPI.RX', x: 40, y: 210 },
    { name: 'SPI.GND', x: 20, y: 220 },
    { name: 'SPI.3V3', x: 30, y: 220 },
    { name: 'SPI.CS', x: 40, y: 220 },
  );
  return pins;
}

/** Noms des 40 trous du socle Pico (seuls trous où une carte peut s'enficher). */
export function groveSocketPins(): Set<string> {
  return new Set([...TOP_SOCKET, ...BOTTOM_SOCKET]);
}

/**
 * Groupes de trous reliés électriquement. Chaque trou du socle est doublé de
 * son trou de dégagement ; les signaux des ports rejoignent la colonne GP
 * correspondante ; GND et 3V3 sont des rails uniques ; le rail VCC des ports
 * numériques suit l'interrupteur (`pwr`) : 3V3 ou 5V (VBUS de la Pico).
 */
export function groveShieldStrips(pwr: GrovePower): string[][] {
  const strips: string[][] = [];
  // Socle ↔ trou de dégagement.
  for (const n of [...TOP_SOCKET, ...BOTTOM_SOCKET]) strips.push([n, `${n}.b`]);
  // Rail de masse : toutes les masses du socle + broches GND des ports + SPI.
  strips.push([
    'GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5', 'GND.6', 'GND.7', 'GND.8',
    ...TOP_PORTS.map((p) => `${p.port}.GND`),
    ...BOTTOM_PORTS.map((p) => `${p.port}.GND`),
    'SPI.GND',
  ]);
  // Rail 3V3 fixe : ports analogiques + SPI.
  strips.push(['3V3', 'A0.3V3', 'A1.3V3', 'A2.3V3', 'SPI.3V3']);
  // Rail VCC commuté : ports I2C/UART/D16-D20, relié à 3V3 ou 5V selon le switch.
  strips.push([
    pwr === '5v' ? '5V' : '3V3',
    'I2C0.VCC', 'I2C1.VCC', 'UART0.VCC', 'UART1.VCC',
    'D16.VCC', 'D18.VCC', 'D20.VCC',
  ]);
  // Signaux des ports → colonne GP du socle (schéma Seeed).
  strips.push(
    ['GP8', 'I2C0.SDA'],
    ['GP9', 'I2C0.SCL'],
    ['GP6', 'I2C1.SDA'],
    ['GP7', 'I2C1.SCL'],
    ['GP26', 'A0.A0', 'A1.A0'],
    ['GP27', 'A1.A1', 'A2.A1'],
    ['GP28', 'A2.A2'],
    ['GP0', 'UART0.TX'],
    ['GP1', 'UART0.RX'],
    ['GP4', 'UART1.TX', 'SPI.RX'],
    ['GP5', 'UART1.RX', 'SPI.CS'],
    ['GP16', 'D16.D16'],
    ['GP17', 'D16.D17'],
    ['GP18', 'D18.D18'],
    ['GP19', 'D18.D19'],
    ['GP20', 'D20.D20'],
    ['GP21', 'D20.D21'],
    ['GP2', 'SPI.SCK'],
    ['GP3', 'SPI.TX'],
  );
  return strips;
}
