// Mini-évaluateur d'expressions mathématiques SÛR (pas d'eval/Function — la CSP
// de la webview l'interdirait de toute façon) pour la « caractéristique » des
// contrôles de simulation des composants personnalisés : convertit la valeur du
// curseur (x) en tension de sortie, avec accès aux paramètres du composant par
// leur nom (ex. « 3.3*x/(x+R1lx) »).
//
// Grammaire : + - * / %, puissance ^ (associative à droite), parenthèses, moins
// unaire, nombres décimaux, identifiants (variables), fonctions à arguments.
// Les identifiants inconnus sont refusés à la COMPILATION (validation en direct
// dans le créateur de composants).

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Vars = Record<string, number>;
type Node = (vars: Vars) => number;

/**
 * Compile une expression : la syntaxe et les identifiants sont validés tout de
 * suite (throw Error avec message), l'évaluation ne peut plus échouer ensuite.
 * `varNames` = variables autorisées (ex. ['x', 'R1lx']).
 */
export function compileExpr(source: string, varNames: string[]): Node {
  const src = source.trim();
  if (!src) throw new Error('empty expression');
  const allowed = new Set(varNames);
  let pos = 0;

  const peek = (): string => src[pos] ?? '';
  const skipWs = (): void => {
    while (/\s/.test(peek())) pos++;
  };
  const fail = (msg: string): never => {
    throw new Error(`${msg} (char ${pos + 1})`);
  };

  // expr := term (('+'|'-') term)*
  const parseExpr = (): Node => {
    let left = parseTerm();
    for (;;) {
      skipWs();
      const op = peek();
      if (op !== '+' && op !== '-') return left;
      pos++;
      const right = parseTerm();
      const l = left;
      left = op === '+' ? (v) => l(v) + right(v) : (v) => l(v) - right(v);
    }
  };

  // term := power (('*'|'/'|'%') power)*
  const parseTerm = (): Node => {
    let left = parsePower();
    for (;;) {
      skipWs();
      const op = peek();
      if (op !== '*' && op !== '/' && op !== '%') return left;
      pos++;
      const right = parsePower();
      const l = left;
      left =
        op === '*' ? (v) => l(v) * right(v)
        : op === '/' ? (v) => l(v) / right(v)
        : (v) => l(v) % right(v);
    }
  };

  // power := unary ('^' power)?  — associative à droite (2^3^2 = 512)
  const parsePower = (): Node => {
    const base = parseUnary();
    skipWs();
    if (peek() !== '^') return base;
    pos++;
    const exp = parsePower();
    return (v) => Math.pow(base(v), exp(v));
  };

  const parseUnary = (): Node => {
    skipWs();
    if (peek() === '-') {
      pos++;
      const inner = parseUnary();
      return (v) => -inner(v);
    }
    if (peek() === '+') {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = (): Node => {
    skipWs();
    const c = peek();
    if (c === '(') {
      pos++;
      const inner = parseExpr();
      skipWs();
      if (peek() !== ')') fail('expected ")"');
      pos++;
      return inner;
    }
    // Nombre : 12, 3.3, .5, 1e-3
    const num = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(src.slice(pos));
    if (num) {
      pos += num[0].length;
      const value = Number(num[0]);
      return () => value;
    }
    // Identifiant : variable, constante ou fonction
    const id = /^[A-Za-z_]\w*/.exec(src.slice(pos));
    if (!id) fail(`unexpected "${c || 'end'}"`);
    const name = id![0];
    pos += name.length;
    skipWs();
    if (peek() === '(') {
      // Object.hasOwn : refuse les propriétés héritées (constructor, toString…).
      if (!Object.hasOwn(FUNCTIONS, name)) fail(`unknown function "${name}"`);
      const fn = FUNCTIONS[name];
      pos++;
      const args: Node[] = [];
      skipWs();
      if (peek() !== ')') {
        for (;;) {
          args.push(parseExpr());
          skipWs();
          if (peek() === ',') {
            pos++;
            continue;
          }
          break;
        }
      }
      if (peek() !== ')') fail('expected ")"');
      pos++;
      return (v) => fn(...args.map((a) => a(v)));
    }
    if (Object.hasOwn(CONSTANTS, name)) {
      const value = CONSTANTS[name];
      return () => value;
    }
    if (!allowed.has(name)) fail(`unknown variable "${name}"`);
    return (v) => v[name] ?? 0;
  };

  const root = parseExpr();
  skipWs();
  if (pos < src.length) fail(`unexpected "${peek()}"`);
  return root;
}
