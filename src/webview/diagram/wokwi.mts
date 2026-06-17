// Interopérabilité avec le format de projet Wokwi (« diagram.json »).
// Les composants intégrés de Kablix utilisent déjà les éléments @wokwi/elements
// (mêmes tags, mêmes noms de broches), la conversion est donc directe :
//   - type      : tag @wokwi/elements (cas particuliers : carte Pico et platine) ;
//   - position  : left = x, top = y (pixels) ; rotate = rotation ;
//   - liaisons  : [ "idA:broche", "idB:broche", couleur, chemin ].
// Limites assumées : le retournement (flipH/flipV) et les coudes de fils n'ont
// pas d'équivalent dans diagram.json (fils exportés droits) ; les composants
// personnalisés (kablix-custom-part) et les types Wokwi inconnus sont ignorés.

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

export interface WokwiDiagram {
  version: number;
  author?: string;
  editor?: string;
  parts: WokwiPart[];
  connections: WokwiConnection[];
  dependencies?: Record<string, string>;
}

// Types Kablix dont le tag ne suffit pas (composants maison ↔ éléments Wokwi).
// Pico / Pico W utilisent le dessin maison <kablix-pico-board> : on les mappe
// explicitement vers leurs types Wokwi pour l'import/export du diagram.json.
const KABLIX_TO_WOKWI: Record<string, string> = {
  pico: 'wokwi-pi-pico',
  picow: 'wokwi-pi-pico-w',
  breadboard: 'wokwi-breadboard',
};

function wokwiTypeOf(def: PartDef): string {
  return KABLIX_TO_WOKWI[def.type] ?? def.tag; // les autres tags sont déjà « wokwi-… »
}

/** Type interne Kablix correspondant à un type Wokwi, ou null si inconnu. */
function kablixTypeOf(wokwiType: string): string | null {
  for (const [k, w] of Object.entries(KABLIX_TO_WOKWI)) {
    if (w === wokwiType) return k;
  }
  const def = CATALOG.find((d) => d.tag === wokwiType);
  return def ? def.type : null;
}

function splitEndpoint(s: unknown): Endpoint | null {
  if (typeof s !== 'string') return null;
  const i = s.indexOf(':');
  if (i < 0) return null;
  return { partId: s.slice(0, i), pin: s.slice(i + 1) };
}

/** Schéma Kablix → projet Wokwi (diagram.json). */
export function toWokwiDiagram(diagram: Diagram): WokwiDiagram {
  const parts: WokwiPart[] = diagram.parts.map((p) => {
    const part: WokwiPart = {
      type: wokwiTypeOf(partDef(p.type)),
      id: p.id,
      top: Math.round(p.y),
      left: Math.round(p.x),
      attrs: { ...(p.attrs ?? {}) },
    };
    if (p.rotation) part.rotate = p.rotation;
    return part;
  });

  const connections: WokwiConnection[] = [];
  for (const w of diagram.wires) {
    if (w.auto) continue; // liaisons implicites d'enfichage : non exportées
    connections.push([`${w.a.partId}:${w.a.pin}`, `${w.b.partId}:${w.b.pin}`, w.color ?? 'green', []]);
  }

  return { version: 1, author: 'Kablix', editor: 'kablix', parts, connections, dependencies: {} };
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
    parts.push({
      id: wp.id,
      type,
      x: Number(wp.left) || 0,
      y: Number(wp.top) || 0,
      rotation: Number(wp.rotate) || undefined,
      attrs,
    });
    knownIds.add(wp.id);
  }

  const wires: Wire[] = [];
  let seq = 0;
  for (const conn of Array.isArray(data.connections) ? data.connections : []) {
    const a = splitEndpoint(conn?.[0]);
    const b = splitEndpoint(conn?.[1]);
    if (!a || !b) continue;
    if (!knownIds.has(a.partId) || !knownIds.has(b.partId)) continue; // extrémité ignorée
    const color = typeof conn[2] === 'string' ? conn[2] : undefined;
    wires.push({ id: `w-wokwi-${++seq}`, a, b, color });
  }

  return { parts, wires, skipped: [...new Set(skipped)] };
}
