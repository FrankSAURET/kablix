// Service de compilation et de chargement d'artefacts (hôte de l'extension).
// Détecte une toolchain installée localement et compile le fichier actif vers
// une image exécutable par le simulateur, ou charge directement un artefact
// déjà compilé (.hex, .uf2, .elf, .bin). Fonctionne hors-ligne : aucun service
// distant n'est sollicité.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { parseUf2 } from './shared/uf2';
import { parseElf32 } from './shared/elf';

export type Board = 'uno' | 'pico';

const FLASH_START = 0x10000000;
const FLASH_END = 0x14000000;
const RAM_START = 0x20000000;

/**
 * Programme prêt à être envoyé à la webview. Les images RP2040 transitent en
 * base64 (les firmwares UF2 dépassent le mégaoctet, le JSON de nombres serait
 * prohibitif).
 */
export type ProgramPayload =
  | { board: 'uno'; format: 'avr-progmem'; bytes: number[] }
  | { board: 'pico'; format: 'rp2040-ram'; b64: string }
  | {
      board: 'pico';
      format: 'rp2040-flash';
      segments: Array<{ addr: number; b64: string }>;
      /** Script MicroPython à exécuter après le démarrage du firmware. */
      script?: string;
    };

export interface CompileResult {
  payload: ProgramPayload;
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

const toB64 = (data: Uint8Array): string => Buffer.from(data).toString('base64');

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

// --- Chargement d'artefacts déjà compilés -----------------------------------

/**
 * Charge un artefact compilé d'après son extension :
 *   .hex → Arduino Uno ; .uf2 → flash RP2040 ; .elf → flash ou RAM RP2040
 *   selon les adresses de chargement ; .bin → image RAM RP2040.
 */
export function loadArtifact(filePath: string): CompileResult {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath);

  if (ext === '.hex') {
    return {
      payload: { board: 'uno', format: 'avr-progmem', bytes: hexToProgmem(readFileSync(filePath, 'utf8')) },
      log: `Artefact Intel HEX chargé : ${name}`,
    };
  }
  if (ext === '.uf2') {
    const segments = parseUf2(new Uint8Array(readFileSync(filePath)));
    return {
      payload: {
        board: 'pico',
        format: 'rp2040-flash',
        segments: segments.map((s) => ({ addr: s.addr, b64: toB64(s.data) })),
      },
      log: `Artefact UF2 chargé : ${name} (${segments.length} segment(s))`,
    };
  }
  if (ext === '.elf') {
    const image = parseElf32(new Uint8Array(readFileSync(filePath)));
    const inFlash = image.segments.some((s) => s.paddr >= FLASH_START && s.paddr < FLASH_END);
    if (inFlash) {
      return {
        payload: {
          board: 'pico',
          format: 'rp2040-flash',
          segments: image.segments
            .filter((s) => s.paddr >= FLASH_START && s.paddr < FLASH_END)
            .map((s) => ({ addr: s.paddr, b64: toB64(s.data) })),
        },
        log: `Artefact ELF (flash) chargé : ${name}`,
      };
    }
    // Image RAM : reconstitue un bloc unique à partir de 0x20000000.
    const ramSegs = image.segments.filter((s) => s.paddr >= RAM_START);
    if (ramSegs.length === 0) throw new Error(`${name} : aucun segment en flash ni en RAM.`);
    const end = Math.max(...ramSegs.map((s) => s.paddr + s.data.length));
    const image8 = new Uint8Array(end - RAM_START);
    for (const s of ramSegs) image8.set(s.data, s.paddr - RAM_START);
    return {
      payload: { board: 'pico', format: 'rp2040-ram', b64: toB64(image8) },
      log: `Artefact ELF (RAM) chargé : ${name}`,
    };
  }
  if (ext === '.bin') {
    return {
      payload: { board: 'pico', format: 'rp2040-ram', b64: toB64(new Uint8Array(readFileSync(filePath))) },
      log: `Image binaire RAM chargée : ${name}`,
    };
  }
  throw new Error(`Extension non reconnue : ${ext} (.hex, .uf2, .elf ou .bin attendus).`);
}

/**
 * Prépare l'exécution d'un script MicroPython : firmware UF2 + code source.
 * Le script est injecté via le raw REPL une fois le firmware démarré.
 */
export function loadPythonProgram(firmwareUf2Path: string, scriptSource: string): CompileResult {
  const segments = parseUf2(new Uint8Array(readFileSync(firmwareUf2Path)));
  return {
    payload: {
      board: 'pico',
      format: 'rp2040-flash',
      segments: segments.map((s) => ({ addr: s.addr, b64: toB64(s.data) })),
      script: scriptSource,
    },
    log: `Firmware MicroPython : ${basename(firmwareUf2Path)}`,
  };
}

// --- Compilation ------------------------------------------------------------

/** Compile le fichier indiqué pour la carte choisie. */
export function compile(board: Board, filePath: string, extensionPath: string): CompileResult {
  const tools = detectToolchain();
  const tmp = mkdtempSync(join(tmpdir(), 'kablix-'));
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
      return {
        payload: { board, format: 'avr-progmem', bytes: hexToProgmem(hex) },
        log: log.join('\n'),
      };
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
        payload: { board, format: 'avr-progmem', bytes: hexToProgmem(readFileSync(hex, 'utf8')) },
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
    payload: { board, format: 'rp2040-ram', b64: toB64(new Uint8Array(readFileSync(bin))) },
    log: log.join('\n'),
  };
}
