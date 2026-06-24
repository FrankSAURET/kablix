// Surcharges de positions de broches (coordonnées px **finales** dans le repère
// local du composant), issues de la retouche manuelle des SVG de brochage.
// Permet de caler sur la grille de 10 px les cartes au pas irrégulier (Uno/Mega),
// dont les rangées ne partagent pas la même phase de grille.
//
// Format : type Kablix → { nom de broche → { x, y } }. Quand une surcharge existe,
// l'éditeur place la pastille à ces coordonnées telles quelles (pas de pinScale ni
// de calage automatique). Rempli depuis `<type>-pins.edit.svg` retouché.
export const PIN_OVERRIDES: Record<string, Record<string, { x: number; y: number }>> = {};
