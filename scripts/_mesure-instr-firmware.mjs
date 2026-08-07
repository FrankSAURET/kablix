// MESURE (outil d'atelier) — CE QUE COÛTE un firmware, en instructions.
//
// Le régime seul ne dit pas grand-chose : le pacing temps réel plafonne à 1,00,
// donc deux firmwares peuvent afficher 1,00 en travaillant du simple au double.
// Ce script mesure la CHARGE : combien d'instructions ARM le moteur doit émuler
// pour produire UNE milliseconde simulée, quelle part du temps simulé le cœur
// passe ENDORMI (WFE, gratuit pour l'émulateur), et le débit réel en Minstr/s.
//
// Un firmware qui dort moins, ou qui exécute plus d'instructions pour le même
// travail, coûte proportionnellement plus cher — c'est le seul facteur qui
// compte, la vitesse du PC ne fait que déplacer le seuil.
//
// UN FIRMWARE PAR PROCESSUS (cf. `_mesure-firmware-pico.mjs`) : les moteurs
// arrêtés continuent de faire tourner leurs périphériques et faussent tout ce
// qui suit dans le même processus.
//
// Usage : node scripts/_mesure-instr-firmware.mjs [sketch.py]
//   (KABLIX_FW_DIR=<dossier> ajoute des firmwares à comparer)
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeSync } from 'node:fs';
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
  ...(process.env.KABLIX_FW_DIR ? [process.env.KABLIX_FW_DIR] : []),
];
const firmwares = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const n of readdirSync(dir)) if (/\.uf2$/i.test(n)) firmwares.push(join(dir, n));
}
if (!firmwares.length) { dire('SKIP : aucun firmware.'); process.exit(0); }

// Chef d'orchestre : une relance par firmware, mesure isolée à chaque fois.
if (!process.env.KABLIX_FW) {
  dire(`sketch : ${SKETCH}\n`);
  dire('firmware                             régime   instr/ms simulée   Minstr/s réelles   sommeil');
  dire('-'.repeat(95));
  for (const fw of firmwares) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), SKETCH], {
      cwd: root, encoding: 'utf8', env: { ...process.env, KABLIX_FW: fw },
    });
    dire((r.stdout || '').trim() || `${fw.split(/[\\/]/).pop()} ÉCHEC ${(r.stderr || '').split('\n')[0]}`);
  }
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-instr-'));
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
  // Compteurs posés SUR le cœur : instructions réellement interprétées, et
  // cycles avancés pendant les sauts WFE (temps simulé obtenu gratuitement).
  const core = engine.sim.rp2040.core;
  const orig = core.executeInstruction.bind(core);
  let instr = 0;
  let armed = false;
  core.executeInstruction = () => { if (armed) instr++; return orig(); };
  let base = null;
  const t0 = Date.now();
  engine.onRunning = () => {
    armed = true; instr = 0;
    base = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs(), cycles: core.cycles };
  };
  engine.start();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if ((base && Date.now() - base.wall >= FENETRE_MS) || Date.now() - t0 > 120_000) {
        clearInterval(timer); resolve();
      }
    }, 100);
  });
  const fin = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs(), cycles: core.cycles };
  engine.stop?.();
  const nom = fw.split(/[\\/]/).pop();
  if (!base) { dire(`${nom.padEnd(36)} jamais démarré`); process.exit(0); }
  const wall = fin.wall - base.wall;
  const simMs = fin.sim - base.sim;
  const regime = simMs / wall;
  const parMsSim = instr / simMs;
  const debitReel = instr / (fin.busy - base.busy) / 1000; // Minstr par seconde de CPU
  // Un cycle exécuté = ~1 instruction ; le reste des cycles a été SAUTÉ (WFE).
  const cycles = fin.cycles - base.cycles;
  const sommeil = 100 * (1 - instr / cycles);
  dire(
    `${nom.padEnd(36)} ${regime.toFixed(2).padStart(6)}   ${parMsSim.toFixed(0).padStart(16)}   ` +
    `${debitReel.toFixed(1).padStart(16)}   ${sommeil.toFixed(0).padStart(5)} %`
  );
}
process.exit(0);
