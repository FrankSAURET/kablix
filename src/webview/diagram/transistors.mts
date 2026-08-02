// Base des transistors proposés par le sélecteur du composant « Transistor »
// (un seul item de bibliothèque, la référence se choisit dans les propriétés).
// Chaque entrée porte tout ce qui distingue un modèle d'un autre : l'inscription
// du boîtier, le SYMBOLE INTERNE dessiné par Frank, les limites et le BROCHAGE —
// c'est lui qui piège en pratique, la famille BC5xx étant câblée C-B-E là où les
// 2Nxxxx sont E-B-C, vues de face plate.
//
// Les noms de broches, eux, ne changent JAMAIS : le composant garde `named`, donc
// ses pattes s'appellent E, B et C (G, D, S pour un MOSFET) quel que soit le
// modèle choisi. Changer de référence recâble le dessin, pas la netlist — aucun
// fil ne devient orphelin.

/**
 * Famille du composant. Elle dit à la fois ce qu'on cherche dans la liste et
 * comment il se commande : un bipolaire en COURANT (β × Ib), un MOSFET en
 * TENSION (grille isolée, rien n'y entre).
 */
export type TransistorType = 'npn' | 'pnp' | 'darlington-npn' | 'darlington-pnp' | 'nmos';

export const TRANSISTOR_TYPES: readonly TransistorType[] =
  ['npn', 'pnp', 'darlington-npn', 'darlington-pnp', 'nmos'];

/** Libellé de chaque famille (traduit à l'affichage). */
export const TYPE_LABELS: Record<TransistorType, string> = {
  npn: 'NPN',
  pnp: 'PNP',
  'darlington-npn': 'NPN Darlington',
  'darlington-pnp': 'PNP Darlington',
  nmos: 'N-channel MOSFET',
};

/** MOSFET : commandé en tension, ses électrodes sont G/D/S. */
export function isMosType(type: string): boolean {
  return type === 'nmos';
}

/** Darlington : deux transistors en cascade — gain énorme, Vbe doublé. */
export function isDarlingtonType(type: string): boolean {
  return type === 'darlington-npn' || type === 'darlington-pnp';
}

/** Le courant sort du composant (NPN) ou y entre (PNP) : sens de la commande. */
export function isPnpType(type: string): boolean {
  return type === 'pnp' || type === 'darlington-pnp';
}

/** Rôle d'une patte, vue de face plate, dans l'ordre 1-2-3. */
export type Electrode = 'E' | 'B' | 'C' | 'G' | 'D' | 'S';

/** Un modèle de transistor proposé dans la liste. */
export interface TransistorRef {
  /** Référence commerciale, telle qu'écrite sur le boîtier (« PN2222A »). */
  ref: string;
  /** Inscription du boîtier, une ligne par saut de ligne. */
  text: string;
  symbol: TransistorType;
  /**
   * Symbole interne, désigné NOMMÉMENT (dessins de `Composants.svg`) : il ne se
   * déduit pas de la famille — deux NPN peuvent porter l'un `npn1`, l'autre
   * `npn-generique`.
   */
  schema: string;
  pkg: string;
  /** Rôle de chaque patte, de la première à la troisième, vues de FACE PLATE. */
  pins: readonly [Electrode, Electrode, Electrode];
  /** Gain en courant (β) — 0 pour un MOSFET, dont la grille ne consomme rien. */
  gain: number;
  /** Tension maximale : Vce pour un bipolaire, Vds pour un MOSFET (V). */
  vcemax: number;
  /** Courant maximal : Ic pour un bipolaire, Id pour un MOSFET (A). */
  icmax: number;
  /** Résistance à l'état passant (Ω) — MOSFET seulement. */
  rdson?: number;
  /** Modèle venu de la liste de Frank : mis en évidence dans le sélecteur. */
  nouveau?: boolean;
}

/** Brochages rencontrés, vus de FACE PLATE, pattes de gauche à droite. */
const EBC = ['E', 'B', 'C'] as const;
const CBE = ['C', 'B', 'E'] as const;
const ECB = ['E', 'C', 'B'] as const;
const BCE = ['B', 'C', 'E'] as const;
const SGD = ['S', 'G', 'D'] as const;
const GDS = ['G', 'D', 'S'] as const;

export const TRANSISTOR_REFS: readonly TransistorRef[] = [
  // --- NPN ---
  { ref: 'PN2222A', text: 'PN\n2222A', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: EBC, gain: 35, vcemax: 40, icmax: 0.6 },
  { ref: '2N3904', text: '2N\n3904', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: EBC, gain: 100, vcemax: 40, icmax: 0.2 },
  { ref: '2N4401', text: '2N\n4401', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: EBC, gain: 100, vcemax: 40, icmax: 0.6 },
  { ref: '2N5551', text: '2N\n5551', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: EBC, gain: 80, vcemax: 160, icmax: 0.6 },
  { ref: 'BC337', text: 'BC\n337', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: EBC, gain: 100, vcemax: 45, icmax: 0.8 },
  { ref: 'S8050', text: 'S\n8050', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: EBC, gain: 120, vcemax: 25, icmax: 0.7 },
  { ref: 'BC547', text: 'BC\n547', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: CBE, gain: 200, vcemax: 45, icmax: 0.1 },
  { ref: 'BC548', text: 'BC\n548', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: CBE, gain: 200, vcemax: 30, icmax: 0.1 },
  { ref: 'BC639', text: 'BC\n639', symbol: 'npn', schema: 'npn-generique', pkg: 'to92', pins: ECB, gain: 63, vcemax: 80, icmax: 1, nouveau: true },
  { ref: 'MPSA42', text: 'MPS\nA42', symbol: 'npn', schema: 'npn1', pkg: 'to92', pins: EBC, gain: 25, vcemax: 300, icmax: 0.5, nouveau: true },
  { ref: 'BD911', text: 'BD911', symbol: 'npn', schema: 'npn-generique', pkg: 'to220', pins: BCE, gain: 5, vcemax: 100, icmax: 15, nouveau: true },
  // --- PNP ---
  { ref: '2N2907A', text: '2N\n2907A', symbol: 'pnp', schema: 'pnp1', pkg: 'to92', pins: EBC, gain: 100, vcemax: 60, icmax: 0.6 },
  { ref: '2N3906', text: '2N\n3906', symbol: 'pnp', schema: 'pnp1', pkg: 'to92', pins: EBC, gain: 100, vcemax: 40, icmax: 0.2 },
  { ref: '2N4403', text: '2N\n4403', symbol: 'pnp', schema: 'pnp1', pkg: 'to92', pins: EBC, gain: 100, vcemax: 40, icmax: 0.6 },
  { ref: '2N5401', text: '2N\n5401', symbol: 'pnp', schema: 'pnp1', pkg: 'to92', pins: EBC, gain: 60, vcemax: 150, icmax: 0.6 },
  { ref: 'BC327', text: 'BC\n327', symbol: 'pnp', schema: 'pnp1', pkg: 'to92', pins: EBC, gain: 100, vcemax: 45, icmax: 0.8 },
  { ref: 'S8550', text: 'S\n8550', symbol: 'pnp', schema: 'pnp1', pkg: 'to92', pins: EBC, gain: 120, vcemax: 25, icmax: 0.7 },
  { ref: 'BC557', text: 'BC\n557', symbol: 'pnp', schema: 'pnp1', pkg: 'to92', pins: CBE, gain: 200, vcemax: 45, icmax: 0.1 },
  { ref: 'BC558', text: 'BC\n558', symbol: 'pnp', schema: 'pnp1', pkg: 'to92', pins: CBE, gain: 200, vcemax: 30, icmax: 0.1 },
  { ref: 'BC640', text: 'BC\n640', symbol: 'pnp', schema: 'pnp-generique', pkg: 'to92', pins: ECB, gain: 100, vcemax: 50, icmax: 1, nouveau: true },
  { ref: 'MPSA92', text: 'MPS\nA92', symbol: 'pnp', schema: 'pnp-generique', pkg: 'to92', pins: EBC, gain: 25, vcemax: 300, icmax: 0.5, nouveau: true },
  { ref: 'BD912', text: 'BD912', symbol: 'pnp', schema: 'pnp-generique', pkg: 'to220', pins: BCE, gain: 5, vcemax: 100, icmax: 15, nouveau: true },
  // --- Darlington : deux transistors en cascade dans le même boîtier ---
  { ref: 'BC517', text: 'BC\n517', symbol: 'darlington-npn', schema: 'darlington-npn', pkg: 'to92', pins: CBE, gain: 30000, vcemax: 30, icmax: 0.4, nouveau: true },
  { ref: 'BC516', text: 'BC\n516', symbol: 'darlington-pnp', schema: 'darlington-pnp', pkg: 'to92', pins: CBE, gain: 30000, vcemax: 30, icmax: 0.4, nouveau: true },
  // --- MOSFET canal N : commandés en tension, grille isolée (gain sans objet) ---
  { ref: 'BS170', text: 'BS\n170', symbol: 'nmos', schema: 'nmos-d', pkg: 'to92', pins: SGD, gain: 0, vcemax: 60, icmax: 0.5, rdson: 2.5, nouveau: true },
  { ref: 'IRF530', text: 'IRF530', symbol: 'nmos', schema: 'nmos-d', pkg: 'to220', pins: GDS, gain: 0, vcemax: 100, icmax: 14, rdson: 0.16, nouveau: true },
];

/** Références « personnalisées » : tout reste réglable dans les propriétés. */
export const CUSTOM_NPN = 'custom-npn';
export const CUSTOM_PNP = 'custom-pnp';

/** Modèle personnalisé de la famille demandée (« custom-nmos »…). */
export function customRefOf(type: string): string {
  return `custom-${type}`;
}

export function isCustomRef(ref: string): boolean {
  return ref.startsWith('custom-');
}

/** Famille d'un modèle personnalisé (« custom-darlington-pnp » → la famille). */
export function customRefType(ref: string): TransistorType {
  const t = ref.slice('custom-'.length) as TransistorType;
  return TRANSISTOR_TYPES.includes(t) ? t : 'npn';
}

export function transistorRef(ref: string): TransistorRef | undefined {
  return TRANSISTOR_REFS.find((r) => r.ref === ref);
}

/**
 * Numéro de patte (1..3) de chaque électrode, tel qu'attendu dans les attributs
 * du composant. Un bipolaire pose e/b/c, un MOSFET g/d/s.
 */
export function pinAttrs(pins: readonly Electrode[]): Record<string, string> {
  const out: Record<string, string> = {};
  pins.forEach((role, i) => { out[role.toLowerCase()] = String(i + 1); });
  return out;
}

/**
 * Critères du sélecteur. Les seuils se lisent « au moins » — demander 500 mA
 * garde les modèles capables d'AU MOINS 500 mA —, sauf Rds(on) qui se lit « au
 * plus » (une résistance de passage, plus elle est faible mieux c'est).
 * `''` = peu importe.
 */
export interface TransistorFilter {
  symbol: TransistorType;
  pkg: string;
  icmax: string;
  vcemax: string;
  gain: string;
  rdson: string;
}

/** Seuils proposés dans les listes déroulantes du sélecteur. */
export const TRANSISTOR_FILTER_OPTIONS = {
  pkg: ['to92', 'to220'],
  icmax: ['', '0.1', '0.5', '0.6', '0.8', '1', '10'],
  vcemax: ['', '25', '40', '45', '60', '100', '300'],
  gain: ['', '50', '100', '200', '1000'],
  rdson: ['', '0.2', '0.5', '3'],
} as const;

export const DEFAULT_TRANSISTOR_FILTER: TransistorFilter = {
  symbol: 'npn', pkg: 'to92', icmax: '', vcemax: '', gain: '', rdson: '',
};

/** Modèles retenus par les critères, dans l'ordre de la base. */
export function filterTransistors(f: TransistorFilter): TransistorRef[] {
  const atLeast = (value: number, min: string): boolean => min === '' || value >= Number(min);
  const atMost = (value: number | undefined, max: string): boolean =>
    max === '' || (value !== undefined && value <= Number(max));
  const mos = isMosType(f.symbol);
  return TRANSISTOR_REFS.filter(
    (r) => r.symbol === f.symbol
      && (f.pkg === '' || r.pkg === f.pkg)
      && atLeast(r.icmax, f.icmax)
      && atLeast(r.vcemax, f.vcemax)
      // Le gain n'a pas de sens sur un MOSFET, Rds(on) pas davantage sur un
      // bipolaire : chaque famille n'est filtrée que par SES critères.
      && (mos || atLeast(r.gain, f.gain))
      && (!mos || atMost(r.rdson, f.rdson))
  );
}

/**
 * Attributs à poser sur le composant pour un choix donné. Pour une référence
 * figée on recopie sa fiche ; pour un modèle personnalisé on part des SEUILS
 * demandés dans le sélecteur (« les choix déjà faits sont déjà complétés »),
 * en retombant sur des valeurs courantes quand le critère était « peu importe ».
 */
/** Symbole interne d'un modèle personnalisé, à défaut de fiche. */
const DEFAULT_SCHEMA: Record<TransistorType, string> = {
  npn: 'npn1',
  pnp: 'pnp1',
  'darlington-npn': 'darlington-npn',
  'darlington-pnp': 'darlington-pnp',
  nmos: 'nmos-d',
};

export function transistorAttrs(choice: string, f: TransistorFilter): Record<string, string> {
  const known = transistorRef(choice);
  if (known) {
    return {
      ref: known.ref, text: known.text, symbol: known.symbol, schema: known.schema, pkg: known.pkg,
      ...pinAttrs(known.pins),
      gain: String(known.gain), vcemax: String(known.vcemax), icmax: String(known.icmax),
      rdson: String(known.rdson ?? ''),
    };
  }
  const symbol = customRefType(choice);
  const mos = isMosType(symbol);
  return {
    ref: choice, text: mos ? 'MOS' : symbol.toUpperCase(), symbol,
    schema: DEFAULT_SCHEMA[symbol], pkg: f.pkg || 'to92',
    ...pinAttrs(mos ? GDS : EBC),
    gain: mos ? '0' : f.gain || (isDarlingtonType(symbol) ? '10000' : '100'),
    vcemax: f.vcemax || '40', icmax: f.icmax || '0.6',
    rdson: mos ? f.rdson || '0.5' : '',
  };
}

/** Libellé d'une entrée de la liste : « BC547 — NPN, 45 V, 100 mA, β 200 ». */
export function transistorSummary(r: TransistorRef): string {
  const courant = r.icmax < 1 ? `${Math.round(r.icmax * 1000)} mA` : `${r.icmax} A`;
  const famille = TYPE_LABELS[r.symbol];
  // Un MOSFET n'a pas de gain : ce qui compte est sa résistance de passage.
  const dernier = isMosType(r.symbol) ? `Rds(on) ${r.rdson} Ω` : `β ${r.gain}`;
  return `${famille}, ${r.vcemax} V, ${courant}, ${dernier}`;
}
