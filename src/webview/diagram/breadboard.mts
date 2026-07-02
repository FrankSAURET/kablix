// Platine d'essai (breadboard) : géométrie des trous et connexions internes,
// sans DOM — partagé entre l'élément visuel <kablix-breadboard> et la netlist.
//
// Nommage des broches : colonnes 1..N, rangées a–e (bloc haut) et f–j (bloc
// bas) → 'a1'…'j63'. Rails d'alimentation : 'tp.i'/'tn.i' (haut +/−) et
// 'bp.i'/'bn.i' (bas +/−). Chaque colonne d'un bloc forme une bande (strip)
// conductrice ; chaque rail est une bande unique sur toute la longueur.

export type BreadboardSize = 'mini' | 'half' | 'full';

export interface BreadboardSpec {
  cols: number;
  rails: boolean;
}

export const BREADBOARD_SIZES: Record<BreadboardSize, BreadboardSpec> = {
  mini: { cols: 17, rails: false },
  half: { cols: 30, rails: true },
  full: { cols: 63, rails: true },
};

/** Pas entre deux trous (aligné sur l'écartement des broches des composants forkés). */
export const BB_STEP = 10;
const MARGIN_X = 16;
const RAIL_TOP_P = 10; // rail + du haut
const RAIL_TOP_N = 20; // rail − du haut
const RAIL_GAP = 20; // espace rail → bloc principal (multiple de 10 px = grille)

const ROWS_TOP = ['a', 'b', 'c', 'd', 'e'] as const;
const ROWS_BOTTOM = ['f', 'g', 'h', 'i', 'j'] as const;
const CHANNEL = 20; // rigole centrale entre e et f (multiple de 10 px = grille)

export function normalizeSize(value: string | null | undefined): BreadboardSize {
  return value === 'mini' || value === 'full' ? value : 'half';
}

export function breadboardDims(size: BreadboardSize): { width: number; height: number } {
  const spec = BREADBOARD_SIZES[size];
  const width = MARGIN_X * 2 + (spec.cols - 1) * BB_STEP;
  const gridH = 4 * BB_STEP; // a → e
  const railsH = spec.rails ? RAIL_TOP_N + RAIL_GAP : 8;
  const height = railsH + gridH + CHANNEL + gridH + (spec.rails ? RAIL_GAP + RAIL_TOP_N : 8) + 8;
  return { width, height };
}

function colX(col: number): number {
  return MARGIN_X + (col - 1) * BB_STEP;
}

function gridTopY(size: BreadboardSize): number {
  return BREADBOARD_SIZES[size].rails ? RAIL_TOP_N + RAIL_GAP : 10;
}

/** Trous d'un rail : groupes de 5 séparés d'un trou vide (esthétique classique). */
function railCols(cols: number): number[] {
  const out: number[] = [];
  for (let c = 2; c <= cols - 1; c++) {
    if ((c - 2) % 6 < 5) out.push(c);
  }
  return out;
}

export interface BreadboardPin {
  name: string;
  x: number;
  y: number;
}

/** Tous les trous de la platine, avec leur position locale. */
export function breadboardPins(size: BreadboardSize): BreadboardPin[] {
  const spec = BREADBOARD_SIZES[size];
  const pins: BreadboardPin[] = [];
  const top = gridTopY(size);
  const bottomStart = top + 4 * BB_STEP + CHANNEL;

  if (spec.rails) {
    railCols(spec.cols).forEach((c, i) => {
      pins.push({ name: `tp.${i + 1}`, x: colX(c), y: RAIL_TOP_P });
      pins.push({ name: `tn.${i + 1}`, x: colX(c), y: RAIL_TOP_N });
    });
  }
  for (let c = 1; c <= spec.cols; c++) {
    ROWS_TOP.forEach((row, r) => pins.push({ name: `${row}${c}`, x: colX(c), y: top + r * BB_STEP }));
    ROWS_BOTTOM.forEach((row, r) =>
      pins.push({ name: `${row}${c}`, x: colX(c), y: bottomStart + r * BB_STEP })
    );
  }
  if (spec.rails) {
    const railP = bottomStart + 4 * BB_STEP + RAIL_GAP;
    railCols(spec.cols).forEach((c, i) => {
      pins.push({ name: `bp.${i + 1}`, x: colX(c), y: railP });
      pins.push({ name: `bn.${i + 1}`, x: colX(c), y: railP + (RAIL_TOP_N - RAIL_TOP_P) });
    });
  }
  return pins;
}

/** Groupes de broches reliées électriquement (bandes verticales + rails). */
export function breadboardStrips(size: BreadboardSize): string[][] {
  const spec = BREADBOARD_SIZES[size];
  const strips: string[][] = [];
  for (let c = 1; c <= spec.cols; c++) {
    strips.push(ROWS_TOP.map((row) => `${row}${c}`));
    strips.push(ROWS_BOTTOM.map((row) => `${row}${c}`));
  }
  if (spec.rails) {
    const n = railCols(spec.cols).length;
    const rail = (prefix: string): string[] =>
      Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);
    strips.push(rail('tp'), rail('tn'), rail('bp'), rail('bn'));
  }
  return strips;
}

/** Broches de la même bande qu'une broche donnée (elle incluse). */
export function stripOfPin(size: BreadboardSize, pin: string): string[] {
  for (const strip of breadboardStrips(size)) {
    if (strip.includes(pin)) return strip;
  }
  return [pin];
}
