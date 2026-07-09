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

  // --- mode 'align' (nano/uno/mega) : pose alignée sur les pins de la carte ---
  /** Largeur de la viewBox de la CARTE externe (px carte = width_px / cardW). */
  cardW?: number;
  /**
   * Transform mesurée poster→carte : coord_carte = s·coord_poster + t (échelle
   * uniforme sx=sy=s, pas de rotation). Mesurée au navigateur (getBoundingClientRect
   * des pastilles de calage vs pins du composant, régression). Le poster déborde de
   * la carte (étiquettes autour) : elles restent visibles, la carte transparaît.
   */
  s?: number;
  tx?: number;
  ty?: number;
}

// Deux modes de pose selon le type de poster :
//  • 'stretch' (pico/picow) : poster plein cadre, la carte occupe une bande vide
//    [rTop, rBot] recalée par un étirement vertical.
//  • 'align' (nano/uno/mega) : poster dessiné avec des pastilles de calage aux
//    positions des pins ; posé sans déformation via la transform mesurée
//    coord_carte = s·coord_poster + t (échelle uniforme). nano/uno sont à s=1,
//    mega à s≈3.78 (sa viewBox est plus petite). Transforms mesurées au navigateur
//    (getBoundingClientRect des pastilles vs pins composant, régression, erreur
//    sous-pixel). Les pastilles et numéros rouges de calage ont été retirés des SVG.
const POSTERS: Record<string, PinoutPoster> = {
  pico: { svg: picoPinout, mode: 'stretch', w: 209.24001, h: 357.76389, rTop: 0.3897, rBot: 0.6075 },
  picow: { svg: picowPinout, mode: 'stretch', w: 208.66299, h: 357.73111, rTop: 0.3897, rBot: 0.6075 },
  nano: { svg: nanoPinout, mode: 'align', w: 225.8154, h: 384.31277, cardW: 190, s: 1, tx: 9.48, ty: -177.82 },
  uno: { svg: unoPinout, mode: 'align', w: 293.05396, h: 479.98375, cardW: 300, s: 1, tx: 5.97, ty: -139 },
  mega: { svg: megaPinout, mode: 'align', w: 142.70264, h: 130.34598, cardW: 430, s: 3.7795, tx: 4.32, ty: -140.34 },
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
