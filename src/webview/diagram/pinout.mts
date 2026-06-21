// Posters de brochage complet (Raspberry Pi Pico / Pico W), affichés à la demande
// par le bouton ☢ de l'éditeur. Importés comme texte (loader esbuild .svg).
// Le rappel des broches de debug (SWCLK/GND/SWDIO) a été retiré des posters.
import picoPinout from '../elements/pico-pinout.svg';
import picowPinout from '../elements/picow-pinout.svg';

/** Poster de brochage complet pour un type de carte, ou null s'il n'y en a pas. */
export function pinoutSvg(type: string): string | null {
  if (type === 'pico') return picoPinout;
  if (type === 'picow') return picowPinout;
  return null;
}
