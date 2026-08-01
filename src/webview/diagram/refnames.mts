// Repères des composants : R1, R2, C1, T1… Le préfixe dit la FAMILLE (celle
// d'un schéma d'électronique, pas la catégorie de palette), le numéro SUIT LE
// SCHÉMA — première résistance R1, deuxième R2, quel que soit l'ordre de pose
// des autres composants. Le repère est l'identifiant du composant : c'est lui
// qu'affichent l'inspecteur, les messages de simulation et la netlist.
//
// Les préfixes sont TRADUITS (BP en français, PB en anglais) : trop courts pour
// servir de clé de traduction, ils sont donnés langue par langue ici. Un projet
// enregistré garde ses repères tels quels — changer de langue ne renomme rien.
import { locale } from '../i18n.mjs';
import { partDef } from './catalog.mjs';

/** Familles de repères et leur préfixe, par langue. */
const FAMILIES = {
  resistor: { en: 'R', fr: 'R' },
  capacitor: { en: 'C', fr: 'C' },
  led: { en: 'L', fr: 'L' },
  display: { en: 'Disp', fr: 'Aff' },
  transistor: { en: 'T', fr: 'T' },
  diode: { en: 'D', fr: 'D' },
  board: { en: 'U', fr: 'U' },
  module: { en: 'Mod', fr: 'Mod' },
  button: { en: 'PB', fr: 'BP' },
  keypad: { en: 'KP', fr: 'Cl' },
  switch: { en: 'SW', fr: 'Inter' },
  pot: { en: 'Pot', fr: 'Pot' },
  sensor: { en: 'Sens', fr: 'Capt' },
  actuator: { en: 'Act', fr: 'Act' },
  psu: { en: 'PSU', fr: 'Alim' },
} as const;

export type RefFamily = keyof typeof FAMILIES;

/** Famille d'un modèle de simulation (`kind` du catalogue). */
const BY_KIND: Record<string, RefFamily> = {
  // Résistances : la CTN, la CTP et la LDR nue en sont (Frank), leur `kind`
  // l'est déjà.
  resistor: 'resistor',
  capacitor: 'capacitor',
  led: 'led',
  'rgb-led': 'led',
  neopixel: 'led',
  '7segment': 'display',
  'led-bar': 'display',
  'i2c-lcd': 'display',
  'i2c-oled': 'display',
  'spi-oled': 'display',
  'spi-tft': 'display',
  transistor: 'transistor',
  diode: 'diode',
  mcu: 'board',
  // Cartes complexes sans famille propre : platine d'essai, shield, carte SD,
  // carte 16 PWM…
  breadboard: 'module',
  'grove-shield': 'module',
  'spi-sd': 'module',
  'i2c-pwm': 'module',
  pushbutton: 'button',
  'slide-switch': 'switch',
  'dip-switch': 'switch',
  potentiometer: 'pot',
  joystick: 'pot', // un joystick, ce sont deux potentiomètres
  'ao-do-sensor': 'sensor',
  ultrasonic: 'sensor',
  'digital-source': 'sensor',
  'analog-source': 'sensor',
  buzzer: 'actuator',
  servo: 'actuator',
  fan: 'actuator',
  relay: 'actuator',
  psu: 'psu',
};

/** Exceptions par TYPE : un même `kind` peut servir à deux familles. */
const BY_TYPE: Record<string, RefFamily> = {
  dht11: 'sensor', // kind « passive » (protocole 1-wire), mais c'est un capteur
  dht22: 'sensor',
  keypad: 'keypad',
};

/** Famille d'un type de composant (repli : module). */
export function refFamily(type: string): RefFamily {
  const byType = BY_TYPE[type];
  if (byType) return byType;
  try {
    return BY_KIND[partDef(type).kind] ?? 'module';
  } catch {
    return 'module'; // type inconnu de ce poste (import d'un projet plus récent)
  }
}

/** Préfixe de repère d'un type, dans la langue de l'interface (« BP », « R »…). */
export function refPrefix(type: string): string {
  const family = FAMILIES[refFamily(type)];
  return locale() === 'fr' ? family.fr : family.en;
}

/**
 * Repère libre pour un composant de ce type : préfixe + premier numéro non
 * pris. On repart du plus grand numéro DÉJÀ posé (et non du nombre de
 * composants) — supprimer R2 puis poser une résistance donne R3, jamais un R2
 * qui rendrait deux fois le même repère à l'ouverture d'un vieux fichier.
 */
export function nextPartId(type: string, taken: Iterable<string>): string {
  const prefix = refPrefix(type);
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  let max = 0;
  const used = new Set<string>();
  for (const id of taken) {
    used.add(id);
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (used.has(`${prefix}${n}`)) n++; // repère occupé par un autre schéma d'origine
  return `${prefix}${n}`;
}
