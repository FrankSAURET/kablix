// Mesure de l'axe et de la symétrie d'une pièce TOURNANTE (hélice de
// ventilateur, pignon de moteur). Partagé par les composants qui font tourner un
// groupe du dessin de Frank : l'axe ne peut pas être codé en dur, il dépend du
// dessin, et la symétrie fixe la vitesse au-delà de laquelle un écran à 60 Hz ne
// suit plus (effet stroboscope : la pièce paraît reculer).

/** Symétries supposées si la mesure échoue. Repli PRUDENT : une pièce un peu
 *  lente se voit moins qu'une pièce qui recule. */
export const SPOKES_FALLBACK = 8;

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
  for (const frac of [0.5, 0.65, 0.8, 0.9]) {
    const r = radius * frac;
    const N = 360;
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
    if (count > bestVotes) {
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
