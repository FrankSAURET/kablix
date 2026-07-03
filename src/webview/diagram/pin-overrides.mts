// Surcharges de positions de broches (coordonnées px **finales** dans le repère
// local du composant), issues de la retouche manuelle des SVG de brochage.
// Permet de caler sur la grille de 10 px les composants au pas irrégulier, dont
// les rangées ne partagent pas la même phase de grille.
//
// Format : clé Kablix → { nom de broche → { x, y } }. Quand une surcharge existe,
// l'éditeur place la pastille à ces coordonnées telles quelles (pas de pinScale ni
// de calage automatique). Rempli depuis « svg retouche/<nom>.edit.svg » retouché :
// x/y = centre de la pastille rouge − marge (translate du board), recalé grille 10.
// Régénération : `node scripts/_extract-overrides.mjs` (lit chaque SVG via getCTM).
//
// Variantes : certains composants ont plusieurs brochages selon un attribut
// (clavier 3 vs 4 colonnes, 7 seg 1/2/4 chiffres, LCD I²C/parallèle). On les
// distingue par une clé suffixée (cf. `overridesFor`). Le clavier matriciel sort
// au pas ~9,6 px irrégulier : positions réelles du connecteur figées (non grille).
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

  // --- Composants recalés sur grille depuis « svg retouche/ » (générés) ----------
  '7seg-1dig': {
    'COM.2': { x: 30, y: 10 },
    'A': { x: 40, y: 10 },
    'B': { x: 50, y: 10 },
    'F': { x: 20, y: 10 },
    'G': { x: 10, y: 10 },
    'COM.1': { x: 30, y: 80 },
    'C': { x: 40, y: 80 },
    'D': { x: 20, y: 80 },
    'E': { x: 10, y: 80 },
    'DP': { x: 50, y: 80 },
  },
  '7seg-4dig': {
    'A': { x: 80, y: 10 },
    'B': { x: 120, y: 10 },
    'F': { x: 90, y: 10 },
    'DIG1': { x: 70, y: 10 },
    'DIG2': { x: 100, y: 10 },
    'DIG3': { x: 110, y: 10 },
    'CLN': { x: 130, y: 10 },
    'C': { x: 100, y: 80 },
    'D': { x: 80, y: 80 },
    'E': { x: 70, y: 80 },
    'G': { x: 110, y: 80 },
    'DP': { x: 90, y: 80 },
    'DIG4': { x: 120, y: 80 },
    'COM': { x: 130, y: 80 },
  },
  '7seg-2dig': {
    'DIG1': { x: 50, y: 10 },
    'DIG2': { x: 60, y: 10 },
    'A': { x: 30, y: 10 },
    'B': { x: 40, y: 10 },
    'F': { x: 70, y: 10 },
    'C': { x: 30, y: 80 },
    'D': { x: 60, y: 80 },
    'E': { x: 50, y: 80 },
    'G': { x: 70, y: 80 },
    'DP': { x: 40, y: 80 },
  },
  // Boutons : dessin retouché (repère = coin haut-gauche du dessin, tel quel).
  'button-6mm': {
    '1.l': { x: 10, y: 10 },
    '2.l': { x: 10, y: 30 },
    '1.r': { x: 40, y: 10 },
    '2.r': { x: 40, y: 30 },
  },
  'button': {
    '1.l': { x: 10, y: 20 },
    '2.l': { x: 10, y: 40 },
    '1.r': { x: 80, y: 20 },
    '2.r': { x: 80, y: 40 },
  },
  // DIP switch : dessin retouché (repère = coin haut-gauche du dessin, tel quel).
  'dip-switch': {
    '1a': { x: 10, y: 60 },
    '2a': { x: 20, y: 60 },
    '3a': { x: 30, y: 60 },
    '4a': { x: 40, y: 60 },
    '5a': { x: 50, y: 60 },
    '6a': { x: 60, y: 60 },
    '7a': { x: 70, y: 60 },
    '8a': { x: 80, y: 60 },
    '8b': { x: 80, y: 10 },
    '7b': { x: 70, y: 10 },
    '6b': { x: 60, y: 10 },
    '5b': { x: 50, y: 10 },
    '4b': { x: 40, y: 10 },
    '3b': { x: 30, y: 10 },
    '2b': { x: 20, y: 10 },
    '1b': { x: 10, y: 10 },
  },
  // Joystick analogique : dessin retouché (5 broches en bas, pas de 10 px).
  'joystick': {
    'VCC': { x: 40, y: 130 },
    'VERT': { x: 50, y: 130 },
    'HORZ': { x: 60, y: 130 },
    'SEL': { x: 70, y: 130 },
    'GND': { x: 80, y: 130 },
  },
  'lcd-i2c': {
    'GND': { x: 20, y: 50 },
    'VCC': { x: 20, y: 60 },
    'SDA': { x: 20, y: 70 },
    'SCL': { x: 20, y: 80 },
  },
  'lcd-i2c-20x4': {
    'GND': { x: 20, y: 50 },
    'VCC': { x: 20, y: 60 },
    'SDA': { x: 20, y: 70 },
    'SCL': { x: 20, y: 80 },
  },
  // LCD parallèle 16×2 (broches VSS…K le long du bord bas, y=140).
  'lcd': {
    'VSS': { x: 40, y: 140 },
    'VDD': { x: 50, y: 140 },
    'V0': { x: 60, y: 140 },
    'RS': { x: 70, y: 140 },
    'RW': { x: 80, y: 140 },
    'E': { x: 90, y: 140 },
    'D0': { x: 100, y: 140 },
    'D1': { x: 110, y: 140 },
    'D2': { x: 120, y: 140 },
    'D3': { x: 130, y: 140 },
    'D4': { x: 140, y: 140 },
    'D5': { x: 150, y: 140 },
    'D6': { x: 160, y: 140 },
    'D7': { x: 170, y: 140 },
    'A': { x: 180, y: 140 },
    'K': { x: 190, y: 140 },
  },
  // LCD parallèle 20×4 (même ordre de broches, y=190).
  'lcd-parallel-20x4': {
    'VSS': { x: 40, y: 190 },
    'VDD': { x: 50, y: 190 },
    'V0': { x: 60, y: 190 },
    'RS': { x: 70, y: 190 },
    'RW': { x: 80, y: 190 },
    'E': { x: 90, y: 190 },
    'D0': { x: 100, y: 190 },
    'D1': { x: 110, y: 190 },
    'D2': { x: 120, y: 190 },
    'D3': { x: 130, y: 190 },
    'D4': { x: 140, y: 190 },
    'D5': { x: 150, y: 190 },
    'D6': { x: 160, y: 190 },
    'D7': { x: 170, y: 190 },
    'A': { x: 180, y: 190 },
    'K': { x: 190, y: 190 },
  },
  'oled-ssd1306': {
    'DATA': { x: 59, y: 20 },
    'CLK': { x: 69, y: 20 },
    'DC': { x: 79, y: 20 },
    'RST': { x: 89, y: 20 },
    'CS': { x: 99, y: 20 },
    '3V3': { x: 109, y: 20 },
    'VIN': { x: 119, y: 20 },
    'GND': { x: 129, y: 20 },
  },
};

/**
 * Surcharges applicables à un composant, en tenant compte de ses variantes par
 * attribut (clavier 3/4 colonnes, 7 seg 1/2/4 chiffres, LCD I²C/parallèle).
 * Renvoie undefined si aucune surcharge (calage automatique).
 */
export function overridesFor(
  type: string,
  attrs?: Record<string, string>
): Record<string, { x: number; y: number }> | undefined {
  if (type === 'keypad') {
    const cols = attrs?.columns === '3' ? '3' : '4';
    return PIN_OVERRIDES[`keypad-${cols}col`];
  }
  // Afficheur 7 segments : brochage selon le nombre de chiffres. Le 2 chiffres
  // n'a pas été recalé → pas d'entrée (calage auto).
  if (type === '7seg') return PIN_OVERRIDES[`7seg-${attrs?.digits ?? '1'}dig`];
  // LCD texte : 4 variantes selon interface (i2c/parallèle) et taille (16×2/20×4).
  if (type === 'lcd') {
    const parallel = (attrs?.pins ?? 'i2c') === 'full';
    const big = (attrs?.lcdSize ?? '16x2') === '20x4';
    if (parallel) return PIN_OVERRIDES[big ? 'lcd-parallel-20x4' : 'lcd'];
    return PIN_OVERRIDES[big ? 'lcd-i2c-20x4' : 'lcd-i2c'];
  }
  return PIN_OVERRIDES[type];
}
