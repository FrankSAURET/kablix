// Dessins de composants retouchés à la main (« svg retouche/<type>.edit.svg »,
// nettoyés par scripts/_clean-board-svg.mjs → src/webview/elements/boards/<type>.svg).
// Quand un type a un dessin ici, l'éditeur l'affiche À LA PLACE du rendu @wokwi :
// le repère du dessin (viewBox) = celui des surcharges de broches (pin-overrides),
// donc les pastilles tombent pile sur le dessin. L'élément @wokwi reste présent
// (caché) pour `pinInfo` et la simulation.
import megaSvg from '../elements/boards/mega.svg';
import unoSvg from '../elements/boards/uno.svg';
import nanoSvg from '../elements/boards/nano.svg';

const DRAWINGS: Record<string, string> = {
  mega: megaSvg,
  uno: unoSvg,
  nano: nanoSvg,
};

export interface BoardDrawing {
  svg: string;
  w: number;
  h: number;
}

/** Dessin retouché d'un type, ou null. `w`/`h` = dimensions du viewBox (= repère px). */
export function boardDrawing(type: string): BoardDrawing | null {
  const svg = DRAWINGS[type];
  if (!svg) return null;
  const m = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  return { svg, w: m ? Number(m[1]) : 0, h: m ? Number(m[2]) : 0 };
}
