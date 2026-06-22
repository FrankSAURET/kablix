// Posters de brochage complet (Raspberry Pi Pico / Pico W), affichés à la demande
// par le bouton ☢ de l'éditeur. Importés comme texte (loader esbuild .svg).
// Les SVG ne contiennent plus que les étiquettes (fonctions + noms + numéros) :
// la carte réelle (<kablix-pico-board>) transparaît dans la bande centrale vide.
import picoPinout from '../elements/pico-pinout.svg';
import picowPinout from '../elements/picow-pinout.svg';

/** Poster de brochage complet pour un type de carte, ou null s'il n'y en a pas. */
export function pinoutSvg(type: string): string | null {
  if (type === 'pico') return picoPinout;
  if (type === 'picow') return picowPinout;
  return null;
}

/**
 * Fraction verticale du poster (0–1) qui coïncide avec le centre de la carte :
 * c'est le milieu de la bande centrale vide du poster (là où la carte transparaît).
 * En la calant sur le centre du corps, les colonnes de broches s'alignent sur les
 * plots réels. Valeurs mesurées sur les SVG (cf. composite de validation).
 */
export function pinoutAnchor(type: string): number {
  if (type === 'pico') return 0.4623;
  if (type === 'picow') return 0.4721;
  return 0.5;
}
