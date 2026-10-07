// Évaluateur d'expressions C minimal, pour les conditions et les messages des
// points d'arrêt Arduino (AVR). Les variables sont les globales du croquis lues
// en SRAM (table DWARF) : les locales vivent en pile ou en registre, hors de
// portée. Assez pour `compteur > 100 && compteur % 7 == 0`, `etat == HIGH`,
// `(x & 0x0F) != 0`, `t > 2.5 ? 1 : 0`.
//
// Arithmétique : entiers tronqués à la division quand les deux opérandes sont
// entiers ; opérations binaires (& | ^ ~ << >>) sur 32 bits ; flottants sinon.
// Tableaux et structures : `notes[i]`, `p1.x` (globales dépliées par le DWARF).
// Pas d'affectation, d'appel de fonction ni de pointeur : erreur explicite.

/** Valeur d'une variable, ou undefined si le nom est inconnu. */
export type CResolver = (name: string) => number | undefined;

interface Num {
  v: number;
  /** Vrai si la valeur est un flottant (division réelle). */
  f: boolean;
}

type Tok = { k: 'num'; v: number; f: boolean } | { k: 'id'; v: string } | { k: 'op'; v: string };

/** Constantes Arduino usuelles, prioritaires sur une globale de même nom absente. */
const CONSTANTES: Record<string, number> = {
  true: 1,
  false: 0,
  HIGH: 1,
  LOW: 0,
  NULL: 0,
  INPUT: 0,
  OUTPUT: 1,
  INPUT_PULLUP: 2,
};

// Du plus long au plus court : '<=' doit passer avant '<'. `=` seul (affectation)
// n'y figure pas : refusé par le découpage.
const OPS = ['<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '&', '|', '^', '!', '~', '(', ')', '?', ':', '[', ']', '.'];

const ECHAPPEMENTS: Record<string, number> = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, "'": 39, '"': 34 };

function decouper(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Nombre : hexa, binaire, décimal ou flottant ; suffixes C (u, l, f) ignorés.
    const num = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)([uUlLfF]*)/.exec(src.slice(i));
    if (num && /[\d.]/.test(ch)) {
      const t = num[1];
      let v: number;
      let f = false;
      if (/^0[xX]/.test(t)) v = parseInt(t.slice(2), 16);
      else if (/^0[bB]/.test(t)) v = parseInt(t.slice(2), 2);
      else {
        v = Number(t);
        f = /[.eE]/.test(t) || /[fF]/.test(num[2]);
      }
      toks.push({ k: 'num', v, f });
      i += num[0].length;
      continue;
    }
    // Caractère : 'a', '\n'.
    const car = /^'(\\.|[^\\'])'/.exec(src.slice(i));
    if (car) {
      const c = car[1];
      const v = c[0] === '\\' ? ECHAPPEMENTS[c[1]] ?? c.charCodeAt(1) : c.charCodeAt(0);
      toks.push({ k: 'num', v, f: false });
      i += car[0].length;
      continue;
    }
    const id = /^[A-Za-z_]\w*/.exec(src.slice(i));
    if (id) {
      toks.push({ k: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`unexpected '${ch}'`);
    toks.push({ k: 'op', v: op });
    i += op.length;
  }
  return toks;
}

/** Priorité des opérateurs binaires (C). */
const PRIO: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '|': 3,
  '^': 4,
  '&': 5,
  '==': 6,
  '!=': 6,
  '<': 7,
  '<=': 7,
  '>': 7,
  '>=': 7,
  '<<': 8,
  '>>': 8,
  '+': 9,
  '-': 9,
  '*': 10,
  '/': 10,
  '%': 10,
};

const entier = (x: Num): number => Math.trunc(x.v) | 0;
const bool = (b: boolean): Num => ({ v: b ? 1 : 0, f: false });

function binaire(op: string, a: Num, b: Num): Num {
  const f = a.f || b.f;
  switch (op) {
    case '+':
      return { v: a.v + b.v, f };
    case '-':
      return { v: a.v - b.v, f };
    case '*':
      return { v: a.v * b.v, f };
    case '/':
      if (!f && b.v === 0) throw new Error('division by zero');
      return { v: f ? a.v / b.v : Math.trunc(a.v / b.v), f };
    case '%':
      if (f) throw new Error("'%' needs integers");
      if (b.v === 0) throw new Error('division by zero');
      return { v: a.v % b.v, f: false };
    case '<<':
      return { v: entier(a) << entier(b), f: false };
    case '>>':
      return { v: entier(a) >> entier(b), f: false };
    case '&':
      return { v: entier(a) & entier(b), f: false };
    case '|':
      return { v: entier(a) | entier(b), f: false };
    case '^':
      return { v: entier(a) ^ entier(b), f: false };
    case '<':
      return bool(a.v < b.v);
    case '<=':
      return bool(a.v <= b.v);
    case '>':
      return bool(a.v > b.v);
    case '>=':
      return bool(a.v >= b.v);
    case '==':
      return bool(a.v === b.v);
    case '!=':
      return bool(a.v !== b.v);
  }
  throw new Error(`unsupported operator '${op}'`);
}

/** Arbre d'expression : évalué APRÈS l'analyse, pour court-circuiter comme en C. */
type Noeud =
  | { k: 'num'; v: Num }
  /** Variable : nom, puis indices `[i]` et champs `.x` (globales dépliées par le DWARF). */
  | { k: 'id'; nom: string; suite: Array<Noeud | string> }
  | { k: 'un'; op: string; x: Noeud }
  | { k: 'bin'; op: string; a: Noeud; b: Noeud }
  | { k: 'tern'; c: Noeud; a: Noeud; b: Noeud };

class Analyseur {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  analyser(): Noeud {
    if (this.toks.length === 0) throw new Error('empty expression');
    const r = this.ternaire();
    if (this.i < this.toks.length) throw new Error(`unexpected '${this.toks[this.i].v}'`);
    return r;
  }

  private estOp(v: string): boolean {
    const t = this.toks[this.i];
    return t !== undefined && t.k === 'op' && t.v === v;
  }

  private attendre(v: string): void {
    if (!this.estOp(v)) throw new Error(`'${v}' expected`);
    this.i++;
  }

  private ternaire(): Noeud {
    const c = this.binaire(1);
    if (!this.estOp('?')) return c;
    this.i++;
    const a = this.ternaire();
    this.attendre(':');
    const b = this.ternaire();
    return { k: 'tern', c, a, b };
  }

  private binaire(prio: number): Noeud {
    let gauche = this.unaire();
    for (;;) {
      const t = this.toks[this.i];
      if (!t || t.k !== 'op') return gauche;
      const p = PRIO[t.v];
      if (p === undefined || p < prio) return gauche;
      this.i++;
      gauche = { k: 'bin', op: t.v, a: gauche, b: this.binaire(p + 1) };
    }
  }

  private unaire(): Noeud {
    const t = this.toks[this.i];
    if (t && t.k === 'op') {
      if (t.v === '-' || t.v === '+' || t.v === '!' || t.v === '~') {
        this.i++;
        return { k: 'un', op: t.v, x: this.unaire() };
      }
      if (t.v === '(') {
        this.i++;
        const x = this.ternaire();
        this.attendre(')');
        return x;
      }
    }
    if (!t) throw new Error('unexpected end of expression');
    this.i++;
    if (t.k === 'num') return { k: 'num', v: { v: t.v, f: t.f } };
    if (t.k === 'id') {
      if (this.estOp('(')) throw new Error(`function call '${t.v}()' not supported`);
      // `notes[1]`, `p1.x`, `chemin[i].y` : le DWARF déplie les agrégats en
      // globales nommées ainsi, l'indice est évalué puis le nom reconstitué.
      const suite: Array<Noeud | string> = [];
      for (;;) {
        if (this.estOp('[')) {
          this.i++;
          suite.push(this.ternaire());
          this.attendre(']');
        } else if (this.estOp('.')) {
          this.i++;
          const champ = this.toks[this.i];
          if (!champ || champ.k !== 'id') throw new Error('field name expected');
          this.i++;
          suite.push(champ.v);
        } else break;
      }
      return { k: 'id', nom: t.v, suite };
    }
    throw new Error(`unexpected '${t.v}'`);
  }
}

function evaluer(n: Noeud, resoudre: CResolver): Num {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'id': {
      let nom = n.nom;
      for (const s of n.suite) nom += typeof s === 'string' ? `.${s}` : `[${entier(evaluer(s, resoudre))}]`;
      const v = resoudre(nom);
      if (v !== undefined) return { v, f: !Number.isInteger(v) };
      if (n.suite.length === 0 && nom in CONSTANTES) return { v: CONSTANTES[nom], f: false };
      throw new Error(`'${nom}' is not a global variable`);
    }
    case 'un': {
      const x = evaluer(n.x, resoudre);
      if (n.op === '-') return { v: -x.v, f: x.f };
      if (n.op === '+') return x;
      if (n.op === '!') return bool(x.v === 0);
      return { v: ~entier(x), f: false };
    }
    case 'tern':
      return evaluer(evaluer(n.c, resoudre).v !== 0 ? n.a : n.b, resoudre);
    case 'bin': {
      const a = evaluer(n.a, resoudre);
      if (n.op === '&&') return bool(a.v !== 0 && evaluer(n.b, resoudre).v !== 0);
      if (n.op === '||') return bool(a.v !== 0 || evaluer(n.b, resoudre).v !== 0);
      return binaire(n.op, a, evaluer(n.b, resoudre));
    }
  }
}

/** Évalue une expression C ; lève une Error lisible si elle est invalide. */
export function evalC(expr: string, resoudre: CResolver): number {
  return evaluer(new Analyseur(decouper(expr)).analyser(), resoudre).v;
}

/** Valeur formatée pour un message de journalisation (flottants arrondis). */
export function formatC(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
}
