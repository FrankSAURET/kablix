// Modèle de schéma (pur, sans DOM) : composants, fils, calcul de la netlist et
// résolution logique des composants. Entièrement testable hors navigateur.
import { mcuPinRole, mcuPins, partDef, type BoardId } from './catalog.mjs';

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
}

export interface Part {
  id: string;
  type: string;
  x: number;
  y: number;
  /** Attributs effectifs de l'élément (couleur de LED, valeur de résistance…). */
  attrs?: Record<string, string>;
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
 * comporte comme un fil entre ses deux pattes (1 ↔ 2).
 */
export function buildNets(diagram: Diagram): Nets {
  const dsu = new DSU();
  for (const wire of diagram.wires) {
    dsu.union(key(wire.a), key(wire.b));
  }
  for (const part of diagram.parts) {
    if (partDef(part.type).kind === 'resistor') {
      dsu.union(`${part.id}/1`, `${part.id}/2`);
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

/** Une LED est allumée si son anode est au niveau haut et sa cathode au niveau bas. */
export function ledOn(
  diagram: Diagram,
  ledId: string,
  readPin: (name: string) => boolean
): boolean {
  const nets = buildNets(diagram);
  const anode = netLevel(diagram, nets, nets.netOf({ partId: ledId, pin: 'A' }), readPin);
  const cathode = netLevel(diagram, nets, nets.netOf({ partId: ledId, pin: 'C' }), readPin);
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
  const nets = buildNets(diagram);
  const a = netLevel(diagram, nets, nets.netOf({ partId, pin: '1' }), readPin);
  const b = netLevel(diagram, nets, nets.netOf({ partId, pin: '2' }), readPin);
  return (a === 1 && b === 0) || (a === 0 && b === 1);
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
    const netA = nets.netOf({ partId: part.id, pin: '1.l' });
    const netB = nets.netOf({ partId: part.id, pin: '2.l' });

    const mcuA = mcuDigitalOnNet(diagram, nets, netA);
    const mcuB = mcuDigitalOnNet(diagram, nets, netB);
    const gndA = netHasGnd(diagram, nets, netA);
    const gndB = netHasGnd(diagram, nets, netB);

    if (mcuA && gndB) bindings.push({ partId: part.id, mcuPin: mcuA });
    else if (mcuB && gndA) bindings.push({ partId: part.id, mcuPin: mcuB });
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
    const sigNet = nets.netOf({ partId: part.id, pin: 'SIG' });
    for (const { part: mcu, board } of mcuParts(diagram)) {
      for (const pin of mcuPins(board)) {
        if (nets.netOf({ partId: mcu.id, pin }) !== sigNet) continue;
        const role = mcuPinRole(board, pin);
        if (role.role === 'digital' && role.adcChannel !== undefined && role.name) {
          bindings.push({ partId: part.id, mcuPin: role.name });
        }
      }
    }
  }
  return bindings;
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
