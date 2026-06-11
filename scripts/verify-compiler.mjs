// Vérifie le service de compilation de l'extension (src/compiler.ts) en
// compilant les exemples fournis, puis en exécutant le résultat dans le moteur
// correspondant. Les tests sont sautés proprement si la toolchain n'est pas
// installée localement.
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
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
const { compile, detectToolchain } = await import(pathToFileURL(out).href);

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
};

const tools = detectToolchain();
const b64ToBytes = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));

if (tools.arduinoCli || tools.avrGcc) {
  console.log('Compilation de examples/blink_uno.c (Arduino Uno) :');
  const res = compile('uno', join(root, 'examples/blink_uno.c'), root);
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
  console.log('SKIP Arduino Uno : aucune toolchain AVR (arduino-cli / avr-gcc).');
}

if (tools.armGcc) {
  console.log('Compilation de examples/blink_pico.c (Raspberry Pi Pico) :');
  const res = compile('pico', join(root, 'examples/blink_pico.c'), root);
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

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
