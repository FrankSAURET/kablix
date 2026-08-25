// Modèle de schéma (pur, sans DOM) : composants, fils, calcul de la netlist et
// résolution logique des composants. Entièrement testable hors navigateur.
import { mcuInternalStrips, mcuPinRole, mcuPins, partDef, rolePin, PARAM_ATTR_PREFIX, type BoardId, type PartKind } from './catalog.mjs';
import { breadboardStrips, normalizeSize } from './breadboard.mjs';
import { groveShieldStrips, normalizePower } from './grove-shield.mjs';
import { gateOutput, icMarking, icRef, icSupplyRange, type SupplyRange } from './ics.mjs';
import { isDarlingtonType, isMosType, isPnpType } from './transistors.mjs';

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

/** Nommage des équipotentielles d'un schéma : chaque net portant au moins un
 *  fil visible reçoit un nom stable `eqp-<n>` (n = 1, 2, 3… dans l'ordre
 *  d'apparition des fils), et chaque fil de ce net un nom unique `eqp-<n>-<k>`.
 *  Deux fils de MÊME `eqp` ont le droit de se chevaucher et de s'embrancher ;
 *  deux fils d'`eqp` différentes ne le peuvent pas (règle d'autoroutage). */
export interface Equipotentials {
  /** `eqp-<n>` de l'équipotentielle d'un fil (via son id). */
  eqpOfWire(wireId: string): string | undefined;
  /** `eqp-<n>-<k>` unique d'un fil (via son id). */
  nameOfWire(wireId: string): string | undefined;
  /** Deux fils appartiennent-ils à la même équipotentielle ? */
  sameEqp(wireIdA: string, wireIdB: string): boolean;
}

export function nameEquipotentials(diagram: Diagram): Equipotentials {
  // `joinResistors: false` — une résistance n'est PAS un fil ici : ses deux
  // pattes sont à des potentiels différents. Avec la fusion par défaut, les
  // fils des deux côtés d'une résistance héritaient de la MÊME `eqp` et
  // gagnaient donc le droit de se chevaucher (chevauchements résiduels).
  const nets = buildNets(diagram, false);
  const eqpOf = new Map<string, string>(); // wireId → eqp-N
  const nameOf = new Map<string, string>(); // wireId → eqp-N-K
  const eqpByNet = new Map<string, string>(); // netId → eqp-N
  const kByEqp = new Map<string, number>(); // eqp-N → dernier K attribué
  let n = 0;
  // Ordre stable = ordre des fils dans le diagramme (les fils `auto` invisibles
  // ne comptent pas comme équipotentielle nommée).
  for (const w of diagram.wires) {
    if (w.auto) continue;
    const net = nets.netOf(w.a);
    let eqp = eqpByNet.get(net);
    if (eqp === undefined) {
      eqp = `eqp-${++n}`;
      eqpByNet.set(net, eqp);
      kByEqp.set(eqp, 0);
    }
    const k = (kByEqp.get(eqp) ?? 0) + 1;
    kByEqp.set(eqp, k);
    eqpOf.set(w.id, eqp);
    nameOf.set(w.id, `${eqp}-${k}`);
  }
  return {
    eqpOfWire: (id) => eqpOf.get(id),
    nameOfWire: (id) => nameOf.get(id),
    sameEqp: (a, b) => {
      const ea = eqpOf.get(a);
      return ea !== undefined && ea === eqpOf.get(b);
    },
  };
}

/**
 * Cache de FRAME de la netlist et du graphe résistif. Une frame de rendu
 * rappelle les helpers composant par composant (`ledOn`, `ledMcuPin`,
 * `ledPowerCircuit`…) et CHACUN rebâtissait la netlist entière : sur un schéma
 * de 60 composants, ~15 ms par frame, soit tout le budget d'image — le moteur
 * n'avait plus de temps et la simulation tournait au ralenti.
 * La fenêtre est ouverte/fermée explicitement autour d'un traitement
 * SYNCHRONE (`beginModelFrame`/`endModelFrame`) : le schéma ne peut pas changer
 * pendant, donc aucune invalidation à maintenir et aucun risque de netlist
 * périmée. Hors fenêtre, tout est recalculé comme avant.
 */
let frameDiagram: Diagram | null = null;
const frameNets = new Map<boolean, Nets>(); // clé : joinResistors
const frameGraphs = new Map<unknown, ResistiveGraph>(); // clé : callback liveOhms
const NO_LIVE_OHMS = Symbol('liveOhms absent');

/** Ouvre la fenêtre de cache pour un traitement synchrone sur `diagram`. */
export function beginModelFrame(diagram: Diagram): void {
  frameDiagram = diagram;
  frameNets.clear();
  frameGraphs.clear();
}

/** Referme la fenêtre : les calculs suivants repartent d'une netlist fraîche. */
export function endModelFrame(): void {
  frameDiagram = null;
  frameNets.clear();
  frameGraphs.clear();
}

/**
 * Pont COMMANDÉ : interrupteur fermé par un composant actif — transistor saturé
 * (collecteur→émetteur) ou contact de relais (Com↔NF ou Com↔NO). Il conduit
 * comme un fil, en perdant `drop` volts et sans laisser passer plus de
 * `limitAmps` ampères.
 */
export interface ActiveBridge {
  partId: string;
  /** BROCHE d'entrée du composant (côté « haut » d'un transistor : le collecteur).
   *  Des broches, pas des nets : chaque calcul les rapporte à SA netlist (les
   *  identifiants de net diffèrent selon `joinResistors`). */
  a: string;
  /** Broche de sortie (côté « bas » : l'émetteur). */
  b: string;
  /** Tension perdue dans le pont (V) : Vce de saturation, 0 pour un contact. */
  drop?: number;
  /** Courant maximal transmis (A) : Gain × Ib pour un transistor. */
  limitAmps?: number;
  /** Le courant ne passe que de `a` vers `b` (transistor) ; sinon les deux sens. */
  oneWay?: boolean;
}

/**
 * Ponts fermés à cet instant. Ils sont posés PAR LA SIMULATION avant chaque
 * frame (setActiveBridges), car leur état dépend des niveaux… qui dépendent des
 * ponts : c'est un point fixe, résolu en quelques tours par l'appelant
 * (commandedBridges). Le changement de liste vide le cache de frame, sinon la
 * netlist du tour précédent servirait à calculer le tour suivant.
 */
let activeBridges: readonly ActiveBridge[] = [];

/** Signature d'une liste de ponts (comparaison bon marché entre deux tours). */
export function bridgeSignature(list: readonly ActiveBridge[]): string {
  return list.map((b) => `${b.partId}:${b.a}>${b.b}:${b.limitAmps ?? ''}`).sort().join('|');
}

export function setActiveBridges(list: readonly ActiveBridge[]): void {
  if (bridgeSignature(list) === bridgeSignature(activeBridges)) return;
  activeBridges = list;
  frameNets.clear();
  frameGraphs.clear();
}

/**
 * Sortie de porte logique qui IMPOSE son niveau à un net. Ce n'est pas un pont :
 * un circuit intégré ne relie pas deux nets, il pilote le sien — exactement
 * comme une broche de carte en sortie.
 */
export interface GateDrive {
  partId: string;
  /** Patte de SORTIE du boîtier (Q1, a̅…). */
  pin: string;
  level: 0 | 1;
}

/**
 * Sorties actives à cet instant, posées par la simulation avant chaque frame
 * (même point fixe que les ponts : la sortie d'une porte peut piloter l'entrée
 * d'une autre). Le changement vide le cache de frame.
 */
let gateDrives: readonly GateDrive[] = [];

export function gateDriveSignature(list: readonly GateDrive[]): string {
  return list.map((d) => `${d.partId}/${d.pin}=${d.level}`).sort().join('|');
}

export function setGateDrives(list: readonly GateDrive[]): void {
  if (gateDriveSignature(list) === gateDriveSignature(gateDrives)) return;
  gateDrives = list;
  frameNets.clear();
  frameGraphs.clear();
}

/**
 * Construit la netlist. Les fils relient les broches ; une résistance se
 * comporte comme un fil entre ses deux pattes (1 ↔ 2) ; une platine d'essai
 * relie les trous de chaque bande (colonnes a–e / f–j et rails).
 * `joinResistors: false` laisse les deux pattes de chaque résistance dans des
 * nets séparés — utilisé par ledSeriesOhms pour mesurer la résistance série.
 */
export function buildNets(diagram: Diagram, joinResistors = true): Nets {
  if (frameDiagram === diagram) {
    const cached = frameNets.get(joinResistors);
    if (cached) return cached;
    const fresh = computeNets(diagram, joinResistors);
    frameNets.set(joinResistors, fresh);
    return fresh;
  }
  return computeNets(diagram, joinResistors);
}

function computeNets(diagram: Diagram, joinResistors: boolean): Nets {
  const dsu = new DSU();
  for (const wire of diagram.wires) {
    dsu.union(key(wire.a), key(wire.b));
  }
  for (const part of diagram.parts) {
    const kind = partDef(part.type).kind;
    if (kind === 'resistor') {
      // Mêmes bornes que le graphe résistif : rolePin traduit « 1 »/« 2 » en
      // c/e pour les composants dont les pattes portent un autre nom.
      if (joinResistors) {
        dsu.union(`${part.id}/${rolePin(part.type, '1')}`, `${part.id}/${rolePin(part.type, '2')}`);
      }
    } else if (kind === 'meter') {
      // Multimètre en AMPÈREMÈTRE : c'est un FIL, ses deux prises ne font qu'un
      // seul nœud — exactement ce qui se passe quand on l'insère en série dans
      // un circuit. En VOLTMÈTRE il ne conduit rien : les prises restent
      // séparées et l'appareil n'existe pas pour le montage.
      if (meterMode(part) === 'current') {
        dsu.union(`${part.id}/+`, `${part.id}/GND`);
      }
    } else if (kind === 'pushbutton') {
      // Les deux pastilles d'une même borne (gauche/droite) sont reliées en interne.
      dsu.union(`${part.id}/1.l`, `${part.id}/1.r`);
      dsu.union(`${part.id}/2.l`, `${part.id}/2.r`);
    } else if (kind === 'relay') {
      // Le commun sort des DEUX côtés du boîtier (Com.1 et Com.2) : c'est la
      // même lame, donc le même nœud, quel que soit le côté câblé.
      dsu.union(`${part.id}/Com.1`, `${part.id}/Com.2`);
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
    } else if (part.type === 'pca9685') {
      // PCA9685 natif : rails internes de la carte Grove — masse commune
      // (Grove + bornier + colonnes servo) et rail V+ (bornier → colonnes 5V).
      // VCC (alimentation logique du connecteur Grove) reste isolé.
      for (const strip of PCA9685_STRIPS) {
        for (let i = 1; i < strip.length; i++) {
          dsu.union(`${part.id}/${strip[0]}`, `${part.id}/${strip[i]}`);
        }
      }
    } else if (kind === 'mcu') {
      // Carte MCU : les broches physiquement reliées sur le PCB (toutes les
      // masses GND.n ; les 5V/5V.1/5V.2 du Mega) sont une même équipotentielle.
      const board = partDef(part.type).board;
      if (board) {
        for (const strip of mcuInternalStrips(board)) {
          for (let i = 1; i < strip.length; i++) {
            dsu.union(`${part.id}/${strip[0]}`, `${part.id}/${strip[i]}`);
          }
        }
      }
    }
  }
  return { netOf: (e) => dsu.find(key(e)) };
}

// Rails internes du module PCA9685 (voir composants/pca9685-element.mts).
const PCA9685_STRIPS: readonly string[][] = [
  ['GND', 'GND.2', ...Array.from({ length: 16 }, (_, i) => `P${i + 1}.GND`)],
  ['V+', ...Array.from({ length: 16 }, (_, i) => `P${i + 1}.5V`)],
];

/** Niveau logique d'un net : 1 (haut/VCC), 0 (bas/GND) ou undefined (flottant). */
export type Level = 0 | 1 | undefined;

/** Alimentations de laboratoire du schéma (kind 'psu' — broches V+ / GND). */
function psuParts(diagram: Diagram): Part[] {
  return diagram.parts.filter((p) => partDef(p.type).kind === 'psu');
}

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
 * Ce qu'un net « voit » côté alimentation : broche d'alim atteinte en premier
 * (ordre de balayage des cartes puis des broches — c'est lui qui tranche quand
 * un net touche à la fois GND et VCC), broches numériques première et dernière,
 * et présence d'une masse quelque part sur le net.
 */
interface NetSupply {
  /** Première broche d'alim rencontrée : elle fixe le niveau du net. */
  first?: 'gnd' | 'vcc';
  /** Première broche numérique du net (broche pilote d'une LED, d'un buzzer…). */
  firstDigital?: string;
  /** Dernière broche numérique : niveau retenu quand aucune alim n'est câblée. */
  lastDigital?: string;
  /** Une masse (MCU) est présente sur le net, même si une VCC vient avant. */
  hasGnd?: boolean;
}

interface NetIndex {
  mcu: Map<string, NetSupply>;
  psuGnd: Set<string>;
  psuVplus: Set<string>;
  /** Liaisons ORIENTÉES du schéma, par nets : un niveau ne les traverse que de
   *  `a` vers `k` (diode A→K, transistor saturé C→E, contact fermé — celui-ci
   *  compte pour deux liaisons tête-bêche, il conduit dans les deux sens). */
  oneWayLinks: Array<{ a: string; k: string }>;
  /** Nets pilotés par une sortie de porte logique et leur niveau. */
  drives: Map<string, 0 | 1>;
}

/**
 * Index net → broches d'alimentation, construit UNE fois par netlist. Sans lui,
 * `netLevel`, `mcuDigitalOnNet` et `netHasGnd` rebalayaient chacun TOUTES les
 * broches de TOUTES les cartes (une Mega en a une centaine) à chaque appel, soit
 * une trentaine de balayages complets par frame de rendu. La clé est l'objet
 * `Nets` lui-même : il correspond à un état figé du schéma (toute modification
 * en reconstruit un neuf), donc l'index ne peut pas être périmé.
 */
const netIndexCache = new WeakMap<Nets, NetIndex>();

function netIndex(diagram: Diagram, nets: Nets): NetIndex {
  const hit = netIndexCache.get(nets);
  if (hit) return hit;
  const index: NetIndex = {
    mcu: new Map(),
    psuGnd: new Set(),
    psuVplus: new Set(),
    oneWayLinks: [],
    drives: new Map(),
  };
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      const role = mcuPinRole(board, pin);
      if (role.role !== 'gnd' && role.role !== 'vcc' && !(role.role === 'digital' && role.name)) {
        continue;
      }
      const net = nets.netOf({ partId: part.id, pin });
      let entry = index.mcu.get(net);
      if (!entry) {
        entry = {};
        index.mcu.set(net, entry);
      }
      if (role.role === 'gnd') {
        entry.hasGnd = true;
        entry.first ??= 'gnd';
      } else if (role.role === 'vcc') {
        entry.first ??= 'vcc';
      } else {
        entry.firstDigital ??= role.name;
        entry.lastDigital = role.name;
      }
    }
  }
  for (const part of psuParts(diagram)) {
    index.psuGnd.add(nets.netOf({ partId: part.id, pin: 'GND' }));
    index.psuVplus.add(nets.netOf({ partId: part.id, pin: 'V+' }));
  }
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'diode') continue;
    index.oneWayLinks.push({
      a: nets.netOf({ partId: part.id, pin: rolePin(part.type, 'A') }),
      k: nets.netOf({ partId: part.id, pin: rolePin(part.type, 'K') }),
    });
  }
  // Ponts commandés fermés : le niveau les franchit comme une diode (le 1
  // descend de `a` vers `b`, le 0 remonte), dans les deux sens pour un contact.
  for (const b of activeBridges) {
    const a = nets.netOf({ partId: b.partId, pin: b.a });
    const k = nets.netOf({ partId: b.partId, pin: b.b });
    index.oneWayLinks.push({ a, k });
    if (!b.oneWay) index.oneWayLinks.push({ a: k, k: a });
  }
  // Sorties de portes logiques. Deux sorties reliées entre elles (câblage
  // douteux mais courant) : le 0 l'emporte, la sortie basse tire le net à la
  // masse à travers celle qui est haute.
  for (const d of gateDrives) {
    const net = nets.netOf({ partId: d.partId, pin: d.pin });
    index.drives.set(net, index.drives.get(net) === 0 || d.level === 0 ? 0 : 1);
  }
  netIndexCache.set(nets, index);
  return index;
}

/**
 * Détermine le niveau d'un net d'après les broches MCU qui s'y rattachent. GND
 * est prioritaire sur VCC, lui-même prioritaire sur les broches pilotées par le
 * microcontrôleur.
 */
function netLevel(
  diagram: Diagram,
  nets: Nets,
  netId: string,
  readPin: (name: string) => boolean,
  seen?: Set<string>
): Level {
  const idx = netIndex(diagram, nets);
  const entry = idx.mcu.get(netId);
  if (entry?.first === 'gnd') return 0;
  if (entry?.first === 'vcc') return 1;
  // Alimentation de laboratoire : V+ = rail haut, GND = masse. Le niveau est
  // logique (binaire) — la TENSION réelle de l'alim est prise en compte par les
  // calculs de courant (ledElectrical via ledPowerCircuit, psuLoadAmps).
  if (idx.psuGnd.has(netId)) return 0;
  if (idx.psuVplus.has(netId)) return 1;
  // Sortie de porte logique AVANT la broche de carte : une sortie de CI câblée
  // sur une entrée de carte doit imposer SON niveau, pas relire celui que la
  // carte croit avoir sur cette broche.
  const driven = idx.drives.get(netId);
  if (driven !== undefined) return driven;
  if (entry?.lastDigital !== undefined) return readPin(entry.lastDigital) ? 1 : 0;
  return linkedLevel(diagram, nets, netId, readPin, seen);
}

/**
 * Niveau amené sur un net PAR UNE LIAISON ORIENTÉE (diode, transistor saturé,
 * contact de relais fermé), quand rien ne le pilote directement : un niveau
 * HAUT ne franchit une diode que de l'anode vers la cathode, un niveau BAS que
 * de la cathode vers l'anode (le net est alors tiré à la masse à travers elle).
 * La masse reste prioritaire, comme pour les nets directs.
 * `seen` coupe les boucles (diodes tête-bêche, ponts).
 */
function linkedLevel(
  diagram: Diagram,
  nets: Nets,
  netId: string,
  readPin: (name: string) => boolean,
  seen?: Set<string>
): Level {
  const idx = netIndex(diagram, nets);
  if (idx.oneWayLinks.length === 0) return undefined;
  const visited = seen ?? new Set<string>();
  if (visited.has(netId)) return undefined;
  visited.add(netId);
  for (const d of idx.oneWayLinks) {
    if (d.a === netId && netLevel(diagram, nets, d.k, readPin, visited) === 0) return 0;
  }
  for (const d of idx.oneWayLinks) {
    if (d.k === netId && netLevel(diagram, nets, d.a, readPin, visited) === 1) return 1;
  }
  return undefined;
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

/**
 * Sens du COURANT dans le chemin cherché, vu depuis `from` :
 *  - 'sink'   : le courant part de `from` vers la cible (chemin vers la masse) ;
 *  - 'source' : le courant vient de la cible vers `from` (chemin vers VCC).
 * Seules les diodes en tiennent compte — elles ne se laissent traverser que
 * dans le sens A → K.
 */
type FlowDir = 'sink' | 'source';

/** Arête du graphe résistif : une résistance (les deux sens) ou une diode
 *  (un seul sens de courant, avec sa chute de tension directe). */
interface ResistiveEdge {
  to: string;
  ohms: number;
  partId: string;
  /** Arête orientée (diode) : le courant ne passe que dans un sens. */
  oneWay?: boolean;
  /** Pour une arête orientée : parcourir cur → `to` suit-il le sens du courant. */
  forward?: boolean;
  /** Tension perdue (V) en traversant l'arête (seuil de la diode, Vce de saturation). */
  drop?: number;
  /** Courant maximal (A) que l'arête laisse passer : un transistor ne transmet
   *  que Gain × Ib. Absent = pas de limite propre à l'arête. */
  limitAmps?: number;
}

/** Plus court chemin (somme des résistances) d'un net vers l'un des nets cibles.
 *  `avoid` : nets qui ne peuvent pas être traversés (rail opposé du diviseur —
 *  un rail est une source équipotentielle, pas un conducteur de passage).
 *  `reached.drop` reçoit la somme des seuils de diode franchis sur ce chemin,
 *  `reached.limitAmps` le plus petit plafond de courant rencontré (transistor). */
function minOhmsPath(
  from: string,
  targets: Set<string>,
  adj: Map<string, ResistiveEdge[]>,
  avoid?: Set<string>,
  reached?: { net?: string; drop?: number; limitAmps?: number },
  dir: FlowDir = 'sink'
): number | null {
  const dist = new Map<string, number>([[from, 0]]);
  const drops = new Map<string, number>([[from, 0]]);
  const limits = new Map<string, number>([[from, Infinity]]);
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
    if (targets.has(cur)) {
      if (reached) {
        reached.net = cur;
        reached.drop = drops.get(cur) ?? 0;
        reached.limitAmps = limits.get(cur) ?? Infinity;
      }
      return best;
    }
    done.add(cur);
    if (avoid?.has(cur)) continue;
    for (const e of adj.get(cur) ?? []) {
      // Diode : franchissable seulement si le courant la traverse de A vers K.
      if (e.oneWay && e.forward !== (dir === 'sink')) continue;
      const d = best + e.ohms;
      if (d < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, d);
        drops.set(e.to, (drops.get(cur) ?? 0) + (e.drop ?? 0));
        limits.set(e.to, Math.min(limits.get(cur) ?? Infinity, e.limitAmps ?? Infinity));
      }
    }
  }
}

/**
 * Résistances variables nues (2 pattes) pilotées par un curseur de simulation,
 * et la grandeur que ce curseur règle : l'attribut de l'inspecteur qui la porte
 * au repos, sa valeur par défaut et le nom de la propriété de l'élément.
 * Photorésistance, thermistances CTN/CTP, phototransistor, photodiode.
 *
 * Une TABLE plutôt qu'une cascade de `type === 'ldr' ? … : …` : la même question
 * (« quelle grandeur pilote ce composant ? ») se posait dans trois fichiers, et
 * chaque nouveau composant y ajoutait un ternaire de plus.
 */
export const VARIABLE_RESISTOR_INPUT: Readonly<Record<string, { attr: string; dflt: number }>> = {
  ldr: { attr: 'lux', dflt: 500 },
  ntc: { attr: 'temperature', dflt: 25 },
  ptc: { attr: 'temperature', dflt: 25 },
  phototransistor: { attr: 'ee', dflt: 1 },
  photodiode: { attr: 'ee', dflt: 1 },
};

export const VARIABLE_RESISTOR_TYPES: ReadonlySet<string> = new Set(Object.keys(VARIABLE_RESISTOR_INPUT));

/** Parmi elles, celles qui ne se lisent que dans un pont diviseur : sans
 *  résistance en série, le montage ne donne rien (photoDeviceBindings). */
export const PHOTO_DEVICE_TYPES: ReadonlySet<string> = new Set(['phototransistor', 'photodiode']);

/**
 * Caractéristique R(x) d'une résistance variable nue (paramètres de
 * l'inspecteur dans `attrs`) :
 *  - ldr : x = éclairement (lx), R = R1lx · x^(−γ) — obscurité totale ≈ 10 MΩ ;
 *  - ntc : x = température (°C), R = R25 · e^(B·(1/T − 1/T25)) (T en kelvins) ;
 *  - ptc : x = température (°C), R = R25 · (1 + tc/100 · (T − 25)) (type KTY) ;
 *  - phototransistor et photodiode : x = éclairement énergétique (mW/cm²),
 *    R = Ron · Eemax/x — même loi, mais la photodiode n'a pas le gain du
 *    transistor, donc cent fois moins de courant et cent fois plus de Ron.
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
  if (type === 'phototransistor' || type === 'photodiode') {
    // Fiche technique : le courant est PROPORTIONNEL à l'éclairement reçu. Vu
    // de la netlist comme une résistance, R = V/I varie donc en 1/Ee : `ron`
    // est sa valeur sous l'éclairement maximal, `rdark` celle dans le noir
    // complet (courant de fuite). Entre les deux, R = ron · eemax / Ee.
    // La photodiode suit la MÊME loi sans l'amplification du transistor : à
    // lumière égale elle laisse passer environ cent fois moins de courant,
    // d'où des valeurs de repli cent fois plus grandes.
    const diode = type === 'photodiode';
    const ron = num('ron', diode ? 20_000 : 200);
    const rdark = num('rdark', diode ? 1e8 : 1e7);
    const eemax = num('eemax', 5);
    if (!(x > 0)) return rdark;
    return Math.min(rdark, Math.max(ron, (ron * eemax) / x));
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
  const entree = VARIABLE_RESISTOR_INPUT[part.type];
  if (entree) {
    const x = Number(part.attrs?.[entree.attr]);
    return variableResistorOhms(part.type, Number.isFinite(x) ? x : entree.dflt, part.attrs);
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
interface ResistiveGraph {
  nets: Nets;
  adj: Map<string, ResistiveEdge[]>;
  digitalNets: Set<string>;
  vccNets: Set<string>;
  gndNets: Set<string>;
}

function resistiveGraph(diagram: Diagram, liveOhms?: (part: Part) => number | null): ResistiveGraph {
  // Le graphe dépend du callback `liveOhms` (curseur d'une résistance variable) :
  // une entrée de cache PAR callback. Dans une même frame ses valeurs sont figées.
  if (frameDiagram === diagram) {
    const k = liveOhms ?? NO_LIVE_OHMS;
    const cached = frameGraphs.get(k);
    if (cached) return cached;
    const fresh = computeResistiveGraph(diagram, liveOhms);
    frameGraphs.set(k, fresh);
    return fresh;
  }
  return computeResistiveGraph(diagram, liveOhms);
}

function computeResistiveGraph(
  diagram: Diagram,
  liveOhms?: (part: Part) => number | null
): ResistiveGraph {
  const nets = buildNets(diagram, false);
  const adj = new Map<string, ResistiveEdge[]>();
  const link = (a: string, b: string, edge: Omit<ResistiveEdge, 'to'>) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, ...edge });
  };
  for (const part of diagram.parts) {
    const kind = partDef(part.type).kind;
    if (kind === 'resistor') {
      // Bornes « 1 » et « 2 » du modèle : le phototransistor les nomme c et e,
      // d'où le passage par rolePin plutôt que les noms en dur.
      const a = nets.netOf({ partId: part.id, pin: rolePin(part.type, '1') });
      const b = nets.netOf({ partId: part.id, pin: rolePin(part.type, '2') });
      const ohms = Math.max(0, liveOhms?.(part) ?? nominalOhms(part));
      link(a, b, { ohms, partId: part.id });
      link(b, a, { ohms, partId: part.id });
    } else if (kind === 'diode') {
      // Diode passante de A vers K seulement, en perdant sa tension de seuil.
      // Résistance dynamique négligeable devant celle du circuit (0 Ω).
      const a = nets.netOf({ partId: part.id, pin: rolePin(part.type, 'A') });
      const k = nets.netOf({ partId: part.id, pin: rolePin(part.type, 'K') });
      const drop = diodeForwardV(part);
      link(a, k, { ohms: 0, partId: part.id, oneWay: true, forward: true, drop });
      link(k, a, { ohms: 0, partId: part.id, oneWay: true, forward: false, drop });
    } else if (kind === 'relay') {
      // La bobine est une résistance comme une autre pour le reste du schéma
      // (U²/P, soit 125 Ω sous 5 V) : c'est elle qui fixe le courant appelé.
      const coil = relayPins(part);
      const a = nets.netOf({ partId: part.id, pin: coil.b1 });
      const b = nets.netOf({ partId: part.id, pin: coil.b2 });
      const ohms = coilOhms(part);
      link(a, b, { ohms, partId: part.id });
      link(b, a, { ohms, partId: part.id });
    }
  }
  // Ponts commandés fermés : un transistor saturé conduit de C vers E en
  // perdant son Vce et sans dépasser Gain × Ib ; un contact de relais conduit
  // dans les deux sens, sans perte.
  for (const b of activeBridges) {
    const a = nets.netOf({ partId: b.partId, pin: b.a });
    const k = nets.netOf({ partId: b.partId, pin: b.b });
    const edge = { ohms: 0, partId: b.partId, drop: b.drop, limitAmps: b.limitAmps };
    if (b.oneWay) {
      link(a, k, { ...edge, oneWay: true, forward: true });
      link(k, a, { ...edge, oneWay: true, forward: false });
    } else {
      link(a, k, edge);
      link(k, a, edge);
    }
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
  // Alimentations de laboratoire : V+ = rail haut, GND = masse (mêmes rôles que
  // les broches d'alimentation des cartes dans tous les calculs résistifs).
  for (const part of psuParts(diagram)) {
    vccNets.add(nets.netOf({ partId: part.id, pin: 'V+' }));
    gndNets.add(nets.netOf({ partId: part.id, pin: 'GND' }));
  }
  // Sortie de porte logique : une source au même titre qu'une broche de carte —
  // haute elle alimente (la LED qu'elle pilote s'allume vraiment, avec son
  // courant), basse elle sert de retour à la masse.
  for (const d of gateDrives) {
    const net = nets.netOf({ partId: d.partId, pin: d.pin });
    if (d.level === 1) digitalNets.add(net);
    else gndNets.add(net);
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
  return ledPowerCircuit(diagram, ledId).ohms;
}

/**
 * Circuit résistif d'une LED avec identification de la SOURCE atteinte :
 * `ohms` comme ledSeriesOhms, plus `supplyVolts` = tension de l'alim de
 * laboratoire si le chemin de l'anode aboutit au V+ d'une alim (tension live
 * via `psuVolts(partId)`, à défaut l'attribut `voltage`) — null si la source
 * est une broche de carte (tension = VCC de la carte, choisie par l'appelant).
 */
export function ledPowerCircuit(
  diagram: Diagram,
  ledId: string,
  psuVolts?: (partId: string) => number | null
): { ohms: number | null; supplyVolts: number | null; diodeDrop?: number } {
  const { nets, adj, digitalNets, vccNets, gndNets } = resistiveGraph(diagram);
  const type = partType(diagram, ledId);
  const src = new Set([...digitalNets, ...vccNets]);
  const reached: { net?: string; drop?: number } = {};
  const sink: { drop?: number } = {};
  const up = minOhmsPath(
    nets.netOf({ partId: ledId, pin: rolePin(type, 'A') }), src, adj, undefined, reached, 'source'
  );
  const down = minOhmsPath(
    nets.netOf({ partId: ledId, pin: rolePin(type, 'C') }), gndNets, adj, undefined, sink, 'sink'
  );
  if (up === null || down === null) return { ohms: null, supplyVolts: null };
  let supplyVolts: number | null = null;
  if (reached.net !== undefined) {
    for (const psu of psuParts(diagram)) {
      if (nets.netOf({ partId: psu.id, pin: 'V+' }) !== reached.net) continue;
      const live = psuVolts?.(psu.id);
      const v = live ?? Number(psu.attrs?.voltage ?? 0);
      supplyVolts = Number.isFinite(v) ? v : 0;
      break;
    }
  }
  // Diodes traversées : leur seuil est autant de tension en moins pour la LED.
  const diodeDrop = (reached.drop ?? 0) + (sink.drop ?? 0);
  if (diodeDrop > 0) return { ohms: up + down, supplyVolts, diodeDrop };
  return { ohms: up + down, supplyVolts };
}

/** Tension de seuil (V) d'une diode, depuis son attribut `vf` (0,6 V par défaut). */
function diodeForwardV(part: Part): number {
  const v = Number(part.attrs?.vf);
  return Number.isFinite(v) && v >= 0 ? v : 0.6;
}

/** Courant considéré comme un court-circuit franc sur une alim (A). */
const PSU_SHORT_AMPS = 99;
/** Consommation forfaitaire d'un servomoteur alimenté par l'alim (A). */
const PSU_SERVO_AMPS = 0.2;

/**
 * Courant total (A) débité par l'alim de laboratoire `psuId` réglée sur `volts`
 * — approximation pédagogique, les consommateurs comptés sont :
 *  - le pont résistif le plus direct V+ → masse (I = V/R ; fil direct = 99 A) ;
 *  - chaque LED dont l'anode remonte au V+ de CETTE alim (I = (V − Vf)/R,
 *    99 A si branchée en direct) ;
 *  - chaque servomoteur dont la broche V+ est sur le rail de l'alim (0,2 A) ;
 *  - `extraAmps` : consommateurs calculés par l'appelant (PCA9685…).
 * `liveOhms` : valeur courante des résistances variables (curseurs de simulation).
 */
export function psuLoadAmps(
  diagram: Diagram,
  psuId: string,
  volts: number,
  liveOhms?: (part: Part) => number | null,
  extraAmps = 0
): number {
  const { nets, adj, gndNets } = resistiveGraph(diagram, liveOhms);
  const vplus = nets.netOf({ partId: psuId, pin: 'V+' });
  let amps = extraAmps;
  // Pont résistif direct V+ → masse (un fil V+↔GND fusionne les nets → 0 Ω).
  const bridge = gndNets.has(vplus) ? 0 : minOhmsPath(vplus, gndNets, adj);
  if (bridge !== null) amps += bridge <= 0.5 ? PSU_SHORT_AMPS : volts / bridge;
  for (const part of diagram.parts) {
    const kind = partDef(part.type).kind;
    if (kind === 'led') {
      const up = minOhmsPath(
        nets.netOf({ partId: part.id, pin: rolePin(part.type, 'A') }),
        new Set([vplus]),
        adj,
        undefined,
        undefined,
        'source'
      );
      const down = minOhmsPath(nets.netOf({ partId: part.id, pin: rolePin(part.type, 'C') }), gndNets, adj);
      if (up === null || down === null) continue;
      const vf = LED_FORWARD_V[(part.attrs?.color ?? 'red').toLowerCase()] ?? 2.0;
      const drop = volts - vf;
      if (drop <= 0) continue;
      const ohms = up + down;
      amps += ohms <= 0 ? PSU_SHORT_AMPS : Math.min(PSU_SHORT_AMPS, drop / ohms);
    } else if (kind === 'servo') {
      if (nets.netOf({ partId: part.id, pin: 'V+' }) === vplus) amps += PSU_SERVO_AMPS;
    }
  }
  return amps;
}

export interface Pca9685Power {
  partId: string;
  /** Alimentation servo présente et suffisante : les sorties peuvent bouger. */
  ok: boolean;
  /** Alim de laboratoire reliée au bornier V+/GND.2 (null si aucune). */
  psuId: string | null;
  /** Surtension sur V+ (> PCA_VOLTS_MAX) : la carte GRILLE (irréversible). */
  overVolt: boolean;
}

/** Fenêtre de tension acceptée sur le bornier V+ du PCA9685 (« 5 V »). */
const PCA_VOLTS_MIN = 4.5;
const PCA_VOLTS_MAX = 5.5;

/**
 * État d'alimentation servo de chaque PCA9685 NATIF : le bornier de droite
 * (V+ ET GND.2) doit être relié à une alim de laboratoire réglée autour de
 * 5 V (4,5–5,5 V, tension live du bouton via `psuVolts`) dont le courant max
 * couvre la charge totale (psuLoadAmps — les servos enfichés sur les colonnes
 * comptent 0,2 A chacun via le rail V+ interne). Sinon les sorties ne bougent
 * pas : la puce répond toujours sur I²C (VCC logique du connecteur Grove),
 * comme sur la vraie carte sans alimentation servo.
 */
export function pca9685PowerState(
  diagram: Diagram,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): Pca9685Power[] {
  const nets = buildNets(diagram);
  const out: Pca9685Power[] = [];
  for (const part of diagram.parts) {
    if (part.type !== 'pca9685') continue;
    const vNet = nets.netOf({ partId: part.id, pin: 'V+' });
    const gNet = nets.netOf({ partId: part.id, pin: 'GND.2' });
    let ok = false;
    let overVolt = false;
    let psuId: string | null = null;
    for (const psu of psuParts(diagram)) {
      if (nets.netOf({ partId: psu.id, pin: 'V+' }) !== vNet) continue;
      if (nets.netOf({ partId: psu.id, pin: 'GND' }) !== gNet) continue;
      psuId = psu.id;
      const live = psuVolts?.(psu.id);
      const v = live ?? (Number(psu.attrs?.voltage ?? 0) || 0);
      // Surtension : au-delà de 5,5 V sur le bornier V+, la carte grille
      // (demande de Frank — comportement réel : les servos/le PCA n'encaissent
      // pas plus). Signalé à part de la sous-tension (qui rend juste inerte).
      if (v > PCA_VOLTS_MAX) { overVolt = true; break; }
      if (v < PCA_VOLTS_MIN) break;
      const maxAmps = Math.max(0.05, Number(psu.attrs?.maxcurrent ?? 1) || 1);
      if (psuLoadAmps(diagram, psu.id, v, liveOhms) > maxAmps) break;
      ok = true;
      break;
    }
    out.push({ partId: part.id, ok, psuId, overVolt });
  }
  return out;
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
      const up = minOhmsPath(net, vccNets, adj, gndNets, undefined, 'source');
      const down = minOhmsPath(net, gndNets, adj, vccNets, undefined, 'sink');
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

/** Ce que le microcontrôleur impose sur une broche (cf. SimEngine.readPinDrive). */
export type PinDrive = 'high' | 'low' | 'pullup' | 'pulldown' | 'hiz';

/** Résistance interne (Ω) des sources vues par un réseau RC. */
const RAIL_OHMS = 1; //         rail d'alimentation (carte ou alim de labo)
const MCU_OUTPUT_OHMS = 25; //  sortie numérique en conduction
const MCU_PULL_OHMS = 65_000; // rappel interne (RP2040 50-80 kΩ, AVR 20-50 kΩ)

/** Nœud RC : un condensateur, sa source de Thévenin et les broches qui l'observent. */
export interface CapacitorNode {
  partId: string;
  /** Capacité (F). */
  farads: number;
  /** Tension d'équilibre du nœud (V) — la charge y tend exponentiellement. */
  target: number;
  /** Constante de temps RC (s) ; la charge est pleine à 5·RC. */
  tau: number;
  /** Tension de service maximale (V) : au-delà le condensateur claque. */
  vmax: number;
  /** Broches MCU reliées au nœud chaud (elles LISENT la tension du condensateur). */
  mcuPins: string[];
}

/**
 * Réseaux RC du schéma : pour chaque condensateur, l'équivalent de Thévenin vu
 * par son armature « chaude » (celle qui n'est pas à la masse).
 *
 * Chaque source du montage (rail VCC/GND, sortie MCU haute ou basse, rappel
 * interne) est une branche : sa résistance est le plus court chemin résistif du
 * nœud jusqu'à elle (les AUTRES sources étant infranchissables — un rail est une
 * équipotentielle, pas un conducteur de passage), plus sa résistance interne. Le
 * théorème de Millman donne alors Rth = 1/ΣGi et Vth = ΣViGi / ΣGi : c'est exactement
 * le pont diviseur R haute / R basse dans le cas classique, et la seule pull-up
 * interne dans le montage « entrée + condensateur » d'Arduino ou du Pico.
 *
 * Aucune source atteignable → nœud flottant : `tau` vaut Infinity et la tension
 * garde sa valeur (l'appelant ne l'intègre pas).
 */
export function capacitorNodes(
  diagram: Diagram,
  vcc: number,
  drive?: (pin: string) => PinDrive,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): CapacitorNode[] {
  const caps = diagram.parts.filter((p) => partDef(p.type).kind === 'capacitor');
  if (caps.length === 0) return [];
  const { nets, adj, vccNets, gndNets } = resistiveGraph(diagram, liveOhms);
  const { sources, pinsOnNet } = circuitSources(diagram, vcc, nets, vccNets, gndNets, drive, psuVolts);
  const sourceNets = new Set(sources.map((s) => s.net));
  const out: CapacitorNode[] = [];
  for (const cap of caps) {
    const n1 = nets.netOf({ partId: cap.id, pin: '1' });
    const n2 = nets.netOf({ partId: cap.id, pin: '2' });
    // L'armature de référence est celle qui est à la masse ; à défaut la seconde.
    const hot = gndNets.has(n1) && !gndNets.has(n2) ? n2 : n1;
    const farads = capacitorFarads(cap);
    const vmaxAttr = Number(cap.attrs?.vmax);
    const node: CapacitorNode = {
      partId: cap.id,
      farads,
      target: 0,
      tau: Infinity,
      vmax: Number.isFinite(vmaxAttr) && vmaxAttr > 0 ? vmaxAttr : 400,
      mcuPins: pinsOnNet.get(hot) ?? [],
    };
    if (gndNets.has(hot)) {
      // Les deux armatures à la masse : court-circuit, rien à intégrer.
      node.target = 0;
      node.tau = 0;
      out.push(node);
      continue;
    }
    const th = theveninNode(hot, sources, sourceNets, adj);
    if (th) {
      node.target = th.volts;
      node.tau = farads > 0 ? th.ohms * farads : 0;
    }
    out.push(node);
  }
  return out;
}

/** Une branche du montage qui impose une tension : rail, sortie ou rappel MCU. */
interface CircuitSource {
  net: string;
  volts: number;
  ohms: number;
}

/**
 * Sources de tension du schéma : les rails d'abord (VCC de la carte, ou tension
 * de l'alim de laboratoire quand c'est elle qui tient le rail ; masse à 0 V),
 * puis chaque broche numérique du MCU selon ce que le firmware lui impose —
 * sortie haute ou basse (25 Ω), rappel interne au plus ou au moins (65 kΩ), et
 * rien du tout en entrée haute impédance.
 *
 * `pinsOnNet` recense au passage, pour chaque net, les broches numériques qui
 * l'observent (l'appelant s'en sert pour savoir qui LIT une tension).
 */
function circuitSources(
  diagram: Diagram,
  vcc: number,
  nets: Nets,
  vccNets: ReadonlySet<string>,
  gndNets: ReadonlySet<string>,
  drive?: (pin: string) => PinDrive,
  psuVolts?: (partId: string) => number | null
): { sources: CircuitSource[]; pinsOnNet: Map<string, string[]> } {
  const sources: CircuitSource[] = [];
  for (const net of vccNets) {
    let volts = vcc;
    for (const psu of psuParts(diagram)) {
      if (nets.netOf({ partId: psu.id, pin: 'V+' }) !== net) continue;
      const v = psuVolts?.(psu.id) ?? Number(psu.attrs?.voltage ?? 0);
      if (Number.isFinite(v)) volts = v;
      break;
    }
    sources.push({ net, volts, ohms: RAIL_OHMS });
  }
  for (const net of gndNets) sources.push({ net, volts: 0, ohms: RAIL_OHMS });
  const pinsOnNet = new Map<string, string[]>();
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      const role = mcuPinRole(board, pin);
      if (role.role !== 'digital' || !role.name) continue;
      const net = nets.netOf({ partId: part.id, pin });
      if (vccNets.has(net) || gndNets.has(net)) continue; // broche collée à un rail
      const list = pinsOnNet.get(net);
      if (list) list.push(role.name);
      else pinsOnNet.set(net, [role.name]);
      switch (drive?.(role.name)) {
        case 'high':
          sources.push({ net, volts: vcc, ohms: MCU_OUTPUT_OHMS });
          break;
        case 'low':
          sources.push({ net, volts: 0, ohms: MCU_OUTPUT_OHMS });
          break;
        case 'pullup':
          sources.push({ net, volts: vcc, ohms: MCU_PULL_OHMS });
          break;
        case 'pulldown':
          sources.push({ net, volts: 0, ohms: MCU_PULL_OHMS });
          break;
        default: // entrée haute impédance : ne charge pas le nœud
          break;
      }
    }
  }
  return { sources, pinsOnNet };
}

/**
 * Équivalent de Thévenin vu par un nœud : générateur `volts` derrière une
 * résistance `ohms`, c'est-à-dire tout le reste du montage résumé à une pile et
 * une résistance.
 *
 * Chaque source est une branche : sa résistance est le plus court chemin
 * résistif du nœud jusqu'à elle (les AUTRES sources étant infranchissables — un
 * rail est une équipotentielle, pas un conducteur de passage), plus sa
 * résistance interne. Le théorème de Millman donne alors Rth = 1/ΣGi et
 * Vth = ΣViGi/ΣGi : c'est exactement le pont diviseur R haute / R basse dans le
 * cas classique, et la seule pull-up interne dans le montage « entrée +
 * condensateur » d'Arduino ou du Pico.
 *
 * Retourne null quand aucune source n'est atteignable : le nœud est en l'air.
 */
function theveninNode(
  hot: string,
  sources: readonly CircuitSource[],
  sourceNets: ReadonlySet<string>,
  adj: Map<string, ResistiveEdge[]>
): { volts: number; ohms: number } | null {
  let cond = 0; // ΣGi
  let sum = 0; //  ΣViGi
  for (const src of sources) {
    const others = new Set(sourceNets);
    others.delete(src.net);
    // Le nœud analysé n'est jamais un obstacle, même quand une broche du MCU
    // le pilote : sinon le parcours restait bloqué au départ et la pull-up
    // interne devenait la SEULE source vue — le condensateur d'antirebond
    // gardait 5 V, bouton appuyé ou non (Frank, ComLedRGB).
    others.delete(hot);
    let path: number | null;
    if (src.net === hot) path = 0;
    else path = minOhmsPath(hot, new Set([src.net]), adj, others, undefined, src.volts > 0 ? 'source' : 'sink');
    if (path === null) continue;
    const g = 1 / Math.max(0.1, path + src.ohms);
    cond += g;
    sum += src.volts * g;
  }
  if (cond <= 0) return null;
  return { volts: sum / cond, ohms: 1 / cond };
}

/** Ce qu'un multimètre mesure : 'current' (ampèremètre) ou 'voltage' (voltmètre). */
export function meterMode(part: Part): 'current' | 'voltage' {
  return part.attrs?.mode === 'current' ? 'current' : 'voltage';
}

/** Au-delà de ce courant l'ampèremètre ne mesure plus : il court-circuite. */
export const METER_SHORT_AMPS = 1;

/** Ce que lit un multimètre du schéma, prêt à écrire sur son écran. */
export interface MeterReading {
  partId: string;
  mode: 'current' | 'voltage';
  /** Volts (voltmètre) ou ampères (ampèremètre) ; null = rien à mesurer. */
  value: number | null;
  /** '' si tout va bien, 'short' si l'ampèremètre met le montage en court-circuit. */
  fault: '' | 'short';
}

/**
 * Mesures des multimètres du schéma.
 *
 * VOLTMÈTRE : on ne le voit nulle part dans le circuit (résistance d'entrée
 * énorme, il ne prend pas de courant). La mesure est simplement la différence
 * des tensions de repos des deux nœuds où sont plantées ses prises.
 *
 * AMPÈREMÈTRE : c'est un fil, donc dans la netlist ses deux prises sont DÉJÀ le
 * même nœud et la tension à ses bornes vaut zéro par construction — impossible
 * d'en tirer un courant. On le ROUVRE donc le temps du calcul : les deux nœuds
 * qu'il relie réapparaissent, chacun avec son générateur équivalent, et le
 * courant qui le traverse est le courant de court-circuit entre eux,
 * I = (V1 − V2) / (R1 + R2). Les autres multimètres du schéma, eux, restent
 * fermés : deux ampèremètres en série se mesurent l'un l'autre correctement.
 */
export function meterReadings(
  diagram: Diagram,
  vcc: number,
  drive?: (pin: string) => PinDrive,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): MeterReading[] {
  // L'oscilloscope (kind 'scope') se lit EXACTEMENT comme un voltmètre : deux
  // prises, la différence des tensions de repos, aucune consommation. Seul son
  // affichage diffère — une courbe au lieu d'un chiffre.
  const meters = diagram.parts.filter((p) => {
    const kind = partDef(p.type).kind;
    return kind === 'meter' || kind === 'scope';
  });
  if (meters.length === 0) return [];
  const out: MeterReading[] = [];
  for (const meter of meters) {
    const mode = meterMode(meter);
    const source = mode === 'current' ? openMeter(diagram, meter.id) : diagram;
    const { nets, adj, vccNets, gndNets } = resistiveGraph(source, liveOhms);
    const { sources } = circuitSources(source, vcc, nets, vccNets, gndNets, drive, psuVolts);
    const sourceNets = new Set(sources.map((s) => s.net));
    const plus = theveninNode(nets.netOf({ partId: meter.id, pin: '+' }), sources, sourceNets, adj);
    const minus = theveninNode(nets.netOf({ partId: meter.id, pin: 'GND' }), sources, sourceNets, adj);
    if (!plus || !minus) {
      // Une prise en l'air (ou les deux) : l'appareil ne mesure rien.
      out.push({ partId: meter.id, mode, value: null, fault: '' });
      continue;
    }
    if (mode === 'voltage') {
      out.push({ partId: meter.id, mode, value: plus.volts - minus.volts, fault: '' });
      continue;
    }
    const amps = (plus.volts - minus.volts) / Math.max(0.1, plus.ohms + minus.ohms);
    const fault = Math.abs(amps) > METER_SHORT_AMPS ? 'short' : '';
    out.push({ partId: meter.id, mode, value: amps, fault });
  }
  return out;
}

/**
 * Copie du schéma où UN multimètre repasse en voltmètre — donc où ses deux
 * prises redeviennent deux nœuds distincts. Les autres n'y touchent pas.
 */
function openMeter(diagram: Diagram, partId: string): Diagram {
  return {
    ...diagram,
    parts: diagram.parts.map((p) =>
      p.id === partId ? { ...p, attrs: { ...(p.attrs ?? {}), mode: 'voltage' } } : p
    ),
  };
}

/** Capacité (F) d'un condensateur, depuis son attribut `value` (100 nF par défaut). */
function capacitorFarads(part: Part): number {
  const f = Number(part.attrs?.value);
  return Number.isFinite(f) && f > 0 ? f : 1e-7;
}

/** Courant (A) que peut fournir chaque type de source alimentant un moteur. */
const USB_RAIL_AMPS = 0.5; //  rail 5 V d'une carte alimentée en USB
const MCU_PIN_AMPS = 0.04; //  broche numérique (AVR 40 mA, RP2040 ~12 mA)

/** Circuit d'alimentation d'un ventilateur, vu depuis ses bornes + et −. */
export interface FanCircuit {
  /** Tension à vide de la source atteinte par « + » (V). */
  supplyVolts: number;
  /** Courant que cette source peut débiter (A). */
  supplyAmps: number;
  /** Résistance série du circuit hors ventilateur (Ω). */
  ohms: number;
  /** Broche MCU alimentant « + », si la source est une sortie de carte (PWM). */
  mcuPin: string | null;
}

/**
 * Alimentation d'un ventilateur : remonte de la borne « + » vers une source
 * (V+ d'alim de labo, rail VCC de carte ou broche numérique) et redescend de la
 * borne « − » vers une masse. Retourne null si le circuit est ouvert.
 */
export function fanCircuit(
  diagram: Diagram,
  fanId: string,
  vcc: number,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): FanCircuit | null {
  return dcLoadCircuit(diagram, fanId, '+', '-', vcc, psuVolts, liveOhms);
}

/**
 * Alimentation d'une charge à deux bornes (ventilateur, moteur) : remonte de la
 * borne HAUTE vers une source (V+ d'alim de labo, rail VCC de carte ou broche
 * numérique) et redescend de la borne BASSE vers une masse. Retourne null si le
 * circuit est ouvert. Le nom des bornes est passé en paramètre : le ventilateur
 * est polarisé (+ / −), un moteur à courant continu ne l'est pas (1 / 2).
 */
function dcLoadCircuit(
  diagram: Diagram,
  partId: string,
  hiPin: string,
  loPin: string,
  vcc: number,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): (FanCircuit & { hiNet: string; loNet: string; nets: Nets }) | null {
  const { nets, adj, digitalNets, vccNets, gndNets } = resistiveGraph(diagram, liveOhms);
  const reached: { net?: string; drop?: number; limitAmps?: number } = {};
  const sink: { net?: string; drop?: number; limitAmps?: number } = {};
  const hiNet = nets.netOf({ partId, pin: hiPin });
  const loNet = nets.netOf({ partId, pin: loPin });
  const up = minOhmsPath(hiNet, new Set([...digitalNets, ...vccNets]), adj, undefined, reached, 'source');
  const down = minOhmsPath(loNet, gndNets, adj, undefined, sink, 'sink');
  if (up === null || down === null || reached.net === undefined) return null;
  const src = netSupply(diagram, nets, reached.net, vcc, digitalNets, vccNets, psuVolts);
  // Les diodes du chemin prélèvent leur tension de seuil au passage ; un
  // transistor sur la maille ne transmet que Gain × Ib (s'il ne sature pas, la
  // charge est affamée — c'est le montage aval qui ne marche pas).
  const supplyVolts = Math.max(0, src.volts - (reached.drop ?? 0) - (sink.drop ?? 0));
  const supplyAmps = Math.min(src.amps, reached.limitAmps ?? Infinity, sink.limitAmps ?? Infinity);
  // `nets` accompagne le résultat : hiNet/loNet ne veulent rien dire dans une
  // AUTRE netlist (les identifiants de net dépendent du graphe construit), et
  // l'appelant a besoin d'y chercher la diode de roue libre et le transistor.
  return { supplyVolts, supplyAmps, ohms: up + down, mcuPin: src.mcuPin, hiNet, loNet, nets };
}

/**
 * Source atteinte par un net remontant : tension à vide et courant qu'elle peut
 * débiter. Alim de laboratoire (V+ / courant max réglés), rail VCC d'une carte
 * (0,5 A sur USB) ou sortie numérique (40 mA).
 */
function netSupply(
  diagram: Diagram,
  nets: Nets,
  net: string,
  vcc: number,
  digitalNets: Set<string>,
  vccNets: Set<string>,
  psuVolts?: (partId: string) => number | null
): { volts: number; amps: number; mcuPin: string | null } {
  for (const psu of psuParts(diagram)) {
    if (nets.netOf({ partId: psu.id, pin: 'V+' }) !== net) continue;
    const v = psuVolts?.(psu.id) ?? Number(psu.attrs?.voltage ?? 0);
    const a = Number(psu.attrs?.maxcurrent);
    return {
      volts: Number.isFinite(v) ? v : 0,
      amps: Number.isFinite(a) && a > 0 ? a : 1,
      mcuPin: null,
    };
  }
  if (digitalNets.has(net) && !vccNets.has(net)) {
    return { volts: vcc, amps: MCU_PIN_AMPS, mcuPin: mcuDigitalOnNet(diagram, nets, net) };
  }
  return { volts: vcc, amps: USB_RAIL_AMPS, mcuPin: null };
}

/**
 * Vitesse d'un ventilateur, en fraction 0..1 de son régime nominal.
 * Physique stricte : le moteur est vu comme une résistance R = Unom/Inom en
 * série avec le circuit ; s'il demande plus de courant que la source ne peut en
 * fournir, il ne démarre pas (`starved`), tout comme sous 30 % de sa tension.
 * `duty` : rapport cyclique PWM 0..1 mesuré sur la broche de commande.
 */
export function fanSpeed(
  circuit: FanCircuit | null,
  ratedVolts: number,
  ratedAmps: number,
  duty = 1
): { speed: number; volts: number; amps: number; starved: boolean } {
  const idle = { speed: 0, volts: 0, amps: 0, starved: false };
  if (!circuit || ratedVolts <= 0 || ratedAmps <= 0) return idle;
  const rFan = ratedVolts / ratedAmps;
  const applied = circuit.supplyVolts * Math.max(0, Math.min(1, duty));
  if (applied <= 0) return idle;
  const amps = applied / (rFan + circuit.ohms);
  const volts = amps * rFan;
  // Le courant appelé dépasse ce que la source peut donner : elle s'effondre.
  if (amps > circuit.supplyAmps) return { speed: 0, volts, amps, starved: true };
  const speed = volts / ratedVolts;
  // Sous 30 % de sa tension nominale, un moteur à courant continu ne démarre pas.
  return { speed: speed < 0.3 ? 0 : Math.min(1, speed), volts, amps, starved: false };
}

// --- Moteur à courant continu -----------------------------------------------

/** Fraction de la tension nominale sous laquelle un moteur ne démarre pas. */
const MOTOR_START_RATIO = 0.3;
/** Au-delà de ce multiple de sa tension nominale, le moteur GRILLE. */
export const MOTOR_BURN_RATIO = 1.5;
/** Vitesse maximale affichée, en multiple du régime nominal : un moteur
 *  survolté tourne plus vite, mais pas indéfiniment (il grille avant). */
const MOTOR_MAX_SPEED = MOTOR_BURN_RATIO;

/** Ce qui empêche un moteur à courant continu de tourner correctement. */
export type MotorFault = 'none' | 'no-diode' | 'reversed-diode' | 'starved' | 'overvolt';

export interface MotorState {
  partId: string;
  /** Le moteur est alimenté (les deux bornes voient un + et une masse). */
  powered: boolean;
  /** Tension réellement appliquée à ses bornes (V). */
  volts: number;
  /** Courant appelé (A). */
  amps: number;
  /** Vitesse en fraction du régime nominal (0 = arrêté, 1 = nominal). */
  speed: number;
  fault: MotorFault;
  /** Composant à ENCADRER : la diode montée à l'envers, ou le transistor de
   *  commande détruit par la surtension de coupure. */
  faultPartId?: string;
  /** Transistor de commande DÉTRUIT par l'absence de diode de roue libre. */
  blownTransistorId?: string;
}

/**
 * État de chaque moteur à courant continu du schéma.
 *
 * Un moteur n'est pas polarisé : ses deux fils sont interchangeables, on essaie
 * donc les deux sens et on garde celui qui met un + d'un côté et une masse de
 * l'autre. Sa vitesse suit la TENSION appliquée (`speed` = U/Unom) ; il ne
 * démarre pas sous 30 % de sa tension nominale, ni si la source ne peut pas
 * fournir le courant qu'il demande, et il GRILLE au-delà de 1,5 fois sa tension
 * nominale.
 *
 * Comme une bobine de relais, un moteur est une INDUCTANCE : à la coupure il
 * renvoie une surtension qui détruit le transistor de commande. Une diode de
 * roue libre est donc obligatoire — sauf derrière un MOSFET dont le schéma
 * interne en porte déjà une (diode de structure du `nmos-d`).
 */
export function motorStates(
  diagram: Diagram,
  vcc: number,
  duty?: (mcuPin: string | null) => number,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): MotorState[] {
  const parts = diagram.parts.filter((p) => partDef(p.type).kind === 'motor');
  if (parts.length === 0) return [];
  const out: MotorState[] = [];
  for (const part of parts) {
    const idle: MotorState = {
      partId: part.id, powered: false, volts: 0, amps: 0, speed: 0, fault: 'none',
    };
    // Les deux fils sont interchangeables : le bon sens est celui qui trouve à
    // la fois une source en haut et une masse en bas.
    const circuit =
      dcLoadCircuit(diagram, part.id, '1', '2', vcc, psuVolts, liveOhms) ??
      dcLoadCircuit(diagram, part.id, '2', '1', vcc, psuVolts, liveOhms);
    if (!circuit) {
      out.push(idle);
      continue;
    }
    const rated = numAttr(part, 'voltage', 5);
    const noLoad = numAttr(part, 'current', 0.2);
    if (rated <= 0 || noLoad <= 0) {
      out.push(idle);
      continue;
    }
    // Le moteur est vu comme sa résistance à vide, en série avec le circuit.
    const rMotor = rated / noLoad;
    const applied = circuit.supplyVolts * Math.max(0, Math.min(1, duty?.(circuit.mcuPin) ?? 1));
    if (applied <= 0) {
      out.push({ ...idle, powered: true });
      continue;
    }
    const amps = applied / (rMotor + circuit.ohms);
    const volts = amps * rMotor;
    // Le courant appelé dépasse ce que la source peut donner : elle s'effondre
    // et le moteur ne démarre pas (broche de carte sur un moteur, typiquement).
    if (amps > circuit.supplyAmps) {
      out.push({ ...idle, powered: true, volts, amps, fault: 'starved' });
      continue;
    }
    // Roue libre : passée en revue AVANT la surtension, c'est le défaut de
    // câblage — celui qui détruit le transistor, pas le moteur.
    const driver = motorDriver(diagram, circuit.nets, circuit.hiNet, circuit.loNet);
    const flyback = driver ? flybackFault(diagram, circuit.nets, circuit.hiNet, circuit.loNet) : null;
    if (driver && flyback) {
      out.push({
        partId: part.id, powered: true, volts, amps, speed: 0, fault: flyback.fault,
        faultPartId: flyback.diodeId ?? driver.id,
        // Sans diode du tout, c'est le transistor qui part : la surtension de
        // coupure passe entièrement à travers lui.
        ...(flyback.fault === 'no-diode' ? { blownTransistorId: driver.id } : {}),
      });
      continue;
    }
    if (volts > MOTOR_BURN_RATIO * rated) {
      out.push({ partId: part.id, powered: true, volts, amps, speed: 0, fault: 'overvolt' });
      continue;
    }
    const ratio = volts / rated;
    out.push({
      partId: part.id, powered: true, volts, amps,
      speed: ratio < MOTOR_START_RATIO ? 0 : Math.min(MOTOR_MAX_SPEED, ratio),
      fault: 'none',
    });
  }
  return out;
}

/**
 * Broche de carte qui alimente ce moteur, s'il en est commandé une : c'est elle
 * que le moteur de simulation surveille en rapport cyclique (PWM), la seule
 * façon de faire varier la vitesse depuis un programme.
 */
export function motorMcuPin(diagram: Diagram, motorId: string, vcc: number): string | null {
  const circuit =
    dcLoadCircuit(diagram, motorId, '1', '2', vcc) ?? dcLoadCircuit(diagram, motorId, '2', '1', vcc);
  return circuit?.mcuPin ?? null;
}

/**
 * Transistor qui COMMANDE ce moteur : celui dont le collecteur (ou le drain)
 * touche l'une des deux bornes. Sans lui, personne ne coupe le courant — un
 * moteur câblé en direct sur une alimentation n'a pas besoin de roue libre.
 * Un MOSFET dont le schéma interne porte déjà sa diode de structure (`nmos-d`)
 * ne compte pas non plus : la roue libre est dans le boîtier.
 */
function motorDriver(diagram: Diagram, nets: Nets, hiNet: string, loNet: string): Part | null {
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'transistor') continue;
    if (partAttr(part, 'schema', '') === 'nmos-d') continue; // diode intégrée
    const pins = transistorPins(part);
    for (const pin of [pins.c, pins.e]) {
      const net = nets.netOf({ partId: part.id, pin });
      if (net === hiNet || net === loNet) return part;
    }
  }
  return null;
}

// --- Ponts commandés : transistors bipolaires et relais ----------------------

/** Tension base-émetteur d'un bipolaire au silicium qui conduit (V). */
const VBE_ON = 0.7;
/** Tension collecteur-émetteur d'un bipolaire SATURÉ (V). */
const VCE_SAT = 0.2;
/** Darlington : DEUX jonctions base-émetteur en série, donc deux fois plus. */
const VBE_DARLINGTON = 1.4;
/** Darlington saturé : le Vbe du second transistor s'ajoute à sa saturation. */
const VCE_SAT_DARLINGTON = 0.9;
/** MOSFET passant : sa chute est celle de Rds(on), négligeable ici. */
const VDS_ON = 0;
/** Courant de base retenu quand la base est câblée SANS résistance (A) : la
 *  maille ne limite rien, le transistor sature à coup sûr (et chaufferait). */
const BASE_DIRECT_AMPS = 0.1;

/** Puissance de la bobine d'un G5V (W) : Rbobine = U²/P (5 V → 125 Ω, 40 mA). */
const COIL_WATTS = 0.2;
/** Fraction de la tension nominale à partir de laquelle la bobine colle. */
const PULL_IN_RATIO = 0.8;

export interface TransistorState {
  partId: string;
  /** NPN (sinon PNP : tout s'inverse, le courant entre par l'émetteur).
   *  Un MOSFET canal N compte comme un NPN : le courant entre par le drain. */
  npn: boolean;
  /** MOSFET : commandé en TENSION, sa grille ne consomme aucun courant. */
  mos: boolean;
  /** Base polarisée dans le bon sens : le transistor conduit. */
  on: boolean;
  /** Courant de base imposé par la maille de base (A). Nul sur un MOSFET. */
  baseAmps: number;
  /** Courant maximal transmis au collecteur (A) = Gain × Ib. Au-delà, le
   *  transistor sort de la saturation et le montage aval ne marche plus.
   *  Sur un MOSFET, c'est simplement son courant de drain maximal. */
  maxCollectorAmps: number;
  /** Tension perdue dans le composant passant (V) : Vce de saturation. */
  drop: number;
}

/** Ce qui empêche un relais de coller. */
export type RelayFault = 'none' | 'no-diode' | 'reversed-diode' | 'weak' | 'starved';

export interface RelayState {
  partId: string;
  /** Une tension est appliquée à la bobine (B1 haut et B2 bas, ou l'inverse). */
  commanded: boolean;
  /** Contact travail (NO) fermé ; sinon c'est le repos (NF) qui l'est. */
  closed: boolean;
  /** Tension réellement appliquée à la bobine (V) et courant qui la traverse (A). */
  coilVolts: number;
  coilAmps: number;
  fault: RelayFault;
  /** Composant en cause quand le défaut en désigne un (diode de roue libre
   *  montée à l'envers) : son id, pour que le message dise LEQUEL reprendre. */
  faultPartId?: string;
}

/** Valeur d'un attribut : celle de l'instance, sinon le défaut du catalogue. */
function partAttr(part: Part, name: string, dflt: string): string {
  return part.attrs?.[name] ?? partDef(part.type).attrs?.[name] ?? dflt;
}

function numAttr(part: Part, name: string, dflt: number): number {
  const v = Number(part.attrs?.[name] ?? part.attrs?.[`prm_${name}`] ?? partDef(part.type).attrs?.[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

/**
 * Broches E/B/C d'un transistor. Sur une référence figée (PN2222A) les pattes
 * portent le nom de l'électrode ; sur un prototype générique elles sont
 * numérotées 1/2/3 et ce sont les attributs e/b/c qui disent où est chacune.
 *
 * Un MOSFET rend ses électrodes AUX MÊMES PLACES : la grille commande comme une
 * base, le courant entre par le drain et sort par la source. Tout le reste du
 * modèle (ponts, mailles) marche donc sans distinguer les deux familles.
 */
function transistorPins(part: Part): { e: string; b: string; c: string } {
  const def = partDef(part.type);
  const mos = isMosType(partAttr(part, 'symbol', 'npn'));
  if (def.custom) {
    return mos
      ? { e: rolePin(part.type, 'S'), b: rolePin(part.type, 'G'), c: rolePin(part.type, 'D') }
      : { e: rolePin(part.type, 'E'), b: rolePin(part.type, 'B'), c: rolePin(part.type, 'C') };
  }
  if (partAttr(part, 'named', '') !== '') {
    return mos ? { e: 'S', b: 'G', c: 'D' } : { e: 'E', b: 'B', c: 'C' };
  }
  return mos
    ? { e: partAttr(part, 's', '3'), b: partAttr(part, 'g', '1'), c: partAttr(part, 'd', '2') }
    : { e: partAttr(part, 'e', '1'), b: partAttr(part, 'b', '2'), c: partAttr(part, 'c', '3') };
}

/** Broches d'un relais (le commun sort des deux côtés du boîtier natif). */
function relayPins(part: Part): { b1: string; b2: string; com: string; nf: string; no: string } {
  const t = part.type;
  if (partDef(t).custom) {
    return {
      b1: rolePin(t, 'B1'), b2: rolePin(t, 'B2'), com: rolePin(t, 'Com'),
      nf: rolePin(t, 'NF'), no: rolePin(t, 'NO'),
    };
  }
  return { b1: 'B1', b2: 'B2', com: 'Com.1', nf: 'NF', no: 'NO' };
}

/** Résistance de la bobine (Ω) d'après sa tension nominale, à puissance constante. */
function coilOhms(part: Part): number {
  const nominal = numAttr(part, 'voltage', 5);
  return (nominal * nominal) / COIL_WATTS;
}

/**
 * État de chaque transistor du schéma. Il conduit quand sa base est polarisée
 * dans le bon sens (NPN : base haute et émetteur bas ; PNP : l'inverse), et ne
 * transmet alors que Gain × Ib — c'est TOUT le modèle : on vise la saturation,
 * et si le montage aval demande davantage, il ne marche pas.
 */
export function transistorStates(
  diagram: Diagram,
  readPin: (name: string) => boolean,
  vcc: number,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): TransistorState[] {
  const parts = diagram.parts.filter((p) => partDef(p.type).kind === 'transistor');
  if (parts.length === 0) return [];
  const nets = buildNets(diagram);
  const g = resistiveGraph(diagram, liveOhms);
  const { sources, sinks } = levelledRails(diagram, g, readPin);
  const out: TransistorState[] = [];
  for (const part of parts) {
    const pins = transistorPins(part);
    const famille = partAttr(part, 'symbol', 'npn');
    const mos = isMosType(famille);
    // Un MOSFET canal N conduit dans le même sens qu'un NPN : le drain joue le
    // rôle du collecteur, la source celui de l'émetteur.
    const npn = !isPnpType(famille);
    const darlington = isDarlingtonType(famille);
    // Deux jonctions en série dans un darlington : il lui faut 1,4 V sur la base
    // pour conduire, et il ne descend jamais sous 0,9 V entre C et E.
    const vbe = darlington ? VBE_DARLINGTON : VBE_ON;
    const drop = mos ? VDS_ON : darlington ? VCE_SAT_DARLINGTON : VCE_SAT;
    const level = (pin: string): Level =>
      netLevel(diagram, nets, nets.netOf({ partId: part.id, pin }), readPin);
    const on = npn
      ? level(pins.b) === 1 && level(pins.e) === 0
      : level(pins.b) === 0 && level(pins.e) === 1;
    if (!on) {
      out.push({ partId: part.id, npn, mos, on: false, baseAmps: 0, maxCollectorAmps: 0, drop });
      continue;
    }
    // MOSFET : la grille est ISOLÉE, rien n'y entre — pas de maille de base, pas
    // de gain. La tension suffit à ouvrir le canal, qui laisse alors passer
    // jusqu'au courant de drain maximal du composant.
    if (mos) {
      out.push({
        partId: part.id, npn, mos, on: true, baseAmps: 0,
        maxCollectorAmps: numAttr(part, 'icmax', 0.5), drop,
      });
      continue;
    }
    // Maille de base : un NPN prend son courant de base à la source (base → +),
    // un PNP l'évacue vers la masse (base → −). Reste la tension d'attaque
    // moins Vbe, divisée par la résistance de base.
    const rNet = g.nets;
    const bNet = rNet.netOf({ partId: part.id, pin: pins.b });
    const eNet = rNet.netOf({ partId: part.id, pin: pins.e });
    const reached: { net?: string; drop?: number } = {};
    const rb = npn
      ? minOhmsPath(bNet, sources, g.adj, undefined, reached, 'source')
      : minOhmsPath(bNet, sinks, g.adj, undefined, reached, 'sink');
    // Tension d'attaque : celle de la source qui alimente la base (NPN) ou
    // l'émetteur (PNP, dont l'émetteur est au +).
    const supplyNet = npn ? reached.net : emitterSupplyNet(g, eNet, sources);
    const supply = supplyNet === undefined
      ? { volts: vcc, amps: USB_RAIL_AMPS, mcuPin: null }
      : netSupply(diagram, rNet, supplyNet, vcc, g.digitalNets, g.vccNets, psuVolts);
    const drive = Math.max(0, supply.volts - vbe - (reached.drop ?? 0));
    let baseAmps = 0;
    if (rb !== null) baseAmps = rb <= 0 ? BASE_DIRECT_AMPS : Math.min(BASE_DIRECT_AMPS, drive / rb);
    const gain = numAttr(part, 'gain', 100);
    out.push({
      partId: part.id, npn, mos, on: baseAmps > 0, baseAmps,
      maxCollectorAmps: gain * baseAmps, drop,
    });
  }
  return out;
}

/**
 * Rails du schéma classés par NIVEAU : une sortie de carte n'est pas seulement
 * une source, elle absorbe aussi le courant quand elle est à l'état bas (c'est
 * ce qui permet de commander un PNP ou une LED câblée au +). On range donc
 * chaque net numérique du côté de son niveau du moment ; un net en haute
 * impédance n'est ni l'un ni l'autre.
 */
function levelledRails(
  diagram: Diagram,
  g: ResistiveGraph,
  readPin: (name: string) => boolean
): { sources: Set<string>; sinks: Set<string> } {
  const sources = new Set(g.vccNets);
  const sinks = new Set(g.gndNets);
  for (const net of g.digitalNets) {
    const level = netLevel(diagram, g.nets, net, readPin);
    if (level === 1) sources.add(net);
    else if (level === 0) sinks.add(net);
  }
  return { sources, sinks };
}

/** Net de la source qui alimente l'émetteur d'un PNP (son « + »). */
function emitterSupplyNet(g: ResistiveGraph, eNet: string, sources: Set<string>): string | undefined {
  const reached: { net?: string } = {};
  minOhmsPath(eNet, sources, g.adj, undefined, reached, 'source');
  return reached.net;
}

/**
 * État de chaque relais du schéma. La bobine colle si la tension qui lui est
 * réellement appliquée atteint 80 % de sa tension nominale (« must operate
 * voltage » d'un G5V), si la source peut fournir son courant, ET si une diode
 * de roue libre est montée entre B1 et B2, cathode vers le + — sans elle, la
 * surtension de coupure détruirait le transistor de commande.
 */
export function relayStates(
  diagram: Diagram,
  readPin: (name: string) => boolean,
  vcc: number,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): RelayState[] {
  const parts = diagram.parts.filter((p) => partDef(p.type).kind === 'relay');
  if (parts.length === 0) return [];
  const nets = buildNets(diagram);
  const g = resistiveGraph(diagram, liveOhms);
  const { sources, sinks } = levelledRails(diagram, g, readPin);
  const out: RelayState[] = [];
  for (const part of parts) {
    const pins = relayPins(part);
    const level = (pin: string): Level =>
      netLevel(diagram, nets, nets.netOf({ partId: part.id, pin }), readPin);
    const idle: RelayState = {
      partId: part.id, commanded: false, closed: false, coilVolts: 0, coilAmps: 0, fault: 'none',
    };
    // La bobine n'a pas de polarité : on essaie les deux sens et on garde celui
    // qui met bien un + d'un côté et une masse de l'autre.
    const hi = level(pins.b1) === 1 && level(pins.b2) === 0 ? pins.b1
      : level(pins.b2) === 1 && level(pins.b1) === 0 ? pins.b2
      : null;
    if (hi === null) {
      out.push(idle);
      continue;
    }
    const lo = hi === pins.b1 ? pins.b2 : pins.b1;
    const hiNet = g.nets.netOf({ partId: part.id, pin: hi });
    const loNet = g.nets.netOf({ partId: part.id, pin: lo });
    const up: { net?: string; drop?: number; limitAmps?: number } = {};
    const down: { net?: string; drop?: number; limitAmps?: number } = {};
    const rUp = minOhmsPath(hiNet, sources, g.adj, undefined, up, 'source');
    const rDown = minOhmsPath(loNet, sinks, g.adj, undefined, down, 'sink');
    if (rUp === null || rDown === null || up.net === undefined) {
      out.push(idle);
      continue;
    }
    const supply = netSupply(diagram, g.nets, up.net, vcc, g.digitalNets, g.vccNets, psuVolts);
    const rCoil = coilOhms(part);
    const volts = Math.max(0, supply.volts - (up.drop ?? 0) - (down.drop ?? 0));
    // Diviseur : la bobine ne reçoit que sa part de la tension disponible.
    const coilVolts = (volts * rCoil) / (rCoil + rUp + rDown);
    const coilAmps = coilVolts / rCoil;
    const nominal = numAttr(part, 'voltage', 5);
    // Courant réellement disponible : celui de la source, plafonné par le plus
    // petit maillon du chemin (transistor de commande mal saturé, typiquement).
    const maxAmps = Math.min(supply.amps, up.limitAmps ?? Infinity, down.limitAmps ?? Infinity);
    const flyback = flybackFault(diagram, g.nets, hiNet, loNet);
    const fault: RelayFault =
      flyback?.fault
      ?? (coilVolts < PULL_IN_RATIO * nominal ? 'weak'
        : coilAmps > maxAmps ? 'starved'
        : 'none');
    out.push({
      partId: part.id, commanded: true, closed: fault === 'none', coilVolts, coilAmps, fault,
      ...(flyback?.diodeId ? { faultPartId: flyback.diodeId } : {}),
    });
  }
  return out;
}

/**
 * Diode de roue libre montée entre les deux bornes de la bobine : obligatoire,
 * cathode vers le + de l'alimentation. Retourne le défaut constaté (avec l'id de
 * la diode fautive quand il y en a une), ou null si tout est correct.
 */
function flybackFault(
  diagram: Diagram, nets: Nets, hiNet: string, loNet: string
): { fault: 'no-diode' | 'reversed-diode'; diodeId?: string } | null {
  let reversed: string | null = null;
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'diode') continue;
    const a = nets.netOf({ partId: part.id, pin: rolePin(part.type, 'A') });
    const k = nets.netOf({ partId: part.id, pin: rolePin(part.type, 'K') });
    if (k === hiNet && a === loNet) return null; // cathode au +
    if (a === hiNet && k === loNet) reversed = part.id;
  }
  return reversed ? { fault: 'reversed-diode', diodeId: reversed } : { fault: 'no-diode' };
}

/**
 * Ponts fermés à cet instant : collecteur→émetteur des transistors saturés, et
 * contact des relais (travail si la bobine colle, repos sinon). L'état dépend
 * des niveaux, qui dépendent des ponts : l'appelant boucle jusqu'au point fixe
 * (setActiveBridges puis nouvel appel — deux tours suffisent en pratique).
 */
export function commandedBridges(
  diagram: Diagram,
  readPin: (name: string) => boolean,
  vcc: number,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null
): ActiveBridge[] {
  const out: ActiveBridge[] = [];
  for (const st of transistorStates(diagram, readPin, vcc, psuVolts, liveOhms)) {
    if (!st.on) continue;
    const part = diagram.parts.find((p) => p.id === st.partId)!;
    const pins = transistorPins(part);
    // Le courant entre par le collecteur (NPN) ou par l'émetteur (PNP).
    out.push({
      partId: st.partId,
      a: st.npn ? pins.c : pins.e,
      b: st.npn ? pins.e : pins.c,
      drop: st.drop,
      limitAmps: st.maxCollectorAmps,
      oneWay: true,
    });
  }
  for (const st of relayStates(diagram, readPin, vcc, psuVolts, liveOhms)) {
    const part = diagram.parts.find((p) => p.id === st.partId)!;
    const pins = relayPins(part);
    out.push({ partId: st.partId, a: pins.com, b: st.closed ? pins.no : pins.nf });
  }
  return out;
}

/** État des contacts MANUELS, lu sur les composants à l'écran. */
export interface ManualContactState {
  /** Bouton-poussoir enfoncé. */
  pressed?(partId: string): boolean;
  /** Interrupteur à glissière : côté (1 ou 3) relié au commun. */
  slideSide?(partId: string): 1 | 3;
  /** DIP switch : canal (1..8) fermé. */
  dipOn?(partId: string, channel: number): boolean;
}

/**
 * Contacts fermés à la main : bouton enfoncé, interrupteur basculé. Ce sont des
 * ponts comme ceux des relais — sans eux le modèle ne voyait PAS le circuit se
 * fermer, et un condensateur d'antirebond restait chargé par la pull-up alors
 * que le bouton le mettait à la masse (Frank, ComLedRGB).
 *
 * Ils rejoignent la liste des ponts commandés (setActiveBridges) : même point
 * fixe, mêmes caches invalidés.
 */
export function manualContacts(diagram: Diagram, state: ManualContactState): ActiveBridge[] {
  const out: ActiveBridge[] = [];
  for (const part of diagram.parts) {
    const kind = partDef(part.type).kind;
    if (kind === 'pushbutton') {
      // Les pastilles jumelles (.r) sont déjà reliées aux .l par la netlist.
      if (state.pressed?.(part.id)) {
        out.push({ partId: part.id, a: rolePin(part.type, '1.l'), b: rolePin(part.type, '2.l') });
      }
    } else if (kind === 'slide-switch') {
      const side = state.slideSide?.(part.id);
      if (side) out.push({ partId: part.id, a: '2', b: String(side) });
    } else if (kind === 'dip-switch') {
      for (let ch = 1; ch <= 8; ch++) {
        if (state.dipOn?.(part.id, ch)) out.push({ partId: part.id, a: `${ch}a`, b: `${ch}b` });
      }
    }
  }
  return out;
}

// --- Circuits intégrés logiques ---------------------------------------------

/**
 * Ce qui empêche un boîtier logique de fonctionner :
 *  - `unpowered` : une de ses deux pattes d'alimentation n'est pas câblée ;
 *  - `undervolt` : alimenté SOUS le minimum de sa famille — il reste muet ;
 *  - `overvolt`  : alimenté AU-DESSUS du maximum — il est détruit.
 */
export type IcFault = 'none' | 'unpowered' | 'undervolt' | 'overvolt';

export interface LogicIcState {
  partId: string;
  /** Référence du boîtier (« CD4011 », « 74xx00 »). */
  ref: string;
  /** Inscription lisible sur le dessus (« 74HC00 ») — pour les messages. */
  marking: string;
  /** Tension mesurée entre sa patte d'alimentation et sa masse (V). */
  volts: number;
  /** Plage acceptée par la famille du boîtier (V). */
  range: SupplyRange;
  fault: IcFault;
  /** Sorties qui imposent leur niveau. Vide si le boîtier ne fonctionne pas. */
  outputs: ReadonlyArray<{ pin: string; level: 0 | 1 }>;
}

/**
 * État des circuits intégrés logiques du schéma : tension d'alimentation
 * mesurée entre leurs deux pattes d'alim (comme une charge continue), puis
 * niveau de chaque sortie si la tension convient. Une entrée en l'air ne rend
 * pas forcément la sortie indéterminée (voir `gateOutput`).
 * `dead` : boîtiers déjà détruits pendant cette simulation — ils ne sortent
 * plus rien, même si l'alimentation redevient correcte.
 */
export function logicIcStates(
  diagram: Diagram,
  readPin: (name: string) => boolean,
  vcc: number,
  psuVolts?: (partId: string) => number | null,
  liveOhms?: (part: Part) => number | null,
  dead?: ReadonlySet<string>
): LogicIcState[] {
  const out: LogicIcState[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'logic-ic') continue;
    const ref = icRef(part.attrs?.ref ?? '');
    if (!ref) continue;
    const family = part.attrs?.family ?? '';
    const range = icSupplyRange(ref.ref, family);
    const supply = dcLoadCircuit(diagram, part.id, ref.vcc, ref.gnd, vcc, psuVolts, liveOhms);
    const volts = supply ? supply.supplyVolts : 0;
    let fault: IcFault = 'none';
    if (!supply) fault = 'unpowered';
    else if (volts > range.max) fault = 'overvolt';
    else if (volts < range.min) fault = 'undervolt';
    const state: LogicIcState = {
      partId: part.id,
      ref: ref.ref,
      marking: icMarking(ref.ref, family),
      volts,
      range,
      fault,
      outputs: [],
    };
    if (fault !== 'none' || dead?.has(part.id)) {
      out.push(state);
      continue;
    }
    const nets = buildNets(diagram);
    const level = (pin: string): Level =>
      netLevel(diagram, nets, nets.netOf({ partId: part.id, pin }), readPin);
    const outputs: Array<{ pin: string; level: 0 | 1 }> = [];
    for (const gate of ref.gates) {
      const value = gateOutput(ref.op, gate.inputs.map(level));
      if (value !== undefined) outputs.push({ pin: gate.output, level: value });
    }
    out.push({ ...state, outputs });
  }
  return out;
}

/** Sorties actives de tous les boîtiers, prêtes pour `setGateDrives`. */
export function logicIcDrives(states: readonly LogicIcState[]): GateDrive[] {
  return states.flatMap((s) =>
    s.outputs.map((o) => ({ partId: s.partId, pin: o.pin, level: o.level }))
  );
}

/**
 * Sorties de CI reliées à une broche de carte : la simulation doit y injecter
 * le niveau (`setInput`), sinon le programme relit une broche flottante.
 */
export function logicIcMcuInputs(
  diagram: Diagram,
  states: readonly LogicIcState[]
): Array<{ mcuPin: string; level: 0 | 1 }> {
  if (states.length === 0) return [];
  const nets = buildNets(diagram);
  const out: Array<{ mcuPin: string; level: 0 | 1 }> = [];
  for (const s of states) {
    for (const o of s.outputs) {
      const pin = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: s.partId, pin: o.pin }));
      if (pin) out.push({ mcuPin: pin, level: o.level });
    }
  }
  return out;
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

/** Broches d'un capteur à effet Hall : les noms ne bougent pas, seuls leurs
 *  numéros de patte changent d'une référence à l'autre (attrs vplus/gnd/s). */
const HALL_PINS = { vplus: 'V+', gnd: 'GND', out: 'S' } as const;

export interface HallBinding {
  partId: string;
  /** Entrée numérique MCU reliée à la sortie S (null si non câblée). */
  mcuPin: string | null;
  /** V+ atteint un rail haut ET GND une masse : le capteur est alimenté. */
  powered: boolean;
  /**
   * Résistance de rappel au plus câblée entre S et un rail haut (Ω), null si
   * la sortie ne rejoint aucun rail. 0 Ω = sortie soudée EN DIRECT au rail :
   * pas un rappel, un court-circuit dès que le capteur tire à la masse.
   */
  pullupOhms: number | null;
}

/**
 * Capteurs à effet Hall : broche MCU de la sortie, alimentation, et rappel au
 * plus CÂBLÉ. La sortie est à drain ouvert — sans rappel (externe ici, ou le
 * rappel interne du µC que seul le moteur connaît) elle ne monte jamais.
 */
export function hallBindings(diagram: Diagram): HallBinding[] {
  const nets = buildNets(diagram);
  const graph = resistiveGraph(diagram);
  const out: HallBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'hall') continue;
    out.push(openDrainBinding(diagram, nets, graph, part.id, HALL_PINS.out, [[HALL_PINS.vplus, HALL_PINS.gnd]]));
  }
  return out;
}

/**
 * Composants de bibliothèque (.kompix) dont le manifeste déclare une sortie à
 * collecteur ouvert : même lecture que le capteur Hall, mais le brochage vient
 * du paquet — et il peut demander PLUSIEURS alimentations. La barrière optique
 * en a deux, une par barillet : émetteur non alimenté, aucune lumière ne part,
 * et le montage ne peut pas marcher même parfaitement rappelé au plus.
 */
export function customOpenDrainBindings(diagram: Diagram): HallBinding[] {
  const nets = buildNets(diagram);
  const graph = resistiveGraph(diagram);
  const out: HallBinding[] = [];
  for (const part of diagram.parts) {
    const od = partDef(part.type).custom?.openDrain;
    if (!od) continue;
    out.push(openDrainBinding(diagram, nets, graph, part.id, od.out, od.supplies));
  }
  return out;
}

/**
 * Lecture commune d'une sortie à collecteur/drain ouvert : la broche MCU qui
 * l'observe, l'alimentation de CHAQUE bloc du composant, et la résistance du
 * rappel au plus câblé sur la sortie (null = aucun chemin vers un rail haut,
 * 0 Ω = sortie soudée en direct, donc court-circuit dès qu'elle tire).
 */
function openDrainBinding(
  diagram: Diagram,
  nets: ReturnType<typeof buildNets>,
  graph: ReturnType<typeof resistiveGraph>,
  partId: string,
  outPin: string,
  supplies: ReadonlyArray<readonly [string, string]>,
): HallBinding {
  const net = (pin: string) => graph.nets.netOf({ partId, pin });
  const powered = supplies.length > 0 && supplies.every(([vplus, gnd]) =>
    minOhmsPath(net(vplus), graph.vccNets, graph.adj, undefined, undefined, 'source') !== null &&
    minOhmsPath(net(gnd), graph.gndNets, graph.adj, undefined, undefined, 'sink') !== null);
  return {
    partId,
    mcuPin: mcuDigitalOnNet(diagram, nets, nets.netOf({ partId, pin: outPin })) ?? null,
    powered,
    pullupOhms: minOhmsPath(net(outPin), graph.vccNets, graph.adj, undefined, undefined, 'source'),
  };
}

/**
 * Composants photosensibles nus — phototransistor, photodiode. Ils ne se lisent QUE dans
 * un pont diviseur : seuls, ils laissent passer plus ou moins de courant, mais
 * rien ne transforme ce courant en tension. Il leur faut donc une résistance en
 * série, entre eux et l'autre rail.
 *
 * On regarde le montage réel : y a-t-il une boucle rail haut → composant →
 * masse, et combien de résistance porte-t-elle EN DEHORS du composant ? Sa
 * propre arête est retirée du graphe, sans quoi le chemin passerait par lui et
 * toute boucle paraîtrait résistive.
 */
export interface PhotoDeviceBinding {
  partId: string;
  /** Le composant a au moins un fil : sinon il n'y a rien à reprocher. */
  wired: boolean;
  /** Boucle complète rail haut → composant → masse trouvée. */
  looped: boolean;
  /** Résistance en série sur cette boucle (Ω), la sienne exclue ; null sans boucle. */
  seriesOhms: number | null;
}

export function photoDeviceBindings(diagram: Diagram): PhotoDeviceBinding[] {
  const out: PhotoDeviceBinding[] = [];
  const parts = diagram.parts.filter((p) => PHOTO_DEVICE_TYPES.has(p.type));
  if (parts.length === 0) return out;
  const graph = resistiveGraph(diagram);
  for (const part of parts) {
    const a = graph.nets.netOf({ partId: part.id, pin: rolePin(part.type, '1') });
    const b = graph.nets.netOf({ partId: part.id, pin: rolePin(part.type, '2') });
    // Le graphe SANS le composant : ses deux pattes ne communiquent plus par
    // lui, donc un chemin trouvé passe forcément par le reste du montage.
    const adj = new Map<string, ResistiveEdge[]>();
    for (const [net, edges] of graph.adj) adj.set(net, edges.filter((e) => e.partId !== part.id));
    let series: number | null = null;
    for (const [haut, bas] of [[a, b], [b, a]] as const) {
      const up = minOhmsPath(haut, graph.vccNets, adj, undefined, undefined, 'source');
      const down = minOhmsPath(bas, graph.gndNets, adj, undefined, undefined, 'sink');
      if (up === null || down === null) continue;
      const total = up + down;
      if (series === null || total < series) series = total;
    }
    out.push({
      partId: part.id,
      wired: diagram.wires.some((w) => w.a.partId === part.id || w.b.partId === part.id),
      looped: series !== null,
      seriesOhms: series,
    });
  }
  return out;
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

export interface PatteBinding {
  partId: string;
  /** Broche MCU de chaque articulation (null si non câblée au MCU). */
  coxa: string | null;
  patella: string | null;
}

/** Pattes de robot : broche MCU de chaque articulation (coxa, patella),
 *  résolues indépendamment — même principe qu'une LED RGB à 2 canaux. */
export function patteBindings(diagram: Diagram): PatteBinding[] {
  const nets = buildNets(diagram);
  const bindings: PatteBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== 'patte') continue;
    const pinOf = (pin: string): string | null =>
      mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin }));
    const coxa = pinOf('coxa.PWM');
    const patella = pinOf('patella.PWM');
    if (coxa || patella) bindings.push({ partId: part.id, coxa, patella });
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

/**
 * Toutes les broches MCU à mesurer en RAPPORT CYCLIQUE (`setPulseMonitors`).
 *
 * Une broche pilotée en PWM (`analogWrite`, `tone`, bit-banging) passe son temps
 * à basculer : le niveau lu à l'instant du rafraîchissement vaut 0 ou 1 au
 * hasard de la phase, et le composant CLIGNOTE au lieu de montrer sa valeur
 * moyenne. Seules les broches listées ici sont échantillonnée front par front
 * par le moteur — un oubli dans cette liste EST le clignotement (LED sur une
 * broche PWM, retour Frank).
 *
 * `vcc` sert aux charges à deux bornes (ventilateur, moteur), dont la broche de
 * commande se déduit du circuit d'alimentation.
 */
export function pulseMonitorPins(diagram: Diagram, vcc: number): string[] {
  const pins: Array<string | null | undefined> = [];
  for (const b of servoBindings(diagram)) pins.push(b.mcuPin);
  for (const b of patteBindings(diagram)) pins.push(b.coxa, b.patella);
  for (const b of buzzerBindings(diagram)) pins.push(b.mcuPin);
  for (const b of rgbLedBindings(diagram)) pins.push(b.r, b.g, b.b);
  for (const b of sevenSegmentBindings(diagram)) pins.push(...Object.values(b.segments));
  for (const part of diagram.parts) {
    const kind = partDef(part.type).kind;
    // LED simple : c'est le montage du variateur de luminosité le plus courant.
    if (kind === 'led') pins.push(ledMcuPin(diagram, part.id));
    else if (kind === 'fan') pins.push(fanCircuit(diagram, part.id, vcc)?.mcuPin);
    else if (kind === 'motor') pins.push(motorMcuPin(diagram, part.id, vcc));
  }
  return [...new Set(pins.filter((p): p is string => !!p))];
}

export interface SevenSegmentMuxBinding {
  partId: string;
  digits: number;
  commonAnode: boolean;
  /** Broche MCU de chaque segment A..DP (index 0..7), null si non câblé. */
  segPins: (string | null)[];
  /** Broche MCU de chaque broche commune DIG1..DIGn, null si non câblé. */
  digitPins: (string | null)[];
  /**
   * Niveau IMPOSÉ PAR UN RAIL pour chaque segment A..DP : 1 si le net est collé à
   * une alimentation, 0 s'il est collé à la masse, null sinon. Un segment câblé
   * en dur — les deux points d'une horloge, reliés au 3,3 V par une résistance —
   * n'a aucune broche MCU : sans ça il restait éteint pour toujours.
   */
  segFixed: (number | null)[];
  /** Idem pour chaque commun DIG1..DIGn (un commun soudé à la masse reste actif). */
  digitFixed: (number | null)[];
}

/**
 * Afficheurs 7 segments MULTIPLEXÉS (≥ 2 chiffres) : broche MCU de chaque
 * segment et de chaque commun de chiffre, RÉSOLUE UNE FOIS (buildNets coûteux).
 * Permet ensuite d'échantillonner le latch d'affichage à HAUTE FRÉQUENCE (à
 * chaque front GPIO) par de simples lectures de broches, sans rebâtir les nets.
 * Sans ça, le latch n'était rafraîchi qu'au rythme du rendu (~16 ms) alors que
 * chaque chiffre n'est actif que ~2 ms → des chiffres étaient ratés (affichage
 * « chiffre par chiffre », très lent).
 */
export function sevenSegmentMuxBindings(diagram: Diagram): SevenSegmentMuxBinding[] {
  const nets = buildNets(diagram);
  const out: SevenSegmentMuxBinding[] = [];
  for (const part of diagram.parts) {
    if (partDef(part.type).kind !== '7segment') continue;
    const digits = Math.max(1, Number(part.attrs?.digits ?? 1) || 1);
    if (digits <= 1) continue; // 1 chiffre : lissé par sevenSegStable
    const pinOf = (pin: string): string | null =>
      mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin }));
    // Niveau figé d'une broche reliée à un rail (alimentation ou masse) et à
    // aucune sortie MCU : c'est le cas des deux points d'une horloge, câblés au
    // 3,3 V à travers une résistance.
    const fixedOf = (pin: string): number | null => {
      const net = nets.netOf({ partId: part.id, pin });
      if (netHasVcc(diagram, nets, net)) return 1;
      if (netHasGnd(diagram, nets, net)) return 0;
      return null;
    };
    const SEGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'];
    const segPins = SEGS.map(pinOf);
    const segFixed = SEGS.map(fixedOf);
    const digitPins: (string | null)[] = [];
    const digitFixed: (number | null)[] = [];
    for (let d = 0; d < digits; d++) {
      digitPins.push(pinOf(`DIG${d + 1}`));
      digitFixed.push(fixedOf(`DIG${d + 1}`));
    }
    out.push({
      partId: part.id, digits, commonAnode: part.attrs?.common === 'anode',
      segPins, digitPins, segFixed, digitFixed,
    });
  }
  return out;
}

export interface Pca9685Binding {
  /** Identifiant du PCA9685. */
  partId: string;
  /** Canaux reliés à un composant pilotable (servo, LED, buzzer, patte).
   *  `targetPin` = broche exacte touchée par le fil (ex. 'coxa.PWM' pour une
   *  patte à 2 articulations ; sans intérêt pour les cibles à 1 seule broche PWM). */
  channels: Array<{ ch: number; targetId: string; targetKind: PartKind; targetPin: string }>;
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
      let found: { ch: number; targetId: string; targetKind: PartKind; targetPin: string } | null = null;
      for (const w of diagram.wires) {
        for (const ep of [w.a, w.b]) {
          if (ep.partId === part.id || nets.netOf(ep) !== net) continue;
          const k = kindOf(ep.partId);
          if (k === 'servo' || k === 'led' || k === 'buzzer' || k === 'patte') {
            found = { ch, targetId: ep.partId, targetKind: k, targetPin: ep.pin };
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
  /** Modèle du capteur : le DHT11 code des entiers, le DHT22 des dixièmes. */
  model?: 'dht11' | 'dht22';
  partId: string;
  /** Broche MCU reliée à la ligne de données (DATA, 1-wire). */
  pin: string;
}

/** Capteurs DHT (11 ou 22) du schéma dont la ligne de données va à une broche MCU. */
export function dht22Bindings(diagram: Diagram): Dht22Binding[] {
  const nets = buildNets(diagram);
  const out: Dht22Binding[] = [];
  for (const part of diagram.parts) {
    if (part.type !== 'dht22' && part.type !== 'dht11') continue;
    const pin = mcuDigitalOnNet(diagram, nets, nets.netOf({ partId: part.id, pin: 'DATA' }));
    if (pin) out.push({ partId: part.id, pin, model: part.type === 'dht11' ? 'dht11' : 'dht22' });
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
  /** Nombre de LED de ce composant. */
  count: number;
  /**
   * Rang de sa première LED dans la chaîne : les composants câblés en série
   * (DOUT → DIN) partagent une seule trame WS2812, chacun consommant `count`
   * couleurs à la suite du précédent.
   */
  offset: number;
}

/** Nombre de LED d'un composant NeoPixel (matrice, anneau ou pixel simple). */
function neopixelCount(part: Part): number {
  const a = part.attrs ?? {};
  if (part.type === 'neopixel-matrix') return (Number(a.rows) || 8) * (Number(a.cols) || 8);
  if (part.type === 'led-ring') return Number(a.pixels) || 16;
  return Number(a.count) || 1;
}

/**
 * Chaînes NeoPixel (WS2812) dont l'entrée DIN est reliée à une broche MCU, en
 * suivant le CHAÎNAGE : la sortie DOUT d'un composant alimente le DIN du
 * suivant, et tous se partagent alors la même trame — le premier prend les
 * `count` premières couleurs, le deuxième les suivantes, etc. Sans ce
 * parcours, seul le composant de tête était reconnu : les autres restaient
 * éteints et celui de tête affichait la couleur destinée à ses voisins (repro
 * `neopixel-pico.projix` : la LED de tête clignotait une fois sur trois).
 */
export function neopixelBindings(diagram: Diagram): NeopixelBinding[] {
  const nets = buildNets(diagram);
  const strips = diagram.parts.filter((p) => partDef(p.type).kind === 'neopixel');
  const dinNet = new Map<string, string>();
  const doutNet = new Map<string, string>();
  for (const p of strips) {
    dinNet.set(p.id, nets.netOf({ partId: p.id, pin: rolePin(p.type, 'DIN') }));
    doutNet.set(p.id, nets.netOf({ partId: p.id, pin: rolePin(p.type, 'DOUT') }));
  }
  const bindings: NeopixelBinding[] = [];
  const placed = new Set<string>(); // déjà rangé dans une chaîne (anti-boucle)
  for (const head of strips) {
    if (placed.has(head.id)) continue;
    const mcuPin = mcuDigitalOnNet(diagram, nets, dinNet.get(head.id) ?? '');
    if (!mcuPin) continue; // maillon intermédiaire : atteint depuis sa tête de chaîne
    let cur: Part | undefined = head;
    let offset = 0;
    while (cur && !placed.has(cur.id)) {
      placed.add(cur.id);
      const count = neopixelCount(cur);
      bindings.push({ partId: cur.id, mcuPin, count, offset });
      offset += count;
      const out = doutNet.get(cur.id);
      cur = out ? strips.find((p) => !placed.has(p.id) && dinNet.get(p.id) === out) : undefined;
    }
  }
  return bindings;
}

/**
 * Interfaces DMX512 : composants qui transforment l'UART d'une carte en ligne
 * différentielle RS-485. `in` est la patte qui reçoit le TX, `a`/`b` les deux
 * fils de la paire côté XLR. Table plutôt que rôles déclarés dans le manifeste :
 * ces composants viennent de la bibliothèque publique (.kompix), qui ne décrit
 * pas de modèle de simulation — c'est ici que le montage prend son sens.
 */
const DMX_INTERFACES: Record<string, { in: string; a: string; b: string }> = {
  'dmx-grove': { in: 'SIG', a: '+', b: '-' },
};

/** Projecteurs DMX512 : pattes de la paire et nombre de canaux consommés. */
const DMX_FIXTURES: Record<string, { a: string; b: string; channels: number }> = {
  spot: { a: '+', b: '-', channels: 3 },
};

export interface DmxBinding {
  /** Projecteur piloté. */
  partId: string;
  /** Broche TX du MCU d'où part la trame (celle que le moteur décode). */
  mcuPin: string;
  /** Adresse DMX du projecteur, 1..512 (paramètre `address` de l'inspecteur). */
  address: number;
  /** Canaux consommés à partir de l'adresse (3 = rouge/vert/bleu). */
  channels: number;
}

/**
 * Projecteurs DMX512 reliés, par leur paire différentielle, à une interface dont
 * l'entrée est câblée sur une broche du MCU. Plusieurs projecteurs peuvent
 * partager la même ligne — c'est le principe du DMX, chacun écoute son adresse.
 */
export function dmxBindings(diagram: Diagram): DmxBinding[] {
  const nets = buildNets(diagram);
  const out: DmxBinding[] = [];
  for (const iface of diagram.parts) {
    const spec = DMX_INTERFACES[iface.type];
    if (!spec) continue;
    const mcuPin = mcuPinForPart(diagram, nets, iface.id, spec.in);
    if (!mcuPin) continue; // interface non reliée à la carte : rien à décoder
    const netA = nets.netOf({ partId: iface.id, pin: spec.a });
    const netB = nets.netOf({ partId: iface.id, pin: spec.b });
    for (const part of diagram.parts) {
      const fixture = DMX_FIXTURES[part.type];
      if (!fixture) continue;
      // Les deux fils de la paire doivent suivre : un projecteur relié par le
      // seul Data+ n'est pas câblé, il est à moitié câblé.
      if (nets.netOf({ partId: part.id, pin: fixture.a }) !== netA) continue;
      if (nets.netOf({ partId: part.id, pin: fixture.b }) !== netB) continue;
      const raw = Number(part.attrs?.[`${PARAM_ATTR_PREFIX}address`] ?? 1);
      const address = Number.isFinite(raw) ? Math.min(512, Math.max(1, Math.round(raw))) : 1;
      out.push({ partId: part.id, mcuPin, address, channels: fixture.channels });
    }
  }
  return out;
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
  return netIndex(diagram, nets).mcu.get(netId)?.firstDigital ?? null;
}

function netHasGnd(diagram: Diagram, nets: Nets, netId: string): boolean {
  const idx = netIndex(diagram, nets);
  return idx.mcu.get(netId)?.hasGnd === true || idx.psuGnd.has(netId);
}

function netHasVcc(diagram: Diagram, nets: Nets, netId: string): boolean {
  for (const { part, board } of mcuParts(diagram)) {
    for (const pin of mcuPins(board)) {
      if (nets.netOf({ partId: part.id, pin }) !== netId) continue;
      if (mcuPinRole(board, pin).role === 'vcc') return true;
    }
  }
  for (const part of psuParts(diagram)) {
    if (nets.netOf({ partId: part.id, pin: 'V+' }) === netId) return true;
  }
  return false;
}
