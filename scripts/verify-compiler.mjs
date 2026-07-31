// Vérifie le service de compilation de l'extension (src/compiler.ts) en
// compilant les exemples fournis, puis en exécutant le résultat dans le moteur
// correspondant. Les tests sont sautés proprement si la toolchain n'est pas
// installée localement.
import esbuild from 'esbuild';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const { compile, detectToolchain, findArduinoCli, isSourceError, firstErrorLine, CompileFailed } =
  await import(pathToFileURL(out).href);

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
};

const tools = detectToolchain();
const b64ToBytes = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));

// testkablix/blink_uno.c est du C bare-metal : seul avr-gcc le compile
// (arduino-cli attend un sketch .ino dans un dossier de même nom).
if (tools.avrGcc) {
  console.log('Compilation de testkablix/blink_uno.c (Arduino Uno) :');
  const res = await compile('uno', join(root, 'testkablix/blink_uno.c'), root);
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
  const res = await compile('pico', join(root, 'testkablix/blink_pico.c'), root);
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

  // Référence : une SEULE invocation d'arduino-cli qui échoue.
  const cliPath = findArduinoCli();
  const refStart = Date.now();
  await new Promise((resolve) => {
    execFile(
      cliPath,
      ['compile', '--fqbn', 'arduino:avr:uno', badIno],
      { maxBuffer: 32 * 1024 * 1024 },
      () => resolve()
    );
  });
  const refMs = Date.now() - refStart;

  console.log(`\nSketch cassé compilé par compile() (référence 1 passe : ${refMs} ms) :`);
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
  // Une seule passe : les 3 jeux d'options en cascade coûtaient ~3,4× ce temps.
  check(
    `une SEULE passe de compilation (${ms} ms contre ${refMs} ms de référence)`,
    ms < refMs * 2 + 1500
  );
} else {
  console.log('\nSKIP sketch cassé : arduino-cli absent.');
}

// --- Le chemin jusqu'au moniteur série est bien branché ----------------------
const src = (p) => readFileSync(join(root, p), 'utf8');
const panel = src('src/panel.ts');
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
