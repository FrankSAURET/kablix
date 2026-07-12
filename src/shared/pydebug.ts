// Instrumentation d'un script MicroPython pour le débogage pas à pas Kablix
// (option A du plan docs/DEBOGAGE.md). Un préambule ajoute une fonction
// __kx(n) appelée AVANT chaque ligne « pas-à-pasable » du source original
// (n = numéro de ligne 1-based du source ORIGINAL, le préambule ne compte pas).
//
// Protocole sur l'USB-CDC (stdin du script) :
//   \x05 (ENQ) : demande de pause — le mode pas à pas s'active au prochain __kx ;
//   \x06 (ACK) : exécuter un pas (rester en mode pas à pas) ;
//   \x07 (BEL) : reprendre l'exécution normale (désactive le mode pas à pas) ;
//   \x10 (DLE) + objet JSON { "ligne": condition|null } + '\n' : (re)définit les
//        points d'arrêt. __kx(n) se met en pause à la ligne n même hors mode pas
//        à pas ; si une condition (expression Python) est fournie, l'arrêt n'a
//        lieu que si elle s'évalue à vrai dans les globales du script (une erreur
//        d'évaluation = pas d'arrêt). Un objet vide (\x10{}\n) efface les arrêts.
// En mode pas à pas, __kx publie l'état sur stdout sous la forme
//   \x1bKX{"l":<ligne>,"v":{"nom":"repr tronqué", …}}\n
// puis BLOQUE en lisant stdin jusqu'à \x06 ou \x07. Le moteur (pico.mts)
// filtre ces séquences avant affichage dans le moniteur série.
// "v" contient les globales ET les locales de la fonction en pause (une locale
// écrase la globale de même nom — c'est elle que voit la ligne courante).
//
// Exclusions assumées (en cas de doute, la ligne n'est PAS instrumentée) :
//   - lignes vides et commentaires ;
//   - lignes de continuation : parenthèses/crochets/accolades encore ouverts,
//     backslash final, intérieur d'une chaîne triple-quotée ou d'une chaîne
//     simple non terminée ;
//   - mots-clés de suite de bloc en tête de ligne : else, elif, except,
//     finally, case ;
//   - décorateurs (@...).
// Variables locales : MicroPython n'offre aucune introspection des frames à
// l'exécution (pas de sys._getframe ni de settrace dans le firmware standard ;
// locals() y renvoie les globales) — les locales sont compilées en slots
// anonymes. Elles sont donc détectées STATIQUEMENT (paramètres + cibles
// d'affectation de chaque def) et l'instrumentation passe à __kx une lambda
// `[('nom', lambda: nom), …]` évaluée SEULEMENT en pause : un thunk qui lève
// NameError (variable pas encore affectée à cette ligne) est ignoré.
// Limites : un `if x: y = 1` sur une ligne est instrumenté comme une seule
// ligne (pas l'intérieur du bloc) ; les noms de corps de classe ne sont pas
// remontés (invisibles depuis une lambda) ; en cas de doute une variable
// n'est PAS remontée.

/** Préambule injecté en tête du script (noms en __kx* : filtrés du panneau). */
const PREAMBLE: string[] = [
  '# --- Kablix : preambule de debogage pas a pas (injecte automatiquement) ---',
  'import sys as __kx_sys',
  'import json as __kx_json',
  'try:',
  '    import uselect as __kx_sel',
  'except ImportError:',
  '    import select as __kx_sel',
  '__kx_poll = __kx_sel.poll()',
  '__kx_poll.register(__kx_sys.stdin, __kx_sel.POLLIN)',
  '__kx_step = False',
  '__kx_bps = {}',             // points d'arrêt : { ligne(int) : condition(str|None) }
  '__kx_bpbuf = None',         // tampon de lecture d'une commande \x10{json}\n (None = inactif)
  'def __kx_set_bps(__s):',    // __s = objet JSON { "ligne": condition|null }
  '    global __kx_bps',
  '    __b = {}',
  '    try:',
  '        __m = __kx_json.loads(__s)',
  '        for __k in __m:',
  '            try:',
  '                __b[int(__k)] = __m[__k]',
  '            except Exception:',
  '                pass',
  '    except Exception:',
  '        pass',
  '    __kx_bps = __b',
  'def __kx_poll_in():',        // draine stdin : commandes step/resume/bps ; renvoie l'octet "step/run" éventuel
  '    global __kx_step, __kx_bpbuf',
  '    while __kx_poll.poll(0):',
  '        __c = __kx_sys.stdin.read(1)',
  '        if __kx_bpbuf is not None:',   // en cours de lecture d'une liste de breakpoints
  "            if __c == '\\n':",
  '                __kx_set_bps(__kx_bpbuf)',
  '                __kx_bpbuf = None',
  '            else:',
  '                __kx_bpbuf += __c',
  '            continue',
  "        if __c == '\\x10':",
  "            __kx_bpbuf = ''",
  "        elif __c == '\\x05':",
  '            __kx_step = True',
  "        elif __c == '\\x07':",
  '            __kx_step = False',
  // Noms injectés par le démarrage de MicroPython (boot.py/_boot.py du RP2040)
  // ou son interpréteur : ce ne sont PAS des variables de l'élève → on les masque
  // (sinon « bdev : <Flash> », « vfs »… apparaissent dans le panneau Variables).
  "__kx_hidden = ('bdev', 'vfs', 'gc', 'os', 'sys', 'machine', 'rp2', 'st', 'fs')",
  // Types d'objets « système » (périphérique flash, systèmes de fichiers) à
  // masquer aussi quand l'élève les a (ré)assignés sous un autre nom.
  "__kx_hidden_types = ('Flash', 'Partition', 'VfsFat', 'VfsLfs1', 'VfsLfs2')",
  // Formate et range UNE variable (nom → repr court) — partagé globales/locales.
  'def __kx_put(__o, __k, __v):',
  '    if isinstance(__v, type) or isinstance(__v, type(__kx_put)) or isinstance(__v, type(__kx_sys)):',
  '        return',
  "    if type(__v).__name__ in __kx_hidden_types:",
  '        return',
  // Objets type Pin (machine.Pin, Signal…) : on affiche « nom.value » = niveau
  // logique (0/1) plutôt que le repr de l'objet (« Pin(GPIO13, mode=OUT) »).
  '    __vm = getattr(__v, "value", None)',
  '    if callable(__vm) and not isinstance(__v, (int, float, str, bytes, bool)):',
  '        try:',
  "            __o[__k + '.value'] = repr(__vm())",
  '            return',
  '        except Exception:',
  '            pass',
  '    try:',
  '        __r = repr(__v)',
  '    except Exception:',
  "        __r = '<?>'",
  '    if len(__r) > 120:',
  "        __r = __r[:117] + '...'",
  '    __o[__k] = __r',
  'def __kx_vars():',
  '    __o = {}',
  '    __g = globals()',
  '    for __k in list(__g):',
  "        if __k.startswith('_') or __k in __kx_hidden:",
  '            continue',
  // Tout est protégé : un objet « système » dont le repr/value lève une
  // exception ne doit jamais empêcher la collecte des variables suivantes.
  '        try:',
  '            __kx_put(__o, __k, __g[__k])',
  '        except Exception:',
  '            continue',
  '    return __o',
  // Décide si le point d'arrêt à la ligne __n doit suspendre : pas de condition
  // → toujours ; condition → on évalue l'expression Python dans les globales du
  // script (une condition qui lève une exception ne suspend pas, comme VS Code).
  'def __kx_bp_hit(__n):',
  '    if __n not in __kx_bps:',
  '        return False',
  '    __cond = __kx_bps[__n]',
  '    if not __cond:',
  '        return True',
  '    try:',
  '        return bool(eval(__cond, globals()))',
  '    except Exception:',
  '        return False',
  // __loc : lambda sans argument renvoyant des paires (nom, thunk) pour les
  // locales de la fonction en cours — évaluée SEULEMENT en pause. Un thunk qui
  // lève (NameError : variable pas encore affectée à cette ligne) est ignoré.
  'def __kx(__n, __loc=None):',
  '    global __kx_step, __kx_bpbuf',
  '    __kx_poll_in()',
  '    if __kx_bp_hit(__n):',         // point d'arrêt atteint : on s'arrête même hors pas à pas
  '        __kx_step = True',
  '    if not __kx_step:',
  '        return',
  '    __v = __kx_vars()',
  '    if __loc is not None:',
  '        try:',
  '            for __p in __loc():',
  '                try:',
  '                    __kx_put(__v, __p[0], __p[1]())',
  '                except Exception:',
  '                    pass',
  '        except Exception:',
  '            pass',
  "    __kx_sys.stdout.write('\\x1bKX' + __kx_json.dumps({'l': __n, 'v': __v}) + '\\n')",
  '    while True:',
  '        __c = __kx_sys.stdin.read(1)',
  '        if __kx_bpbuf is not None:',  // une commande breakpoints peut arriver pendant la pause
  "            if __c == '\\n':",
  '                __kx_set_bps(__kx_bpbuf)',
  '                __kx_bpbuf = None',
  '            else:',
  '                __kx_bpbuf += __c',
  '            continue',
  "        if __c == '\\x10':",
  "            __kx_bpbuf = ''",
  "        elif __c == '\\x06':",
  '            return',
  "        elif __c == '\\x07':",
  '            __kx_step = False',
  '            return',
  '# --- fin du preambule Kablix ---',
];

/** Mots-clés qui poursuivent un bloc existant : insérer avant casserait la syntaxe. */
const BLOCK_CONTINUATIONS = /^(else|elif|except|finally|case)\b/;

/** État du balayage ligne à ligne (porté d'une ligne à la suivante). */
interface ScanState {
  /** Délimiteur de la chaîne triple-quotée en cours (`"""` ou `'''`), sinon null. */
  triple: string | null;
  /** Profondeur de parenthèses/crochets/accolades ouverts. */
  depth: number;
  /** Vrai si la ligne suivante est une continuation (backslash ou chaîne ouverte). */
  cont: boolean;
}

/**
 * Balaye une ligne en tenant compte des chaînes et commentaires, et met à
 * jour l'état multi-lignes (triple-quote, profondeur de crochets, continuation).
 */
function scanLine(line: string, st: ScanState): void {
  st.cont = false;
  let inStr: string | null = null; // chaîne simple en cours (' ou ")
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (st.triple) {
      // Intérieur d'une chaîne triple-quotée : on ne cherche que sa fermeture.
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (line.startsWith(st.triple, i)) {
        st.triple = null;
        i += 3;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '#') return; // commentaire : le reste de la ligne est ignoré
    if (ch === '"' || ch === "'") {
      const trip = ch.repeat(3);
      if (line.startsWith(trip, i)) {
        st.triple = trip;
        i += 3;
        continue;
      }
      inStr = ch;
      i++;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') st.depth++;
    else if (ch === ')' || ch === ']' || ch === '}') st.depth = Math.max(0, st.depth - 1);
    else if (ch === '\\' && i === line.length - 1) st.cont = true; // continuation explicite
    i++;
  }
  // Chaîne simple non fermée en fin de ligne : prudence, ne pas instrumenter la suite.
  if (inStr) st.cont = true;
}

/** Vrai si la ligne (qui démarre bien une instruction) mérite un appel __kx. */
function isSteppable(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return false;
  if (trimmed.startsWith('@')) return false; // décorateur
  if (BLOCK_CONTINUATIONS.test(trimmed)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Détection statique des variables locales. Aucune introspection possible à
// l'exécution sous MicroPython (cf. en-tête) : on repère les noms liés par
// chaque def (paramètres, affectations, for/with/except/import … as, nonlocal)
// pour que l'instrumentation les capture dans une lambda. En cas de doute, un
// nom n'est PAS retenu — et seul un identifiant valide est retenu, ce qui
// garantit que le code généré reste syntaxiquement correct.

const IDENT_RE = /^[A-Za-z_]\w*$/;
/** Mots-clés Python (jamais des cibles valides) + self/cls (bruit en panneau). */
const NON_LOCAL_NAMES = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'case', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'match', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield', 'self', 'cls',
]);
/** Plafond de locales remontées par fonction (borne la ligne générée). */
const MAX_LOCALS = 24;

/** Bloc lexical (def ou class) ouvert pendant la pré-analyse. */
interface DefScope {
  kind: 'def' | 'class';
  /** Longueur de l'indentation de l'instruction def/class elle-même. */
  indent: number;
  /** Noms locaux dans l'ordre de découverte (paramètres d'abord). */
  locals: string[];
  /** Noms déclarés `global` : déjà dans le panneau des globales. */
  excluded: Set<string>;
}

function addLocal(scope: DefScope, name: string): void {
  const n = name.trim();
  if (!IDENT_RE.test(n) || n.startsWith('_') || NON_LOCAL_NAMES.has(n)) return;
  if (scope.excluded.has(n) || scope.locals.includes(n)) return;
  scope.locals.push(n);
}

/** Instruction logique : ligne de départ + texte joint (continuations comprises). */
interface Stmt {
  line: number;
  indent: number;
  text: string;
}

/** Découpe le source en instructions logiques (mêmes règles que l'émission). */
function splitStatements(lines: string[]): Stmt[] {
  const st: ScanState = { triple: null, depth: 0, cont: false };
  const stmts: Stmt[] = [];
  let cur: Stmt | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!st.triple && st.depth === 0 && !st.cont) {
      cur = null;
      const trimmed = line.trim();
      if (trimmed !== '' && !trimmed.startsWith('#')) {
        cur = { line: i, indent: /^[ \t]*/.exec(line)![0].length, text: trimmed };
        stmts.push(cur);
      }
    } else if (cur) {
      cur.text += ' ' + line.trim();
    }
    scanLine(line, st);
  }
  return stmts;
}

/** Ajoute à `scope` les paramètres du texte logique d'un `def` (entre parenthèses). */
function collectParams(scope: DefScope, stmt: string): void {
  const open = stmt.indexOf('(');
  if (open < 0) return;
  // Fin de la liste : parenthèse fermante appariée (chaînes ignorées).
  let depth = 0;
  let inStr: string | null = null;
  let end = -1;
  for (let i = open; i < stmt.length; i++) {
    const ch = stmt[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return;
  // Découpe aux virgules de premier niveau ; nom = avant ':' (annotation) ou '=' (défaut).
  let level = 0;
  let start = open + 1;
  inStr = null;
  for (let i = open + 1; i <= end; i++) {
    const ch = stmt[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '(' || ch === '[' || ch === '{') level++;
    else if ((ch === ')' || ch === ']' || ch === '}') && i < end) level--;
    else if ((ch === ',' && level === 0) || i === end) {
      const name = stmt
        .slice(start, i)
        .replace(/^[\s*]+/, '')
        .split(/[:=]/)[0]
        .trim();
      if (name) addLocal(scope, name);
      start = i + 1;
    }
  }
}

/** Enregistre dans `scope` les noms liés par une instruction (texte logique). */
function collectBoundNames(scope: DefScope, stmt: string): void {
  let m = /^global\s+(.+)$/.exec(stmt);
  if (m) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim();
      scope.excluded.add(name);
      const idx = scope.locals.indexOf(name);
      if (idx >= 0) scope.locals.splice(idx, 1);
    }
    return;
  }
  m = /^nonlocal\s+(.+)$/.exec(stmt);
  if (m) {
    // nonlocal : lisible depuis une lambda (cellule de la fonction englobante).
    for (const raw of m[1].split(',')) addLocal(scope, raw);
    return;
  }
  m = /^(?:async\s+)?for\s+(.+?)\s+in\b/.exec(stmt);
  if (m) {
    for (const raw of m[1].replace(/[()[\]]/g, '').split(',')) addLocal(scope, raw);
    return;
  }
  if (/^(with|except|import|from|async)\b/.test(stmt)) {
    for (const asMatch of stmt.matchAll(/\bas\s+([A-Za-z_]\w*)/g)) addLocal(scope, asMatch[1]);
    return;
  }
  // Affectation : simple, multiple (a, b = …), augmentée, ou annotée (a: int = …).
  m = /^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?:\/\/=|\*\*=|>>=|<<=|[+\-*/%&|^@]=|=(?!=))/.exec(stmt);
  if (m) {
    for (const raw of m[1].split(',')) addLocal(scope, raw);
    return;
  }
  m = /^([A-Za-z_]\w*)\s*:[^=]+=(?!=)/.exec(stmt);
  if (m) addLocal(scope, m[1]);
}

/**
 * Pré-analyse : pour chaque ligne qui démarre une instruction, le def englobant
 * le plus proche (avec ses locales détectées). Les lignes de niveau module et
 * les corps de classe (dont l'espace de noms est invisible depuis une lambda)
 * n'ont pas d'entrée.
 */
function collectScopes(lines: string[]): Map<number, DefScope> {
  const owning = new Map<number, DefScope>();
  const stack: DefScope[] = [];
  for (const stmt of splitStatements(lines)) {
    while (stack.length && stmt.indent <= stack[stack.length - 1].indent) stack.pop();
    const top = stack.length ? stack[stack.length - 1] : null;
    const scope = top && top.kind === 'def' ? top : null;
    if (scope) owning.set(stmt.line, scope);
    if (/^(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/.test(stmt.text)) {
      const child: DefScope = { kind: 'def', indent: stmt.indent, locals: [], excluded: new Set() };
      collectParams(child, stmt.text);
      stack.push(child);
    } else if (/^class\b/.test(stmt.text)) {
      stack.push({ kind: 'class', indent: stmt.indent, locals: [], excluded: new Set() });
    } else if (scope) {
      collectBoundNames(scope, stmt.text);
    }
  }
  return owning;
}

/**
 * Retourne le script instrumenté : préambule + une ligne `__kx(N)` (même
 * indentation) insérée avant chaque ligne pas-à-pasable du source original.
 * N est le numéro de ligne du source ORIGINAL (1-based).
 */
export function instrumentPython(source: string): string {
  const lines = source.split(/\r?\n/);
  const scopes = collectScopes(lines);
  const out: string[] = [...PREAMBLE];
  const st: ScanState = { triple: null, depth: 0, cont: false };
  // Vrai après un décorateur : rien ne doit s'insérer entre @deco et def/class.
  let afterDecorator = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // La ligne ne démarre une instruction que si l'on n'est ni dans une
    // chaîne triple, ni dans une expression entre crochets, ni en continuation.
    const startsStatement = !st.triple && st.depth === 0 && !st.cont;
    if (startsStatement) {
      const trimmed = line.trim();
      if (trimmed.startsWith('@')) {
        afterDecorator = true; // décorateur : ni instrumenté, ni séparable du def
      } else if (trimmed !== '' && !trimmed.startsWith('#')) {
        if (!afterDecorator && isSteppable(line)) {
          const indent = /^[ \t]*/.exec(line)![0];
          // Ligne dans un def : les locales détectées sont capturées dans une
          // lambda (paires nom/thunk), évaluée par __kx seulement en pause.
          const scope = scopes.get(i);
          const names = scope
            ? scope.locals.filter((n) => !scope.excluded.has(n)).slice(0, MAX_LOCALS)
            : [];
          if (names.length > 0) {
            const pairs = names.map((n) => `('${n}',lambda:${n})`).join(',');
            out.push(`${indent}__kx(${i + 1}, lambda: [${pairs}])`);
          } else {
            out.push(`${indent}__kx(${i + 1})`);
          }
        }
        afterDecorator = false;
      }
    }
    out.push(line);
    scanLine(line, st);
  }
  return out.join('\n');
}
