// Catalogue des composants disponibles dans l'atelier.
// Les composants visuels viennent de @wokwi/elements (licence MIT) sauf la
// carte Pico (<kablix-pico-board>) et les composants créés par l'utilisateur
// (<kablix-custom-part>, enregistrés à l'exécution).

export type PartKind =
  | 'mcu'
  | 'led'
  | 'rgb-led'
  | 'pushbutton'
  | 'resistor'
  | 'buzzer'
  | 'potentiometer'
  | '7segment'
  | 'led-bar'
  | 'slide-switch'
  | 'dip-switch'
  | 'joystick'
  | 'analog-source'
  | 'digital-source'
  | 'servo'
  | 'passive';

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

export interface CustomPin {
  name: string;
  x: number;
  y: number;
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
  /** Composant interactif (bouton, potentiomètre…) : déplacé par son bandeau uniquement. */
  interactive?: boolean;
  /** Pour kind 'analog-source' : broche de sortie analogique. */
  analogPin?: string;
  /** Pour kind 'digital-source' : broche de sortie numérique. */
  digitalPin?: string;
  /** Composant personnalisé : dessin SVG et broches définies par l'utilisateur. */
  custom?: {
    svg: string;
    pins: CustomPin[];
    /** Correspondance rôle du modèle → nom de broche (ex. { A: 'anode' }). */
    pinRoles?: Record<string, string>;
  };
}

/** Description sérialisable d'un composant personnalisé (persistée côté extension). */
export interface CustomPartData {
  type: string;
  label: string;
  kind: PartKind;
  svg: string;
  pins: CustomPin[];
  pinRoles?: Record<string, string>;
  attrs?: Record<string, string>;
}

const STATE_PROP: PropDef = { attr: 'state', label: 'État (0/1)', kind: 'select', options: ['0', '1'] };
const VALUE_PROP: PropDef = { attr: 'value', label: 'Valeur (%)', kind: 'number', min: 0, max: 100, step: 1 };

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
    props: [VALUE_PROP],
  },
  {
    type: 'slide-pot', label: 'Potentiomètre glissière', tag: 'wokwi-slide-potentiometer', kind: 'potentiometer',
    attrs: { min: '0', max: '100', value: '50' }, interactive: true,
    props: [VALUE_PROP],
  },
  {
    type: '7seg', label: 'Afficheur 7 segments', tag: 'wokwi-7segment', kind: '7segment',
    attrs: { color: 'red' },
    props: [{ attr: 'color', label: 'Couleur', kind: 'select', options: ['red', 'green', 'blue', 'yellow', 'white'] }],
  },
  {
    type: 'led-bar', label: 'Barre de LED', tag: 'wokwi-led-bar-graph', kind: 'led-bar',
    attrs: { color: 'GYR' },
    props: [{ attr: 'color', label: 'Couleur', kind: 'select', options: ['GYR', 'red', 'green', 'blue', 'yellow'] }],
  },
  { type: 'slide-switch', label: 'Interrupteur glissière', tag: 'wokwi-slide-switch', kind: 'slide-switch', interactive: true },
  { type: 'dip-switch', label: 'DIP switch ×8', tag: 'wokwi-dip-switch-8', kind: 'dip-switch', interactive: true },
  { type: 'joystick', label: 'Joystick analogique', tag: 'wokwi-analog-joystick', kind: 'joystick', interactive: true },
  {
    type: 'photoresistor', label: 'Photorésistance (LDR)', tag: 'wokwi-photoresistor-sensor', kind: 'analog-source',
    analogPin: 'AO', attrs: { value: '50' },
    props: [{ attr: 'value', label: 'Luminosité (%)', kind: 'number', min: 0, max: 100, step: 1 }],
  },
  {
    type: 'pir', label: 'Détecteur de mouvement (PIR)', tag: 'wokwi-pir-motion-sensor', kind: 'digital-source',
    digitalPin: 'OUT', attrs: { state: '0' },
    props: [{ ...STATE_PROP, label: 'Mouvement détecté' }],
  },
  {
    type: 'tilt', label: "Capteur d'inclinaison", tag: 'wokwi-tilt-switch', kind: 'digital-source',
    digitalPin: 'OUT', attrs: { state: '0' },
    props: [{ ...STATE_PROP, label: 'Incliné' }],
  },
  {
    type: 'servo', label: 'Servomoteur', tag: 'wokwi-servo', kind: 'servo',
    attrs: { horn: 'single' },
    props: [{ attr: 'horn', label: 'Bras', kind: 'select', options: ['single', 'double', 'cross'] }],
  },
];

// --- Composants personnalisés (créés par l'utilisateur) -----------------------
const customParts = new Map<string, PartDef>();

/** Modèles de simulation proposés dans le créateur, avec leurs rôles de broches. */
export const CUSTOM_KINDS: ReadonlyArray<{ kind: PartKind; label: string; roles: string[] }> = [
  { kind: 'led', label: 'LED (allumée si A=haut et C=bas)', roles: ['A', 'C'] },
  { kind: 'pushbutton', label: 'Bouton poussoir (tire la broche à GND)', roles: ['1.l', '2.l'] },
  { kind: 'resistor', label: 'Résistance (relie ses deux broches)', roles: ['1', '2'] },
  { kind: 'buzzer', label: 'Buzzer (actif si tension entre 1 et 2)', roles: ['1', '2'] },
  { kind: 'digital-source', label: 'Source numérique (état piloté dans Propriétés)', roles: ['OUT'] },
  { kind: 'analog-source', label: 'Source analogique (valeur pilotée dans Propriétés)', roles: ['AO'] },
  { kind: 'passive', label: 'Décoratif (aucun comportement)', roles: [] },
];

export function registerCustomPart(data: CustomPartData): PartDef {
  const def: PartDef = {
    type: data.type,
    label: data.label,
    tag: 'kablix-custom-part',
    kind: data.kind,
    attrs: data.attrs,
    custom: { svg: data.svg, pins: data.pins, pinRoles: data.pinRoles },
    analogPin: data.kind === 'analog-source' ? data.pinRoles?.['AO'] ?? 'AO' : undefined,
    digitalPin: data.kind === 'digital-source' ? data.pinRoles?.['OUT'] ?? 'OUT' : undefined,
    interactive: data.kind === 'pushbutton',
    props:
      data.kind === 'digital-source' ? [STATE_PROP]
      : data.kind === 'analog-source' ? [VALUE_PROP]
      : undefined,
  };
  customParts.set(def.type, def);
  return def;
}

export function unregisterCustomPart(type: string): void {
  customParts.delete(type);
}

export function listCustomParts(): PartDef[] {
  return [...customParts.values()];
}

export function partDef(type: string): PartDef {
  const def = CATALOG.find((p) => p.type === type) ?? customParts.get(type);
  if (!def) throw new Error(`Type de composant inconnu : ${type}`);
  return def;
}

/**
 * Nom réel de la broche jouant un rôle donné du modèle de simulation
 * ('A'/'C' pour une LED, '1.l'/'2.l' pour un bouton…). Les composants intégrés
 * utilisent directement le nom du rôle ; les composants personnalisés peuvent
 * fournir leur propre correspondance.
 */
export function rolePin(type: string, role: string): string {
  return partDef(type).custom?.pinRoles?.[role] ?? role;
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
