// Test de bout en bout du mode MicroPython : charge le firmware UF2 réel dans
// le moteur PicoEngine (bootrom B1 + flash + USB-CDC), injecte un script via le
// raw REPL et vérifie la sortie série ainsi que le clignotement de GP25.
// Nécessite RPI_PICO-*.uf2 (test-assets/ ou cache VS Code) (test sauté sinon).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fw = firmwarePico();
if (!fw) {
  console.log('SKIP : firmware MicroPython absent (RPI_PICO-*.uf2 (test-assets/ ou cache VS Code)).');
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

// `onRunning` : le script de l'utilisateur entre VRAIMENT en exécution. C'est le
// signal qui remplace « Démarrage MicroPython… » par « En marche » dans la barre
// d'état (sans lui, le message de démarrage restait affiché toute la simulation).
let runningCount = 0;
let serialAtRunning = null;
engine.onRunning = () => {
  runningCount++;
  if (serialAtRunning === null) serialAtRunning = serial;
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
    const controles = [
      ['LED GP25 a basculé (' + ledChanges + ' changements)', ledChanges >= 4],
      ['onRunning signalé une seule fois (' + runningCount + ')', runningCount === 1],
      ['onRunning arrive AVANT la sortie du script (fin du « Démarrage… »)',
        serialAtRunning !== null && !serialAtRunning.includes('KABLIX_MPY_OK')],
    ];
    for (const [nom, bon] of controles) console.log(`  ${bon ? '✓' : '✗'} ${nom}`);
    const bon = controles.every(([, c]) => c);
    console.log(bon ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
    process.exit(bon ? 0 : 1);
  }
  if (elapsed > 120) {
    clearInterval(timer);
    engine.dispose();
    console.error(`\n  ✗ délai dépassé. Sortie série reçue : ${JSON.stringify(serial.slice(-400))}`);
    console.log('\nRESULTAT: ECHEC');
    process.exit(1);
  }
}, 500);
