// Vérification du débogage MicroPython (lot 3, option A) :
//  1. tests unitaires de instrumentPython (toujours exécutés, sans firmware) ;
//  2. test de bout en bout : pause / pas à pas / variables / reprise dans le
//     simulateur PicoEngine avec le firmware MicroPython réel.
// Nécessite test-assets/RPI_PICO-20230426-v1.20.0.uf2 pour la partie 2 (sautée sinon).
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-dbgpy-'));

async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

const { instrumentPython } = await load('src/shared/pydebug.ts', 'pydebug.mjs');

// --- 1. Tests unitaires de instrumentPython ----------------------------------
console.log('Tests unitaires de instrumentPython :');

const sample = [
  'x = 1',
  'if x > 0:',
  '    y = 2',
  'else:',
  '    y = 3',
  'for i in range(3):',
  '    total = (x +',
  '             y)',
  's = """abc',
  'def"""',
  'z = x + \\',
  '    y',
  '# commentaire',
  '',
  'if x: y = 1',
  '@decorateur',
  'def f():',
  '    return x',
].join('\n');

const instrumented = instrumentPython(sample);
const allLines = instrumented.split('\n');
const endIdx = allLines.indexOf('# --- fin du preambule Kablix ---');
check('préambule présent (def __kx)', endIdx > 0 && instrumented.includes('def __kx('));

// Corps attendu : __kx(N) avant chaque ligne pas-à-pasable, N = ligne d'origine.
const expectedBody = [
  '__kx(1)',
  'x = 1',
  '__kx(2)',
  'if x > 0:',
  '    __kx(3)',
  '    y = 2',
  'else:', //                          mot-clé de suite de bloc : non instrumenté
  '    __kx(5)',
  '    y = 3',
  '__kx(6)',
  'for i in range(3):',
  '    __kx(7)',
  '    total = (x +',
  '             y)', //                continuation (parenthèse ouverte)
  '__kx(9)',
  's = """abc',
  'def"""', //                        intérieur de chaîne triple-quotée
  '__kx(11)',
  'z = x + \\',
  '    y', //                         continuation par backslash
  '# commentaire',
  '',
  '__kx(15)',
  'if x: y = 1', //                   une seule instrumentation pour la ligne entière
  '@decorateur', //                   décorateur : non instrumenté
  'def f():', //                      rien ne doit s'insérer entre @deco et def
  '    __kx(18)',
  '    return x',
];
const body = allLines.slice(endIdx + 1);
const bodyOk = JSON.stringify(body) === JSON.stringify(expectedBody);
check(
  'corps instrumenté conforme',
  bodyOk,
  bodyOk ? '' : `\n--- obtenu ---\n${body.join('\n')}\n--- attendu ---\n${expectedBody.join('\n')}`
);

// --- Variables locales (détection statique par def) ---------------------------
const sampleLoc = [
  'def melange(r, g=2, *args, **kw):', // 1 : params (self/cls exclus ailleurs)
  '    b = r + g', //                     2 : affectation simple
  '    for k in range(3):', //            3 : cible de for
  '        b += k', //                    4 : affectation augmentée
  '    with open("f") as fh:', //         5 : with … as
  '        pass', //                      6
  '    global seuil', //                  7 : global → jamais remonté en locale
  '    seuil = b', //                     8 : seuil exclu (global)
  '    return b', //                      9
  'class Truc:', //                      10
  '    attr = 1', //                     11 : corps de classe → pas de lambda
  '    def methode(self, n):', //        12 : self exclu
  '        total = n * 2', //            13
  '        return total', //             14
  'x = 1', //                            15 : module → pas de lambda
].join('\n');
const instLoc = instrumentPython(sampleLoc).split('\n');
const lineFor = (n) => instLoc.find((l) => l.trim().startsWith(`__kx(${n}`)) ?? '';
check(
  'locales : params + affectations + for + as capturés (ligne 2)',
  lineFor(2).includes("('r',lambda:r)") &&
    lineFor(2).includes("('g',lambda:g)") &&
    lineFor(2).includes("('b',lambda:b)") &&
    lineFor(2).includes("('k',lambda:k)") &&
    lineFor(2).includes("('fh',lambda:fh)") &&
    lineFor(2).includes("('args',lambda:args)") &&
    lineFor(2).includes("('kw',lambda:kw)"),
  lineFor(2)
);
check('locales : nom global exclu (seuil)', !lineFor(2).includes("'seuil'"), lineFor(2));
check('locales : corps de classe sans lambda', lineFor(11) === '    __kx(11)', lineFor(11));
check(
  'locales : méthode = n/total, sans self',
  lineFor(13).includes("('n',lambda:n)") &&
    lineFor(13).includes("('total',lambda:total)") &&
    !lineFor(13).includes("'self'"),
  lineFor(13)
);
check('locales : niveau module sans lambda', lineFor(15) === '__kx(15)', lineFor(15));

// Si un Python local est disponible, vérifie que le résultat compile (syntaxe).
let pyChecked = false;
for (const py of ['python', 'python3', 'py']) {
  try {
    execFileSync(py, ['-c', 'import sys; compile(sys.stdin.read(), "<kx>", "exec")'], {
      input: instrumented + '\n' + instrumentPython(sampleLoc),
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    check(`syntaxe Python valide (${py})`, true);
    pyChecked = true;
    break;
  } catch (err) {
    if (err.code === 'ENOENT') continue; // interpréteur absent : on essaie le suivant
    check('syntaxe Python valide', false, String(err.stderr ?? err.message));
    pyChecked = true;
    break;
  }
}
if (!pyChecked) console.log('  - syntaxe Python : non vérifiée (aucun interpréteur local).');

// --- 2. Test de bout en bout avec le firmware MicroPython --------------------
const fw = join(root, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (!existsSync(fw)) {
  console.log('\nSKIP bout en bout : firmware absent (test-assets/RPI_PICO-20230426-v1.20.0.uf2).');
  console.log(failures === 0 ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
  process.exit(failures === 0 ? 0 : 1);
}

console.log('\nTest de bout en bout (pause / pas / variables / reprise) :');
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({
  addr: s.addr,
  data: s.data,
}));

// 3 globales + une fonction (locales r/g/b) + boucle : TICK régulier pour
// synchroniser le test.
const script = [
  "print('START')", //   ligne 1
  'compteur = 0', //     ligne 2
  'seuil = 3', //        ligne 3
  "nom = 'kx'", //       ligne 4
  'def melange(r, g):', //               ligne 5
  '    b = r + g', //                    ligne 6
  '    return b * 2', //                 ligne 7
  'while True:', //      ligne 8
  '    compteur = compteur + 1', //      ligne 9
  '    total = melange(compteur, seuil)', // ligne 10
  '    if compteur % 10 == 0:', //       ligne 11
  "        print('TICK', compteur)", //  ligne 12
  '',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script: instrumentPython(script) });
let serial = '';
const states = [];
engine.onSerial = (chunk) => {
  serial += chunk;
};
engine.onDebugPause = (state) => states.push(state);

const countTicks = () => (serial.match(/TICK \d+/g) ?? []).length;
function waitFor(pred, timeoutMs, label) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const it = setInterval(() => {
      if (pred()) {
        clearInterval(it);
        resolve(undefined);
      } else if (Date.now() - t0 > timeoutMs) {
        clearInterval(it);
        reject(new Error(`délai dépassé : ${label}`));
      }
    }, 100);
  });
}

console.log('  Démarrage de MicroPython dans le simulateur (max 240 s)…');
const started = Date.now();
engine.start();

try {
  // Attend le démarrage du script, puis que la boucle tourne (toutes les
  // globales sont alors affectées).
  await waitFor(() => serial.includes('START'), 300000, "'START' (boot + injection raw REPL)");
  console.log(`  ✓ script démarré en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await waitFor(() => countTicks() >= 1, 120000, "premier 'TICK'");
  console.log(`  ✓ premier TICK en ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // Pause coopérative (\x05) : un état KX doit arriver.
  engine.pause();
  await waitFor(() => states.length >= 1, 60000, 'état de pause après \\x05');
  check('pause : état KX reçu', true);
  check('pause : engine.paused', engine.paused === true);

  // Deux pas (\x06) : deux nouveaux états.
  engine.step();
  await waitFor(() => states.length >= 2, 60000, 'état après le 1er pas');
  engine.step();
  await waitFor(() => states.length >= 3, 60000, 'état après le 2e pas');
  check('pas à pas : 3 états reçus', states.length >= 3);

  // Lignes : numéros du source ORIGINAL, dans la boucle ou la fonction, et qui évoluent.
  const lines = states.slice(0, 3).map((s) => s.line);
  check(
    'lignes dans la boucle ou la fonction (6..12)',
    lines.every((l) => typeof l === 'number' && l >= 6 && l <= 12),
    `lignes reçues : ${JSON.stringify(lines)}`
  );
  check(
    'la ligne change entre deux pas',
    lines[0] !== lines[1] || lines[1] !== lines[2],
    `lignes reçues : ${JSON.stringify(lines)}`
  );

  // Variables globales remontées (repr) ; les noms __kx* sont filtrés.
  const last = states[2];
  const vars = Object.fromEntries(last.variables.map((v) => [v.name, v.value]));
  check(
    'variables : compteur/seuil/nom présentes',
    'compteur' in vars && vars.seuil === '3' && vars.nom === "'kx'",
    JSON.stringify(vars)
  );
  check(
    'variables : pas de noms internes __kx*',
    last.variables.every((v) => !v.name.startsWith('_'))
  );

  // Le moniteur série ne doit jamais voir les séquences de débogage.
  check('moniteur sans séquence \\x1bKX', !serial.includes('\x1bKX') && !serial.includes('"l":'));
  check("moniteur : sortie normale visible (START/TICK)", serial.includes('START') && countTicks() >= 1);

  // Reprise (\x07) : la boucle repart (nouveaux TICK), plus d'états KX.
  const ticksBefore = countTicks();
  const statesBefore = states.length;
  engine.resume();
  check('reprise : engine.paused redevient faux', engine.paused === false);
  await waitFor(() => countTicks() > ticksBefore, 120000, 'TICK après reprise');
  check('reprise : la boucle repart', true);
  await new Promise((r) => setTimeout(r, 2000)); // délai de grâce
  check('reprise : plus aucun état KX', states.length === statesBefore);

  // --- Variables locales (arrêt DANS la fonction) -------------------------------
  // Arrêt ligne 6 (avant `b = r + g`) : r et g (paramètres) sont visibles, b pas
  // encore affectée doit être ABSENTE (thunk NameError ignoré). Un pas → ligne 7 :
  // b apparaît et vaut r + g.
  const locBefore = states.length;
  engine.setBreakpoints([{ line: 6 }]);
  await waitFor(() => states.length > locBefore, 120000, 'arrêt dans la fonction (ligne 6)');
  engine.setBreakpoints([]); // retiré tout de suite : ne pas re-déclencher au tour suivant
  const locState6 = states[states.length - 1];
  const locVars6 = Object.fromEntries(locState6.variables.map((v) => [v.name, v.value]));
  check('locales : arrêt sur la ligne 6 (corps de fonction)', locState6.line === 6, `ligne=${locState6.line}`);
  check(
    'locales : paramètres r et g remontés (g = seuil = 3)',
    'r' in locVars6 && locVars6.g === '3',
    JSON.stringify(locVars6)
  );
  check('locales : b absente avant son affectation', !('b' in locVars6), JSON.stringify(locVars6));
  check('locales : les globales restent visibles (compteur, nom)', 'compteur' in locVars6 && locVars6.nom === "'kx'");
  const stepBefore = states.length;
  engine.step();
  await waitFor(() => states.length > stepBefore, 60000, 'pas vers la ligne 7');
  const locState7 = states[states.length - 1];
  const locVars7 = Object.fromEntries(locState7.variables.map((v) => [v.name, v.value]));
  check('locales : le pas mène à la ligne 7', locState7.line === 7, `ligne=${locState7.line}`);
  check(
    'locales : b = r + g après affectation',
    Number(locVars7.b) === Number(locVars7.r) + Number(locVars7.g),
    JSON.stringify(locVars7)
  );
  const ticksAtLoc = countTicks();
  engine.resume();
  await waitFor(() => countTicks() > ticksAtLoc, 120000, 'reprise après le test des locales');
  check('locales : reprise après le test', true);

  // --- Point d'arrêt CONDITIONNEL ---------------------------------------------
  // Arrêt sur la ligne 12 (print TICK, atteinte seulement quand compteur % 10 == 0)
  // si la condition « compteur > 100 and compteur % 7 == 0 » est vraie. La boucle
  // tourne vite : on ne peut pas prédire la valeur exacte, mais l'arrêt DOIT
  // respecter la condition (sinon le filtrage conditionnel ne marche pas).
  const condBefore = states.length;
  engine.setBreakpoints([{ line: 12, condition: 'compteur > 100 and compteur % 7 == 0' }]);
  await waitFor(() => states.length > condBefore, 120000, 'arrêt sur breakpoint conditionnel');
  const condState = states[states.length - 1];
  const condVars = Object.fromEntries(condState.variables.map((v) => [v.name, v.value]));
  const condCnt = Number(condVars.compteur);
  check('breakpoint conditionnel : arrêt sur la ligne 12', condState.line === 12, `ligne=${condState.line}`);
  // La ligne 12 n'est atteinte que si compteur % 10 == 0 ; la condition impose en
  // plus > 100 et % 7 == 0. Un arrêt qui ne respecte pas la condition prouverait
  // que le filtrage est ignoré (régression de l'item « points d'arrêt conditionnels »).
  check(
    'breakpoint conditionnel : la condition est respectée (compteur > 100 et %7==0 et %10==0)',
    condCnt > 100 && condCnt % 7 === 0 && condCnt % 10 === 0,
    `compteur=${condVars.compteur}`
  );
  check('breakpoint conditionnel : engine.paused', engine.paused === true);
  // Retrait du point d'arrêt : le programme doit reprendre tout seul.
  const ticksAtBp = countTicks();
  engine.setBreakpoints([]);
  engine.resume();
  await waitFor(() => countTicks() > ticksAtBp, 120000, 'reprise après retrait du breakpoint conditionnel');
  check('breakpoint conditionnel : reprise après retrait', true);
} catch (err) {
  // Diagnostic : phase REPL interne (champ privé TS, accessible à l'exécution).
  const phase = engine.replPhase ?? '?';
  check(
    String(err.message ?? err),
    false,
    `phase REPL=${phase}, états=${states.length}, série reçue : ${JSON.stringify(serial.slice(-300))}`
  );
} finally {
  engine.dispose();
}

console.log(failures === 0 ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
