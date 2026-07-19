// Test de bout en bout du PCA9685 Grove en simulation MicroPython réelle :
// charge le firmware, injecte la lib grove_16_channels_pwm + un sketch qui
// interroge la carte à 0x7F (readfrom_mem MODE1), branche le Pca9685Device à
// 0x7F et vérifie qu'AUCUN RuntimeError « PCA9685 non trouvé » n'est levé et
// qu'un canal reçoit bien un rapport cyclique (servo 90°).
// Régression du bug de Frank : la carte Grove 108020102 est à 0x7F, pas 0x40.
// Nécessite test-assets/RPI_PICO-20230426-v1.20.0.uf2 (test sauté sinon).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fw = join(root, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (!existsSync(fw)) {
  console.log('SKIP : firmware MicroPython absent (test-assets/RPI_PICO-20230426-v1.20.0.uf2).');
  process.exit(0);
}
const lib = join(root, 'testkablix', 'grove_16_channels_pwm.py');
if (!existsSync(lib)) {
  console.log('SKIP : lib grove_16_channels_pwm.py absente de testkablix/.');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-pcae2e-'));
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
const { Pca9685Device } = await load('src/webview/engines/i2c-devices.mts', 'devices.mjs');

// Sketch minimal posé À CÔTÉ de la lib (pour que l'import se résolve). Interroge
// la carte à 0x7F puis met le canal 8 (port P9) à 90° et coupe.
const sketchSrc = [
  'from machine import I2C, Pin',
  'from grove_16_channels_pwm import Grove16PWM',
  'import time',
  'i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=100_000)',
  'pwm = Grove16PWM(i2c)   # adresse 0x7F par defaut',
  "print('PCA_PRETE', pwm.address)",
  'pwm.servo_angle(8, 90)',
  "print('PCA_SERVO_OK')",
  'time.sleep(1)',
  'pwm.all_off()',
  '',
].join('\n');
const sketchPath = join(root, 'testkablix', '_pca_e2e_tmp.py');
writeFileSync(sketchPath, sketchSrc, 'utf8');

const program = loadPythonProgram(fw, sketchSrc, false, sketchPath);
const engine = new PicoEngine({
  kind: 'flash',
  segments: program.payload.segments.map((s) => ({
    addr: s.addr,
    data: new Uint8Array(Buffer.from(s.b64, 'base64')),
  })),
  script: program.payload.script,
});

// La carte Grove est à 0x7F (correctif). Sans alim servo simulée ici, la
// DÉTECTION I²C doit malgré tout réussir (VCC logique séparé), comme la vraie
// carte : c'est exactement ce que teste ce banc.
engine.setI2cDevices([new Pca9685Device(0x7f)]);

let serial = '';
engine.onSerial = (chunk) => {
  serial += chunk;
  process.stdout.write(chunk);
};

console.log('Démarrage de MicroPython (max 120 s)…');
const started = Date.now();
engine.start();

const timer = setInterval(() => {
  const elapsed = (Date.now() - started) / 1000;
  const runtimeErr = /PCA9685 non trouv|RuntimeError/.test(serial);
  const ok = serial.includes('PCA_SERVO_OK') && serial.includes('PCA_PRETE');
  if (runtimeErr || ok || elapsed > 120) {
    clearInterval(timer);
    engine.dispose();
    try { unlinkSync(sketchPath); } catch {}
    if (runtimeErr) {
      console.error('\n  ✗ RuntimeError : la carte n\'est pas détectée à 0x7F.');
      console.log('\nRESULTAT: ECHEC');
      process.exit(1);
    }
    if (ok) {
      console.log(`\n  ✓ carte détectée à 0x7F et servo piloté (${elapsed.toFixed(1)} s)`);
      console.log('\nRESULTAT: OK');
      process.exit(0);
    }
    console.error(`\n  ✗ délai dépassé. Série : ${JSON.stringify(serial.slice(-400))}`);
    console.log('\nRESULTAT: ECHEC');
    process.exit(1);
  }
}, 500);
