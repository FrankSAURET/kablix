// Physique de l'écho ultrasonore : la vitesse du son dans l'air dépend de la
// TEMPÉRATURE, donc la durée de l'écho renvoyé par un HC-SR04 aussi.
//
// Le capteur ne mesure jamais une distance : il mesure une DURÉE de vol
// aller-retour. C'est le programme qui divise par une constante (58 µs/cm, ou
// 0,0343 cm/µs) — constante juste à ~20 °C seulement. Simuler la température
// rend visible cette erreur : un objet immobile « s'éloigne » quand l'air se
// refroidit, tant que le programme ne compense pas.
//
// Module sans DOM ni dépendance : importable par les moteurs ET testable en Node.

/** Température de l'air par défaut (°C) : celle qui rend la constante 58 µs/cm juste. */
export const DEFAULT_AIR_TEMP_C = 20;
/** Plage réglable (°C) — celle de fonctionnement du HC-SR04, arrondie. */
export const AIR_TEMP_MIN_C = -20;
export const AIR_TEMP_MAX_C = 60;

/**
 * Vitesse du son dans l'air sec, en m/s, selon la température (°C) :
 * approximation linéaire usuelle c = 331,3 + 0,606·T (exacte à ±0,1 % de −20 à 60 °C).
 * 20 °C → 343,4 m/s.
 */
export function soundSpeedMs(tempC: number): number {
  const t = clampAirTemp(tempC);
  return 331.3 + 0.606 * t;
}

/**
 * Durée d'écho par centimètre d'obstacle, en µs/cm : le son parcourt DEUX fois
 * la distance (aller-retour), d'où 2 × 1 cm / c ramené en µs → 20000 / c.
 * 20 °C → 58,24 µs/cm (la fameuse constante 58 des exemples Arduino).
 */
export function echoUsPerCm(tempC: number): number {
  return 20000 / soundSpeedMs(tempC);
}

/** Recale une température dans la plage réglable ; une valeur non numérique → défaut. */
export function clampAirTemp(tempC: number): number {
  if (!Number.isFinite(tempC)) return DEFAULT_AIR_TEMP_C;
  return Math.max(AIR_TEMP_MIN_C, Math.min(AIR_TEMP_MAX_C, tempC));
}
