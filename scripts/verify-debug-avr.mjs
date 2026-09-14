// Vérifie l'extraction des infos de débogage AVR (src/compiler.ts) et le mode
// pas à pas / points d'arrêt / variables du moteur avr8js (avr.mts). Le test
// est sauté proprement si aucune toolchain AVR n'est installée localement.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-vd-'));

// Transpile les modules TypeScript de l'extension pour pouvoir les importer ici.
const build = async (entry, name) => {
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
};

const { compile, detectToolchain } = await build('src/compiler.ts', 'compiler.mjs');
const { AvrEngine } = await build('src/webview/engines/avr.mts', 'avr.mjs');

// Sans toolchain dans le PATH, tente celle installée par l'IDE Arduino
// (dossier data d'Arduino15) en l'ajoutant au PATH du processus.
let tools = detectToolchain();
if (!tools.arduinoCli && !tools.avrGcc) {
  const dataDirs = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Arduino15'),
    process.env.HOME && join(process.env.HOME, '.arduino15'),
    process.env.HOME && join(process.env.HOME, 'Library', 'Arduino15'),
  ].filter(Boolean);
  for (const dataDir of dataDirs) {
    const gccRoot = join(dataDir, 'packages', 'arduino', 'tools', 'avr-gcc');
    if (!existsSync(gccRoot)) continue;
    for (const version of readdirSync(gccRoot)) {
      const bin = join(gccRoot, version, 'bin');
      if (existsSync(join(bin, 'avr-gcc.exe')) || existsSync(join(bin, 'avr-gcc'))) {
        process.env.PATH = bin + delimiter + process.env.PATH;
      }
    }
  }
  tools = detectToolchain();
}

if (!tools.arduinoCli && !tools.avrGcc) {
  console.log('toolchain absente, test sauté');
  process.exit(0);
}

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
};

// Programme de test : 2 globales et une boucle qui les modifie. Deux variantes
// selon la toolchain retenue par compile() (arduino-cli prioritaire).
let srcPath;
let loopLine; // ligne du « compteur++ » (cible du point d'arrêt)
if (tools.arduinoCli) {
  const sketchDir = join(tmp, 'KxDbg');
  mkdirSync(sketchDir);
  srcPath = join(sketchDir, 'KxDbg.ino');
  writeFileSync(srcPath, [
    'int compteur;', // ligne 1
    'float seuil = 3.14;', // ligne 2
    'int notes[4] = {10, 20, 30, 40};',
    'char nom[6] = "salut";',
    'struct Point { int x; int y; };',
    'struct Point p1 = {3, 7};',
    'struct Point chemin[2];',
    'int *ptr;',
    'void setup() { pinMode(13, OUTPUT); ptr = &notes[1]; }',
    'void loop() {',
    '  digitalWrite(13, !digitalRead(13));',
    '  compteur++;', // ligne 12
    '  seuil += 0.5;',
    '  notes[0]++;',
    '  p1.x++;',
    '  chemin[1].y = 5;',
    '  delay(5);',
    '}',
  ].join('\n'));
  loopLine = 12;
} else {
  srcPath = join(tmp, 'prog.c');
  writeFileSync(srcPath, [
    '#include <avr/io.h>', // ligne 1
    '#include <util/delay.h>',
    'int compteur;',
    'float seuil = 3.14f;',
    'int notes[4] = {10, 20, 30, 40};',
    'char nom[6] = "salut";',
    'struct Point { int x; int y; };',
    'struct Point p1 = {3, 7};',
    'struct Point chemin[2];',
    'int *ptr;',
    'int main(void) {',
    '  DDRB |= (1 << 5);',
    '  ptr = &notes[1];',
    '  for (;;) {',
    '    PORTB ^= (1 << 5);',
    '    compteur++;', // ligne 16
    '    seuil += 0.5f;',
    '    notes[0]++;',
    '    p1.x++;',
    '    chemin[1].y = 5;',
    '    _delay_ms(5);',
    '  }',
    '}',
  ].join('\n'));
  loopLine = 16;
}

console.log(`Compilation de ${srcPath} (Arduino Uno, infos de débogage) :`);
const res = await compile('uno', srcPath, root);
const p = res.payload;
check(`format avr-progmem, ${p.bytes.length} mots`, p.format === 'avr-progmem' && p.bytes.length > 0);
check('payload.debug présent', !!p.debug);
const debug = p.debug ?? { lines: [], globals: [] };
check(`table des lignes non vide (${debug.lines.length} entrées)`, debug.lines.length > 0);

const compteur = debug.globals.find((g) => g.name === 'compteur');
const seuil = debug.globals.find((g) => g.name === 'seuil');
check(`globale compteur (int, 2 octets, SRAM) : ${JSON.stringify(compteur)}`,
  !!compteur && compteur.size === 2 && compteur.addr >= 0x100);
check(`globale seuil (float, 4 octets, SRAM) : ${JSON.stringify(seuil)}`,
  !!seuil && seuil.size === 4 && seuil.addr >= 0x100 && (seuil.type ?? '').includes('float'));

// --- Agrégats : tableaux, structures, pointeurs -------------------------------
// Jusqu'à la v2026.9.4.85, `resolveBaseType` rendait null pour tout ce qui
// n'était pas scalaire : un croquis à tableaux n'affichait QUE ses scalaires.
// Chaque case et chaque champ devient ici une ligne nommée comme on l'écrit en C.
console.log('Agrégats (tableaux, structures, pointeurs) :');
const byName = new Map(debug.globals.map((g) => [g.name, g]));
const nom = (n) => byName.get(n);

// Tableau : 4 cases nommées notes[0..3], contiguës et de la taille de l'élément.
const cases = [0, 1, 2, 3].map((i) => nom(`notes[${i}]`));
check(`tableau déplié case par case (notes[0..3])`, cases.every((c) => c && c.size === 2));
check(`cases contiguës et dans l'ordre (${cases.map((c) => c?.addr).join(', ')})`,
  cases.every((c, i) => i === 0 || (c && cases[i - 1] && c.addr === cases[i - 1].addr + 2)));
check('aucune ligne pour le tableau NU (notes sans indice)', !nom('notes'));

// Structure : un champ = une ligne, décalage pris dans DW_AT_data_member_location.
const px = nom('p1.x');
const py = nom('p1.y');
check(`structure dépliée champ par champ (p1.x, p1.y) : ${JSON.stringify([px, py])}`,
  !!px && !!py && px.size === 2 && py.size === 2);
check(`décalage du 2e champ = +2 (${px?.addr} → ${py?.addr})`, !!px && !!py && py.addr === px.addr + 2);
check('aucune ligne pour la structure NUE (p1 sans champ)', !nom('p1'));

// Tableau de structures : les deux niveaux se combinent (chemin[1].y).
const c1y = nom('chemin[1].y');
const c0x = nom('chemin[0].x');
check(`tableau de structures déplié (chemin[1].y) : ${JSON.stringify(c1y)}`, !!c1y && c1y.size === 2);
check(`chemin[1].y placé après chemin[0].x (+6)`, !!c0x && !!c1y && c1y.addr === c0x.addr + 6);

// Pointeur : lu sur 2 octets (AVR) et TYPÉ, ce qui commande son affichage en hexa.
const ptr = nom('ptr');
check(`pointeur lu (ptr, 2 octets, type « ${ptr?.type} »)`,
  !!ptr && ptr.size === 2 && (ptr.type ?? '').endsWith('*'));

// Chaîne : chaque caractère est une case de type char (l'affichage en 's', 'a'…
// est fait au rendu par defaultVarBase, éprouvé dans verify:debugvars).
const n0 = nom('nom[0]');
check(`chaîne dépliée en caractères (nom[0], type « ${n0?.type} »)`,
  !!n0 && n0.size === 1 && (n0.type ?? '').includes('char'));

// --- Point d'arrêt dans la boucle d'exécution --------------------------------
// Le moteur exécute sa boucle en tâches de fond (setTimeout / MessageChannel) et
// `step()` ne fait qu'ARMER un pas : il faut laisser la boucle tourner et
// attendre le `onDebugPause`, pas dérouler des frames à la main.
console.log("Point d'arrêt (boucle d'exécution) :");
const engine = new AvrEngine(Uint16Array.from(p.bytes), debug);
const states = [];
let waiting = null;
engine.onDebugPause = (s) => {
  states.push(s);
  waiting?.(s);
};

/** Attend le prochain arrêt du moteur (null au bout de `ms`). */
const nextPause = (ms = 15000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => { waiting = null; resolve(null); }, ms);
    waiting = (s) => { clearTimeout(timer); waiting = null; resolve(s); };
  });

engine.setBreakpoints([{ line: loopLine }]);
engine.start();
const bpState = await nextPause();
check(`arrêt sur la ligne ${loopLine} (ligne ${bpState?.line})`, engine.paused && bpState?.line === loopLine);

// --- Pas à pas et variables ---------------------------------------------------
console.log('Pas à pas et variables (AvrEngine) :');
// Le point d'arrêt gênerait le pas à pas (il re-déclencherait à chaque tour) :
// on le retire, on avance ligne à ligne dans le corps de loop().
engine.setBreakpoints([]);
const stepped = [];
for (let i = 0; i < 8; i++) {
  engine.step();
  const s = await nextPause();
  if (!s) break;
  stepped.push(s);
}
const visited = [...new Set(stepped.map((s) => s.line).filter((l) => l !== undefined))];
check(`le pas à pas visite plusieurs lignes (${visited.join(', ')})`, visited.length >= 2);

const last = stepped[stepped.length - 1];
const lastCompteur = last?.variables.find((v) => v.name === 'compteur');
const lastSeuil = last?.variables.find((v) => v.name === 'seuil');
check(`compteur incrémenté (${lastCompteur?.value})`, !!lastCompteur && parseInt(lastCompteur.value, 10) >= 1);
check(`seuil flottant > 3 (${lastSeuil?.value})`, !!lastSeuil && parseFloat(lastSeuil.value) > 3);

// Valeurs des agrégats : c'est ici que se prouvent les ADRESSES calculées. Une
// erreur de décalage d'un seul octet donnerait des valeurs absurdes, pas une
// panne — d'où des valeurs initiales toutes distinctes dans le programme.
const val = (n) => last?.variables.find((v) => v.name === n)?.value;
check(`notes[1..3] lus à la bonne adresse (${val('notes[1]')}, ${val('notes[2]')}, ${val('notes[3]')})`,
  val('notes[1]') === '20' && val('notes[2]') === '30' && val('notes[3]') === '40');
check(`notes[0] incrémenté depuis 10 (${val('notes[0]')})`, parseInt(val('notes[0]') ?? '0', 10) > 10);
check(`champs de structure lus séparément (p1.y = ${val('p1.y')}, inchangé)`, val('p1.y') === '7');
check(`p1.x incrémenté depuis 3 (${val('p1.x')})`, parseInt(val('p1.x') ?? '0', 10) > 3);
check(`caractères de la chaîne lus (nom[0..4] = ${[0,1,2,3,4].map((i) => val(`nom[${i}]`)).join(',')})`,
  [115, 97, 108, 117, 116].every((code, i) => val(`nom[${i}]`) === String(code))); // "salut"
// Le pointeur vaut l'adresse de notes[1], affichée en hexadécimal (une adresse
// signée s'afficherait en négatif dès la moitié haute de l'espace).
const ptrVal = val('ptr');
const notes1 = byName.get('notes[1]');
check(`pointeur affiché en hexadécimal et pointant notes[1] (${ptrVal} = ${notes1?.addr})`,
  !!ptrVal && /^0x[0-9a-f]{4}$/.test(ptrVal) && parseInt(ptrVal, 16) === notes1?.addr);

// Reprise : on doit pouvoir repartir et retomber sur le même point d'arrêt.
console.log('Reprise après le point d\'arrêt :');
engine.setBreakpoints([{ line: loopLine }]);
engine.resume();
const again = await nextPause();
check('le point d\'arrêt re-déclenche après resume()', engine.paused && again?.line === loopLine);
engine.stop();

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
