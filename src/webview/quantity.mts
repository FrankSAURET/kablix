// Grandeurs physiques écrites comme on les lit sur un composant : « 100 kΩ »,
// « 10 µF », « 600 mA ». Extrait de bom.mts (v2026.7.257) parce que la
// nomenclature n'est plus seule à en avoir besoin : le potentiomètre affiche sa
// résistance EN SIMULATION, au-dessus du dessin — même préfixe, même virgule
// décimale, un seul endroit qui décide.
import { locale } from './i18n.mjs';

/** Unités qui prennent un préfixe (une résistance va de l'ohm au mégohm). */
export const SCALED_UNITS = new Set(['Ω', 'F', 'H', 'A', 'Hz', 'W', 'S']);
/** Unités écrites telles quelles (une tension d'alimentation reste en volts). */
export const PLAIN_UNITS = new Set(['V', '%', '°', '°C', 's', 'ms', 'µs', 'mm', 'cm', 'm', 'rpm']);
/** Préfixes, du plus grand au plus petit. */
const SI_STEPS: readonly [number, string][] = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

/** Unité écrite entre parenthèses à la fin d'un libellé : « Value (Ω) » → « Ω ». */
export function labelUnit(label: string): string | null {
  const m = /\(([^()]+)\)\s*$/.exec(label);
  const unit = m?.[1]?.trim();
  if (!unit) return null;
  return SCALED_UNITS.has(unit) || PLAIN_UNITS.has(unit) ? unit : null;
}

/** Nombre écrit dans la langue de l'interface (virgule décimale en français). */
export function localizeNumber(n: number): string {
  const text = String(Number(n.toPrecision(4)));
  return locale() === 'fr' ? text.replace('.', ',') : text;
}

/**
 * Grandeur lisible : « 100000 » + « Ω » → « 100 kΩ », « 1e-5 » + « F » →
 * « 10 µF », « 0.6 » + « A » → « 600 mA ». Les unités sans préfixe (V, %, °C)
 * gardent leur nombre tel quel.
 */
export function formatQuantity(raw: string, unit: string | null): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return unit ? `${raw} ${unit}` : raw;
  if (!unit) return localizeNumber(n);
  if (!SCALED_UNITS.has(unit) || n === 0) return `${localizeNumber(n)} ${unit}`;
  const abs = Math.abs(n);
  const [factor, prefix] = SI_STEPS.find(([p]) => abs >= p) ?? SI_STEPS[SI_STEPS.length - 1];
  return `${localizeNumber(n / factor)} ${prefix}${unit}`;
}
