// Pas à pas AVR sur un VRAI croquis Arduino (arduino-cli, cœur Arduino lié) :
// main() du cœur appelle setup() puis loop() en boucle, sans ligne à lui dans
// la table DWARF. Jusqu'à la v2026.9.5.163, le pas s'y arrêtait sur une ligne
// fictive (la dernière du croquis en mémoire), puis sautait tout le corps de
// loop(), jugé plus profond que main() (Frank, 26/09 : « saute
// systématiquement les lignes de 12 à 18 » de dmx-uno-lib.ino).
//
// verify:debugavr, lui, compile un programme C nu quand arduino-cli manque :
// son main() est celui de l'élève, le défaut n'y paraît pas. Ce banc est sauté
// proprement si arduino-cli est introuvable.
//
// Contre-épreuve : `node scripts/verify-debug-avr-pas.mjs --ancien` prend
// compiler.ts et le moteur AVR dans HEAD — le banc DOIT alors échouer.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-vdp-'));

const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : compilateur et moteur AVR en version HEAD)');
const versionHead = {
  name: 'version-head',
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/](compiler\.ts|webview[\\/]engines[\\/](avr|types)\.mts)$/ }, (args) => {
      if (!ANCIEN) return undefined;
      const rel = relative(root, args.path).replace(/\\/g, '/');
      const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return { contents, loader: 'ts', resolveDir: dirname(args.path) };
    });
  },
};

const build = async (entry, name) => {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    plugins: [versionHead],
  });
  return import(pathToFileURL(out).href);
};

const { compile, chercherArduinoCli } = await build('src/compiler.ts', 'compiler.mjs');
const { AvrEngine } = await build('src/webview/engines/avr.mts', 'avr.mjs');

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

/** Écrit un croquis dans son dossier (arduino-cli veut le même nom) et le compile. */
const compiler = async (nom, lignes) => {
  const dir = join(tmp, nom);
  mkdirSync(dir);
  const src = join(dir, `${nom}.ino`);
  writeFileSync(src, lignes.join('\n'));
  const res = await compile('uno', src, root, toolPaths);
  return res.payload;
};

/** Moteur branché sur ses arrêts : `prochainArret()` rend l'état ou null au bout de `ms`. */
const demarrer = (payload) => {
  const engine = new AvrEngine(Uint16Array.from(payload.bytes), payload.debug);
  let attente = null;
  engine.onDebugPause = (s) => attente?.(s);
  const prochainArret = (ms = 5000) =>
    new Promise((resolve) => {
      const t = setTimeout(() => { attente = null; resolve(null); }, ms);
      attente = (s) => { clearTimeout(t); attente = null; resolve(s); };
    });
  return { engine, prochainArret };
};

// --- 1) Deux tours de loop() pas à pas ---------------------------------------
// delay(300) : assez long pour qu'une pause tombe dedans (partie 2), assez
// court pour qu'un pas le franchisse vite (le pas s'écoule en temps réel).
const CROQUIS = [
  'int etape = 0;', // 1
  'void setup()', // 2
  '{', // 3
  '  pinMode(13, OUTPUT);', // 4
  '  Serial.begin(9600);', // 5
  '}', // 6
  'void loop()', // 7
  '{', // 8
  '  digitalWrite(13, HIGH);', // 9
  '  Serial.print("Etape : ");', // 10
  '  Serial.println(etape);', // 11
  '  etape++;', // 12
  '  delay(300);', // 13
  '  digitalWrite(13, LOW);', // 14
  '  etape = etape + 1;', // 15
  '}', // 16
];
console.log('Croquis Arduino (setup, loop, Serial, delay) :');
const p = await compiler('KxPas', CROQUIS);
const debug = p.debug ?? { lines: [], globals: [] };
const noms = (debug.functions ?? []).map((f) => f.name);
check(`fonctions du croquis bornées (${noms.join(', ') || 'aucune'})`, noms.includes('setup') && noms.includes('loop'));

console.log('Pas à pas depuis setup(), deux tours de loop() :');
{
  const { engine, prochainArret } = demarrer(p);
  engine.setBreakpoints([{ line: 4 }]);
  engine.start();
  const bp = await prochainArret(15000);
  check(`arrêt sur le point d'arrêt ligne 4 (ligne ${bp?.line})`, bp?.line === 4);
  engine.setBreakpoints([]);
  const attendu = [5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 9, 10, 11, 12, 13, 14, 15, 16, 9];
  const vus = [];
  const etapes = [];
  for (let i = 0; i < attendu.length; i++) {
    engine.step();
    const s = await prochainArret();
    if (!s) { vus.push('perdu'); break; }
    vus.push(s.line);
    etapes.push(s.variables.find((v) => v.name === 'etape')?.value);
  }
  engine.stop();
  console.log(`    lignes vues : ${vus.join(' ')}`);
  check('chaque pas tombe sur la ligne suivante, dans les deux tours', vus.join(' ') === attendu.join(' '));
  check('aucun arrêt sur une ligne fictive hors du code (main, cœur)', !vus.includes('perdu') && vus.every((l) => attendu.includes(l)));
  const tour2 = vus.slice(10, 18);
  check(`lignes 9 à 16 parcourues au 2e tour (${tour2.join(' ')})`, [9, 10, 11, 12, 13, 14, 15, 16].every((l) => tour2.includes(l)));
  // Le code franchi a bien tourné : etape vaut 1 après la ligne 12, 2 après la 15.
  const iLigne13 = vus.indexOf(13);
  const iLigne16 = vus.indexOf(16);
  check(`etape = 1 à l'arrêt sur la ligne 13 (${etapes[iLigne13]})`, etapes[iLigne13] === '1');
  check(`etape = 2 à l'arrêt sur la ligne 16 (${etapes[iLigne16]})`, etapes[iLigne16] === '2');
  check(`etape = 4 à la fin du 2e tour (${etapes[17]})`, etapes[17] === '4');
}

// --- 2) Pause pendant delay() ---------------------------------------------------
// Le PC est alors dans le cœur : la pause doit montrer la ligne qui a appelé
// delay(), et le pas suivant mener à la ligne d'après.
console.log('Pause pendant delay() :');
{
  const { engine, prochainArret } = demarrer(p);
  engine.start();
  await new Promise((r) => setTimeout(r, 1000)); // ~3 tours : presque tout le temps dans delay()
  const attente = prochainArret();
  engine.pause();
  const s = await attente;
  check(`la pause montre la ligne du delay() (ligne ${s?.line})`, s?.line === 13);
  engine.step();
  const s2 = await prochainArret();
  check(`le pas suivant mène à la ligne 14 (ligne ${s2?.line})`, s2?.line === 14);
  engine.stop();
}

// --- 3) Repli : croquis optimisé (bibliothèque chronométrée, -Os + LTO) ------
// loop() y est fondue dans main() : aucune fonction à borner, l'ancien pas
// s'applique. Il doit continuer à avancer (pas de pas perdu).
console.log('Repli -Os (SoftwareSerial) :');
{
  const pOs = await compiler('KxPasOs', [
    '#include <SoftwareSerial.h>',
    'SoftwareSerial ss(2, 3);',
    'int n = 0;',
    'void setup() { ss.begin(9600); }',
    'void loop()',
    '{',
    '  n++;',
    '  ss.println(n);',
    '  n += 2;',
    '  delay(10);',
    '}',
  ]);
  check('aucune fonction bornée en -Os (repli sur l’ancien pas)', !pOs.debug?.functions);
  const { engine, prochainArret } = demarrer(pOs);
  const premiere = pOs.debug?.lines[0]?.line;
  engine.setBreakpoints([{ line: premiere }]);
  engine.start();
  const bp = await prochainArret(15000);
  engine.setBreakpoints([]);
  const vus = [];
  for (let i = 0; bp && i < 4; i++) {
    engine.step();
    const s = await prochainArret();
    if (!s) break;
    vus.push(s.line);
  }
  engine.stop();
  check(`le pas avance encore (arrêt ligne ${bp?.line}, puis ${vus.join(' ')})`, !!bp && vus.length === 4);
}

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
