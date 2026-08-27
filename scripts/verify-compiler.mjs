// Vérifie le service de compilation de l'extension (src/compiler.ts) en
// compilant les exemples fournis, puis en exécutant le résultat dans le moteur
// correspondant. Les tests sont sautés proprement si la toolchain n'est pas
// installée localement.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  portBConfig,
  PinState,
} from 'avr8js';
import { RP2040, GPIOPinState } from 'rp2040js';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-vc-'));
const out = join(tmp, 'compiler.mjs');

// Transpile le module TypeScript de l'extension pour pouvoir l'importer ici.
await esbuild.build({
  entryPoints: [join(root, 'src/compiler.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { compile, detectToolchain, isSourceError, firstErrorLine, CompileFailed } =
  await import(pathToFileURL(out).href);

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
};

const tools = detectToolchain();
const b64ToBytes = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));

/**
 * avr-gcc n'est PAS dans le PATH quand seul l'IDE Arduino est installé : la
 * toolchain vit dans le dossier des paquets (Arduino15). On la fournit à
 * compile() par `searchDir`, exactement comme le réglage « kablix.toolchainPath ».
 */
function avrToolchainDir() {
  const home = homedir();
  const roots = [
    join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Arduino15'),
    join(home, '.arduino15'),
    join(home, 'Library', 'Arduino15'),
  ];
  const exe = process.platform === 'win32' ? 'avr-gcc.exe' : 'avr-gcc';
  for (const r of roots) {
    const base = join(r, 'packages', 'arduino', 'tools', 'avr-gcc');
    if (!existsSync(base)) continue;
    for (const version of readdirSync(base)) {
      const bin = join(base, version, 'bin');
      if (existsSync(join(bin, exe))) return bin;
    }
  }
  return undefined;
}
const avrDir = avrToolchainDir();
const avrPaths = avrDir ? { searchDir: avrDir } : {};
const hasAvrGcc = tools.avrGcc || !!avrDir;

// testkablix/blink_uno.c est du C bare-metal : seul avr-gcc le compile
// (arduino-cli attend un sketch .ino dans un dossier de même nom).
if (hasAvrGcc) {
  console.log('Compilation de testkablix/blink_uno.c (Arduino Uno) :');
  const res = await compile('uno', tk('blink_uno.c'), root, avrPaths);
  const p = res.payload;
  check(`format avr-progmem, ${p.bytes.length} mots`, p.format === 'avr-progmem' && p.bytes.length > 0);
  const cpu = new CPU(Uint16Array.from(p.bytes));
  const portB = new AVRIOPort(cpu, portBConfig);
  let toggles = 0;
  let last = PinState.Input;
  portB.addListener(() => {
    const s = portB.pinState(5);
    if (s !== last) { toggles++; last = s; }
  });
  for (let i = 0; i < 4_000_000 && toggles < 4; i++) {
    avrInstruction(cpu);
    cpu.tick();
  }
  check(`exécution : D13 clignote (${toggles})`, toggles >= 2);
} else {
  console.log('SKIP Arduino Uno : avr-gcc absent (compilation bare-metal du .c).');
}

if (tools.armGcc) {
  console.log('Compilation de testkablix/blink_pico.c (Raspberry Pi Pico) :');
  const res = await compile('pico', tk('blink_pico.c'), root);
  const p = res.payload;
  const image = b64ToBytes(p.b64);
  check(`format rp2040-ram, ${image.length} octets`, p.format === 'rp2040-ram' && image.length > 0);
  const mcu = new RP2040();
  mcu.sram.set(image, 0);
  mcu.core.VTOR = 0x20000000;
  mcu.core.reset();
  let toggles = 0;
  let last = GPIOPinState.Input;
  mcu.gpio[25].addListener((state) => {
    if (state !== last) { toggles++; last = state; }
  });
  for (let i = 0; i < 2_000_000 && toggles < 4; i++) {
    mcu.step();
  }
  check(`exécution : LED GP25 clignote (${toggles})`, toggles >= 2);
} else {
  console.log('SKIP Raspberry Pi Pico : toolchain arm-none-eabi-gcc absente.');
}

// --- Erreur de compilation : le message part à l'élève, pas dans le vide ------
// Tri diagnostic gcc / problème d'option, sur des sorties réelles.
const GCC_OUT = [
  "V:\\Temp\\kx-bad\\kx-bad.ino: In function 'void loop()':",
  "V:\\Temp\\kx-bad\\kx-bad.ino:4:15: error: 'digitalWrit' was not declared in this scope",
  ' void loop() { digitalWrit(13, HIGH); }',
  'Error during build: exit status 1',
].join('\n');
const FLAG_OUT = 'Error: unknown flag: --optimize-for-debug\nUsage:\n  arduino-cli compile [flags]';

console.log("\nTri des échecs (diagnostic du compilateur / option refusée) :");
check('sortie gcc reconnue comme une erreur de CODE', isSourceError(GCC_OUT) === true);
check("option inconnue d'arduino-cli : PAS une erreur de code", isSourceError(FLAG_OUT) === false);
check(
  'bibliothèque manquante reconnue (fatal error)',
  isSourceError('sketch.ino:2:10: fatal error: Truc.h: No such file or directory') === true
);
check(
  `première erreur résumée pour la notification (${firstErrorLine(GCC_OUT)})`,
  firstErrorLine(GCC_OUT) === "kx-bad.ino:4 : 'digitalWrit' was not declared in this scope"
);
check('aucune erreur à résumer → undefined', firstErrorLine(FLAG_OUT) === undefined);

// --- Bout en bout sur un vrai sketch cassé (si arduino-cli est là) -----------
if (tools.arduinoCli) {
  const dir = join(tmp, 'kx-bad');
  mkdirSync(dir, { recursive: true });
  const badIno = join(dir, 'kx-bad.ino');
  writeFileSync(
    badIno,
    'void setup() {\n  pinMode(13, OUTPUT);\n}\nvoid loop() { digitalWrit(13, HIGH); }\n'
  );

  console.log('\nSketch cassé compilé par compile() :');
  // L'hôte de l'extension doit rester vivant PENDANT la compilation : un timer
  // qui bat prouve que la boucle d'événements n'est pas bloquée (c'était un
  // execFileSync, VS Code entier gelait le temps de la compilation).
  let ticks = 0;
  const beat = setInterval(() => ticks++, 20);
  const start = Date.now();
  let err;
  try {
    await compile('uno', badIno, root);
  } catch (e) {
    err = e;
  }
  const ms = Date.now() - start;
  clearInterval(beat);

  check('la compilation échoue (le code est faux)', err instanceof CompileFailed);
  check(
    `diagnostics COMPLETS conservés pour le moniteur série (${(err?.log ?? '').length} car.)`,
    typeof err?.log === 'string' && err.log.includes('digitalWrit') && err.log.includes('error:')
  );
  check(
    `message court pour la notification (${err?.message})`,
    /^kx-bad\.ino:\d+ : /.test(err?.message ?? '')
  );
  check(
    `l'hôte reste vivant pendant la compilation (${ticks} battements)`,
    ticks > 3
  );
  // Une seule passe : les 3 jeux d'options en cascade triplaient l'attente pour
  // aboutir au même refus. Le nombre de passes est COMPTÉ, pas déduit d'un
  // chronomètre : la même compilation varie de 9 à 53 s sur une machine chargée,
  // un seuil de temps ne prouverait rien.
  check(`une SEULE passe de compilation (${err?.attempts} — ${ms} ms)`, err?.attempts === 1);
} else {
  console.log('\nSKIP sketch cassé : arduino-cli absent.');
}

// --- Bibliothèque qui compte les CYCLES : compilée optimisée ------------------
// SoftwareSerial fabrique ses délais de bit en comptant les instructions
// exécutées. Compilée sans optimisation (le jeu d'options du pas à pas fidèle),
// ses boucles ne tombent plus juste et elle lit un octet sur six de travers : un
// numéro de badge RFID en ressort illisible. Un sketch qui l'inclut part donc
// directement sur le jeu standard — et ce repli ne doit valoir que pour LUI.
if (tools.arduinoCli) {
  const dir = join(tmp, 'kx-chrono');
  mkdirSync(dir, { recursive: true });
  const ino = join(dir, 'kx-chrono.ino');
  writeFileSync(
    ino,
    '#include <SoftwareSerial.h>\nSoftwareSerial s(2, 3);\n' +
      'void setup() { s.begin(9600); }\nvoid loop() { if (s.available()) s.read(); }\n'
  );

  console.log('\nSketch à bibliothèque chronométrée :');
  const chrono = await compile('uno', ino, root, avrPaths);
  check('compilé avec le jeu standard (-Os)', /standard \(-Os\)/.test(chrono.log));
  check(
    'la raison du repli est écrite dans le journal',
    /SoftwareSerial\.h[\s\S]*cycles/.test(chrono.log)
  );
  check('le jeu du pas à pas fidèle n’est PAS utilisé', !/-O0 -fno-lto/.test(chrono.log));

  // Le repli est PROPRE à ce sketch : mémorisé, il ferait perdre le pas à pas
  // fidèle à tous les suivants de la session. Le témoin est un sketch ORDINAIRE
  // (un .ino, donc arduino-cli : un .c simple part chez avr-gcc en direct et son
  // journal ne nomme aucune stratégie).
  const dir2 = join(tmp, 'kx-ordinaire');
  mkdirSync(dir2, { recursive: true });
  const ino2 = join(dir2, 'kx-ordinaire.ino');
  writeFileSync(
    ino2,
    'void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); }\n'
  );
  const suivant = await compile('uno', ino2, root, avrPaths);
  check(
    'le sketch suivant retrouve le pas à pas fidèle',
    /-O0 -fno-lto/.test(suivant.log)
  );
} else {
  console.log('\nSKIP bibliothèque chronométrée : arduino-cli absent.');
}

// --- Cache disque : un croquis inchangé ne se recompile pas ------------------
// Sans lui, chaque ▶ après un rechargement de fenêtre repayait la compilation
// entière (3 à 25 s selon la machine et l'antivirus).
if (hasAvrGcc) {
  const dir = join(tmp, 'kx-cache');
  mkdirSync(dir, { recursive: true });
  const srcFile = join(dir, 'blink.c');
  writeFileSync(srcFile, readFileSync(tk('blink_uno.c')));
  const cacheDir = join(tmp, 'cache-compilation');

  console.log('\nCache disque des compilations :');
  const t1 = Date.now();
  const froid = await compile('uno', srcFile, root, avrPaths, cacheDir);
  const ms1 = Date.now() - t1;
  const t2 = Date.now();
  const chaud = await compile('uno', srcFile, root, avrPaths, cacheDir);
  const ms2 = Date.now() - t2;

  check(
    `2e appel repris du cache (${ms2} ms contre ${ms1} ms à froid)`,
    /cache/i.test(chaud.log) && ms2 < Math.max(400, ms1 / 2)
  );
  check(
    `programme identique (${chaud.payload.bytes.length} mots)`,
    chaud.payload.bytes.length === froid.payload.bytes.length &&
      chaud.payload.bytes.every((w, i) => w === froid.payload.bytes[i])
  );
  check(
    'infos de débogage conservées dans le cache',
    !froid.payload.debug ||
      (chaud.payload.debug?.lines?.length === froid.payload.debug.lines.length &&
        chaud.payload.debug?.globals?.length === froid.payload.debug.globals.length)
  );
  check('une seule entrée écrite pour un source inchangé', readdirSync(cacheDir).length === 1);

  // Source modifié : le cache DOIT être ignoré, sinon l'élève exécute son
  // ancien programme sans comprendre pourquoi rien ne change.
  writeFileSync(srcFile, `${readFileSync(srcFile, 'utf8')}\n// retouche\n`);
  const apres = await compile('uno', srcFile, root, avrPaths, cacheDir);
  check('source modifié → recompilation (pas de reprise)', !/cache/i.test(apres.log));
  check('deuxième entrée rangée dans le cache', readdirSync(cacheDir).length === 2);

  // Sans dossier de cache (bancs, mesures) : la chaîne d'outils est sollicitée.
  const sansCache = await compile('uno', srcFile, root, avrPaths);
  check('sans dossier de cache : compilation réelle', !/cache/i.test(sansCache.log));
} else {
  console.log('\nSKIP cache disque : avr-gcc absent.');
}

// --- Le chemin jusqu'au moniteur série est bien branché ----------------------
const src = (p) => readFileSync(join(root, p), 'utf8');
const panel = src('src/panel.ts');
const compilerSrc = src('src/compiler.ts');

console.log('\nBranchement du cache et des relevés DWARF :');
check(
  'panel.ts passe un dossier de cache à compile()',
  /cache-compilation/.test(panel) && /compile\(board, filePath, this\.extensionUri\.fsPath, toolPaths, cacheDir\)/.test(panel)
);
check(
  'le cache vit dans le stockage global (survit au rechargement)',
  /globalStorageUri\.fsPath, 'cache-compilation'/.test(panel)
);
check(
  'les deux relevés avr-objdump partent en parallèle',
  /await Promise\.all\(\[[\s\S]{0,240}--dwarf=decodedline[\s\S]{0,240}--dwarf=info/.test(compilerSrc)
);

const sim = src('src/webview/sim.mts');
const fr = JSON.parse(src('l10n/bundle.l10n.fr.json'));

console.log("\nAcheminement de l'erreur jusqu'au moniteur série :");
check(
  "panel.ts poste les diagnostics (hostLog) sur un CompileFailed",
  /err instanceof CompileFailed/.test(panel) && /type: 'hostLog'/.test(panel)
);
check("sim.mts traite le message hostLog", /case 'hostLog':/.test(sim));
check(
  'le moniteur série se déplie pour montrer le message',
  /case 'hostLog':[\s\S]{0,400}?setSerialVisible\(true/.test(sim)
);
check(
  'le texte est bien écrit dans la console',
  /case 'hostLog':[\s\S]{0,400}?appendSerial\(/.test(sim)
);
check('titre « Compilation failed » traduit en français', !!fr['Compilation failed']);

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
