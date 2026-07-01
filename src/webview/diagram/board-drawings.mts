// Dessins de composants retouchés à la main (« svg retouche/<type>.edit.svg »,
// nettoyés par scripts/_clean-board-svg.mjs → src/webview/composants/externe/<type>.svg).
// Quand un type a un dessin ici, l'éditeur l'affiche À LA PLACE du rendu @wokwi :
// le repère du dessin (viewBox) = celui des surcharges de broches (pin-overrides),
// donc les pastilles tombent pile sur le dessin. L'élément @wokwi reste présent
// (caché) pour `pinInfo` et la simulation.
import megaSvg from '../composants/externe/mega.svg';
import unoSvg from '../composants/externe/uno.svg';
import nanoSvg from '../composants/externe/nano.svg';
import hcsr04Svg from '../composants/externe/hcsr04.svg';
import dht22Svg from '../composants/externe/dht22.svg';
import ntcTempSvg from '../composants/externe/ntc-temp.svg';
import gasSensorSvg from '../composants/externe/gas-sensor.svg';
import photoresistorSvg from '../composants/externe/photoresistor.svg';
import pirSvg from '../composants/externe/pir.svg';
import soundSvg from '../composants/externe/sound.svg';
import tiltSvg from '../composants/externe/tilt.svg';
import heartbeatSvg from '../composants/externe/heartbeat.svg';
import microsdSvg from '../composants/externe/microsd.svg';
import ledSvg from '../composants/externe/led.svg';
import buzzerSvg from '../composants/externe/buzzer.svg';
import sevenSegSvg from '../composants/externe/7seg.svg';
import rgbLedSvg from '../composants/externe/rgb-led.svg';
import ledBarSvg from '../composants/externe/led-bar.svg';
import servoSvg from '../composants/externe/servo.svg';
import resistorSvg from '../composants/externe/resistor.svg';
import sevenSeg2Svg from '../composants/externe/7seg-2dig.svg';
import sevenSeg4Svg from '../composants/externe/7seg-4dig.svg';
import neopixelSvg from '../composants/externe/neopixel.svg';
import neopixelMatrixSvg from '../composants/externe/neopixel-matrix.svg';
import ledRingSvg from '../composants/externe/led-ring.svg';
import oledSvg from '../composants/externe/oled-ssd1306.svg';
import ili9341Svg from '../composants/externe/ili9341.svg';
import lcdSvg from '../composants/externe/lcd.svg';
import lcdParallel20x4Svg from '../composants/externe/lcd-parallel-20x4.svg';
import lcdI2cSvg from '../composants/externe/lcd-i2c.svg';
import lcdI2c20x4Svg from '../composants/externe/lcd-i2c-20x4.svg';

const DRAWINGS: Record<string, string> = {
  mega: megaSvg,
  uno: unoSvg,
  nano: nanoSvg,
  hcsr04: hcsr04Svg,
  dht22: dht22Svg,
  'ntc-temp': ntcTempSvg,
  'gas-sensor': gasSensorSvg,
  photoresistor: photoresistorSvg,
  pir: pirSvg,
  sound: soundSvg,
  tilt: tiltSvg,
  heartbeat: heartbeatSvg,
  microsd: microsdSvg,
  led: ledSvg,
  buzzer: buzzerSvg,
  '7seg': sevenSegSvg, // 1 chiffre (cf. drawingKey ; 2/4 chiffres ci-dessous)
  '7seg-2dig': sevenSeg2Svg,
  '7seg-4dig': sevenSeg4Svg,
  'rgb-led': rgbLedSvg,
  'led-bar': ledBarSvg,
  servo: servoSvg,
  resistor: resistorSvg,
  neopixel: neopixelSvg,
  'neopixel-matrix': neopixelMatrixSvg,
  'led-ring': ledRingSvg,
  'oled-ssd1306': oledSvg,
  ili9341: ili9341Svg,
  lcd: lcdSvg, // parallèle 16×2 (cf. drawingKey ; variantes ci-dessous)
  'lcd-parallel-20x4': lcdParallel20x4Svg,
  'lcd-i2c': lcdI2cSvg,
  'lcd-i2c-20x4': lcdI2c20x4Svg,
};

/**
 * Clé de dessin pour un type + ses attributs (variantes). Le 7 segments a un
 * dessin propre par nombre de chiffres (1/2/4) ; clé `7seg`, `7seg-2dig`,
 * `7seg-4dig`. Le LCD texte a 4 variantes selon interface (i2c/parallèle) et
 * taille (16×2 / 20×4) : `lcd`, `lcd-parallel-20x4`, `lcd-i2c`, `lcd-i2c-20x4`.
 */
function drawingKey(type: string, attrs?: Record<string, string>): string {
  if (type === '7seg') {
    const d = attrs?.digits ?? '1';
    return d === '1' ? '7seg' : `7seg-${d}dig`;
  }
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
