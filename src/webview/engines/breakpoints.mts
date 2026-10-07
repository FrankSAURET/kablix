// Règles communes des points d'arrêt VS Code (condition, nombre de passages,
// point de journalisation), partagées par les moteurs AVR et MicroPython.
//
// Ordre d'évaluation (celui de VS Code / debugpy) : la condition d'abord ; si
// elle est vraie, le compteur de passages avance et la condition de passages
// est testée ; si tout est vrai, un point de journalisation écrit son message
// (sans arrêter), un point d'arrêt ordinaire suspend.

/** Opérateur de condition de passages (`hitCondition` de VS Code). */
export type HitOp = '==' | '>' | '>=' | '<' | '<=' | '%';

/** Condition de passages analysée. */
export interface HitRule {
  op: HitOp;
  n: number;
}

/**
 * Analyse une condition de passages saisie dans VS Code : `5`, `==5`, `>5`,
 * `>=5`, `<5`, `<=5`, `%3`. Un nombre seul vaut `==` (arrêt au N-ième passage,
 * comme debugpy). Renvoie null si le texte est vide, une erreur s'il est illisible.
 */
export function parseHitCondition(text: string | undefined): HitRule | null | Error {
  const s = (text ?? '').trim();
  if (s === '') return null;
  const m = /^(==|=|>=|>|<=|<|%)?\s*(\d+)$/.exec(s);
  if (!m) return new Error(`invalid hit count '${s}'`);
  const op = (m[1] === '=' || m[1] === undefined ? '==' : m[1]) as HitOp;
  const n = Number(m[2]);
  if (op === '%' && n === 0) return new Error(`invalid hit count '${s}'`);
  return { op, n };
}

/** Vrai si le passage numéro `hits` (1 = premier) satisfait la règle. */
export function hitMatches(rule: HitRule | null, hits: number): boolean {
  if (!rule) return true;
  switch (rule.op) {
    case '==':
      return hits === rule.n;
    case '>':
      return hits > rule.n;
    case '>=':
      return hits >= rule.n;
    case '<':
      return hits < rule.n;
    case '<=':
      return hits <= rule.n;
    case '%':
      return hits % rule.n === 0;
  }
}

/**
 * Découpe un message de journalisation VS Code en morceaux : indices pairs =
 * texte, indices impairs = expressions écrites entre accolades
 * (`i = {i}` → ['i = ', 'i', '']). `{{` et `}}` donnent une accolade littérale.
 * Une accolade non refermée reste du texte.
 */
export function splitLogMessage(message: string): string[] {
  const parts: string[] = [];
  let text = '';
  let i = 0;
  while (i < message.length) {
    const ch = message[i];
    if ((ch === '{' || ch === '}') && message[i + 1] === ch) {
      text += ch;
      i += 2;
      continue;
    }
    if (ch === '{') {
      const end = message.indexOf('}', i + 1);
      if (end < 0) {
        text += message.slice(i);
        break;
      }
      parts.push(text, message.slice(i + 1, end).trim());
      text = '';
      i = end + 1;
      continue;
    }
    text += ch;
    i++;
  }
  parts.push(text);
  return parts;
}

/**
 * Points d'arrêt au format attendu par le préambule MicroPython (__kx_set_bps,
 * pydebug.ts) : { "ligne": {c, h, m, k} }. Le nombre de passages et le message
 * sont analysés ici, une fois pour toutes ; `k` (clé) permet au script de garder
 * le compteur d'un point d'arrêt inchangé.
 */
export function encodePyBreakpoints(
  breakpoints: Array<{ line: number; condition?: string; hitCondition?: string; logMessage?: string }>
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const b of breakpoints) {
    const hit = parseHitCondition(b.hitCondition);
    map[String(b.line)] = {
      c: b.condition?.trim() || null,
      h: hit && !(hit instanceof Error) ? [hit.op, hit.n] : null,
      m: b.logMessage ? splitLogMessage(b.logMessage) : null,
      k: JSON.stringify([b.condition ?? '', b.hitCondition ?? '', b.logMessage ?? '']),
    };
  }
  return map;
}

/** Message produit par un point de journalisation (ou une erreur d'évaluation). */
export interface DebugLogEntry {
  /** Ligne (1-based) du point d'arrêt. */
  line: number;
  /** Texte final (expressions remplacées par leur valeur). */
  message: string;
  /** Vrai pour une erreur (condition ou expression illisible), pas un message de l'élève. */
  error?: boolean;
}
