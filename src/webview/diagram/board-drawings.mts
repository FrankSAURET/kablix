// Dessins de composants retouchés à la main (« svg retouche/<type>.edit.svg »,
// nettoyés par scripts/_clean-board-svg.mjs → src/webview/composants/externe/<type>.svg).
// Quand un type a un dessin ici, l'éditeur l'affiche À LA PLACE du rendu Lit :
// le repère du dessin (viewBox) = celui des surcharges de broches (pin-overrides),
// donc les pastilles tombent pile sur le dessin. L'élément Lit reste présent
// (caché) pour `pinInfo` et la simulation.
import buttonSvg from '../composants/externe/button.svg';
import button6mmSvg from '../composants/externe/button-6mm.svg';
import dipSwitchSvg from '../composants/externe/dip-switch.svg';
import joystickSvg from '../composants/externe/joystick.svg';

const DRAWINGS: Record<string, string> = {
  // Composants INTERACTIFS : le dessin est affiché, l'élément Lit reste
  // par-dessus (transparent, calé sur les broches) pour capter les clics.
  button: buttonSvg,
  'button-6mm': button6mmSvg,
  'dip-switch': dipSwitchSvg,
  joystick: joystickSvg,
};

export interface BoardDrawing {
  svg: string;
  w: number;
  h: number;
}

/** Dessin retouché d'un type, ou null. `w`/`h` = dimensions du viewBox
 * (= repère px des surcharges). */
export function boardDrawing(type: string): BoardDrawing | null {
  const svg = DRAWINGS[type];
  if (!svg) return null;
  const m = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  return { svg, w: m ? Number(m[1]) : 0, h: m ? Number(m[2]) : 0 };
}
