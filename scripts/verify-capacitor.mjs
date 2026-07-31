// Vérifie la simulation des condensateurs :
//   1. le modèle : rappel interne à 65 kΩ (doc RP2040 : 50-80 kΩ) → RC = 65 ms
//      pour 1 µF, et pont diviseur classique avec une résistance extérieure ;
//   2. l'échantillonnage à l'instant de la CONVERSION (setAnalogSampler) : sans
//      lui, un sketch qui lit l'ADC plus vite que l'affichage relit la même
//      valeur plusieurs fois de suite — l'exponentielle monte en escalier.
// Le moteur AVR est exécuté avec le firmware de démo du Mega, qui appelle
// analogRead(A8) en boucle et publie « a8=… » sur Serial1.
import esbuild from 'esbuild';
import { avrInstruction } from 'avr8js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MEGA_PWM345 } from '../src/webview/programs/mega-pwm345.mjs';
import { PICO_BLINK } from '../src/webview/programs/pico-blink.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const tmp = mkdtempSync(join(tmpdir(), 'kx-condo-'));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function bundle(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const model = await bundle('src/webview/diagram/model.mts', 'model.mjs');
const { AvrEngine } = await bundle('src/webview/engines/avr.mts', 'avr.mjs');
const { PicoEngine } = await bundle('src/webview/engines/pico.mts', 'pico.mjs');

// --- 1. Modèle : constante de temps -----------------------------------------
console.log('Modèle RC :');
{
  const wire = (id, a, ap, b, bp) => ({ id, a: { partId: a, pin: ap }, b: { partId: b, pin: bp }, points: [] });
  // Condensateur 1 µF entre GP15 et la masse, mesuré sur GP26 : la seule source
  // est le rappel interne de GP15 → RC = 65 kΩ × 1 µF.
  const pull = {
    parts: [
      { id: 'mcu1', type: 'pico', x: 0, y: 0 },
      { id: 'c1', type: 'condo-p-2', x: 300, y: 0, attrs: { ctype: 'chem', value: '1e-6', vmax: '16' } },
    ],
    wires: [
      wire('w1', 'c1', '1', 'mcu1', 'GP15'),
      wire('w2', 'c1', '2', 'mcu1', 'GND.5'),
      wire('w3', 'c1', '1', 'mcu1', 'GP26'),
    ],
  };
  const up = model.capacitorNodes(pull, 3.3, (p) => (p === 'GP15' ? 'pullup' : 'hiz'))[0];
  check(`charge par le rappel interne : RC = 65 ms (${(up.tau * 1000).toFixed(1)} ms)`,
    Math.abs(up.tau - 0.065) < 0.001 && Math.abs(up.target - 3.3) < 0.01);
  const down = model.capacitorNodes(pull, 3.3, (p) => (p === 'GP15' ? 'pulldown' : 'hiz'))[0];
  check(`décharge par le même rappel : 0 V, RC = 65 ms (${(down.tau * 1000).toFixed(1)} ms)`,
    Math.abs(down.tau - 0.065) < 0.001 && Math.abs(down.target) < 0.01);
  check('la broche de mesure observe le nœud', up.mcuPins.includes('GP26'), JSON.stringify(up.mcuPins));

  // Résistance extérieure : 10 kΩ + 10 µF = 100 ms, cas de l'exemple Arduino.
  const rc = {
    parts: [
      { id: 'mcu1', type: 'uno', x: 0, y: 0 },
      { id: 'r1', type: 'resistor', x: 200, y: 0, attrs: { value: '10000' } },
      { id: 'c1', type: 'condo-np', x: 300, y: 0, attrs: { ctype: 'np', value: '1e-5', vmax: '400' } },
    ],
    wires: [
      wire('w1', 'r1', '1', 'mcu1', '8'),
      wire('w2', 'r1', '2', 'c1', '1'),
      wire('w3', 'c1', '1', 'mcu1', 'A0'),
      wire('w4', 'c1', '2', 'mcu1', 'GND.1'),
    ],
  };
  const node = model.capacitorNodes(rc, 5, (p) => (p === '8' ? 'high' : 'hiz'))[0];
  check(`10 kΩ + 10 µF : RC = 100 ms (${(node.tau * 1000).toFixed(1)} ms)`,
    Math.abs(node.tau - 0.1) / 0.1 < 0.05 && Math.abs(node.target - 5) < 0.1);
}

// --- 2. Échantillonnage à l'instant de la conversion (AVR) -------------------
console.log('Charge lue par l’ADC (Mega, analogRead en boucle) :');
{
  const VREF = 5;
  const TAU = 0.1; // 10 kΩ × 10 µF, comme le test condo-uno
  const volts = (ms) => VREF * (1 - Math.exp(-ms / 1000 / TAU));

  const engine = new AvrEngine(MEGA_PWM345.slice(), null, 'avr2560');
  let serial = '';
  engine.onSerial = (chunk) => { serial += chunk; };
  const samples = []; // instants (ms simulées) où l'ADC a demandé la tension
  engine.setAnalogSampler('A8', () => {
    const t = engine.simulatedMs();
    samples.push(t);
    return volts(t) / VREF;
  });
  // Exécution directe (la boucle du moteur est cadencée sur le temps réel) :
  // ~1,2 s simulée à 16 MHz, soit une charge complète (12 RC).
  const cpu = engine.cpu;
  const until = 16_000_000 * 1.2;
  while (cpu.cycles < until) {
    avrInstruction(cpu);
    cpu.tick();
  }
  const lus = [...serial.matchAll(/a8=(\d+)/g)].map((m) => Number(m[1]));
  check(`l'ADC a demandé la tension ${samples.length} fois`, samples.length >= 10);
  check(`le sketch a lu ${lus.length} valeurs`, lus.length >= 10);
  // Continuité : aucune valeur répétée (l'escalier venait de là), et progression
  // monotone jusqu'au palier de 1023.
  const plateaux = lus.filter((v, i) => i > 0 && v === lus[i - 1] && v < 1000).length;
  check(`aucun palier avant la charge pleine (${plateaux})`, plateaux === 0, lus.slice(0, 12).join(' '));
  check('montée strictement croissante', lus.every((v, i) => i === 0 || v >= lus[i - 1]), lus.slice(0, 12).join(' '));
  // Chaque valeur lue doit tomber sur l'exponentielle à l'instant de SA
  // conversion : c'est la définition d'une courbe continue.
  let ecartMax = 0;
  for (let i = 0; i < lus.length && i < samples.length; i++) {
    const attendu = Math.round((volts(samples[i]) / VREF) * 1023);
    ecartMax = Math.max(ecartMax, Math.abs(lus[i] - attendu));
  }
  check(`valeurs sur l'exponentielle (écart max ${ecartMax} LSB)`, ecartMax <= 2);
}

// --- 3. Le même point d'entrée côté RP2040 ----------------------------------
console.log('Échantillonneur RP2040 :');
{
  const engine = new PicoEngine({ kind: 'ram', image: PICO_BLINK.slice() });
  engine.setAnalogSampler('GP26', () => 0.25);
  engine.mcu.adc.onADCRead(0); // conversion demandée par le programme simulé
  check(`canal 0 relu à la conversion (${engine.mcu.adc.channelValues[0]}/4095)`,
    Math.abs(engine.mcu.adc.channelValues[0] - 1024) <= 1);
  engine.setAnalogSampler('GP26', null);
  engine.mcu.adc.channelValues[0] = 0;
  engine.mcu.adc.onADCRead(0);
  check('échantillonneur retiré : la valeur posée par setAnalog est conservée',
    engine.mcu.adc.channelValues[0] === 0);
  engine.dispose();
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
