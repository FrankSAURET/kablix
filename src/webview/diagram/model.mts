// Modèle de schéma (pur, sans DOM) : composants, fils, calcul de la netlist et
// résolution logique des composants. Entièrement testable hors navigateur.
import { mcuPinRole, mcuPins, partDef, rolePin, type BoardId } from './catalog.mjs';
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
 * État des trois canaux d'une LED RGB (cathode commune) : un canal est allumé
 * si sa broche (R/G/B) est au niveau haut et la broche COM au niveau bas.
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
  return {
    red: level('R') === 1 && com === 0,
    green: level('G') === 1 && com === 0,
    blue: level('B') === 1 && com === 0,
  };
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
 * Segments allumés d'un afficheur 7 segments (1 chiffre, cathode commune
 * DIG1) : ordre A,B,C,D,E,F,G,DP — compatible avec la propriété `values`
 * de wokwi-7segment.
 */
export function sevenSegmentState(
  diagram: Diagram,
  partId: string,
  readPin: (name: string) => boolean
): number[] {
  const nets = buildNets(diagram);
  const level = (pin: string): Level =>
    netLevel(diagram, nets, nets.netOf({ partId, pin }), readPin);
  const common = level('DIG1');
  return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].map(
    (seg) => (level(seg) === 1 && common === 0 ? 1 : 0)
  );
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

export interface PotBinding {
  partId: string;
  /** Broche analogique du MCU reliée au curseur (SIG) du potentiomètre. */
  mcuPin: string;
}

/**
 * Repère les potentiomètres dont le curseur (SIG) est relié à une broche
 * d'entrée analogique du MCU (A0–A5 sur Uno, GP26–GP28 sur Pico).
 */
export function potBindings(diagram: Diagram): PotBinding[] {
  const nets = buildNets(diagram);
  const bindings: PotBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'potentiometer') continue;
    const sigNet = nets.netOf({ partId: part.id, pin: rolePin(part.type, 'SIG') });
    const mcuPin = mcuAnalogOnNet(diagram, nets, sigNet);
    if (mcuPin) bindings.push({ partId: part.id, mcuPin });
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
