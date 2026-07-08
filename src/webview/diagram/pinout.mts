// Posters de brochage complet (Raspberry Pi Pico / Pico W), affichés à la demande
// par le bouton ☢ de l'éditeur. Importés comme texte (loader esbuild .svg).
// Les SVG ne contiennent plus que les étiquettes (fonctions + noms + numéros) :
// la carte réelle (<kablix-pico-board>) transparaît dans la bande centrale vide.
import picoPinout from '../composants/interne/pico-pinout.svg';
import picowPinout from '../composants/interne/picow-pinout.svg';
import unoPinout from '../composants/interne/uno-pinout.svg';
import megaPinout from '../composants/interne/mega pinout.svg';
// nano : poster non activé (voir POSTERS ci-dessous — retouche SVG requise).
// import nanoPinout from '../composants/interne/nano pinout.svg';

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
  // Posters AVR (rangées haut/bas encadrant le corps de la carte, cf. bornes
  // mesurées sur les pastilles power/gnd — rendu de validation Chrome headless).
  // Bornes = fraction Y des deux rangées de pastilles dans le viewBox du poster.
  uno: { svg: unoPinout, w: 293.05396, h: 479.98375, rTop: 0.331, rBot: 0.706 },
  mega: { svg: megaPinout, w: 142.70264, h: 130.34598, rTop: 0.308, rBot: 0.692 },
  // nano : poster écarté pour l'instant — sa bande de broches (0.489→0.646) est
  // trop resserrée face au ratio de la carte, l'étirement (k≈1.6) déborde. Le SVG
  // nano-pinout doit être retouché (module central redimensionné) avant activation.
  // nano: { svg: nanoPinout, w: 225.8154, h: 384.31277, rTop: 0.489, rBot: 0.646 },
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
