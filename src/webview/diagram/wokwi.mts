// Interopérabilité avec le format de projet Wokwi (« diagram.json »).
// Les composants intégrés de Kablix utilisent déjà les éléments @wokwi/elements
// (mêmes tags, mêmes noms de broches), la conversion est donc directe :
//   - type      : tag @wokwi/elements (cas particuliers : carte Pico et platine) ;
//   - position  : left = x, top = y (pixels) ; rotate = rotation ;
//   - liaisons  : [ "idA:broche", "idB:broche", couleur, chemin ].
//
// Le retournement (flipH/flipV) et les coudes de fils n'ont pas d'équivalent
// standard dans diagram.json. Pour ne plus les perdre lors d'un aller-retour, ils
// sont conservés dans un bloc d'extension `kablix` (clé de premier niveau)
// qu'un éditeur Wokwi ignore : les `parts`/`connections` restent strictement au
// format Wokwi (donc lisibles par Wokwi), et Kablix retrouve l'info à la
// réimportation. Les composants personnalisés (kablix-custom-part) et les types
// Wokwi inconnus restent ignorés (signalés dans `skipped`).

import { CATALOG, partDef, type PartDef } from './catalog.mjs';
import type { Diagram, Endpoint, Part, Wire } from './model.mjs';

export interface WokwiPart {
  type: string;
  id: string;
  top: number;
  left: number;
  rotate?: number;
  attrs: Record<string, string>;
}

/** [ extrémité A "id:pin", extrémité B "id:pin", couleur, chemin ]. */
export type WokwiConnection = [string, string, string, string[]];

/** Point intermédiaire (coude) d'un fil, coordonnées canvas. */
interface XY {
  x: number;
  y: number;
}

/**
 * Extension Kablix stockée dans le diagram.json (clé `kablix`). Conserve les
 * informations sans équivalent Wokwi : retournement des composants et coudes des
 * fils (indexés sur la position de la connexion dans `connections`).
 */
export interface KablixExtension {
  version: number;
  /** Retournement par composant (id → flipH/flipV). */
  parts?: Record<string, { flipH?: boolean; flipV?: boolean }>;
  /** Coudes des fils : `i` = index dans `connections`, `points` = coordonnées. */
  wires?: Array<{ i: number; points: XY[] }>;
}

export interface WokwiDiagram {
  version: number;
  author?: string;
  editor?: string;
  parts: WokwiPart[];
  connections: WokwiConnection[];
  dependencies?: Record<string, string>;
  /** Extension propre à Kablix (ignorée par Wokwi). */
  kablix?: KablixExtension;
}

// Types Kablix dont le tag ne suffit pas (composants maison ↔ éléments Wokwi).
// Pico / Pico W utilisent le dessin maison <kablix-pico-board> : on les mappe
// explicitement vers leurs types Wokwi. Wokwi a renommé ces cartes en
// « board-pi-pico » / « board-pi-pico-w » (anciennement « wokwi-pi-pico… ») :
// on EXPORTE le nom actuel et on IMPORTE les deux (rétrocompatibilité).
const KABLIX_TO_WOKWI: Record<string, string> = {
  pico: 'board-pi-pico',
  picow: 'board-pi-pico-w',
  breadboard: 'wokwi-breadboard',
  // dessin maison <kablix-slide-potentiometer> ↔ élément Wokwi standard.
  'slide-pot': 'wokwi-slide-potentiometer',
};

/** Anciens noms Wokwi acceptés à l'import (→ type Kablix). */
const WOKWI_ALIASES: Record<string, string> = {
  'wokwi-pi-pico': 'pico',
  'wokwi-pi-pico-w': 'picow',
  'wokwi-pico': 'pico',
};

function wokwiTypeOf(def: PartDef): string {
  return KABLIX_TO_WOKWI[def.type] ?? def.tag; // les autres tags sont déjà « wokwi-… »
}

/** Type interne Kablix correspondant à un type Wokwi, ou null si inconnu. */
function kablixTypeOf(wokwiType: string): string | null {
  for (const [k, w] of Object.entries(KABLIX_TO_WOKWI)) {
    if (w === wokwiType) return k;
  }
  if (WOKWI_ALIASES[wokwiType]) return WOKWI_ALIASES[wokwiType];
  const def = CATALOG.find((d) => d.tag === wokwiType);
  return def ? def.type : null;
}

function splitEndpoint(s: unknown): Endpoint | null {
  if (typeof s !== 'string') return null;
  const i = s.indexOf(':');
  if (i < 0) return null;
  return { partId: s.slice(0, i), pin: s.slice(i + 1) };
}

/** Coordonnées valides (nombres finis) d'un coude, ou null. */
function cleanPoint(p: unknown): XY | null {
  const q = p as { x?: unknown; y?: unknown } | null;
  const x = Number(q?.x);
  const y = Number(q?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Schéma Kablix → projet Wokwi (diagram.json). */
export function toWokwiDiagram(diagram: Diagram): WokwiDiagram {
  const flips: KablixExtension['parts'] = {};
  const parts: WokwiPart[] = diagram.parts.map((p) => {
    const part: WokwiPart = {
      type: wokwiTypeOf(partDef(p.type)),
      id: p.id,
      top: Math.round(p.y),
      left: Math.round(p.x),
      attrs: { ...(p.attrs ?? {}) },
    };
    if (p.rotation) part.rotate = p.rotation;
    if (p.flipH || p.flipV) {
      flips[p.id] = {
        ...(p.flipH ? { flipH: true } : {}),
        ...(p.flipV ? { flipV: true } : {}),
      };
    }
    return part;
  });

  const connections: WokwiConnection[] = [];
  const wireExt: KablixExtension['wires'] = [];
  for (const w of diagram.wires) {
    if (w.auto) continue; // liaisons implicites d'enfichage : non exportées
    const i = connections.length;
    connections.push([`${w.a.partId}:${w.a.pin}`, `${w.b.partId}:${w.b.pin}`, w.color ?? 'green', []]);
    const points = (w.points ?? []).map(cleanPoint).filter((p): p is XY => p !== null);
    if (points.length > 0) wireExt.push({ i, points });
  }

  const out: WokwiDiagram = {
    version: 1,
    author: 'Kablix',
    editor: 'kablix',
    parts,
    connections,
    dependencies: {},
  };
  const hasFlips = Object.keys(flips).length > 0;
  if (hasFlips || wireExt.length > 0) {
    out.kablix = {
      version: 1,
      ...(hasFlips ? { parts: flips } : {}),
      ...(wireExt.length > 0 ? { wires: wireExt } : {}),
    };
  }
  return out;
}

export interface FromWokwiResult {
  parts: Part[];
  wires: Wire[];
  /** Types Wokwi rencontrés sans équivalent Kablix (ignorés). */
  skipped: string[];
}

/** Projet Wokwi (diagram.json) → schéma Kablix. Tolérant aux champs absents. */
export function fromWokwiDiagram(json: unknown): FromWokwiResult {
  const data = (json ?? {}) as Partial<WokwiDiagram>;
  const ext = (data.kablix ?? {}) as KablixExtension;
  const extFlips = ext.parts ?? {};
  // Coudes de fils indexés sur la position de la connexion d'origine.
  const extPoints = new Map<number, XY[]>();
  for (const w of Array.isArray(ext.wires) ? ext.wires : []) {
    const pts = (w?.points ?? []).map(cleanPoint).filter((p): p is XY => p !== null);
    if (typeof w?.i === 'number' && pts.length > 0) extPoints.set(w.i, pts);
  }

  const parts: Part[] = [];
  const skipped: string[] = [];
  const knownIds = new Set<string>();

  for (const wp of Array.isArray(data.parts) ? data.parts : []) {
    const type = kablixTypeOf(wp?.type);
    if (!type || typeof wp.id !== 'string') {
      if (wp?.type) skipped.push(wp.type);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(wp.attrs ?? {})) attrs[k] = String(v);
    const flip = extFlips[wp.id];
    parts.push({
      id: wp.id,
      type,
      x: Number(wp.left) || 0,
      y: Number(wp.top) || 0,
      rotation: Number(wp.rotate) || undefined,
      attrs,
      ...(flip?.flipH ? { flipH: true } : {}),
      ...(flip?.flipV ? { flipV: true } : {}),
    });
    knownIds.add(wp.id);
  }

  const wires: Wire[] = [];
  let seq = 0;
  const connections = Array.isArray(data.connections) ? data.connections : [];
  for (let idx = 0; idx < connections.length; idx++) {
    const conn = connections[idx];
    const a = splitEndpoint(conn?.[0]);
    const b = splitEndpoint(conn?.[1]);
    if (!a || !b) continue;
    if (!knownIds.has(a.partId) || !knownIds.has(b.partId)) continue; // extrémité ignorée
    const color = typeof conn[2] === 'string' ? conn[2] : undefined;
    const points = extPoints.get(idx);
    wires.push({
      id: `w-wokwi-${++seq}`,
      a,
      b,
      color,
      ...(points && points.length > 0 ? { points } : {}),
    });
  }

  return { parts, wires, skipped: [...new Set(skipped)] };
}
