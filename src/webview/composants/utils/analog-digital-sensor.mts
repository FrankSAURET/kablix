// Base commune aux capteurs à DOUBLE sortie (analogique AOUT + numérique DOUT) :
// flamme, gaz, son, lumière (photorésistance). Comportement Kablix (pas Wokwi) :
//   - EN SIMULATION (attribut `simulating` posé par l'éditeur), un curseur règle
//     l'INTENSITÉ mesurée (0-100 %) directement sur le composant ;
//   - une propriété `sensitivity` (0-100 %, éditée dans l'inspecteur) fixe le seuil ;
//   - DOUT bascule (tout ou rien) quand intensité > sensibilité ;
//   - AOUT est analogique. Convention retenue avec Frank : la tension BAISSE quand
//     l'intensité monte (repos = haut, détection = bas — modules KY).
// Voir mémoire kablix-siminfra-simcontrol / kablix-capteurs-sim-decisions.
import { css, CSSResult, html, LitElement, TemplateResult } from 'lit';

export abstract class AnalogDigitalSensorElement extends LitElement {
  declare intensity: number;
  declare sensitivity: number;
  declare simulating: boolean;

  static properties = {
    intensity: { type: Number },
    sensitivity: { type: Number },
    simulating: { type: Boolean },
  };

  constructor() {
    super();
    this.intensity = 0;
    this.sensitivity = 50;
    this.simulating = false;
  }

  /** DOUT actif quand l'intensité dépasse la sensibilité. */
  get detected(): boolean {
    return this.intensity > this.sensitivity;
  }

  /** AOUT normalisé 0..1 : tension qui BAISSE quand l'intensité monte. */
  get analogLevel(): number {
    return 1 - Math.max(0, Math.min(100, this.intensity)) / 100;
  }

  /** Libellé du curseur d'intensité (sous-classe : « Flamme », « Gaz »…). */
  protected abstract intensityLabel(): string;

  private onRange = (e: Event) => {
    this.intensity = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(new Event('input'));
  };

  static get styles(): CSSResult | CSSResult[] {
    return css`
      :host {
        display: inline-block;
      }
      .sim-control {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 2px;
        font: 11px sans-serif;
        color: #333;
      }
      .sim-control label {
        white-space: nowrap;
      }
      .sim-control input[type='range'] {
        flex: 1;
        min-width: 80px;
      }
      .sim-control .val {
        width: 30px;
        text-align: right;
        color: #666;
      }
    `;
  }

  /** Rangée de contrôle affichée seulement en simulation. */
  protected renderSimControl(): TemplateResult | null {
    if (!this.simulating) return null;
    return html`
      <div class="sim-control">
        <label>${this.intensityLabel()}</label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          .value=${String(this.intensity)}
          @input=${this.onRange}
        />
        <span class="val">${Math.round(this.intensity)}%</span>
      </div>
    `;
  }

  /** Le dessin du capteur (SVG), fourni par la sous-classe. */
  protected abstract renderBody(): TemplateResult;

  render() {
    return html`${this.renderBody()}${this.renderSimControl()}`;
  }
}
