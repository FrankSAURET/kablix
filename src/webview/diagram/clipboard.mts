// Presse-papier de schéma : format d'échange d'une sélection (composants +
// fils) d'un atelier Kablix à un AUTRE, par le presse-papier du système.
//
// Le presse-papier ne transporte qu'UN texte : il porte donc à la fois le
// dessin et les données. Le texte copié reste le SVG de la sélection (collable
// dans Inkscape, un éditeur de texte, un traitement de texte — comportement
// d'avant conservé) et le schéma s'y cache dans une balise `<metadata>` —
// ignorée par tout afficheur SVG, retrouvée par Kablix au collage. Aucun format
// n'est perdu, et un SVG copié depuis Kablix se recolle DANS Kablix tel qu'il
// était, y compris dans un autre projet.
//
// Le JSON est écrit avec `<`, `>` et `&` remplacés par leur échappement
// numérique JSON (u003c, u003e, u0026) : il reste du JSON valide ET du texte
// XML valide, donc lisible tel quel dans le SVG (pas de base64 opaque, pas de
// CDATA à refermer).
//
// Module séparé de editor.mts (bundle de plusieurs Mo, non testable en Node)
// pour que le banc `verify:clipboard` éprouve l'encodage et la relecture sur de
// VRAIES données, et pas par relecture de la source.
import type { Part, Wire } from './model.mjs';

/** Contenu échangé : ce que `copySelection` copie, ce que `paste` recrée. */
export interface ClipboardPayload {
  parts: Part[];
  wires: Wire[];
}

/** Marqueur de version du format (une relecture ne prend que ce qu'elle sait lire). */
export const CLIPBOARD_TAG = 'KABLIX-CLIPBOARD-V1';

/** Identifiant de la balise porteuse dans le SVG. */
const METADATA_ID = 'kablix-clipboard';

/** Caractères interdits dans du texte XML, réécrits en échappement JSON. */
const XML_UNSAFE: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
};

/**
 * Sérialise une sélection. Les fils `auto` (enfichage sur platine / socle) sont
 * conservés par l'appelant quand leurs DEUX extrémités sont dans la sélection :
 * une Pico copiée avec son shield garde ainsi ses connexions, comme à
 * l'enregistrement d'un projet.
 */
export function encodeClipboard(payload: ClipboardPayload): string {
  const json = JSON.stringify({ kablix: CLIPBOARD_TAG, parts: payload.parts, wires: payload.wires });
  return json.replace(/[<>&]/g, (c) => XML_UNSAFE[c]);
}

/** Insère le schéma sérialisé dans le SVG exporté, juste après la balise `<svg …>`. */
export function embedClipboardInSvg(svg: string, encoded: string): string {
  const meta = `<metadata id="${METADATA_ID}">${CLIPBOARD_TAG}:${encoded}</metadata>`;
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open) return `${svg}\n${meta}`;
  const at = (open.index ?? 0) + open[0].length;
  return `${svg.slice(0, at)}\n${meta}${svg.slice(at)}`;
}

/**
 * Relit un texte du presse-papier : SVG produit par Kablix (schéma dans sa
 * balise `<metadata>`) ou charge utile brute. Renvoie `null` pour tout autre
 * texte — un collage de texte quelconque ne doit RIEN changer au schéma.
 */
export function extractClipboard(text: string): ClipboardPayload | null {
  if (typeof text !== 'string' || !text.includes(CLIPBOARD_TAG)) return null;
  const inSvg = text.match(
    new RegExp(`<metadata\\b[^>]*id="${METADATA_ID}"[^>]*>\\s*${CLIPBOARD_TAG}:([\\s\\S]*?)</metadata>`)
  );
  const raw = inSvg ? inSvg[1].trim() : text.slice(text.indexOf(CLIPBOARD_TAG)).replace(`${CLIPBOARD_TAG}:`, '').trim();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null; // texte tronqué (copie partielle) : on ne colle rien
  }
  return normalizePayload(data);
}

/** Valide la forme des données relues : tout ce qui n'est pas exploitable est écarté. */
function normalizePayload(data: unknown): ClipboardPayload | null {
  if (!data || typeof data !== 'object') return null;
  const src = data as { kablix?: unknown; parts?: unknown; wires?: unknown };
  if (src.kablix !== CLIPBOARD_TAG || !Array.isArray(src.parts)) return null;
  const parts: Part[] = [];
  for (const p of src.parts) {
    const part = normalizePart(p);
    if (part) parts.push(part);
  }
  if (parts.length === 0) return null;
  const known = new Set(parts.map((p) => p.id));
  const wires: Wire[] = [];
  for (const w of Array.isArray(src.wires) ? src.wires : []) {
    const wire = normalizeWire(w, known);
    if (wire) wires.push(wire);
  }
  return { parts, wires };
}

function normalizePart(value: unknown): Part | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Partial<Part> & Record<string, unknown>;
  if (typeof p.id !== 'string' || typeof p.type !== 'string') return null;
  if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) return null;
  const part: Part = { id: p.id, type: p.type, x: p.x, y: p.y };
  if (p.attrs && typeof p.attrs === 'object') {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.attrs as Record<string, unknown>)) {
      if (typeof v === 'string') attrs[k] = v;
    }
    part.attrs = attrs;
  }
  if (isFiniteNumber(p.rotation)) part.rotation = p.rotation;
  if (p.flipH === true) part.flipH = true;
  if (p.flipV === true) part.flipV = true;
  return part;
}

function normalizeWire(value: unknown, known: Set<string>): Wire | null {
  if (!value || typeof value !== 'object') return null;
  const w = value as Partial<Wire> & Record<string, unknown>;
  if (typeof w.id !== 'string') return null;
  const a = normalizeEndpoint(w.a, known);
  const b = normalizeEndpoint(w.b, known);
  if (!a || !b) return null; // fil dont une extrémité n'est pas dans la copie
  const wire: Wire = { id: w.id, a, b };
  if (Array.isArray(w.points)) {
    wire.points = w.points
      .filter((pt): pt is { x: number; y: number } =>
        !!pt && typeof pt === 'object' && isFiniteNumber((pt as { x?: unknown }).x) && isFiniteNumber((pt as { y?: unknown }).y))
      .map((pt) => ({ x: pt.x, y: pt.y }));
  }
  if (typeof w.color === 'string') wire.color = w.color;
  if (w.auto === true) wire.auto = true;
  return wire;
}

function normalizeEndpoint(value: unknown, known: Set<string>): { partId: string; pin: string } | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as { partId?: unknown; pin?: unknown };
  if (typeof e.partId !== 'string' || typeof e.pin !== 'string') return null;
  return known.has(e.partId) ? { partId: e.partId, pin: e.pin } : null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
