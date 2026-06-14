// Géométrie des fils (pure, sans DOM) : magnétisme horizontal/vertical des
// segments et tracé SVG avec arrondi à chaque changement de direction.

export interface XY {
  x: number;
  y: number;
}

// tan(10°) : en dessous de cette pente, un segment est aimanté sur l'axe
// (le câble est routé orthogonalement quand le parcours l'est presque).
const SNAP_SLOPE = 0.176;
const SNAP_MIN_PX = 10;

/**
 * Aimante le point `to` sur l'horizontale ou la verticale passant par `from`
 * si le segment en est proche (±10° ou ±10 px). Sinon le point est inchangé.
 */
export function snapPoint(from: XY, to: XY): XY {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dy) <= Math.max(SNAP_MIN_PX, Math.abs(dx) * SNAP_SLOPE)) {
      return { x: to.x, y: from.y };
    }
  } else if (Math.abs(dx) <= Math.max(SNAP_MIN_PX, Math.abs(dy) * SNAP_SLOPE)) {
    return { x: from.x, y: to.y };
  }
  return to;
}

/**
 * Construit le `d` d'un <path> SVG passant par les points donnés, avec un
 * congé (courbe quadratique) de rayon `radius` à chaque point intermédiaire.
 */
export function roundedWirePath(points: XY[], radius = 8): string {
  if (points.length < 2) return '';
  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const p = points[i];
    const next = points[i + 1];
    const dIn = Math.hypot(p.x - prev.x, p.y - prev.y);
    const dOut = Math.hypot(next.x - p.x, next.y - p.y);
    if (dIn === 0 || dOut === 0) continue;
    // Points d'entrée/sortie du congé, à `r` du sommet (borné à la mi-longueur).
    const rIn = Math.min(radius, dIn / 2);
    const rOut = Math.min(radius, dOut / 2);
    const aX = p.x - ((p.x - prev.x) / dIn) * rIn;
    const aY = p.y - ((p.y - prev.y) / dIn) * rIn;
    const bX = p.x + ((next.x - p.x) / dOut) * rOut;
    const bY = p.y + ((next.y - p.y) / dOut) * rOut;
    parts.push(`L ${aX} ${aY}`, `Q ${p.x} ${p.y} ${bX} ${bY}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

/**
 * Couleurs des nappes arc-en-ciel de fils Dupont, dans l'ordre du ruban.
 * Utilisées en rotation pour les nouveaux fils, et proposées dans l'éditeur.
 */
export const DUPONT_COLORS: ReadonlyArray<{ id: string; label: string; hex: string }> = [
  { id: 'red', label: 'Red', hex: '#e53935' },
  { id: 'orange', label: 'Orange', hex: '#fb8c00' },
  { id: 'yellow', label: 'Yellow', hex: '#fdd835' },
  { id: 'green', label: 'Green', hex: '#43a047' },
  { id: 'blue', label: 'Blue', hex: '#1e88e5' },
  { id: 'purple', label: 'Purple', hex: '#8e24aa' },
  { id: 'gray', label: 'Gray', hex: '#9e9e9e' },
  { id: 'white', label: 'White', hex: '#fafafa' },
  { id: 'black', label: 'Black', hex: '#212121' },
  { id: 'brown', label: 'Brown', hex: '#8d6e63' },
];

export function dupontHex(id: string): string {
  return DUPONT_COLORS.find((c) => c.id === id)?.hex ?? id;
}
