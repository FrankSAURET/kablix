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

export const PALETTE_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
export const PALETTE_DARK = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
export const OVERFLOW_COLOR = '#888888';

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
 * Thème courant de la webview, lu sur le `<body>` que VS Code habille.
 * Défaut sombre (comme le traceur) : la classe `vscode-light` est le seul
 * marqueur fiable du thème clair.
 */
export function themeSombre(): boolean {
  return !document.body.classList.contains('vscode-light');
}
