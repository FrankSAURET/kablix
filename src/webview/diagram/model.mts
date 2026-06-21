// Modèle de schéma (pur, sans DOM) : composants, fils, calcul de la netlist et
// résolution logique des composants. Entièrement testable hors navigateur.
import { mcuPinRole, mcuPins, partDef, rolePin, type BoardId, type PartKind } from './catalog.mjs';
import { breadboardStrips, normalizeSize } from './breadboard.mjs';

export interface Endpoint {
  partId: string;
  pin: string;
}

export interface Wire {
  id: string;
  a: Endpoint;
  b: Endpoint;
  /** Points intermédiaires (coordonnées canvas) posés pendant le câblage. */
  points?: Array<{ x: number; y: number }>;
  /** Couleur Dupont du fil (identifiant de geometry.DUPONT_COLORS ou hex). */
  color?: string;
  /** Fil implicite créé par l'enfichage d'un composant sur une platine d'essai. */
  auto?: boolean;
}

export interface Part {
  id: string;
  type: string;
  x: number;
  y: number;
  /** Attributs effectifs de l'élément (couleur de LED, valeur de résistance…). */
  attrs?: Record<string, string>;
  /** Rotation en degrés (multiples de 45, sens horaire). */
  rotation?: number;
  /** Retourné sur l'axe horizontal (miroir gauche-droite). */
  flipH?: boolean;
  /** Retourné sur l'axe vertical (miroir haut-bas). */
  flipV?: boolean;
}

export interface Diagram {
  parts: Part[];
  wires: Wire[];
}

const key = (e: Endpoint): string => `${e.partId}/${e.pin}`;

/** Union-find sur les extrémités de broches, avec insertion paresseuse. */
class DSU {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export interface Nets {
  /** Identifiant de net pour une extrémité donnée. */
  netOf(e: Endpoint): string;
}

/**
 * Construit la netlist. Les fils relient les broches ; une résistance se
 * comporte comme un fil entre ses deux pattes (1 ↔ 2) ; une platine d'essai
 * relie les trous de chaque bande (colonnes a–e / f–j et rails).
 */
export function buildNets(diagram: Diagram): Nets {
  const dsu = new DSU();
  for (const wire of diagram.wires) {
    dsu.union(key(wire.a), key(wire.b));
  }
  for (const part of diagram.parts) {
    const kind = partDef(part.type).kind;
    if (kind === 'resistor') {
      dsu.union(`${part.id}/1`, `${part.id}/2`);
    } else if (kind === 'pushbutton') {
      // Les deux pastilles d'une même borne (gauche/droite) sont reliées en interne.
      dsu.union(`${part.id}/1.l`, `${part.id}/1.r`);
      dsu.union(`${part.id}/2.l`, `${part.id}/2.r`);
    } else if (kind === 'breadboard') {
      for (const strip of breadboardStrips(normalizeSize(part.attrs?.size))) {
        for (let i = 1; i < strip.length; i++) {
          dsu.union(`${part.id}/${strip[0]}`, `${part.id}/${strip[i]}`);
        }
      }
    }
  }
  return { netOf: (e) => dsu.find(key(e)) };
}

/** Niveau logique d'un net : 1 (haut/VCC), 0 (bas/GND) ou undefined (flottant). */
export type Level = 0 | 1 | undefined;

/** Microcontrôleurs présents dans le schéma, avec leur carte. */
function mcuParts(diagram: Diagram): Array<{ part: Part; board: BoardId }> {
  const out: Array<{ part: Part; board: BoardId }> = [];
  for (const part of diagram.parts) {
    const def = partDef(part.type);
    if (def.kind === 'mcu' && def.board) out.push({ part, board: def.board });
  }
  return out;
}

/**
 * Détermine le niveau d'un net en parcourant toutes les broches MCU qui s'y
 * rattachent. GND est prioritaire sur VCC, lui-même prioritaire sur les broches
 * pilotées par le microcontrôleur.
 */
function netLevel(
  diagram: Diagram,
  nets: Nets,
  netId: string,
  readPin: (name: string) => boolean
): Level {
  let mcuLevel: Level;
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      const role = mcuPinRole(board, pin);
      if (role.role === 'gnd') return 0;
      if (role.role === 'vcc') return 1;
      if (role.role === 'digital' && role.name) mcuLevel = readPin(role.name) ? 1 : 0;
    }
  }
  return mcuLevel;
}

function partType(diagram: Diagram, partId: string): string {
  return diagram.parts.find((p) => p.id === partId)?.type ?? '';
}

/** Une LED est allumée si son anode est au niveau haut et sa cathode au niveau bas. */
export function ledOn(
  diagram: Diagram,
  ledId: string,
  readPin: (name: string) => boolean
): boolean {
  const type = partType(diagram, ledId);
  const nets = buildNets(diagram);
  const anode = netLevel(diagram, nets, nets.netOf({ partId: ledId, pin: rolePin(type, 'A') }), readPin);
  const cathode = netLevel(diagram, nets, nets.netOf({ partId: ledId, pin: rolePin(type, 'C') }), readPin);
  return anode === 1 && cathode === 0;
}

/**
 * État des trois canaux d'une LED RGB. Selon l'attribut `common` (cathode par
 * défaut, ou anode) la logique s'inverse :
 *  - cathode commune : un canal est allumé si sa broche (R/G/B) est HAUTE et COM BAS ;
 *  - anode commune   : un canal est allumé si sa broche (R/G/B) est BASSE et COM HAUT.
 */
export function rgbLedState(
  diagram: Diagram,
  partId: string,
  readPin: (name: string) => boolean
): { red: boolean; green: boolean; blue: boolean } {
  const nets = buildNets(diagram);
  const level = (pin: string): Level =>
    netLevel(diagram, nets, nets.netOf({ partId, pin }), readPin);
  const com = level('COM');
  const commonAnode = diagram.parts.find((p) => p.id === partId)?.attrs?.common === 'anode';
  const lit = (pin: string): boolean =>
    commonAnode ? level(pin) === 0 && com === 1 : level(pin) === 1 && com === 0;
  return { red: lit('R'), green: lit('G'), blue: lit('B') };
}

/** Un buzzer est actif quand une tension existe entre ses deux broches. */
export function buzzerOn(
  diagram: Diagram,
  partId: string,
  readPin: (name: string) => boolean
): boolean {
  const type = partType(diagram, partId);
  const nets = buildNets(diagram);
  const a = netLevel(diagram, nets, nets.netOf({ partId, pin: rolePin(type, '1') }), readPin);
  const b = netLevel(diagram, nets, nets.netOf({ partId, pin: rolePin(type, '2') }), readPin);
  return (a === 1 && b === 0) || (a === 0 && b === 1);
}

/**
 * Segments allumés d'un afficheur 7 segments (1 chiffre) : ordre A,B,C,D,E,F,G,DP
 * — compatible avec la propriété `values` de wokwi-7segment. Le commun est la
 * broche COM.1/COM.2 de l'élément Wokwi (le modèle 1 chiffre n'a pas de DIG1).
 * Selon l'attribut `common` (cathode par défaut, ou anode) la logique s'inverse :
 *  - cathode commune : segment allumé si sa broche est HAUTE et le commun BAS ;
 *  - anode commune   : segment allumé si sa broche est BASSE et le commun HAUT.
 */
export function sevenSegmentState(
  diagram: Diagram,
  partId: string,
  readPin: (name: string) => boolean
): number[] {
  const nets = buildNets(diagram);
  const level = (pin: string): Level =>
    netLevel(diagram, nets, nets.netOf({ partId, pin }), readPin);
  const common = level('COM.1') ?? level('COM.2') ?? level('COM') ?? level('DIG1');
  const commonAnode = diagram.parts.find((p) => p.id === partId)?.attrs?.common === 'anode';
  return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].map((seg) => {
    const s = level(seg);
    return commonAnode ? (s === 0 && common === 1 ? 1 : 0) : (s === 1 && common === 0 ? 1 : 0);
  });
}

/** LED allumées d'une barre de 10 LED (anodes A1..A10, cathodes C1..C10). */
export function ledBarState(
  diagram: Diagram,
  partId: string,
  readPin: (name: string) => boolean
): number[] {
  const nets = buildNets(diagram);
  const level = (pin: string): Level =>
    netLevel(diagram, nets, nets.netOf({ partId, pin }), readPin);
  return Array.from({ length: 10 }, (_, i) =>
    level(`A${i + 1}`) === 1 && level(`C${i + 1}`) === 0 ? 1 : 0
  );
}

export interface ButtonBinding {
  partId: string;
  /** Broche numérique du MCU pilotée par ce bouton (mise à LOW à l'appui). */
  mcuPin: string;
}

/**
 * Repère les boutons câblés entre une broche du MCU et la masse : appuyer
 * tire la broche à LOW (le programme active typiquement le pull-up interne).
 */
export function buttonBindings(diagram: Diagram): ButtonBinding[] {
  const nets = buildNets(diagram);
  const bindings: ButtonBinding[] = [];

  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'pushbutton') continue;
    const netA = nets.netOf({ partId: part.id, pin: rolePin(part.type, '1.l') });
    const netB = nets.netOf({ partId: part.id, pin: rolePin(part.type, '2.l') });

    const mcuA = mcuDigitalOnNet(diagram, nets, netA);
    const mcuB = mcuDigitalOnNet(diagram, nets, netB);
    const gndA = netHasGnd(diagram, nets, netA);
    const gndB = netHasGnd(diagram, nets, netB);

    if (mcuA && gndB) bindings.push({ partId: part.id, mcuPin: mcuA });
    else if (mcuB && gndA) bindings.push({ partId: part.id, mcuPin: mcuB });
  }
  return bindings;
}

export interface SwitchBinding {
  partId: string;
  mcuPin: string;
  /** Pour l'interrupteur à glissière : côté relié (broche 1 ou 3). */
  side?: 1 | 3;
  /** Pour le DIP switch : numéro de canal (1..8). */
  channel?: number;
}

/**
 * Interrupteurs à glissière câblés [broche 1 ou 3] ↔ MCU avec le commun (2)
 * à la masse : la broche MCU est tirée à LOW quand l'interrupteur connecte
 * ce côté.
 */
export function slideSwitchBindings(diagram: Diagram): SwitchBinding[] {
  const nets = buildNets(diagram);
  const bindings: SwitchBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'slide-switch') continue;
    const common = nets.netOf({ partId: part.id, pin: '2' });
    if (!netHasGnd(diagram, nets, common)) continue;
    for (const side of [1, 3] as const) {
      const mcuPin = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: String(side) }));
      if (mcuPin) bindings.push({ partId: part.id, mcuPin, side });
    }
  }
  return bindings;
}

/** Canaux de DIP switch câblés [na ↔ MCU, nb ↔ GND] (ou l'inverse). */
export function dipSwitchBindings(diagram: Diagram): SwitchBinding[] {
  const nets = buildNets(diagram);
  const bindings: SwitchBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'dip-switch') continue;
    for (let ch = 1; ch <= 8; ch++) {
      const netA = nets.netOf({ partId: part.id, pin: `${ch}a` });
      const netB = nets.netOf({ partId: part.id, pin: `${ch}b` });
      const mcuA = mcuDigitalOnNet(diagram, nets, netA);
      const mcuB = mcuDigitalOnNet(diagram, nets, netB);
      if (mcuA && netHasGnd(diagram, nets, netB)) bindings.push({ partId: part.id, mcuPin: mcuA, channel: ch });
      else if (mcuB && netHasGnd(diagram, nets, netA)) bindings.push({ partId: part.id, mcuPin: mcuB, channel: ch });
    }
  }
  return bindings;
}

export interface JoystickBinding {
  partId: string;
  /** Axes analogiques reliés (VERT/HORZ) et bouton SEL. */
  vert?: string;
  horz?: string;
  sel?: string;
}

/** Joysticks dont les sorties VERT/HORZ/SEL sont reliées au MCU. */
export function joystickBindings(diagram: Diagram): JoystickBinding[] {
  const nets = buildNets(diagram);
  const bindings: JoystickBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'joystick') continue;
    const analogOn = (pin: string): string | undefined =>
      mcuAnalogOnNet(diagram, nets, nets.netOf({ partId: part.id, pin })) ?? undefined;
    const binding: JoystickBinding = {
      partId: part.id,
      vert: analogOn('VERT'),
      horz: analogOn('HORZ'),
      sel: mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: 'SEL' })) ?? undefined,
    };
    if (binding.vert || binding.horz || binding.sel) bindings.push(binding);
  }
  return bindings;
}

export interface SourceBinding {
  partId: string;
  mcuPin: string;
}

/** Sources numériques (PIR, capteur d'inclinaison…) reliées à une broche MCU. */
export function digitalSourceBindings(diagram: Diagram): SourceBinding[] {
  const nets = buildNets(diagram);
  const bindings: SourceBinding[] = [];
  for (const part of diagram.parts) {
    const def = partDef(part.type);
    if (def.kind !== 'digital-source' || !def.digitalPin) continue;
    const mcuPin = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: def.digitalPin }));
    if (mcuPin) bindings.push({ partId: part.id, mcuPin });
  }
  return bindings;
}

/** Sources analogiques (photorésistance…) reliées à une entrée analogique. */
export function analogSourceBindings(diagram: Diagram): SourceBinding[] {
  const nets = buildNets(diagram);
  const bindings: SourceBinding[] = [];
  for (const part of diagram.parts) {
    const def = partDef(part.type);
    if (def.kind !== 'analog-source' || !def.analogPin) continue;
    const mcuPin = mcuAnalogOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: def.analogPin }));
    if (mcuPin) bindings.push({ partId: part.id, mcuPin });
  }
  return bindings;
}

/** Servomoteurs dont l'entrée PWM est reliée à une broche MCU. */
export function servoBindings(diagram: Diagram): SourceBinding[] {
  const nets = buildNets(diagram);
  const bindings: SourceBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'servo') continue;
    const mcuPin = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: 'PWM' }));
    if (mcuPin) bindings.push({ partId: part.id, mcuPin });
  }
  return bindings;
}

/** Buzzers dont une borne (1 ou 2) est reliée à une broche numérique du MCU. */
export function buzzerBindings(diagram: Diagram): SourceBinding[] {
  const nets = buildNets(diagram);
  const bindings: SourceBinding[] = [];
  for (const part of diagram.parts) {
    const type = part.type;
    if (partDef(type).kind !== 'buzzer') continue;
    const p1 = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: rolePin(type, '1') }));
    const p2 = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: rolePin(type, '2') }));
    const mcuPin = p1 ?? p2;
    if (mcuPin) bindings.push({ partId: part.id, mcuPin });
  }
  return bindings;
}

export interface Pca9685Binding {
  /** Identifiant du PCA9685. */
  partId: string;
  /** Canaux reliés à un composant pilotable (servo, LED, buzzer). */
  channels: Array<{ ch: number; targetId: string; targetKind: PartKind }>;
}

/**
 * Pour chaque PCA9685, repère les canaux PWM0..15 reliés à un composant
 * pilotable. La cible est trouvée parmi les extrémités de fils partageant le net
 * du canal (câblage direct ou via platine).
 */
export function pca9685Bindings(diagram: Diagram): Pca9685Binding[] {
  const nets = buildNets(diagram);
  const kindOf = (id: string): PartKind => {
    const p = diagram.parts.find((q) => q.id === id);
    return p ? partDef(p.type).kind : 'passive';
  };
  const out: Pca9685Binding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'i2c-pwm') continue;
    const channels: Pca9685Binding['channels'] = [];
    for (let ch = 0; ch < 16; ch++) {
      const net = nets.netOf({ partId: part.id, pin: `PWM${ch}` });
      let found: { ch: number; targetId: string; targetKind: PartKind } | null = null;
      for (const w of diagram.wires) {
        for (const ep of [w.a, w.b]) {
          if (ep.partId === part.id || nets.netOf(ep) !== net) continue;
          const k = kindOf(ep.partId);
          if (k === 'servo' || k === 'led' || k === 'buzzer') {
            found = { ch, targetId: ep.partId, targetKind: k };
            break;
          }
        }
        if (found) break;
      }
      if (found) channels.push(found);
    }
    if (channels.length > 0) out.push({ partId: part.id, channels });
  }
  return out;
}

export interface UltrasonicBinding {
  partId: string;
  /** Broche MCU pilotant TRIG (sortie MCU → entrée capteur). */
  trig: string;
  /** Broche MCU lisant ECHO (sortie capteur → entrée MCU). */
  echo: string;
}

/** Capteurs ultrason (HC-SR04) dont TRIG et ECHO sont reliés à des broches MCU. */
export function ultrasonicBindings(diagram: Diagram): UltrasonicBinding[] {
  const nets = buildNets(diagram);
  const bindings: UltrasonicBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'ultrasonic') continue;
    const trig = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: rolePin(part.type, 'TRIG') }));
    const echo = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: rolePin(part.type, 'ECHO') }));
    if (trig && echo) bindings.push({ partId: part.id, trig, echo });
  }
  return bindings;
}

export interface SpiDeviceBinding {
  partId: string;
  /** Type du composant (spi-oled, spi-tft, spi-sd…). */
  kind: PartKind;
  /** Broche MCU reliée à D/C (commande/donnée), si applicable et câblée. */
  dcPin: string | null;
  /** Broche MCU reliée à CS (sélection, actif bas), si câblée. */
  csPin: string | null;
}

/** Broche MCU reliée à une broche nommée d'un composant (ou null). */
function mcuPinForPart(diagram: Diagram, nets: Nets, partId: string, pin: string): string | null {
  return mcuDigitalOnNet(diagram, nets, nets.netOf({ partId, pin }));
}

/**
 * Périphériques SPI du schéma (écran OLED/TFT, carte SD) avec leurs broches D/C
 * et CS résolues côté MCU. Le nom de la broche D/C diffère selon l'élément
 * (« DC » pour le SSD1306, « D/C » pour l'ILI9341 ; la carte SD n'en a pas).
 */
export function spiDeviceBindings(diagram: Diagram): SpiDeviceBinding[] {
  const nets = buildNets(diagram);
  const out: SpiDeviceBinding[] = [];
  for (const part of diagram.parts) {
    const kind = partDef(part.type).kind;
    if (kind !== 'spi-oled' && kind !== 'spi-tft' && kind !== 'spi-sd') continue;
    const dcName = part.type === 'ili9341' ? 'D/C' : 'DC';
    const dcPin = kind === 'spi-sd' ? null : mcuPinForPart(diagram, nets, part.id, rolePin(part.type, dcName));
    const csPin = mcuPinForPart(diagram, nets, part.id, rolePin(part.type, 'CS'));
    out.push({ partId: part.id, kind, dcPin, csPin });
  }
  return out;
}

export interface NeopixelBinding {
  partId: string;
  /** Broche MCU pilotant l'entrée DIN de la chaîne. */
  mcuPin: string;
  /** Nombre de LED de la chaîne. */
  count: number;
}

/** Nombre de LED d'un composant NeoPixel (matrice, anneau ou pixel simple). */
function neopixelCount(part: Part): number {
  const a = part.attrs ?? {};
  if (part.type === 'neopixel-matrix') return (Number(a.rows) || 8) * (Number(a.cols) || 8);
  if (part.type === 'led-ring') return Number(a.pixels) || 16;
  return Number(a.count) || 1;
}

/** Chaînes NeoPixel (WS2812) dont l'entrée DIN est reliée à une broche MCU. */
export function neopixelBindings(diagram: Diagram): NeopixelBinding[] {
  const nets = buildNets(diagram);
  const bindings: NeopixelBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'neopixel') continue;
    const mcuPin = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: rolePin(part.type, 'DIN') }));
    if (mcuPin) bindings.push({ partId: part.id, mcuPin, count: neopixelCount(part) });
  }
  return bindings;
}

export interface PotBinding {
  partId: string;
  /** Broche analogique du MCU reliée au curseur (SIG) du potentiomètre. */
  mcuPin: string;
  /**
   * Câblage inversé : l'extrémité « haute » (VCC) du rail est reliée à la masse
   * et l'extrémité « basse » (GND) à l'alimentation → la lecture varie en sens
   * inverse de la position du curseur.
   */
  inverted: boolean;
}

/**
 * Repère les potentiomètres dont le curseur (SIG) est relié à une broche
 * d'entrée analogique du MCU (A0–A5 sur Uno, GP26–GP28 sur Pico). Détecte aussi
 * le câblage inversé (VCC↔GND permutés sur les extrémités du rail) pour pouvoir
 * inverser la lecture en simulation.
 */
export function potBindings(diagram: Diagram): PotBinding[] {
  const nets = buildNets(diagram);
  const bindings: PotBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'potentiometer') continue;
    const sigNet = nets.netOf({ partId: part.id, pin: rolePin(part.type, 'SIG') });
    const mcuPin = mcuAnalogOnNet(diagram, nets, sigNet);
    if (!mcuPin) continue;
    // Les extrémités du rail @wokwi sont nommées VCC (côté haut) et GND (côté bas).
    const vccNet = nets.netOf({ partId: part.id, pin: rolePin(part.type, 'VCC') });
    const gndNet = nets.netOf({ partId: part.id, pin: rolePin(part.type, 'GND') });
    const normal = netHasVcc(diagram, nets, vccNet) && netHasGnd(diagram, nets, gndNet);
    const inverted = netHasGnd(diagram, nets, vccNet) && netHasVcc(diagram, nets, gndNet);
    bindings.push({ partId: part.id, mcuPin, inverted: inverted && !normal });
  }
  return bindings;
}

/** Première broche analogique du MCU présente sur un net. */
function mcuAnalogOnNet(diagram: Diagram, nets: Nets, netId: string): string | null {
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      const role = mcuPinRole(board, pin);
      if (role.role === 'digital' && role.adcChannel !== undefined && role.name) return role.name;
    }
  }
  return null;
}

function mcuDigitalOnNet(diagram: Diagram, nets: Nets, netId: string): string | null {
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      const role = mcuPinRole(board, pin);
      if (role.role === 'digital' && role.name) return role.name;
    }
  }
  return null;
}

function netHasGnd(diagram: Diagram, nets: Nets, netId: string): boolean {
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      if (mcuPinRole(board, pin).role === 'gnd') return true;
    }
  }
  return false;
}

function netHasVcc(diagram: Diagram, nets: Nets, netId: string): boolean {
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      if (mcuPinRole(board, pin).role === 'vcc') return true;
    }
  }
  return false;
}
