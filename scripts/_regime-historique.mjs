// BISSECTION (outil d'atelier) — à partir de quelle version le Pico a-t-il ralenti ?
//
// Mesure le régime (ms simulée par ms réelle) du MÊME sketch avec le moteur de
// plusieurs révisions git. Chaque révision est sortie dans un worktree placé
// SOUS le projet (`.bisect/`) pour que la résolution de `node_modules` remonte
// jusqu'à celui de la racine — un worktree ailleurs n'aurait ni rp2040js ni
// esbuild. Le sketch et le firmware viennent toujours de la copie courante :
// seul le moteur change d'une mesure à l'autre.
//
// Usage : node scripts/_regime-historique.mjs <rev>[:étiquette] ...
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const SKETCH = process.env.KABLIX_SKETCH || 'Horloge.py';
const CHAUFFE_MS = 12_000; // démarrage du firmware + injection du script
const FENETRE_MS = 6_000;  // fenêtre de mesure

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
const source = readFileSync(join(root, 'testkablix', SKETCH), 'utf8');

const revs = process.argv.slice(2);
if (!revs.length) { dire('usage : node scripts/_regime-historique.mjs <rev>[:étiquette] ...'); process.exit(1); }

const tmp = mkdtempSync(join(tmpdir(), 'kablix-hist-'));
const wt = join(root, '.bisect');

async function bundle(dir, entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(dir, entry)], outfile: out, bundle: true,
    platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
    // Le worktree n'a pas de node_modules : les paquets se résolvent dans celui
    // de la racine, et les imports relatifs restent ceux de la révision testée.
    nodePaths: [join(root, 'node_modules')],
  });
  return import(pathToFileURL(out).href);
}

async function mesure(dir, tag) {
  const { loadPythonProgram } = await bundle(dir, 'src/compiler.ts', `compiler-${tag}.mjs`);
  const { PicoEngine } = await bundle(dir, 'src/webview/engines/pico.mts', `pico-${tag}.mjs`);
  const program = loadPythonProgram(fw, source, false);
  const engine = new PicoEngine({
    kind: 'flash',
    segments: program.payload.segments.map((s) => ({
      addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
    })),
    script: program.payload.script,
  });
  // `simulatedMs()` et `onRunning` n'existent pas dans toutes les révisions :
  // on lit l'horloge du simulateur, présente depuis toujours, après chauffe.
  const clock = engine.sim.clock;
  const nanos = () => clock.nanos;
  let sortie = '';
  engine.onSerial = (c) => { sortie += c; };
  engine.start();
  await new Promise((r) => setTimeout(r, CHAUFFE_MS));
  const t0 = Date.now(); const n0 = nanos();
  await new Promise((r) => setTimeout(r, FENETRE_MS));
  const wall = Date.now() - t0; const dn = nanos() - n0;
  engine.stop?.();
  return { ratio: dn / 1e6 / wall, demarre: /MicroPython|>>>/.test(sortie) || dn > 0 };
}

dire(`sketch : ${SKETCH}   firmware : ${fw.split(/[\\/]/).pop()}\n`);
dire('révision                                     régime');
dire('-'.repeat(56));
for (const spec of revs) {
  const [rev, label] = spec.split(':');
  const sujet = label || git('log', '-1', '--format=%s', rev).slice(0, 34);
  try {
    if (existsSync(wt)) execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: root });
    execFileSync('git', ['worktree', 'add', '--detach', wt, rev], { cwd: root, stdio: 'ignore' });
    const { ratio } = await mesure(wt, rev);
    dire(`${sujet.padEnd(40)} ${ratio.toFixed(3).padStart(10)}`);
  } catch (e) {
    dire(`${sujet.padEnd(40)}      ÉCHEC  ${String(e.message).split('\n')[0].slice(0, 60)}`);
  }
}
if (existsSync(wt)) execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: root });
rmSync(tmp, { recursive: true, force: true });
process.exit(0);
