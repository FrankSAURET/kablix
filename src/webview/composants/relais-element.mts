// Composant maison <kablix-relais> : relais OMRON G5V, dessin de Frank
// (Composants.svg, groupes « relais » → ./externe/relais.svg et « relais_interne »
// → ./interne/relais-interne.svg).
//
// Broches (centre des pastilles, grille de 10 px) :
//   B1 (30,10) et B2 (30,50) : bobine, sortie en haut et en bas du boîtier
//   NF (10,20)  contact repos           NO (10,40)  contact travail
//   Com.1 (70,20) et Com.2 (70,40) : le MÊME commun, sorti des deux côtés du
//   boîtier comme sur le vrai G5V. Les deux pastilles sont reliées par le
//   dessin interne, et réunies dans la netlist (buildNets) — un fil sur l'une
//   ou sur l'autre revient au même. L'éditeur les affiche toutes deux « Com ».
//
// La tension de commande est **inscrite sur le boîtier** (« 5VDC »), comme sur
// le vrai composant : on lit d'un coup d'œil quel modèle on a posé.
// Simulation : voir relayState (model.mts) — seuil d'enclenchement et diode de
// roue libre obligatoire.
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/relais.svg';

export class RelaisElement extends LitElement {
  /** Tension nominale de la bobine (V) — inspecteur. */
  declare voltage: number;

  static properties = {
    voltage: { type: Number },
  };

  constructor() {
    super();
    this.voltage = 5;
  }

  readonly pinInfo: ElementPin[] = [
    { name: 'B1', x: 30, y: 10, signals: [] },
    { name: 'NF', x: 10, y: 20, signals: [] },
    { name: 'Com.1', x: 70, y: 20, signals: [] },
    { name: 'NO', x: 10, y: 40, signals: [] },
    { name: 'Com.2', x: 70, y: 40, signals: [] },
    { name: 'B2', x: 30, y: 50, signals: [] },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
      text { font-family: 'Consolas', monospace; text-anchor: middle; pointer-events: none; fill: #d6d6d6; }
    `;
  }

  render() {
    // Sérigraphie centrée sur le corps, entre les pattes du haut et du bas.
    const volts = Number.isFinite(this.voltage) ? this.voltage : 5;
    return html`
      <svg width="80" height="60" viewBox="0 0 80.0002 60.0003" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        <text x="41" y="25.5" font-size="5">OMRON</text>
        <text x="41" y="31.5" font-size="5">G5V-1</text>
        <text x="41" y="37.5" font-size="5">${volts}VDC</text>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-relais')) {
  customElements.define('kablix-relais', RelaisElement);
}
