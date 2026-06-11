// Catalogue des composants disponibles dans l'atelier.
// Chaque entrée référence soit un élément web @wokwi/elements (MIT),
// soit un élément maison (microsim-pico-board).

export type PartKind =
  | 'mcu-uno'
  | 'mcu-pico'
  | 'led'
  | 'rgb-led'
  | 'pushbutton'
  | 'resistor'
  | 'buzzer'
  | 'potentiometer';

export interface PartDef {
  type: string;
  label: string;
  tag: string;
  kind: PartKind;
  attrs?: Record<string, string>;
}

export const CATALOG: readonly PartDef[] = [
  { type: 'uno',         label: 'Arduino Uno',  tag: 'wokwi-arduino-uno',     kind: 'mcu-uno' },
  { type: 'pico',        label: 'Pico',         tag: 'microsim-pico-board',   kind: 'mcu-pico' },
  { type: 'led',         label: 'LED',          tag: 'wokwi-led',             kind: 'led',          attrs: { color: 'red' } },
  { type: 'rgb-led',     label: 'RGB LED',      tag: 'wokwi-rgb-led',         kind: 'rgb-led' },
  { type: 'button',      label: 'Bouton',       tag: 'wokwi-pushbutton',      kind: 'pushbutton',   attrs: { color: 'green' } },
  { type: 'resistor',    label: 'Résistance',   tag: 'wokwi-resistor',        kind: 'resistor',     attrs: { value: '220', angle: '0' } },
  { type: 'buzzer',      label: 'Buzzer',       tag: 'wokwi-buzzer',          kind: 'buzzer' },
  { type: 'potentiometer', label: 'Potentiomètre', tag: 'wokwi-potentiometer', kind: 'potentiometer' },
];

export function partDef(type: string): PartDef {
  const def = CATALOG.find((p) => p.type === type);
  if (!def) throw new Error(`Type de composant inconnu : ${type}`);
  return def;
}

// ---------------------------------------------------------------------------
// Rôles des broches MCU
// ---------------------------------------------------------------------------

export type PinRole =
  | { role: 'digital'; name: string }
  | { role: 'gnd' }
  | { role: 'vcc' }
  | { role: 'other' };

/** Rôle d'une broche de l'Arduino Uno. */
export function unoPinRole(pin: string): PinRole {
  if (/^([0-9]|1[0-3])$/.test(pin)) return { role: 'digital', name: pin };
  if (/^A[0-5]$/.test(pin)) return { role: 'digital', name: pin };
  if (pin.startsWith('GND')) return { role: 'gnd' };
  if (pin === '5V' || pin === '3.3V' || pin === 'VIN' || pin === 'IOREF') return { role: 'vcc' };
  return { role: 'other' };
}

/** Rôle d'une broche du Raspberry Pi Pico (RP2040). */
export function picoPinRole(pin: string): PinRole {
  if (/^GP(\d+)$/.test(pin)) {
    const n = parseInt(pin.slice(2), 10);
    if (n >= 0 && n <= 28) return { role: 'digital', name: pin };
  }
  if (pin.startsWith('GND') || pin === 'AGND') return { role: 'gnd' };
  if (pin === 'VBUS' || pin === 'VSYS' || pin === '3V3' || pin === '3V3_EN' || pin === 'ADC_VREF') {
    return { role: 'vcc' };
  }
  return { role: 'other' };
}

/** Rôle générique d'une broche selon le type de MCU. */
export function mcuPinRole(kind: PartKind, pin: string): PinRole {
  if (kind === 'mcu-uno') return unoPinRole(pin);
  if (kind === 'mcu-pico') return picoPinRole(pin);
  return { role: 'other' };
}

// Broches câblables de l'Arduino Uno.
export const UNO_PINS: readonly string[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5',
  'GND.1', 'GND.2', 'GND.3', '5V', '3.3V', 'VIN',
];

// Broches câblables du Raspberry Pi Pico.
export const PICO_PINS: readonly string[] = [
  'GP0', 'GP1', 'GND.1', 'GP2', 'GP3', 'GND.2',
  'GP4', 'GP5', 'GND.3', 'GP6', 'GP7', 'GND.4',
  'GP8', 'GP9', 'GND.5', 'GP10', 'GP11', 'GND.6',
  'GP12', 'GP13',
  'VBUS', 'VSYS', 'GND.7', '3V3_EN', '3V3', 'ADC_VREF',
  'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND.8',
  'GP21', 'GP20', 'GP19', 'GP18', 'GND.9', 'GP17', 'GP16',
];

/** Retourne les broches câblables pour un type de MCU. */
export function getMcuPins(kind: PartKind): readonly string[] {
  if (kind === 'mcu-uno') return UNO_PINS;
  if (kind === 'mcu-pico') return PICO_PINS;
  return [];
}
