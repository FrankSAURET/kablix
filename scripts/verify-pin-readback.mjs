// `Pin.value()` doit relire ce que la broche PILOTE elle-même.
//
// Retour de Frank : « blink-pico n'affiche jamais "LED on", toujours off, parce
// que led.value ne passe jamais à 1 ». Le sketch est pourtant le plus banal qui
// soit — `Pin(25, Pin.OUT)`, `toggle()`, puis `value()` pour imprimer l'état.
//
// Cause : `Pin.value()` de MicroPython lit SIO.GPIO_IN (le niveau vu sur la
// PATTE), jamais le registre de sortie. Sur silicium, le tampon d'entrée est
// branché sur le pad : une broche en sortie se relit à son propre niveau.
// rp2040js, lui, ne remplit `rawInputValue` que depuis l'extérieur — une broche
// que rien ne pilote du dehors relit 0 pour toujours. La LED clignotait donc
// vraiment (GP25 bascule) pendant que le programme imprimait « LED OFF » à
// chaque tour. Corrigé dans PicoEngine, au seul point de lecture.
//
// Nécessite le firmware Pico (test sauté sinon).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Premier firmware Pico (non-W) trouvé, ou undefined. */
function findPicoFirmware() {
  const dirs = [
    join(root, 'test-assets'),
    join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
    join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((n) => /^RPI_PICO-.*\.uf2$/.test(n));
    if (hit) return join(dir, hit);
  }
  return undefined;
}

const fw = findPicoFirmware();
if (!fw) {
  console.log('SKIP : firmware Pico introuvable (RPI_PICO-*.uf2).');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-pinread-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm',
    external: ['vscode'], logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

let failures = 0;
let checks = 0;
function ok(label, cond, detail = '') {
  checks++;
  if (cond) console.log(`✅ ${label}`);
  else { failures++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

console.log(`Firmware : ${fw.split(/[\\/]/).pop()}`);

/** Joue un script et relève le journal série + les bascules de GP25. */
async function run(source, { maxMs = 120_000, jusqua = () => false } = {}) {
  const program = loadPythonProgram(fw, source, false);
  const engine = new PicoEngine({
    kind: 'flash',
    segments: program.payload.segments.map((s) => ({
      addr: s.addr,
      data: new Uint8Array(Buffer.from(s.b64, 'base64')),
    })),
    script: program.payload.script,
  });
  let serial = '';
  let toggles = 0;
  let last = null;
  engine.onSerial = (chunk) => { serial += chunk; };
  engine.onUpdate = () => {
    const v = engine.readDigital('GP25');
    if (last !== null && v !== last) toggles++;
    last = v;
  };
  engine.start();
  const started = Date.now();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if (jusqua(serial, toggles) || Date.now() - started > maxMs) { clearInterval(timer); resolve(); }
    }, 100);
  });
  engine.stop?.();
  return { toggles, serial, seconds: ((Date.now() - started) / 1000).toFixed(1) };
}

// --- Le VRAI sketch de test, tel quel ----------------------------------------
const SKETCH = readFileSync(tk('blink-pico.py'), 'utf8');
ok('blink-pico.py relit bien l\'état par value() (le cas qui échouait)',
  /led\.value\(\)/.test(SKETCH), JSON.stringify(SKETCH.slice(0, 160)));

const r = await run(SKETCH, { jusqua: (s, t) => /LED ON/.test(s) && /LED OFF/.test(s) && t >= 4 });
console.log(`(${r.seconds} s, ${r.toggles} bascules de GP25)`);
ok('le programme tourne (le moniteur série reçoit les états)',
  /LED (ON|OFF)/.test(r.serial), JSON.stringify(r.serial.slice(-200)));
ok('GP25 bascule vraiment', r.toggles >= 4, `${r.toggles} bascules`);
ok('« LED ON » finit par s\'afficher : value() relit le niveau piloté',
  /LED ON/.test(r.serial), `série ${JSON.stringify(r.serial.slice(-200))}`);
ok('« LED OFF » aussi : la relecture suit les DEUX niveaux',
  /LED OFF/.test(r.serial));

// --- La relecture ne doit pas inventer d'état sur une ENTRÉE ------------------
// Contre-mesure du risque introduit : une broche en entrée doit continuer de
// lire ce que le schéma lui impose (bouton, capteur), pas un fantôme de sortie.
const ENTREE = [
  'from machine import Pin',
  'import time',
  'p = Pin(16, Pin.OUT)',
  'p.value(1)',            // la broche est HAUTE tant qu'elle est en sortie
  'time.sleep_ms(50)',
  'print("SORTIE", p.value())',
  'p = Pin(16, Pin.IN, Pin.PULL_DOWN)',  // repasse en entrée : rappel au 0
  'time.sleep_ms(50)',
  'print("ENTREE", p.value())',
  'while True:',
  '    time.sleep_ms(200)',
  '',
].join('\n');
const e = await run(ENTREE, { maxMs: 90_000, jusqua: (s) => /ENTREE \d/.test(s) });
ok('en SORTIE, la broche se relit à son propre niveau (1)',
  /SORTIE 1/.test(e.serial), `série ${JSON.stringify(e.serial.slice(-200))}`);
ok('repassée en ENTRÉE, elle relit le schéma (0), pas l\'ancienne sortie',
  /ENTREE 0/.test(e.serial), `série ${JSON.stringify(e.serial.slice(-200))}`);

console.log(`\npin-readback : ${checks} contrôles, ${failures} échec(s).`);
console.log(failures === 0 ? 'RESULTAT: OK' : 'RESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
