// A/B (outil d'atelier) — combien coûte l'avance des PIO à CHAQUE instruction ?
//
// `pico.mts` appelle `pio[0].advance()` et `pio[1].advance()` une fois par
// instruction ARM, même quand aucune machine à états n'est configurée (cas de
// tous les sketches sans NeoPixel). Chaque appel itère sur ses quatre machines
// et relit les broches. Ce banc mesure le plafond du gain : on neutralise
// purement `advance` et on regarde ce que le régime y gagne.
//
// Les deux mesures tournent dans deux PROCESSUS distincts : `engine.stop()`
// coupe la boucle mais laisse vivre les périphériques du RP2040, dont les
// timers fausseraient la mesure suivante dans le même processus.
//
// Usage : node scripts/_ab-pio-pico.mjs [sketch.py]
import { spawnSync } from 'node:child_process';
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);
const nom = process.argv[2] || 'Horloge.py';
const FENETRE_MS = 5000;

// --- Pilote : lance les deux mesures, chacune dans son processus -------------
if (!process.env.KX_AB) {
  const un = (mode) => {
    const r = spawnSync(process.execPath, ['scripts/_ab-pio-pico.mjs', nom], {
      cwd: root, encoding: 'utf8', env: { ...process.env, KX_AB: mode },
    });
    return Number.parseFloat((r.stdout || '').trim());
  };
  dire(`${nom}`);
  const avec = un('avec');
  const sans = un('sans');
  dire(`  PIO avancé à chaque instruction : ${avec.toFixed(3)}`);
  dire(`  PIO neutralisé                  : ${sans.toFixed(3)}`);
  dire(`  plafond du gain                 : ${(((sans - avec) / avec) * 100).toFixed(1)} %`);
  process.exit(0);
}

// --- Mesure : une seule, dans ce processus ----------------------------------
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
if (!fw) { dire('0'); process.exit(0); }

const tmp = mkdtempSync(join(tmpdir(), 'kablix-ab-'));
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

const program = loadPythonProgram(fw, readFileSync(tk(nom), 'utf8'), false);
const engine = new PicoEngine({
  kind: 'flash',
  segments: program.payload.segments.map((s) => ({
    addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
  })),
  script: program.payload.script,
});
if (process.env.KX_AB === 'sans') {
  // `mcu` est privé côté TypeScript, mais bien là à l'exécution.
  for (const pio of engine.mcu.pio) pio.advance = () => {};
}
let base = null;
const t0 = Date.now();
engine.onRunning = () => { base = { wall: Date.now(), sim: engine.simulatedMs() }; };
engine.start();
await new Promise((resolve) => {
  const timer = setInterval(() => {
    if ((base && Date.now() - base.wall >= FENETRE_MS) || Date.now() - t0 > 120_000) {
      clearInterval(timer); resolve();
    }
  }, 100);
});
dire(base ? ((engine.simulatedMs() - base.sim) / (Date.now() - base.wall)).toFixed(4) : '0');
process.exit(0);
