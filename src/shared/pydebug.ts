// Instrumentation d'un script MicroPython pour le débogage pas à pas Kablix
// (option A du plan docs/DEBOGAGE.md). Un préambule ajoute une fonction
// __kx(n) appelée AVANT chaque ligne « pas-à-pasable » du source original
// (n = numéro de ligne 1-based du source ORIGINAL, le préambule ne compte pas).
//
// Protocole sur l'USB-CDC (stdin du script) :
//   \x05 (ENQ) : demande de pause — le mode pas à pas s'active au prochain __kx ;
//   \x06 (ACK) : exécuter un pas (rester en mode pas à pas) ;
//   \x07 (BEL) : reprendre l'exécution normale (désactive le mode pas à pas) ;
//   \x10 (DLE) + lignes décimales séparées par ',' + '\n' : (re)définit la liste
//        des points d'arrêt. __kx(n) se met alors en pause à la ligne n même
//        hors mode pas à pas. Une liste vide (\x10\n) efface tous les arrêts.
// En mode pas à pas, __kx publie l'état sur stdout sous la forme
//   \x1bKX{"l":<ligne>,"v":{"nom":"repr tronqué", …}}\n
// puis BLOQUE en lisant stdin jusqu'à \x06 ou \x07. Le moteur (pico.mts)
// filtre ces séquences avant affichage dans le moniteur série.
//
// Exclusions assumées (en cas de doute, la ligne n'est PAS instrumentée) :
//   - lignes vides et commentaires ;
//   - lignes de continuation : parenthèses/crochets/accolades encore ouverts,
//     backslash final, intérieur d'une chaîne triple-quotée ou d'une chaîne
//     simple non terminée ;
//   - mots-clés de suite de bloc en tête de ligne : else, elif, except,
//     finally, case ;
//   - décorateurs (@...).
// Limites : seules les variables GLOBALES « simples » sont remontées (pas de
// locales de fonction) ; un `if x: y = 1` sur une ligne est instrumenté comme
// une seule ligne (pas l'intérieur du bloc).

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
  '__kx_bps = set()',          // lignes des points d'arrêt
  '__kx_bpbuf = None',         // tampon de lecture d'une commande \x10…\n (None = inactif)
  'def __kx_set_bps(__s):',
  '    global __kx_bps',
  '    __b = set()',
  '    for __p in __s.split(","):',
  '        __p = __p.strip()',
  '        if __p:',
  '            try:',
  '                __b.add(int(__p))',
  '            except Exception:',
  '                pass',
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
  'def __kx_vars():',
  '    __o = {}',
  '    __g = globals()',
  '    for __k in __g:',
  "        if __k.startswith('_'):",
  '            continue',
  '        __v = __g[__k]',
  '        if isinstance(__v, type) or isinstance(__v, type(__kx_vars)) or isinstance(__v, type(__kx_sys)):',
  '            continue',
  // Objets type Pin (machine.Pin, Signal…) : on affiche « nom.value » = niveau
  // logique (0/1) plutôt que le repr de l'objet (« Pin(GPIO13, mode=OUT) »).
  '        __vm = getattr(__v, "value", None)',
  '        if callable(__vm) and not isinstance(__v, (int, float, str, bytes, bool)):',
  '            try:',
  '                __o[__k + ".value"] = repr(__vm())',
  '                continue',
  '            except Exception:',
  '                pass',
  '        try:',
  '            __r = repr(__v)',
  '        except Exception:',
  "            __r = '<?>'",
  '        if len(__r) > 120:',
  "            __r = __r[:117] + '...'",
  '        __o[__k] = __r',
  '    return __o',
  'def __kx(__n):',
  '    global __kx_step, __kx_bpbuf',
  '    __kx_poll_in()',
  '    if __n in __kx_bps:',          // point d'arrêt atteint : on s'arrête même hors pas à pas
  '        __kx_step = True',
  '    if not __kx_step:',
  '        return',
  "    __kx_sys.stdout.write('\\x1bKX' + __kx_json.dumps({'l': __n, 'v': __kx_vars()}) + '\\n')",
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

/**
 * Retourne le script instrumenté : préambule + une ligne `__kx(N)` (même
 * indentation) insérée avant chaque ligne pas-à-pasable du source original.
 * N est le numéro de ligne du source ORIGINAL (1-based).
 */
export function instrumentPython(source: string): string {
  const lines = source.split(/\r?\n/);
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
          out.push(`${indent}__kx(${i + 1})`);
        }
        afterDecorator = false;
      }
    }
    out.push(line);
    scanLine(line, st);
  }
  return out.join('\n');
}
