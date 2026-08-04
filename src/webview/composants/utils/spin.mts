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

interface Pt {
  x: number;
  y: number;
}
interface Circle extends Pt {
  r: number;
}

/** Cercle passant par deux points (ils en sont le diamètre). */
function circleFrom2(a: Pt, b: Pt): Circle {
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

/** Cercle circonscrit à trois points (null s'ils sont alignés). */
function circleFrom3(a: Pt, b: Pt, c: Pt): Circle | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

/**
 * Plus petit cercle englobant (Welzl, incrémental). EXACT, là où l'ancienne
 * approche — se déplacer vers le point le plus lointain d'un pas décroissant —
 * ne faisait qu'en approcher le centre. Le mélange est fait avec un générateur
 * À GRAINE : deux mesures du même dessin donnent le même axe.
 */
function minEnclosingCircle(input: Pt[]): Circle {
  const pts = input.slice();
  let seed = 0x9e3779b9;
  for (let i = pts.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  const inside = (c: Circle, p: Pt): boolean =>
    Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 1e-9;
  let c: Circle = { x: pts[0].x, y: pts[0].y, r: 0 };
  for (let i = 1; i < pts.length; i++) {
    if (inside(c, pts[i])) continue;
    c = { x: pts[i].x, y: pts[i].y, r: 0 };
    for (let j = 0; j < i; j++) {
      if (inside(c, pts[j])) continue;
      c = circleFrom2(pts[i], pts[j]);
      for (let k = 0; k < j; k++) {
        if (inside(c, pts[k])) continue;
        c = circleFrom3(pts[i], pts[j], pts[k]) ?? c;
      }
    }
  }
  return c;
}

/**
 * Cherche l'axe : les BOUTS de branche sont tous à la même distance de l'axe,
 * donc le centre du plus petit cercle contenant les contours EST l'axe. Le
 * centre de la BOÎTE ne convient pas : avec un nombre impair de branches elle
 * est dissymétrique (≈ 5 px de balourd sur l'hélice du ventilateur).
 *
 * L'échantillonnage se fait au PAS, pas en nombre de points : un contour de
 * pignon ne mesure qu'une quinzaine d'unités de dessin, l'ancienne règle
 * (`len / 4`, plafond 120) lui accordait donc **12 points pour dix dents** —
 * aucun bout de dent n'était touché, l'axe tombait à côté et le pignon
 * décrivait un petit cercle en tournant (1,6 px de balourd mesuré à l'écran).
 */
export function measureSpin(wrap: SVGGElement): Spin | null {
  const toLocal = wrap.getCTM()?.inverse();
  const box = wrap.getBBox();
  if (!toLocal || !(box.width > 0)) return null; // pas encore rendu
  // Un point tous les 400e de la pièce : les bouts de branche sont touchés quel
  // que soit le nombre d'unités de dessin de la pièce.
  const step = Math.max(box.width, box.height) / 400;
  const pts: Pt[] = [];
  for (const el of wrap.querySelectorAll<SVGGeometryElement>('path,circle,ellipse,rect,polygon,polyline')) {
    if (typeof el.getTotalLength !== 'function') continue;
    const len = el.getTotalLength();
    const ctm = el.getCTM();
    if (!(len > 0) || !ctm) continue;
    const m = toLocal.multiply(ctm);
    const n = Math.min(4000, Math.max(24, Math.round(len / step)));
    for (let i = 0; i < n; i++) {
      const p = el.getPointAtLength((len * i) / n);
      pts.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
    }
  }
  if (pts.length < 3) return null;
  const c = minEnclosingCircle(pts);
  return { x: c.x - box.x, y: c.y - box.y, blades: countSpokes(wrap, toLocal, c.x, c.y, c.r) };
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

/**
 * Plage de passage propre au PIGNON du moteur. Une dent d'engrenage est bien
 * plus fine et bien plus rapprochée qu'une pale d'hélice : à 7 dents par
 * seconde la denture redevient un scintillement (constat de Frank, « encore
 * trop rapide »). La moitié suffit, et l'accélération reste largement lisible
 * (rotation multipliée par 3,5 du décrochage au plein régime).
 */
export const GEAR_MOTIF_MIN_HZ = 1;
export const GEAR_MOTIF_MAX_HZ = 3.5;
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
 * @param motif plage de passage de branche (Hz) — par défaut celle de l'hélice
 */
export function spinDisplay(
  turnsPerS: number,
  nominalTurnsPerS: number,
  blades: number,
  motif: { min: number; max: number } = { min: MOTIF_MIN_HZ, max: MOTIF_MAX_HZ }
): SpinDisplay {
  const turns = Number.isFinite(turnsPerS) ? Math.max(0, turnsPerS) : 0;
  if (turns <= 0) return { turns: 0, blur: 0 };
  const n = Math.max(1, blades);
  const ratio = nominalTurnsPerS > 0 ? turns / nominalTurnsPerS : 0;
  // 0 au décrochage, 1 au régime nominal. Peut dépasser 1 (surtension d'un
  // moteur avant destruction) : seul le flou en tient compte.
  const u = (ratio - START_RATIO) / (1 - START_RATIO);
  const uv = Math.max(0, Math.min(1, u));
  const motifHz = motif.min + (motif.max - motif.min) * uv;
  const shown = Math.min(motifHz / n, SCREEN_HZ / n / ALIAS_MARGIN);
  // Le flou n'arrive qu'à mi-plage : à basse vitesse il ne dirait rien et
  // brouillerait une pièce qu'on cherche justement à suivre.
  return { turns: shown, blur: Math.max(0, Math.min(1, (u - 0.5) / 0.5)) };
}
