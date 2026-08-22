// Test de bout en bout de la carte microSD en simulation MicroPython RÉELLE :
// charge le firmware, injecte le pilote `sdcard.py` de testkablix/lib/, exécute
// le VRAI programme testkablix/microsd-pico.py et vérifie que la carte se monte
// (os.mount → FatFs), qu'un fichier s'écrit et se relit.
// C'est le pendant Pico du sketch Arduino microsd-uno.ino : le banc unitaire
// (verify-sdcard.mjs) parle le protocole à la main, celui-ci fait tourner le
// vrai FatFs de MicroPython par-dessus le périphérique simulé.
// Nécessite RPI_PICO-*.uf2 (test-assets/ ou cache VS Code) (test sauté sinon).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';
import { firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fw = firmwarePico();
if (!fw) {
  console.log('SKIP : firmware MicroPython absent (RPI_PICO-*.uf2 (test-assets/ ou cache VS Code)).');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-sde2e-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['vscode'],
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const { SdCardSpiDevice } = await load('src/webview/engines/i2c-devices.mts', 'devices.mjs');

// Le VRAI programme de test, tel que Frank l'ouvre : ses `import` se résolvent
// dans testkablix/lib/ (le Pico simulé n'a pas de système de fichiers).
const sketchPath = tk('microsd-pico.py');
const sketchSrc = readFileSync(sketchPath, 'utf8');

const program = loadPythonProgram(fw, sketchSrc, false, sketchPath);
console.log(program.log);
if (!/sdcard/.test(program.log)) {
  console.error("  ✗ le pilote sdcard.py n'a pas été injecté avec le programme.");
  console.log('\nRESULTAT: ECHEC');
  process.exit(1);
}

const engine = new PicoEngine({
  kind: 'flash',
  segments: program.payload.segments.map((s) => ({
    addr: s.addr,
    data: new Uint8Array(Buffer.from(s.b64, 'base64')),
  })),
  script: program.payload.script,
});

// Carte SD sur SPI0, CS sur GP17 — le câblage de testkablix/microsd-pico.projix.
const carte = new SdCardSpiDevice();
carte.csPin = 'GP17';
engine.setSpiDevices([carte]);

let serial = '';
engine.onSerial = (chunk) => {
  serial += chunk;
  process.stdout.write(chunk);
};

console.log('Démarrage de MicroPython (max 180 s)…');
const started = Date.now();
engine.start();

const timer = setInterval(() => {
  const elapsed = (Date.now() - started) / 1000;
  const echec = /ECHEC|Traceback|Error/.test(serial);
  const ok =
    serial.includes('Carte SD detectee : init OK') &&
    serial.includes('Ecriture de essai.txt : OK') &&
    serial.includes('Bonjour depuis Kablix !') &&
    serial.includes('--- fin ---');
  if (echec || ok || elapsed > 180) {
    clearInterval(timer);
    engine.dispose();
    if (echec) {
      console.error('\n  ✗ le programme signale une erreur.');
      console.log('\nRESULTAT: ECHEC');
      process.exit(1);
    }
    if (ok) {
      console.log(`\n  ✓ carte montée, fichier écrit puis relu (${elapsed.toFixed(1)} s)`);
      console.log('\nRESULTAT: OK');
      process.exit(0);
    }
    console.error(`\n  ✗ délai dépassé. Série : ${JSON.stringify(serial.slice(-500))}`);
    console.log('\nRESULTAT: ECHEC');
    process.exit(1);
  }
}, 500);
