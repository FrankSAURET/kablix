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

/**
 * Symbole de diode le long de [from, to] : triangle + barre de cathode.
 * `cathodeAtEnd` place la barre côté `to` (sinon côté `from`).
 */
function diode(from: XY, to: XY, cathodeAtEnd: boolean): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const c = mid(from, to);
  const s = Math.min(6, len / 3);
  const dir = cathodeAtEnd ? 1 : -1; // sens A → K
  const apex = { x: c.x + ux * s * dir, y: c.y + uy * s * dir };
  const baseL = { x: c.x - ux * s * dir + px * s, y: c.y - uy * s * dir + py * s };
  const baseR = { x: c.x - ux * s * dir - px * s, y: c.y - uy * s * dir - py * s };
  const barL = { x: apex.x + px * s, y: apex.y + py * s };
  const barR = { x: apex.x - px * s, y: apex.y - py * s };
  return [
    line(from, to),
    `<path d="M ${baseL.x} ${baseL.y} L ${baseR.x} ${baseR.y} L ${apex.x} ${apex.y} Z" fill="#111"/>`,
    line(barL, barR),
  ].join('');
}

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

/**
 * Résistance : symbole rectangulaire IEC/IEEE (boîte) entre les deux pattes,
 * conformément à la norme employée en France (et non le zigzag ANSI).
 */
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
  const c = mid(a, b);
  const half = Math.min(len * 0.3, 14); // demi-longueur du rectangle
  const w = 6; // demi-largeur du rectangle
  const s = { x: c.x - ux * half, y: c.y - uy * half }; // entrée de la boîte
  const e = { x: c.x + ux * half, y: c.y + uy * half }; // sortie de la boîte
  const corner = (pt: XY, sign: number): XY => ({ x: pt.x + px * w * sign, y: pt.y + py * w * sign });
  const s1 = corner(s, 1);
  const s2 = corner(s, -1);
  const e1 = corner(e, 1);
  const e2 = corner(e, -1);

  return [
    line(a, s), // amorce gauche
    line(e, b), // amorce droite
    `<path d="M ${s1.x} ${s1.y} L ${e1.x} ${e1.y} L ${e2.x} ${e2.y} L ${s2.x} ${s2.y} Z"/>`,
  ].join('');
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

/** Barre de LED : une diode (A→K) par segment, sur les 10 paires A{i}/C{i}. */
function ledBar(pins: PinPoint[]): string | null {
  const out: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const a = find(pins, `A${i}`);
    const c = find(pins, `C${i}`);
    if (a && c) out.push(diode(a, c, true));
  }
  return out.length > 0 ? out.join('') : null;
}

/**
 * Afficheur 7 segments : étoile de 8 diodes (A–G, DP) reliées au point commun.
 * Le sens dépend du type : cathode commune (barres côté commun) ou anode commune
 * (barres côté segment). Le commun est la broche COM.1/COM.2 si présente, sinon
 * le barycentre des segments.
 */
function sevenSegment(pins: PinPoint[], attrs?: Record<string, string>): string | null {
  const segNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'];
  const segs = segNames.map((n) => find(pins, n)).filter((p): p is XY => p !== null);
  if (segs.length < 2) return null;
  const com =
    find(pins, 'COM.1') ?? find(pins, 'COM.2') ?? find(pins, 'COM') ?? find(pins, 'DIG1') ?? {
      x: segs.reduce((s, p) => s + p.x, 0) / segs.length,
      y: segs.reduce((s, p) => s + p.y, 0) / segs.length,
    };
  const commonAnode = attrs?.common === 'anode';
  const out = segs.map((p) => diode(p, com, !commonAnode)); // cathode au commun si cathode commune
  out.push(dot(com, 2)); // nœud commun
  return out.join('');
}

/**
 * Clavier matriciel : la matrice rangées × colonnes. Bus horizontaux (rangées)
 * et verticaux (colonnes) rejoignant les broches R/C du connecteur (en bas), avec
 * un poussoir (cercle ouvert) à chaque intersection rangée × colonne.
 */
function keypad(pins: PinPoint[], box?: { w: number; h: number }): string | null {
  const rows = ['R1', 'R2', 'R3', 'R4'].map((n) => find(pins, n)).filter((p): p is XY => p !== null);
  const cols = ['C1', 'C2', 'C3', 'C4'].map((n) => find(pins, n)).filter((p): p is XY => p !== null);
  if (rows.length < 2 || cols.length < 2) return null;
  const pinY = rows[0].y; // strip du connecteur (toutes les broches à ce y)
  const xs = [...rows, ...cols].map((p) => p.x);
  // Aire des touches : sur toute la largeur/hauteur du clavier (box), au-dessus du
  // connecteur. À défaut de box, repli sur l'empan des broches.
  const W = box?.w ?? Math.max(...xs) + Math.min(...xs);
  const left = box ? W * 0.1 : Math.min(...xs);
  const right = box ? W * 0.9 : Math.max(...xs);
  const top = box ? box.h * 0.08 : pinY - (right - left);
  const bot = Math.min(box ? box.h * 0.8 : pinY - 28, pinY - 28);
  const rowY = (i: number): number => top + ((bot - top) * (i + 0.5)) / rows.length;
  const colX = (j: number): number => left + ((right - left) * (j + 0.5)) / cols.length;
  const out: string[] = [];
  rows.forEach((rp, i) => {
    const y = rowY(i);
    out.push(line({ x: colX(0), y }, { x: colX(cols.length - 1), y })); // bus de rangée
    out.push(line({ x: colX(0), y }, rp)); // bus → broche Ri (connecteur, en bas)
  });
  cols.forEach((cp, j) => {
    const x = colX(j);
    out.push(line({ x, y: rowY(0) }, { x, y: bot })); // bus de colonne
    out.push(line({ x, y: bot }, cp)); // bus → broche Cj (connecteur, en bas)
  });
  // Poussoir (cercle clair) à chaque intersection : un appui relie rangée↔colonne.
  rows.forEach((_, i) =>
    cols.forEach((_, j) => {
      out.push(`<circle cx="${colX(j)}" cy="${rowY(i)}" r="5" fill="rgba(255,255,255,0.85)"/>`);
    })
  );
  return out.join('');
}

/**
 * Tracé du câblage interne d'un composant (repère local), ou null si aucun
 * schéma n'est défini. `attrs` varie le schéma (ex. 7 segments cathode/anode) ;
 * `type` distingue les composants partageant un même `kind` (ex. clavier).
 */
export function internalWiringSvg(
  kind: string,
  pins: PinPoint[],
  attrs?: Record<string, string>,
  type?: string,
  box?: { w: number; h: number }
): string | null {
  if (type === 'keypad') return keypad(pins, box);
  switch (kind) {
    case 'pushbutton':
      return pushbutton(pins);
    case 'led':
      return led(pins);
    case 'resistor':
      return resistor(pins);
    case 'buzzer':
      return buzzer(pins);
    case 'led-bar':
      return ledBar(pins);
    case '7segment':
      return sevenSegment(pins, attrs);
    default:
      return null;
  }
}
