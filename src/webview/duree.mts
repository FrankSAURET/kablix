// Durées saisies et affichées en heures / minutes / secondes (traceur).
//
// Frank (02/10) : avec les batteries, les fenêtres de 5 à 60 s du traceur ne
// suffisent plus ; il faut pouvoir taper « 1h30 » ou « 2 h 15 min 10 s », et
// lire les graduations dans la même écriture.

/** Pas « ronds » d'une graduation de temps, en secondes. */
const PAS_TEMPS_S = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30,
  60, 120, 300, 600, 900, 1800,
  3600, 7200, 10_800, 21_600, 43_200,
  86_400, 172_800, 432_000, 864_000,
];

/** Plus petit pas rond qui vaut au moins `brutS` secondes. */
export function pasDeTemps(brutS: number): number {
  return PAS_TEMPS_S.find((p) => p >= brutS) ?? PAS_TEMPS_S[PAS_TEMPS_S.length - 1]!;
}

/**
 * Lit une durée en secondes. Accepte `90`, `90 s`, `45min`, `1h30`,
 * `1 h 30 min`, `2h15m10s`, `1:30:00` (h:min:s) et `1:30` (min:s). Une valeur
 * nue est en secondes ; la virgule décimale passe. Rend null si le texte n'est
 * pas une durée, ou vaut zéro.
 */
export function analyserDuree(texte: string): number | null {
  const s = texte.trim().toLowerCase().replace(',', '.');
  if (s === '') return null;
  const deuxPoints = /^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(s);
  if (deuxPoints) {
    const [, a, b, c] = deuxPoints;
    const total = c === undefined
      ? Number(a) * 60 + Number(b)
      : Number(a) * 3600 + Number(b) * 60 + Number(c);
    return total > 0 ? total : null;
  }
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n > 0 ? n : null;
  }
  // Suite de « nombre + unité » : h, min / m, s ; un nombre final sans unité
  // prend l'unité qui SUIT logiquement la précédente (« 1h30 » = 1 h 30 min).
  const re = /(\d+(?:\.\d+)?)\s*(h|min|m|s)?/g;
  let reste = s;
  let total = 0;
  let dernier: 'h' | 'min' | 's' | null = null;
  let trouve = false;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    if (m[0] === '') break;
    const unite = m[2] === 'm' ? 'min' : (m[2] as 'h' | 'min' | 's' | undefined);
    let u: 'h' | 'min' | 's';
    if (unite) u = unite;
    else if (dernier === 'h') u = 'min';
    else if (dernier === 'min') u = 's';
    else return null;
    if (dernier !== null && ordre(u) <= ordre(dernier)) return null; // unités dans l'ordre
    total += Number(m[1]) * (u === 'h' ? 3600 : u === 'min' ? 60 : 1);
    dernier = u;
    trouve = true;
    reste = reste.replace(m[0], '');
  }
  if (!trouve || reste.replace(/\s+/g, '') !== '') return null;
  return total > 0 ? total : null;
}

function ordre(u: 'h' | 'min' | 's'): number {
  return u === 'h' ? 0 : u === 'min' ? 1 : 2;
}

/**
 * Écrit une durée en secondes. Jusqu'à 60 s : `12,5 s` (décimales demandées) ;
 * au-delà : `2 min 30 s`, `1 h 05 min`, `1 j 2 h` — sans les unités nulles de
 * queue. `decimales` ne sert qu'à la forme en secondes.
 */
export function formaterDuree(secondes: number, decimales = 1, langue = 'en'): string {
  const signe = secondes < 0 ? '-' : '';
  const a = Math.abs(secondes);
  if (a < 60) {
    return `${signe}${a.toLocaleString(langue, { maximumFractionDigits: decimales })} s`;
  }
  const total = Math.round(a);
  const j = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const deux = (n: number): string => String(n).padStart(2, '0');
  const morceaux: string[] = [];
  if (j > 0) {
    morceaux.push(`${j} j`);
    if (h > 0 || min > 0) morceaux.push(`${h} h`);
    if (min > 0) morceaux.push(`${deux(min)} min`);
  } else if (h > 0) {
    morceaux.push(`${h} h`);
    if (min > 0 || s > 0) morceaux.push(`${deux(min)} min`);
    if (s > 0) morceaux.push(`${deux(s)} s`);
  } else {
    morceaux.push(`${min} min`);
    if (s > 0) morceaux.push(`${deux(s)} s`);
  }
  return signe + morceaux.join(' ');
}
