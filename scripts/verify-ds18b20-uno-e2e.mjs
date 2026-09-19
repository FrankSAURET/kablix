// Test de bout en bout du DS18B20 côté ARDUINO : le VRAI sketch compilé, avec
// les VRAIES bibliothèques OneWire et DallasTemperature, joué contre `avr.mts`.
//
// POURQUOI CE BANC EXISTE. Les trois autres bancs DS18B20 étaient verts pendant
// que Frank lisait « capteurs trouves : 0 » à l'écran. Chacun a son angle mort :
//   - `verify-ds18b20.mjs` éprouve l'automate de protocole tout seul ;
//   - `verify-ds18b20-moteur.mjs` éprouve son branchement au moteur AVR, mais en
//     JOUANT LE MAÎTRE À LA MAIN (il écrit DDRD/PORTD lui-même). Ses créneaux
//     sont donc ceux qu'on a bien voulu écrire, pas ceux de `OneWire.cpp` ;
//   - `verify-ds18b20-e2e.mjs` fait tourner le vrai code utilisateur, mais en
//     MicroPython, sur Pico seulement.
// Aucun ne fait passer `DallasTemperature::begin()` sur un ATmega. C'est
// exactement ce que Frank exécute, et c'est là que le compte tombait à zéro.
//
// LE TEST ÉTAIT RÉPUTÉ IMPOSSIBLE — IL NE L'EST PAS. La v2026.9.4.112 a conclu
// qu'on ne pouvait pas l'écrire, Kablix ne livrant aucune bibliothèque OneWire.
// Vérification faite : l'`arduino-cli` de la machine résout les bibliothèques
// installées par l'utilisateur tout seul, et `testkablix/.build/` contient bien
// `ds18b20-uno.ino.hex` avec `OneWire.cpp.o` et `DallasTemperature.cpp.o` liés.
// Ce banc consomme ce .hex s'il est là, et se met en SKIP sinon — il ne compile
// rien lui-même et n'impose donc aucune bibliothèque à qui lance `verify:all`.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-ds18-uno-'));
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

/** Le .hex produit par l'`arduino-cli` de la machine, s'il a déjà tourné. */
const HEX = join(root, 'testkablix', '.build', 'ds18b20-uno.ino.hex');
if (!existsSync(HEX)) {
  console.log(`SKIP : ${HEX} absent.`);
  console.log('  Ouvrir testkablix/Arduino/ds18b20-uno/ds18b20-uno.projix et lancer la');
  console.log('  compilation une fois (OneWire + DallasTemperature installées) suffit.');
  console.log('RESULTAT: OK (ignoré)');
  process.exit(0);
}

const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');
const { loadArtifact } = await load('src/compiler.ts', 'compiler.mjs');

/** Les deux capteurs du schéma `ds18b20-uno.projix`, tous deux sur D2. */
const PIN = '2';
const CAPTEURS = [
  { id: 'Capt1', pin: PIN, temperatureC: 23.5 },
  { id: 'Capt2', pin: PIN, temperatureC: -10.0 },
];
/** Deux demi-degrés pile : codés exactement en 12 bits, aucune tolérance. */
const ATTENDUES = ['23.50', '-10.00'];

const artefact = loadArtifact(HEX);
const program = Uint16Array.from(artefact.payload.bytes);
const engine = new AvrEngine(program, null, 'avr328');
engine.setDs18b20(CAPTEURS);

let serial = '';
engine.onSerial = (chunk) => {
  serial += chunk;
  process.stdout.write(chunk);
};

console.log(`--- Arduino Uno / deux DS18B20 sur D${PIN} (sketch compilé réel)\n`);
const started = Date.now();
engine.start();

/** Deux tours de `loop()` : 750 ms de conversion + 1 s d'attente chacun. */
const ASSEZ = () => (serial.match(/T1 = /g) ?? []).length >= 2;

await new Promise((resolve) => {
  const timer = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    if (!ASSEZ() && elapsed <= 180) return;
    clearInterval(timer);
    engine.stop();
    resolve();
  }, 500);
});

const elapsed = (Date.now() - started) / 1000;
const trouves = /capteurs trouves : (\d+)/.exec(serial)?.[1];
const controles = [
  ['la découverte 1-Wire compte DEUX capteurs', trouves === '2', `compté : ${trouves ?? 'rien'}`],
  [`le capteur 0 lit ${ATTENDUES[0]} °C`, serial.includes(`T0 = ${ATTENDUES[0]} C`)],
  [`le capteur 1 lit ${ATTENDUES[1]} °C`, serial.includes(`T1 = ${ATTENDUES[1]} C`)],
  ['aucune lecture ratée', !serial.includes('lecture ratee')],
  ['deux tours de loop() au moins', ASSEZ()],
];

console.log(`\n  --- ${elapsed.toFixed(1)} s ---`);
let echecs = 0;
for (const [nom, bon, detail] of controles) {
  console.log(`  ${bon ? '✅' : '❌'} ${nom}${bon || !detail ? '' : ` — ${detail}`}`);
  if (!bon) echecs++;
}
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs} contrôle(s))` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
