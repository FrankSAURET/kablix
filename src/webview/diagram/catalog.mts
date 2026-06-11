// Catalogue des composants disponibles dans l'atelier.
// Les composants visuels viennent de @wokwi/elements (licence MIT) sauf la
// carte Pico qui est un élément maison (<kablix-pico-board>).

export type PartKind =
  | 'mcu'
  | 'led'
  | 'rgb-led'
  | 'pushbutton'
  | 'resistor'
  | 'buzzer'
  | 'potentiometer';

export type BoardId = 'uno' | 'pico';

/** Propriété éditable d'un composant (affichée dans l'éditeur de composants). */
export interface PropDef {
  /** Attribut HTML correspondant sur l'élément. */
  attr: string;
  label: string;
  kind: 'select' | 'number';
  /** Pour kind 'select' : valeurs proposées. */
  options?: readonly string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface PartDef {
  /** Identifiant interne du type de composant. */
  type: string;
  /** Libellé affiché dans la palette. */
  label: string;
  /** Tag de l'élément web. */
  tag: string;
  kind: PartKind;
  /** Pour kind 'mcu' : carte correspondante. */
  board?: BoardId;
  /** Attributs par défaut posés sur l'élément. */
  attrs?: Record<string, string>;
  /** Propriétés modifiables dans l'éditeur de composants. */
  props?: readonly PropDef[];
  /** Composant interactif (bouton, potentiomètre) : déplacé par son bandeau uniquement. */
  interactive?: boolean;
}

export const CATALOG: readonly PartDef[] = [
  { type: 'uno', label: 'Arduino Uno', tag: 'wokwi-arduino-uno', kind: 'mcu', board: 'uno' },
  { type: 'pico', label: 'Raspberry Pi Pico', tag: 'kablix-pico-board', kind: 'mcu', board: 'pico' },
  {
    type: 'led', label: 'LED', tag: 'wokwi-led', kind: 'led', attrs: { color: 'red' },
    props: [
      { attr: 'color', label: 'Couleur', kind: 'select', options: ['red', 'green', 'blue', 'yellow', 'orange', 'white', 'purple'] },
      { attr: 'flip', label: 'Retournée', kind: 'select', options: ['', '1'] },
    ],
  },
  { type: 'rgb-led', label: 'LED RGB', tag: 'wokwi-rgb-led', kind: 'rgb-led' },
  {
    type: 'button', label: 'Bouton', tag: 'wokwi-pushbutton', kind: 'pushbutton', attrs: { color: 'green' }, interactive: true,
    props: [
      { attr: 'color', label: 'Couleur', kind: 'select', options: ['green', 'red', 'blue', 'yellow', 'black', 'white'] },
    ],
  },
  {
    type: 'resistor', label: 'Résistance', tag: 'wokwi-resistor', kind: 'resistor', attrs: { value: '220', angle: '0' },
    props: [
      { attr: 'value', label: 'Valeur (Ω)', kind: 'number', min: 1, max: 10_000_000, step: 1 },
      { attr: 'angle', label: 'Angle', kind: 'select', options: ['0', '90', '180', '270'] },
    ],
  },
  { type: 'buzzer', label: 'Buzzer', tag: 'wokwi-buzzer', kind: 'buzzer' },
  {
    type: 'pot', label: 'Potentiomètre', tag: 'wokwi-potentiometer', kind: 'potentiometer',
    attrs: { min: '0', max: '100', value: '50' }, interactive: true,
    props: [
      { attr: 'value', label: 'Position (%)', kind: 'number', min: 0, max: 100, step: 1 },
    ],
  },
];

export function partDef(type: string): PartDef {
  const def = CATALOG.find((p) => p.type === type);
  if (!def) throw new Error(`Type de composant inconnu : ${type}`);
  return def;
}

/**
 * Rôle d'une broche de microcontrôleur. `name` est le nom logique compris par
 * le moteur de simulation ('13', 'A0', 'GP25'…) ; `adcChannel` est présent pour
 * les broches qui peuvent servir d'entrée analogique.
 */
export interface PinRole {
  role: 'digital' | 'gnd' | 'vcc' | 'other';
  name?: string;
  adcChannel?: number;
}

export function mcuPinRole(board: BoardId, pin: string): PinRole {
  if (board === 'uno') {
    if (/^([0-9]|1[0-3])$/.test(pin)) return { role: 'digital', name: pin };
    const a = /^A([0-5])$/.exec(pin);
    if (a) return { role: 'digital', name: pin, adcChannel: Number(a[1]) };
    if (pin.startsWith('GND')) return { role: 'gnd' };
    if (pin === '5V' || pin === '3.3V' || pin === 'VIN' || pin === 'IOREF') return { role: 'vcc' };
    return { role: 'other' };
  }
  // Raspberry Pi Pico : GP26..GP28 = ADC0..ADC2.
  const gp = /^GP(\d+)$/.exec(pin);
  if (gp) {
    const n = Number(gp[1]);
    if (n > 28) return { role: 'other' };
    const adc = n >= 26 ? n - 26 : undefined;
    return adc === undefined ? { role: 'digital', name: pin } : { role: 'digital', name: pin, adcChannel: adc };
  }
  if (pin.startsWith('GND')) return { role: 'gnd' };
  if (pin === '3V3' || pin === 'VBUS' || pin === 'VSYS') return { role: 'vcc' };
  return { role: 'other' };
}

const UNO_PINS: readonly string[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5',
  'GND.1', 'GND.2', 'GND.3', '5V', '3.3V', 'VIN',
];

const PICO_PINS: readonly string[] = [
  ...Array.from({ length: 23 }, (_, i) => `GP${i}`), // GP0..GP22
  'GP25', 'GP26', 'GP27', 'GP28',
  'GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5', 'GND.6', 'GND.7', 'GND.8',
  '3V3', 'VBUS', 'VSYS',
];

/** Broches câblables d'une carte (utilisé pour résoudre la netlist). */
export function mcuPins(board: BoardId): readonly string[] {
  return board === 'uno' ? UNO_PINS : PICO_PINS;
}
