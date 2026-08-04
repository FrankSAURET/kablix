// Base des circuits intégrés logiques de la bibliothèque : un même composant
// (`kablix-ic`, boîtier DIL) sous douze entrées, une par référence — on cherche un
// CD4011 dans la palette, pas un « circuit intégré » à configurer. La référence
// reste changeable dans les propriétés.
//
// Douze références, dessinées par Frank dans `Composants.svg` et listées dans
// `A Examiner/CI.csv` : les six CMOS de la série 4000 (CD4081, CD4071, CD4070,
// CD40106, CD4011, CD4001) et les six TTL/CMOS de la série 74 (74xx08, 74xx32,
// 74xx86, 74xx00, 74xx02, 74xx14). Toutes en boîtier DIL-14, enfichables sur
// platine d'essai.
//
// Le « xx » d'une référence 74 est sa FAMILLE (LS, HC, HCT…) : elle ne change ni
// la fonction ni le brochage, mais elle décide de la PLAGE D'ALIMENTATION — et
// c'est là que se joue la compatibilité avec une carte. Un 74LS08 veut 5 V à
// ±5 % : il ne fonctionne pas sur les 3,3 V d'une Pico. Un 74HC08 (2 à 6 V), si.
//
// Le brochage est celui du DESSIN de Frank, patte 1 en bas à gauche (côté
// encoche). Les noms viennent du schéma interne : entrées A/B, sortie Q pour les
// portes à deux entrées ; entrée `a`, sortie `a̅` (a barre) pour les inverseurs.

/** Fonction logique réalisée par chaque porte du boîtier. */
export type LogicOp = 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'not';

/**
 * Une porte du boîtier : ses entrées puis sa sortie, nommées comme les pattes.
 * Un inverseur n'a qu'une entrée.
 */
export interface IcGate {
  inputs: readonly string[];
  output: string;
}

/** Plage d'alimentation d'une famille (V) — hors de là, le boîtier ne marche pas. */
export interface SupplyRange {
  min: number;
  max: number;
}

/**
 * Familles de la série 74 et leur plage d'alimentation (données de Frank).
 * Sous le minimum le circuit ne fonctionne pas ; au-dessus du maximum il est
 * DÉTRUIT — les deux cas sont signalés « Tensions d'alimentation incompatibles ».
 */
export const IC74_FAMILIES: Record<string, SupplyRange> = {
  C: { min: 3, max: 15 },
  HC: { min: 2, max: 6 },
  AC: { min: 2, max: 6 },
  ACT: { min: 2, max: 6 },
  HCT: { min: 4.5, max: 5 },
  ALS: { min: 4.5, max: 5 },
  F: { min: 4.5, max: 5 },
  S: { min: 4.75, max: 5.25 },
  LS: { min: 4.75, max: 5.25 },
};

/** Familles proposées dans l'inspecteur, dans l'ordre d'affichage. */
export const IC74_FAMILY_OPTIONS: readonly string[] = ['HC', 'HCT', 'LS', 'S', 'ALS', 'F', 'AC', 'ACT', 'C'];

/** Plage d'alimentation de la série 4000 (CMOS) : la plus large de toutes. */
export const CD4000_SUPPLY: SupplyRange = { min: 3, max: 18 };

/** Famille par défaut d'une référence 74 : la seule qui marche de 3,3 V à 5 V. */
export const DEFAULT_IC74_FAMILY = 'HC';

/** Un modèle de circuit intégré proposé dans la liste. */
export interface IcRef {
  /** Référence telle qu'on la commande (« CD4081 », « 74xx08 »). */
  ref: string;
  /** Ce que fait le boîtier, en minuscule : le libellé de bibliothèque est
   *  « <référence> <label> » (« CD4081 quad 2-input AND gate »). */
  label: string;
  /** Symbole interne dessiné par Frank (`internal-wiring.mts`). */
  schema: string;
  pkg: string;
  /** Noms des pattes, de la 1 à la 14 (patte 1 en bas à gauche). */
  pins: readonly string[];
  /** Fonction réalisée par chacune des portes. */
  op: LogicOp;
  /** Les portes du boîtier, entrées puis sortie. */
  gates: readonly IcGate[];
  /** Patte d'alimentation positive (VDD en CMOS 4000, VCC en série 74). */
  vcc: string;
  /** Patte de masse. */
  gnd: string;
  /** Série : le « xx » d'une référence 74 se remplace par la famille choisie. */
  series: '4000' | '74';
  /** Équivalent dans l'autre série, tel que donné par Frank (informatif). */
  equivalent?: string;
}

/** Quatre portes à deux entrées, brochage CMOS 4000 (sortie de la porte 1 en 3). */
const CD4000_QUAD = ['A1', 'B1', 'Q1', 'Q2', 'A2', 'B2', 'GND', 'A3', 'B3', 'Q3', 'Q4', 'A4', 'B4', 'VDD'] as const;
/** Quatre portes à deux entrées, brochage série 74 (sortie de la porte 1 en 3). */
const TTL_QUAD = ['A1', 'B1', 'Q1', 'A2', 'B2', 'Q2', 'GND', 'Q3', 'B3', 'A3', 'Q4', 'A4', 'B4', 'VCC'] as const;
/** 74xx02 : le NON-OU sort sa porte 1 sur la patte 1 — le piège du lot. */
const TTL_NOR = ['Q1', 'A1', 'B1', 'Q2', 'A2', 'B2', 'GND', 'B3', 'A3', 'Q3', 'B4', 'A4', 'Q4', 'VCC'] as const;
/** Six inverseurs : entrée `x`, sortie `x̅` (x barre). */
const HEX_INV = ['a', 'a̅', 'b', 'b̅', 'c', 'c̅', 'GND', 'd̅', 'd', 'e̅', 'e', 'f̅', 'f', 'VDD'] as const;
/** Le même en série 74 : seule l'alimentation change de nom (VCC au lieu de VDD). */
const HEX_INV_TTL = [...HEX_INV.slice(0, 13), 'VCC'] as const;

/** Les quatre portes d'un boîtier quadruple, à partir du numéro de chaque. */
const QUAD_GATES: readonly IcGate[] = [1, 2, 3, 4].map((n) => ({ inputs: [`A${n}`, `B${n}`], output: `Q${n}` }));
/** Les six inverseurs, entrée `x` → sortie `x̅`. */
const HEX_GATES: readonly IcGate[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((l) => ({ inputs: [l], output: `${l}̅` }));

export const IC_REFS: readonly IcRef[] = [
  // --- CMOS série 4000 : 3 à 18 V, la plus tolérante ---
  { ref: 'CD4081', label: 'quad 2-input AND gate', schema: 'cd4081', pkg: 'ic14', pins: CD4000_QUAD, op: 'and', gates: QUAD_GATES, vcc: 'VDD', gnd: 'GND', series: '4000', equivalent: '74C81' },
  { ref: 'CD4071', label: 'quad 2-input OR gate', schema: 'cd4071', pkg: 'ic14', pins: CD4000_QUAD, op: 'or', gates: QUAD_GATES, vcc: 'VDD', gnd: 'GND', series: '4000', equivalent: '74C71' },
  { ref: 'CD4070', label: 'quad 2-input XOR gate', schema: 'cd4070', pkg: 'ic14', pins: CD4000_QUAD, op: 'xor', gates: QUAD_GATES, vcc: 'VDD', gnd: 'GND', series: '4000', equivalent: '74C70' },
  { ref: 'CD4011', label: 'quad 2-input NAND gate', schema: 'cd4011', pkg: 'ic14', pins: CD4000_QUAD, op: 'nand', gates: QUAD_GATES, vcc: 'VDD', gnd: 'GND', series: '4000', equivalent: '74C11' },
  { ref: 'CD4001', label: 'quad 2-input NOR gate', schema: 'cd4001', pkg: 'ic14', pins: CD4000_QUAD, op: 'nor', gates: QUAD_GATES, vcc: 'VDD', gnd: 'GND', series: '4000', equivalent: '74C01' },
  // Six inverseurs à seuil (trigger de Schmitt) : mêmes niveaux logiques ici, le
  // seuil ne se voit que sur un signal lent ou bruité, que rien ne produit encore.
  { ref: 'CD40106', label: 'hex Schmitt-trigger inverter', schema: 'cd40106', pkg: 'ic14', pins: HEX_INV, op: 'not', gates: HEX_GATES, vcc: 'VDD', gnd: 'GND', series: '4000', equivalent: '74xx14' },
  // --- Série 74 : la famille choisie décide de la plage d'alimentation ---
  { ref: '74xx08', label: 'quad 2-input AND gate', schema: '7408', pkg: 'ic14', pins: TTL_QUAD, op: 'and', gates: QUAD_GATES, vcc: 'VCC', gnd: 'GND', series: '74' },
  { ref: '74xx32', label: 'quad 2-input OR gate', schema: '7432', pkg: 'ic14', pins: TTL_QUAD, op: 'or', gates: QUAD_GATES, vcc: 'VCC', gnd: 'GND', series: '74' },
  { ref: '74xx86', label: 'quad 2-input XOR gate', schema: '7486', pkg: 'ic14', pins: TTL_QUAD, op: 'xor', gates: QUAD_GATES, vcc: 'VCC', gnd: 'GND', series: '74' },
  { ref: '74xx00', label: 'quad 2-input NAND gate', schema: '7400', pkg: 'ic14', pins: TTL_QUAD, op: 'nand', gates: QUAD_GATES, vcc: 'VCC', gnd: 'GND', series: '74' },
  { ref: '74xx02', label: 'quad 2-input NOR gate', schema: '7402', pkg: 'ic14', pins: TTL_NOR, op: 'nor', gates: QUAD_GATES, vcc: 'VCC', gnd: 'GND', series: '74' },
  // Le jumeau série 74 du CD40106 : même fonction, même brochage, mais la famille
  // décide de l'alimentation (un 74LS14 refuse les 3,3 V d'une Pico).
  { ref: '74xx14', label: 'hex Schmitt-trigger inverter', schema: '7414', pkg: 'ic14', pins: HEX_INV_TTL, op: 'not', gates: HEX_GATES, vcc: 'VCC', gnd: 'GND', series: '74', equivalent: 'CD40106' },
];

/** Références proposées dans le sélecteur, dans l'ordre de la base. */
export const IC_REF_OPTIONS: readonly string[] = IC_REFS.map((r) => r.ref);

export function icRef(ref: string): IcRef | undefined {
  return IC_REFS.find((r) => r.ref === ref);
}

/**
 * Libellé complet d'une référence : « CD4081 quad 2-input AND gate ». C'est la
 * clé de traduction du catalogue et de la nomenclature — les deux doivent lire
 * la MÊME chaîne, sans quoi la nomenclature sortirait en anglais.
 */
export function icLabel(ref: string): string {
  const known = icRef(ref);
  return known ? `${known.ref} ${known.label}` : ref;
}

/**
 * Inscription du boîtier : la référence, le « xx » d'une série 74 remplacé par
 * la famille choisie (« 74xx08 » + « LS » → « 74LS08 »).
 */
export function icMarking(ref: string, family: string): string {
  const known = icRef(ref);
  if (!known || known.series !== '74') return ref;
  return ref.replace('xx', family || DEFAULT_IC74_FAMILY);
}

/**
 * Plage d'alimentation du boîtier : celle de la série 4000, ou celle de la
 * famille 74 choisie. Une famille inconnue retombe sur la famille par défaut.
 */
export function icSupplyRange(ref: string, family: string): SupplyRange {
  const known = icRef(ref);
  if (!known || known.series !== '74') return CD4000_SUPPLY;
  return IC74_FAMILIES[family] ?? IC74_FAMILIES[DEFAULT_IC74_FAMILY]!;
}

/** Attributs à poser sur le composant pour une référence (et une famille). */
export function icAttrs(ref: string, family: string): Record<string, string> {
  const known = icRef(ref) ?? IC_REFS[0]!;
  return {
    ref: known.ref,
    family: known.series === '74' ? family || DEFAULT_IC74_FAMILY : '',
    text: icMarking(known.ref, family),
    pinnames: known.pins.join(','),
    schema: known.schema,
    pkg: known.pkg,
  };
}

/** Sortie d'une porte, à trois états : 1, 0 ou indéterminé (entrée en l'air). */
export type LogicLevel = 0 | 1 | undefined;

/**
 * Résultat d'une porte pour des entrées à trois états. Une entrée en l'air ne
 * rend pas forcément la sortie indéterminée : un ET dont une entrée est à 0 sort
 * 0 quoi qu'il arrive sur l'autre, un OU dont une entrée est à 1 sort 1. C'est
 * exactement ce qu'on veut montrer — l'entrée oubliée ne se voit que lorsqu'elle
 * compte.
 */
export function gateOutput(op: LogicOp, inputs: readonly LogicLevel[]): LogicLevel {
  const known = inputs.filter((v): v is 0 | 1 => v !== undefined);
  const complete = known.length === inputs.length;
  switch (op) {
    case 'and':
    case 'nand': {
      const zero = known.includes(0);
      if (!zero && !complete) return undefined;
      const out = zero ? 0 : 1;
      return op === 'and' ? out : ((1 - out) as 0 | 1);
    }
    case 'or':
    case 'nor': {
      const one = known.includes(1);
      if (!one && !complete) return undefined;
      const out = one ? 1 : 0;
      return op === 'or' ? out : ((1 - out) as 0 | 1);
    }
    case 'xor':
      // Le OU exclusif a besoin de TOUTES ses entrées : aucune ne tranche seule.
      if (!complete) return undefined;
      return (known.reduce<number>((a, b) => a ^ b, 0) ? 1 : 0) as 0 | 1;
    case 'not':
      if (!complete) return undefined;
      return (known[0] === 1 ? 0 : 1) as 0 | 1;
  }
}
