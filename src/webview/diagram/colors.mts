// Couleurs de composant : rendu du choix (pastilles de l'inspecteur) et nom
// affiché. Sorti de l'éditeur pour que la nomenclature (bom.mts) donne le même
// nom de couleur que l'inspecteur, sans traîner tout l'éditeur derrière elle.
import { t } from '../i18n.mjs';

/**
 * Couleur de fond d'un bouton de sélection de couleur de composant. Les noms
 * usuels sont des couleurs CSS valides ; quelques cas particuliers (ex. « GYR »
 * de la barre de LED) sont rendus par un dégradé représentatif.
 */
export function colorSwatchBackground(value: string): string {
  switch (value) {
    case 'GYR':
      return 'linear-gradient(90deg, #3c3 0 33%, #fd3 33% 66%, #e33 66%)';
    case 'white':
      return '#fafafa';
    default:
      return value; // red, green, blue, yellow, orange, purple, black… = couleurs CSS
  }
}

/**
 * Nom de couleur traduit pour l'infobulle des pastilles de choix et pour la
 * nomenclature. Les valeurs techniques restent inchangées (envoyées au
 * composant) ; seul l'affichage est traduit. « GYR » (green/yellow/red de la
 * barre) → « VJR ».
 */
export function colorDisplayName(value: string): string {
  const KEYS: Record<string, string> = {
    red: 'Red',
    green: 'Green',
    blue: 'Blue',
    yellow: 'Yellow',
    orange: 'Orange',
    white: 'White',
    purple: 'Purple',
    black: 'Black',
    GYR: 'GYR',
  };
  const key = KEYS[value];
  return key ? t(key) : value;
}
