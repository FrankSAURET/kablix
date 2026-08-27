// Service de compilation et de chargement d'artefacts (hôte de l'extension).
// Détecte une toolchain installée localement et compile le fichier actif vers
// une image exécutable par le simulateur, ou charge directement un artefact
// déjà compilé (.hex, .uf2, .elf, .bin). Fonctionne hors-ligne : aucun service
// distant n'est sollicité.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { parseUf2 } from './shared/uf2';
import { parseElf32 } from './shared/elf';
import { instrumentPython } from './shared/pydebug';
import { NET_PREAMBLE } from './shared/pynet';

export type Board = 'uno' | 'nano' | 'mega' | 'pico' | 'picow' | 'pico2' | 'pico2w';

/** Vrai pour une carte de la famille AVR (Arduino : Uno / Nano / Mega). */
function isAvrBoard(board: Board): boolean {
  return board === 'uno' || board === 'nano' || board === 'mega';
}

/** Cible de compilation AVR (FQBN arduino-cli + MCU avr-gcc) d'une carte. */
function avrTarget(board: Board): { fqbn: string; mmcu: string } {
  // Mega : ATmega2560. Toutes les autres cartes AVR sont des ATmega328P @16 MHz
  // (Uno / Nano / Pro Mini produisent le même code machine pour le simulateur).
  return board === 'mega'
    ? { fqbn: 'arduino:avr:mega', mmcu: 'atmega2560' }
    : { fqbn: 'arduino:avr:uno', mmcu: 'atmega328p' };
}

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
      /** Script MicroPython à exécuter après le démarrage du firmware (version rapide, non instrumentée). */
      script?: string;
      /** Même script instrumenté pour le pas à pas, injecté à la place du précédent dès qu'on débogue. */
      scriptDebug?: string;
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

/** Chemins fournis par l'utilisateur (réglages) pour localiser la toolchain. */
export interface ToolPaths {
  /** Chemin complet de arduino-cli, ou dossier le contenant. */
  arduinoCli?: string;
  /** Dossier supplémentaire fouillé pour toutes les commandes (toolchain portable). */
  searchDir?: string;
}

/** Vrai si le chemin existe ET désigne un fichier (jamais un dossier). */
function isFileSync(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Localise un exécutable dans le PATH, comme `which`/`where`. Sous Windows,
 * essaie les extensions de PATHEXT (.EXE…) — `execFileSync('arduino-cli')` sans
 * extension échoue sinon, d'où le « arduino-cli introuvable » alors qu'il est
 * installé. Accepte aussi un chemin déjà complet (avec séparateur).
 */
function whichSync(cmd: string): string | null {
  const isWin = process.platform === 'win32';
  const exts = isWin
    ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)]
    : [''];
  const tryBase = (base: string): string | null => {
    for (const ext of exts) {
      // isFileSync : un DOSSIER homonyme (ex. un répertoire « arduino-cli »
      // dans le PATH) ne doit jamais être pris pour l'exécutable.
      if (isFileSync(base + ext)) return base + ext;
    }
    return null;
  };
  if (cmd.includes('/') || cmd.includes('\\')) return tryBase(cmd);
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const found = tryBase(join(dir, cmd));
    if (found) return found;
  }
  return null;
}

/** Emplacements d'installation usuels de arduino-cli sous Windows (hors PATH). */
function windowsToolCandidates(cmd: string): string[] {
  if (process.platform !== 'win32' || cmd !== 'arduino-cli') return [];
  const env = process.env;
  const ideRel = ['resources', 'app', 'lib', 'backend', 'resources'];
  const bases = [
    env.ProgramFiles && join(env.ProgramFiles, 'Arduino IDE', ...ideRel),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'Arduino IDE', ...ideRel),
    env.USERPROFILE && join(env.USERPROFILE, 'scoop', 'shims'),
    'C:\\ProgramData\\chocolatey\\bin',
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),
    env.USERPROFILE && join(env.USERPROFILE, '.arduino-cli', 'bin'),
  ].filter((b): b is string => !!b);
  return bases.map((b) => join(b, 'arduino-cli.exe'));
}

/**
 * Résout une commande en chemin exécutable : réglage explicite, puis dossier de
 * toolchain fourni, puis PATH, puis emplacements usuels. Renvoie null si absent.
 */
function resolveTool(cmd: string, opts: { override?: string; searchDir?: string } = {}): string | null {
  const { override, searchDir } = opts;
  if (override && override.trim()) {
    const o = override.trim();
    // isFileSync (et non existsSync) : si le réglage pointe un DOSSIER, on ne le
    // renvoie pas comme exécutable — on cherche l'exécutable À L'INTÉRIEUR
    // (cas « kablix.arduinoCliPath = C:\outils\arduino-cli\ »).
    if (isFileSync(o)) return o; // chemin direct vers l'exécutable
    const byName = whichSync(o); // nom de commande
    if (byName) return byName;
    const inDir = whichSync(join(o, cmd)); // dossier contenant l'exécutable
    if (inDir) return inDir;
  }
  if (searchDir) {
    const inSearch = whichSync(join(searchDir, cmd));
    if (inSearch) return inSearch;
  }
  const onPath = whichSync(cmd);
  if (onPath) return onPath;
  for (const candidate of windowsToolCandidates(cmd)) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Chemin retenu pour arduino-cli (null si introuvable) — utile aux bancs de test. */
export function findArduinoCli(paths: ToolPaths = {}): string | null {
  return resolveTool('arduino-cli', { override: paths.arduinoCli, searchDir: paths.searchDir });
}

export function detectToolchain(paths: ToolPaths = {}): Toolchain {
  return {
    arduinoCli: resolveTool('arduino-cli', { override: paths.arduinoCli, searchDir: paths.searchDir }) !== null,
    avrGcc: resolveTool('avr-gcc', { searchDir: paths.searchDir }) !== null,
    armGcc: resolveTool('arm-none-eabi-gcc', { searchDir: paths.searchDir }) !== null,
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

const execFileAsync = promisify(execFile);

// Le vidage DWARF d'un gros sketch dépasse allègrement le méga-octet par défaut
// de Node : trop court, la lecture échouait en ENOBUFS et les infos de débogage
// disparaissaient sans explication.
const MAX_TOOL_OUTPUT = 64 * 1024 * 1024;

/** Échec d'un outil externe : le message est court, `output` porte tout ce qu'il a dit. */
export class ToolError extends Error {
  constructor(
    message: string,
    /** Sortie brute de l'outil (stderr puis stdout) : diagnostics du compilateur. */
    readonly output: string
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

/**
 * Échec de compilation du code de l'élève. `log` porte les diagnostics COMPLETS
 * du compilateur : l'appelant les déverse dans le moniteur série (sans eux,
 * l'élève ne voyait qu'un « échec de la compilation » sans la moindre piste).
 */
export class CompileFailed extends Error {
  constructor(
    message: string,
    readonly log: string,
    /** Jeux d'options réellement essayés : 1 quand le refus vient du CODE. */
    readonly attempts = 1
  ) {
    super(message);
    this.name = 'CompileFailed';
  }
}

/**
 * Lance un outil externe SANS bloquer l'hôte de l'extension. C'était un
 * `execFileSync` : pendant les 3 à 6 secondes d'un `arduino-cli compile`, VS Code
 * entier était figé — la barre de progression elle-même ne tournait pas, d'où
 * l'impression d'une compilation interminable.
 */
async function run(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      encoding: 'utf8',
      maxBuffer: MAX_TOOL_OUTPUT,
    });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const stderr = e.stderr ? e.stderr.toString() : '';
    const stdout = e.stdout ? e.stdout.toString() : '';
    const output = [stderr, stdout].filter((s) => s.trim()).join('\n');
    throw new ToolError(`${cmd} a échoué :\n${output || e.message}`, output || (e.message ?? ''));
  }
}

// Diagnostic gcc/avr-gcc : « fichier.ino:12:5: error: … » (ou « fatal error » pour
// une bibliothèque introuvable). Sa présence prouve que le compilateur a bien
// tourné et que c'est le CODE qu'il refuse.
const DIAG_LINE = /^(.*?):(\d+):(?:(\d+):)?\s*(?:fatal error|error):\s*(.*)$/;

/** Vrai si la sortie contient un diagnostic du compilateur (le code est en cause). */
export function isSourceError(output: string): boolean {
  return output.split(/\r?\n/).some((l) => DIAG_LINE.test(l));
}

/**
 * Première erreur réelle, mise en forme courte pour la notification :
 * « blink.ino:12 : 'digitalWrit' was not declared in this scope ».
 */
export function firstErrorLine(output: string): string | undefined {
  for (const raw of output.split(/\r?\n/)) {
    const m = DIAG_LINE.exec(raw);
    if (m) return `${basename(m[1].trim())}:${m[2]} : ${m[4].trim()}`;
  }
  return undefined;
}

/**
 * Comme `run`, mais pour un COMPILATEUR : un refus accompagné de diagnostics
 * devient un `CompileFailed` — l'appelant sait alors qu'il tient un message
 * destiné à l'élève et le déverse dans le moniteur série.
 */
async function runSource(cmd: string, args: string[]): Promise<string> {
  try {
    return await run(cmd, args);
  } catch (err) {
    if (err instanceof ToolError && isSourceError(err.output)) {
      throw new CompileFailed(firstErrorLine(err.output) ?? 'Échec de la compilation.', err.output);
    }
    throw err;
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

/** Un module utilisateur à rendre importable sur le Pico simulé. */
export interface PyLibModule {
  /** Nom d'import (ex. « lcd_api », « pico_i2c_lcd », « pkg.sub »). */
  name: string;
  data: Uint8Array;
  /** Chemin absolu du fichier source. */
  file: string;
  /** Chemin relatif au dossier du script principal (`lib/pkg/sub.py`). */
  rel: string;
}

// Taille totale max des librairies injectées (garde-fou : l'injection passe par
// le raw REPL, octet par octet — inutile d'y déverser des Mo).
const MAX_LIB_BYTES = 512 * 1024;

/** Nom de module d'import à partir d'un chemin relatif (`lib/pkg/sub.py` → `pkg.sub`). */
function moduleNameOf(rel: string): string {
  return rel
    .replace(/\\/g, '/')
    .replace(/^lib\//, '') // /lib est dans sys.path : modules de premier niveau
    .replace(/\.py$/i, '')
    .replace(/\/__init__$/, '') // paquet : dossier → nom du paquet
    .replace(/\//g, '.');
}

/**
 * Rustine du module `machine` pour le Pico SIMULÉ. Elle couvre deux sujets.
 *
 * **I²C** — deux problèmes de l'émulation I²C de rp2040js :
 *   1. `I2C.scan()` de MicroPython sonde chaque adresse par une écriture de
 *      longueur nulle → non menée à terme → figement ;
 *   2. toute transaction vers une adresse ABSENTE (NAK) se fige aussi.
 *
 * **LED embarquée du Pico W** — sur une vraie carte, `Pin("LED")` ne pilote PAS
 * un GPIO du RP2040 : la LED est câblée sur la puce Wi-Fi CYW43439, que
 * rp2040js n'émule pas. Le firmware imprime alors `[CYW43] Failed to start
 * CYW43` à CHAQUE écriture — sans lever d'exception, donc le `try/except` que
 * tout le monde écrit autour ne bascule jamais sur le repli GP25 et la LED
 * reste figée. Kablix simule la LED du Pico W sur GP25 (comme le Pico
 * classique) : `Pin("LED")` y est donc redirigé, et le pilote Wi-Fi n'est plus
 * sollicité du tout.
 *
 * On ne peut ni sous-classer `machine.I2C` ni réassigner un attribut du module
 * natif `machine` (lecture seule). On REMPLACE donc le module entier dans
 * `sys.modules` (comme le pont réseau pour `network`/`urequests`) : un module de
 * substitution délègue tout au vrai `machine` via `__getattr__`, sauf `I2C`/
 * `SoftI2C`/`Pin` qu'il enveloppe. Le wrapper I²C délègue `writeto`/`readfrom`…
 * au vrai objet (adresses présentes = OK) mais `scan()` NE SONDE PAS : il
 * renvoie les adresses connues de Kablix (injectées à la place de
 * `_KX_I2C_ADDRS = None` par le moteur, cf. pico.mts). Sans effet hors
 * simulation ; défensif (si ça échoue, rien n'est altéré et on retombe sur le
 * `machine` d'origine).
 */
const I2C_SCAN_SHIM = `_KX_I2C_ADDRS = None
try:
    import sys as _kx_sys, machine as _kx_rm
    def _kx_mk(_base):
        class _KxI2C:
            def __init__(self, *a, **k):
                self._kx = _base(*a, **k)
            def scan(self):
                return list(_KX_I2C_ADDRS) if _KX_I2C_ADDRS is not None else []
            def __getattr__(self, _n):
                if _n == "_kx":
                    raise AttributeError(_n)
                return getattr(self._kx, _n)
        return _KxI2C
    # Fabrique de Pin : un OBJET (et non une classe), pour que Pin.OUT et les
    # autres constantes restent celles du vrai module via __getattr__.
    class _KxPin:
        def __call__(self, _id, *a, **k):
            if _id == "LED" or _id == "WL_GPIO0":
                _id = 25   # LED embarquée : GP25 en simulation, y compris Pico W
            return _kx_rm.Pin(_id, *a, **k)
        def __getattr__(self, _n):
            return getattr(_kx_rm.Pin, _n)
    class _KxMachineMod:
        def __getattr__(self, _n):
            return getattr(_kx_rm, _n)
    _kx_mod = _KxMachineMod()
    _kx_mod.I2C = _kx_mk(_kx_rm.I2C)
    if hasattr(_kx_rm, "SoftI2C"):
        _kx_mod.SoftI2C = _kx_mk(_kx_rm.SoftI2C)
    _kx_mod.Pin = _KxPin()
    _kx_sys.modules["machine"] = _kx_mod
except Exception:
    pass
`;

/**
 * Extrait les noms de modules importés d'une source Python : `import a, b.c` et
 * `from x.y import z` → `a`, `b.c`, `x.y`. Heuristique par ligne (ignore les
 * `import` en commentaire/chaîne dans la plupart des cas ; un faux positif est
 * sans effet s'il ne correspond à aucun module local). Les imports relatifs
 * (`from . import ...`) sont ignorés (dépouillés de leurs points de tête).
 */
function parsePyImports(source: string): string[] {
  const names = new Set<string>();
  const re = /^[ \t]*(?:import[ \t]+(.+)|from[ \t]+(\.*[\w.]+)[ \t]+import\b)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[2]) {
      const mod = m[2].replace(/^\.+/, ''); // ignore le préfixe relatif
      if (mod) names.add(mod);
    } else if (m[1]) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/[ \t]+as[ \t]+/)[0].trim();
        if (name && /^[\w.]+$/.test(name)) names.add(name);
      }
    }
  }
  return [...names];
}

/**
 * Rassemble les modules utilisateur à rendre importables : UNIQUEMENT ceux que
 * le script principal importe (transitivement), résolus parmi les `.py` voisins
 * et ceux d'un sous-dossier `lib/`. On n'exécute JAMAIS les autres programmes du
 * dossier (ils seraient lancés à tort). Les modules retenus sont ensuite injectés
 * dans `sys.modules` (le Pico simulé n'a pas de système de fichiers accessible).
 */
export function collectPythonLibs(scriptPath: string, mainSource: string): PyLibModule[] {
  const dir = dirname(scriptPath);
  const main = basename(scriptPath);
  // 1) Indexe les modules locaux candidats (nom d'import → fichier), sans les lire.
  const index = new Map<string, { full: string; rel: string }>(); // nom de module → fichier
  const indexFile = (full: string, rel: string): void => {
    const name = moduleNameOf(rel);
    if (!index.has(name)) index.set(name, { full, rel: rel.replace(/\\/g, '/') });
  };
  const walk = (abs: string, rel: string): void => {
    for (const name of readdirSync(abs)) {
      const full = join(abs, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, `${rel}${name}/`);
      else if (extname(name).toLowerCase() === '.py') indexFile(full, `${rel}${name}`);
    }
  };
  try {
    for (const name of readdirSync(dir)) {
      if (name === main || extname(name).toLowerCase() !== '.py') continue;
      const full = join(dir, name);
      if (statSync(full).isFile()) indexFile(full, name);
    }
    const libDir = join(dir, 'lib');
    if (existsSync(libDir) && statSync(libDir).isDirectory()) walk(libDir, 'lib/');
  } catch {
    return []; // dossier illisible : on n'injecte rien
  }
  // 2) Parcours en largeur depuis les imports du script : ne retient que les
  //    modules locaux réellement importés (+ dépendances + paquets parents).
  const needed = new Set<string>();
  const out: PyLibModule[] = [];
  const queue = parsePyImports(mainSource);
  let total = 0;
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (needed.has(name)) continue;
    const entry = index.get(name);
    if (!entry) continue; // module standard / externe / inexistant : ignoré
    needed.add(name);
    let data: Uint8Array;
    try {
      data = new Uint8Array(readFileSync(entry.full));
    } catch {
      continue;
    }
    total += data.length;
    if (total > MAX_LIB_BYTES) break;
    out.push({ name, data, file: entry.full, rel: entry.rel });
    for (const dep of parsePyImports(new TextDecoder().decode(data))) queue.push(dep);
    const dot = name.lastIndexOf('.');
    if (dot > 0) queue.push(name.slice(0, dot)); // paquet parent (a.b → a)
  }
  return out;
}

/**
 * Préambule Python qui rend les modules utilisateur importables SANS système de
 * fichiers : chaque source (base64 → `ubinascii`) est exécutée dans son propre
 * espace de noms, puis l'objet module est déposé dans `sys.modules`. L'ordre des
 * dépendances est résolu par réessais (un module qui `import` un autre pas encore
 * prêt est reporté au tour suivant). Chaîne vide s'il n'y a aucune librairie.
 */
function pythonLibPreamble(libs: PyLibModule[]): string {
  if (libs.length === 0) return '';
  const entries = libs
    .map((l) => `    ${JSON.stringify(l.name)}: ${JSON.stringify(Buffer.from(l.data).toString('base64'))},`)
    .join('\n');
  return `import sys
try:
    import ubinascii as _kx_b
except ImportError:
    import binascii as _kx_b
def _kx_reg(_n, _s):
    _d = {}
    exec(_kx_b.a2b_base64(_s).decode(), _d)
    try:
        _m = type(sys)(_n)
    except Exception:
        _m = type(_n, (), {})()
    for _k in _d:
        if not _k.startswith("__"):
            try:
                setattr(_m, _k, _d[_k])
            except Exception:
                pass
    sys.modules[_n] = _m
_kx_src = {
${entries}
}
_kx_left = list(_kx_src)
_kx_err = None
while _kx_left:
    _kx_rest = []
    _kx_prog = False
    for _kx_n in _kx_left:
        try:
            _kx_reg(_kx_n, _kx_src[_kx_n])
            _kx_prog = True
        except Exception as _kx_e:
            _kx_err = _kx_e
            _kx_rest.append(_kx_n)
    if not _kx_prog:
        raise _kx_err
    _kx_left = _kx_rest
`;
}

/**
 * Prépare l'exécution d'un script MicroPython : firmware UF2 + code source.
 * Le script est injecté via le raw REPL une fois le firmware démarré. Si
 * `scriptPath` est fourni, les modules `.py` voisins et le dossier `lib/` sont
 * rendus importables (injectés dans `sys.modules` par un préambule) pour que les
 * `import` fonctionnent — le Pico simulé n'ayant pas de système de fichiers.
 */
export function loadPythonProgram(
  firmwareUf2Path: string,
  scriptSource: string,
  enableNetwork = false,
  scriptPath?: string
): CompileResult {
  const segments = parseUf2(new Uint8Array(readFileSync(firmwareUf2Path)));
  // Modules utilisateur injectés dans sys.modules AVANT tout le reste (le script
  // les importe ensuite comme sur une vraie carte, sans système de fichiers).
  // Seuls les modules RÉELLEMENT importés sont retenus (pas les autres .py du dossier).
  const libs = scriptPath ? collectPythonLibs(scriptPath, scriptSource) : [];
  const preamble = pythonLibPreamble(libs);
  // Préambules communs aux deux variantes. Ils viennent APRÈS l'instrumentation
  // (qui numérote les lignes du source de l'élève) : les numéros restent ceux du
  // fichier ouvert dans l'éditeur, quel que soit le nombre de lignes ajoutées.
  const withPreambles = (body: string): string => {
    // Pico W : pont réseau (faux network/urequests tunnelés vers l'hôte) avant
    // tout, pour patcher sys.modules avant les import du script.
    let s = enableNetwork ? NET_PREAMBLE + '\n' + body : body;
    if (preamble) s = preamble + s;
    // Rustine du scan I²C (évite le figement sur `bus.scan()` en simulation) — en
    // tout premier, avant l'import de `machine` par le script/les modules.
    return I2C_SCAN_SHIM + s;
  };
  // Deux variantes du même programme (cf. PicoEngine) : le script BRUT tourne à
  // pleine vitesse (l'instrumentation coûte ~25 % de régime, mesuré v2026.8.11),
  // et la variante instrumentée pour le pas à pas ne prend le relais que si un
  // point d'arrêt est posé. En cas d'échec de l'instrumentation, les deux sont
  // identiques : le débogage sera sans effet, mais le programme tournera.
  let instrumented = scriptSource;
  try {
    instrumented = instrumentPython(scriptSource);
  } catch {
    instrumented = scriptSource;
  }
  return {
    payload: {
      board: 'pico',
      format: 'rp2040-flash',
      segments: segments.map((s) => ({ addr: s.addr, b64: toB64(s.data) })),
      script: withPreambles(scriptSource),
      scriptDebug: withPreambles(instrumented),
    },
    log:
      `Firmware MicroPython : ${basename(firmwareUf2Path)}` +
      (libs.length ? ` (+ ${libs.length} module(s) : ${libs.map((l) => l.name).join(', ')})` : ''),
  };
}

/**
 * Prépare le firmware MicroPython seul, sans script à injecter : une fois
 * démarré, `PicoEngine` laisse le raw REPL de côté (`onCdcConnected` sans
 * script n'envoie que CR/LF) et le moniteur série devient un vrai REPL
 * interactif MicroPython.
 */
export function loadMicropythonRepl(firmwareUf2Path: string): CompileResult {
  const segments = parseUf2(new Uint8Array(readFileSync(firmwareUf2Path)));
  return {
    payload: {
      board: 'pico',
      format: 'rp2040-flash',
      segments: segments.map((s) => ({ addr: s.addr, b64: toB64(s.data) })),
      script: undefined,
    },
    log: `Firmware MicroPython : ${basename(firmwareUf2Path)} (REPL interactif)`,
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
async function findAvrObjdump(arduinoCli: string | null, searchDir?: string): Promise<string | null> {
  const direct = resolveTool('avr-objdump', { searchDir });
  if (direct) return direct;
  if (!arduinoCli) return null;
  try {
    const cfg = JSON.parse(await run(arduinoCli, ['config', 'dump', '--format', 'json']));
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
async function extractAvrDebug(
  elfPath: string,
  srcPath: string,
  log: string[],
  arduinoCli: string | null,
  searchDir?: string
): Promise<AvrDebugInfo | undefined> {
  try {
    if (!existsSync(elfPath)) return undefined;
    const objdump = await findAvrObjdump(arduinoCli, searchDir);
    if (!objdump) {
      log.push('avr-objdump introuvable : pas à pas et variables indisponibles.');
      return undefined;
    }
    // Les deux relevés DWARF sont indépendants : les lancer EN PARALLÈLE divise
    // l'attente par deux (mesuré : 5,1 s → 2,7 s sur un croquis moyen, l'essentiel
    // du coût étant le démarrage de l'outil, inspecté par l'antivirus).
    const [decoded, info] = await Promise.all([
      run(objdump, ['--dwarf=decodedline', elfPath]),
      run(objdump, ['--dwarf=info', elfPath]),
    ]);
    const lines = parseDecodedLines(decoded, srcPath);
    const globals = parseDwarfGlobals(info, srcPath);
    if (lines.length === 0 && globals.length === 0) return undefined;
    log.push(`Infos de débogage : ${lines.length} point(s) de ligne, ${globals.length} globale(s).`);
    return { lines, globals };
  } catch (err) {
    log.push(`Infos de débogage indisponibles : ${(err as Error).message}`);
    return undefined;
  }
}

// --- Cache disque des compilations ------------------------------------------

/**
 * Compiler un croquis coûte de 3 à 25 s selon la machine (l'antivirus inspecte
 * chaque lancement d'outil, et il y en a des dizaines). Recompiler un croquis
 * INCHANGÉ est du temps perdu : le résultat est conservé sur disque, indexé par
 * le CONTENU des sources. Le mémo en mémoire du panneau (chemin + date de
 * modification) ne survit pas au rechargement de la fenêtre ; ce cache-ci, si.
 */
const CACHE_FORMAT = 1;
/** Nombre d'entrées gardées ; au-delà, les plus anciennes sont recyclées. */
const CACHE_MAX_ENTRIES = 60;
const CACHE_MAX_SOURCES = 300;
const CACHE_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const CACHE_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const SOURCE_EXTS = ['.ino', '.pde', '.h', '.hpp', '.hh', '.c', '.cpp', '.cc', '.cxx', '.s'];

interface CacheSlot {
  dir: string;
  file: string;
  hit?: CompileResult;
}

/**
 * Sources dont dépend la compilation : le dossier du croquis (comme
 * arduino-cli, sans descendre) plus son sous-dossier `src` s'il existe. Renvoie
 * null si l'arborescence est trop grosse : mieux vaut recompiler que hacher des
 * mégaoctets à chaque clic.
 */
function collectSources(filePath: string): string[] | null {
  const files: string[] = [];
  let total = 0;
  const scan = (dir: string, deep: boolean): boolean => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (deep && !scan(full, true)) return false;
        continue;
      }
      if (!SOURCE_EXTS.includes(extname(e.name).toLowerCase())) continue;
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        return false;
      }
      files.push(full);
      total += size;
      if (files.length > CACHE_MAX_SOURCES || total > CACHE_MAX_SOURCE_BYTES) return false;
    }
    return true;
  };
  const dir = dirname(filePath);
  if (!scan(dir, false)) return null;
  const src = join(dir, 'src');
  if (existsSync(src) && !scan(src, true)) return null;
  if (!files.includes(filePath)) files.push(filePath);
  files.sort();
  return files;
}

/** Version de l'extension : un nouveau Kablix ne doit pas resservir d'anciens résultats. */
const extensionVersions = new Map<string, string>();
function extensionVersion(extensionPath: string): string {
  const memo = extensionVersions.get(extensionPath);
  if (memo !== undefined) return memo;
  let version = '?';
  try {
    version = String(JSON.parse(readFileSync(join(extensionPath, 'package.json'), 'utf8')).version ?? '?');
  } catch {
    /* hors extension (bancs) : la clé reste valable, elle n'est juste pas versionnée */
  }
  extensionVersions.set(extensionPath, version);
  return version;
}

/** Prépare l'emplacement de cache d'une compilation et relit l'entrée existante. */
function cacheSlot(
  cacheDir: string,
  board: Board,
  filePath: string,
  extensionPath: string
): CacheSlot | undefined {
  const sources = collectSources(filePath);
  if (!sources) return undefined;
  const h = createHash('sha1');
  h.update(`${CACHE_FORMAT} ${board} ${filePath} ${extensionVersion(extensionPath)}`);
  for (const f of sources) {
    try {
      h.update(` ${f} `);
      h.update(new Uint8Array(readFileSync(f)));
    } catch {
      return undefined; // source illisible : on ne peut rien garantir, donc pas de cache
    }
  }
  const slot: CacheSlot = { dir: cacheDir, file: join(cacheDir, `${h.digest('hex')}.json`) };
  try {
    const entry = JSON.parse(readFileSync(slot.file, 'utf8'));
    if (entry?.format === CACHE_FORMAT && entry.payload) {
      slot.hit = { payload: entry.payload as ProgramPayload, log: String(entry.log ?? '') };
    }
  } catch {
    /* entrée absente ou illisible : on recompile */
  }
  return slot;
}

/**
 * Range le résultat. Les entrées sont des fichiers créés par Kablix dans son
 * propre dossier de cache : les plus anciennes sont recyclées pour que le
 * dossier ne grossisse pas indéfiniment.
 */
function cacheStore(slot: CacheSlot, res: CompileResult): void {
  try {
    const body = JSON.stringify({ format: CACHE_FORMAT, payload: res.payload, log: res.log });
    if (body.length > CACHE_MAX_ENTRY_BYTES) return;
    mkdirSync(slot.dir, { recursive: true });
    writeFileSync(slot.file, body);
    const entries = readdirSync(slot.dir)
      .filter((n) => n.endsWith('.json'))
      .map((n) => join(slot.dir, n));
    if (entries.length <= CACHE_MAX_ENTRIES) return;
    const dated = entries
      .map((f) => ({ f, t: statSync(f).mtimeMs }))
      .sort((a, b) => a.t - b.t);
    for (const { f } of dated.slice(0, dated.length - CACHE_MAX_ENTRIES)) rmSync(f, { force: true });
  } catch {
    /* cache indisponible (disque plein, droits) : la compilation reste valable */
  }
}

// --- Compilation ------------------------------------------------------------

/**
 * Stratégie de compilation qui a marché la dernière fois, mémorisée pour la
 * session. Sans elle, une chaîne qui refuse la 1re option la repayait à CHAQUE
 * lancement — et, pire, alternait les options d'un essai à l'autre, ce qui
 * invalide le cache de build d'arduino-cli et impose une reconstruction
 * complète à chaque fois (mesuré : 5,5 s au lieu de 3,4 s sur le même sketch).
 */
let avrStrategyMemo = 0;

/**
 * Bibliothèques dont les délais se comptent en CYCLES D'HORLOGE : elles fabriquent
 * des attentes de quelques microsecondes en comptant les instructions exécutées.
 * Compilées SANS optimisation, ces boucles ne tombent plus juste et la
 * bibliothèque lit de travers — mesuré sur SoftwareSerial à 9600 bauds : un bit
 * perdu tous les six, un numéro de badge RFID illisible. Un sketch qui en inclut
 * une se compile donc comme dans l'IDE Arduino (-Os). La liste s'allonge quand un
 * nouveau cas est MESURÉ, jamais par précaution.
 */
const LIBS_CHRONOMETREES = ['SoftwareSerial.h', 'SendOnlySoftwareSerial.h'];

/**
 * Nom de la première bibliothèque chronométrée incluse par le sketch (ou par un
 * fichier voisin du même dossier), sinon null.
 */
function libChronometree(filePath: string): string | null {
  const dir = dirname(filePath);
  let sources: string[];
  try {
    sources = readdirSync(dir).filter((f) => SOURCE_EXTS.includes(extname(f).toLowerCase()));
  } catch {
    sources = [basename(filePath)];
  }
  for (const f of sources) {
    let texte: string;
    try {
      texte = readFileSync(join(dir, f), 'utf8');
    } catch {
      continue;
    }
    for (const lib of LIBS_CHRONOMETREES) {
      const motif = new RegExp(`^\\s*#\\s*include\\s*[<"]\\s*${lib.replace('.', '\\.')}`, 'im');
      if (motif.test(texte)) return lib;
    }
  }
  return null;
}

/**
 * Compile le fichier indiqué pour la carte choisie. `cacheDir` active le cache
 * disque : un croquis dont AUCUNE source n'a bougé n'est pas recompilé. Sans ce
 * dossier (bancs de vérification), la chaîne d'outils est toujours sollicitée.
 */
export async function compile(
  board: Board,
  filePath: string,
  extensionPath: string,
  toolPaths: ToolPaths = {},
  cacheDir?: string
): Promise<CompileResult> {
  const slot = cacheDir ? cacheSlot(cacheDir, board, filePath, extensionPath) : undefined;
  if (slot?.hit) {
    return { payload: slot.hit.payload, log: `${slot.hit.log}\nSources inchangées : programme repris du cache.`.trim() };
  }
  const res = await compileFresh(board, filePath, extensionPath, toolPaths);
  if (slot) cacheStore(slot, res);
  return res;
}

/** Compilation réelle, sans cache. */
async function compileFresh(
  board: Board,
  filePath: string,
  extensionPath: string,
  toolPaths: ToolPaths
): Promise<CompileResult> {
  const searchDir = toolPaths.searchDir;
  const tmp = mkdtempSync(join(tmpdir(), 'kablix-'));
  const log: string[] = [];

  if (isAvrBoard(board)) {
    const ext = extname(filePath).toLowerCase();
    const { fqbn, mmcu } = avrTarget(board);
    const arduinoCli = resolveTool('arduino-cli', { override: toolPaths.arduinoCli, searchDir });

    // Sketch Arduino complet (API Arduino) via arduino-cli. Un .c/.cpp « nu »
    // n'est PAS un sketch valide pour arduino-cli (il lui faut un .ino dans un
    // dossier de même nom) : ces fichiers passent par avr-gcc en bare-metal.
    const withArduinoCli = async (cli: string): Promise<CompileResult> => {
      const compileWith = (extra: string[]): Promise<string> =>
        run(cli, ['compile', '--fqbn', fqbn, ...extra, '--output-dir', tmp, filePath]);
      // Stratégies de compilation, de la plus fidèle au débogage à la plus sûre.
      // On retombe sur la suivante si une échoue → la compilation n'est JAMAIS
      // cassée par les options de débogage.
      //   1) -O0 -fno-lto à la COMPILATION uniquement : aucune optimisation ni
      //      LTO sur le code de l'élève → pas à pas fidèle, variables globales
      //      lisibles. Le lien garde -flto (il accepte les objets non-LTO).
      //   2) --optimize-for-debug : le cœur AVR passe en -Og (bon compromis).
      //   3) standard : -Os (peut sauter des lignes / masquer des variables).
      const attempts: Array<{ extra: string[]; note: string }> = [
        {
          extra: [
            '--build-property', 'compiler.c.extra_flags=-O0 -fno-lto -g3',
            '--build-property', 'compiler.cpp.extra_flags=-O0 -fno-lto -g3',
          ],
          note: '-O0 -fno-lto (débogage fidèle)',
        },
        { extra: ['--optimize-for-debug'], note: '--optimize-for-debug (-Og)' },
        { extra: [], note: 'standard (-Os)' },
      ];
      // Une bibliothèque qui compte les CYCLES ne supporte pas `-O0` : ce
      // sketch-là part directement du jeu standard (-Os), quitte à perdre en
      // fidélité de pas à pas — sans quoi la bibliothèque lit de travers.
      const chrono = libChronometree(filePath);
      if (chrono) {
        log.push(
          `${chrono} compte ses délais en cycles d'horloge : compilation optimisée (-Os). ` +
            'Le pas à pas y sera moins fidèle, mais les délais tombent juste.'
        );
      }
      // La stratégie retenue la dernière fois passe en tête (cache de build chaud).
      const order = (chrono ? [attempts.length - 1, ...attempts.keys()] : [avrStrategyMemo, ...attempts.keys()]).filter(
        (i, k, all) => i < attempts.length && all.indexOf(i) === k
      );
      let compiled = false;
      let lastOutput = '';
      let tried = 0;
      for (const i of order) {
        const a = attempts[i];
        tried++;
        try {
          await compileWith(a.extra);
          log.push(`Compilation arduino-cli (${fqbn}) : ${a.note}.`);
          // Le repli forcé d'un sketch chronométré ne vaut que pour LUI : le
          // mémoriser ferait perdre le pas à pas fidèle à tous les suivants.
          if (!chrono) avrStrategyMemo = i;
          compiled = true;
          break;
        } catch (err) {
          lastOutput = err instanceof ToolError ? err.output : (err as Error).message;
          log.push(`Échec compilation (${a.note}) : ${firstErrorLine(lastOutput) ?? lastOutput.split('\n')[0]}`);
          // Le compilateur a parlé : c'est le CODE qui est faux, pas l'option.
          // Réessayer les autres jeux d'options ne ferait que tripler l'attente
          // pour aboutir au même refus (mesuré : 4,6 s au lieu de 1,4 s) — et
          // brouillerait le diagnostic affiché.
          if (isSourceError(lastOutput)) break;
        }
      }
      if (!compiled) {
        throw new CompileFailed(
          firstErrorLine(lastOutput) ?? 'Échec de la compilation arduino-cli.',
          lastOutput,
          tried
        );
      }
      const hex = readFileSync(join(tmp, `${basename(filePath)}.hex`), 'utf8');
      // L'ELF (compilé avec -g par la plateforme AVR) livre les infos de débogage.
      const debug = await extractAvrDebug(join(tmp, `${basename(filePath)}.elf`), filePath, log, cli, searchDir);
      return { payload: { board: 'uno', format: 'avr-progmem', bytes: hexToProgmem(hex), debug }, log: log.join('\n') };
    };

    if (ext === '.ino') {
      if (arduinoCli) return withArduinoCli(arduinoCli);
      throw new Error(
        "arduino-cli est introuvable pour compiler un sketch .ino. Installez « arduino-cli » " +
          "ou indiquez son chemin complet dans le réglage « kablix.arduinoCliPath », puis redémarrez VS Code."
      );
    }

    // .c / .cpp : bare-metal avr-libc (avr-gcc / avr-g++).
    const isCpp = ['.cpp', '.cc', '.cxx'].includes(ext);
    const avrCompiler = resolveTool(isCpp ? 'avr-g++' : 'avr-gcc', { searchDir });
    if (avrCompiler) {
      log.push(`Compilation via avr-gcc (${mmcu}, bare-metal avr-libc, -O0)…`);
      const objcopy = resolveTool('avr-objcopy', { searchDir }) ?? 'avr-objcopy';
      const elf = join(tmp, 'out.elf');
      const hex = join(tmp, 'out.hex');
      // -O0 -g3 : débogage fidèle (lignes + variables non optimisées).
      await runSource(avrCompiler, [`-mmcu=${mmcu}`, '-O0', '-g3', '-DF_CPU=16000000UL', '-o', elf, filePath]);
      await run(objcopy, ['-O', 'ihex', '-R', '.eeprom', elf, hex]);
      const debug = await extractAvrDebug(elf, filePath, log, arduinoCli, searchDir);
      return {
        payload: { board: 'uno', format: 'avr-progmem', bytes: hexToProgmem(readFileSync(hex, 'utf8')), debug },
        log: log.join('\n'),
      };
    }
    // Repli : un .cpp peut être un sketch Arduino → arduino-cli s'il est présent.
    if (isCpp && arduinoCli) return withArduinoCli(arduinoCli);

    throw new Error(
      "Aucune toolchain AVR trouvée pour ce fichier. Pour un sketch Arduino, ouvrez/sélectionnez un fichier .ino " +
        "et installez « arduino-cli » (réglage « kablix.arduinoCliPath » si déjà installé mais introuvable). " +
        "Pour du C bare-metal, installez « avr-gcc » (ou indiquez « kablix.toolchainPath »). Redémarrez VS Code après."
    );
  }

  // Pico 2 / Pico 2 W : MicroPython seulement pour l'instant. Le bare-metal
  // RP2350 demande un autre cœur (-mcpu=cortex-m33), un autre script d'édition
  // de liens et le démarrage vectorisé du bootrom — rien de tout ça n'est écrit
  // ni testé, mieux vaut le dire que produire un binaire qui ne démarre pas.
  if (board === 'pico2' || board === 'pico2w') {
    throw new Error(
      "Le C bare-metal n'est pas encore pris en charge sur Pico 2 / Pico 2 W. " +
        'Utilisez un fichier MicroPython (.py), ou choisissez une carte Pico / Pico W ' +
        'pour compiler du C.'
    );
  }

  // Famille RP2040 (Pico / Pico W) : bare-metal exécuté en RAM (cohérent rp2040js).
  const isCpp = ['.cpp', '.cc'].includes(extname(filePath).toLowerCase());
  const armCompiler = resolveTool(isCpp ? 'arm-none-eabi-g++' : 'arm-none-eabi-gcc', { searchDir });
  if (!armCompiler) {
    throw new Error(
      "Toolchain ARM introuvable. Installez « arm-none-eabi-gcc » (paquet gcc-arm-none-eabi), " +
        "ou indiquez le dossier de la toolchain dans le réglage « kablix.toolchainPath », " +
        "puis redémarrez VS Code."
    );
  }
  log.push('Compilation via arm-none-eabi-gcc (RP2040, bare-metal RAM)…');
  const objcopy = resolveTool('arm-none-eabi-objcopy', { searchDir }) ?? 'arm-none-eabi-objcopy';
  const ld = join(extensionPath, 'firmware', 'pico', 'rp2040_ram.ld');
  const elf = join(tmp, 'out.elf');
  const bin = join(tmp, 'out.bin');
  await runSource(armCompiler, [
    // RP2040 bare-metal en RAM : on garde -Os (pas de débogage DWARF côté Pico,
    // et -nostdlib + -O0 risquerait des appels manquants à memcpy/memset).
    '-mcpu=cortex-m0plus', '-mthumb', '-Os', '-ffreestanding',
    '-nostdlib', '-nostartfiles', '-Wl,--build-id=none',
    '-T', ld, '-o', elf, filePath,
  ]);
  await run(objcopy, ['-O', 'binary', elf, bin]);
  return {
    // Le payload ne porte que la FAMILLE ('pico' = RP2040) ; Pico et Pico W
    // partagent le même cœur et le même binaire bare-metal.
    payload: { board: 'pico', format: 'rp2040-ram', b64: toB64(new Uint8Array(readFileSync(bin))) },
    log: log.join('\n'),
  };
}
