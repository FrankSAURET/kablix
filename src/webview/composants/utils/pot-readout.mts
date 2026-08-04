// Étiquette de lecture des potentiomètres, affichée EN SIMULATION juste
// au-dessus du dessin : « Position : 66 % (6,6 kΩ|3,4 kΩ) ».
//
// Le pourcentage seul ne dit pas ce qu'on mesure entre le curseur et
// l'extrémité basse — c'est déjà le raisonnement du commentaire de nomenclature
// (bom.mts, v2026.7.251). Frank le veut aussi SOUS LES YEUX pendant la
// simulation, au plus près du composant : on tourne le bouton, on lit les ohms.
// Même libellé, même formatage que la nomenclature (`quantity.mts`) pour que le
// CSV et l'écran disent exactement la même chose.
import { css, html } from 'lit';
import type { TemplateResult } from 'lit';
import { t } from '../../i18n.mjs';
import { formatQuantity, potTracksText } from '../../quantity.mjs';

export const potReadoutStyles = css`
  /* HORS DU FLUX, comme les curseurs de simulation : si l'étiquette comptait
     dans la hauteur de l'élément, son apparition au lancement déplacerait le
     centre de rotation (transform-origin: center de .part__body) et tout
     composant tourné se décalerait à l'écran.
     Le bord bas de l'étiquette est collé au bord haut du dessin — « au plus
     près du composant » (Frank). Elle ne prend aucun clic : le bouton reste
     saisissable jusqu'à son bord. */
  .pot-readout {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 1px;
    font: 10px sans-serif;
    color: #333;
    white-space: nowrap;
    background: rgba(255, 255, 255, 0.75);
    border-radius: 2px;
    padding: 0 2px;
    pointer-events: none;
  }
`;

/** Le libellé du catalogue sans son unité : « Position (%) » → « Position ». */
function positionLabel(): string {
  return t('Position (%)').replace(/\s*\([^()]+\)\s*$/, '').trim();
}

/**
 * Texte affiché : « Position : 66 % (6,6 kΩ|3,4 kΩ) ». LES DEUX bras de la
 * piste, pas seulement celui du bas : un potentiomètre câblé en pont diviseur
 * se juge sur le rapport des deux (demande de Frank). Sans valeur nominale
 * exploitable, le pourcentage reste seul.
 */
export function potReadoutText(percent: number, ohms: number): string {
  const text = `${positionLabel()} : ${formatQuantity(String(percent), '%')}`;
  const tracks = potTracksText(percent, ohms);
  return tracks ? `${text} (${tracks})` : text;
}

/** L'étiquette elle-même — rien du tout hors simulation. */
export function potReadout(simulating: boolean, percent: number, ohms: number): TemplateResult | null {
  if (!simulating) return null;
  return html`<div class="pot-readout" part="readout">${potReadoutText(percent, ohms)}</div>`;
}
