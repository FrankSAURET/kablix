// MESURE (outil d'atelier) — le RÉGIME dépend-il du FIRMWARE chargé ?
//
// Les mesures de régime (`_mesure-regime-pico.mjs`) prennent le premier firmware
// trouvé, c'est-à-dire `test-assets/RPI_PICO-20230426-v1.20.0.uf2`. Mais VS Code,
// lui, prend ce qu'il y a dans le cache global de l'utilisateur — qui peut être
// une AUTRE variante (Pico W, pile réseau CYW43 + lwIP) et une AUTRE version de
// MicroPython. Ce script mesure le même sketch avec CHAQUE firmware présent sur
// la machine : c'est la seule façon de comparer ce qu'on mesure à ce que Frank
// exécute.
//
// UN FIRMWARE PAR PROCESSUS — obligatoire. `engine.stop()` coupe la boucle mais
// laisse vivre les périphériques du RP2040 précédent (timers USB, alarmes) : en
// mesurant tous les firmwares dans un seul processus, chaque mesure traîne les
// moteurs zombies des précédentes et tombe à ~0,45 quel que soit le firmware. Ce
// faux résultat a fait croire, le 7 août 2026, que MicroPython ≥ 1.22 était deux
// fois plus lent — mesurés séparément, ils sont tous à 0,99-1,00.
//
// Usage : node scripts/_mesure-firmware-pico.mjs [sketch.py]
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);

const SKETCH = process.argv[2] || 'Horloge.py';
const FENETRE_MS = 6000;

const dirs = [
  join(root, 'test-assets'),
  join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ...(process.env.KABLIX_FW_DIR ? [process.env.KABLIX_FW_DIR] : []), // dossier de comparaison
];
const firmwares = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const n of readdirSync(dir)) {
    if (/\.uf2$/i.test(n)) firmwares.push(join(dir, n));
  }
}
if (!firmwares.length) { dire('SKIP : aucun firmware.'); process.exit(0); }

// Chef d'orchestre : une relance par firmware, mesure isolée à chaque fois.
if (!process.env.KABLIX_FW) {
  dire(`sketch : ${SKETCH}\n`);
  dire('firmware                              taille   démarrage   régime   moteur   fronts/s');
  dire('-'.repeat(88));
  for (const fw of firmwares) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), SKETCH], {
      cwd: root, encoding: 'utf8', env: { ...process.env, KABLIX_FW: fw },
    });
    dire((r.stdout || '').trim() || `${fw.split(/[\\/]/).pop()} ÉCHEC ${(r.stderr || '').split('\n')[0]}`);
  }
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-fw-'));
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

const source = readFileSync(tk(SKETCH), 'utf8');

{
  const fw = process.env.KABLIX_FW;
  const program = loadPythonProgram(fw, source, false);
  const engine = new PicoEngine({
    kind: 'flash',
    segments: program.payload.segments.map((s) => ({
      addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
    })),
    script: program.payload.script,
  });
  let fronts = 0;
  engine.onUpdate = () => { fronts++; };
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
      if (fini || Date.now() - t0 > 120_000) { clearInterval(timer); resolve(); }
    }, 100);
  });
  const fin = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs(), fronts };
  engine.stop?.();
  const nom = fw.split(/[\\/]/).pop();
  const ko = `${Math.round(statSync(fw).size / 1024)} ko`;
  if (!base) { dire(`${nom.padEnd(36)} ${ko.padStart(8)}   jamais démarré (120 s)`); process.exit(0); }
  const wall = fin.wall - base.wall;
  dire(
    `${nom.padEnd(36)} ${ko.padStart(8)} ${(demarrage / 1000).toFixed(1).padStart(9)} s  ` +
    `${((fin.sim - base.sim) / wall).toFixed(2).padStart(7)}  ${(((fin.busy - base.busy) / wall) * 100).toFixed(0).padStart(5)} %  ` +
    `${((fronts - base.fronts) / (wall / 1000)).toFixed(0).padStart(8)}`
  );
}
process.exit(0);
