// Diagnostic ultrason (`node scripts/_diag-ultrason.mjs`) : compare la largeur
// ECHO POSÉE par le moteur (temps simulé) à celle MESURÉE par time_pulse_us
// dans le vrai firmware, et affiche l'échéance prévue de chaque front avec son
// retard. C'est ce qui a montré, en v2026.8.102.13, que le front montant
// partait avec jusqu'à 740 µs de retard pendant que le descendant tombait pile.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { firmwarePico } from './_firmware.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diagus-'));
const load = async (rel, name) => {
  const out = join(tmp, name);
  await esbuild({ entryPoints: [join(ROOT, rel)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  return import(pathToFileURL(out).href);
};
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const segments = parseUf2(new Uint8Array(readFileSync(firmwarePico()))).map((s) => ({ addr: s.addr, data: s.data }));

const script = [
  'from machine import Pin, time_pulse_us',
  'import time',
  'trig = Pin(15, Pin.OUT)',
  'echo = Pin(14, Pin.IN)',
  'def mesure():',
  '    trig.value(0)',
  '    time.sleep_us(5)',
  '    trig.value(1)',
  '    time.sleep_us(10)',
  '    trig.value(0)',
  '    a = time.ticks_us()',
  '    d = time_pulse_us(echo, 1, 30000)',
  '    b = time.ticks_us()',
  '    return (d, time.ticks_diff(b, a))',
  "print('US1', mesure())",
  'time.sleep_ms(300)',
  "print('US2', mesure())",
  '',
].join('\n');

const sensor = { trig: 'GP15', echo: 'GP14', distanceCm: 100, temperatureC: 20 };
const engine = new PicoEngine({ kind: 'flash', segments, script });
engine.setUltrasonic([sensor]);

// Espionne les fronts posés sur ECHO, en temps SIMULÉ.
const orig = engine.setInput.bind(engine);
let riseNs = 0;
engine.setInput = (name, value) => {
  if (name === 'GP14') {
    const ns = engine.sim.clock.nanos;
    const prev = engine.scheduled.map((a) => (a.nanos / 1000).toFixed(1) + (a.value ? '^' : 'v')).join(' ');
    console.log('    [prevu]', prev, '| T =', sensor.temperatureC, '| retard =', ((ns - engine.scheduled.find((a) => a.value === value)?.nanos) / 1000).toFixed(1), 'us');
    if (value) { riseNs = ns; console.log('  MONTANT  à', (ns / 1000).toFixed(1), 'µs'); }
    else console.log('  DESCEND  à', (ns / 1000).toFixed(1), 'µs — largeur posée =', ((ns - riseNs) / 1000).toFixed(1), 'µs');
  }
  return orig(name, value);
};

let serial = '';
let cooled = false;
engine.onSerial = (c) => {
  serial += c;
  if (!cooled && /US1 /.test(serial)) { cooled = true; sensor.temperatureC = -20; console.log('  >> air refroidi à -20 (attendu 6266 µs)'); }
};
engine.start();
const t0 = Date.now();
const timer = setInterval(() => {
  if (/US2 /.test(serial) || Date.now() - t0 > 120000) {
    clearInterval(timer);
    engine.dispose();
    console.log('SERIE', JSON.stringify(serial));
    process.exit(0);
  }
}, 250);
