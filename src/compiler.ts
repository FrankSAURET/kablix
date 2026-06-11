// Service de compilation (hôte de l'extension). Détecte une toolchain installée
// localement et compile le fichier actif vers une image exécutable par le
// simulateur. Fonctionne hors-ligne : aucun service distant n'est sollicité.
//
// Phase C : charge directement les .hex / .uf2 produits par une toolchain
// externe (arduino-cli, pico-vscode/cmake, arduino-vscode-ide).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

export type Board = 'uno' | 'pico';

export interface CompileResult {
  board: Board;
  /** 'avr-progmem': mots 16 bits. 'rp2040-ram': octets SRAM. 'rp2040-flash': octets flash. */
  format: 'avr-progmem' | 'rp2040-ram' | 'rp2040-flash';
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

// ---------------------------------------------------------------------------
// Parseurs de formats binaires
// ---------------------------------------------------------------------------

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
    if (type === 0x02) { base = parseInt(line.substr(9, 4), 16) << 4; continue; }
    if (type === 0x04) { base = parseInt(line.substr(9, 4), 16) << 16; continue; }
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

const UF2_MAGIC1 = 0x0a324655;
const UF2_MAGIC2 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16f30;
const FLASH_BASE = 0x10000000;

/**
 * Convertit un fichier UF2 (RP2040) en image binaire pour le flash.
 * Retourne un Uint8Array commençant à l'adresse flash de base (0x10000000).
 */
export function uf2ToFlash(buffer: Buffer): Uint8Array {
  const blocks: Array<{ addr: number; data: Uint8Array }> = [];
  let minAddr = 0x7fffffff;
  let maxAddr = 0;

  for (let off = 0; off + 512 <= buffer.length; off += 512) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + off, 512);
    if (view.getUint32(0, true) !== UF2_MAGIC1) continue;
    if (view.getUint32(4, true) !== UF2_MAGIC2) continue;
    if (view.getUint32(508, true) !== UF2_MAGIC_END) continue;
    const targetAddr = view.getUint32(12, true);
    const payloadSize = view.getUint32(16, true);
    if (payloadSize === 0 || payloadSize > 476) continue;
    blocks.push({
      addr: targetAddr,
      data: new Uint8Array(buffer.buffer, buffer.byteOffset + off + 32, payloadSize),
    });
    minAddr = Math.min(minAddr, targetAddr);
    maxAddr = Math.max(maxAddr, targetAddr + payloadSize);
  }

  if (blocks.length === 0) throw new Error('Fichier UF2 invalide ou vide.');
  if (minAddr < FLASH_BASE) {
    throw new Error(`Adresse flash inattendue : 0x${minAddr.toString(16)} (attendu ≥ 0x10000000).`);
  }

  const out = new Uint8Array(maxAddr - FLASH_BASE);
  for (const { addr, data } of blocks) {
    out.set(data, addr - FLASH_BASE);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Détection d'artefacts compilés (Phase C)
// ---------------------------------------------------------------------------

/** Cherche le fichier .hex le plus récent produit par une toolchain AVR dans workspace. */
export function findWorkspaceHex(workspaceRoot: string): string | null {
  // Priorité 1 : chemin de sortie dans .vscode/arduino.json
  const arduinoJsonPath = join(workspaceRoot, '.vscode', 'arduino.json');
  if (existsSync(arduinoJsonPath)) {
    try {
      const cfg = JSON.parse(readFileSync(arduinoJsonPath, 'utf8')) as Record<string, unknown>;
      const outputDir = typeof cfg['output'] === 'string' ? cfg['output'] : null;
      if (outputDir) {
        const dir = outputDir.startsWith('/') ? outputDir : join(workspaceRoot, outputDir);
        const hex = findNewestFile(dir, '.hex');
        if (hex) return hex;
      }
    } catch { /* ignore */ }
  }
  // Priorité 2 : parcours des sous-répertoires courants
  return findNewestFile(workspaceRoot, '.hex', 2);
}

/** Cherche le fichier .uf2 le plus récent produit par cmake/pico-sdk dans workspace. */
export function findWorkspacePicoOutput(workspaceRoot: string): string | null {
  // Priorité 1 : dossier build/ standard de pico-vscode / cmake
  const buildDir = join(workspaceRoot, 'build');
  const uf2 = findNewestFile(buildDir, '.uf2');
  if (uf2) return uf2;
  // Priorité 2 : parcours récursif léger
  return findNewestFile(workspaceRoot, '.uf2', 2);
}

/** Cherche le fichier .uf2 du firmware MicroPython dans le workspace. */
export function findMicroPythonFirmware(workspaceRoot: string): string | null {
  return findNewestFile(workspaceRoot, '.uf2', 1, /micropython/i) ??
         findNewestFile(workspaceRoot, '.uf2', 2, /micropython/i);
}

function findNewestFile(
  dir: string,
  ext: string,
  depth = 1,
  nameFilter?: RegExp
): string | null {
  if (!existsSync(dir)) return null;
  let best: { path: string; mtime: number } | null = null;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(ext)) {
        if (nameFilter && !nameFilter.test(entry.name)) continue;
        const mtime = statSync(full).mtimeMs;
        if (!best || mtime > best.mtime) best = { path: full, mtime };
      } else if (entry.isDirectory() && depth > 1) {
        const sub = findNewestFile(full, ext, depth - 1, nameFilter);
        if (sub) {
          const mtime = statSync(sub).mtimeMs;
          if (!best || mtime > best.mtime) best = { path: sub, mtime };
        }
      }
    }
  } catch { /* ignore permission errors */ }
  return best?.path ?? null;
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

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

/** Compile ou charge le fichier indiqué pour la carte choisie. */
export function compile(
  board: Board,
  filePath: string,
  extensionPath: string,
  workspaceRoot?: string
): CompileResult {
  const ext = extname(filePath).toLowerCase();

  // --- Chargement direct d'un artefact déjà compilé ---
  if (ext === '.hex' && board === 'uno') {
    const hexText = readFileSync(filePath, 'utf8');
    return { board, format: 'avr-progmem', bytes: hexToProgmem(hexText), log: `HEX chargé : ${filePath}` };
  }

  if (ext === '.uf2' && board === 'pico') {
    const flash = uf2ToFlash(readFileSync(filePath));
    return { board, format: 'rp2040-flash', bytes: Array.from(flash), log: `UF2 chargé : ${filePath}` };
  }

  if (ext === '.elf' && board === 'pico') {
    const tools = detectToolchain();
    if (!tools.armGcc) throw new Error("arm-none-eabi-objcopy introuvable.");
    const tmp = mkdtempSync(join(tmpdir(), 'microsim-'));
    const bin = join(tmp, 'out.bin');
    run('arm-none-eabi-objcopy', ['-O', 'binary', filePath, bin]);
    return {
      board,
      format: 'rp2040-ram',
      bytes: Array.from(new Uint8Array(readFileSync(bin))),
      log: `ELF → binaire RAM : ${filePath}`,
    };
  }

  if (ext === '.py' && board === 'pico') {
    // Phase D : détection du firmware MicroPython dans le workspace
    const ws = workspaceRoot ?? extensionPath;
    const fw = findMicroPythonFirmware(ws);
    if (!fw) {
      throw new Error(
        'MicroPython : aucun firmware micropython*.uf2 trouvé dans le workspace.\n' +
        'Téléchargez le firmware depuis https://micropython.org/download/RPI_PICO/ ' +
        'et placez-le dans le dossier du projet.'
      );
    }
    const flash = uf2ToFlash(readFileSync(fw));
    return {
      board,
      format: 'rp2040-flash',
      bytes: Array.from(flash),
      log: `MicroPython firmware chargé : ${fw}\n` +
           `(Pour injecter votre script, la prise en charge LittleFS est en cours de développement.)`,
    };
  }

  // --- Compilation depuis les sources ---
  const tools = detectToolchain();
  const tmp = mkdtempSync(join(tmpdir(), 'microsim-'));
  const log: string[] = [];

  if (board === 'uno') {
    if (tools.arduinoCli) {
      log.push('Compilation via arduino-cli (arduino:avr:uno)…');
      run('arduino-cli', ['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', tmp, filePath]);
      const hexName = `${basename(filePath)}.hex`;
      const hex = readFileSync(join(tmp, hexName), 'utf8');
      return { board, format: 'avr-progmem', bytes: hexToProgmem(hex), log: log.join('\n') };
    }
    if (tools.avrGcc) {
      log.push('Compilation via avr-gcc (ATmega328P, bare-metal avr-libc)…');
      const isCpp = ['.cpp', '.cc', '.ino'].includes(ext);
      const compiler = isCpp ? 'avr-g++' : 'avr-gcc';
      const elf = join(tmp, 'out.elf');
      const hex = join(tmp, 'out.hex');
      run(compiler, ['-mmcu=atmega328p', '-Os', '-DF_CPU=16000000UL', '-o', elf, filePath]);
      run('avr-objcopy', ['-O', 'ihex', '-R', '.eeprom', elf, hex]);
      return { board, format: 'avr-progmem', bytes: hexToProgmem(readFileSync(hex, 'utf8')), log: log.join('\n') };
    }
    throw new Error("Aucune toolchain AVR trouvée. Installez 'arduino-cli' (recommandé) ou 'avr-gcc'.");
  }

  // board === 'pico'
  if (!tools.armGcc) {
    throw new Error("Toolchain ARM introuvable. Installez 'arm-none-eabi-gcc'.");
  }
  log.push('Compilation via arm-none-eabi-gcc (RP2040, bare-metal RAM)…');
  const isCpp = ['.cpp', '.cc'].includes(ext);
  const compiler = isCpp ? 'arm-none-eabi-g++' : 'arm-none-eabi-gcc';
  const ld = join(extensionPath, 'firmware', 'pico', 'rp2040_ram.ld');
  const elf = join(tmp, 'out.elf');
  const bin = join(tmp, 'out.bin');
  run(compiler, ['-mcpu=cortex-m0plus', '-mthumb', '-Os', '-ffreestanding',
    '-nostdlib', '-nostartfiles', '-Wl,--build-id=none', '-T', ld, '-o', elf, filePath]);
  run('arm-none-eabi-objcopy', ['-O', 'binary', elf, bin]);
  return { board, format: 'rp2040-ram', bytes: Array.from(new Uint8Array(readFileSync(bin))), log: log.join('\n') };
}
