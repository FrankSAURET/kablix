// Inscription d'un BOÎTIER PARTAGÉ (TO-92, TO-220, TO92S…) : le dessin externe
// ne dit rien du modèle, c'est le composant qui écrit sa référence dessus.
// Partagé par tous les éléments à boîtier (transistor, capteur à effet Hall…) —
// le calage de la face plate change, la mise en page des lignes non.
import { svg } from 'lit';
import type { SVGTemplateResult } from 'lit';

/** Calage de l'inscription sur la face plate d'un boîtier (repère du dessin). */
export interface PackageFace {
  /** Abscisse du CENTRE de la face (les lignes y sont centrées). */
  tx: number;
  /** Ordonnée du centre de la face. */
  cy: number;
  /** Largeur utilisable : une ligne plus longue fait rétrécir l'inscription. */
  tw: number;
  /** Taille maximale de la police. */
  font: number;
  /** Couleur de l'encre (gris clair sur un boîtier noir). */
  fill: string;
}

/**
 * Lignes de l'inscription, centrées sur la face plate : une ligne par saut de
 * ligne, le bloc reste centré quel que soit leur nombre. Une ligne trop longue
 * pour la face fait rétrécir TOUTE l'inscription (monospace : ~0,62 em par
 * caractère) — une référence à rallonge ne déborde donc jamais du boîtier.
 */
export function packageText(text: string, face: PackageFace): SVGTemplateResult[] {
  const lines = String(text ?? '').split('\n').filter((l) => l.length > 0);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const font = Math.min(face.font, face.tw / (0.62 * longest));
  const step = font * 1.2;
  // Le centre du bloc est une LIGNE DE BASE : décalé d'un tiers de la hauteur de
  // capitale sous le centre géométrique de la face.
  const top = face.cy + 0.36 * font - ((lines.length - 1) * step) / 2;
  // Balise `svg` OBLIGATOIRE ici : un fragment écrit avec `html` serait analysé
  // hors du contexte SVG — le <text> naîtrait dans le namespace HTML et resterait
  // invisible (inscription disparue).
  return lines.map(
    (line, i) => svg`<text x=${face.tx} y=${top + i * step} font-size=${font} fill=${face.fill}>${line}</text>`
  );
}
