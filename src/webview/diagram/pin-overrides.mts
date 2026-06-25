// Surcharges de positions de broches (coordonnées px **finales** dans le repère
// local du composant), issues de la retouche manuelle des SVG de brochage.
// Permet de caler sur la grille de 10 px les cartes au pas irrégulier (Uno/Mega),
// dont les rangées ne partagent pas la même phase de grille.
//
// Format : clé Kablix → { nom de broche → { x, y } }. Quand une surcharge existe,
// l'éditeur place la pastille à ces coordonnées telles quelles (pas de pinScale ni
// de calage automatique). Rempli depuis « svg retouche/<nom>.edit.svg » retouché :
// x/y = centre de la pastille rouge − marge du dessin (translate du groupe board).
//
// Variantes : certains composants ont plusieurs brochages selon un attribut
// (clavier 3 vs 4 colonnes…). On les distingue par une clé suffixée (cf.
// `overridesFor`). Le clavier matriciel sort en pas ~9,6 px irrégulier : sans
// surcharge, le calage sur grille décale les pastilles du connecteur dessiné (le
// brochage ne tombe plus en face des broches). On fige donc les positions réelles.
export const PIN_OVERRIDES: Record<string, Record<string, { x: number; y: number }>> = {
  // Clavier 4 colonnes (4×4) — positions du connecteur (= pinInfo Wokwi).
  'keypad-4col': {
    R1: { x: 100, y: 338 },
    R2: { x: 110, y: 338 },
    R3: { x: 119.5, y: 338 },
    R4: { x: 129, y: 338 },
    C1: { x: 138.5, y: 338 },
    C2: { x: 148, y: 338 },
    C3: { x: 157.75, y: 338 },
    C4: { x: 167.5, y: 338 },
  },
  // Clavier 3 colonnes (3×4).
  'keypad-3col': {
    R1: { x: 76.5, y: 338 },
    R2: { x: 86, y: 338 },
    R3: { x: 95.75, y: 338 },
    R4: { x: 105.25, y: 338 },
    C1: { x: 115, y: 338 },
    C2: { x: 124.5, y: 338 },
    C3: { x: 134, y: 338 },
  },
};

/**
 * Surcharges applicables à un composant, en tenant compte de ses variantes par
 * attribut (clavier : 3 ou 4 colonnes). Renvoie undefined si aucune surcharge.
 */
export function overridesFor(
  type: string,
  attrs?: Record<string, string>
): Record<string, { x: number; y: number }> | undefined {
  if (type === 'keypad') {
    const cols = attrs?.columns === '3' ? '3' : '4';
    return PIN_OVERRIDES[`keypad-${cols}col`];
  }
  return PIN_OVERRIDES[type];
}
