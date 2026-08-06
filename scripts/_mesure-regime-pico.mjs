// MESURE (outil d'atelier) — régime réel du moteur Pico, sketch par sketch.
//
// Répond à « ça rame » sans deviner : pour chaque programme de testkablix,
// combien de millisecondes SIMULÉES le moteur produit-il par milliseconde
// RÉELLE, une fois le démarrage du firmware terminé (signal onRunning) ?
// Le rendu de la page n'est pas dans la boucle ici : un ratio de 1,00 dit que
// le ralenti vu à l'écran vient de la webview, pas du moteur.
//
// Usage : node scripts/_mesure-regime-pico.mjs [sketch.py ...]
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// Sortie SYNCHRONE : la mesure dure des minutes et Node bufferise `console.log`
// quand la sortie est un tube — on croyait le script planté alors qu'il tournait.
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);

function findFirmware() {
  const dirs = [
    join(root, 'test-assets'),
    join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((n) => /^RPI_PICO.*\.uf2$/.test(n));
    if (hit) return join(dir, hit);
  }
  return undefined;
}
const fw = findFirmware();
if (!fw) { dire('SKIP : firmware Pico introuvable.'); process.exit(0); }

const tmp = mkdtempSync(join(tmpdir(), 'kablix-regime-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: out, bundle: true,
    platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}
const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const sketches = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Horloge.py', 'condo-pico.py', 'us-sensor.py', 'ili9341-pico.py', 'blink-pico.py'];

const FENETRE_MS = 5000; // durée de mesure une fois le script parti

dire(`Firmware : ${fw.split(/[\\/]/).pop()}\n`);
dire('sketch                démarrage   régime   moteur   fronts GPIO/s');
dire('-'.repeat(72));

for (const nom of sketches) {
  const chemin = tk(nom);
  if (!existsSync(chemin)) { dire(`${nom.padEnd(20)} absent`); continue; }
  const source = readFileSync(chemin, 'utf8');
  const program = loadPythonProgram(fw, source, false);
  const engine = new PicoEngine({
    kind: 'flash',
    segments: program.payload.segments.map((s) => ({
      addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
    })),
    script: program.payload.script,
  });
  let fronts = 0;
  engine.onUpdate = () => { fronts++; }; // un appel par front GPIO
  let demarrage = 0;
  const t0 = Date.now();
  let base = null;
  engine.onRunning = () => {
    demarrage = Date.now() - t0;
    base = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs(), fronts };
  };
  engine.start();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const fini = base && Date.now() - base.wall >= FENETRE_MS;
      if (fini || Date.now() - t0 > 90_000) { clearInterval(timer); resolve(); }
    }, 100);
  });
  const fin = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs(), fronts };
  engine.stop?.();
  if (!base) { dire(`${nom.padEnd(20)} le script n'a jamais démarré (90 s)`); continue; }
  const wall = fin.wall - base.wall;
  const ratio = (fin.sim - base.sim) / wall;
  const moteur = (fin.busy - base.busy) / wall;
  const frontsParSec = ((fin.fronts - base.fronts) / (wall / 1000)).toFixed(0);
  dire(
    `${nom.padEnd(20)} ${(demarrage / 1000).toFixed(1).padStart(7)} s  ${ratio.toFixed(2).padStart(7)}  ` +
    `${(moteur * 100).toFixed(0).padStart(5)} %  ${frontsParSec.padStart(12)}`
  );
}
// Sortie EXPLICITE : `engine.stop()` coupe la boucle mais laisse vivre les
// périphériques du RP2040 (timers USB, alarmes), donc le processus ne rendait
// jamais la main — et sous `--cpu-prof`, un profil ne s'écrit qu'à la sortie.
process.exit(0);
