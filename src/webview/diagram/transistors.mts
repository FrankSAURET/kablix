// Base des transistors bipolaires proposés par le sélecteur du composant
// « Transistor » (un seul item de bibliothèque, la référence se choisit dans les
// propriétés). Chaque entrée porte tout ce qui distingue un modèle d'un autre :
// l'inscription du boîtier, le symbole interne, les limites et le BROCHAGE —
// c'est lui qui piège en pratique, la famille BC5xx étant câblée C-B-E là où les
// 2Nxxxx sont E-B-C, vues de face plate.
//
// Les noms de broches, eux, ne changent JAMAIS : le composant garde `named`, donc
// ses pattes s'appellent E, B et C quel que soit le modèle choisi. Changer de
// référence recâble le dessin, pas la netlist — aucun fil ne devient orphelin.

/** Un modèle de transistor proposé dans la liste. */
export interface TransistorRef {
  /** Référence commerciale, telle qu'écrite sur le boîtier (« PN2222A »). */
  ref: string;
  /** Inscription du boîtier, une ligne par saut de ligne. */
  text: string;
  symbol: 'npn' | 'pnp';
  pkg: string;
  /** Numéro de patte (1..3) de chaque électrode, vues de face plate. */
  e: number;
  b: number;
  c: number;
  /** Gain en courant (β), Vce max (V), Ic max (A). */
  gain: number;
  vcemax: number;
  icmax: number;
}

/** Brochages rencontrés sur le TO-92, vus de FACE PLATE, pattes de gauche à droite. */
const EBC = { e: 1, b: 2, c: 3 };
const CBE = { e: 3, b: 2, c: 1 };

export const TRANSISTOR_REFS: readonly TransistorRef[] = [
  // --- NPN ---
  { ref: 'PN2222A', text: 'PN\n2222A', symbol: 'npn', pkg: 'to92', ...EBC, gain: 35, vcemax: 40, icmax: 0.6 },
  { ref: '2N3904', text: '2N\n3904', symbol: 'npn', pkg: 'to92', ...EBC, gain: 100, vcemax: 40, icmax: 0.2 },
  { ref: '2N4401', text: '2N\n4401', symbol: 'npn', pkg: 'to92', ...EBC, gain: 100, vcemax: 40, icmax: 0.6 },
  { ref: '2N5551', text: '2N\n5551', symbol: 'npn', pkg: 'to92', ...EBC, gain: 80, vcemax: 160, icmax: 0.6 },
  { ref: 'BC337', text: 'BC\n337', symbol: 'npn', pkg: 'to92', ...EBC, gain: 100, vcemax: 45, icmax: 0.8 },
  { ref: 'S8050', text: 'S\n8050', symbol: 'npn', pkg: 'to92', ...EBC, gain: 120, vcemax: 25, icmax: 0.7 },
  { ref: 'BC547', text: 'BC\n547', symbol: 'npn', pkg: 'to92', ...CBE, gain: 200, vcemax: 45, icmax: 0.1 },
  { ref: 'BC548', text: 'BC\n548', symbol: 'npn', pkg: 'to92', ...CBE, gain: 200, vcemax: 30, icmax: 0.1 },
  // --- PNP ---
  { ref: '2N2907A', text: '2N\n2907A', symbol: 'pnp', pkg: 'to92', ...EBC, gain: 100, vcemax: 60, icmax: 0.6 },
  { ref: '2N3906', text: '2N\n3906', symbol: 'pnp', pkg: 'to92', ...EBC, gain: 100, vcemax: 40, icmax: 0.2 },
  { ref: '2N4403', text: '2N\n4403', symbol: 'pnp', pkg: 'to92', ...EBC, gain: 100, vcemax: 40, icmax: 0.6 },
  { ref: '2N5401', text: '2N\n5401', symbol: 'pnp', pkg: 'to92', ...EBC, gain: 60, vcemax: 150, icmax: 0.6 },
  { ref: 'BC327', text: 'BC\n327', symbol: 'pnp', pkg: 'to92', ...EBC, gain: 100, vcemax: 45, icmax: 0.8 },
  { ref: 'S8550', text: 'S\n8550', symbol: 'pnp', pkg: 'to92', ...EBC, gain: 120, vcemax: 25, icmax: 0.7 },
  { ref: 'BC557', text: 'BC\n557', symbol: 'pnp', pkg: 'to92', ...CBE, gain: 200, vcemax: 45, icmax: 0.1 },
  { ref: 'BC558', text: 'BC\n558', symbol: 'pnp', pkg: 'to92', ...CBE, gain: 200, vcemax: 30, icmax: 0.1 },
];

/** Références « personnalisées » : tout reste réglable dans les propriétés. */
export const CUSTOM_NPN = 'custom-npn';
export const CUSTOM_PNP = 'custom-pnp';

export function isCustomRef(ref: string): boolean {
  return ref === CUSTOM_NPN || ref === CUSTOM_PNP;
}

export function transistorRef(ref: string): TransistorRef | undefined {
  return TRANSISTOR_REFS.find((r) => r.ref === ref);
}

/**
 * Critères du sélecteur. Les trois seuils se lisent « au moins » : demander
 * 500 mA garde les modèles capables d'AU MOINS 500 mA. `''` = peu importe.
 */
export interface TransistorFilter {
  symbol: 'npn' | 'pnp';
  pkg: string;
  icmax: string;
  vcemax: string;
  gain: string;
}

/** Seuils proposés dans les listes déroulantes du sélecteur. */
export const TRANSISTOR_FILTER_OPTIONS = {
  pkg: ['to92', 'to220'],
  icmax: ['', '0.1', '0.5', '0.6', '0.8'],
  vcemax: ['', '25', '40', '45', '60'],
  gain: ['', '50', '100', '200'],
} as const;

export const DEFAULT_TRANSISTOR_FILTER: TransistorFilter = {
  symbol: 'npn', pkg: 'to92', icmax: '', vcemax: '', gain: '',
};

/** Modèles retenus par les critères, dans l'ordre de la base. */
export function filterTransistors(f: TransistorFilter): TransistorRef[] {
  const atLeast = (value: number, min: string): boolean => min === '' || value >= Number(min);
  return TRANSISTOR_REFS.filter(
    (r) => r.symbol === f.symbol
      && (f.pkg === '' || r.pkg === f.pkg)
      && atLeast(r.icmax, f.icmax)
      && atLeast(r.vcemax, f.vcemax)
      && atLeast(r.gain, f.gain)
  );
}

/**
 * Attributs à poser sur le composant pour un choix donné. Pour une référence
 * figée on recopie sa fiche ; pour un modèle personnalisé on part des SEUILS
 * demandés dans le sélecteur (« les choix déjà faits sont déjà complétés »),
 * en retombant sur des valeurs courantes quand le critère était « peu importe ».
 */
export function transistorAttrs(choice: string, f: TransistorFilter): Record<string, string> {
  const known = transistorRef(choice);
  if (known) {
    return {
      ref: known.ref, text: known.text, symbol: known.symbol, pkg: known.pkg,
      e: String(known.e), b: String(known.b), c: String(known.c),
      gain: String(known.gain), vcemax: String(known.vcemax), icmax: String(known.icmax),
    };
  }
  const symbol = choice === CUSTOM_PNP ? 'pnp' : 'npn';
  return {
    ref: choice, text: symbol.toUpperCase(), symbol, pkg: f.pkg || 'to92',
    e: '1', b: '2', c: '3',
    gain: f.gain || '100', vcemax: f.vcemax || '40', icmax: f.icmax || '0.6',
  };
}

/** Libellé d'une entrée de la liste : « BC547 — NPN, 45 V, 100 mA, β 200 ». */
export function transistorSummary(r: TransistorRef): string {
  const ic = r.icmax < 1 ? `${Math.round(r.icmax * 1000)} mA` : `${r.icmax} A`;
  return `${r.symbol.toUpperCase()}, ${r.vcemax} V, ${ic}, β ${r.gain}`;
}
