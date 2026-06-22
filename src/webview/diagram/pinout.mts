// Posters de brochage complet (Raspberry Pi Pico / Pico W), affichés à la demande
// par le bouton ☢ de l'éditeur. Importés comme texte (loader esbuild .svg).
// Les SVG ne contiennent plus que les étiquettes (fonctions + noms + numéros) :
// la carte réelle (<kablix-pico-board>) transparaît dans la bande centrale vide.
import picoPinout from '../elements/pico-pinout.svg';
import picowPinout from '../elements/picow-pinout.svg';
import { BOARD_W, BOARD_H } from '../elements/pico-board.mjs';

/**
 * Description d'un poster prêt à poser en surimpression de la carte.
 * Tout est exprimé en pixels « carte » (unités monde) : la pose est donc
 * indépendante de la taille réelle de la boîte `.part__body` (qui peut être plus
 * grande que la carte) et suit le zoom comme le reste du monde.
 */
export interface PinoutPoster {
  /** Markup SVG du poster (sans l'en-tête <?xml?>). */
  svg: string;
  /** Largeur de pose = largeur exacte de la carte. */
  width: number;
  /** Décalage vertical (px carte) calant le centre de la bande vide sur le centre de la carte. */
  offsetY: number;
}

// Dimensions propres de chaque poster + fraction verticale de sa bande centrale
// vide (là où la carte transparaît). Mesurées sur les SVG (cf. composite de
// validation) : c'est cette bande qui doit coïncider avec le centre de la carte.
const POSTERS: Record<string, { svg: string; w: number; h: number; gap: number }> = {
  pico: { svg: picoPinout, w: 209.24001, h: 357.76389, gap: 0.4623 },
  picow: { svg: picowPinout, w: 208.66299, h: 357.73111, gap: 0.4721 },
};

/** Poster de brochage complet (texte SVG brut) pour un type de carte, ou null. */
export function pinoutSvg(type: string): string | null {
  return POSTERS[type]?.svg ?? null;
}

/** Poster prêt à poser (largeur + décalage), ou null si la carte n'en a pas. */
export function pinoutPoster(type: string): PinoutPoster | null {
  const p = POSTERS[type];
  if (!p) return null;
  const svg = p.svg.slice(p.svg.indexOf('<svg')); // retire <?xml?> / commentaires
  // Le poster est mis à la largeur de la carte ; sa hauteur suit alors le rapport
  // d'aspect. Le centre de la bande vide doit tomber au centre vertical de la carte.
  const scaledH = (BOARD_W * p.h) / p.w;
  const offsetY = BOARD_H / 2 - p.gap * scaledH;
  return { svg, width: BOARD_W, offsetY };
}
