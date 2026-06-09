// Compile les firmwares de démo (AVR + RP2040) et génère les modules de
// programme embarqués dans la webview :
//   - src/webview/programs/uno-demo.mjs   (Uint16Array : mémoire programme AVR)
//   - src/webview/programs/pico-blink.mjs (Uint8Array  : image RAM RP2040)
//
// Nécessite avr-gcc / avr-objcopy et arm-none-eabi-gcc / arm-none-eabi-objcopy.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'microsim-fw-'));

/** Analyse un fichier Intel HEX et renvoie un tableau d'octets (mémoire programme). */
function parseIntelHex(text) {
  const bytes = [];
  let maxAddr = 0;
  let base = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith(':')) continue;
    const len = parseInt(line.substr(1, 2), 16);
    const addr = parseInt(line.substr(3, 4), 16);
    const type = parseInt(line.substr(7, 2), 16);
    if (type === 0x01) break; // EOF
    if (type === 0x02) {
      base = parseInt(line.substr(9, 4), 16) << 4;
      continue;
    }
    if (type === 0x04) {
      base = parseInt(line.substr(9, 4), 16) << 16;
      continue;
    }
    if (type !== 0x00) continue;
    for (let i = 0; i < len; i++) {
      const b = parseInt(line.substr(9 + i * 2, 2), 16);
      const a = base + addr + i;
      bytes[a] = b;
      if (a + 1 > maxAddr) maxAddr = a + 1;
    }
  }
  const out = new Uint8Array(maxAddr);
  for (let i = 0; i < maxAddr; i++) out[i] = bytes[i] ?? 0;
  return out;
}

function emitModule(file, name, type, data) {
  const items = Array.from(data).map((v) => '0x' + v.toString(16).padStart(type === 'Uint16Array' ? 4 : 2, '0'));
  const lines = [];
  for (let i = 0; i < items.length; i += 12) {
    lines.push('  ' + items.slice(i, i + 12).join(', ') + ',');
  }
  const banner =
    '// Généré automatiquement par scripts/build-firmware.mjs — NE PAS ÉDITER À LA MAIN.\n';
  writeFileSync(
    file,
    `${banner}export const ${name} = new ${type}([\n${lines.join('\n')}\n]);\n`
  );
  console.log(`  → ${file} (${data.length} octets)`);
}

console.log('Compilation AVR (ATmega328P)…');
const avrElf = join(tmp, 'demo.elf');
const avrHex = join(tmp, 'demo.hex');
execFileSync('avr-gcc', [
  '-mmcu=atmega328p',
  '-Os',
  '-DF_CPU=16000000UL',
  '-o', avrElf,
  join(root, 'firmware/avr/demo.c'),
]);
execFileSync('avr-objcopy', ['-O', 'ihex', '-R', '.eeprom', avrElf, avrHex]);
const avrBytes = parseIntelHex(readFileSync(avrHex, 'utf8'));
// Mémoire programme AVR = mots 16 bits little-endian.
const words = new Uint16Array(Math.ceil(avrBytes.length / 2));
for (let i = 0; i < words.length; i++) {
  words[i] = (avrBytes[i * 2] ?? 0) | ((avrBytes[i * 2 + 1] ?? 0) << 8);
}
emitModule(
  join(root, 'src/webview/programs/uno-demo.mjs'),
  'UNO_DEMO',
  'Uint16Array',
  words
);

console.log('Compilation RP2040 (Raspberry Pi Pico)…');
const picoElf = join(tmp, 'blink.elf');
const picoBin = join(tmp, 'blink.bin');
execFileSync('arm-none-eabi-gcc', [
  '-mcpu=cortex-m0plus',
  '-mthumb',
  '-Os',
  '-ffreestanding',
  '-nostdlib',
  '-nostartfiles',
  '-Wl,--build-id=none',
  '-T', join(root, 'firmware/pico/rp2040_ram.ld'),
  '-o', picoElf,
  join(root, 'firmware/pico/blink.c'),
]);
execFileSync('arm-none-eabi-objcopy', ['-O', 'binary', picoElf, picoBin]);
const picoBytes = new Uint8Array(readFileSync(picoBin));
emitModule(
  join(root, 'src/webview/programs/pico-blink.mjs'),
  'PICO_BLINK',
  'Uint8Array',
  picoBytes
);

console.log('Firmwares générés avec succès.');
