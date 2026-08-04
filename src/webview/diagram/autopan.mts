/**
 * Défilement automatique de la vue pendant un glissé (« la vue suit »).
 *
 * Demande de Frank : quand on tient un composant, un coude de fil ou un bout de
 * câble et qu'on emmène la souris au bord — voire hors de la fenêtre — la vue
 * doit se déplacer toute seule pour découvrir la suite du plan de travail.
 * Sans ça, un déplacement plus long que l'écran obligeait à lâcher, déplacer la
 * vue au bouton du milieu, puis reprendre le composant.
 *
 * Le module ne connaît ni l'éditeur ni le DOM : on lui donne le rectangle de la
 * vue et une fonction qui déplace la caméra, il rend un petit contrôleur à
 * nourrir des positions du curseur (`track`) et à arrêter à la fin du geste
 * (`stop`).
 */

/** Position de curseur : le strict nécessaire (un vrai PointerEvent en est un). */
export interface PointerLike {
  clientX: number;
  clientY: number;
  /** Boutons tenus (facultatif) : hors de la vue, on ne suit qu'un vrai glissé. */
  buttons?: number;
}

/** Rectangle de la vue, en coordonnées écran (un DOMRect en est un). */
export interface ViewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AutoPanHost {
  /** Rectangle visible de l'éditeur, en coordonnées écran. */
  viewport(): ViewRect;
  /** Déplace la vue de `dx`/`dy` pixels ÉCRAN (le monde bouge d'autant). */
  pan(dx: number, dy: number): void;
}

export interface AutoPan<E extends PointerLike = PointerLike> {
  /** Nouvelle position du curseur : lance ou arrête le défilement. */
  track(ev: E): void;
  /** Fin du geste : coupe l'horloge. */
  stop(): void;
  /** Un pas de défilement forcé, sans attendre l'horloge (banc de test). */
  tick(): void;
}

/** Largeur (px écran) de la bande sensible le long du bord de la vue. Le
 *  défilement démarre AVANT le bord : en mode clic-à-clic (câblage), le curseur
 *  ne sort jamais de la fenêtre et il n'y aurait sinon aucune amorce. */
export const AUTOPAN_EDGE = 24;
/** Défilement maximal, en px écran par pas (~60 Hz → ~1300 px/s). */
export const AUTOPAN_MAX = 22;
/** Pente : px de défilement par px de dépassement dans la bande. */
const AUTOPAN_GAIN = 0.35;
/** Période de l'horloge (ms). `requestAnimationFrame` est écarté : il ne bat
 *  pas quand la fenêtre passe au second plan — or c'est justement là que le
 *  curseur est sorti — et il est mort dans le navigateur sans écran du banc. */
const TICK = 16;

/**
 * Défilement à appliquer sur UN axe, en px écran par pas. Nul dans la partie
 * franche de la vue, il croît dès l'entrée dans la bande de bord et continue
 * de croître au-delà du bord, jusqu'au plafond. Le signe est celui du monde :
 * curseur au bord DROIT → la vue doit découvrir la droite → le monde recule
 * (valeur négative).
 */
export function autoPanAxis(v: number, min: number, max: number): number {
  // Vue plus étroite que deux bandes : elles se partagent la largeur, sinon la
  // zone franche disparaîtrait et la vue défilerait sans qu'on l'ait demandé.
  const edge = Math.min(AUTOPAN_EDGE, (max - min) / 2);
  const avant = min + edge - v;
  if (avant > 0) return Math.min(AUTOPAN_MAX, avant * AUTOPAN_GAIN);
  const apres = v - (max - edge);
  if (apres > 0) return -Math.min(AUTOPAN_MAX, apres * AUTOPAN_GAIN);
  return 0;
}

/**
 * Démarre un contrôleur de défilement pour la durée d'un geste. `replay` est
 * rappelé après chaque pas avec la DERNIÈRE position connue du curseur : le
 * geste en cours doit se recalculer, sinon le composant tenu resterait planté
 * dans le monde pendant que la vue file sous lui.
 */
export function startAutoPan<E extends PointerLike>(
  host: AutoPanHost,
  replay: (ev: E) => void
): AutoPan<E> {
  let last: E | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const push = (): { dx: number; dy: number } => {
    if (!last) return { dx: 0, dy: 0 };
    const r = host.viewport();
    // Hors de la vue sans bouton tenu, on ne suit pas : pendant un câblage
    // clic-à-clic, aller cliquer un bouton de la barre d'outils ferait
    // autrement fuir le plan de travail.
    const dehors =
      last.clientX < r.left || last.clientX > r.right || last.clientY < r.top || last.clientY > r.bottom;
    if (dehors && (last.buttons ?? 0) === 0) return { dx: 0, dy: 0 };
    return {
      dx: autoPanAxis(last.clientX, r.left, r.right),
      dy: autoPanAxis(last.clientY, r.top, r.bottom),
    };
  };

  const halt = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const tick = (): void => {
    const { dx, dy } = push();
    if (dx === 0 && dy === 0) {
      halt(); // curseur revenu au calme : l'horloge s'éteint d'elle-même
      return;
    }
    host.pan(dx, dy);
    if (last) replay(last);
  };

  return {
    track(ev: E): void {
      last = ev;
      const { dx, dy } = push();
      if (dx === 0 && dy === 0) halt();
      else if (timer === null) timer = setInterval(tick, TICK);
    },
    stop: halt,
    tick,
  };
}
