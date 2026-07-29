// Mesure jetable : où passe le temps sur l'horloge 7 segments multiplexée (Uno).
// Compile testkablix/horloge-uno/horloge-uno.ino puis fait tourner le VRAI moteur
// AvrEngine en Node (aucun rendu), et compare le temps simulé au temps réel —
// exactement le ratio du badge « Ralenti ». Variantes : moteur seul, puis avec la
// charge que l'UI ajoute à chaque front GPIO (échantillonnage du latch 7 segments).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-horloge-'));
const build = async (entry, name) => {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: out,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
};
const { compile, detectToolchain } = await build('src/compiler.ts', 'compiler.mjs');
const { AvrEngine } = await build('src/webview/engines/avr.mts', 'avr.mjs');

let tools = detectToolchain();
if (!tools.arduinoCli && !tools.avrGcc) {
  const dataDir = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Arduino15');
  const gccRoot = dataDir && join(dataDir, 'packages', 'arduino', 'tools', 'avr-gcc');
  if (gccRoot && existsSync(gccRoot)) {
    for (const v of readdirSync(gccRoot)) process.env.PATH = join(gccRoot, v, 'bin') + delimiter + process.env.PATH;
  }
  tools = detectToolchain();
}
if (!tools.arduinoCli && !tools.avrGcc) {
  console.log('toolchain absente, mesure impossible');
  process.exit(0);
}

const ino = join(root, 'testkablix/horloge-uno/horloge-uno.ino');
const res = await compile('uno', ino, root);
const program = Uint16Array.from(res.payload.bytes);
console.log(`horloge-uno.ino compilé : ${program.length} mots\n`);

// Broches du sketch : segments a..g = D2..D8, chiffres = D10..D13.
const SEG = ['2', '3', '4', '5', '6', '7', '8'];
const DIG = ['10', '11', '12', '13'];

const mesure = async (label, onUpdate) => {
  const engine = new AvrEngine(program, res.payload.debug);
  let fronts = 0;
  engine.onUpdate = () => {
    fronts++;
    onUpdate?.(engine);
  };
  engine.onSerial = () => {};
  engine.start();
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 4000));
  const wall = performance.now() - t0;
  const sim = engine.simulatedMs();
  engine.dispose();
  const busy = engine.busyMs?.() ?? 0;
  console.log(
    `${label} : ratio ${(sim / wall).toFixed(2)}× · occupation CPU ${(100 * busy / wall).toFixed(0)} %`
    + ` · ${Math.round(fronts / (wall / 1000))} fronts GPIO/s`
  );
  return sim / wall;
};

// 1. Moteur seul (l'UI ne fait rien du tout).
await mesure('moteur seul                    ', null);

// 2. + échantillonnage du latch 7 segments : ce que fait sim.mts à CHAQUE front
//    (4 chiffres × 8 segments de lectures de broches).
await mesure('+ latch 7 segments (32 lectures)', (e) => {
  for (const d of DIG) {
    if (e.readDigital(d)) continue; // chiffre actif = commun à 0 (cathode commune)
    for (const s of SEG) e.readDigital(s);
  }
});

// 3. + une lecture par broche déclarée, cas le plus lourd (aucune sortie anticipée).
await mesure('+ latch sans sortie anticipée   ', (e) => {
  for (const d of DIG) {
    e.readDigital(d);
    for (const s of SEG) e.readDigital(s);
  }
});
