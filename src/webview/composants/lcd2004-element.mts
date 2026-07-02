// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — lcd2004-element.ts.
// Balise <kablix-lcd2004> (ex <wokwi-lcd2004>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs. Le dessin/les comportements restent ceux d'origine.
import { LCD1602Element } from './lcd1602-element.mjs';

export class LCD2004Element extends LCD1602Element {
  protected numCols = 20;
  protected numRows = 4;
}

if (!customElements.get('kablix-lcd2004')) {
  customElements.define('kablix-lcd2004', LCD2004Element);
}
