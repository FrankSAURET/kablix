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
  nano: { mode: 'align', w: 225.8154, h: 384.31277, cardW: 190, s: 1, tx: 9.48, ty: -177.82 },
  uno: { mode: 'align', w: 293.05396, h: 479.98375, cardW: 300, s: 1, tx: 5.97, ty: -139 },
  mega: { mode: 'align', w: 142.70264, h: 130.34598, cardW: 430, s: 3.7795, tx: 4.32, ty: -140.34 },
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
    const res = await fetch(`${base}/${type}.svg`);
    if (!res.ok) return null;
    const text = await res.text();
    const svg = text.slice(text.indexOf('<svg')); // retire <?xml?> / commentaires
    svgCache.set(type, svg);
    return svg;
  } catch {
    return null;
  }
}
