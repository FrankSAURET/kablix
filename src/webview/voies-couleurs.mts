// Palette des VOIES d'instrument, partagée par le traceur de courbes
// (plotter.mts), les sondes logiques posées sur le schéma
// (sonde-logique-element.mts) et l'analyseur logique qui les trace.
//
// Pourquoi un module à part : la couleur d'une voie doit être LA MÊME des deux
// côtés de l'écran — la pince bleue sur la planche et la voie bleue dans
// l'analyseur. Deux copies de la palette auraient dérivé au premier retour de
// Frank sur une teinte.
//
// Teintes choisies contre les deux fonds de VS Code (clair #fff, sombre
// #1f1f1f), ordre fixe optimisé pour le daltonisme. Au-delà de la 8e voie on
// rend un gris neutre : **une teinte n'est jamais recyclée**, sinon deux
// sondes porteraient la même couleur et le lien visuel serait faux.

// Ni BLANC, ni NOIR, ni ROUGE, ni GRIS (Frank, .91) : le blanc et le noir sont
// les fonds des deux thèmes, le gris est la teinte de débordement (au-delà de
// huit voies), et le rouge est réservé aux pastilles de broche et aux défauts —
// une voie rouge se serait lue comme une erreur. L'ancien `#e34948` de la
// 6e voie est donc devenu un TURQUOISE, la seule famille encore libre qui tient
// sur les deux fonds sans se confondre avec le bleu de la 1re.
export const PALETTE_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#0e8f9e', '#e87ba4', '#eb6834'];
export const PALETTE_DARK = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#2ab5c6', '#d55181', '#d95926'];
export const OVERFLOW_COLOR = '#888888';

/**
 * Nom de chaque teinte, pour la liste déroulante qui laisse l'élève CHOISIR la
 * couleur d'une sonde (inspecteur). Les noms doivent survivre au changement de
 * thème : ils décrivent la famille, pas la valeur exacte — le bleu clair et le
 * bleu foncé des deux palettes sont « Blue » des deux côtés.
 */
export const NOMS_VOIES = [
  'Blue', 'Green', 'Amber', 'Dark green', 'Purple', 'Teal', 'Pink', 'Orange',
] as const;

/** Nombre de teintes distinctes avant le gris de débordement. */
export const PALETTE_SIZE = PALETTE_LIGHT.length;

/**
 * Teinte de la voie d'indice `idx` (0-based), pour le thème demandé.
 * Un indice au-delà de la palette rend le gris neutre.
 */
export function couleurVoie(idx: number, sombre: boolean): string {
  const palette = sombre ? PALETTE_DARK : PALETTE_LIGHT;
  return idx >= 0 && idx < palette.length ? palette[idx]! : OVERFLOW_COLOR;
}

/**
 * Voies dont la teinte rappelle un fil Dupont, de la plus proche à la moins
 * proche. Écrit à la main : la seule distance de teinte enverrait le fil orange
 * sur l'ambre (33° contre 41°) et non sur l'orange que l'élève attend.
 * Noir, blanc et gris n'ont pas d'équivalent dans la palette (exclus exprès).
 */
const VOIES_PAR_FIL: Record<string, number[]> = {
  red: [7, 6],
  orange: [7, 2],
  yellow: [2, 7],
  green: [1, 3, 5],
  blue: [0, 5, 4],
  purple: [4, 6, 0],
  fuchsia: [6, 4],
  brown: [7, 2],
};

/** Teinte (0-360°) et saturation (0-1) d'une couleur `#rrggbb`, ou null. */
function teinte(hex: string): { h: number; s: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return { h: 0, s: 0 };
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max === 0 ? 0 : d / max };
}

/**
 * Voies candidates pour une sonde branchée sur un fil de couleur `couleur`
 * (identifiant Dupont ou `#rrggbb`), de la plus ressemblante à la moins.
 * Liste vide : couleur sans équivalent (noir, blanc, gris) — la sonde prend
 * alors simplement la première teinte libre.
 */
export function voiesProchesDuFil(couleur: string | undefined): number[] {
  if (!couleur) return [];
  const connu = VOIES_PAR_FIL[couleur.trim().toLowerCase()];
  if (connu) return connu;
  const t = teinte(couleur);
  if (!t || t.s < 0.25) return [];
  const ecart = (i: number): number => {
    const v = teinte(PALETTE_LIGHT[i]!)!;
    const e = Math.abs(v.h - t.h);
    return Math.min(e, 360 - e);
  };
  return [...PALETTE_LIGHT.keys()].sort((a, b) => ecart(a) - ecart(b)).slice(0, 3);
}

/**
 * Thème courant de la webview, lu sur le `<body>` que VS Code habille.
 * Défaut sombre (comme le traceur) : la classe `vscode-light` est le seul
 * marqueur fiable du thème clair.
 */
export function themeSombre(): boolean {
  return !document.body.classList.contains('vscode-light');
}
