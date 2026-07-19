// Modèle de schéma (pur, sans DOM) : composants, fils, calcul de la netlist et
// résolution logique des composants. Entièrement testable hors navigateur.
import { mcuPinRole, mcuPins, partDef, rolePin, type BoardId, type PartKind } from './catalog.mjs';
import { breadboardStrips, normalizeSize } from './breadboard.mjs';
import { groveShieldStrips, normalizePower } from './grove-shield.mjs';

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
 * `joinResistors: false` laisse les deux pattes de chaque résistance dans des
 * nets séparés — utilisé par ledSeriesOhms pour mesurer la résistance série.
 */
export function buildNets(diagram: Diagram, joinResistors = true): Nets {
  const dsu = new DSU();
  for (const wire of diagram.wires) {
    dsu.union(key(wire.a), key(wire.b));
  }
  for (const part of diagram.parts) {
    const kind = partDef(part.type).kind;
    if (kind === 'resistor') {
      if (joinResistors) dsu.union(`${part.id}/1`, `${part.id}/2`);
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
    } else if (kind === 'grove-shield') {
      // Grove Shield Pico : socle ↔ ports Grove ↔ rails (VCC selon l'interrupteur).
      for (const strip of groveShieldStrips(normalizePower(part.attrs?.pwr))) {
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
 * Broche MCU (numérique) pilotant l'anode d'une LED, si la cathode est bien à la
 * masse (montage classique). Sert à lire le rapport cyclique PWM (luminosité)
 * plutôt que le niveau instantané, qui ferait « clignoter » la LED en PWM.
 */
export function ledMcuPin(diagram: Diagram, ledId: string): string | null {
  const type = partType(diagram, ledId);
  const nets = buildNets(diagram);
  return mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: ledId, pin: rolePin(type, 'A') }));
}

/** Tension directe (V) d'une LED selon sa couleur — valeurs datasheet typiques. */
export const LED_FORWARD_V: Record<string, number> = {
  red: 1.8,
  orange: 2.0,
  yellow: 2.0,
  green: 2.1,
  blue: 3.0,
  white: 3.2,
  purple: 3.0,
};

/** Plus court chemin (somme des résistances) d'un net vers l'un des nets cibles.
 *  `avoid` : nets qui ne peuvent pas être traversés (rail opposé du diviseur —
 *  un rail est une source équipotentielle, pas un conducteur de passage). */
function minOhmsPath(
  from: string,
  targets: Set<string>,
  adj: Map<string, Array<{ to: string; ohms: number }>>,
  avoid?: Set<string>
): number | null {
  const dist = new Map<string, number>([[from, 0]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [net, d] of dist) {
      if (!done.has(net) && d < best) {
        best = d;
        cur = net;
      }
    }
    if (cur === null) return null;
    if (targets.has(cur)) return best;
    done.add(cur);
    if (avoid?.has(cur)) continue;
    for (const e of adj.get(cur) ?? []) {
      const d = best + e.ohms;
      if (d < (dist.get(e.to) ?? Infinity)) dist.set(e.to, d);
    }
  }
}

/** Types de résistances variables nues (2 pattes) pilotées par un curseur de
 *  simulation : photorésistance et thermistances CTN/CTP. */
export const VARIABLE_RESISTOR_TYPES: ReadonlySet<string> = new Set(['ldr', 'ntc', 'ptc']);

/**
 * Caractéristique R(x) d'une résistance variable nue (paramètres de
 * l'inspecteur dans `attrs`) :
 *  - ldr : x = éclairement (lx), R = R1lx · x^(−γ) — obscurité totale ≈ 10 MΩ ;
 *  - ntc : x = température (°C), R = R25 · e^(B·(1/T − 1/T25)) (T en kelvins) ;
 *  - ptc : x = température (°C), R = R25 · (1 + tc/100 · (T − 25)) (type KTY).
 */
export function variableResistorOhms(
  type: string,
  x: number,
  attrs?: Record<string, string>
): number {
  const num = (key: string, dflt: number): number => {
    const v = Number(attrs?.[key]);
    return Number.isFinite(v) && v > 0 ? v : dflt;
  };
  if (type === 'ldr') {
    if (!(x > 0)) return 1e7;
    const r = num('r1lx', 50_000) * Math.pow(x, -num('gamma', 0.7));
    return Math.min(1e7, Math.max(1, r));
  }
  const t = Number.isFinite(x) ? x : 25;
  if (type === 'ntc') {
    const r25 = num('r25', 10_000);
    const beta = num('beta', 3950);
    return Math.max(1, r25 * Math.exp(beta * (1 / (t + 273.15) - 1 / 298.15)));
  }
  const r25 = num('r25', 2000);
  const tc = num('tc', 0.79);
  return Math.max(1, r25 * (1 + (tc / 100) * (t - 25)));
}

/** Résistance de repos d'un composant `kind: resistor` : attribut `value` pour
 *  une résistance fixe, caractéristique au point des attrs (lux/température de
 *  l'inspecteur) pour une résistance variable. */
function nominalOhms(part: Part): number {
  if (VARIABLE_RESISTOR_TYPES.has(part.type)) {
    const x = Number(part.attrs?.[part.type === 'ldr' ? 'lux' : 'temperature']);
    return variableResistorOhms(part.type, Number.isFinite(x) ? x : part.type === 'ldr' ? 500 : 25, part.attrs);
  }
  return Math.max(0, Number(part.attrs?.value ?? 220) || 0);
}

/**
 * Graphe résistif du schéma : netlist SANS fusion des résistances, chaque
 * résistance devient une arête pondérée par son attribut `value` (ou sa
 * caractéristique pour une résistance variable — `liveOhms` donne la valeur
 * courante du curseur en simulation, à défaut le point de repos des attrs), et
 * les nets des broches MCU sont classés par rôle (sources numériques/VCC, masses).
 */
function resistiveGraph(diagram: Diagram, liveOhms?: (part: Part) => number | null) {
  const nets = buildNets(diagram, false);
  const adj = new Map<string, Array<{ to: string; ohms: number; partId: string }>>();
  const link = (a: string, b: string, ohms: number, partId: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, ohms, partId });
  };
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'resistor') continue;
    const a = nets.netOf({ partId: part.id, pin: '1' });
    const b = nets.netOf({ partId: part.id, pin: '2' });
    const ohms = Math.max(0, liveOhms?.(part) ?? nominalOhms(part));
    link(a, b, ohms, part.id);
    link(b, a, ohms, part.id);
  }
  const digitalNets = new Set<string>();
  const vccNets = new Set<string>();
  const gndNets = new Set<string>();
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      const role = mcuPinRole(board, pin);
      if (role.role !== 'gnd' && role.role !== 'vcc' && role.role !== 'digital') continue;
      const net = nets.netOf({ partId: part.id, pin });
      if (role.role === 'gnd') gndNets.add(net);
      else if (role.role === 'vcc') vccNets.add(net);
      else digitalNets.add(net);
    }
  }
  return { nets, adj, digitalNets, vccNets, gndNets };
}

/**
 * Résistance série totale (Ω) du circuit d'une LED : plus court chemin (en ohms)
 * entre une broche source (MCU numérique ou VCC) et l'anode, plus celui entre la
 * cathode et une masse. Fils et platines d'essai sont des courts-circuits, chaque
 * résistance est une arête pondérée par son attribut `value`.
 * Retourne 0 si la LED est branchée en direct, null si le circuit est ouvert.
 */
export function ledSeriesOhms(diagram: Diagram, ledId: string): number | null {
  const { nets, adj, digitalNets, vccNets, gndNets } = resistiveGraph(diagram);
  const type = partType(diagram, ledId);
  const src = new Set([...digitalNets, ...vccNets]);
  const up = minOhmsPath(nets.netOf({ partId: ledId, pin: rolePin(type, 'A') }), src, adj);
  const down = minOhmsPath(nets.netOf({ partId: ledId, pin: rolePin(type, 'C') }), gndNets, adj);
  return up === null || down === null ? null : up + down;
}

/**
 * Résistance série (Ω) du circuit d'UN canal d'une LED RGB :
 *  - cathode commune : broche canal ← source (MCU/VCC), COM → masse ;
 *  - anode commune   : COM ← VCC, broche canal → puits (broche MCU tirée basse,
 *    ou masse). Retourne 0 en direct, null si le circuit du canal est ouvert.
 */
export function rgbSeriesOhms(
  diagram: Diagram,
  partId: string,
  chan: 'R' | 'G' | 'B'
): number | null {
  const { nets, adj, digitalNets, vccNets, gndNets } = resistiveGraph(diagram);
  const commonAnode = diagram.parts.find((p) => p.id === partId)?.attrs?.common === 'anode';
  const chanNet = nets.netOf({ partId, pin: chan });
  const comNet = nets.netOf({ partId, pin: 'COM' });
  const chanEnd = commonAnode
    ? minOhmsPath(chanNet, new Set([...digitalNets, ...gndNets]), adj)
    : minOhmsPath(chanNet, new Set([...digitalNets, ...vccNets]), adj);
  const comEnd = commonAnode
    ? minOhmsPath(comNet, vccNets, adj)
    : minOhmsPath(comNet, gndNets, adj);
  return chanEnd === null || comEnd === null ? null : chanEnd + comEnd;
}

/**
 * Résistance série (Ω) du circuit d'UN segment d'afficheur 7 segments :
 * broche du segment vers sa source (ou son puits en anode commune), plus le
 * MEILLEUR chemin d'un commun (COM.1/COM.2/COM ou DIGn multiplexé) vers la
 * masse (cathode commune) ou VCC (anode commune). Approximation multiplexée :
 * le commun le plus favorable est retenu.
 */
export function sevenSegSeriesOhms(
  diagram: Diagram,
  partId: string,
  segPin: string,
  commonAnode: boolean
): number | null {
  const { nets, adj, digitalNets, vccNets, gndNets } = resistiveGraph(diagram);
  const segNet = nets.netOf({ partId, pin: segPin });
  const segEnd = commonAnode
    ? minOhmsPath(segNet, new Set([...digitalNets, ...gndNets]), adj)
    : minOhmsPath(segNet, new Set([...digitalNets, ...vccNets]), adj);
  let comEnd: number | null = null;
  for (const c of ['COM.1', 'COM.2', 'COM', 'DIG1', 'DIG2', 'DIG3', 'DIG4']) {
    const n = nets.netOf({ partId, pin: c });
    const d = commonAnode
      ? minOhmsPath(n, vccNets, adj)
      : minOhmsPath(n, new Set([...digitalNets, ...gndNets]), adj);
    if (d !== null && (comEnd === null || d < comEnd)) comEnd = d;
  }
  return segEnd === null || comEnd === null ? null : segEnd + comEnd;
}

/** Résistance série (Ω) du circuit d'une LED d'une barre (anode An, cathode Cn). */
export function ledBarSeriesOhms(diagram: Diagram, partId: string, index: number): number | null {
  const { nets, adj, digitalNets, vccNets, gndNets } = resistiveGraph(diagram);
  const up = minOhmsPath(
    nets.netOf({ partId, pin: `A${index + 1}` }),
    new Set([...digitalNets, ...vccNets]),
    adj
  );
  const down = minOhmsPath(nets.netOf({ partId, pin: `C${index + 1}` }), gndNets, adj);
  return up === null || down === null ? null : up + down;
}

export interface AdcDividerLevel {
  /** Broche analogique du MCU (nom logique : A0…, GP26…). */
  mcuPin: string;
  /** Tension du nœud de mesure, en fraction 0..1 de VCC. */
  level: number;
}

/**
 * Tension de chaque entrée ADC reliée à un réseau résistif contenant au moins
 * une résistance variable nue (LDR/CTN/CTP) : pont diviseur réel. Rh = plus
 * court chemin résistif du nœud vers VCC, Rb = vers la masse (sans traverser le
 * rail opposé : un rail est une source, pas un conducteur), level = Rb/(Rh+Rb).
 * Un seul rail atteint : nœud tiré à ce rail (VCC seul → 1, masse seule → 0) ;
 * aucun → pas de mesure (nœud flottant, l'entrée n'est pas pilotée).
 * Les entrées ADC sans résistance variable dans leur réseau sont ignorées
 * (elles restent pilotées par leurs sources habituelles : potentiomètre…).
 */
export function adcDividerLevels(
  diagram: Diagram,
  liveOhms?: (part: Part) => number | null
): AdcDividerLevel[] {
  const { nets, adj, vccNets, gndNets } = resistiveGraph(diagram, liveOhms);
  const out: AdcDividerLevel[] = [];
  // Le réseau « local » d'un nœud (BFS sans traverser les rails) contient-il
  // une résistance variable ?
  const cache = new Map<string, boolean>();
  const hasVariable = (start: string): boolean => {
    const cached = cache.get(start);
    if (cached !== undefined) return cached;
    const seen = new Set([start]);
    const queue = [start];
    let found = false;
    while (queue.length > 0 && !found) {
      const cur = queue.pop()!;
      for (const e of adj.get(cur) ?? []) {
        if (VARIABLE_RESISTOR_TYPES.has(partType(diagram, e.partId))) {
          found = true;
          break;
        }
        if (!seen.has(e.to) && !vccNets.has(e.to) && !gndNets.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
    cache.set(start, found);
    return found;
  };
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      const role = mcuPinRole(board, pin);
      if (role.role !== 'digital' || role.adcChannel === undefined || !role.name) continue;
      const net = nets.netOf({ partId: part.id, pin });
      if (vccNets.has(net) || gndNets.has(net)) continue; // collée à un rail : pas un pont
      if (!hasVariable(net)) continue;
      const up = minOhmsPath(net, vccNets, adj, gndNets);
      const down = minOhmsPath(net, gndNets, adj, vccNets);
      if (up === null && down === null) continue;
      let level: number;
      if (up === null) level = 0;
      else if (down === null) level = 1;
      else level = up + down > 0 ? down / (up + down) : 0;
      out.push({ mcuPin: role.name, level });
    }
  }
  return out;
}

/**
 * État électrique d'une LED alimentée sous `vsupply` volts à travers `ohms` :
 *  - `amps` : courant direct (I = (Vs − Vf) / R ; Infinity si R = 0) ;
 *  - `overCurrent` : courant de crête destructeur (> 35 mA) — LED grillée ;
 *  - `lum` : facteur de luminosité 0..1 (pleine luminosité à partir de 10 mA,
 *    proportionnel en dessous, éteinte sous 0,2 mA — résistance trop forte).
 */
export function ledElectrical(
  ohms: number | null,
  vsupply: number,
  color: string | undefined
): { amps: number; overCurrent: boolean; lum: number } {
  const vf = LED_FORWARD_V[(color ?? 'red').toLowerCase()] ?? 2.0;
  const drop = vsupply - vf;
  if (ohms === null || drop <= 0) return { amps: 0, overCurrent: false, lum: 0 };
  const amps = ohms === 0 ? Infinity : drop / ohms;
  const overCurrent = amps > 0.035;
  const lum = amps < 0.0002 ? 0 : Math.min(1, amps / 0.01);
  return { amps, overCurrent, lum };
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
): { red: boolean; green: boolean; blue: boolean; comOk: boolean; commonAnode: boolean } {
  const nets = buildNets(diagram);
  const level = (pin: string): Level =>
    netLevel(diagram, nets, nets.netOf({ partId, pin }), readPin);
  const com = level('COM');
  const commonAnode = diagram.parts.find((p) => p.id === partId)?.attrs?.common === 'anode';
  // comOk : le commun est bien câblé au bon rail — condition nécessaire pour
  // qu'un canal puisse s'allumer (y compris en PWM, où le niveau instantané
  // des canaux n'est pas fiable).
  const comOk = commonAnode ? com === 1 : com === 0;
  const lit = (pin: string): boolean =>
    comOk && (commonAnode ? level(pin) === 0 : level(pin) === 1);
  return { red: lit('R'), green: lit('G'), blue: lit('B'), comOk, commonAnode };
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
 * — compatible avec la propriété `values` de kablix-7segment. Le commun est la
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

/**
 * Un chiffre d'un afficheur 7 segments multiplexé (2/4 chiffres). Les segments
 * A..DP sont partagés ; chaque chiffre a sa broche commune DIGn. Le chiffre est
 * « sélectionné » quand son commun est actif (BAS en cathode commune, HAUT en
 * anode commune). `active` indique si le chiffre est éclairé à cet instant ;
 * `values` donne ses 8 segments (ordre A,B,C,D,E,F,G,DP). L'appelant mémorise
 * (latch) la dernière valeur de chaque chiffre actif pour reconstituer
 * l'affichage complet (le balayage n'éclaire qu'un chiffre à la fois).
 */
export function sevenSegmentDigit(
  diagram: Diagram,
  partId: string,
  readPin: (name: string) => boolean,
  digitPin: string,
  commonAnode: boolean
): { active: boolean; values: number[] } {
  const nets = buildNets(diagram);
  const level = (pin: string): Level =>
    netLevel(diagram, nets, nets.netOf({ partId, pin }), readPin);
  const common = level(digitPin);
  const active = commonAnode ? common === 1 : common === 0;
  const values = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].map((seg) => {
    const s = level(seg);
    return commonAnode ? (s === 0 && common === 1 ? 1 : 0) : (s === 1 && common === 0 ? 1 : 0);
  });
  return { active, values };
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

export interface AoDoSensorBinding {
  partId: string;
  /** Entrée analogique MCU reliée à AOUT (si câblée). */
  analogPin: string | null;
  /** Entrée numérique MCU reliée à DOUT (si câblée). */
  digitalPin: string | null;
}

/**
 * Capteurs à double sortie (flamme, gaz, son, lumière) : résout séparément la
 * broche analogique (AOUT/AO) et la broche numérique (DOUT/DO) câblées.
 */
export function aoDoSensorBindings(diagram: Diagram): AoDoSensorBinding[] {
  const nets = buildNets(diagram);
  const bindings: AoDoSensorBinding[] = [];
  for (const part of diagram.parts) {
    const def = partDef(part.type);
    if (def.kind !== 'ao-do-sensor') continue;
    const analogPin = def.analogPin
      ? mcuAnalogOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: def.analogPin })) ?? null
      : null;
    const digitalPin = def.digitalPin
      ? mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: def.digitalPin })) ?? null
      : null;
    if (analogPin || digitalPin) bindings.push({ partId: part.id, analogPin, digitalPin });
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

export interface RgbLedBinding {
  partId: string;
  /** Broche MCU pilotant chaque canal (null si non câblé au MCU). */
  r: string | null;
  g: string | null;
  b: string | null;
}

/** LED RGB : broche MCU de chaque canal — pour mesurer le rapport cyclique PWM. */
export function rgbLedBindings(diagram: Diagram): RgbLedBinding[] {
  const nets = buildNets(diagram);
  const bindings: RgbLedBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'rgb-led') continue;
    const pinOf = (pin: string): string | null =>
      mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin }));
    bindings.push({ partId: part.id, r: pinOf('R'), g: pinOf('G'), b: pinOf('B') });
  }
  return bindings;
}

export interface SevenSegmentBinding {
  partId: string;
  /** Broche MCU de chaque segment A..DP (null si non câblé au MCU). */
  segments: Record<string, string | null>;
}

/** Afficheur 7 segments à 1 chiffre : broche MCU de chaque segment — pour mesurer
 * le rapport cyclique PWM (variateur de luminosité) plutôt que le niveau instantané. */
export function sevenSegmentBindings(diagram: Diagram): SevenSegmentBinding[] {
  const nets = buildNets(diagram);
  const bindings: SevenSegmentBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== '7segment') continue;
    if (Math.max(1, Number(part.attrs?.digits ?? 1) || 1) > 1) continue; // multiplexé : latché ailleurs
    const pinOf = (pin: string): string | null =>
      mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin }));
    const segments: Record<string, string | null> = {};
    for (const seg of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']) segments[seg] = pinOf(seg);
    bindings.push({ partId: part.id, segments });
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

export interface KeypadBinding {
  partId: string;
  /** Broches MCU reliées aux lignes R1..R4 (null si non câblée). */
  rows: Array<string | null>;
  /** Broches MCU reliées aux colonnes C1..C4 (null si non câblée / absente). */
  cols: Array<string | null>;
}

/** Claviers matriciels du schéma : lignes/colonnes résolues côté MCU. */
export function keypadBindings(diagram: Diagram): KeypadBinding[] {
  const nets = buildNets(diagram);
  const out: KeypadBinding[] = [];
  for (const part of diagram.parts) {
    if (part.type !== 'keypad') continue;
    const cols = Number(part.attrs?.columns ?? 4) || 4;
    const pin = (name: string): string | null =>
      mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: name }));
    out.push({
      partId: part.id,
      rows: ['R1', 'R2', 'R3', 'R4'].map(pin),
      cols: Array.from({ length: cols }, (_, i) => pin(`C${i + 1}`)),
    });
  }
  return out;
}

export interface Dht22Binding {
  partId: string;
  /** Broche MCU reliée à la ligne de données (DATA, 1-wire). */
  pin: string;
}

/** Capteurs DHT22 du schéma dont la ligne de données est reliée à une broche MCU. */
export function dht22Bindings(diagram: Diagram): Dht22Binding[] {
  const nets = buildNets(diagram);
  const out: Dht22Binding[] = [];
  for (const part of diagram.parts) {
    if (part.type !== 'dht22') continue;
    const pin = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: 'DATA' }));
    if (pin) out.push({ partId: part.id, pin });
  }
  return out;
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
    let kind = partDef(part.type).kind;
    // OLED SSD1306 : composant unique I²C/SPI (attrs.pins), cf. catalog.mts —
    // en mode spi il se comporte comme un spi-oled bien que son kind soit i2c-oled.
    if (kind === 'i2c-oled' && part.attrs?.pins === 'spi') kind = 'spi-oled';
    if (kind !== 'spi-oled' && kind !== 'spi-tft' && kind !== 'spi-sd') continue;
    const dcName = part.type === 'ili9341' ? 'D/C' : 'DC';
    const dcPin = kind === 'spi-sd' ? null : mcuPinForPart(diagram, nets, part.id, rolePin(part.type, dcName));
    const csPin = mcuPinForPart(diagram, nets, part.id, rolePin(part.type, 'CS'));
    out.push({ partId: part.id, kind, dcPin, csPin });
  }
  return out;
}

export interface LcdParallelBinding {
  partId: string;
  /** Broche MCU reliée à RS (sélection registre/donnée). */
  rs: string;
  /** Broche MCU reliée à E (activation). */
  e: string;
  /** Broches MCU des lignes de données, ordre LSB→MSB (D4-D7 ou D0-D7). */
  data: string[];
  cols: number;
  rows: number;
}

/**
 * Afficheurs LCD HD44780 câblés en parallèle (attribut `pins=full`) dont RS, E et
 * les lignes de données sont reliés au MCU. Mode 8 bits si D0-D3 sont câblés
 * (data = D0..D7), sinon 4 bits (data = D4..D7). Renvoie seulement les afficheurs
 * dont RS, E et toutes les données utiles sont résolues.
 */
export function lcdParallelBindings(diagram: Diagram): LcdParallelBinding[] {
  const nets = buildNets(diagram);
  const out: LcdParallelBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'i2c-lcd') continue;
    if ((part.attrs?.pins ?? 'i2c') !== 'full') continue;
    const rs = mcuPinForPart(diagram, nets, part.id, 'RS');
    const e = mcuPinForPart(diagram, nets, part.id, 'E');
    if (!rs || !e) continue;
    const d = (n: number): string | null => mcuPinForPart(diagram, nets, part.id, `D${n}`);
    const high = [4, 5, 6, 7].map(d); // D4..D7 (toujours requis)
    const low = [0, 1, 2, 3].map(d); // D0..D3 (présents seulement en 8 bits)
    let data: Array<string | null>;
    if (low.every((p) => p)) data = [...low, ...high]; // 8 bits : D0..D7
    else data = high; // 4 bits : D4..D7
    if (data.some((p) => !p)) continue; // câblage incomplet
    out.push({
      partId: part.id,
      rs,
      e,
      data: data as string[],
      cols: Number(part.attrs?.cols ?? 16) || 16,
      rows: Number(part.attrs?.rows ?? 2) || 2,
    });
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
    // Les extrémités du rail sont nommées VCC (côté haut) et GND (côté bas).
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
