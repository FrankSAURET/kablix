// Style partagé du curseur affiché EN SIMULATION sur les capteurs (distance,
// température, bpm, intensité…). Un seul point de vérité pour la taille du
// curseur et la distance texte↔curseur (repris par 5 composants avant
// mutualisation — cf. todo.md « curseurs de simulation trop gros/longs »).
import { css } from 'lit';

export const simControlStyles = css`
  .sim-control {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 2px;
    font: 10px sans-serif;
    color: #333;
  }
  .sim-control label {
    white-space: nowrap;
  }
  .sim-control input[type='range'] {
    flex: 1;
    min-width: 44px;
  }
  .sim-control .val {
    width: 30px;
    text-align: right;
    color: #666;
  }
  .sim-control .val--wide {
    width: 46px;
  }
`;
