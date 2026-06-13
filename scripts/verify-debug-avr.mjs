// Vérifie l'extraction des infos de débogage AVR (src/compiler.ts) et le mode
// pas à pas / points d'arrêt / variables du moteur avr8js (avr.mts). Le test
// est sauté proprement si aucune toolchain AVR n'est installée localement.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-vd-'));

// Transpile les modules TypeScript de l'extension pour pouvoir les importer ici.
const build = async (entry, name) => {
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
};

const { compile, detectToolchain } = await build('src/compiler.ts', 'compiler.mjs');
const { AvrEngine } = await build('src/webview/engines/avr.mts', 'avr.mjs');

// Sans toolchain dans le PATH, tente celle installée par l'IDE Arduino
// (dossier data d'Arduino15) en l'ajoutant au PATH du processus.
let tools = detectToolchain();
if (!tools.arduinoCli && !tools.avrGcc) {
  const dataDirs = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Arduino15'),
    process.env.HOME && join(process.env.HOME, '.arduino15'),
    process.env.HOME && join(process.env.HOME, 'Library', 'Arduino15'),
  ].filter(Boolean);
  for (const dataDir of dataDirs) {
    const gccRoot = join(dataDir, 'packages', 'arduino', 'tools', 'avr-gcc');
    if (!existsSync(gccRoot)) continue;
    for (const version of readdirSync(gccRoot)) {
      const bin = join(gccRoot, version, 'bin');
      if (existsSync(join(bin, 'avr-gcc.exe')) || existsSync(join(bin, 'avr-gcc'))) {
        process.env.PATH = bin + delimiter + process.env.PATH;
      }
    }
  }
  tools = detectToolchain();
}

if (!tools.arduinoCli && !tools.avrGcc) {
  console.log('toolchain absente, test sauté');
  process.exit(0);
}

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
};

// Programme de test : 2 globales et une boucle qui les modifie. Deux variantes
// selon la toolchain retenue par compile() (arduino-cli prioritaire).
let srcPath;
let loopLine; // ligne du « compteur++ » (cible du point d'arrêt)
if (tools.arduinoCli) {
  const sketchDir = join(tmp, 'KxDbg');
  mkdirSync(sketchDir);
  srcPath = join(sketchDir, 'KxDbg.ino');
  writeFileSync(srcPath, [
    'int compteur;', // ligne 1
    'float seuil = 3.14;', // ligne 2
    'void setup() { pinMode(13, OUTPUT); }',
    'void loop() {',
    '  digitalWrite(13, !digitalRead(13));',
    '  compteur++;', // ligne 6
    '  seuil += 0.5;',
    '  delay(5);',
    '}',
  ].join('\n'));
  loopLine = 6;
} else {
  srcPath = join(tmp, 'prog.c');
  writeFileSync(srcPath, [
    '#include <avr/io.h>', // ligne 1
    '#include <util/delay.h>',
    'int compteur;',
    'float seuil = 3.14f;',
    'int main(void) {',
    '  DDRB |= (1 << 5);',
    '  for (;;) {',
    '    PORTB ^= (1 << 5);',
    '    compteur++;', // ligne 9
    '    seuil += 0.5f;',
    '    _delay_ms(5);',
    '  }',
    '}',
  ].join('\n'));
  loopLine = 9;
}

console.log(`Compilation de ${srcPath} (Arduino Uno, infos de débogage) :`);
const res = compile('uno', srcPath, root);
const p = res.payload;
check(`format avr-progmem, ${p.bytes.length} mots`, p.format === 'avr-progmem' && p.bytes.length > 0);
check('payload.debug présent', !!p.debug);
const debug = p.debug ?? { lines: [], globals: [] };
check(`table des lignes non vide (${debug.lines.length} entrées)`, debug.lines.length > 0);

const compteur = debug.globals.find((g) => g.name === 'compteur');
const seuil = debug.globals.find((g) => g.name === 'seuil');
check(`globale compteur (int, 2 octets, SRAM) : ${JSON.stringify(compteur)}`,
  !!compteur && compteur.size === 2 && compteur.addr >= 0x100);
check(`globale seuil (float, 4 octets, SRAM) : ${JSON.stringify(seuil)}`,
  !!seuil && seuil.size === 4 && seuil.addr >= 0x100 && (seuil.type ?? '').includes('float'));

// --- Pas à pas dans le moteur ------------------------------------------------
console.log('Pas à pas et variables (AvrEngine) :');
const engine = new AvrEngine(Uint16Array.from(p.bytes), debug);
const states = [];
engine.onDebugPause = (s) => states.push(s);

engine.pause(); // démarre en pause (PC encore dans crt0, ligne indéfinie)
for (let i = 0; i < 14; i++) engine.step();

const visited = [...new Set(states.map((s) => s.line).filter((l) => l !== undefined))];
check(`le pas à pas visite plusieurs lignes (${visited.join(', ')})`, visited.length >= 2);

const last = states[states.length - 1];
const lastCompteur = last.variables.find((v) => v.name === 'compteur');
const lastSeuil = last.variables.find((v) => v.name === 'seuil');
check(`compteur incrémenté (${lastCompteur?.value})`, !!lastCompteur && parseInt(lastCompteur.value, 10) >= 1);
check(`seuil flottant > 3 (${lastSeuil?.value})`, !!lastSeuil && parseFloat(lastSeuil.value) > 3);

// --- Point d'arrêt dans la boucle 60 fps --------------------------------------
console.log('Point d\'arrêt (boucle d\'exécution) :');
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => {};

engine.setBreakpoints([loopLine]);
engine.resume();
engine.start();
for (let i = 0; i < 240 && !engine.paused; i++) rafCb?.();
engine.stop();

const bpState = states[states.length - 1];
check(`arrêt sur la ligne ${loopLine} (ligne ${bpState?.line})`, engine.paused && bpState?.line === loopLine);

// Reprise : on doit pouvoir repartir et retomber sur le même point d'arrêt.
engine.resume();
engine.start();
for (let i = 0; i < 240 && !engine.paused; i++) rafCb?.();
engine.stop();
check('le point d\'arrêt re-déclenche après resume()', engine.paused && states[states.length - 1]?.line === loopLine);

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
