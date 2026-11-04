// Points d'arrêt Arduino morts sur un poste saturé (Frank, 03/11/2026 : « aucun
// point d'arrêt ne se produisait », sur un autre poste, jamais chez lui).
//
// Sans infos de débogage, le moteur AVR vide la liste des points d'arrêt. Un
// échec d'avr-objdump (mémoire, antivirus) les faisait disparaître en silence,
// et le cache de compilation RANGEAIT ce programme incomplet : tant que le
// croquis ne changeait pas, chaque lancement le reprenait, même poste revenu
// au calme. Le cache étant propre à chaque machine, l'autre poste ne voyait rien.
//
// Le banc simule l'échec : un faux avr-objdump.cmd dans `searchDir` (Node
// refuse de toute façon de lancer un .cmd sans shell). Puis il recompile avec
// le vrai outil, dans le même cache : les infos doivent revenir.
//
// Contre-épreuve : `node scripts/verify-debug-objdump.mjs --ancien` prend
// compiler.ts dans HEAD — le banc DOIT alors échouer.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-vdo-'));

const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : compilateur en version HEAD)');
const versionHead = {
  name: 'version-head',
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/]compiler\.ts$/ }, (args) => {
      if (!ANCIEN) return undefined;
      const rel = relative(root, args.path).replace(/\\/g, '/');
      const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return { contents, loader: 'ts', resolveDir: dirname(args.path) };
    });
  },
};

const out = join(tmp, 'compiler.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/compiler.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [versionHead],
});
const { compile, chercherArduinoCli } = await import(pathToFileURL(out).href);

// arduino-cli : PATH, Arduino IDE 2, ou celui de l'extension sœur.
const toolPaths = {
  autreStockageGlobal: join(
    process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
    'Code', 'User', 'globalStorage', 'electropol-fr.arduino-vscode-ide'
  ),
};
if (!chercherArduinoCli(toolPaths).chemin) {
  console.log('arduino-cli absent, test sauté');
  process.exit(0);
}

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
};

// Faux avr-objdump, trouvé AVANT le vrai (searchDir passe devant le PATH).
const faux = join(tmp, 'faux-outils');
mkdirSync(faux);
writeFileSync(join(faux, process.platform === 'win32' ? 'avr-objdump.cmd' : 'avr-objdump'), '@exit /b 1\n', { mode: 0o755 });

const nom = 'arret';
const dir = join(tmp, nom);
mkdirSync(dir);
const src = join(dir, `${nom}.ino`);
writeFileSync(
  src,
  ['int compteur = 0;', 'void setup() {}', 'void loop() {', '  compteur++;', '  delay(10);', '}'].join('\n')
);
const cache = join(tmp, 'cache');
const entrees = () => (existsSync(cache) ? readdirSync(cache).filter((n) => n.endsWith('.json')).length : 0);

console.log('Poste saturé : avr-objdump échoue');
const rate = await compile('uno', src, root, { ...toolPaths, searchDir: faux }, cache);
check('le programme est compilé quand même', Array.isArray(rate.payload.bytes) && rate.payload.bytes.length > 0);
check('pas d\'infos de débogage', rate.payload.debug === undefined);
check('l\'échec est signalé (debugNote = failed)', rate.payload.debugNote === 'failed');
check('un second essai est tenté', /nouvel essai/.test(rate.log));
check('rien n\'est rangé dans le cache', entrees() === 0);

console.log('Poste revenu au calme, croquis inchangé');
const bon = await compile('uno', src, root, toolPaths, cache);
check('pas repris du cache', !/repris du cache/.test(bon.log));
check('les infos de débogage reviennent', (bon.payload.debug?.lines?.length ?? 0) > 0);
check('la ligne 4 a une adresse (point d\'arrêt possible)', !!bon.payload.debug?.lines?.some((l) => l.line === 4));
check('résultat complet rangé dans le cache', entrees() === 1);

console.log('Lancement suivant');
const repris = await compile('uno', src, root, toolPaths, cache);
check('repris du cache', /repris du cache/.test(repris.log));
check('avec ses infos de débogage', (repris.payload.debug?.lines?.length ?? 0) > 0);

if (failures > 0) {
  console.error(`\n${failures} échec(s)`);
  process.exit(1);
}
console.log('\nverify-debug-objdump : OK');
