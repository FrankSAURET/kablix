// Dessins de composants retouchés à la main (« svg retouche/<type>.edit.svg »,
// nettoyés par scripts/_clean-board-svg.mjs → src/webview/composants/externe/<type>.svg).
// Quand un type a un dessin ici, l'éditeur l'affiche À LA PLACE du rendu Lit :
// le repère du dessin (viewBox) = celui des surcharges de broches (pin-overrides),
// donc les pastilles tombent pile sur le dessin. L'élément Lit reste présent
// (caché) pour `pinInfo` et la simulation.
import oledSvg from '../composants/externe/oled-ssd1306.svg';
import lcdSvg from '../composants/externe/lcd.svg';
import lcdParallel20x4Svg from '../composants/externe/lcd-parallel-20x4.svg';
import lcdI2cSvg from '../composants/externe/lcd-i2c.svg';
import lcdI2c20x4Svg from '../composants/externe/lcd-i2c-20x4.svg';
import buttonSvg from '../composants/externe/button.svg';
import button6mmSvg from '../composants/externe/button-6mm.svg';
import dipSwitchSvg from '../composants/externe/dip-switch.svg';
import joystickSvg from '../composants/externe/joystick.svg';

const DRAWINGS: Record<string, string> = {
  'oled-ssd1306': oledSvg,
  lcd: lcdSvg, // parallèle 16×2 (cf. drawingKey ; variantes ci-dessous)
  'lcd-parallel-20x4': lcdParallel20x4Svg,
  'lcd-i2c': lcdI2cSvg,
  'lcd-i2c-20x4': lcdI2c20x4Svg,
  // Composants INTERACTIFS : le dessin est affiché, l'élément Lit reste
  // par-dessus (transparent, calé sur les broches) pour capter les clics.
  button: buttonSvg,
  'button-6mm': button6mmSvg,
  'dip-switch': dipSwitchSvg,
  joystick: joystickSvg,
};

/**
 * Clé de dessin pour un type + ses attributs (variantes). Le LCD texte a 4
 * variantes selon interface (i2c/parallèle) et taille (16×2 / 20×4) : `lcd`,
 * `lcd-parallel-20x4`, `lcd-i2c`, `lcd-i2c-20x4`.
 */
function drawingKey(type: string, attrs?: Record<string, string>): string {
  if (type === 'lcd') {
    const parallel = (attrs?.pins ?? 'i2c') === 'full';
    const big = (attrs?.lcdSize ?? '16x2') === '20x4';
    if (parallel) return big ? 'lcd-parallel-20x4' : 'lcd';
    return big ? 'lcd-i2c-20x4' : 'lcd-i2c';
  }
  return type;
}

export interface BoardDrawing {
  svg: string;
  w: number;
  h: number;
}

/** Dessin retouché d'un type (+ variantes par attribut), ou null. `w`/`h` =
 * dimensions du viewBox (= repère px des surcharges). */
export function boardDrawing(type: string, attrs?: Record<string, string>): BoardDrawing | null {
  const svg = DRAWINGS[drawingKey(type, attrs)];
  if (!svg) return null;
  const m = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  return { svg, w: m ? Number(m[1]) : 0, h: m ? Number(m[2]) : 0 };
}
