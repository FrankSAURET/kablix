// Schémas du câblage interne des composants, superposés en semi-transparence
// quand un composant est sélectionné (dessin noir sur fond blanc translucide).
// Les tracés sont produits dans le repère local du composant (mêmes coordonnées
// que les broches `pinInfo`), donc ils suivent rotation et retournement du corps.

// Schémas du clavier dessinés à la main (Inkscape) puis nettoyés
// (scripts/_clean-keypad-schema.mjs) — viewBox = repère interne (mm × 96/25,4).
import keypadSchema4 from '../composants/interne/keypad-4col.schema.svg';
import keypadSchema3 from '../composants/interne/keypad-3col-schema.svg';
import potSchema from '../composants/interne/pot-schema.svg';
// Schémas 7 segments dessinés à la main (Inkscape), nettoyés
// (scripts/_clean-7seg-schema.mjs) → variante cathode commune ; la variante anode
// est générée par retournement des diodes (scripts/_flip-7seg-diodes.mjs).
import sevenSegK1 from '../composants/interne/7seg-schema.clean.svg';
import sevenSegK2 from '../composants/interne/7seg-2dig.schema.clean.svg';
import sevenSegK4 from '../composants/interne/7seg-4dig-schema.clean.svg';
import sevenSegA1 from '../composants/interne/7seg-schema.anode.svg';
import sevenSegA2 from '../composants/interne/7seg-2dig.schema.anode.svg';
import sevenSegA4 from '../composants/interne/7seg-4dig-schema.anode.svg';

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

/** Flèche : segment `from`→`to` avec une pointe (deux barbes) à `to`. */
function arrow(from: XY, to: XY, size = 6): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const base = { x: to.x - ux * size, y: to.y - uy * size };
  const b1 = { x: base.x + px * size * 0.5, y: base.y + py * size * 0.5 };
  const b2 = { x: base.x - px * size * 0.5, y: base.y - py * size * 0.5 };
  return line(from, to) + line(to, b1) + line(to, b2);
}

/**
 * Symbole de diode IEC 60617 le long de [from, to] : triangle blanc translucide
 * (60 %), puis le conducteur noir patte-à-patte et la barre de cathode tracés
 * par-dessus. `cathodeAtEnd` place la barre côté `to` (sinon côté `from`).
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
    `<path d="M ${baseL.x} ${baseL.y} L ${baseR.x} ${baseR.y} L ${apex.x} ${apex.y} Z" fill="#fff" fill-opacity="0.6"/>`,
    line(from, to), // conducteur patte-à-patte, noir, par-dessus
    line(barL, barR), // barre de cathode
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
    `<path d="M ${baseL.x} ${baseL.y} L ${baseR.x} ${baseR.y} L ${apex.x} ${apex.y} Z" fill="#fff" fill-opacity="0.6"/>`,
    line(a, c), // conducteur patte-à-patte, noir, par-dessus
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
 * Afficheur 7 segments : schéma interne dessiné à la main par Frank (Inkscape),
 * nettoyé puis embarqué. Deux variantes par nombre de chiffres — cathode commune
 * (fichiers `.clean.svg`) et anode commune (`.anode.svg`, diodes retournées). Le
 * schéma est dans le repère du corps (viewBox = w×h de la variante) : on le met à
 * l'échelle de la boîte du composant. `attrs.common` choisit la variante.
 */
// Boîte des broches du tracé dessiné (Inkscape), par nombre de chiffres : bornes
// X/Y des extrémités de fils, mesurées via scripts/_probe-7seg-pins.mjs + bbox du
// tracé (getBBox headless). On CALE cette boîte sur la boîte des broches réelles
// du composant (min/max des pinInfo) — un mapping 2D « comme un poster » : les fils
// tombent alors exactement sur les pastilles, quel que soit l'espacement réel.
const SCHEMA_PIN_BBOX: Record<'1' | '2' | '4', { x0: number; x1: number; y0: number; y1: number }> = {
  '1': { x0: 9.9, x1: 52.4, y0: 9.4, y1: 80.1 },
  '2': { x0: 6.3, x1: 98.0, y0: 9.9, y1: 73.6 },
  '4': { x0: 6.0, x1: 198.2, y0: 9.9, y1: 79.9 },
};

function sevenSegment(
  pins: PinPoint[],
  attrs?: Record<string, string>,
  box?: { w: number; h: number }
): string | null {
  const commonAnode = attrs?.common === 'anode';
  const digits = (attrs?.digits ?? '1') as '1' | '2' | '4';
  const schema = SEVEN_SEG_SCHEMA[commonAnode ? 'anode' : 'cathode'][digits] ?? SEVEN_SEG_SCHEMA.cathode['1'];
  if (!box) return schema.inner;
  // Boîte des broches réelles (min/max des pinInfo) dans le repère du composant.
  const xs = pins.map((p) => p.x);
  const ys = pins.map((p) => p.y);
  const px0 = Math.min(...xs), px1 = Math.max(...xs);
  const py0 = Math.min(...ys), py1 = Math.max(...ys);
  const s = SCHEMA_PIN_BBOX[digits];
  // Étirement + translation qui envoient [s.x0,s.x1]→[px0,px1] et [s.y0,s.y1]→[py0,py1].
  const kx = (px1 - px0) / (s.x1 - s.x0);
  const ky = (py1 - py0) / (s.y1 - s.y0);
  const tx = px0 - s.x0 * kx;
  const ty = py0 - s.y0 * ky;
  // Puis mise à l'échelle du corps (repère composant → pixels de la boîte).
  const sbx = box.w / schema.w;
  const sby = box.h / schema.h;
  return (
    `<g transform="scale(${sbx.toFixed(4)} ${sby.toFixed(4)})">` +
    `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${kx.toFixed(4)} ${ky.toFixed(4)})">${schema.inner}</g>` +
    `</g>`
  );
}

/** Schéma interne dessiné à la main, par variante de colonnes. Le viewBox du SVG
 *  source donne le repère (w, h) à mettre à l'échelle du corps. */
function parseSchema(svg: string): { inner: string; w: number; h: number } {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { inner, w: vb ? Number(vb[1]) : 1, h: vb ? Number(vb[2]) : 1 };
}
const KEYPAD_SCHEMA: Record<'3' | '4', { inner: string; w: number; h: number }> = {
  '4': parseSchema(keypadSchema4),
  '3': parseSchema(keypadSchema3),
};
// Schémas 7 segments par (type de commun × nombre de chiffres).
type Schema = { inner: string; w: number; h: number };
const SEVEN_SEG_SCHEMA: Record<'cathode' | 'anode', Record<'1' | '2' | '4', Schema>> = {
  cathode: { '1': parseSchema(sevenSegK1), '2': parseSchema(sevenSegK2), '4': parseSchema(sevenSegK4) },
  anode: { '1': parseSchema(sevenSegA1), '2': parseSchema(sevenSegA2), '4': parseSchema(sevenSegA4) },
};
const POT_SCHEMA = parseSchema(potSchema);
// Pastille de référence GND du dessin (repère du .edit.svg) : le schéma est
// posé sur les broches réelles par translation (même pas de 10 px, GND/SIG/VCC).
const POT_REF_GND = { x: 29, y: 68.5 };

/**
 * Potentiomètre rotatif : schéma interne dessiné à la main (boîte résistive
 * entre GND et VCC, flèche du curseur depuis SIG), aligné sur les broches
 * réelles par translation depuis la pastille de référence GND.
 */
function rotaryPot(pins: PinPoint[]): string | null {
  const gnd = find(pins, 'GND');
  if (!gnd) return null;
  const dx = (gnd.x - POT_REF_GND.x).toFixed(2);
  const dy = (gnd.y - POT_REF_GND.y).toFixed(2);
  return `<g transform="translate(${dx} ${dy})">${POT_SCHEMA.inner}</g>`;
}

/**
 * Clavier matriciel : schéma interne dessiné à la main (matrice rangées × colonnes,
 * un poussoir par intersection, bus de lignes et de colonnes vers le connecteur).
 * Le dessin est dans le repère interne ; on le met à l'échelle du corps `box`.
 */
function keypad(attrs?: Record<string, string>, box?: { w: number; h: number }): string {
  const s = KEYPAD_SCHEMA[attrs?.columns === '3' ? '3' : '4'];
  if (!box) return s.inner;
  const sx = (box.w / s.w).toFixed(4);
  const sy = (box.h / s.h).toFixed(4);
  return `<g transform="scale(${sx} ${sy})">${s.inner}</g>`;
}

/**
 * Potentiomètre (symbole IEC) : boîte résistive horizontale centrée, reliée à VCC
 * et GND, avec le curseur (SIG) qui tape le milieu via une flèche perpendiculaire.
 * Ne sert plus qu'au modèle à glissière (le rotatif a son schéma dessiné à la main).
 */
function potentiometer(pins: PinPoint[], box?: { w: number; h: number }): string | null {
  const vcc = find(pins, 'VCC'); // Point de connexion
  const gnd = find(pins, 'GND'); // Point de connexion
  const sig = find(pins, 'SIG'); // Point de connexion
  if (!vcc || !gnd || !sig) return null;
  const w = 80; // largeur résistance
  const h = 30; // hauteur résistance
  // Centre la boîte sur l'axe VCC↔GND (horizontal/vertical).
  const cx = (vcc.x + gnd.x) / 2;
  const cy = (vcc.y + gnd.y) / 2;
  const half = Math.min(w * 0.32, 70); // demi-longueur de la boîte
  const bh = Math.min(h * 0.22, 8); // demi-hauteur de la boîte
  const left = { x: cx - half, y: cy };
  const right = { x: cx + half, y: cy };
  const side = sig.y >= cy ? 1 : -1; // côté d'où arrive le curseur
  const tip = { x: cx, y: cy + side * bh }; // pointe sur le bord de la boîte
  const tail = { x: cx, y: cy + side * (bh + 10) }; // base de la flèche
  const inter1={x:sig.x+40,y:sig.y};
  const inter2={x:inter1.x,y:tail.y}
  return [
    `<path d="M ${left.x} ${cy - bh} L ${right.x} ${cy - bh} L ${right.x} ${cy + bh} L ${left.x} ${cy + bh} Z"/>`,
    line(vcc, left), // amorce vers VCC
    line(gnd, right), // amorce vers GND
    line(sig,inter1),
    line(inter1,inter2),
    line(inter2, tail),
    arrow(tail, tip), // flèche du curseur sur la boîte
  ].join('');
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
  if (type === 'keypad') return keypad(attrs, box);
  // Rotatif : schéma dessiné à la main ; la glissière garde le symbole procédural.
  if (type === 'pot') return rotaryPot(pins);
  switch (kind) {
    case 'pushbutton':
      return pushbutton(pins);
    case 'led':
      return led(pins);
    case 'resistor':
      return resistor(pins);
    case 'led-bar':
      return ledBar(pins);
    case '7segment':
      return sevenSegment(pins, attrs, box);
    case 'potentiometer':
      return potentiometer(pins, box);
    default:
      return null;
  }
}
