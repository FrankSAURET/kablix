// Bibliothèque Arduino manquante (« Servo.h: No such file or directory » sur
// des postes d'élèves) : Kablix doit reconnaître l'en-tête manquant, retrouver
// la bibliothèque qui le fournit et proposer de l'installer.
//
// A. Fonctions pures de src/arduinoLibs.ts (reconnaissance, classement).
// B. Vraie recherche dans l'index Arduino, si un arduino-cli est sur le poste.
// C. Câblage dans le panneau (bouton après une erreur de compilation).
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-libs-'));

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const bundle = async (src, out) => {
  const fichier = join(tmp, out);
  await esbuild.build({
    entryPoints: [join(ROOT, src)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['vscode'],
    outfile: fichier,
  });
  return import(pathToFileURL(fichier).href);
};

const libs = await bundle('src/arduinoLibs.ts', 'libs.mjs');
const { chercherArduinoCli } = await bundle('src/compiler.ts', 'compiler.mjs');

console.log('\nA. Reconnaissance de l’en-tête manquant :');
const sortieServo =
  'C:\\eleve\\servo-uno\\servo-uno.ino:1:10: fatal error: Servo.h: No such file or directory\n' +
  ' #include <Servo.h>\n          ^~~~~~~~~\ncompilation terminated.\n';
check(libs.enTeteManquant(sortieServo) === 'Servo.h', 'Servo.h reconnu', libs.enTeteManquant(sortieServo));
check(
  libs.enTeteManquant('x.ino:2:10: fatal error: Adafruit_NeoPixel.h: No such file or directory') === 'Adafruit_NeoPixel.h',
  'en-tête avec soulignés'
);
check(
  libs.enTeteManquant('x.ino:3:10: fatal error: utility/foo.hpp: No such file or directory') === 'foo.hpp',
  'chemin dans l’include : dernier segment, .hpp'
);
check(libs.enTeteManquant("x.ino:12:5: error: 'digitalWrit' was not declared") === undefined, 'erreur de code : rien');

console.log('\nB. Classement des candidats :');
const index = [
  { name: 'ESP32Servo', latest: { architectures: ['esp32'], provides_includes: ['ESP32Servo.h'] } },
  { name: 'SlowMotionServo', latest: { architectures: ['*'], provides_includes: ['SlowMotionServo.h', 'Servo.h'] } },
  { name: 'Servo', latest: { architectures: ['avr', 'sam'], types: ['Arduino'], version: '1.3.0' } },
  { name: 'ServoEasing', latest: { architectures: ['*'] } },
];
const c = libs.classerCandidats('Servo.h', index);
check(c[0]?.nom === 'Servo', 'Servo officielle en tête', JSON.stringify(c.map((x) => x.nom)));
check(!c.some((x) => x.nom === 'ESP32Servo'), 'bibliothèque non AVR écartée');
check(!c.some((x) => x.nom === 'ServoEasing'), 'nom voisin sans l’en-tête écarté');
check(libs.candidatEvident(c)?.nom === 'Servo', 'Servo installée sans faire choisir');
check(
  libs.candidatEvident(libs.classerCandidats('Servo.h', [index[1]])) === undefined,
  'simple « provides » : on fait choisir'
);
check(libs.termeDeRecherche('Adafruit_NeoPixel.h') === 'Adafruit NeoPixel', 'terme de recherche sans soulignés');
check(libs.termeDeRecherche('DHT.h') === 'DHT sensor library', 'DHT.h → DHT sensor library');
const dht = libs.classerCandidats('DHT.h', [
  { name: 'DHTlib', latest: { architectures: ['avr'], provides_includes: ['dht.h'] } },
  { name: 'DHT sensor library', latest: { architectures: ['*'] } },
]);
check(libs.candidatEvident(dht)?.nom === 'DHT sensor library', 'correspondance connue prioritaire');
check(
  libs.candidatEvident(
    libs.classerCandidats('LiquidCrystal_I2C.h', [{ name: 'LiquidCrystal I2C', latest: { architectures: ['avr'] } }])
  )?.nom === 'LiquidCrystal I2C',
  'LiquidCrystal_I2C.h → « LiquidCrystal I2C »'
);

// Bibliothèques de base (Arduino IDE 2 les pose au premier lancement, arduino-cli
// jamais) : un de leurs en-têtes installe tout le lot Arduino_BuiltIn.
check(libs.BIBLIOTHEQUES_DE_BASE === 'Arduino_BuiltIn', 'lot de base : Arduino_BuiltIn');
for (const h of ['Servo.h', 'servo.h', 'Stepper.h', 'LiquidCrystal.h', 'SD.h']) {
  check(libs.fourniParLaBase(h), `${h} fourni par le lot de base`);
}
for (const h of ['LiquidCrystal_I2C.h', 'Adafruit_NeoPixel.h', 'ESP32Servo.h', 'DHT.h']) {
  check(!libs.fourniParLaBase(h), `${h} hors du lot de base`);
}

console.log('\nC. Vraie recherche dans l’index Arduino :');
const cli = chercherArduinoCli({}).chemin;
if (!cli) {
  console.log('  (arduino-cli absent de ce poste : partie sautée)');
} else {
  try {
    for (const [h, attendu] of [
      ['Servo.h', 'Servo'],
      ['Adafruit_NeoPixel.h', 'Adafruit NeoPixel'],
      ['LiquidCrystal_I2C.h', 'LiquidCrystal I2C'],
      ['DHT.h', 'DHT sensor library'],
    ]) {
      const r = await libs.chercherBibliotheques(cli, h);
      check(libs.candidatEvident(r)?.nom === attendu, `${h} → ${attendu}`, JSON.stringify(r.slice(0, 3).map((x) => x.nom)));
    }
  } catch (err) {
    console.log(`  (index Arduino inaccessible : partie sautée — ${String(err).split('\n')[0]})`);
  }
}

console.log('\nD. Câblage dans le panneau :');
const panel = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
check(/enTeteManquant\(err\.log\)/.test(panel), 'reportError repère l’en-tête manquant');
check(/proposerBibliotheque\(/.test(panel), 'bouton « Installer la bibliothèque » proposé');
check(/installerBibliotheque\(cheminCli/.test(panel), 'installation avec le même arduino-cli');
check(/compileActiveFile\(false\)/.test(panel.slice(panel.indexOf('proposerBibliotheque('))), 'recompilation après installation');
check(/fourniParLaBase\(enTete\)[\s\S]{0,200}BIBLIOTHEQUES_DE_BASE/.test(panel), 'en-tête de base → tout le lot Arduino_BuiltIn');
check(/err instanceof CliIntrouvable[\s\S]{0,80}proposerEnvironnement\(/.test(panel), 'CLI absent → bouton « Installer l’environnement Arduino »');
check(/executeCommand\('arduino\.setupEnvironment'\)/.test(panel), 'environnement installé par l’extension sœur');
check(/installExtension', EXT_ARDUINO_IDE/.test(panel), 'extension sœur installée d’abord si absente');
check(/getCommands\(true\)\)\.includes\('arduino\.setupEnvironment'\)/.test(panel), 'attend que la commande de l’extension fraîchement installée existe');
const compilerSrc = readFileSync(join(ROOT, 'src/compiler.ts'), 'utf8');
check(/throw new CliIntrouvable\(\s*"arduino-cli est introuvable/.test(compilerSrc), 'compiler.ts : CLI absent = erreur typée');
const fr = JSON.parse(readFileSync(join(ROOT, 'l10n/bundle.l10n.fr.json'), 'utf8'));
check(fr['Install the library'] === 'Installer la bibliothèque', 'bouton traduit en français');
check(fr['Install the Arduino environment'] === 'Installer l’environnement Arduino', 'bouton environnement traduit en français');

console.log(`\n${ok} contrôles verts, ${fails.length} rouge(s).`);
console.log(fails.length ? 'RESULTAT: ECHEC' : 'RESULTAT: OK');
process.exit(fails.length ? 1 : 0);
