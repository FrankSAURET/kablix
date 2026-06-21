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
  | 'ultrasonic'
  | 'i2c-lcd'
  | 'i2c-pwm'
  | 'i2c-oled'
  | 'spi-oled'
  | 'spi-tft'
  | 'spi-sd'
  | 'neopixel'
  | 'breadboard'
  | 'display'
  | 'passive';

export type BoardId = 'uno' | 'nano' | 'mini' | 'mega' | 'pico' | 'picow';

/** Famille de microcontrôleur (détermine le moteur de simulation et la toolchain). */
export type McuFamily = 'avr328' | 'avr2560' | 'rp2040';

/** Toutes les cartes connues, dans l'ordre d'affichage du sélecteur. */
export const BOARD_IDS: readonly BoardId[] = ['uno', 'nano', 'mini', 'mega', 'pico', 'picow'];

export function isBoardId(value: unknown): value is BoardId {
  return typeof value === 'string' && (BOARD_IDS as readonly string[]).includes(value);
}

/**
 * Famille électrique d'une carte : c'est elle (et non l'identifiant exact) qui
 * décide du moteur (AVR vs RP2040), du jeu de broches et de la toolchain. Uno /
 * Nano / Pro Mini partagent l'ATmega328P ; Pico / Pico W partagent le RP2040.
 */
export function boardFamily(board: BoardId): McuFamily {
  if (board === 'pico' || board === 'picow') return 'rp2040';
  if (board === 'mega') return 'avr2560';
  return 'avr328';
}

/** Propriété éditable d'un composant (affichée dans l'éditeur de composants). */
export interface PropDef {
  /** Attribut HTML correspondant sur l'élément. */
  attr: string;
  label: string;
  kind: 'select' | 'number';
  /** Pour kind 'select' : valeurs proposées. */
  options?: readonly string[];
  /** Libellé affiché (clé i18n) pour certaines valeurs : { valeur → libellé }. */
  optionLabels?: Record<string, string>;
  min?: number;
  max?: number;
  step?: number;
  /** Autorise les suffixes SI (p n µ m k M G) dans la valeur (champ texte). */
  suffixes?: boolean;
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
  /**
   * Facteur d'agrandissement appliqué au dessin ET aux broches pour ramener le
   * pas des broches à 10 px (= grille / platine). Les éléments @wokwi/elements
   * sont au pas physique 0,1″ ≈ 9,6 px : on les met à l'échelle 10/9,6. Absent
   * (ou 1) = aucune mise à l'échelle (dessins déjà au pas de 10 px).
   */
  pinScale?: number;
}

/** Pas Wokwi (0,1″ ≈ 9,6 px) ramené à la grille de 10 px. */
export const WOKWI_PIN_SCALE = 10 / 9.6;

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

const STATE_PROP: PropDef = { attr: 'state', label: 'State (0/1)', kind: 'select', options: ['0', '1'] };
const VALUE_PROP: PropDef = { attr: 'value', label: 'Position (%)', kind: 'number', min: 0, max: 100, step: 1 };

export const CATALOG: readonly PartDef[] = [
  // Cartes AVR : éléments @wokwi/elements, mis à l'échelle 10/9,6 px pour que
  // leurs broches tombent sur la grille de 10 px (= pas de la platine d'essai).
  { type: 'uno', label: 'Arduino Uno', tag: 'wokwi-arduino-uno', kind: 'mcu', board: 'uno', pinScale: WOKWI_PIN_SCALE },
  { type: 'nano', label: 'Arduino Nano', tag: 'wokwi-arduino-nano', kind: 'mcu', board: 'nano', pinScale: WOKWI_PIN_SCALE },
  // Pro Mini : électriquement un ATmega328P comme le Nano (mêmes broches D0–13 /
  // A0–A7). Faute d'élément @wokwi/elements dédié, on réutilise le visuel Nano.
  { type: 'mini', label: 'Arduino Pro Mini', tag: 'wokwi-arduino-nano', kind: 'mcu', board: 'mini', pinScale: WOKWI_PIN_SCALE },
  { type: 'mega', label: 'Arduino Mega 2560', tag: 'wokwi-arduino-mega', kind: 'mcu', board: 'mega', pinScale: WOKWI_PIN_SCALE },
  // Pico / Pico W : @wokwi/elements ne fournit aucun élément Pico → dessin maison
  // <kablix-pico-board> (basé sur parts/picow-module), déjà au pas de 10 px.
  { type: 'pico', label: 'Raspberry Pi Pico', tag: 'kablix-pico-board', kind: 'mcu', board: 'pico' },
  // Pico W : même RP2040 et même brochage que le Pico (le Wi-Fi n'est pas simulé
  // par le cœur) → on réutilise le dessin <kablix-pico-board>.
  { type: 'picow', label: 'Raspberry Pi Pico W', tag: 'kablix-pico-board', kind: 'mcu', board: 'picow' },
  {
    type: 'breadboard', label: 'Breadboard', tag: 'kablix-breadboard', kind: 'breadboard',
    attrs: { size: 'half' },
    props: [{
      attr: 'size', label: 'Size', kind: 'select', options: ['mini', 'half', 'full'],
      optionLabels: { mini: 'Mini', half: 'Medium', full: 'Large' },
    }],
  },
  {
    type: 'led', label: 'LED', tag: 'wokwi-led', kind: 'led', attrs: { color: 'red' },
    props: [
      { attr: 'color', label: 'Color', kind: 'select', options: ['red', 'green', 'blue', 'yellow', 'orange', 'white', 'purple'] },
    ],
  },
  {
    type: 'rgb-led', label: 'RGB LED', tag: 'wokwi-rgb-led', kind: 'rgb-led', pinScale: WOKWI_PIN_SCALE,
    attrs: { common: 'cathode' },
    props: [
      {
        attr: 'common', label: 'Common pin', kind: 'select', options: ['cathode', 'anode'],
        optionLabels: { cathode: 'Common cathode (K)', anode: 'Common anode (A)' },
      },
    ],
  },
  {
    type: 'button', label: 'Pushbutton', tag: 'wokwi-pushbutton', kind: 'pushbutton', attrs: { color: 'green' }, interactive: true,
    props: [
      { attr: 'color', label: 'Color', kind: 'select', options: ['green', 'red', 'blue', 'yellow', 'black', 'white'] },
    ],
  },
  {
    type: 'resistor', label: 'Resistor', tag: 'wokwi-resistor', kind: 'resistor', attrs: { value: '220', angle: '0' },
    props: [
      { attr: 'value', label: 'Value (Ω)', kind: 'number', min: 1, max: 10_000_000, step: 1, suffixes: true },
      { attr: 'angle', label: 'Angle', kind: 'select', options: ['0', '90', '180', '270'] },
    ],
  },
  { type: 'buzzer', label: 'Buzzer', tag: 'wokwi-buzzer', kind: 'buzzer' },
  {
    type: 'pot', label: 'Potentiometer', tag: 'wokwi-potentiometer', kind: 'potentiometer',
    attrs: { min: '0', max: '100', value: '50' }, interactive: true,
    props: [VALUE_PROP],
  },
  {
    type: 'slide-pot', label: 'Slide potentiometer', tag: 'wokwi-slide-potentiometer', kind: 'potentiometer',
    attrs: { min: '0', max: '100', value: '50' }, interactive: true,
    props: [VALUE_PROP],
  },
  {
    type: '7seg', label: '7-segment display', tag: 'wokwi-7segment', kind: '7segment',
    attrs: { color: 'red', common: 'cathode', digits: '1' },
    props: [
      { attr: 'color', label: 'Color', kind: 'select', options: ['red', 'green', 'blue', 'yellow', 'white'] },
      {
        attr: 'common', label: 'Common pin', kind: 'select', options: ['cathode', 'anode'],
        optionLabels: { cathode: 'Common cathode (K)', anode: 'Common anode (A)' },
      },
      {
        attr: 'digits', label: 'Digits', kind: 'select', options: ['1', '2', '4'],
        optionLabels: { '1': '1 digit', '2': '2 digits', '4': '4 digits' },
      },
      {
        attr: 'colon', label: 'Colon (clock)', kind: 'select', options: ['', 'true'],
        optionLabels: { '': 'no', 'true': 'Clock colon (:)' },
      },
    ],
  },
  {
    type: 'led-bar', label: 'LED bar graph', tag: 'wokwi-led-bar-graph', kind: 'led-bar',
    attrs: { color: 'GYR' },
    props: [{ attr: 'color', label: 'Color', kind: 'select', options: ['GYR', 'red', 'green', 'blue', 'yellow'] }],
  },
  { type: 'slide-switch', label: 'Slide switch', tag: 'wokwi-slide-switch', kind: 'slide-switch', interactive: true },
  { type: 'dip-switch', label: 'DIP switch ×8', tag: 'wokwi-dip-switch-8', kind: 'dip-switch', interactive: true },
  { type: 'joystick', label: 'Analog joystick', tag: 'wokwi-analog-joystick', kind: 'joystick', interactive: true },
  {
    type: 'photoresistor', label: 'Photoresistor (LDR)', tag: 'wokwi-photoresistor-sensor', kind: 'analog-source',
    analogPin: 'AO', attrs: { value: '50' },
    props: [{ attr: 'value', label: 'Brightness (%)', kind: 'number', min: 0, max: 100, step: 1 }],
  },
  {
    type: 'pir', label: 'PIR motion sensor', tag: 'wokwi-pir-motion-sensor', kind: 'digital-source',
    digitalPin: 'OUT', attrs: { state: '0' },
    props: [{ ...STATE_PROP, label: 'Motion detected' }],
  },
  {
    type: 'tilt', label: 'Tilt sensor', tag: 'wokwi-tilt-switch', kind: 'digital-source',
    digitalPin: 'OUT', attrs: { state: '0' },
    props: [{ ...STATE_PROP, label: 'Tilted' }],
  },
  {
    type: 'servo', label: 'Servo motor', tag: 'wokwi-servo', kind: 'servo',
    attrs: { horn: 'single' },
    props: [{
      attr: 'horn', label: 'Horn', kind: 'select', options: ['single', 'double', 'cross'],
      optionLabels: { single: 'Single horn', double: 'Double horn', cross: 'Cross horn' },
    }],
  },

  // --- Composants @wokwi/elements supplémentaires (importés du catalogue Wokwi).
  // Afficheurs : visuels seuls pour l'instant (posables et câblables).
  { type: 'lcd1602', label: 'LCD 16×2', tag: 'wokwi-lcd1602', kind: 'display' },
  { type: 'lcd2004', label: 'LCD 20×4', tag: 'wokwi-lcd2004', kind: 'display' },
  // OLED SSD1306 : l'élément Wokwi est la variante SPI 4 fils (DATA/CLK/DC/CS) →
  // simulé en SPI (le programme y dessine, l'écran s'allume).
  { type: 'oled-ssd1306', label: 'OLED display (SSD1306, SPI)', tag: 'wokwi-ssd1306', kind: 'spi-oled' },
  // Écran TFT couleur ILI9341 (SPI) : décodé et dessiné dans son canvas.
  { type: 'ili9341', label: 'TFT display (ILI9341, SPI)', tag: 'wokwi-ili9341', kind: 'spi-tft' },
  // Carte microSD (SPI) : répondeur de protocole (init + lecture/écriture de blocs).
  { type: 'microsd', label: 'microSD card (SPI)', tag: 'wokwi-microsd-card', kind: 'spi-sd' },
  // NeoPixel (WS2812) : simulés — la chaîne DIN est décodée et les LED s'allument.
  { type: 'neopixel', label: 'NeoPixel', tag: 'wokwi-neopixel', kind: 'neopixel' },
  { type: 'neopixel-matrix', label: 'NeoPixel matrix', tag: 'wokwi-neopixel-matrix', kind: 'neopixel', attrs: { rows: '8', cols: '8' } },
  { type: 'led-ring', label: 'NeoPixel ring', tag: 'wokwi-led-ring', kind: 'neopixel', attrs: { pixels: '16' } },

  // Bouton poussoir 6 mm : même modèle que le bouton standard.
  {
    type: 'button-6mm', label: 'Pushbutton (6mm)', tag: 'wokwi-pushbutton-6mm', kind: 'pushbutton',
    attrs: { color: 'red' }, interactive: true,
    props: [{ attr: 'color', label: 'Color', kind: 'select', options: ['green', 'red', 'blue', 'yellow', 'black', 'white'] }],
  },

  // Capteurs analogiques : la sortie pilote l'entrée ADC reliée (valeur en %).
  {
    type: 'ntc-temp', label: 'NTC temperature sensor', tag: 'wokwi-ntc-temperature-sensor', kind: 'analog-source',
    analogPin: 'OUT', attrs: { value: '50' },
    props: [{ ...VALUE_PROP, label: 'Temperature (%)' }],
  },
  {
    type: 'gas-sensor', label: 'Gas sensor (MQ)', tag: 'wokwi-gas-sensor', kind: 'analog-source',
    analogPin: 'AOUT', attrs: { value: '20' },
    props: [{ ...VALUE_PROP, label: 'Gas level (%)' }],
  },
  {
    type: 'heartbeat', label: 'Heart-beat sensor', tag: 'wokwi-heart-beat-sensor', kind: 'analog-source',
    analogPin: 'OUT', attrs: { value: '50' },
    props: [{ ...VALUE_PROP, label: 'Pulse (%)' }],
  },

  // Capteurs numériques : la sortie DOUT pilote l'entrée reliée (état 0/1).
  {
    type: 'flame', label: 'Flame sensor', tag: 'wokwi-flame-sensor', kind: 'digital-source',
    digitalPin: 'DOUT', attrs: { state: '0' },
    props: [{ ...STATE_PROP, label: 'Flame detected' }],
  },
  {
    type: 'sound', label: 'Sound sensor', tag: 'wokwi-small-sound-sensor', kind: 'digital-source',
    digitalPin: 'DOUT', attrs: { state: '0' },
    props: [{ ...STATE_PROP, label: 'Sound detected' }],
  },

  // Capteur ultrason HC-SR04 (élément Wokwi, broches VCC/TRIG/ECHO/GND) : simulé
  // par le protocole ultrason réel (impulsion TRIG → ECHO selon la distance).
  {
    type: 'hcsr04', label: 'Ultrasonic sensor (HC-SR04)', tag: 'wokwi-hc-sr04', kind: 'ultrasonic',
    attrs: { distance: '20' },
    props: [{ attr: 'distance', label: 'Distance (cm)', kind: 'number', min: 2, max: 400, step: 1 }],
  },
  // Capteur de température/humidité DHT22 (1-wire sur SDA) : répond au protocole
  // réel (température/humidité réglées dans l'inspecteur).
  {
    type: 'dht22', label: 'Temp/humidity sensor (DHT22)', tag: 'wokwi-dht22', kind: 'passive',
    attrs: { temperature: '22', humidity: '50' },
    props: [
      { attr: 'temperature', label: 'Temperature (°C)', kind: 'number', min: -40, max: 80, step: 0.1 },
      { attr: 'humidity', label: 'Humidity (%)', kind: 'number', min: 0, max: 100, step: 1 },
    ],
  },
  // Clavier matriciel à membrane (3 ou 4 colonnes). Interactif : une touche
  // enfoncée court-circuite ligne/colonne (lecture matricielle simulée).
  {
    type: 'keypad', label: 'Membrane keypad', tag: 'wokwi-membrane-keypad', kind: 'passive', interactive: true,
    attrs: { columns: '4' },
    props: [{
      attr: 'columns', label: 'Columns', kind: 'select', options: ['3', '4'],
      optionLabels: { '3': '3 columns (3×4)', '4': '4 columns (4×4)' },
    }],
  },
  // LCD 16×2 en version I²C (backpack PCF8574) : mêmes broches GND/VCC/SDA/SCL,
  // texte décodé du bus I²C affiché à l'écran (adresse 0x27 par défaut).
  {
    type: 'lcd1602-i2c', label: 'LCD 16×2 (I²C)', tag: 'wokwi-lcd1602', kind: 'i2c-lcd',
    attrs: { pins: 'i2c', address: '0x27', cols: '16', rows: '2' },
  },
];

// --- Catégories de la palette --------------------------------------------------
/** Catégorie d'affichage d'un composant dans la palette (clé i18n). */
export function partCategory(def: PartDef): string {
  // Composants rangés par type quand le `kind` ne suffit pas à les classer.
  if (def.type === 'dht22' || def.type === 'hcsr04') return 'Sensors';
  if (def.type === 'keypad') return 'Controls';
  switch (def.kind) {
    case 'mcu':
    case 'breadboard':
      return 'Boards';
    case 'led':
    case 'rgb-led':
    case '7segment':
    case 'led-bar':
    case 'display':
    case 'i2c-lcd':
      return 'Displays & LEDs';
    case 'pushbutton':
    case 'potentiometer':
    case 'slide-switch':
    case 'dip-switch':
    case 'joystick':
      return 'Controls';
    case 'analog-source':
    case 'digital-source':
    case 'ultrasonic':
      return 'Sensors';
    case 'buzzer':
    case 'servo':
      return 'Actuators';
    default:
      return 'Passive';
  }
}

/** Ordre d'affichage des catégories dans la palette. */
export const CATEGORY_ORDER: readonly string[] = [
  'Boards',
  'Displays & LEDs',
  'Controls',
  'Sensors',
  'Actuators',
  'Passive',
];

// --- Composants personnalisés (créés par l'utilisateur) -----------------------
const customParts = new Map<string, PartDef>();

/** Modèles de simulation proposés dans le créateur, avec leurs rôles de broches. */
export const CUSTOM_KINDS: ReadonlyArray<{ kind: PartKind; label: string; roles: string[] }> = [
  { kind: 'led', label: 'LED (lit when A=high and K=low)', roles: ['A', 'C'] },
  { kind: 'pushbutton', label: 'Pushbutton (pulls the pin to GND)', roles: ['1.l', '2.l'] },
  { kind: 'resistor', label: 'Resistor (joins its two pins)', roles: ['1', '2'] },
  { kind: 'buzzer', label: 'Buzzer (active when voltage across 1 and 2)', roles: ['1', '2'] },
  { kind: 'digital-source', label: 'Digital source (state set in Properties)', roles: ['OUT'] },
  { kind: 'analog-source', label: 'Analog source (value set in Properties)', roles: ['AO'] },
  { kind: 'ultrasonic', label: 'Ultrasonic sensor HC-SR04 (Trig/Echo)', roles: ['TRIG', 'ECHO'] },
  { kind: 'i2c-lcd', label: 'I²C LCD display (HD44780)', roles: [] },
  { kind: 'i2c-pwm', label: 'I²C PWM driver (PCA9685)', roles: [] },
  { kind: 'i2c-oled', label: 'I²C OLED display (SSD1306)', roles: [] },
  { kind: 'spi-oled', label: 'SPI OLED display (SSD1306)', roles: ['DC'] },
  { kind: 'passive', label: 'Decorative (no behavior)', roles: [] },
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
 * Rôle électrique d'une broche de n'importe quel composant — utilisé pour la
 * couleur automatique des fils (GND → noir, alimentation → rouge). Pour les
 * cartes on s'appuie sur mcuPinRole ; pour les modules sur le nom de la broche.
 */
export function pinElectricalRole(type: string, pin: string): 'gnd' | 'vcc' | 'other' {
  const def = partDef(type);
  if (def.kind === 'mcu' && def.board) {
    const role = mcuPinRole(def.board, pin).role;
    return role === 'gnd' || role === 'vcc' ? role : 'other';
  }
  if (/^GND/i.test(pin)) return 'gnd';
  if (/^(VCC|V\+|5V|3V3|3\.3V|VBUS|VSYS|VIN)$/i.test(pin)) return 'vcc';
  return 'other';
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
  if (boardFamily(board) === 'rp2040') {
    // Raspberry Pi Pico / Pico W : GP26..GP28 = ADC0..ADC2.
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
  // Familles AVR (ATmega328P : Uno / Nano / Pro Mini ; ATmega2560 : Mega). Les
  // broches numériques sont de simples nombres (0..13 ou 0..53), les analogiques
  // An (A0..A7 sur 328P, A0..A15 sur 2560) servent aussi d'entrées ADC.
  if (/^\d+$/.test(pin)) return { role: 'digital', name: pin };
  const a = /^A(\d+)$/.exec(pin);
  if (a) return { role: 'digital', name: pin, adcChannel: Number(a[1]) };
  if (pin.startsWith('GND')) return { role: 'gnd' };
  if (pin === '5V' || pin === '3.3V' || pin === 'VIN' || pin === 'IOREF') return { role: 'vcc' };
  return { role: 'other' };
}

// ATmega328P (Uno / Nano / Pro Mini). A6/A7 n'existent que sur le boîtier TQFP
// du Nano/Pro Mini (entrées ADC seules) ; inoffensifs pour l'Uno (jamais câblés).
const AVR328_PINS: readonly string[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
  'GND.1', 'GND.2', 'GND.3', '5V', '3.3V', 'VIN',
];

// ATmega2560 (Mega) : 0..53 en numérique, A0..A15 en analogique.
const MEGA_PINS: readonly string[] = [
  ...Array.from({ length: 54 }, (_, i) => `${i}`), // 0..53
  ...Array.from({ length: 16 }, (_, i) => `A${i}`), // A0..A15
  'SDA', 'SCL', 'GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5', '5V', '3.3V', 'VIN',
];

const PICO_PINS: readonly string[] = [
  ...Array.from({ length: 23 }, (_, i) => `GP${i}`), // GP0..GP22
  'GP25', 'GP26', 'GP27', 'GP28',
  'GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5', 'GND.6', 'GND.7', 'GND.8',
  '3V3', 'VBUS', 'VSYS',
];

/** Broches câblables d'une carte (utilisé pour résoudre la netlist). */
export function mcuPins(board: BoardId): readonly string[] {
  switch (boardFamily(board)) {
    case 'rp2040':
      return PICO_PINS;
    case 'avr2560':
      return MEGA_PINS;
    default:
      return AVR328_PINS;
  }
}
