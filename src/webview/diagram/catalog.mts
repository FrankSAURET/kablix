// Catalogue des composants disponibles dans l'atelier.
// Les composants visuels sont des forks locaux de @wokwi/elements v1.9.2 (MIT,
// voir ../composants/LICENSE-wokwi.md) sauf la
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
  | 'ao-do-sensor'
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
  | 'grove-shield'
  | 'psu'
  | 'display'
  | 'passive';

export type BoardId = 'uno' | 'nano' | 'mega' | 'pico' | 'picow';

/** Famille de microcontrôleur (détermine le moteur de simulation et la toolchain). */
export type McuFamily = 'avr328' | 'avr2560' | 'rp2040';

/** Toutes les cartes connues, dans l'ordre d'affichage du sélecteur. */
export const BOARD_IDS: readonly BoardId[] = ['uno', 'nano', 'mega', 'pico', 'picow'];

export function isBoardId(value: unknown): value is BoardId {
  return typeof value === 'string' && (BOARD_IDS as readonly string[]).includes(value);
}

/**
 * Famille électrique d'une carte : c'est elle (et non l'identifiant exact) qui
 * décide du moteur (AVR vs RP2040), du jeu de broches et de la toolchain. Uno /
 * Nano partagent l'ATmega328P ; Pico / Pico W partagent le RP2040.
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
  kind: 'select' | 'number' | 'checkbox';
  /** Pour kind 'select' : valeurs proposées. */
  options?: readonly string[];
  /** Libellé affiché (clé i18n) pour certaines valeurs : { valeur → libellé }. */
  optionLabels?: Record<string, string>;
  min?: number;
  max?: number;
  step?: number;
  /** Autorise les suffixes SI (p n µ m k M G) dans la valeur (champ texte). */
  suffixes?: boolean;
  /** N'affiche cette propriété que si un autre attribut vaut l'une des valeurs données. */
  showIf?: { attr: string; equals: readonly string[] };
}

export interface CustomPin {
  name: string;
  x: number;
  y: number;
}

/**
 * Paramètre de définition d'un composant personnalisé (valeur nominale,
 * résistance à 1 Lx…) : champ numérique de l'inspecteur (stocké dans les attrs
 * sous « prm_<name> ») ET constante accessible par son nom dans l'expression de
 * la caractéristique du contrôle de simulation.
 */
export interface CustomParam {
  /** Identifiant utilisable dans les expressions (lettres/chiffres/_). */
  name: string;
  /** Libellé affiché dans l'inspecteur (ex. « Résistance à 1 Lx (Ω) »). */
  label: string;
  /** Valeur par défaut. */
  value: number;
}

/**
 * Contrôle de simulation d'un composant personnalisé, affiché SUR le composant
 * pendant la simulation (comme les capteurs intégrés) :
 * - slider (source analogique) : x ∈ [min,max] ; la sortie AO vaut `expr` en
 *   VOLTS (variables : x + paramètres), ou à défaut la rampe linéaire
 *   min→max → 0→Vref de la carte ;
 * - switch (source numérique) : interrupteur 0/1 sur la sortie OUT.
 */
export interface CustomControl {
  type: 'slider' | 'switch';
  /** Libellé affiché à côté du contrôle (ex. « Éclairement »). */
  label?: string;
  /** Unité affichée après la valeur (ex. « Lx »). */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Caractéristique : tension de sortie en volts, f(x, paramètres). */
  expr?: string;
}

/** Préfixe des attrs stockant la valeur courante d'un paramètre de composant. */
export const PARAM_ATTR_PREFIX = 'prm_';

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
  /**
   * Le composant affiche des contrôles de simulation (curseur/bouton) DANS son
   * rendu, visibles seulement pendant la simulation. L'éditeur pose alors
   * l'attribut `simulating` sur l'élément (posé/retiré par setLocked).
   */
  simControl?: boolean;
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
    /** Vue interne (schéma) affichée par le bouton K, déjà nettoyée. */
    innerSvg?: string;
    /** Coin haut-gauche de la vue interne dans le repère du dessin externe. */
    innerOffset?: { x: number; y: number };
    /** Paramètres de définition (inspecteur + constantes des expressions). */
    params?: CustomParam[];
    /** Contrôle de simulation (curseur/interrupteur sur le composant). */
    control?: CustomControl;
    /** Catégorie de palette assignée (clé de CATEGORY_ORDER). */
    category?: string;
  };
  /**
   * Facteur d'agrandissement appliqué au dessin ET aux broches pour ramener le
   * pas des broches à 10 px (= grille / platine). Les éléments forkés
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
  /** Vue interne (schéma) et son calage dans le repère du dessin externe. */
  innerSvg?: string;
  innerOffset?: { x: number; y: number };
  /** Ancres vertes mesurées à l'import (externe/interne) : permettent de
   *  recalculer le calage quand un seul des deux SVG est réimporté. */
  extAnchor?: { x: number; y: number };
  intAnchor?: { x: number; y: number };
  /** Paramètres de définition et contrôle de simulation (voir types dédiés). */
  params?: CustomParam[];
  control?: CustomControl;
  /** Catégorie de palette assignée (clé de CATEGORY_ORDER) ; absente = section
   *  « Composants personnalisés ». */
  category?: string;
}

const STATE_PROP: PropDef = { attr: 'state', label: 'State (0/1)', kind: 'select', options: ['0', '1'] };
const VALUE_PROP: PropDef = { attr: 'value', label: 'Position (%)', kind: 'number', min: 0, max: 100, step: 1 };
// Seuil de bascule DOUT des capteurs à double sortie (flamme, gaz, son, lumière).
const SENSITIVITY_PROP: PropDef = { attr: 'sensitivity', label: 'Sensitivity (%)', kind: 'number', min: 0, max: 100, step: 1 };

export const CATALOG: readonly PartDef[] = [
  // Cartes AVR : éléments forkés, mis à l'échelle 10/9,6 px pour que
  // leurs broches tombent sur la grille de 10 px (= pas de la platine d'essai).
  { type: 'uno', label: 'Arduino Uno', tag: 'kablix-arduino-uno', kind: 'mcu', board: 'uno' },
  { type: 'nano', label: 'Arduino Nano', tag: 'kablix-arduino-nano', kind: 'mcu', board: 'nano' },
  { type: 'mega', label: 'Arduino Mega 2560', tag: 'kablix-arduino-mega', kind: 'mcu', board: 'mega' },
  // Pico / Pico W : le catalogue Wokwi ne fournit aucun élément Pico → dessin maison
  // <kablix-pico-board> (SVG paysage pico.svg / picow.svg, variant), pas de 10 px.
  { type: 'pico', label: 'Raspberry Pi Pico', tag: 'kablix-pico-board', kind: 'mcu', board: 'pico', attrs: { variant: 'pico' } },
  // Pico W : même RP2040 et même brochage que le Pico (le Wi-Fi n'est pas simulé
  // par le cœur) → même élément <kablix-pico-board>, dessin Pico W (variant).
  { type: 'picow', label: 'Raspberry Pi Pico W', tag: 'kablix-pico-board', kind: 'mcu', board: 'picow', attrs: { variant: 'picow' } },
  // Grove Shield for Pi Pico (Seeed v1.0) : la Pico / Pico W s'enfiche sur les
  // deux rangées centrales (fils auto) et ses E/S sont redirigées vers les ports
  // Grove (connexions internes : diagram/grove-shield.mts). L'interrupteur du
  // dessin choisit le rail VCC des ports numériques (attr `pwr`), aussi réglable
  // dans l'inspecteur.
  {
    type: 'grove-pico', label: 'Grove Shield (Pico)', tag: 'kablix-grove-pico', kind: 'grove-shield',
    attrs: { pwr: '3v3' },
    props: [{
      attr: 'pwr', label: 'Grove VCC rail', kind: 'select', options: ['3v3', '5v'],
      optionLabels: { '3v3': '3.3 V', '5v': '5 V (VBUS)' },
    }],
  },
  {
    type: 'breadboard', label: 'Breadboard', tag: 'kablix-breadboard', kind: 'breadboard',
    attrs: { size: 'half' },
    props: [{
      attr: 'size', label: 'Size', kind: 'select', options: ['mini', 'half', 'full'],
      optionLabels: { mini: 'Mini', half: 'Medium', full: 'Large' },
    }],
  },
  {
    type: 'led', label: 'LED', tag: 'kablix-led', kind: 'led', attrs: { color: 'red' },
    props: [
      { attr: 'color', label: 'Color', kind: 'select', options: ['red', 'green', 'blue', 'yellow', 'orange', 'white', 'purple'] },
    ],
  },
  {
    type: 'rgb-led', label: 'RGB LED', tag: 'kablix-rgb-led', kind: 'rgb-led',
    attrs: { common: 'cathode' },
    props: [
      {
        attr: 'common', label: 'Common pin', kind: 'select', options: ['cathode', 'anode'],
        optionLabels: { cathode: 'Common cathode (K)', anode: 'Common anode (A)' },
      },
    ],
  },
  {
    type: 'button', label: 'Pushbutton', tag: 'kablix-pushbutton', kind: 'pushbutton', attrs: { color: 'green' }, interactive: true,
    props: [
      { attr: 'color', label: 'Color', kind: 'select', options: ['green', 'red', 'blue', 'yellow', 'black', 'white'] },
    ],
  },
  {
    type: 'resistor', label: 'Resistor', tag: 'kablix-resistor', kind: 'resistor', attrs: { value: '220' },
    props: [
      { attr: 'value', label: 'Value (Ω)', kind: 'number', min: 1, max: 10_000_000, step: 1, suffixes: true },
    ],
  },
  // Résistances variables nues (2 pattes, sans polarité) : traitées comme des
  // résistances dans la netlist, leur valeur suit le curseur de simulation
  // (variableResistorOhms de model.mts) et toute entrée ADC reliée au réseau
  // résistif suit le pont diviseur réel (adcDividerLevels).
  {
    type: 'ldr', label: 'LDR (photoresistor)', tag: 'kablix-ldr', kind: 'resistor',
    simControl: true, attrs: { lux: '500', r1lx: '50000', gamma: '0.7' },
    props: [
      { attr: 'r1lx', label: 'Resistance at 1 lx (Ω)', kind: 'number', min: 1, max: 10_000_000, step: 1, suffixes: true },
      { attr: 'gamma', label: 'Sensitivity coefficient (γ)', kind: 'number', min: 0.1, max: 2, step: 0.01 },
    ],
  },
  {
    type: 'ntc', label: 'NTC thermistor', tag: 'kablix-ntc', kind: 'resistor',
    simControl: true, attrs: { temperature: '25', r25: '10000', beta: '3950', tmin: '-55', tmax: '125' },
    props: [
      { attr: 'r25', label: 'Resistance at 25 °C (Ω)', kind: 'number', min: 1, max: 10_000_000, step: 1, suffixes: true },
      { attr: 'beta', label: 'Beta coefficient (K)', kind: 'number', min: 100, max: 10_000, step: 1 },
      { attr: 'tmin', label: 'Slider Tmin (°C)', kind: 'number', min: -273, max: 999, step: 1 },
      { attr: 'tmax', label: 'Slider Tmax (°C)', kind: 'number', min: -272, max: 1000, step: 1 },
    ],
  },
  {
    type: 'ptc', label: 'PTC thermistor', tag: 'kablix-ptc', kind: 'resistor',
    simControl: true, attrs: { temperature: '25', r25: '2000', tc: '0.79', tmin: '-55', tmax: '125' },
    props: [
      { attr: 'r25', label: 'Resistance at 25 °C (Ω)', kind: 'number', min: 1, max: 10_000_000, step: 1, suffixes: true },
      { attr: 'tc', label: 'Temp. coefficient (%/°C)', kind: 'number', min: 0.01, max: 10, step: 0.01 },
      { attr: 'tmin', label: 'Slider Tmin (°C)', kind: 'number', min: -273, max: 999, step: 1 },
      { attr: 'tmax', label: 'Slider Tmax (°C)', kind: 'number', min: -272, max: 1000, step: 1 },
    ],
  },
  { type: 'buzzer', label: 'Buzzer', tag: 'kablix-buzzer', kind: 'buzzer' },
  {
    type: 'pot', label: 'Potentiometer', tag: 'kablix-potentiometer', kind: 'potentiometer',
    attrs: { min: '0', max: '100', value: '50' }, interactive: true,
    props: [VALUE_PROP],
  },
  {
    type: 'slide-pot', label: 'Slide potentiometer', tag: 'kablix-slide-potentiometer', kind: 'potentiometer',
    attrs: { min: '0', max: '100', value: '50' }, interactive: true,
    props: [VALUE_PROP],
  },
  {
    type: '7seg', label: '7-segment display', tag: 'kablix-7segment', kind: '7segment',
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
        showIf: { attr: 'digits', equals: ['4'] },
      },
    ],
  },
  {
    type: 'led-bar', label: 'LED bar graph', tag: 'kablix-led-bar-graph', kind: 'led-bar',
    attrs: { color: 'GYR' },
    props: [{ attr: 'color', label: 'Color', kind: 'select', options: ['GYR', 'red', 'green', 'blue', 'yellow'] }],
  },
  { type: 'slide-switch', label: 'Slide switch', tag: 'kablix-slide-switch', kind: 'slide-switch', interactive: true },
  { type: 'dip-switch', label: 'DIP switch ×8', tag: 'kablix-dip-switch-8', kind: 'dip-switch', interactive: true },
  { type: 'joystick', label: 'Analog joystick', tag: 'kablix-analog-joystick', kind: 'joystick', interactive: true },
  {
    type: 'photoresistor', label: 'Light sensor', tag: 'kablix-photoresistor-sensor', kind: 'ao-do-sensor',
    analogPin: 'AO', digitalPin: 'DO', simControl: true, attrs: { sensitivity: '50' },
    props: [SENSITIVITY_PROP],
  },
  {
    // Détection au survol de la souris EN SIMULATION (simControl) ; plus de
    // propriété d'état. Le moteur lit `el.motion` en direct (survol + Ctrl+clic).
    type: 'pir', label: 'PIR motion sensor', tag: 'kablix-pir-motion-sensor', kind: 'digital-source',
    digitalPin: 'OUT', simControl: true,
  },
  {
    // Inclinaison : plus de propriété d'état ; l'état vient d'un bouton affiché
    // EN SIMULATION (simControl). Le moteur lit `el.tilted` en direct (cf. sim.mts).
    type: 'tilt', label: 'Tilt sensor', tag: 'kablix-tilt-switch', kind: 'digital-source',
    digitalPin: 'OUT', simControl: true,
  },
  {
    type: 'servo', label: 'Servo motor', tag: 'kablix-servo', kind: 'servo',
    // Impulsions 0°/180° réglables : SG90 (datasheet) = 500-2500 µs ; lib
    // Servo Arduino par défaut = 544-2400 µs. L'angle affiché est interpolé
    // linéairement entre les deux (cf. sim.mts).
    attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500', speed: '2' },
    props: [
      {
        attr: 'horn', label: 'Horn', kind: 'select', options: ['single', 'double', 'cross'],
        optionLabels: { single: 'Single horn', double: 'Double horn', cross: 'Cross horn' },
      },
      { attr: 'pulsemin', label: 'Pulse at 0° (µs)', kind: 'number', min: 100, max: 3000, step: 1 },
      { attr: 'pulsemax', label: 'Pulse at 180° (µs)', kind: 'number', min: 100, max: 3000, step: 1 },
      // Rotation VISIBLE : temps d'un tour complet (360°) à pleine vitesse.
      // 0 = mouvement instantané (ancien comportement).
      { attr: 'speed', label: 'Rotation time (s/turn)', kind: 'number', min: 0, max: 30, step: 0.1 },
    ],
  },

  // --- Composants supplémentaires (forkés du catalogue Wokwi).
  // Afficheur LCD texte unifié (HD44780). Un seul élément `kablix-lcd1602` couvre
  // les 4 variantes : il se dimensionne sur cols/rows et change ses broches via
  // `pins` (i2c = 4 fils GND/VCC/SDA/SCL ; full = parallèle). Le texte n'est simulé
  // qu'en I²C (Lcd1602Device) ; en parallèle l'afficheur reste visuel.
  {
    type: 'lcd', label: 'LCD Texte', tag: 'kablix-lcd1602', kind: 'i2c-lcd',
    attrs: { pins: 'i2c', address: '0x27', cols: '16', rows: '2', lcdSize: '16x2' },
    props: [
      {
        attr: 'pins', label: 'Interface', kind: 'select', options: ['i2c', 'full'],
        optionLabels: { i2c: 'I²C (4 wires)', full: 'Parallel (HD44780)' },
      },
      {
        attr: 'lcdSize', label: 'Size', kind: 'select', options: ['16x2', '20x4'],
        optionLabels: { '16x2': '16 × 2', '20x4': '20 × 4' },
      },
    ],
  },
  // OLED SSD1306 : module combo réel 8 broches (SDA/SCL/SA0/RST/CS/VDD/VIN/GND).
  // `pins` bascule les noms/rôles exposés par pinInfo (i2c = SDA/SCL, câblage le
  // plus courant ; spi = DATA/CLK/DC/CS, 4 fils) — même dessin, mêmes positions.
  {
    type: 'oled-ssd1306', label: 'OLED display (SSD1306)', tag: 'kablix-ssd1306', kind: 'i2c-oled',
    attrs: { pins: 'i2c' },
    props: [
      {
        attr: 'pins', label: 'Interface', kind: 'select', options: ['i2c', 'spi'],
        optionLabels: { i2c: 'I²C (SDA/SCL)', spi: 'SPI (4 wires)' },
      },
    ],
  },
  // Écran TFT couleur ILI9341 (SPI) : décodé et dessiné dans son canvas.
  { type: 'ili9341', label: 'TFT display (ILI9341, SPI)', tag: 'kablix-ili9341', kind: 'spi-tft' },
  // Carte microSD (SPI) : répondeur de protocole (init + lecture/écriture de blocs).
  { type: 'microsd', label: 'microSD card (SPI)', tag: 'kablix-microsd-card', kind: 'spi-sd' },
  // NeoPixel (WS2812) : simulés — la chaîne DIN est décodée et les LED s'allument.
  { type: 'neopixel', label: 'NeoPixel', tag: 'kablix-neopixel', kind: 'neopixel' },
  { type: 'neopixel-matrix', label: 'NeoPixel matrix', tag: 'kablix-neopixel-matrix', kind: 'neopixel', attrs: { rows: '8', cols: '8' } },
  { type: 'led-ring', label: 'NeoPixel ring', tag: 'kablix-led-ring', kind: 'neopixel', attrs: { pixels: '16' } },

  // Bouton poussoir 6 mm : même modèle que le bouton standard.
  {
    type: 'button-6mm', label: 'Pushbutton (6mm)', tag: 'kablix-pushbutton-6mm', kind: 'pushbutton',
    attrs: { color: 'red' }, interactive: true,
    props: [{ attr: 'color', label: 'Color', kind: 'select', options: ['green', 'red', 'blue', 'yellow', 'black', 'white'] }],
  },

  // Capteurs analogiques : la sortie pilote l'entrée ADC reliée (valeur en %).
  {
    type: 'ntc-temp', label: 'NTC temperature sensor', tag: 'kablix-ntc-temperature-sensor', kind: 'analog-source',
    analogPin: 'OUT', simControl: true, attrs: { temperature: '25' },
    props: [],
  },
  {
    type: 'gas-sensor', label: 'Gas sensor (MQ)', tag: 'kablix-gas-sensor', kind: 'ao-do-sensor',
    analogPin: 'AOUT', digitalPin: 'DOUT', simControl: true, attrs: { sensitivity: '50' },
    props: [SENSITIVITY_PROP],
  },
  {
    type: 'heartbeat', label: 'Heart-beat sensor', tag: 'kablix-heart-beat-sensor', kind: 'analog-source',
    analogPin: 'OUT', simControl: true, attrs: { bpm: '72' },
    props: [],
  },

  // Capteurs à double sortie (analogique AOUT + numérique DOUT) : curseur
  // d'intensité en simulation, seuil = propriété sensibilité (simControl).
  {
    type: 'flame', label: 'Flame sensor', tag: 'kablix-flame-sensor', kind: 'ao-do-sensor', pinScale: WOKWI_PIN_SCALE,
    analogPin: 'AOUT', digitalPin: 'DOUT', simControl: true, attrs: { sensitivity: '50' },
    props: [SENSITIVITY_PROP],
  },
  {
    type: 'sound', label: 'Sound sensor', tag: 'kablix-small-sound-sensor', kind: 'ao-do-sensor',
    analogPin: 'AOUT', digitalPin: 'DOUT', simControl: true, attrs: { sensitivity: '50' },
    props: [SENSITIVITY_PROP],
  },

  // Capteur ultrason (élément Wokwi, broches VCC/TRIG/ECHO/GND) : simulé par le
  // protocole ultrason réel (impulsion TRIG → ECHO selon la distance). Distance
  // min/max réglées dans l'inspecteur ; distance mesurée choisie EN SIMULATION
  // par un curseur + zone de saisie (simControl).
  {
    type: 'hcsr04', label: 'Ultrasonic sensor', tag: 'kablix-hc-sr04', kind: 'ultrasonic',
    attrs: { distancemin: '2', distancemax: '400' },
    simControl: true,
    props: [
      { attr: 'distancemin', label: 'Min distance (cm)', kind: 'number', min: 0, max: 400, step: 1 },
      { attr: 'distancemax', label: 'Max distance (cm)', kind: 'number', min: 1, max: 400, step: 1 },
    ],
  },
  // Capteur de température/humidité DHT22 (1-wire sur DATA) : répond au protocole
  // réel. Température/humidité réglées EN SIMULATION par deux curseurs (simControl).
  {
    type: 'dht22', label: 'Temp/humidity sensor (DHT22)', tag: 'kablix-dht22', kind: 'passive',
    simControl: true, attrs: { temperature: '22', humidity: '50' },
    props: [],
  },
  // Module Grove « 16-Channel PWM Driver (PCA9685) » de Seeed (dessin Fritzing
  // retouché par Frank) : 16 sorties servo P1..P16 (= canaux 0..15), bus I²C à
  // gauche (connecteur Grove), bornier V+/GND à droite — SANS alim de
  // laboratoire 5 V au courant suffisant sur ce bornier, les sorties ne bougent
  // pas (pca9685PowerState, model.mts). Simulé par Pca9685Device (trames I²C
  // réelles → 16 rapports cycliques). Adresse par défaut 0x7F : la carte Grove
  // 108020102 sort d'usine avec tous ses pads d'adresse HAUTS (contrairement au
  // PCA9685 nu Adafruit à 0x40).
  // ADRESSE RÉGLÉE COMME SUR LA CARTE : six pads soudables AD0..AD5 (cases à
  // cocher de l'inspecteur, cochée = pad HAUT = 1). L'adresse 7 bits vaut
  // 1 A5 A4 A3 A2 A1 A0 (le bit 6 est câblé HAUT et le bit 7 n'existe pas),
  // soit 0x40 (tous bas) à 0x7F (tous hauts) — `address` est recalculée à
  // chaque changement de pad (updatePartAttr) et reste l'attribut lu par la
  // simulation.
  {
    type: 'pca9685', label: '16-channel PWM driver (PCA9685)', tag: 'kablix-pca9685', kind: 'i2c-pwm',
    attrs: { address: '0x7F', ad0: '1', ad1: '1', ad2: '1', ad3: '1', ad4: '1', ad5: '1' },
    props: [
      { attr: 'ad0', label: 'AD0 (bit 0)', kind: 'checkbox' },
      { attr: 'ad1', label: 'AD1 (bit 1)', kind: 'checkbox' },
      { attr: 'ad2', label: 'AD2 (bit 2)', kind: 'checkbox' },
      { attr: 'ad3', label: 'AD3 (bit 3)', kind: 'checkbox' },
      { attr: 'ad4', label: 'AD4 (bit 4)', kind: 'checkbox' },
      { attr: 'ad5', label: 'AD5 (bit 5)', kind: 'checkbox' },
    ],
  },
  // Alimentation de laboratoire (dessin de Frank) : source V+/GND réglable.
  // `voltage` = tension de DÉMARRAGE ; en simulation le bouton du dessin la fait
  // varier de 0 à 30 V (300° de rotation) et la LED « Courant limite » s'allume
  // si le courant débité (psuLoadAmps, model.mts) dépasse `maxcurrent`.
  {
    type: 'alim', label: 'Bench power supply', tag: 'kablix-alim', kind: 'psu',
    simControl: true, attrs: { voltage: '5', maxcurrent: '1' },
    props: [
      { attr: 'voltage', label: 'Voltage (V)', kind: 'number', min: 0, max: 30, step: 0.1 },
      { attr: 'maxcurrent', label: 'Max current supplied (A)', kind: 'number', min: 0.1, max: 10, step: 0.1 },
    ],
  },
  // Clavier matriciel à membrane (3 ou 4 colonnes). Interactif : une touche
  // enfoncée court-circuite ligne/colonne (lecture matricielle simulée).
  {
    type: 'keypad', label: 'Membrane keypad', tag: 'kablix-membrane-keypad', kind: 'passive', interactive: true,
    // La nappe (broches R/C) fait partie du dessin retouché, toujours visible.
    // `hardkeys` : variante « touches dures » (dessins de Frank), mêmes broches.
    attrs: { columns: '4', hardkeys: '' },
    props: [{
      attr: 'hardkeys', label: 'Hard keys (instead of membrane)', kind: 'checkbox',
    }, {
      attr: 'columns', label: 'Columns', kind: 'select', options: ['3', '4'],
      optionLabels: { '3': '3 columns (3×4)', '4': '4 columns (4×4)' },
    }],
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
    case 'grove-shield':
      return 'Boards';
    case '7segment':
    case 'led-bar':
    case 'display':
    case 'i2c-lcd':
    case 'neopixel':
    case 'i2c-oled':
    case 'spi-oled':
    case 'spi-tft':
      return 'Displays & LEDs';
    case 'led':
    case 'rgb-led':
      return 'Passive'; // « Discrets » (composants discrets : R, LED…)
    case 'psu':
      return 'Instruments'; // « Appareils de mesure » : alim de laboratoire…
    case 'spi-sd':
    case 'i2c-pwm':
      return 'Divers'; // modules divers (carte SD, pilote PWM…)
    case 'pushbutton':
    case 'potentiometer':
    case 'slide-switch':
    case 'dip-switch':
    case 'joystick':
      return 'Controls';
    case 'analog-source':
    case 'digital-source':
    case 'ao-do-sensor':
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
  'Passive', // « Discrets » : juste sous Cartes & platines
  'Displays & LEDs',
  'Controls',
  'Sensors',
  'Actuators',
  'Instruments',
  'Divers',
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

/**
 * Préréglage de modèle de simulation importé d'un fichier .json : un modèle de
 * base (kind de CUSTOM_KINDS) + rôles pré-affectés et attributs par défaut.
 * Format du fichier (objet seul ou tableau d'objets) :
 * { "format": "kablix-model", "label": "…", "kind": "led",
 *   "pinRoles": { "A": "anode", "C": "cathode" }, "attrs": { } }
 */
export interface SimModelPreset {
  label: string;
  kind: PartKind;
  pinRoles?: Record<string, string>;
  attrs?: Record<string, string>;
}

let simModelPresets: SimModelPreset[] = [];

export function setSimModelPresets(presets: SimModelPreset[]): void {
  simModelPresets = presets;
}

export function getSimModelPresets(): SimModelPreset[] {
  return simModelPresets;
}

/** Valide et ajoute des préréglages (remplace ceux de même libellé) ; retourne la liste complète. */
export function addSimModelPresets(raw: unknown): SimModelPreset[] {
  const items = Array.isArray(raw) ? raw : [raw];
  for (const item of items) {
    const p = item as Partial<SimModelPreset>;
    if (typeof p?.label !== 'string' || !p.label) throw new Error('missing "label" field.');
    if (!CUSTOM_KINDS.some((k) => k.kind === p.kind)) throw new Error(`unknown "kind": ${String(p.kind)}`);
    const preset: SimModelPreset = { label: p.label, kind: p.kind as PartKind, pinRoles: p.pinRoles, attrs: p.attrs };
    const i = simModelPresets.findIndex((m) => m.label === preset.label);
    if (i >= 0) simModelPresets[i] = preset;
    else simModelPresets.push(preset);
  }
  return simModelPresets;
}

export function registerCustomPart(data: CustomPartData): PartDef {
  // Paramètres de définition → champs numériques de l'inspecteur (attr
  // « prm_<name> », valeur par défaut incluse dans def.attrs pour les
  // nouvelles instances) ; le contrôle de simulation remplace le champ
  // statique « Position (%) » / « State » quand il pilote la même sortie.
  const params = data.params ?? [];
  const paramProps: PropDef[] = params.map((p) => ({
    attr: `${PARAM_ATTR_PREFIX}${p.name}`,
    label: p.label || p.name,
    kind: 'number',
  }));
  const paramAttrs = Object.fromEntries(params.map((p) => [`${PARAM_ATTR_PREFIX}${p.name}`, String(p.value)]));
  const controlled = data.control?.type;
  const baseProps: PropDef[] =
    data.kind === 'digital-source' && controlled !== 'switch' ? [STATE_PROP]
    : data.kind === 'analog-source' && controlled !== 'slider' ? [VALUE_PROP]
    : [];
  const props = [...baseProps, ...paramProps];
  const def: PartDef = {
    type: data.type,
    label: data.label,
    tag: 'kablix-custom-part',
    kind: data.kind,
    attrs: Object.keys(paramAttrs).length > 0 ? { ...data.attrs, ...paramAttrs } : data.attrs,
    custom: {
      svg: data.svg,
      pins: data.pins,
      pinRoles: data.pinRoles,
      innerSvg: data.innerSvg,
      innerOffset: data.innerOffset,
      params: data.params,
      control: data.control,
      category: data.category,
    },
    analogPin: data.kind === 'analog-source' ? data.pinRoles?.['AO'] ?? 'AO' : undefined,
    digitalPin: data.kind === 'digital-source' ? data.pinRoles?.['OUT'] ?? 'OUT' : undefined,
    interactive: data.kind === 'pushbutton',
    simControl: !!data.control,
    props: props.length > 0 ? props : undefined,
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
 * Adresse I²C d'un PCA9685 d'après l'état de ses six pads AD0..AD5 (attrs
 * `ad0`..`ad5`, non vide = pad HAUT). Adresse 7 bits = 1 A5 A4 A3 A2 A1 A0 :
 * le bit 6 est câblé HAUT sur la carte et le bit 7 n'existe pas — la valeur va
 * donc de 0x40 (tous les pads bas) à 0x7F (tous hauts, réglage d'usine Grove).
 */
export function pca9685Address(attrs: Record<string, string> | undefined): number {
  let addr = 0x40;
  for (let bit = 0; bit < 6; bit++) {
    if ((attrs?.[`ad${bit}`] ?? '') !== '') addr |= 1 << bit;
  }
  return addr;
}

/** Même adresse, écrite comme sur la fiche du module : « 0x40 » … « 0x7F ». */
export function pca9685AddressText(attrs: Record<string, string> | undefined): string {
  return `0x${pca9685Address(attrs).toString(16).toUpperCase().padStart(2, '0')}`;
}

/**
 * Attributs d'un composant chargé depuis un schéma, remis à jour quand le
 * réglage a changé de forme. Aujourd'hui : le PCA9685, dont l'adresse était
 * choisie dans une liste (`address`) et se règle maintenant par ses six pads
 * AD0..AD5 — les schémas d'avant n'ont pas les `ad*`, on les DÉDUIT de
 * l'adresse enregistrée (0x7F → tous cochés) pour que le montage garde
 * exactement la même adresse sur le bus.
 */
export function migratePartAttrs(part: { type: string; attrs?: Record<string, string> }): Record<string, string> | undefined {
  const attrs = part.attrs;
  let def: PartDef;
  try {
    def = partDef(part.type);
  } catch {
    return attrs; // type inconnu (composant perso non encore enregistré)
  }
  if (def.kind !== 'i2c-pwm') return attrs;
  if (attrs && [0, 1, 2, 3, 4, 5].some((b) => `ad${b}` in attrs)) return attrs; // déjà au nouveau format
  const addr = Number(attrs?.address ?? 0x40) || 0x40;
  const pads: Record<string, string> = {};
  for (let bit = 0; bit < 6; bit++) pads[`ad${bit}`] = addr & (1 << bit) ? '1' : '';
  return { ...attrs, ...pads };
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
  // Le nom peut être préfixé par un port (« I2C0.GND », « A0.3V3 » sur le Grove
  // Shield) : le rôle se lit sur le dernier segment. `.b` = trou de dégagement
  // du shield (même signal que le trou de socle qu'il double).
  const leaf = pin.replace(/\.b$/, '').split('.').pop() ?? pin;
  if (/^(GND|VSS)/i.test(pin) || /^(GND|VSS)/i.test(leaf)) return 'gnd';
  if (/^(VCC|VDD|V\+|5V|3V3|3\.3V|VBUS|VSYS|VIN)$/i.test(pin) || /^(VCC|VDD|V\+|5V|3V3|3\.3V|VBUS|VSYS|VIN)$/i.test(leaf)) return 'vcc';
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
  // `5V`, `5V.1`, `5V.2`… (le Mega expose plusieurs broches 5 V).
  if (pin.startsWith('5V') || pin === '3.3V' || pin === 'VIN' || pin === 'IOREF') return { role: 'vcc' };
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
  // Broches supplémentaires du dessin Wokwi (sinon non câblables en simu) :
  // 2e 5 V, AREF, IOREF, RESET et le 2e jeu SDA/SCL (A4.2/A5.2).
  '5V.1', '5V.2', 'IOREF', 'AREF', 'RESET', 'A4.2', 'A5.2',
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

/**
 * Rails internes d'une carte : broches physiquement reliées SUR le PCB, donc à
 * la même équipotentielle en simulation. Toutes les masses (GND.n) sont une
 * seule masse ; le Mega expose plusieurs broches 5 V (5V/5V.1/5V.2) reliées au
 * même rail. Les rails de tensions DIFFÉRENTES (3V3 vs VBUS/VSYS sur le Pico,
 * 3.3V vs 5V vs VIN sur l'AVR) restent SÉPARÉS.
 */
export function mcuInternalStrips(board: BoardId): readonly string[][] {
  const pins = mcuPins(board);
  const strips: string[][] = [];
  const gnd = pins.filter((p) => p.startsWith('GND'));
  if (gnd.length > 1) strips.push(gnd);
  // 5V, 5V.1, 5V.2… = même rail 5 V (Mega). `5V` sans suffixe et ses variantes.
  const v5 = pins.filter((p) => p === '5V' || p.startsWith('5V.'));
  if (v5.length > 1) strips.push(v5);
  return strips;
}
