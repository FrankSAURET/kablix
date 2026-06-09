// Modèle de schéma (pur, sans DOM) : composants, fils, calcul de la netlist et
// résolution logique des composants. Entièrement testable hors navigateur.
import { partDef, unoPinRole } from './catalog.mjs';

export interface Endpoint {
  partId: string;
  pin: string;
}

export interface Wire {
  id: string;
  a: Endpoint;
  b: Endpoint;
}

export interface Part {
  id: string;
  type: string;
  x: number;
  y: number;
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

/**
 * Détermine le niveau d'un net en parcourant toutes les extrémités qui s'y
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
  for (const part of diagram.parts) {
    const def = partDef(part.type);
    if (def.kind !== 'mcu-uno') continue;
    // Les broches MCU pertinentes : on teste celles reliées à ce net.
    for (const pin of MCU_PINS) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      const role = unoPinRole(pin);
      if (role.role === 'gnd') return 0;
      if (role.role === 'vcc') return 1;
      if (role.role === 'digital') mcuLevel = readPin(role.name) ? 1 : 0;
    }
  }
  return mcuLevel;
}

// Broches de l'Uno susceptibles d'être câblées (numériques, analogiques, alim).
const MCU_PINS: readonly string[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5',
  'GND.1', 'GND.2', 'GND.3', '5V', '3.3V', 'VIN',
];

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

function mcuDigitalOnNet(diagram: Diagram, nets: Nets, netId: string): string | null {
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'mcu-uno') continue;
    for (const pin of MCU_PINS) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      const role = unoPinRole(pin);
      if (role.role === 'digital') return role.name;
    }
  }
  return null;
}

function netHasGnd(diagram: Diagram, nets: Nets, netId: string): boolean {
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'mcu-uno') continue;
    for (const pin of MCU_PINS) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      if (unoPinRole(pin).role === 'gnd') return true;
    }
  }
  return false;
}
