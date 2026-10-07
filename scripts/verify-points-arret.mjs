// Points d'arrêt « complets » de VS Code : condition, nombre de passages, point
// de journalisation (« Log Message »), sur les deux familles de cartes.
//  1. règles communes (breakpoints.mts) et évaluateur C des cartes Arduino
//     (cexpr.mts) : tests unitaires, toujours joués ;
//  2. préambule MicroPython (pydebug.ts) exécuté pour de vrai par l'interpréteur
//     MicroPython Unix (`micropython`, paquet Debian/Ubuntu) : le script
//     instrumenté reçoit ses points d'arrêt sur stdin et publie pauses et
//     messages sur stdout, exactement comme dans le Pico simulé. Sauté si
//     l'interpréteur est absent.
// Le côté Arduino de bout en bout (moteur avr8js + croquis compilé) est dans
// verify-debug-avr.mjs (« Règles VS Code »), qui demande une toolchain AVR.
//
// Jusqu'à la v2026.10.1.214 : condition ignorée sur Arduino, nombre de passages
// ignoré partout, et un point de journalisation ARRÊTAIT la simulation.
import esbuild from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-pa-'));

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

const { parseHitCondition, hitMatches, splitLogMessage, encodePyBreakpoints } = await load(
  'src/webview/engines/breakpoints.mts',
  'breakpoints.mjs'
);
const { evalC, formatC } = await load('src/webview/engines/cexpr.mts', 'cexpr.mjs');
const { instrumentPython } = await load('src/shared/pydebug.ts', 'pydebug.mjs');

// --- 1a. Nombre de passages et message ---------------------------------------
console.log('Règles communes (nombre de passages, message) :');
const hits = (txt) => {
  const r = parseHitCondition(txt);
  return r instanceof Error ? 'erreur' : [1, 2, 3, 4, 5, 6].filter((n) => hitMatches(r, n)).join(',');
};
check('« 3 » = 3e passage seulement (comme debugpy)', hits('3') === '3');
check('« = 3 » et « ==3 » idem', hits('= 3') === '3' && hits('==3') === '3');
check('« >4 »', hits('>4') === '5,6');
check('« >= 4 »', hits('>= 4') === '4,5,6');
check('« <3 » et « <=2 »', hits('<3') === '1,2' && hits('<=2') === '1,2');
check('« %2 »', hits('%2') === '2,4,6');
check('vide = toujours', hits('') === '1,2,3,4,5,6' && hits(undefined) === '1,2,3,4,5,6');
check('illisible = erreur (« beaucoup », « %0 », « >-1 »)',
  ['beaucoup', '%0', '>-1'].every((t) => hits(t) === 'erreur'));
const parts = (m) => JSON.stringify(splitLogMessage(m));
check('message sans accolade', parts('bonjour') === '["bonjour"]');
check('message « i = {i}, j={ j } »', parts('i = {i}, j={ j }') === '["i = ","i",", j=","j",""]');
check('accolades doublées littérales', parts('{{x}} {x}') === '["{x} ","x",""]');
check('accolade non refermée = texte', parts('a {b') === '["a {b"]');

// --- 1b. Évaluateur C -----------------------------------------------------------
console.log('Évaluateur C (conditions Arduino) :');
const vars = { compteur: 12, seuil: 3.5, 'notes[2]': 30, 'p1.x': -4, etat: 1, i: 2 };
const ev = (e) => {
  try {
    return evalC(e, (n) => vars[n]);
  } catch (err) {
    return `erreur: ${err.message}`;
  }
};
const cas = [
  ['compteur > 10 && compteur % 4 == 0', 1],
  ['compteur > 10 && compteur % 5 == 0', 0],
  ['7 / 2', 3], // division entière
  ['-7 / 2', -3], // tronquée vers zéro, comme en C
  ['7.0 / 2', 3.5],
  ['seuil * 2', 7],
  ['1 + 2 * 3 - 4', 3],
  ['(1 + 2) * 3', 9],
  ['0x0F & 0b1010', 10],
  ['1 << 4 | 1', 17],
  ['~0', -1],
  ['!compteur', 0],
  ['etat == HIGH', 1],
  ['etat != LOW ? 100 : 200', 100],
  ['true && !false', 1],
  ["'A' + 1", 66],
  ['notes[i]', 30],
  ['notes[1 + 1] == 30 && p1.x < 0', 1],
  ['10UL + 2.5f', 12.5],
  ['compteur >= 12 || inconnu', 1], // court-circuit : `inconnu` jamais lu
  ['compteur < 0 && 1 / 0', 0], // court-circuit : pas de division par zéro
];
for (const [e, attendu] of cas) check(`${e} = ${attendu}`, ev(e) === attendu, String(ev(e)));
const erreurs = [
  ['inconnu > 1', /'inconnu' is not a global/],
  ['compteur = 3', /unexpected '='/],
  ['millis() > 10', /function call/],
  ['notes[7]', /'notes\[7\]' is not a global/],
  ['compteur / 0', /division by zero/],
  ['(1 + 2', /'\)' expected/],
  ['', /empty/],
];
for (const [e, re] of erreurs) check(`erreur lisible : ${e || '(vide)'}`, re.test(String(ev(e))), String(ev(e)));
check('formatC arrondit les flottants', formatC(0.1 + 0.2) === '0.3' && formatC(42) === '42');

// --- 2. Préambule MicroPython sous l'interpréteur Unix -------------------------
const mpy = spawnSync('micropython', ['-c', 'print(1)'], { encoding: 'utf8' });
if (mpy.error || mpy.stdout.trim() !== '1') {
  console.log('\nSKIP MicroPython : interpréteur `micropython` absent (apt install micropython).');
  console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

console.log('\nPréambule MicroPython (interpréteur Unix) :');
const source = [
  'compteur = 0', // 1
  'def double(x):', // 2
  '    y = x * 2', // 3
  '    return y', // 4
  'while compteur < 30:', // 5
  '    compteur += 1', // 6
  '    double(compteur)', // 7
  "print('fin', compteur)", // 8
].join('\n');
const script = join(tmp, 'prog.py');
writeFileSync(script, instrumentPython(source));

/**
 * Lance le script instrumenté, lui envoie les points d'arrêt et reprend (\x07)
 * à chaque pause. Renvoie pauses, messages et sortie ordinaire.
 */
function jouer(bps, maj = null) {
  return new Promise((resolve) => {
    const p = spawn('micropython', [script], { stdio: ['pipe', 'pipe', 'pipe'] });
    const r = { pauses: [], logs: [], sortie: '', err: '' };
    let buf = '';
    const envoyer = (b) => p.stdin.write('\x10' + JSON.stringify(encodePyBreakpoints(b)) + '\n');
    envoyer(bps);
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const ligne = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (ligne.startsWith('\x1bKX')) {
          r.pauses.push(JSON.parse(ligne.slice(3)));
          // Nouvelle liste pendant la pause (cas du compteur conservé), puis reprise.
          if (maj && r.pauses.length === 1) envoyer(maj);
          p.stdin.write('\x07');
        } else if (ligne.startsWith('\x1bKL')) r.logs.push(JSON.parse(ligne.slice(3)));
        else r.sortie += ligne + '\n';
      }
    });
    p.stderr.on('data', (d) => (r.err += d));
    const garde = setTimeout(() => p.kill(), 15000);
    p.on('close', () => {
      clearTimeout(garde);
      resolve(r);
    });
  });
}

{
  // Condition sur une LOCALE (x) + nombre de passages : x multiple de 10 vrai à
  // x = 10, 20, 30 → « >=2 » arrête à 20 et 30.
  const r = await jouer([{ line: 3, condition: 'x % 10 == 0', hitCondition: '>=2' }]);
  const xs = r.pauses.map((s) => s.v.x).join(',');
  check(`condition sur une locale + passages « >=2 » : arrêts à x = 20, 30 (${xs})`,
    r.pauses.length === 2 && r.pauses.every((s) => s.l === 3) && xs === '20,30', r.err);
  check('le programme va au bout', /fin 30/.test(r.sortie), r.sortie + r.err);
}
{
  // Condition sur une globale, ancienne syntaxe (chaîne seule acceptée aussi).
  const r = await jouer([{ line: 6, condition: 'compteur == 17' }]);
  check(`condition sur une globale : un seul arrêt, compteur = 17 (${r.pauses.map((s) => s.v.compteur)})`,
    r.pauses.length === 1 && r.pauses[0].v.compteur === '17', r.err);
}
{
  // Point de journalisation : aucun arrêt, message interpolé (locale + globale),
  // limité aux 3 premiers passages.
  const r = await jouer([{ line: 4, logMessage: 'y={y} c={compteur} {{ok}} {nope}', hitCondition: '<=3' }]);
  const msgs = r.logs.map((l) => l.m);
  check(`journalisation sans arrêt (${r.pauses.length} arrêt(s), ${msgs.length} message(s))`,
    r.pauses.length === 0 && msgs.length === 3, r.err);
  check(`message interpolé (${JSON.stringify(msgs[0])})`,
    msgs[0] === 'y=2 c=1 {ok} <NameError: name \'nope\' isn\'t defined>' && /^y=6 c=3 /.test(msgs[2] ?? ''),
    JSON.stringify(msgs));
  check('messages hors moniteur série', !r.sortie.includes('y=2'));
  check('ligne et nature du message', r.logs.length > 0 && r.logs.every((l) => l.l === 4 && l.e === false));
}
{
  // Condition invalide : pas d'arrêt, UNE erreur signalée.
  const r = await jouer([{ line: 6, condition: 'inconnu > 2' }]);
  check(`condition invalide : aucun arrêt, une seule erreur (${r.logs.length} : ${r.logs[0]?.m})`,
    r.pauses.length === 0 && r.logs.length === 1 && r.logs[0].e === true && /inconnu/.test(r.logs[0].m), r.err);
}
{
  // Compteur conservé : la liste renvoyée pendant la pause (un autre point
  // d'arrêt ajouté) ne remet pas à zéro le compteur du premier. « 3 » arrête au
  // 3e passage (compteur = 2, l'arrêt précède `compteur += 1`) ; un compteur
  // remis à zéro arrêterait une seconde fois, à compteur = 5.
  const bp = { line: 6, hitCondition: '3' };
  const r = await jouer([bp], [bp, { line: 8, logMessage: 'fin' }]);
  const cs = r.pauses.map((s) => s.v.compteur).join(',');
  check(`compteur de passages conservé quand la liste change (${cs})`, cs === '2', r.err);
  check(`point ajouté pendant la pause actif (${r.logs.map((l) => l.m)})`, r.logs.length === 1 && r.logs[0].l === 8);
}

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
