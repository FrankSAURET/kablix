// Style partagé du curseur affiché EN SIMULATION sur les capteurs (distance,
// température, bpm, intensité…). Un seul point de vérité pour la taille du
// curseur et la distance texte↔curseur (repris par 5 composants avant
// mutualisation — cf. todo.md « curseurs de simulation trop gros/longs »).
import { css } from 'lit';

export const simControlStyles = css`
  /* Le contrôle est SORTI DU FLUX : s'il participait à la hauteur de
     l'élément, son apparition au lancement de la simulation déplaçait le
     centre de rotation (transform-origin: center de .part__body, cf.
     applyRotation d'editor.mts) et tout composant tourné ou retourné se
     décalait à l'écran (constaté sur le capteur de son pivoté).
     Il est posé PAR-DESSUS le dessin, centré verticalement (demande Frank :
     « les curseurs doivent plutôt s'afficher sur les composants ») — fond
     translucide pour rester lisible sur n'importe quel dessin. */
  :host {
    position: relative;
  }
  .sim-control {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    font: 10px sans-serif;
    color: #333;
    background: rgba(255, 255, 255, 0.65);
    border-radius: 3px;
    padding: 1px 2px;
  }
  /* Zone blanche semi-transparente sous le texte (label + valeur) : en
     simulation le composant passe au-dessus de tout (fils, voisins — cf.
     part--sim-active), le texte sombre devenait illisible sur un fond
     similaire sans ce contraste. */
  .sim-control label,
  .sim-control .val {
    background: rgba(255, 255, 255, 0.75);
    border-radius: 2px;
    padding: 0 2px;
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
