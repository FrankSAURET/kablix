// Catalogue des composants disponibles dans l'atelier.
// Chaque entrée référence un élément web @wokwi/elements (licence MIT).
export type PartKind = 'mcu-uno' | 'led' | 'pushbutton' | 'resistor';

export interface PartDef {
  /** Identifiant interne du type de composant. */
  type: string;
  /** Libellé affiché dans la palette. */
  label: string;
  /** Tag de l'élément web @wokwi/elements. */
  tag: string;
  kind: PartKind;
  /** Attributs par défaut posés sur l'élément. */
  attrs?: Record<string, string>;
}

export const CATALOG: readonly PartDef[] = [
  { type: 'uno', label: 'Arduino Uno', tag: 'wokwi-arduino-uno', kind: 'mcu-uno' },
  { type: 'led', label: 'LED', tag: 'wokwi-led', kind: 'led', attrs: { color: 'red' } },
  { type: 'button', label: 'Bouton', tag: 'wokwi-pushbutton', kind: 'pushbutton', attrs: { color: 'green' } },
  { type: 'resistor', label: 'Résistance', tag: 'wokwi-resistor', kind: 'resistor', attrs: { value: '220', angle: '0' } },
];

export function partDef(type: string): PartDef {
  const def = CATALOG.find((p) => p.type === type);
  if (!def) throw new Error(`Type de composant inconnu : ${type}`);
  return def;
}

/**
 * Correspondance des broches de l'Arduino Uno vers les signaux du moteur.
 * Les broches numériques 0–13 et analogiques A0–A5 portent leur nom ;
 * les broches GND/alimentation sont marquées comme telles.
 */
export type UnoPinRole =
  | { role: 'digital'; name: string }
  | { role: 'gnd' }
  | { role: 'vcc' }
  | { role: 'other' };

export function unoPinRole(pin: string): UnoPinRole {
  if (/^([0-9]|1[0-3])$/.test(pin)) return { role: 'digital', name: pin };
  if (/^A[0-5]$/.test(pin)) return { role: 'digital', name: pin };
  if (pin.startsWith('GND')) return { role: 'gnd' };
  if (pin === '5V' || pin === '3.3V' || pin === 'VIN' || pin === 'IOREF') return { role: 'vcc' };
  return { role: 'other' };
}
