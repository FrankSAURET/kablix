// Schémas du câblage interne des composants, superposés en semi-transparence
// quand un composant est sélectionné (dessin noir sur fond blanc translucide).
// Les tracés sont produits dans le repère local du composant (mêmes coordonnées
// que les broches `pinInfo`), donc ils suivent rotation et retournement du corps.

export interface PinPoint {
  name: string;
  x: number;
  y: number;
}

interface XY {
  x: number;
  y: number;
}

const find = (pins: PinPoint[], name: string): XY | null => {
  const p = pins.find((q) => q.name === name);
  return p ? { x: p.x, y: p.y } : null;
};

const mid = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const line = (a: XY, b: XY): string => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
const dot = (p: XY, r = 2.4): string => `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#111"/>`;

/** Bouton poussoir : deux bus de pattes + contact ouvert au centre. */
function pushbutton(pins: PinPoint[]): string | null {
  const p1l = find(pins, '1.l');
  const p1r = find(pins, '1.r');
  const p2l = find(pins, '2.l');
  const p2r = find(pins, '2.r');
  if (!p1l || !p1r || !p2l || !p2r) return null;

  const midA = mid(p1l, p1r);
  const midB = mid(p2l, p2r);
  const center = mid(midA, midB);
  const dx = midB.x - midA.x;
  const dy = midB.y - midA.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const gap = Math.min(10, len / 3);
  const cA = { x: center.x - ux * gap, y: center.y - uy * gap };
  const cB = { x: center.x + ux * gap, y: center.y + uy * gap };
  // Contact mobile : barre inclinée depuis cA (interrupteur normalement ouvert).
  const ang = Math.atan2(uy, ux) - 0.6;
  const arm = { x: cA.x + Math.cos(ang) * gap * 2, y: cA.y + Math.sin(ang) * gap * 2 };

  return [
    line(p1l, p1r), // bus de la borne 1
    line(p2l, p2r), // bus de la borne 2
    line(midA, cA),
    line(midB, cB),
    dot(cA),
    dot(cB),
    line(cA, arm), // bras du contact, ouvert
  ].join('');
}

/** LED : symbole de diode (triangle + barre de cathode) entre A et K. */
function led(pins: PinPoint[]): string | null {
  const a = find(pins, 'A');
  const c = find(pins, 'C'); // cathode (affichée « K »)
  if (!a || !c) return null;

  const center = mid(a, c);
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len; // axe A → K
  const px = -uy;
  const py = ux; // perpendiculaire
  const s = Math.min(9, len / 3); // demi-taille du symbole

  const baseL = { x: center.x - ux * s + px * s, y: center.y - uy * s + py * s };
  const baseR = { x: center.x - ux * s - px * s, y: center.y - uy * s - py * s };
  const apex = { x: center.x + ux * s, y: center.y + uy * s };
  const barL = { x: apex.x + px * s, y: apex.y + py * s };
  const barR = { x: apex.x - px * s, y: apex.y - py * s };

  return [
    line(a, center),
    line(c, center),
    `<path d="M ${baseL.x} ${baseL.y} L ${baseR.x} ${baseR.y} L ${apex.x} ${apex.y} Z" fill="#111"/>`,
    line(barL, barR), // barre de cathode
  ].join('');
}

/** Résistance : zigzag entre les deux pattes. */
function resistor(pins: PinPoint[]): string | null {
  const a = find(pins, '1');
  const b = find(pins, '2');
  if (!a || !b) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const lead = len * 0.25; // amorces droites
  const zigStart = { x: a.x + ux * lead, y: a.y + uy * lead };
  const zigEnd = { x: b.x - ux * lead, y: b.y - uy * lead };
  const zigLen = len - 2 * lead;
  const n = 6; // dents
  const amp = 5;

  let d = `M ${a.x} ${a.y} L ${zigStart.x} ${zigStart.y}`;
  for (let i = 1; i < n; i++) {
    const t = (i / n) * zigLen;
    const side = i % 2 === 0 ? 1 : -1;
    const x = zigStart.x + ux * t + px * amp * side;
    const y = zigStart.y + uy * t + py * amp * side;
    d += ` L ${x} ${y}`;
  }
  d += ` L ${zigEnd.x} ${zigEnd.y} L ${b.x} ${b.y}`;
  return `<path d="${d}"/>`;
}

/** Buzzer : pastille centrale (+ et ~) reliée aux deux bornes. */
function buzzer(pins: PinPoint[]): string | null {
  const a = find(pins, '1');
  const b = find(pins, '2');
  if (!a || !b) return null;
  const center = mid(a, b);
  const r = Math.min(11, Math.hypot(b.x - a.x, b.y - a.y) / 3);
  return [
    line(a, center),
    line(b, center),
    `<circle cx="${center.x}" cy="${center.y}" r="${r}" fill="none"/>`,
    `<text x="${center.x}" y="${center.y + 3}" font-size="${r}" fill="#111" stroke="none" text-anchor="middle" font-family="sans-serif">+</text>`,
  ].join('');
}

/**
 * Tracé du câblage interne d'un composant (repère local), ou null si aucun
 * schéma n'est défini pour ce type.
 */
export function internalWiringSvg(kind: string, pins: PinPoint[]): string | null {
  switch (kind) {
    case 'pushbutton':
      return pushbutton(pins);
    case 'led':
      return led(pins);
    case 'resistor':
      return resistor(pins);
    case 'buzzer':
      return buzzer(pins);
    default:
      return null;
  }
}
