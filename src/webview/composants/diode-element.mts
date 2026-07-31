// Composant maison <kablix-diode> : diode de redressement, dessin de Frank
// (Composants.svg, groupe « diode » → ./externe/diode.svg ; schéma interne
// « diode-interne »). Boîtier DO-41 : la bague claire marque la CATHODE (K).
// Simulation : la diode ne laisse passer le courant que de A vers K, avec une
// chute de tension directe `vf` (model.mts — netLevel et graphe résistif).
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/diode.svg';

export class DiodeElement extends LitElement {
  /** Tension de seuil (V) — informative côté dessin, utilisée par le modèle. */
  declare vf: number;

  static properties = {
    vf: { type: Number },
  };

  constructor() {
    super();
    this.vf = 0.6;
  }

  // Broches : centre des pastilles du dessin (grille de 10 px, K côté bague).
  readonly pinInfo: ElementPin[] = [
    { name: 'K', x: 10, y: 10, signals: [] },
    { name: 'A', x: 50, y: 10, signals: [] },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  render() {
    return html`
      <svg width="60" height="20" viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-diode')) {
  customElements.define('kablix-diode', DiodeElement);
}
