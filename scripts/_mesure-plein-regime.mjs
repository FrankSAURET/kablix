// Mesure jetable : DÉBIT du moteur COMPLET (AvrEngine, tous périphériques et
// écouteurs branchés), c'est-à-dire le ratio qu'il tiendrait si rien ne le
// bridait. Les bancs précédents mesuraient le ratio SOUS cadencement : plafonné à
// 1,00× par construction, il ne peut montrer aucun gain tant que le moteur est
// au-dessus du temps réel. Ici on maintient l'ancre en retard de 200 ms (juste
// sous MAX_DEBT_MS = 250, sinon le moteur ré-ancre et repart sans dette) : la
// boucle a toujours du retard à rattraper, donc elle tourne à plein régime.
//
// A/B dans le MÊME processus : le noyau chaud (aucun test par instruction) contre
// le chemin de débogage, forcé en posant un point d'arrêt à une adresse
// impossible — il ne se déclenchera jamais mais fait prendre la boucle
// instruction par instruction.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-plein-'));
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
  const gccRoot = process.env.LOCALAPPDATA
    && join(process.env.LOCALAPPDATA, 'Arduino15', 'packages', 'arduino', 'tools', 'avr-gcc');
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

const SECONDES = 3;
const plein = async (label, prepare) => {
  const engine = new AvrEngine(program, res.payload.debug);
  engine.onSerial = () => {};
  let fronts = 0;
  engine.onUpdate = () => { fronts++; };
  prepare?.(engine);
  // L'ancre reste 200 ms en retard : la boucle a toujours de quoi rattraper.
  const boucle = engine.loop;
  let tours = 0;
  engine.loop = () => {
    tours++;
    if (engine.paceWall) engine.paceWall -= 200;
    boucle();
  };
  engine.start();
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, SECONDES * 1000));
  const wall = performance.now() - t0;
  const sim = engine.simulatedMs();
  const busy = engine.busyMs();
  engine.dispose();
  const debit = sim / busy; // temps simulé produit par ms réellement PASSÉE à simuler
  console.log(
    `${label} : débit ${debit.toFixed(2)}× le temps réel`
    + ` · occupation ${(100 * busy / wall).toFixed(0)} %`
    + ` · ${Math.round(tours / (wall / 1000))} tranches/s`
    + ` · ${Math.round(fronts / (sim / 1000))} fronts par seconde SIMULÉE`
  );
  return debit;
};

// Alterné, plusieurs tours : la machine varie de 25 % d'une exécution à l'autre.
const best = {};
for (let tour = 0; tour < 3; tour++) {
  const a = await plein('  noyau chaud (normal)      ', null);
  const b = await plein('  chemin de débogage        ', (e) => e.setBreakpoints?.([{ line: 999999 }]));
  best['noyau chaud (normal)'] = Math.max(best['noyau chaud (normal)'] ?? 0, a);
  best['chemin de débogage  '] = Math.max(best['chemin de débogage  '] ?? 0, b);
}
console.log('\nMeilleur passage de chacun :');
for (const [k, v] of Object.entries(best)) console.log(`  ${k} : ${v.toFixed(2)}×`);
