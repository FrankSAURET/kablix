// Test de bout en bout du mode MicroPython : charge le firmware UF2 réel dans
// le moteur PicoEngine (bootrom B1 + flash + USB-CDC), injecte un script via le
// raw REPL et vérifie la sortie série ainsi que le clignotement de GP25.
// Nécessite test-assets/RPI_PICO-20230426-v1.20.0.uf2 (test sauté sinon).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fw = join(root, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (!existsSync(fw)) {
  console.log('SKIP : firmware MicroPython absent (test-assets/RPI_PICO-20230426-v1.20.0.uf2).');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-mpy-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({
  addr: s.addr,
  data: s.data,
}));

const script = [
  'from machine import Pin',
  'led = Pin(25, Pin.OUT)',
  'for i in range(6):',
  '    led.toggle()',
  "print('KABLIX_MPY_OK', 6 * 7)",
  '',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script });

let serial = '';
let ledChanges = 0;
let lastLed = false;
engine.onSerial = (chunk) => {
  serial += chunk;
  process.stdout.write(chunk);
};
engine.onUpdate = () => {
  const led = engine.readDigital('GP25');
  if (led !== lastLed) {
    ledChanges++;
    lastLed = led;
  }
};

console.log('Démarrage de MicroPython dans le simulateur (max 120 s)…');
const started = Date.now();
engine.start();

const timer = setInterval(() => {
  const elapsed = (Date.now() - started) / 1000;
  if (serial.includes('KABLIX_MPY_OK 42')) {
    clearInterval(timer);
    engine.dispose();
    console.log(`\n  ✓ script exécuté via raw REPL en ${elapsed.toFixed(1)} s`);
    console.log(`  ${ledChanges >= 4 ? '✓' : '✗'} LED GP25 a basculé (${ledChanges} changements)`);
    console.log(ledChanges >= 4 ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
    process.exit(ledChanges >= 4 ? 0 : 1);
  }
  if (elapsed > 120) {
    clearInterval(timer);
    engine.dispose();
    console.error(`\n  ✗ délai dépassé. Sortie série reçue : ${JSON.stringify(serial.slice(-400))}`);
    console.log('\nRESULTAT: ECHEC');
    process.exit(1);
  }
}, 500);
