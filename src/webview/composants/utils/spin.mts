// Mesure de l'axe et de la symétrie d'une pièce TOURNANTE (hélice de
// ventilateur, pignon de moteur), et loi d'affichage de sa vitesse. Partagé par
// les composants qui font tourner un groupe du dessin de Frank : l'axe ne peut
// pas être codé en dur, il dépend du dessin, et le nombre de branches décide de
// la vitesse à laquelle l'œil suit encore le mouvement.

/** Symétries supposées si la mesure échoue. Repli PRUDENT : une pièce un peu
 *  lente se voit moins qu'une pièce qui recule. */
export const SPOKES_FALLBACK = 8;

/**
 * Rayons d'échantillonnage, en fraction du rayon de la pièce. Les grands rayons
 * sont indispensables : une DENTURE d'engrenage n'occupe que le dernier dixième
 * du disque — sondé plus près du centre, le pignon du moteur est plein et ne
 * révèle aucune symétrie (il était compté « 3 dents » pour une vingtaine).
 */
const SAMPLE_RADII = [0.5, 0.65, 0.8, 0.9, 0.94, 0.97] as const;

/**
 * Nombre de branches (pales, dents) : on fait le tour d'un CERCLE centré sur
 * l'axe et on compte les passages vide → matière. Un profil de RAYON ne dirait
 * rien (les bouts de pale forment un disque plein, mesuré : symétrie
 * indécidable) ; ce que l'on traverse, si. La mesure est reprise à plusieurs
 * rayons et l'on garde la valeur la plus fréquente — une pale ne s'interrompt
 * pas en chemin.
 */
function countSpokes(
  wrap: SVGGElement,
  toLocal: DOMMatrix,
  ax: number,
  ay: number,
  radius: number
): number {
  const shapes: { el: SVGGeometryElement; inv: DOMMatrix }[] = [];
  for (const el of wrap.querySelectorAll<SVGGeometryElement>('path,circle,ellipse,rect,polygon')) {
    const ctm = el.getCTM();
    if (!ctm || typeof el.isPointInFill !== 'function') continue;
    shapes.push({ el, inv: toLocal.multiply(ctm).inverse() });
  }
  if (!shapes.length || !(radius > 0)) return SPOKES_FALLBACK;
  const filled = (x: number, y: number): boolean =>
    shapes.some(({ el, inv }) =>
      el.isPointInFill(new DOMPoint(inv.a * x + inv.c * y + inv.e, inv.b * x + inv.d * y + inv.f))
    );
  const votes = new Map<number, number>();
  for (const frac of SAMPLE_RADII) {
    const r = radius * frac;
    // Deux points par degré : une denture fine (20 dents = une période de 18°)
    // reste largement échantillonnée.
    const N = 720;
    let fronts = 0;
    let previous = filled(ax + r, ay);
    const first = previous;
    for (let i = 1; i <= N; i++) {
      const a = (i * 2 * Math.PI) / N;
      const here = i === N ? first : filled(ax + r * Math.cos(a), ay + r * Math.sin(a));
      if (here && !previous) fronts++;
      previous = here;
    }
    if (fronts >= 2) votes.set(fronts, (votes.get(fronts) ?? 0) + 1);
  }
  let best = SPOKES_FALLBACK;
  let bestVotes = 0;
  for (const [n, count] of votes) {
    // À égalité de voix on retient le PLUS GRAND nombre de branches : la sous-
    // estimer ferait défiler la pièce trop vite (scintillement), la surestimer
    // la ralentit seulement.
    if (count > bestVotes || (count === bestVotes && n > best)) {
      bestVotes = count;
      best = n;
    }
  }
  return best;
}

/** Repère d'une pièce tournante : `x`/`y` = axe de rotation, relatif au coin de
 *  la boîte du groupe (repère `transform-box: fill-box`) ; `blades` = nombre de
 *  branches, qui fixe la vitesse au-delà de laquelle l'écran ne suit plus. */
export interface Spin {
  x: number;
  y: number;
  blades: number;
}

/**
 * Cherche l'axe : les BOUTS de branche sont tous à la même distance de l'axe,
 * donc le centre du plus petit cercle contenant les contours EST l'axe. On
 * l'approche en se déplaçant vers le point le plus lointain d'un pas décroissant.
 * Le centre de la BOÎTE ne convient pas : avec un nombre impair de branches elle
 * est dissymétrique (≈ 5 px de balourd sur l'hélice du ventilateur).
 */
export function measureSpin(wrap: SVGGElement): Spin | null {
  const toLocal = wrap.getCTM()?.inverse();
  const box = wrap.getBBox();
  if (!toLocal || !(box.width > 0)) return null; // pas encore rendu
  const pts: { x: number; y: number }[] = [];
  for (const el of wrap.querySelectorAll<SVGGeometryElement>('path,circle,ellipse,rect,polygon,polyline')) {
    if (typeof el.getTotalLength !== 'function') continue;
    const len = el.getTotalLength();
    const ctm = el.getCTM();
    if (!(len > 0) || !ctm) continue;
    const m = toLocal.multiply(ctm);
    const n = Math.min(120, Math.max(12, Math.round(len / 4)));
    for (let i = 0; i < n; i++) {
      const p = el.getPointAtLength((len * i) / n);
      pts.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
    }
  }
  if (pts.length < 3) return null;
  let ax = box.x + box.width / 2;
  let ay = box.y + box.height / 2;
  let far = 0;
  for (let i = 0; i < 300; i++) {
    let best = pts[0];
    far = -1;
    for (const p of pts) {
      const d = (p.x - ax) ** 2 + (p.y - ay) ** 2;
      if (d > far) {
        far = d;
        best = p;
      }
    }
    const k = 1 / (i + 2);
    ax += (best.x - ax) * k;
    ay += (best.y - ay) * k;
  }
  // `far` est le carré du rayon : le point le plus éloigné de l'axe.
  return { x: ax - box.x, y: ay - box.y, blades: countSpokes(wrap, toLocal, ax, ay, Math.sqrt(far)) };
}

// --- Loi d'affichage de la vitesse ------------------------------------------
// Montrer le vrai régime ne sert à rien : un ventilateur tourne à 50 tr/s, un
// pignon à 100, et sept pales à 50 tr/s font défiler 350 pales par seconde —
// l'œil n'y voit qu'un scintillement, et augmenter la tension ne change RIEN à
// ce qu'il perçoit. Ce que l'œil lit, c'est la fréquence de passage des
// BRANCHES : on la tient dans une plage lisible et on la fait croître avec le
// régime. La pièce tourne donc lentement, mais l'accélération se voit.

/** Rafraîchissement d'écran retenu pour le garde-fou d'alias (Hz). */
const SCREEN_HZ = 60;
/** Au-delà du quart d'une période de branche par image, la pièce paraît reculer
 *  (roue de charrette). Jamais atteint par la loi ci-dessous : simple filet. */
const ALIAS_MARGIN = 4;
/** Branches par seconde au décrochage : assez lent pour suivre une pale à l'œil,
 *  assez vif pour qu'on voie tout de suite que la pièce est partie. */
export const MOTIF_MIN_HZ = 1.5;
/** Branches par seconde au régime nominal. Au-delà de ~10 Hz les passages
 *  fusionnent et la vitesse cesse de se lire : on s'arrête nettement avant. */
export const MOTIF_MAX_HZ = 7;
/** Régime relatif en dessous duquel le modèle considère que rien ne tourne
 *  (`fanSpeed`, `motorStates`). La plage utile va donc de là au nominal, et
 *  c'est ELLE qu'il faut étaler — pas l'intervalle 0…nominal, dont le premier
 *  tiers n'est jamais parcouru. */
export const START_RATIO = 0.3;

/** Consigne d'affichage : `turns` = tours par seconde à ANIMER, `blur` = flou de
 *  bougé (0…1, à multiplier par le flou maximal du composant). */
export interface SpinDisplay {
  turns: number;
  blur: number;
}

/**
 * Traduit un régime RÉEL (tours/s) en rotation affichable.
 * @param turnsPerS vitesse réelle imposée par la simulation (0 = arrêté)
 * @param nominalTurnsPerS régime nominal du composant (plein régime)
 * @param blades nombre de branches mesuré dans le dessin
 */
export function spinDisplay(turnsPerS: number, nominalTurnsPerS: number, blades: number): SpinDisplay {
  const turns = Number.isFinite(turnsPerS) ? Math.max(0, turnsPerS) : 0;
  if (turns <= 0) return { turns: 0, blur: 0 };
  const n = Math.max(1, blades);
  const ratio = nominalTurnsPerS > 0 ? turns / nominalTurnsPerS : 0;
  // 0 au décrochage, 1 au régime nominal. Peut dépasser 1 (surtension d'un
  // moteur avant destruction) : seul le flou en tient compte.
  const u = (ratio - START_RATIO) / (1 - START_RATIO);
  const uv = Math.max(0, Math.min(1, u));
  const motif = MOTIF_MIN_HZ + (MOTIF_MAX_HZ - MOTIF_MIN_HZ) * uv;
  const shown = Math.min(motif / n, SCREEN_HZ / n / ALIAS_MARGIN);
  // Le flou n'arrive qu'à mi-plage : à basse vitesse il ne dirait rien et
  // brouillerait une pièce qu'on cherche justement à suivre.
  return { turns: shown, blur: Math.max(0, Math.min(1, (u - 0.5) / 0.5)) };
}
