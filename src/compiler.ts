// Service de compilation et de chargement d'artefacts (hôte de l'extension).
// Détecte une toolchain installée localement et compile le fichier actif vers
// une image exécutable par le simulateur, ou charge directement un artefact
// déjà compilé (.hex, .uf2, .elf, .bin). Fonctionne hors-ligne : aucun service
// distant n'est sollicité.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { parseUf2 } from './shared/uf2';
import { parseElf32 } from './shared/elf';
import { instrumentPython } from './shared/pydebug';

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
  | { board: 'uno'; format: 'avr-progmem'; bytes: number[]; debug?: AvrDebugInfo }
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
  // Instrumente le script pour le pas à pas (préambule __kx + un appel par
  // ligne) ; en cas d'échec, on retombe sur le script original tel quel.
  let script = scriptSource;
  try {
    script = instrumentPython(scriptSource);
  } catch {
    script = scriptSource;
  }
  return {
    payload: {
      board: 'pico',
      format: 'rp2040-flash',
      segments: segments.map((s) => ({ addr: s.addr, b64: toB64(s.data) })),
      script,
    },
    log: `Firmware MicroPython : ${basename(firmwareUf2Path)}`,
  };
}

// --- Infos de débogage AVR (DWARF via avr-objdump) ---------------------------

/**
 * Infos de débogage extraites de l'ELF compilé. Forme identique à
 * `AvrDebugInfo` de src/webview/engines/types.mts, redéclarée ici : le module
 * webview (.mts) ne doit pas être importé côté hôte de l'extension.
 */
export interface AvrDebugInfo {
  /** Table adresse flash (en octets) → ligne du fichier source de l'élève. */
  lines: Array<{ addr: number; line: number; file?: string }>;
  /** Globales : adresse espace données AVR (biais ELF 0x800000 retiré). */
  globals: Array<{ name: string; addr: number; size: number; type?: string }>;
}

const AVR_DATA_BIAS = 0x800000; // biais ELF de l'espace données AVR
const AVR_SRAM_START = 0x100; // début de la SRAM dans l'espace données
const AVR_SRAM_END = 0x900; // fin de la SRAM ATmega328P (0x8FF inclus)

/** Localise avr-objdump : PATH d'abord, sinon toolchain gérée par arduino-cli. */
function findAvrObjdump(): string | null {
  if (has('avr-objdump')) return 'avr-objdump';
  try {
    const cfg = JSON.parse(run('arduino-cli', ['config', 'dump', '--format', 'json']));
    const data: string | undefined = cfg?.directories?.data ?? cfg?.config?.directories?.data;
    if (!data) return null;
    const gccRoot = join(data, 'packages', 'arduino', 'tools', 'avr-gcc');
    for (const version of readdirSync(gccRoot)) {
      for (const exe of ['avr-objdump.exe', 'avr-objdump']) {
        const candidate = join(gccRoot, version, 'bin', exe);
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // arduino-cli absent ou arborescence inattendue : pas de débogage, sans erreur.
  }
  return null;
}

/** Vrai si `file` désigne le fichier de l'élève (un .ino devient sketch.ino.cpp). */
function isStudentFile(file: string, srcBase: string, srcStem: string): boolean {
  const base = basename(file.replace(/\\/g, '/')).toLowerCase();
  return base === srcBase || base.startsWith(`${srcStem}.`);
}

/** Parse `avr-objdump --dwarf=decodedline` : table adresse flash → ligne source. */
function parseDecodedLines(text: string, srcPath: string): AvrDebugInfo['lines'] {
  const srcBase = basename(srcPath).toLowerCase();
  const srcStem = srcBase.replace(/\.[^.]+$/, '');
  const out: AvrDebugInfo['lines'] = [];
  for (const raw of text.split(/\r?\n/)) {
    // Format : "prog.c    12    0xa6" (en-têtes et lignes « CU: » ignorés).
    const m = /^(\S+)\s+(\d+)\s+0x([0-9a-fA-F]+)/.exec(raw.trim());
    if (!m || !isStudentFile(m[1], srcBase, srcStem)) continue;
    out.push({ addr: parseInt(m[3], 16), line: parseInt(m[2], 10) });
  }
  out.sort((a, b) => a.addr - b.addr || a.line - b.line);
  return out;
}

interface DwarfDie {
  tag: string;
  attrs: Map<string, string>;
}

/** Valeur d'attribut DWARF : retire le préfixe « (indirect string, …): ». */
function attrValue(raw: string): string {
  const m = /^\(indirect string[^)]*\):\s*(.*)$/.exec(raw);
  return (m ? m[1] : raw).trim();
}

/**
 * Suit la chaîne typedef/const/volatile jusqu'au DW_TAG_base_type.
 * Retourne null pour les pointeurs/tableaux/structs (ignorés dans cette v1).
 */
function resolveBaseType(
  dies: Map<number, DwarfDie>,
  ref: number
): { name?: string; size?: number } | null {
  let alias: string | undefined; // premier nom de typedef rencontré (uint8_t…)
  for (let i = 0; i < 8; i++) {
    const die = dies.get(ref);
    if (!die) return null;
    if (die.tag === 'DW_TAG_base_type') {
      const nameRaw = die.attrs.get('DW_AT_name');
      const sizeRaw = die.attrs.get('DW_AT_byte_size');
      return {
        name: alias ?? (nameRaw ? attrValue(nameRaw) : undefined),
        size: sizeRaw ? parseInt(sizeRaw, 10) : undefined,
      };
    }
    if (!['DW_TAG_typedef', 'DW_TAG_const_type', 'DW_TAG_volatile_type'].includes(die.tag)) {
      return null;
    }
    if (die.tag === 'DW_TAG_typedef' && !alias && die.attrs.has('DW_AT_name')) {
      alias = attrValue(die.attrs.get('DW_AT_name')!);
    }
    const next = /<0x([0-9a-fA-F]+)>/.exec(die.attrs.get('DW_AT_type') ?? '');
    if (!next) return null;
    ref = parseInt(next[1], 16);
  }
  return null;
}

/** Parse `avr-objdump --dwarf=info` : globales de l'unité de compilation de l'élève. */
function parseDwarfGlobals(text: string, srcPath: string): AvrDebugInfo['globals'] {
  const srcBase = basename(srcPath).toLowerCase();
  const srcStem = srcBase.replace(/\.[^.]+$/, '');
  const dies = new Map<number, DwarfDie>(); // tous les DIE, par offset de section
  const candidates: DwarfDie[] = []; // DW_TAG_variable du fichier de l'élève
  let current: DwarfDie | null = null;
  let cuMatches = false;
  for (const raw of text.split(/\r?\n/)) {
    // En-tête de DIE : " <1><66b>: Abbrev Number: 5 (DW_TAG_variable)".
    const head = /^\s*<\d+><([0-9a-fA-F]+)>: Abbrev Number: \d+(?: \((DW_TAG_\w+)\))?/.exec(raw);
    if (head) {
      current = head[2] ? { tag: head[2], attrs: new Map() } : null;
      if (current) {
        dies.set(parseInt(head[1], 16), current);
        if (current.tag === 'DW_TAG_compile_unit') cuMatches = false; // tranché par DW_AT_name
        else if (current.tag === 'DW_TAG_variable' && cuMatches) candidates.push(current);
      }
      continue;
    }
    // Attribut : "    <670>   DW_AT_type        : <0x636>".
    const attr = /^\s*<[0-9a-fA-F]+>\s+(DW_AT_\w+)\s*:\s*(.*)$/.exec(raw);
    if (attr && current) {
      current.attrs.set(attr[1], attr[2]);
      if (current.tag === 'DW_TAG_compile_unit' && attr[1] === 'DW_AT_name') {
        cuMatches = isStudentFile(attrValue(attr[2]), srcBase, srcStem);
      }
    }
  }

  const globals: AvrDebugInfo['globals'] = [];
  const seen = new Set<string>();
  for (const die of candidates) {
    const nameRaw = die.attrs.get('DW_AT_name');
    const loc = /DW_OP_addr:?\s*([0-9a-fA-F]+)/.exec(die.attrs.get('DW_AT_location') ?? '');
    const typeRef = /<0x([0-9a-fA-F]+)>/.exec(die.attrs.get('DW_AT_type') ?? '');
    if (!nameRaw || !loc || !typeRef) continue;
    const name = attrValue(nameRaw);
    if (!name || name.startsWith('__') || seen.has(name)) continue;
    // Adresse fixe en SRAM uniquement (exclut registres/IO, EEPROM et flash).
    const addr = parseInt(loc[1], 16) - AVR_DATA_BIAS;
    if (addr < AVR_SRAM_START) continue;
    const type = resolveBaseType(dies, parseInt(typeRef[1], 16));
    if (!type || !type.size || ![1, 2, 4].includes(type.size)) continue;
    if (addr + type.size > AVR_SRAM_END) continue;
    seen.add(name);
    globals.push({ name, addr, size: type.size, type: type.name });
  }
  globals.sort((a, b) => a.name.localeCompare(b.name));
  return globals;
}

/**
 * Extrait table des lignes et globales de l'ELF via avr-objdump. Toute
 * défaillance est non bloquante : la compilation aboutit sans infos de débogage.
 */
function extractAvrDebug(elfPath: string, srcPath: string, log: string[]): AvrDebugInfo | undefined {
  try {
    if (!existsSync(elfPath)) return undefined;
    const objdump = findAvrObjdump();
    if (!objdump) {
      log.push('avr-objdump introuvable : pas à pas et variables indisponibles.');
      return undefined;
    }
    const lines = parseDecodedLines(run(objdump, ['--dwarf=decodedline', elfPath]), srcPath);
    const globals = parseDwarfGlobals(run(objdump, ['--dwarf=info', elfPath]), srcPath);
    if (lines.length === 0 && globals.length === 0) return undefined;
    log.push(`Infos de débogage : ${lines.length} point(s) de ligne, ${globals.length} globale(s).`);
    return { lines, globals };
  } catch (err) {
    log.push(`Infos de débogage indisponibles : ${(err as Error).message}`);
    return undefined;
  }
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
      // L'ELF (compilé avec -g par la plateforme AVR) livre les infos de débogage.
      const debug = extractAvrDebug(join(tmp, `${basename(filePath)}.elf`), filePath, log);
      return {
        payload: { board, format: 'avr-progmem', bytes: hexToProgmem(hex), debug },
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
        '-mmcu=atmega328p', '-Os', '-g', '-DF_CPU=16000000UL',
        '-o', elf, filePath,
      ]);
      run('avr-objcopy', ['-O', 'ihex', '-R', '.eeprom', elf, hex]);
      const debug = extractAvrDebug(elf, filePath, log);
      return {
        payload: { board, format: 'avr-progmem', bytes: hexToProgmem(readFileSync(hex, 'utf8')), debug },
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
