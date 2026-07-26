// Base d'affichage des variables du panneau de débogage (clic droit sur une
// ligne) : binaire, hexadécimal, décimal ou caractère.
//
// Module séparé de sim.mts (4,5 Mo de bundle, aucun test possible dessus) pour
// que le banc `verify:debugvars` vérifie le formatage sur de VRAIES valeurs et
// non par une relecture de la source.
//
// Conventions demandées par Frank : la base est annoncée par un PRÉFIXE devant
// les chiffres — `0b` en binaire, `0x` en hexadécimal, rien en décimal (v193) —
// comme dans le code source, où ces préfixes s'écrivent et se relisent. Les
// indices de fin (₂, ₁₆, ₁₀) de la v189 sont abandonnés : ils ne se retapent pas
// dans un programme. Les chiffres restent groupés pour la lisibilité — par 4 en
// binaire et en hexadécimal, par 3 en décimal. Séparateur : une ESPACE FINE
// INSÉCABLE (U+202F, v203) — assez large pour détacher les groupes, assez fine
// pour que le nombre reste un bloc à l'œil ; et insécable, donc jamais coupé en
// fin de ligne dans un panneau étroit. La même fine détache le préfixe des
// chiffres (`0b 1010 0000`) : sans elle, `0b` se lisait comme un groupe de plus.

/** Base d'affichage d'une variable. `dec` est le défaut. */
export type VarBase = 'dec' | 'hex' | 'bin' | 'char';

/** Espace FINE insécable : le nombre reste d'un seul bloc, sans trou béant. */
export const THIN = '\u202f';

/** Radix, taille des groupes de chiffres et préfixe de chaque base numérique. */
const NUMERIC: Record<'dec' | 'hex' | 'bin', { radix: number; group: number; prefix: string }> = {
  bin: { radix: 2, group: 4, prefix: '0b' },
  hex: { radix: 16, group: 4, prefix: '0x' },
  dec: { radix: 10, group: 3, prefix: '' },
};

/** Échappements des caractères de contrôle usuels (mode « caractère »). */
const CTRL: Record<string, string> = {
  '0': '\\0', '7': '\\a', '8': '\\b', '9': '\\t',
  '10': '\\n', '11': '\\v', '12': '\\f', '13': '\\r', '27': '\\e',
};

/**
 * Valeur entière d'une variable, ou `undefined` si elle n'en est pas une :
 * flottant, booléen (`true`/`false` de l'AVR), chaîne ou objet Python. Ces
 * valeurs restent affichées TELLES QUELLES — les convertir n'aurait aucun sens
 * et masquerait l'information utile.
 */
export function integerValue(raw: string): bigint | undefined {
  const s = raw.trim();
  if (!/^[+-]?\d+$/.test(s)) return undefined;
  try {
    return BigInt(s);
  } catch {
    return undefined; // par prudence : BigInt ne devrait pas échouer ici
  }
}

/** Groupe les chiffres par paquets de `size` en partant de la DROITE. */
export function groupDigits(digits: string, size: number): string {
  const out: string[] = [];
  for (let end = digits.length; end > 0; end -= size) {
    out.unshift(digits.slice(Math.max(0, end - size), end));
  }
  return out.join(THIN);
}

/**
 * Littéral du caractère de code `n`. Les codes de contrôle sont échappés (`'\n'`)
 * plutôt qu'affichés — un caractère invisible ne dit rien au lecteur ; hors
 * plage Unicode, la valeur brute est conservée.
 */
export function charLiteral(n: bigint): string {
  if (n < 0n || n > 0x10ffffn) return String(n);
  const esc = CTRL[String(n)];
  if (esc) return `'${esc}'`;
  if (n < 32n || (n >= 127n && n < 160n)) {
    return `'\\x${n.toString(16).padStart(2, '0')}'`;
  }
  return `'${String.fromCodePoint(Number(n))}'`;
}

/**
 * Valeur d'une variable telle qu'affichée dans le panneau, selon la base choisie.
 * Le signe est conservé et porté devant le préfixe (`-0b 1010`, comme en C) : on
 * ne connaît pas la largeur du type, donc pas de complément à deux à inventer.
 * Le préfixe est détaché des chiffres par la même fine que les groupes : recopier
 * la valeur dans un programme demande de retirer les fines, dans les deux cas.
 */
export function formatVarValue(raw: string, base: VarBase): string {
  const n = integerValue(raw);
  if (n === undefined) return raw;
  if (base === 'char') return charLiteral(n);
  const { radix, group, prefix } = NUMERIC[base];
  const digits = (n < 0n ? -n : n).toString(radix).toUpperCase();
  const sep = prefix ? THIN : ''; // décimal : pas de préfixe, donc pas de fine
  return `${n < 0n ? '-' : ''}${prefix}${sep}${groupDigits(digits, group)}`;
}
