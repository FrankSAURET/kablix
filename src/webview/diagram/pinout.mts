// Posters de brochage complet (Raspberry Pi Pico / Pico W…), affichés à la demande
// par le bouton ☢ de l'éditeur.
// Les SVG ne contiennent plus que les étiquettes (fonctions + noms + numéros) :
// la carte réelle (<kablix-pico-board>) transparaît dans la bande centrale vide.
//
// Ils ne sont PLUS inlinés dans le bundle : à eux cinq ils pesaient ~3,7 Mo des
// 7,9 Mo de webview.js, chargés et évalués à CHAQUE ouverture de projet alors
// qu'ils ne servent qu'au clic sur ☢. Ils sont désormais copiés tels quels dans
// dist/pinout/ (esbuild.js) et récupérés par fetch au premier affichage, puis
// gardés en cache pour la durée de la session.

/** Poster prêt à poser en surimpression de la carte. */
export interface PinoutPoster {
  /** Mode de pose. */
  mode: 'stretch' | 'align';
  /** Largeur propre du poster (unités viewBox) — dimension CSS de rendu. */
  w: number;
  /** Hauteur propre du poster (unités viewBox). */
  h: number;
  /**
   * Nom du SVG dans dist/pinout/ quand il diffère du type de carte : plusieurs
   * cartes au brochage identique partagent un poster (Pico 2 → pico).
   */
  file?: string;

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
  pico: { mode: 'stretch', w: 209.24001, h: 357.76389, rTop: 0.3897, rBot: 0.6075 },
  picow: { mode: 'stretch', w: 208.66299, h: 357.73111, rTop: 0.3897, rBot: 0.6075 },
  // Pico 2 / Pico 2 W : cartes dessinées en PORTRAIT, poster propre (Frank), avec
  // les mêmes pastilles de calage que la carte — donc mode 'align', s = 1 : la
  // colonne de gauche du poster (x = 150) tombe sur la rangée de gauche de la
  // carte (x = 10), d'où tx = -140 ; les deux ont les broches de y = 20 à 210,
  // d'où ty = 0. Le brochage lui-même est identique à celui de leur aîné
  // (étiquette pour étiquette), seule la sérigraphie de la carte change.
  pico2: { mode: 'align', w: 370, h: 220, cardW: 90, s: 1, tx: -140, ty: 0 },
  pico2w: { mode: 'align', w: 369.9999, h: 220, cardW: 90, s: 1, tx: -140, ty: 0 },
  nano: { mode: 'align', w: 225.8154, h: 384.31277, cardW: 190, s: 1, tx: 9.48, ty: -177.82 },
  // Poster uno redessiné par Frank (v2026.9.1.49) : viewBox 280×450 au lieu de
  // 293×480. Calage remesuré sur les tiges du poster (pas de 10 px = celui de la
  // carte, donc s = 1) : la rangée haute finit à x = 237.53 pour la patte 0 en
  // x = 280 (tx = 42.52), et son bas de tige est à y = 135.06 pour y = 20 sur la
  // carte (ty = -115.07 ; la rangée basse donne -115.08, écart sous 0,02 px).
  uno: { mode: 'align', w: 280, h: 450, cardW: 300, s: 1, tx: 42.52, ty: -115.07 },
  mega: { mode: 'align', w: 142.70264, h: 130.34598, cardW: 430, s: 3.7795, tx: 4.32, ty: -140.34 },
  // Grove Shield (Pico) : brochage dessiné par Frank dans Composants2D.svg
  // (Grove-Pico-Pi-Interne), extrait en px (s = 1). Calé sur ses deux pastilles
  // de repère I2C0.GND (60, 20) et D20.GND (180, 200) de la carte : écart
  // résiduel ±0,5 px en x (le dessin fait 1 px de moins entre les deux).
  'grove-pico': { mode: 'align', w: 240, h: 272, cardW: 220, s: 1, tx: -10.05, ty: -10.84 },
};

/** La carte a-t-elle un poster de brochage ? (test synchrone : bouton ☢) */
export function hasPinout(type: string): boolean {
  return POSTERS[type] !== undefined;
}

/** Géométrie de pose du poster (sans le markup), ou null si la carte n'en a pas. */
export function pinoutPoster(type: string): PinoutPoster | null {
  return POSTERS[type] ?? null;
}

/** Markup déjà chargé, par type de carte (une seule requête par session). */
const svgCache = new Map<string, string>();

/**
 * Markup SVG du poster, chargé depuis dist/pinout/ au premier appel.
 * Renvoie null si la carte n'a pas de poster ou si le fichier est introuvable
 * (le bouton ☢ reste alors sans effet plutôt que de casser l'éditeur).
 */
export async function loadPinoutSvg(type: string): Promise<string | null> {
  if (!hasPinout(type)) return null;
  const cached = svgCache.get(type);
  if (cached !== undefined) return cached;
  const base = (globalThis as { KABLIX_PINOUT_BASE?: string }).KABLIX_PINOUT_BASE;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/${POSTERS[type].file ?? type}.svg`);
    if (!res.ok) return null;
    const text = await res.text();
    const svg = text.slice(text.indexOf('<svg')); // retire <?xml?> / commentaires
    svgCache.set(type, svg);
    return svg;
  } catch {
    return null;
  }
}
