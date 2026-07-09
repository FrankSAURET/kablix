// Posters de brochage complet (Raspberry Pi Pico / Pico W), affichés à la demande
// par le bouton ☢ de l'éditeur. Importés comme texte (loader esbuild .svg).
// Les SVG ne contiennent plus que les étiquettes (fonctions + noms + numéros) :
// la carte réelle (<kablix-pico-board>) transparaît dans la bande centrale vide.
import picoPinout from '../composants/interne/pico-pinout.svg';
import picowPinout from '../composants/interne/picow-pinout.svg';
import unoPinout from '../composants/interne/uno-pinout.svg';
import megaPinout from '../composants/interne/mega pinout.svg';
import nanoPinout from '../composants/interne/nano pinout.svg';

/** Poster prêt à poser en surimpression de la carte. */
export interface PinoutPoster {
  /** Markup SVG du poster (sans l'en-tête <?xml?>). */
  svg: string;
  /** Mode de pose. */
  mode: 'stretch' | 'align';
  /** Largeur propre du poster (unités viewBox) — dimension CSS de rendu. */
  w: number;
  /** Hauteur propre du poster (unités viewBox). */
  h: number;

  // --- mode 'stretch' (pico/picow) : bande vide calée sur la carte par étirement Y ---
  /** Bord haut de la bande vide (fraction 0–1 de h). */
  rTop?: number;
  /** Bord bas de la bande vide (fraction 0–1 de h). */
  rBot?: number;

  // --- mode 'align' (nano/uno/mega) : pose 1:1 alignée sur les pins de la carte ---
  /**
   * Largeur/hauteur de la viewBox de la CARTE externe = échelle de rendu du poster
   * (1 unité carte = 1 unité poster, mesuré : échelle poster↔pins = 1.0).
   */
  cardW?: number;
  cardH?: number;
  /**
   * Coordonnées, DANS le repère du poster, du point qui doit coïncider avec
   * l'origine (0,0) de la carte. = position mesurée d'une pastille de calage moins
   * la position du pin correspondant sur la carte (getCTM, Chrome headless). Le
   * poster est plus grand que la carte (étiquettes autour) : ces étiquettes
   * débordent librement en haut/bas, la carte transparaît au milieu.
   */
  ox?: number;
  oy?: number;
}

// Deux modes de pose selon le type de poster :
//  • 'stretch' (pico/picow) : poster plein cadre, la carte occupe une bande vide
//    [rTop, rBot] recalée par un étirement vertical.
//  • 'align' (nano/uno/mega) : poster dessiné dans le repère des pins, posé 1:1
//    (échelle uniforme = largeur_carte_px / cardW, aucune déformation). L'offset
//    (ox, oy) aligne les pastilles de calage de Frank sur les pins de la carte.
//    Offsets mesurés au navigateur (getCTM des pastilles rouges vs pins composant).
//    Les pastilles et numéros rouges (repères de calage) ont été retirés des SVG.
const POSTERS: Record<string, PinoutPoster> = {
  pico: { svg: picoPinout, mode: 'stretch', w: 209.24001, h: 357.76389, rTop: 0.3897, rBot: 0.6075 },
  picow: { svg: picowPinout, mode: 'stretch', w: 208.66299, h: 357.73111, rTop: 0.3897, rBot: 0.6075 },
  nano: { svg: nanoPinout, mode: 'align', w: 225.8154, h: 384.31277, cardW: 190, cardH: 80, ox: -9.48, oy: 177.82 },
  uno: { svg: unoPinout, mode: 'align', w: 293.05396, h: 479.98375, cardW: 300, cardH: 220, ox: -5.98, oy: 139 },
  mega: { svg: megaPinout, mode: 'align', w: 142.70264, h: 130.34598, cardW: 430, cardH: 210, ox: -4.32, oy: 140.34 },
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
