// Composant maison <kablix-relais> : relais OMRON G5V, dessin de Frank
// (Composants.svg, groupes « relais » → ./externe/relais.svg et « relais_interne »
// → ./interne/relais-interne.svg).
//
// Broches (centre des pastilles, grille de 10 px) :
//   NF (10,10)  contact repos           B1 (20,10)  bobine
//   NO (10,30)  contact travail         B2 (20,30)  bobine
//   Com.1 (50,10) et Com.2 (50,30) : le MÊME commun, sorti des deux côtés du
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
    { name: 'NF', x: 10, y: 10, signals: [] },
    { name: 'B1', x: 20, y: 10, signals: [] },
    { name: 'Com.1', x: 50, y: 10, signals: [] },
    { name: 'NO', x: 10, y: 30, signals: [] },
    { name: 'B2', x: 20, y: 30, signals: [] },
    { name: 'Com.2', x: 50, y: 30, signals: [] },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
      text { font-family: 'Consolas', monospace; text-anchor: middle; pointer-events: none; fill: #d6d6d6; }
    `;
  }

  render() {
    // Sérigraphie centrée sur la zone libre du corps (entre les pattes de
    // gauche et le commun de droite).
    const volts = Number.isFinite(this.voltage) ? this.voltage : 5;
    return html`
      <svg width="60" height="40" viewBox="0 0 59.9998 40" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
        <text x="31" y="15.5" font-size="4.4">OMRON</text>
        <text x="31" y="20.7" font-size="4.4">G5V-1</text>
        <text x="31" y="25.9" font-size="4.4">${volts}VDC</text>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-relais')) {
  customElements.define('kablix-relais', RelaisElement);
}
