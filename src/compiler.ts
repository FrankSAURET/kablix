// Service de compilation (hôte de l'extension). Détecte une toolchain installée
// localement et compile le fichier actif vers une image exécutable par le
// simulateur. Fonctionne hors-ligne : aucun service distant n'est sollicité.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

export type Board = 'uno' | 'pico';

export interface CompileResult {
  board: Board;
  /** 'avr-progmem' : mots 16 bits ; 'rp2040-ram' : octets bruts pour la SRAM. */
  format: 'avr-progmem' | 'rp2040-ram';
  bytes: number[];
  log: string;
}

export interface Toolchain {
  arduinoCli: boolean;
  avrGcc: boolean;
  armGcc: boolean;
}

function has(cmd: string): boolean {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function detectToolchain(): Toolchain {
  return {
    arduinoCli: has('arduino-cli'),
    avrGcc: has('avr-gcc'),
    armGcc: has('arm-none-eabi-gcc'),
  };
}

/** Analyse un fichier Intel HEX en tableau d'octets indexé par adresse. */
function parseIntelHex(text: string): Uint8Array {
  const bytes: number[] = [];
  let maxAddr = 0;
  let base = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith(':')) continue;
    const len = parseInt(line.substr(1, 2), 16);
    const addr = parseInt(line.substr(3, 4), 16);
    const type = parseInt(line.substr(7, 2), 16);
    if (type === 0x01) break;
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

function hexToProgmem(hexText: string): number[] {
  const bytes = parseIntelHex(hexText);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    words.push((bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8));
  }
  return words;
}

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const stderr = e.stderr ? e.stderr.toString() : '';
    const stdout = e.stdout ? e.stdout.toString() : '';
    throw new Error(`${cmd} a échoué :\n${stderr || stdout || e.message}`);
  }
}

/** Compile le fichier indiqué pour la carte choisie. */
export function compile(
  board: Board,
  filePath: string,
  extensionPath: string
): CompileResult {
  const tools = detectToolchain();
  const tmp = mkdtempSync(join(tmpdir(), 'microsim-'));
  const log: string[] = [];

  if (board === 'uno') {
    if (tools.arduinoCli) {
      // Sketch Arduino complet (API Arduino disponible).
      log.push('Compilation via arduino-cli (arduino:avr:uno)…');
      run('arduino-cli', [
        'compile',
        '--fqbn', 'arduino:avr:uno',
        '--output-dir', tmp,
        filePath,
      ]);
      const hexName = `${basename(filePath)}.hex`;
      const hex = readFileSync(join(tmp, hexName), 'utf8');
      return { board, format: 'avr-progmem', bytes: hexToProgmem(hex), log: log.join('\n') };
    }
    if (tools.avrGcc) {
      // C/C++ bare-metal (avr-libc).
      log.push('Compilation via avr-gcc (ATmega328P, bare-metal avr-libc)…');
      const isCpp = ['.cpp', '.cc', '.ino'].includes(extname(filePath).toLowerCase());
      const compiler = isCpp ? 'avr-g++' : 'avr-gcc';
      const elf = join(tmp, 'out.elf');
      const hex = join(tmp, 'out.hex');
      run(compiler, [
        '-mmcu=atmega328p', '-Os', '-DF_CPU=16000000UL',
        '-o', elf, filePath,
      ]);
      run('avr-objcopy', ['-O', 'ihex', '-R', '.eeprom', elf, hex]);
      return {
        board,
        format: 'avr-progmem',
        bytes: hexToProgmem(readFileSync(hex, 'utf8')),
        log: log.join('\n'),
      };
    }
    throw new Error(
      "Aucune toolchain AVR trouvée. Installez 'arduino-cli' (recommandé) ou 'avr-gcc' (paquet gcc-avr / avr-libc)."
    );
  }

  // board === 'pico' : bare-metal exécuté en RAM (cohérent avec le moteur rp2040js).
  if (!tools.armGcc) {
    throw new Error(
      "Toolchain ARM introuvable. Installez 'arm-none-eabi-gcc' (paquet gcc-arm-none-eabi)."
    );
  }
  log.push('Compilation via arm-none-eabi-gcc (RP2040, bare-metal RAM)…');
  const isCpp = ['.cpp', '.cc'].includes(extname(filePath).toLowerCase());
  const compiler = isCpp ? 'arm-none-eabi-g++' : 'arm-none-eabi-gcc';
  const ld = join(extensionPath, 'firmware', 'pico', 'rp2040_ram.ld');
  const elf = join(tmp, 'out.elf');
  const bin = join(tmp, 'out.bin');
  run(compiler, [
    '-mcpu=cortex-m0plus', '-mthumb', '-Os', '-ffreestanding',
    '-nostdlib', '-nostartfiles', '-Wl,--build-id=none',
    '-T', ld, '-o', elf, filePath,
  ]);
  run('arm-none-eabi-objcopy', ['-O', 'binary', elf, bin]);
  return {
    board,
    format: 'rp2040-ram',
    bytes: Array.from(new Uint8Array(readFileSync(bin))),
    log: log.join('\n'),
  };
}
