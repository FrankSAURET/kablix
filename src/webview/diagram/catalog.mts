// Catalogue des composants disponibles dans l'atelier.
// Les composants visuels sont des forks locaux de @wokwi/elements v1.9.2 (MIT,
// voir ../composants/LICENSE-wokwi.md) sauf la
// carte Pico (<kablix-pico-board>) et les composants créés par l'utilisateur
// (<kablix-custom-part>, enregistrés à l'exécution).
import { DEFAULT_IC74_FAMILY, IC74_FAMILY_OPTIONS, IC_REFS, IC_REF_OPTIONS, icAttrs, icLabel } from './ics.mjs';

export type PartKind =
  | 'mcu'
  | 'led'
  | 'rgb-led'
  | 'pushbutton'
  | 'resistor'
  | 'diode'
  | 'capacitor'
  | 'transistor'
  | 'logic-ic'
  | 'relay'
  | 'fan'
  | 'motor'
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
  | 'hall'
  | 'servo'
  | 'patte'
  | 'araignee'
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
  kind: 'select' | 'number' | 'checkbox' | 'text';
  /** Pour kind 'select' : valeurs proposées. */
  options?: readonly string[];
  /** Libellé affiché (clé i18n) pour certaines valeurs : { valeur → libellé }. */
  optionLabels?: Record<string, string>;
  min?: number;
  max?: number;
  step?: number;
  /** Autorise les suffixes SI (p n µ m k M G) dans la valeur (champ texte). */
  suffixes?: boolean;
  /** Pour kind 'text' : nombre de lignes de la zone de saisie (défaut 2). */
  rows?: number;
  /**
   * Nombre qu'on TAPE, pas qu'on ajuste : petite case de deux caractères, SANS
   * la toupie du navigateur ni les boutons +/− (v2026.8.68). Un numéro de canal
   * se lit sur la carte et se recopie — les deux façons de l'incrémenter ne
   * servaient qu'à parcourir 16 valeurs une par une.
   */
  compact?: boolean;
  /**
   * Valeur UNIQUE parmi les propriétés du composant portant la même clé : deux
   * servos ne peuvent pas être branchés sur la même sortie du PCA9685. La saisie
   * d'un doublon est refusée par l'inspecteur (le champ revient à sa valeur).
   */
  unique?: string;
  /**
   * Note explicative affichée EN TÊTE de la section repliable (une par groupe,
   * portée par ses propriétés). Sert à dire ce qu'un libellé ne peut pas dire :
   * la plage attendue, la correspondance avec le marquage de la carte…
   */
  groupNote?: string;
  /**
   * Range cette propriété dans une SECTION REPLIABLE de l'inspecteur, titrée par
   * ce libellé (traduisible). Sans groupe, la propriété reste au fil, à sa place.
   * Utile dès qu'un composant en aligne des dizaines (le robot araignée en a 27) :
   * les sections sont repliées à l'ouverture, comme les catégories de la palette.
   */
  group?: string;
  /**
   * C'est LA valeur du composant, celle qui a sa colonne dans la nomenclature.
   * Sans ce drapeau, la valeur est reconnue à son attribut `value` — mais un
   * potentiomètre l'utilise déjà pour la POSITION de son curseur, sa valeur
   * nominale porte donc un autre nom (v2026.7.251).
   */
  isValue?: boolean;
  /**
   * N'affiche cette propriété que si un autre attribut vaut l'une des valeurs
   * données. Plusieurs conditions se cumulent (ET) : le brochage d'un MOSFET,
   * par exemple, n'est réglable que sur un modèle personnalisé ET de la famille
   * MOS.
   */
  showIf?: PropCondition | readonly PropCondition[];
}

/** Une condition d'affichage : « cet attribut vaut l'une de ces valeurs ». */
export interface PropCondition {
  attr: string;
  equals: readonly string[];
}

/** Conditions d'affichage d'une propriété, toujours ramenées à une liste (ET). */
export function propConditions(showIf: PropDef['showIf']): readonly PropCondition[] {
  if (!showIf) return [];
  return Array.isArray(showIf) ? showIf : [showIf as PropCondition];
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
  /**
   * Carte de simulation que ce composant EST : les cartes nues (kind 'mcu'),
   * mais aussi un ensemble qui embarque la sienne — le robot araignée porte une
   * Pico W. Poser le composant choisit cette carte comme cible de simulation.
   */
  board?: BoardId;
  /** Attributs par défaut posés sur l'élément. */
  attrs?: Record<string, string>;
  /** Propriétés modifiables dans l'éditeur de composants. */
  props?: readonly PropDef[];
  /** Composant interactif (bouton, potentiomètre…) : déplacé par son bandeau uniquement. */
  interactive?: boolean;
  /**
   * Composant SANS aucune broche : rien à lui câbler. Le robot araignée est le
   * premier (v2026.8.24) — il porte sa propre carte. Le drapeau sert à écarter,
   * au chargement d'un vieux schéma, les fils qui visaient des broches
   * disparues ; il se lit sur la DÉFINITION et non sur l'élément, dont le
   * `pinInfo` peut n'arriver qu'après le rendu.
   */
  pinless?: boolean;
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
    /** Fiche d'aide embarquée dans le .kompix (bouton « Aide du composant »). */
    hasHelp?: boolean;
  };
  /**
   * Variante d'un composant déjà listé : le type reste parfaitement valide
   * (projets enregistrés, import Wokwi, tests) mais n'apparaît PAS dans la
   * palette — on le choisit dans les propriétés du composant listé. Les trois
   * condensateurs sont ainsi un seul élément dont `ctype` change l'habillage.
   */
  variant?: boolean;
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
  /** Le paquet .kompix embarque une fiche d'aide : l'inspecteur montre alors son
   *  bouton « Aide du composant ». Le texte reste côté extension. */
  hasHelp?: boolean;
  /** Script behavior.mjs embarqué (optionnel) : comportement de simulation. */
  behaviorScript?: string;
  /** Métadonnées provenance + confiance (kompix uniquement, Lot 2). */
  kompixMeta?: {
    origin: 'local' | 'remote';
    sourceUrl?: string;
    behaviorHash?: string;
    behaviorAccepted?: boolean;
  };
}

const STATE_PROP: PropDef = { attr: 'state', label: 'State (0/1)', kind: 'select', options: ['0', '1'] };
const VALUE_PROP: PropDef = { attr: 'value', label: 'Position (%)', kind: 'number', min: 0, max: 100, step: 1 };
// Potentiomètres : `value` est la POSITION du curseur (0-100 %, c'est l'attribut
// de l'élément), la valeur nominale du composant est la résistance TOTALE entre
// ses deux extrémités — celle qu'on lit sur le boîtier et qu'on achète, d'où sa
// place dans la nomenclature (Frank, v2026.7.251).
const POT_PROPS: readonly PropDef[] = [
  {
    attr: 'ohms', label: 'Nominal value (Ω)', kind: 'number',
    min: 1, max: 10_000_000, step: 1, suffixes: true, isValue: true,
  },
  VALUE_PROP,
];
// Seuil de bascule DOUT des capteurs à double sortie (flamme, gaz, son, lumière).
const SENSITIVITY_PROP: PropDef = { attr: 'sensitivity', label: 'Sensitivity (%)', kind: 'number', min: 0, max: 100, step: 1 };
// Propriétés communes aux trois condensateurs (le type choisit l'habillage du
// même élément ; la valeur est saisie en farads avec suffixes m µ n p).
const CAPACITOR_PROPS: readonly PropDef[] = [
  {
    // Les noms d'atelier (plastique / tantale / chimique) plutôt que la
    // physique (non polarisé / polarisé) : c'est ainsi qu'on les demande, et
    // c'est ce que la nomenclature doit écrire (Frank, v2026.7.244).
    attr: 'ctype', label: 'Type', kind: 'select', options: ['np', 'p', 'chem'],
    optionLabels: { np: 'Plastic', p: 'Tantalum', chem: 'Electrolytic' },
  },
  { attr: 'value', label: 'Nominal value (F)', kind: 'number', min: 1e-12, max: 1, suffixes: true },
  { attr: 'vmax', label: 'Max voltage (V)', kind: 'number', min: 1, max: 1000, step: 1 },
];
// Prototypes de transistor (NPN/PNP) : boîtier au choix, électrodes affectées
// aux pattes par l'utilisateur (une patte ne peut porter qu'une électrode :
// poser une valeur déjà prise ÉCHANGE les deux), inscription libre du boîtier.
// Sur le composant « Transistor » de la bibliothèque, ces propriétés ne
// s'ouvrent que pour les modèles PERSONNALISÉS (`ref` = custom-npn/custom-pnp) :
// une référence du commerce est figée par sa fiche.
const CUSTOM_ONLY = {
  attr: 'ref',
  equals: ['custom-npn', 'custom-pnp', 'custom-darlington-npn', 'custom-darlington-pnp', 'custom-nmos'],
} as const;
/** Familles bipolaires : elles portent E/B/C et un gain en courant. */
const BIPOLAIRE = { attr: 'symbol', equals: ['npn', 'pnp', 'darlington-npn', 'darlington-pnp'] } as const;
/** MOSFET : électrodes G/D/S, pas de gain mais une résistance de passage. */
const MOS = { attr: 'symbol', equals: ['nmos'] } as const;
const TRANSISTOR_PROPS: readonly PropDef[] = [
  {
    attr: 'pkg', label: 'Package', kind: 'select', options: ['to92', 'to220'],
    optionLabels: { to92: 'TO-92', to220: 'TO-220' },
  },
  { attr: 'e', label: 'Emitter on pin', kind: 'select', options: ['1', '2', '3'], showIf: BIPOLAIRE },
  { attr: 'b', label: 'Base on pin', kind: 'select', options: ['1', '2', '3'], showIf: BIPOLAIRE },
  { attr: 'c', label: 'Collector on pin', kind: 'select', options: ['1', '2', '3'], showIf: BIPOLAIRE },
  { attr: 'g', label: 'Gate on pin', kind: 'select', options: ['1', '2', '3'], showIf: MOS },
  { attr: 'd', label: 'Drain on pin', kind: 'select', options: ['1', '2', '3'], showIf: MOS },
  { attr: 's', label: 'Source on pin', kind: 'select', options: ['1', '2', '3'], showIf: MOS },
  { attr: 'gain', label: 'Current gain (β)', kind: 'number', min: 0.1, step: 0.1, showIf: BIPOLAIRE },
  { attr: 'rdson', label: 'Rds(on) (Ω)', kind: 'number', min: 0.001, max: 100, step: 0.01, showIf: MOS },
  // Inscription du boîtier : trois lignes visibles d'emblée (une référence tient
  // rarement sur deux), le champ reste libre — chaque ligne saisie est une ligne
  // écrite sur la face plate.
  { attr: 'text', label: 'Marking', kind: 'text', rows: 3 },
  // Même attribut, deux libellés : le catalogue ne dit pas « Vce » à un MOSFET.
  { attr: 'vcemax', label: 'Max Vce (V)', kind: 'number', min: 1, max: 1000, step: 1, showIf: BIPOLAIRE },
  { attr: 'vcemax', label: 'Max Vds (V)', kind: 'number', min: 1, max: 1000, step: 1, showIf: MOS },
  { attr: 'icmax', label: 'Max Ic (A)', kind: 'number', min: 0.001, max: 100, suffixes: true, showIf: BIPOLAIRE },
  { attr: 'icmax', label: 'Max Id (A)', kind: 'number', min: 0.001, max: 100, suffixes: true, showIf: MOS },
];
/**
 * Mêmes propriétés, mais réservées aux modèles personnalisés du sélecteur : une
 * référence du commerce est figée par sa fiche. La condition « personnalisé »
 * s'AJOUTE à celle de la famille.
 */
const CUSTOM_TRANSISTOR_PROPS: readonly PropDef[] = TRANSISTOR_PROPS.map((p) => ({
  ...p,
  showIf: p.showIf ? [CUSTOM_ONLY, ...(Array.isArray(p.showIf) ? p.showIf : [p.showIf])] : CUSTOM_ONLY,
}));
// Circuits intégrés logiques : la référence reste changeable dans les propriétés
// (le boîtier est le même, seul le brochage suit). La FAMILLE ne concerne que la
// série 74 — elle y remplace le « xx » de la référence et décide de la plage
// d'alimentation, donc de la compatibilité avec la carte (un 74LS08 ne marche
// pas sous les 3,3 V d'une Pico, un 74HC08 si).
const IC_PROPS: readonly PropDef[] = [
  {
    attr: 'ref', label: 'Model', kind: 'select', options: IC_REF_OPTIONS, isValue: true,
  },
  {
    attr: 'family', label: '74 series family', kind: 'select', options: IC74_FAMILY_OPTIONS,
    showIf: { attr: 'ref', equals: IC_REFS.filter((r) => r.series === '74').map((r) => r.ref) },
  },
];
/**
 * Une entrée de bibliothèque par référence : le type est la référence en
 * minuscules (`cd4081`, `74xx08`), le libellé « CD4081 quad 2-input AND gate ».
 * Changer la référence dans les propriétés ne change PAS le type — c'est le jeu
 * d'attributs qui suit (`icAttrs`), comme le modèle d'un transistor.
 */
const IC_CATALOG: readonly PartDef[] = IC_REFS.map((r) => ({
  type: r.ref.toLowerCase(),
  label: icLabel(r.ref),
  tag: 'kablix-ic',
  kind: 'logic-ic' as PartKind,
  attrs: icAttrs(r.ref, DEFAULT_IC74_FAMILY),
  props: IC_PROPS,
}));

/**
 * Adresse I²C réglée COMME SUR LA CARTE : six pads soudables AD0..AD5 (cases à
 * cocher de l'inspecteur, cochée = pad HAUT = 1). Servent au PCA9685 nu comme au
 * robot araignée, qui en embarque un — même puce, même façon de l'adresser.
 * D'usine, la carte Grove sort tous pads hauts : 0x7F.
 */
const PCA9685_PAD_ATTRS: Record<string, string> = {
  ad0: '1', ad1: '1', ad2: '1', ad3: '1', ad4: '1', ad5: '1',
};
const PCA9685_PAD_PROPS: readonly PropDef[] = [
  { attr: 'ad0', label: 'AD0 (bit 0)', kind: 'checkbox' },
  { attr: 'ad1', label: 'AD1 (bit 1)', kind: 'checkbox' },
  { attr: 'ad2', label: 'AD2 (bit 2)', kind: 'checkbox' },
  { attr: 'ad3', label: 'AD3 (bit 3)', kind: 'checkbox' },
  { attr: 'ad4', label: 'AD4 (bit 4)', kind: 'checkbox' },
  { attr: 'ad5', label: 'AD5 (bit 5)', kind: 'checkbox' },
];

/**
 * Sens de rotation inversé, une case par servo. Sur un vrai montage, un servo
 * vissé « tête en bas » part dans l'autre sens pour la même consigne : plutôt
 * que de retourner le code, on le déclare ici et le composant recalcule l'angle
 * affiché en 180 − consigne. Le miroir gauche/droite du châssis, lui, est déjà
 * câblé dans la mécanique (LEGS.mirror) : ces cases sont EN PLUS.
 */
const REVERSE_PROP = (attr: string, label: string): PropDef => ({ attr, label, kind: 'checkbox' });

/**
 * Calage du palonnier, un réglage par servo. Le bras se remonte sur des
 * cannelures : il tombe rarement pile où on voudrait, et sur un châssis les huit
 * servos ne sont pas calés pareil. Ce décalage dit quel angle la pièce DESSINE
 * quand le programme envoie 0° — un tour complet de chaque côté (±360°), comme
 * demandé. Il s'ajoute APRÈS l'inversion (`revXXX`) : les deux réglages se
 * cumulent, l'un donne le sens, l'autre l'origine.
 */
const ZERO_PROP = (attr: string, label: string): PropDef =>
  ({ attr, label, kind: 'number', min: -360, max: 360, step: 1 });

/**
 * Canal du PCA9685 sur lequel une articulation est câblée. Le robot est monté à
 * la main : rien n'oblige la coxa avant-gauche à finir sur le canal 0. Ce réglage
 * dit où chaque servo est BRANCHÉ, sans toucher au programme. La carte a 16
 * sorties (0..15), les huit autres restent libres pour un ajout.
 *
 * Case de deux caractères (`compact`) : on RECOPIE le numéro lu sur la carte.
 * Et le même canal ne se saisit pas deux fois (`unique`) — sur un vrai montage,
 * deux servos sur une sortie bougeraient ensemble, ce n'est jamais ce qu'on veut
 * ici. Aucune valeur par défaut : un câblage se déclare, il ne se devine pas.
 */
const CHANNEL_PROP = (attr: string, label: string): PropDef =>
  ({ attr, label, kind: 'number', min: 0, max: 15, step: 1, compact: true, unique: 'pca-channel' });

/**
 * Range une liste de propriétés dans la même section repliable de l'inspecteur.
 * `note` : phrase d'explication posée en tête de la section (facultative).
 */
const grouped = (group: string, props: readonly PropDef[], note?: string): readonly PropDef[] =>
  props.map((p) => ({ ...p, group, ...(note ? { groupNote: note } : {}) }));

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
    type: 'resistor', label: 'Resistor', tag: 'kablix-resistor', kind: 'resistor',
    attrs: { value: '220', orientation: 'h' },
    props: [
      { attr: 'value', label: 'Value (Ω)', kind: 'number', min: 1, max: 10_000_000, step: 1, suffixes: true },
      // Pose du composant : couchée (deux pattes écartées de 60 px) ou DEBOUT
      // (corps vertical, une patte repliée par-dessus, pattes à 20 px). Change
      // le dessin, la boîte, la position des broches et le schéma interne.
      {
        // Libellé « Mounting » et pas « Orientation » : la barre de rotation de
        // l'inspecteur porte déjà ce mot-là.
        attr: 'orientation', label: 'Mounting', kind: 'select', options: ['h', 'v'],
        optionLabels: { h: 'Horizontal', v: 'Vertical' },
      },
    ],
  },
  // Diode de redressement (dessin de Frank, Composants.svg) : elle ne laisse
  // passer le courant que de A vers K, en perdant sa tension de seuil. Sens
  // bloqué = le niveau ne se propage pas (netLevel, graphe résistif orienté).
  {
    type: 'diode', label: 'Diode', tag: 'kablix-diode', kind: 'diode', attrs: { vf: '0.6' },
    props: [
      { attr: 'vf', label: 'Threshold voltage (V)', kind: 'number', min: 0, max: 5, step: 0.1 },
    ],
  },
  // Condensateurs (dessins de Frank) : trois habillages d'un même élément
  // <kablix-capacitor>, broches '1'/'2' communes (l'éditeur affiche « − »/« + »
  // sur les polarisés). En série avec une résistance, la tension à leurs bornes
  // suit la charge/décharge exponentielle (capacitorNodes, model.mts).
  // UNE seule entrée dans la palette : le type (film / tantale / chimique) se
  // choisit dans les propriétés. Les deux autres restent des types valides pour
  // les projets déjà enregistrés — d'où `variant`.
  {
    type: 'condo-np', label: 'Capacitor', tag: 'kablix-capacitor', kind: 'capacitor',
    attrs: { ctype: 'np', value: '1e-7', vmax: '400' }, props: CAPACITOR_PROPS,
  },
  {
    type: 'condo-p-1', label: 'Capacitor (tantalum)', tag: 'kablix-capacitor', kind: 'capacitor',
    variant: true, attrs: { ctype: 'p', value: '1e-5', vmax: '16' }, props: CAPACITOR_PROPS,
  },
  {
    type: 'condo-p-2', label: 'Capacitor (electrolytic)', tag: 'kablix-capacitor', kind: 'capacitor',
    variant: true, attrs: { ctype: 'chem', value: '1e-4', vmax: '16' }, props: CAPACITOR_PROPS,
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
    attrs: { min: '0', max: '100', value: '50', ohms: '10000' }, interactive: true,
    props: POT_PROPS,
  },
  {
    type: 'slide-pot', label: 'Slide potentiometer', tag: 'kablix-slide-potentiometer', kind: 'potentiometer',
    attrs: { min: '0', max: '100', value: '50', ohms: '10000' }, interactive: true,
    props: POT_PROPS,
  },
  {
    // Ajustable (trimmer) : même modèle électrique que le potentiomètre, mais
    // il se règle au tournevis et porte sa valeur en CODE à trois chiffres —
    // celui-ci est écrit sur le boîtier d'après `ohms` (dessin de Frank).
    type: 'pot-rot2', label: 'Trimmer potentiometer', tag: 'kablix-pot-rot2', kind: 'potentiometer',
    attrs: { min: '0', max: '100', value: '50', ohms: '10000' }, interactive: true,
    props: POT_PROPS,
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
  // Capteur à effet Hall (dessin de Frank) : BOÎTIER PARTAGÉ TO92S. Sortie à
  // drain ouvert, donc INUTILISABLE sans rappel au plus (résistance vers VCC ou
  // rappel interne du µC) — le moteur le vérifie et l'explique (hallStates).
  // En simulation, un aimant glissant à droite du boîtier fait commuter la
  // sortie sous la distance de déclenchement (simControl : `el.near`).
  {
    type: 'hall', label: 'Hall effect sensor', tag: 'kablix-hall', kind: 'hall',
    digitalPin: 'S', simControl: true,
    attrs: { text: 'Hall', vplus: '1', gnd: '2', s: '3', trigger: '10', distance: '20' },
    props: [
      { attr: 'text', label: 'Marking', kind: 'text', rows: 2 },
      { attr: 'vplus', label: 'V+ pin', kind: 'select', options: ['1', '2', '3'] },
      { attr: 'gnd', label: 'GND pin', kind: 'select', options: ['1', '2', '3'] },
      { attr: 's', label: 'S (output) pin', kind: 'select', options: ['1', '2', '3'] },
      { attr: 'trigger', label: 'Trigger distance (mm)', kind: 'number', min: 1, max: 25, step: 1 },
    ],
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
  // Ventilateur (dessin de Frank, Composants.svg — l'hélice `ventilo-helices`
  // tourne autour de l'axe du moyeu). Commandé en PWM ou en tension continue ; il
  // ne démarre que si la source peut FOURNIR le courant demandé (fanState).
  {
    type: 'ventilo', label: 'Fan', tag: 'kablix-ventilo', kind: 'fan',
    attrs: { voltage: '5', current: '0.85' },
    props: [
      { attr: 'voltage', label: 'Rated voltage (V)', kind: 'number', min: 1, max: 24, step: 0.1 },
      { attr: 'current', label: 'Current draw (A)', kind: 'number', min: 0.001, max: 5, suffixes: true },
    ],
  },
  // Moteur à courant continu (dessin de Frank — le pignon `moteurDC-axe-rotatif`
  // tourne autour de son axe). Sa vitesse suit la TENSION appliquée ; il ne
  // démarre pas si la source ne fournit pas son courant, et il GRILLE au-delà de
  // 1,5 fois sa tension nominale. Une diode de roue libre est obligatoire quand
  // il est commandé par un transistor (motorStates).
  {
    type: 'moteur-dc', label: 'DC motor', tag: 'kablix-moteur-dc', kind: 'motor',
    attrs: { voltage: '5', current: '0.2' },
    props: [
      { attr: 'voltage', label: 'Rated voltage (V)', kind: 'number', min: 1, max: 24, step: 0.1 },
      { attr: 'current', label: 'No-load current (A)', kind: 'number', min: 0.001, max: 5, suffixes: true },
    ],
  },
  // Transistors bipolaires (dessin de Frank) : premier BOÎTIER PARTAGÉ. Le même
  // dessin externe (to92) sert à tous, seule l'inscription change ; le symbole
  // interne (npn/pnp) et le gain viennent du modèle. `named` = référence figée,
  // pattes nommées E/B/C ; sans lui, pattes 1/2/3 et électrodes réglables.
  // UNE seule entrée dans la palette : la référence se choisit dans les
  // propriétés (sélecteur à critères, transistors.mts). Elle garde TOUJOURS
  // `named` — changer de modèle recâble le dessin, jamais les noms de broches,
  // donc aucun fil ne devient orphelin. `ref` vide = modèle pas encore choisi.
  {
    type: 'transistor', label: 'Transistor', tag: 'kablix-transistor', kind: 'transistor',
    attrs: {
      pkg: 'to92', symbol: 'npn', schema: 'npn1', text: '?', named: '1', ref: '',
      e: '1', b: '2', c: '3', g: '1', d: '2', s: '3',
      gain: '100', rdson: '0.5', vcemax: '40', icmax: '0.6',
    },
    props: CUSTOM_TRANSISTOR_PROPS,
  },
  // Les trois entrées d'origine restent des types VALIDES (projets enregistrés,
  // tests, import Wokwi) mais sortent de la bibliothèque — d'où `variant`.
  {
    type: 'pn2222a', label: 'Transistor PN2222A (NPN)', tag: 'kablix-transistor', kind: 'transistor',
    variant: true,
    attrs: {
      pkg: 'to92', symbol: 'npn', text: 'PN\n2222A', named: '1',
      e: '1', b: '2', c: '3', gain: '35', vcemax: '40', icmax: '0.6',
    },
  },
  {
    type: 'npn', label: 'Transistor NPN (generic)', tag: 'kablix-transistor', kind: 'transistor',
    variant: true,
    attrs: {
      pkg: 'to92', symbol: 'npn', text: 'NPN',
      e: '1', b: '2', c: '3', gain: '100', vcemax: '40', icmax: '0.6',
    },
    props: TRANSISTOR_PROPS,
  },
  {
    type: 'pnp', label: 'Transistor PNP (generic)', tag: 'kablix-transistor', kind: 'transistor',
    variant: true,
    attrs: {
      pkg: 'to92', symbol: 'pnp', text: 'PNP',
      e: '1', b: '2', c: '3', gain: '100', vcemax: '40', icmax: '0.6',
    },
    props: TRANSISTOR_PROPS,
  },
  // Circuits intégrés logiques (dessins de Frank) : DEUXIÈME boîtier partagé, et
  // le plus partagé de tous — un seul dessin de DIL-14 pour les onze références
  // (`ics.mts`), une entrée de bibliothèque chacune.
  ...IC_CATALOG,
  // Relais OMRON G5V (dessin de Frank) : bobine B1/B2, contact Com/NF/NO. La
  // tension de commande est inscrite sur le boîtier ; sous le seuil, le relais
  // ne colle pas. Diode de roue libre obligatoire entre B1 et B2 (relayStates).
  {
    type: 'relais', label: 'Relay OMRON G5V', tag: 'kablix-relais', kind: 'relay',
    attrs: { voltage: '5' },
    props: [
      {
        attr: 'voltage', label: 'Coil voltage (V)', kind: 'select',
        options: ['3', '5', '6', '9', '12', '24'],
      },
    ],
  },

  // --- Composants supplémentaires (forkés du catalogue Wokwi).
  // Afficheur LCD texte unifié (HD44780). Un seul élément `kablix-lcd1602` couvre
  // les 4 variantes : il se dimensionne sur cols/rows et change ses broches via
  // `pins` (i2c = 4 fils GND/VCC/SDA/SCL ; full = parallèle). Le texte n'est simulé
  // qu'en I²C (Lcd1602Device) ; en parallèle l'afficheur reste visuel.
  {
    type: 'lcd', label: 'Text LCD', tag: 'kablix-lcd1602', kind: 'i2c-lcd',
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
  // min/max et température de départ réglées dans l'inspecteur ; distance mesurée
  // ET température de l'air choisies EN SIMULATION par deux curseurs (simControl).
  // La température fixe la vitesse du son, donc la durée de l'écho.
  {
    type: 'hcsr04', label: 'Ultrasonic sensor', tag: 'kablix-hc-sr04', kind: 'ultrasonic',
    attrs: { distancemin: '2', distancemax: '400', temperature: '20' },
    simControl: true,
    props: [
      { attr: 'distancemin', label: 'Min distance (cm)', kind: 'number', min: 0, max: 400, step: 1 },
      { attr: 'distancemax', label: 'Max distance (cm)', kind: 'number', min: 1, max: 400, step: 1 },
      { attr: 'temperature', label: 'Air temperature (°C)', kind: 'number', min: -20, max: 60, step: 1 },
    ],
  },
  // Capteur de température/humidité DHT22 (1-wire sur DATA) : répond au protocole
  // réel. Température/humidité réglées EN SIMULATION par deux curseurs (simControl).
  {
    type: 'dht22', label: 'Temp/humidity sensor (DHT22)', tag: 'kablix-dht22', kind: 'passive',
    simControl: true, attrs: { model: 'dht22', temperature: '22', humidity: '50' },
    props: [],
  },
  // DHT11 : même élément, même protocole, boîtier et plages différents (dessin
  // de Frank, Composants.svg). Précision ±2 °C / ±5 %HR, résolution 1 °C /
  // 1 %HR (trame à décimales nulles), mesure de 0 à +50 °C et de 20 à 90 %HR.
  {
    type: 'dht11', label: 'Temp/humidity sensor (DHT11)', tag: 'kablix-dht11', kind: 'passive',
    simControl: true, attrs: { model: 'dht11', temperature: '22', humidity: '50' },
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
    attrs: { address: '0x7F', ...PCA9685_PAD_ATTRS },
    props: PCA9685_PAD_PROPS,
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
  // Batterie externe USB (dessin de Frank) : source V+/GND comme l'alim de
  // laboratoire (kind 'psu'), mais sortie RÉGULÉE FIXE (pas de bouton). LED1..4
  // (jauge de charge du dessin) s'allument ensemble tant que la simulation
  // tourne (powerbank-element.mts).
  {
    type: 'powerbank', label: 'Power bank', tag: 'kablix-powerbank', kind: 'psu',
    attrs: { voltage: '5', maxcurrent: '2' },
    props: [
      { attr: 'maxcurrent', label: 'Max current supplied (A)', kind: 'number', min: 0.1, max: 10, step: 0.1 },
    ],
  },
  // Patte de robot articulée : le fémur et le tibia DESSINÉS par Frank
  // (assemblages `araignee-patte-*` de Composants3D.svg), montés tout nus et vus
  // en volume — la même patte que celles du robot (v2026.8.48). 2 servos
  // internes (coxa = balayage au sol, patella = lever/baisser), indépendants
  // électriquement mais imbriqués mécaniquement à l'affichage, et un connecteur
  // à deux borniers 3 fils qui dit quel servo se câble où.
  // Mêmes impulsions/vitesse que <kablix-servo> (même formule PWM→angle).
  {
    type: 'patte', label: 'Spider leg', tag: 'kablix-patte', kind: 'patte',
    attrs: {
      pulsemin: '500', pulsemax: '2500', speed: '2', revcoxa: '', revpatella: '',
      zerocoxa: '0', zeropatella: '0',
    },
    props: [
      { attr: 'pulsemin', label: 'Pulse at 0° (µs)', kind: 'number', min: 100, max: 3000, step: 1 },
      { attr: 'pulsemax', label: 'Pulse at 180° (µs)', kind: 'number', min: 100, max: 3000, step: 1 },
      { attr: 'speed', label: 'Rotation time (s/turn)', kind: 'number', min: 0, max: 30, step: 0.1 },
      REVERSE_PROP('revcoxa', 'Reverse the coxa servo'),
      REVERSE_PROP('revpatella', 'Reverse the patella servo'),
      ZERO_PROP('zerocoxa', 'Coxa angle at 0° (horn offset)'),
      ZERO_PROP('zeropatella', 'Patella angle at 0° (horn offset)'),
    ],
  },
  // Robot araignée quadrupède complet, DESSINÉ par Frank (les trois assemblages
  // de Composants3D.svg, cf. araignee-element.mts) : corps + 4 pattes
  // (8 articulations, mêmes angles que la patte seule), avec sa Pico W, son
  // PCA9685 et sa batterie EMBARQUÉS.
  // L'électronique embarquée est TOUJOURS dessinée (v2026.8.58) : la case qui la
  // montrait ou la cachait ne servait à rien — le PMMA translucide la laisse voir.
  // AUCUNE CONNECTIQUE depuis la v2026.8.24 (Frank) : le robot porte sa propre
  // carte, c'est LUI qu'on programme. `board: 'picow'` le dit à l'atelier —
  // le déposer choisit la Pico W comme cible, exactement comme on poserait la
  // carte nue. Son PCA9685 embarqué répond sur le bus I²C interne (le moteur le
  // relie aux deux contrôleurs du RP2040 sans dépendre d'un fil), ses canaux
  // pilotant les huit articulations — chacune sur n'importe quelle sortie 0..15
  // (`chcoxaN`/`chpatellaN`), SANS valeur par défaut (v2026.8.68) : un câblage
  // se déclare. Un canal laissé vide est signalé au lancement de la simulation,
  // et son articulation ne bouge pas.
  {
    type: 'araignee', label: 'Spider robot', tag: 'kablix-araignee', kind: 'araignee',
    board: 'picow', pinless: true,
    attrs: {
      address: '0x7F', ...PCA9685_PAD_ATTRS, pulsemin: '500', pulsemax: '2500', speed: '2',
      chcoxa0: '', chpatella0: '', chcoxa1: '', chpatella1: '',
      chcoxa2: '', chpatella2: '', chcoxa3: '', chpatella3: '',
      revcoxa0: '', revpatella0: '', revcoxa1: '', revpatella1: '',
      revcoxa2: '', revpatella2: '', revcoxa3: '', revpatella3: '',
      zerocoxa0: '0', zeropatella0: '0', zerocoxa1: '0', zeropatella1: '0',
      zerocoxa2: '0', zeropatella2: '0', zerocoxa3: '0', zeropatella3: '0',
    },
    // 33 réglages : rangés en CINQ sections repliables (repliées à l'ouverture,
    // v2026.8.64), dans l'ordre où on les touche — l'adresse de la carte d'abord,
    // le câblage puis le montage ensuite, les servos eux-mêmes en dernier.
    // L'adresse I²C calculée, elle, s'affiche tout en haut, hors section : c'est
    // un rappel, pas un réglage.
    props: [
      ...grouped('Configure the 16-servo board', PCA9685_PAD_PROPS),
      ...grouped('Wire the servos', [
        CHANNEL_PROP('chcoxa0', 'Front-left coxa channel'),
        CHANNEL_PROP('chpatella0', 'Front-left patella channel'),
        CHANNEL_PROP('chcoxa1', 'Front-right coxa channel'),
        CHANNEL_PROP('chpatella1', 'Front-right patella channel'),
        CHANNEL_PROP('chcoxa2', 'Rear-left coxa channel'),
        CHANNEL_PROP('chpatella2', 'Rear-left patella channel'),
        CHANNEL_PROP('chcoxa3', 'Rear-right coxa channel'),
        CHANNEL_PROP('chpatella3', 'Rear-right patella channel'),
      ], 'Type the output each servo is plugged into: 0 to 15, marked 1 to 16 on the board. The same channel cannot be used twice, and a servo left empty does not move.'),
      ...grouped('Reverse the servos', [
        REVERSE_PROP('revcoxa0', 'Reverse the front-left coxa'),
        REVERSE_PROP('revpatella0', 'Reverse the front-left patella'),
        REVERSE_PROP('revcoxa1', 'Reverse the front-right coxa'),
        REVERSE_PROP('revpatella1', 'Reverse the front-right patella'),
        REVERSE_PROP('revcoxa2', 'Reverse the rear-left coxa'),
        REVERSE_PROP('revpatella2', 'Reverse the rear-left patella'),
        REVERSE_PROP('revcoxa3', 'Reverse the rear-right coxa'),
        REVERSE_PROP('revpatella3', 'Reverse the rear-right patella'),
      ]),
      ...grouped('Set the servo zeros', [
        ZERO_PROP('zerocoxa0', 'Front-left coxa angle at 0°'),
        ZERO_PROP('zeropatella0', 'Front-left patella angle at 0°'),
        ZERO_PROP('zerocoxa1', 'Front-right coxa angle at 0°'),
        ZERO_PROP('zeropatella1', 'Front-right patella angle at 0°'),
        ZERO_PROP('zerocoxa2', 'Rear-left coxa angle at 0°'),
        ZERO_PROP('zeropatella2', 'Rear-left patella angle at 0°'),
        ZERO_PROP('zerocoxa3', 'Rear-right coxa angle at 0°'),
        ZERO_PROP('zeropatella3', 'Rear-right patella angle at 0°'),
      ]),
      // Les huit servos du robot sont les mêmes : une seule échelle d'impulsion
      // pour les huit, comme sur la patte seule.
      ...grouped('Servo parameters', [
        { attr: 'pulsemin', label: 'Pulse at 0° (µs)', kind: 'number', min: 100, max: 3000, step: 1 },
        { attr: 'pulsemax', label: 'Pulse at 180° (µs)', kind: 'number', min: 100, max: 3000, step: 1 },
        { attr: 'speed', label: 'Rotation time (s/turn)', kind: 'number', min: 0, max: 30, step: 0.1 },
      ]),
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

/** Composants PROPOSÉS dans la palette : le catalogue moins les variantes
 *  (`variant`), qu'on choisit dans les propriétés d'un composant déjà listé. */
export const PALETTE_CATALOG: readonly PartDef[] = CATALOG.filter((d) => !d.variant);

// --- Catégories de la palette --------------------------------------------------
/** Catégorie d'affichage d'un composant dans la palette (clé i18n). */
export function partCategory(def: PartDef): string {
  // Composants rangés par type quand le `kind` ne suffit pas à les classer.
  if (def.type === 'dht22' || def.type === 'dht11' || def.type === 'hcsr04') return 'Sensors';
  if (def.type === 'keypad') return 'Controls';
  // Batterie portable (kind 'psu' comme l'alim de laboratoire, mais ce n'est
  // pas un appareil de mesure) : rangée avec les modules divers.
  if (def.type === 'powerbank') return 'Misc';
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
    case 'diode':
    case 'capacitor':
    case 'transistor':
      return 'Passive'; // « Discrets » (composants discrets : R, LED, diode, condo…)
    case 'logic-ic':
      return 'Integrated circuits';
    case 'psu':
      return 'Instruments'; // « Appareils de mesure » : alim de laboratoire…
    case 'spi-sd':
    case 'i2c-pwm':
      return 'Misc'; // « Divers » : modules divers (carte SD, pilote PWM…)
    case 'pushbutton':
    case 'potentiometer':
    case 'slide-switch':
    case 'dip-switch':
    case 'joystick':
    // Un relais est un interrupteur COMMANDÉ : sa place est parmi les
    // commandes, pas parmi les actionneurs (Frank, v2026.7.244).
    case 'relay':
      return 'Controls';
    case 'analog-source':
    case 'digital-source':
    case 'ao-do-sensor':
    case 'hall':
    case 'ultrasonic':
      return 'Sensors';
    case 'buzzer':
    case 'servo':
    case 'fan':
    case 'motor':
      return 'Actuators';
    // Systèmes complets : ce ne sont pas des composants mais des ensembles
    // mécaniques déjà assemblés (patte articulée = 2 servos, araignée = châssis
    // + 4 pattes + PCA9685 + batterie embarqués). Frank, v2026.8.21.
    case 'patte':
    case 'araignee':
      return 'Systems';
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
  'Systems', // « Système » : ensembles assemblés (patte, araignée)
  'Instruments',
  'Misc',
  'Integrated circuits', // « Circuits intégrés » : toujours en dernier (Frank, v2026.7.254)
];

// --- Composants personnalisés (créés par l'utilisateur) -----------------------
const customParts = new Map<string, PartDef>();

/** Modèles de simulation proposés dans le créateur, avec leurs rôles de broches. */
export const CUSTOM_KINDS: ReadonlyArray<{ kind: PartKind; label: string; roles: string[] }> = [
  { kind: 'led', label: 'LED (lit when A=high and K=low)', roles: ['A', 'C'] },
  { kind: 'pushbutton', label: 'Pushbutton (pulls the pin to GND)', roles: ['1.l', '2.l'] },
  { kind: 'resistor', label: 'Resistor (joins its two pins)', roles: ['1', '2'] },
  { kind: 'buzzer', label: 'Buzzer (active when voltage across 1 and 2)', roles: ['1', '2'] },
  { kind: 'transistor', label: 'Bipolar transistor (saturated switch C→E)', roles: ['E', 'B', 'C'] },
  { kind: 'relay', label: 'Relay (coil B1/B2 switches Com from NF to NO)', roles: ['B1', 'B2', 'Com', 'NF', 'NO'] },
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

/**
 * Rend un dessin de composant personnalisé MESURABLE : un `<svg>` qui n'a que sa
 * `viewBox` s'étale à la taille de son parent — ici un `inline-block` en
 * `line-height: 0`, donc **0 × 0** : le composant est chargé, posé et câblable,
 * mais invisible (Frank, v2026.8.91 — un projet « enregistré sous » perdait ses
 * composants de bibliothèque à l'écran, ses fils restant en place).
 *
 * La bibliothèque .kompix reconstruit déjà `width`/`height` (v2026.8.89), mais
 * les projets DÉJÀ enregistrés embarquent le dessin tel qu'il était : la
 * réparation doit donc vivre ici, au point de passage de TOUS les composants
 * personnalisés (bibliothèque, .projix, créateur, import).
 *
 * Une dimension explicite en pixels est respectée telle quelle (l'utilisateur a
 * pu vouloir cette échelle) ; seules l'absence et les pourcentages — qui valent
 * 0 dans un parent sans taille — sont corrigés depuis la viewBox.
 */
export function withSvgSize(svg: string | undefined): string | undefined {
  if (!svg) return svg;
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) return svg;
  const tag = open[0];
  const vb = /\bviewBox=["']\s*([-\d.eE]+)[,\s]+([-\d.eE]+)[,\s]+([-\d.eE]+)[,\s]+([-\d.eE]+)\s*["']/i.exec(tag);
  if (!vb) return svg;
  const vbW = Number(vb[3]);
  const vbH = Number(vb[4]);
  if (!(vbW > 0) || !(vbH > 0)) return svg;
  // Une dimension n'est utilisable que si elle est un nombre de pixels (les
  // unités d'Inkscape — mm, cm… — décrivent une feuille, pas le composant).
  const px = (attr: string): number | undefined => {
    const m = new RegExp(`\\b${attr}=["']\\s*([\\d.]+)(px)?\\s*["']`, 'i').exec(tag);
    return m ? Number(m[1]) : undefined;
  };
  const w = px('width');
  const h = px('height');
  if (w !== undefined && h !== undefined) return svg;
  // Une seule dimension connue : l'autre suit le rapport de la viewBox.
  const width = w ?? (h !== undefined ? (h * vbW) / vbH : vbW);
  const height = h ?? (w !== undefined ? (w * vbH) / vbW : vbH);
  const fixed = tag
    .replace(/\s+width=["'][^"']*["']/i, '')
    .replace(/\s+height=["'][^"']*["']/i, '')
    .replace(/^<svg\b/i, `<svg width="${width}" height="${height}"`);
  return svg.replace(tag, fixed);
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
      svg: withSvgSize(data.svg) ?? data.svg,
      pins: data.pins,
      pinRoles: data.pinRoles,
      innerSvg: withSvgSize(data.innerSvg),
      innerOffset: data.innerOffset,
      params: data.params,
      control: data.control,
      category: data.category,
      hasHelp: data.hasHelp,
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
 * L'entrée de catalogue qui correspond à un type de condensateur (`ctype`).
 * Les trois condensateurs sont UN seul élément dont `ctype` change l'habillage :
 * un condensateur posé depuis la palette garde donc le type `condo-np` même
 * devenu tantale ou chimique. La nomenclature doit pourtant écrire le VRAI type
 * (`condo-p-1`, `condo-p-2`), et la tension maximale par défaut n'est pas la
 * même — 400 V pour un plastique, 16 V pour un polarisé.
 */
export function capacitorDefOf(ctype: string): PartDef | undefined {
  return CATALOG.find((p) => p.kind === 'capacitor' && p.attrs?.ctype === ctype);
}

/**
 * Composants dont l'adresse I²C se règle par les six pads AD0..AD5 : le PCA9685
 * nu, et le robot araignée qui en embarque un — même puce, même façon de
 * l'adresser (Frank, v2026.8.24).
 */
export function hasPca9685Pads(def: PartDef): boolean {
  return def.kind === 'i2c-pwm' || def.kind === 'araignee';
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
 * réglage a changé de forme. Aujourd'hui : le PCA9685 et le robot araignée,
 * dont l'adresse était choisie dans une liste (`address`) et se règle maintenant
 * par les six pads AD0..AD5 — les schémas d'avant n'ont pas les `ad*`, on les
 * DÉDUIT de l'adresse enregistrée (0x7F → tous cochés) pour que le montage garde
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
  if (!hasPca9685Pads(def)) return attrs;
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
