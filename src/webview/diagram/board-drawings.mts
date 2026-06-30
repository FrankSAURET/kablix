// Dessins de composants retouchés à la main (« svg retouche/<type>.edit.svg »,
// nettoyés par scripts/_clean-board-svg.mjs → src/webview/elements/boards/<type>.svg).
// Quand un type a un dessin ici, l'éditeur l'affiche À LA PLACE du rendu @wokwi :
// le repère du dessin (viewBox) = celui des surcharges de broches (pin-overrides),
// donc les pastilles tombent pile sur le dessin. L'élément @wokwi reste présent
// (caché) pour `pinInfo` et la simulation.
import megaSvg from '../elements/boards/mega.svg';
import unoSvg from '../elements/boards/uno.svg';
import nanoSvg from '../elements/boards/nano.svg';
import hcsr04Svg from '../elements/boards/hcsr04.svg';
import dht22Svg from '../elements/boards/dht22.svg';
import ntcTempSvg from '../elements/boards/ntc-temp.svg';
import gasSensorSvg from '../elements/boards/gas-sensor.svg';
import photoresistorSvg from '../elements/boards/photoresistor.svg';
import pirSvg from '../elements/boards/pir.svg';
import soundSvg from '../elements/boards/sound.svg';
import tiltSvg from '../elements/boards/tilt.svg';
import heartbeatSvg from '../elements/boards/heartbeat.svg';
import microsdSvg from '../elements/boards/microsd.svg';
import ledSvg from '../elements/boards/led.svg';
import buzzerSvg from '../elements/boards/buzzer.svg';
import sevenSegSvg from '../elements/boards/7seg.svg';
import rgbLedSvg from '../elements/boards/rgb-led.svg';

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
  '7seg': sevenSegSvg, // 1 chiffre uniquement (cf. drawingKey)
  'rgb-led': rgbLedSvg,
};

/**
 * Clé de dessin pour un type + ses attributs (variantes). Le 7 segments a un
 * dessin propre par nombre de chiffres ; seul le 1 chiffre est fourni → les
 * variantes 2/4 chiffres retombent sur le rendu @wokwi (clé absente de DRAWINGS).
 */
function drawingKey(type: string, attrs?: Record<string, string>): string {
  if (type === '7seg') {
    const d = attrs?.digits ?? '1';
    return d === '1' ? '7seg' : `7seg-${d}dig`;
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
