// Linter électronique : relit le CODE de l'élève face au SCHÉMA.
//
// Aucun compilateur ne sait dire « tu lis la broche 2 mais rien n'y est
// branché » : il ne connaît pas le circuit. Kablix voit les deux.
//
// Pas d'analyse syntaxique complète : des motifs sur le texte (`pinMode`,
// `digitalRead`, `analogWrite`, `Pin(n, Pin.IN)`…). Règle d'or : EN CAS DE
// DOUTE, ON SE TAIT. Un avertissement qui se trompe sur un code correct fait
// perdre confiance à l'élève ; un contrôle ne sort que s'il est certain.
// Tout ce qui n'est pas un littéral, une constante jamais réaffectée ou un
// `#define` est ignoré (numéro de broche calculé, boucle, tableau…).
import { isPicoBoard, partDef, type BoardId } from './diagram/catalog.mjs';
import type { Diagram } from './diagram/model.mjs';

export type LintLang = 'cpp' | 'py';

/** Identifiant stable d'un contrôle (sert aux bancs et au regroupement). */
export type LintRule = 'pwm' | 'no-pinmode' | 'read-unwired' | 'write-unwired' | 'wired-unused';

export interface LintFinding {
  rule: LintRule;
  /** Broche de la carte concernée (nom du schéma : '3', 'A0', 'GP5'). */
  pin: string;
  /** Ligne du source (1-based), 0 si le contrôle porte sur le schéma seul. */
  line: number;
  /** Pièce à encadrer : la carte, ou le composant câblé pour `wired-unused`. */
  partId: string;
  /** Phrase d'état (clé de traduction EN + arguments). */
  message: string;
  args: string[];
  /** Explication longue, affichée dans l'étiquette du cadre rouge. */
  note: string;
}

// --------------------------------------------------------------------------
// Capacités des broches de la carte
// --------------------------------------------------------------------------

/** Broches PWM de `analogWrite` (noms du schéma). Pico : tout GPIO sait faire du PWM. */
export function pwmPins(board: BoardId): ReadonlySet<string> | null {
  if (isPicoBoard(board)) return null; // pas de contrainte : rien à contrôler
  if (board === 'mega') {
    return new Set([...range(2, 13), ...range(44, 46)].map(String));
  }
  return new Set(['3', '5', '6', '9', '10', '11']); // uno / nano (ATmega328P)
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Broches analogiques AVR : A0 = 14 (328P) ou 54 (2560) en numérotation numérique. */
function analogBase(board: BoardId): number {
  return board === 'mega' ? 54 : 14;
}

/** Broche numérique → nom du schéma ('14' → 'A0'). */
function nomSchema(board: BoardId, n: number): string {
  const base = analogBase(board);
  const nb = board === 'mega' ? 16 : board === 'nano' ? 8 : 6;
  if (n >= base && n < base + nb) return `A${n - base}`;
  return String(n);
}

// --------------------------------------------------------------------------
// Nettoyage du source
// --------------------------------------------------------------------------

/**
 * Remplace commentaires et chaînes par des espaces (les sauts de ligne sont
 * gardés : les numéros de ligne restent exacts).
 */
export function nettoyer(src: string, lang: LintLang): string {
  let out = '';
  let i = 0;
  const n = src.length;
  const blanc = (s: string): string => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (lang === 'cpp' && c === '/' && d === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      out += blanc(src.slice(i, j));
      i = j;
    } else if (lang === 'cpp' && c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2);
      const fin = j < 0 ? n : j + 2;
      out += blanc(src.slice(i, fin));
      i = fin;
    } else if (lang === 'py' && c === '#') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      out += blanc(src.slice(i, j));
      i = j;
    } else if (lang === 'py' && (src.startsWith('"""', i) || src.startsWith("'''", i))) {
      const q = src.slice(i, i + 3);
      const j = src.indexOf(q, i + 3);
      const fin = j < 0 ? n : j + 3;
      out += blanc(src.slice(i, fin));
      i = fin;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      const fin = Math.min(n, j + 1);
      out += blanc(src.slice(i, fin));
      i = fin;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function ligneDe(src: string, index: number): number {
  let l = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === '\n') l++;
  return l;
}

/** Découpe les arguments d'un appel à partir de la parenthèse ouvrante (profondeur respectée). */
function arguments_(src: string, ouvrante: number): string[] | null {
  let depth = 0;
  let cur = '';
  const args: string[] = [];
  for (let i = ouvrante; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') {
      depth++;
      if (depth === 1) continue;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        args.push(cur.trim());
        return args;
      }
    } else if (c === ',' && depth === 1) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  return null; // appel jamais refermé : on se tait
}

// --------------------------------------------------------------------------
// Constantes (numéros de broche écrits sous un nom)
// --------------------------------------------------------------------------

/**
 * Constantes entières sûres : `#define NOM 5`, `const int NOM = 5;`, ou une
 * variable globale `int NOM = 5;` JAMAIS réaffectée ailleurs. Python : `NOM = 5`
 * jamais réaffecté. Le reste est « inconnu ».
 */
function constantes(src: string, lang: LintLang, board: BoardId): Map<string, number> {
  const out = new Map<string, number>();
  const decl: Array<[string, number]> = [];
  if (lang === 'cpp') {
    for (const m of src.matchAll(/^[ \t]*#define[ \t]+([A-Za-z_]\w*)[ \t]+(A\d+|\d+)[ \t]*$/gm)) {
      decl.push([m[1], valeurBroche(m[2], board) ?? NaN]);
    }
    for (const m of src.matchAll(/^[ \t]*(?:const[ \t]+)?(?:unsigned[ \t]+)?(?:int|byte|uint8_t|short|long)[ \t]+([A-Za-z_]\w*)[ \t]*=[ \t]*(A\d+|\d+)[ \t]*;/gm)) {
      decl.push([m[1], valeurBroche(m[2], board) ?? NaN]);
    }
  } else {
    for (const m of src.matchAll(/^([A-Za-z_]\w*)[ \t]*=[ \t]*(\d+)[ \t]*$/gm)) {
      decl.push([m[1], Number(m[2])]);
    }
  }
  const compte = new Map<string, number>();
  for (const [nom] of decl) compte.set(nom, (compte.get(nom) ?? 0) + 1);
  for (const [nom, v] of decl) {
    if (!Number.isFinite(v) || compte.get(nom) !== 1) continue;
    // Réaffectée quelque part (`nom = …`, `nom++`, `nom += …`) : plus une constante.
    const re = new RegExp(`(?<![\\w.])${nom}\\s*(?:=(?!=)|\\+\\+|--|[-+*/%&|^]=)|(?:\\+\\+|--)\\s*${nom}\\b`, 'g');
    const affectations = (src.match(re) ?? []).length;
    if (affectations > 1) continue; // la déclaration en compte déjà une
    out.set(nom, v);
  }
  return out;
}

/** 'A3' → numéro Arduino (17 sur Uno) ; '5' → 5. */
function valeurBroche(tok: string, board: BoardId): number | null {
  const a = /^A(\d+)$/.exec(tok);
  if (a) return analogBase(board) + Number(a[1]);
  return /^\d+$/.test(tok) ? Number(tok) : null;
}

/** Un argument « numéro de broche » en nombre, ou null si on ne peut pas l'affirmer. */
function resoudre(tok: string, lang: LintLang, board: BoardId, cst: Map<string, number>): number | null {
  const t = tok.trim().replace(/^\(\s*(?:int|byte|uint8_t)\s*\)\s*/, '');
  if (lang === 'cpp') {
    if (t === 'LED_BUILTIN') return 13;
    const v = valeurBroche(t, board);
    if (v !== null) return v;
  } else if (/^\d+$/.test(t)) {
    return Number(t);
  }
  return /^[A-Za-z_]\w*$/.test(t) ? (cst.get(t) ?? null) : null;
}

// --------------------------------------------------------------------------
// Lecture du source
// --------------------------------------------------------------------------

type Mode = 'in' | 'out' | 'pullup' | 'pulldown';

interface Usage {
  /** Nom de la broche sur la carte ('3', 'A0', 'GP5'). */
  pin: string;
  line: number;
  kind: 'pinMode' | 'read' | 'analogRead' | 'write' | 'analogWrite' | 'interrupt';
  mode?: Mode;
}

interface Lecture {
  usages: Usage[];
  /** Un numéro de broche n'a pas pu être résolu (calculé, tableau, boucle…). */
  inconnu: boolean;
  /** Le source utilise des bibliothèques qui pilotent des broches elles-mêmes. */
  bibliotheques: boolean;
  /** `setup()` trouvé et lisible en entier (Arduino). */
  setupLisible: boolean;
}

function lireArduino(brut: string, board: BoardId): Lecture {
  const src = nettoyer(brut, 'cpp');
  const cst = constantes(src, 'cpp', board);
  const usages: Usage[] = [];
  let inconnu = false;
  const motif = /\b(pinMode|digitalRead|digitalWrite|analogRead|analogWrite|attachInterrupt)\s*\(/g;
  for (const m of src.matchAll(motif)) {
    const ouvrante = m.index + m[0].length - 1;
    const args = arguments_(src, ouvrante);
    if (!args) {
      inconnu = true;
      continue;
    }
    const ligne = ligneDe(src, m.index);
    // Définition de fonction (`void pinMode(...)`) ou prototype : pas un appel.
    const avant = src.slice(Math.max(0, m.index - 12), m.index);
    if (/\b(?:void|int|byte|bool)\s+$/.test(avant)) continue;
    let tokenBroche = args[0] ?? '';
    const nom = m[1];
    if (nom === 'attachInterrupt') {
      const dp = /^digitalPinToInterrupt\s*\(\s*([^)]+)\)$/.exec(tokenBroche);
      if (!dp) {
        inconnu = true; // numéro d'interruption brut : on ne sait pas remonter à la broche
        continue;
      }
      tokenBroche = dp[1];
    }
    const n = resoudre(tokenBroche, 'cpp', board, cst);
    if (n === null) {
      inconnu = true;
      continue;
    }
    const pin = nomSchema(board, n);
    switch (nom) {
      case 'pinMode': {
        const mode = (args[1] ?? '').trim();
        usages.push({
          pin,
          line: ligne,
          kind: 'pinMode',
          mode: mode === 'OUTPUT' ? 'out' : mode === 'INPUT_PULLUP' ? 'pullup' : mode === 'INPUT' ? 'in' : undefined,
        });
        if (mode !== 'OUTPUT' && mode !== 'INPUT_PULLUP' && mode !== 'INPUT') inconnu = true;
        break;
      }
      case 'digitalRead':
        usages.push({ pin, line: ligne, kind: 'read' });
        break;
      case 'analogRead':
        usages.push({ pin, line: ligne, kind: 'analogRead' });
        break;
      case 'digitalWrite':
        usages.push({ pin, line: ligne, kind: 'write' });
        break;
      case 'analogWrite':
        usages.push({ pin, line: ligne, kind: 'analogWrite' });
        break;
      default:
        usages.push({ pin, line: ligne, kind: 'interrupt' });
    }
  }
  // Bibliothèques : elles prennent des broches sans qu'un pinMode/digitalWrite
  // les nomme (Wire → A4/A5, SPI → 10-13, Servo, LiquidCrystal, Serial → 0/1…).
  const bibliotheques = /^[ \t]*#include[ \t]*[<"](?!Arduino\.h)/m.test(src) || /\bSerial\d?\b|\bWire\b|\bSPI\b/.test(src);
  // setup() lisible : accolades équilibrées jusqu'à la fin de son corps.
  const s = /\bvoid[ \t\n]+setup[ \t\n]*\(\s*(?:void)?\s*\)\s*\{/.exec(src);
  let setupLisible = false;
  if (s) {
    let depth = 0;
    for (let i = s.index + s[0].length - 1; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) {
        setupLisible = true;
        break;
      }
    }
  }
  return { usages, inconnu, bibliotheques, setupLisible };
}

function lirePython(brut: string, board: BoardId): Lecture {
  const src = nettoyer(brut, 'py');
  const cst = constantes(src, 'py', board);
  const usages: Usage[] = [];
  let inconnu = false;
  // `from machine import Pin` / `import machine` : sans cela, `Pin` est autre chose.
  const imports = [...src.matchAll(/^[ \t]*(?:from[ \t]+(\S+)[ \t]+import|import[ \t]+(\S+))/gm)].map((m) => m[1] ?? m[2]);
  const bibliotheques = imports.some((m) => !/^(machine|time|utime|sys|micropython|math|random)(,.*)?$/.test(m));
  const motif = /(?<![\w.])(?:machine\.)?(Pin|ADC|PWM)\s*\(/g;
  for (const m of src.matchAll(motif)) {
    const ouvrante = m.index + m[0].length - 1;
    const args = arguments_(src, ouvrante);
    if (!args) {
      inconnu = true;
      continue;
    }
    const ligne = ligneDe(src, m.index);
    // ADC(Pin(26)) / PWM(Pin(5)) : le Pin interne est vu par sa propre occurrence.
    if (m[1] !== 'Pin') {
      const interne = /^(?:machine\.)?Pin\s*\(/.test(args[0] ?? '');
      if (!interne) {
        const n = resoudre(args[0] ?? '', 'py', board, cst);
        if (n === null) {
          inconnu = true;
          continue;
        }
        if (m[1] === 'ADC') {
          // ADC(0..2) = canaux GP26..GP28 ; 3 (VSYS) et 4 (capteur interne) : pas de broche.
          if (n <= 4) {
            if (n <= 2) usages.push({ pin: `GP${26 + n}`, line: ligne, kind: 'analogRead' });
          } else usages.push({ pin: `GP${n}`, line: ligne, kind: 'analogRead' });
        } else usages.push({ pin: `GP${n}`, line: ligne, kind: 'write', mode: 'out' });
      }
      continue;
    }
    const n = resoudre(args[0] ?? '', 'py', board, cst);
    if (n === null) {
      inconnu = true; // Pin("LED"), Pin(i) dans une boucle…
      continue;
    }
    // ADC(Pin(26)) / PWM(Pin(5)) : le Pin sans mode est l'argument de l'ADC / du PWM.
    const enveloppe = /\b(ADC|PWM)\s*\(\s*(?:machine\.)?$/.exec(src.slice(0, m.index));
    if (enveloppe) {
      if (enveloppe[1] === 'ADC') {
        if (n >= 26) usages.push({ pin: `GP${n}`, line: ligne, kind: 'analogRead' });
      } else usages.push({ pin: `GP${n}`, line: ligne, kind: 'write', mode: 'out' });
      continue;
    }
    const reste = args.slice(1).join(',');
    const mode: Mode | undefined = /\bPin\.OUT\b/.test(reste)
      ? 'out'
      : /\bPULL_UP\b/.test(reste)
        ? 'pullup'
        : /\bPULL_DOWN\b/.test(reste)
          ? 'pulldown'
          : /\bPin\.IN\b/.test(reste)
            ? 'in'
            : undefined;
    if (mode === undefined) {
      inconnu = true; // mode absent ou passé par une variable : on ne conclut pas
      continue;
    }
    usages.push({ pin: `GP${n}`, line: ligne, kind: 'pinMode', mode });
  }
  return { usages, inconnu, bibliotheques, setupLisible: true };
}

// --------------------------------------------------------------------------
// Lecture du schéma
// --------------------------------------------------------------------------

interface Schema {
  carte: { id: string; board: BoardId } | null;
  /** Broches de la carte portant au moins un fil → composant au bout. */
  cablees: Map<string, string[]>;
  /** Le schéma contient un shield : des broches sont reliées sans fil. */
  shield: boolean;
}

/** Genre d'un composant, ou null s'il est inconnu (pièce de bibliothèque absente). */
function genre(type: string): string | null {
  try {
    return partDef(type).kind;
  } catch {
    return null;
  }
}

function lireSchema(diagram: Diagram): Schema {
  let carte: Schema['carte'] = null;
  let shield = false;
  for (const p of diagram.parts) {
    if (genre(p.type) === 'mcu' && !carte) carte = { id: p.id, board: partDef(p.type).board as BoardId };
    if (/shield/i.test(p.type) || genre(p.type) === 'grove-shield') shield = true;
  }
  const cablees = new Map<string, string[]>();
  if (carte) {
    for (const w of diagram.wires) {
      for (const [a, b] of [[w.a, w.b], [w.b, w.a]] as const) {
        if (a.partId !== carte.id) continue;
        const l = cablees.get(a.pin) ?? [];
        l.push(b.partId);
        cablees.set(a.pin, l);
      }
    }
  }
  // Sans fil non plus : une pince de sonde logique se pose sur la broche
  // (attribut `accroche` = « idDeLaCarte/BROCHE »).
  if (carte) {
    for (const p of diagram.parts) {
      for (const v of Object.values(p.attrs ?? {})) {
        if (typeof v !== 'string' || !v.startsWith(`${carte.id}/`)) continue;
        const pin = v.slice(carte.id.length + 1);
        const l = cablees.get(pin) ?? [];
        l.push(p.id);
        cablees.set(pin, l);
      }
    }
  }
  return { carte, cablees, shield };
}

/** Genres qui ne sont pas des composants « oubliés » par le code. */
const NON_CIBLES = new Set(['breadboard', 'logic-probe', 'meter', 'scope', 'grove-shield', '']);

/** Broche qui existe sans rien devoir lui être branché : LED de la carte, liaison série. */
function brocheLibre(board: BoardId, pin: string): boolean {
  if (isPicoBoard(board)) return pin === 'GP25'; // LED de la carte
  if (pin === '0' || pin === '1') return true; // Serial
  return pin === '13'; // LED_BUILTIN
}

// --------------------------------------------------------------------------
// Les contrôles
// --------------------------------------------------------------------------

/**
 * Relit `source` face à `diagram`. Renvoie les constats CERTAINS ; en cas de
 * doute, rien. `board` est la carte du schéma.
 */
export function lint(source: string, lang: LintLang, diagram: Diagram): LintFinding[] {
  const schema = lireSchema(diagram);
  if (!schema.carte) return [];
  const board = schema.carte.board;
  const pico = isPicoBoard(board);
  // Un source Python avec une carte AVR (ou l'inverse) : fichier d'un autre projet.
  if (pico !== (lang === 'py')) return [];
  const lu = lang === 'cpp' ? lireArduino(source, board) : lirePython(source, board);
  const out: LintFinding[] = [];
  const carteId = schema.carte.id;
  const deja = new Set<string>();
  const poser = (f: LintFinding): void => {
    const cle = `${f.rule}:${f.pin}`;
    if (deja.has(cle)) return;
    deja.add(cle);
    out.push(f);
  };
  const nomCode = (pin: string): string => (pico ? pin : /^\d+$/.test(pin) ? `D${pin}` : pin);

  // 1. analogWrite sur une broche sans PWM — certain : le catalogue le sait.
  const pwm = pwmPins(board);
  if (pwm) {
    for (const u of lu.usages) {
      if (u.kind !== 'analogWrite' || pwm.has(u.pin)) continue;
      poser({
        rule: 'pwm',
        pin: u.pin,
        line: u.line,
        partId: carteId,
        message: 'Line {0}: analogWrite on pin {1}, which has no PWM',
        args: [String(u.line), nomCode(u.pin)],
        note: board === 'mega'
          ? 'analogWrite only works on the PWM pins (2 to 13 and 44 to 46). Elsewhere the pin only goes fully high or fully low, never in between.'
          : 'analogWrite only works on the PWM pins (3, 5, 6, 9, 10, 11 on this board). Elsewhere the pin only goes fully high or fully low, never in between.',
      });
    }
  }

  // 2. Broche lue sans pinMode — sûr si setup() est lisible en entier et si
  //    aucun numéro de broche n'est resté calculé (un pinMode caché dans une boucle).
  if (lang === 'cpp' && lu.setupLisible && !lu.inconnu) {
    const declarees = new Set(lu.usages.filter((u) => u.kind === 'pinMode').map((u) => u.pin));
    for (const u of lu.usages) {
      if (u.kind !== 'read' || declarees.has(u.pin)) continue;
      poser({
        rule: 'no-pinmode',
        pin: u.pin,
        line: u.line,
        partId: carteId,
        message: 'Line {0}: pin {1} is read but pinMode() is never called on it',
        args: [String(u.line), nomCode(u.pin)],
        note: 'This pin is read but never declared: add pinMode(pin, INPUT) or INPUT_PULLUP in setup(). It works by luck on an AVR board, not on every board.',
      });
    }
  }

  // 3 et 4 : le schéma doit être lisible tel quel. Un shield relie des broches
  // sans fil ; une bibliothèque tierce prend des broches sans les nommer : on se tait.
  if (!schema.shield) {
    const pullups = new Set(lu.usages.filter((u) => u.kind === 'pinMode' && (u.mode === 'pullup' || u.mode === 'pulldown')).map((u) => u.pin));
    const cablee = (pin: string): boolean => (schema.cablees.get(pin)?.length ?? 0) > 0;
    // 3. Broche lue, rien de branché, pas de rappel interne.
    for (const u of lu.usages) {
      const lecture = u.kind === 'read' || u.kind === 'analogRead' || u.kind === 'interrupt' || (u.kind === 'pinMode' && u.mode === 'in');
      if (!lecture || cablee(u.pin) || pullups.has(u.pin) || brocheLibre(board, u.pin)) continue;
      poser({
        rule: 'read-unwired',
        pin: u.pin,
        line: u.line,
        partId: carteId,
        message: 'Line {0}: pin {1} is read but nothing is wired to it',
        args: [String(u.line), nomCode(u.pin)],
        note: 'The code reads this pin but nothing is connected to it: it floats and reads random values. Wire a sensor or a button to it, or enable the internal pull-up.',
      });
    }
    // 4a. Broche pilotée, rien de branché.
    for (const u of lu.usages) {
      const ecriture = u.kind === 'write' || u.kind === 'analogWrite' || (u.kind === 'pinMode' && u.mode === 'out');
      if (!ecriture || cablee(u.pin) || brocheLibre(board, u.pin)) continue;
      if (deja.has(`read-unwired:${u.pin}`)) continue;
      poser({
        rule: 'write-unwired',
        pin: u.pin,
        line: u.line,
        partId: carteId,
        message: 'Line {0}: pin {1} is driven but nothing is wired to it',
        args: [String(u.line), nomCode(u.pin)],
        note: 'The code drives this pin but nothing is connected to it, so nothing will react. Wire the component to this pin, or fix the pin number in the code.',
      });
    }
    // 4b. Inverse : câblée dans le schéma mais absente du code. Seulement si le
    // code est lisible en entier — aucun numéro calculé, aucune bibliothèque.
    if (!lu.inconnu && !lu.bibliotheques && lu.usages.length > 0) {
      const utilisees = new Set(lu.usages.map((u) => u.pin));
      for (const [pin, parts] of schema.cablees) {
        const role = lang === 'cpp' ? /^(?:\d+|A\d+)$/.test(pin) : /^GP\d+$/.test(pin);
        if (!role || utilisees.has(pin) || brocheLibre(board, pin) || /^A[4-5]$/.test(pin)) continue;
        // Le fil aboutit sur une platine (on ne sait pas quelle pièce s'y enfiche)
        // ou sur un instrument (observer une broche n'est pas un oubli du code).
        const cible = parts.find((id) => {
          const part = diagram.parts.find((q) => q.id === id);
          return part !== undefined && !NON_CIBLES.has(genre(part.type) ?? '');
        });
        if (cible === undefined) continue;
        // Les broches de bus (SPI : 10-13 ; I²C du Pico) appartiennent à des
        // bibliothèques que `bibliotheques` aurait déjà détectées ; ici le code
        // n'en importe aucune, la broche est donc bien inutilisée.
        poser({
          rule: 'wired-unused',
          pin,
          line: 0,
          partId: cible,
          message: 'Pin {0} is wired to this component but the code never uses it',
          args: [nomCode(pin)],
          note: 'This component is wired to a pin that the code never uses, so it will do nothing. Use the pin in the code, or move the wire.',
        });
      }
    }
  }
  return out;
}
