// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — utils/clamp.ts, copié tel quel
// (imports relatifs .mjs). Licence d'origine : LICENSE-wokwi.md (dossier composants).
export const clamp = (min: number, max: number, value: number): number => {
  const clampedValue = Math.min(value, max);
  return Math.max(clampedValue, min);
};
