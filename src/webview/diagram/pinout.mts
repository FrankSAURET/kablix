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
   * Bord **haut** de la bande vide du poster (fraction 0–1 de la hauteur) = bord
   * supérieur de la carte qui transparaît. Mappé sur le bord haut de la carte.
   */
  rTop: number;
  /** Bord **bas** de la bande vide = bord inférieur de la carte. */
  rBot: number;
}

// La bande vide [rTop, rBot] (entre les deux blocs d'étiquettes) est calée
// **exactement** sur la carte : un léger étirement vertical aligne donc à la fois
// la rangée du haut et celle du bas (contrairement à un simple centrage). Bornes
// mesurées sur les SVG (cf. rendu de validation Chrome headless).
const POSTERS: Record<string, PinoutPoster> = {
  pico: { svg: picoPinout, w: 209.24001, h: 357.76389, rTop: 0.3897, rBot: 0.6075 },
  picow: { svg: picowPinout, w: 208.66299, h: 357.73111, rTop: 0.3897, rBot: 0.6075 },
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
