// Posters de brochage complet (Raspberry Pi Pico / Pico W), affichés à la demande
// par le bouton ☢ de l'éditeur. Importés comme texte (loader esbuild .svg).
// Les SVG ne contiennent plus que les étiquettes (fonctions + noms + numéros) :
// la carte réelle (<kablix-pico-board>) transparaît dans la bande centrale vide.
import picoPinout from '../elements/pico-pinout.svg';
import picowPinout from '../elements/picow-pinout.svg';

/** Poster prêt à poser en surimpression de la carte. */
export interface PinoutPoster {
  /** Markup SVG du poster (sans l'en-tête <?xml?>). */
  svg: string;
  /** Largeur propre du poster (unités viewBox). */
  w: number;
  /** Hauteur propre du poster (unités viewBox). */
  h: number;
  /**
   * Fraction verticale (0–1) de la bande centrale vide du poster (là où la carte
   * transparaît) : c'est elle qui doit coïncider avec le centre vertical de la
   * carte. Mesurée sur les SVG (cf. composite de validation).
   */
  gap: number;
}

const POSTERS: Record<string, PinoutPoster> = {
  pico: { svg: picoPinout, w: 209.24001, h: 357.76389, gap: 0.4888 },
  picow: { svg: picowPinout, w: 208.66299, h: 357.73111, gap: 0.4986 },
};

/** Poster de brochage complet (texte SVG brut) pour un type de carte, ou null. */
export function pinoutSvg(type: string): string | null {
  return POSTERS[type]?.svg ?? null;
}

/** Poster prêt à poser (markup nettoyé + géométrie), ou null si la carte n'en a pas. */
export function pinoutPoster(type: string): PinoutPoster | null {
  const p = POSTERS[type];
  if (!p) return null;
  return { ...p, svg: p.svg.slice(p.svg.indexOf('<svg')) }; // retire <?xml?> / commentaires
}
