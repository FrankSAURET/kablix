// Volumes des pièces d'un document système, lus côté extension (piste 11, lot D6b).
//
// La webview ne lit ni ZIP ni disque : l'extension déplie ici les paquets
// `.kompix` désignés par les pièces `kompix` du document (`model3d.json`, ou
// le `model3d` rendu par `shape.mjs` lancé avec les valeurs par défaut des
// propriétés) et les maillages des pièces `fichier` (sous `system/` du
// `.projix`), puis envoie le tout à la webview, où
// `src/webview/mecanique/volumes.mts` en tire volumes et axes nommés.
// Les structures envoyées sont celles de `VolumesSysteme` de ce module-là
// (recopiées ici : l'extension n'importe rien de la webview).
//
// Lancement de `shape.mjs` : même méthode que `shape-runner.ts` de Kompix
// Editor (`node:vm`, contexte vide, génération de code par chaîne interdite,
// délai borné, entrée et sortie en JSON). Ce n'est pas une barrière de
// sécurité absolue : elle protège d'un script maladroit, pas d'un paquet
// hostile. Les paquets lus sont ceux de la bibliothèque de l'utilisateur.

import vm from 'node:vm';
// JSZip : type seul, la bibliothèque vit dans dist/zip.js, lue à la demande
// (même règle que `projix.ts` : rien de JSZip dans dist/extension.js).
import type JSZip from 'jszip';
import type { DocumentSysteme } from './systeme';

/** Délai d'un appel à `shape()` (ms) : une forme se calcule en quelques ms. */
export const DELAI_FORME_MS = 1000;

export interface VolumePaquet {
  type: string;
  model?: { assemblies: Record<string, unknown>; width?: number };
  origine?: 'model3d' | 'shape';
  maillages?: Record<string, string>;
  erreur?: string;
}

export interface MaillageFichier {
  format: 'stl' | 'glb' | 'gltf';
  base64: string;
}

export interface VolumesSysteme {
  paquets: Record<string, VolumePaquet>;
  fichiers: Record<string, MaillageFichier>;
}

type Param = { name: string; type?: string; value: unknown; min?: number; max?: number };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Module ES → script : `export` retiré, exports rangés dans `__kx` (copie de `shapeScript`). */
export function scriptDeForme(source: string): string {
  if (/^\s*import\b/m.test(source)) throw new Error('shape script: imports are not allowed');
  const names: string[] = [];
  let code = source.replace(/^(\s*)export\s+default\s+/m, '$1__kx.default = ');
  code = code.replace(/^(\s*)export\s+(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm, (_m, sp: string, kw: string, n: string) => {
    names.push(n);
    return `${sp}${kw} ${n}`;
  });
  if (/^\s*export\b/m.test(code)) throw new Error('shape script: unsupported export form');
  const exports = names.map((n) => `__kx[${JSON.stringify(n)}] = ${n};`).join('\n');
  return `(function () {\n${code}\n${exports}\n})();`;
}

/** Appelle `shape(props)` (export par défaut, ou export nommé `shape`) (copie de `runShape`). */
export function lancerForme(source: string, props: Record<string, unknown>, delai = DELAI_FORME_MS): unknown {
  const ctx = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext('var __kx = {};', ctx);
  vm.runInContext(scriptDeForme(source), ctx, { timeout: delai, filename: 'shape.mjs' });
  ctx.__props = JSON.stringify(props);
  const out = vm.runInContext(`(function () {
    var f = typeof __kx.default === 'function' ? __kx.default : __kx.shape;
    if (typeof f !== 'function') throw new Error('shape script: no default export and no "shape" function');
    var r = f(JSON.parse(__props));
    return r === undefined ? undefined : JSON.stringify(r);
  })()`, ctx, { timeout: delai, filename: 'shape.mjs' }) as unknown;
  if (typeof out !== 'string') throw new Error('shape script: shape() returned nothing');
  return JSON.parse(out) as unknown;
}

/** Valeurs par défaut des propriétés d'un manifeste (`paramProps` de kompix-core, sans valeur fixée). */
export function proprietesParDefaut(params: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(params)) return out;
  for (const p of params as Param[]) if (isObj(p) && typeof p.name === 'string') out[p.name] = p.value;
  return out;
}

/** Un volume a-t-il la forme minimale attendue (`assemblies` d'ensembles à axes) ? */
function volumeLisible(m: unknown): m is VolumePaquet['model'] & object {
  return isObj(m) && isObj(m.assemblies) && Object.values(m.assemblies).every((a) => isObj(a) && Array.isArray(a.pieces));
}

const messageDe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Déplie le volume d'un paquet `.kompix`. Ne lève jamais : un paquet sans
 * volume rend `model` absent, un volume annoncé mais illisible rend `erreur`.
 */
export async function volumeDePaquet(octets: Uint8Array, delai = DELAI_FORME_MS): Promise<VolumePaquet> {
  let zip: JSZip;
  let manifeste: Record<string, unknown>;
  try {
    zip = await (await import('./zip.js')).JSZip.loadAsync(octets);
    const brut = await zip.file('manifest.json')?.async('string');
    const m = brut === undefined ? undefined : (JSON.parse(brut) as unknown);
    if (!isObj(m) || typeof m.type !== 'string') return { type: '', erreur: 'manifest.json missing or invalid' };
    manifeste = m;
  } catch (e) {
    return { type: '', erreur: messageDe(e) };
  }
  const type = manifeste.type as string;
  let model: unknown;
  let origine: VolumePaquet['origine'];
  try {
    if (typeof manifeste.shape === 'string') {
      const source = await zip.file(manifeste.shape)?.async('string');
      if (source === undefined) return { type, erreur: `${manifeste.shape} is missing` };
      const r = lancerForme(source, proprietesParDefaut(manifeste.params), delai);
      if (!isObj(r) || r.model3d === undefined) return { type }; // forme à plat, sans volume
      model = r.model3d;
      origine = 'shape';
    } else {
      const chemin = typeof manifeste.model3d === 'string' ? manifeste.model3d : 'model3d.json';
      const brut = await zip.file(chemin)?.async('string');
      if (brut === undefined) {
        return typeof manifeste.model3d === 'string' ? { type, erreur: `${chemin} is missing` } : { type };
      }
      model = JSON.parse(brut) as unknown;
      origine = 'model3d';
    }
  } catch (e) {
    return { type, erreur: messageDe(e) };
  }
  if (!volumeLisible(model)) return { type, erreur: 'model3d: no readable assemblies' };
  // Pièces maillées du volume : leurs fichiers suivent, en base64.
  const maillages: Record<string, string> = {};
  for (const a of Object.values(model.assemblies)) {
    for (const p of (a as { pieces: unknown[] }).pieces) {
      if (!isObj(p) || typeof p.mesh !== 'string' || p.mesh in maillages) continue;
      const f = zip.file(p.mesh);
      if (f) maillages[p.mesh] = await f.async('base64');
    }
  }
  return { type, model, origine, ...(Object.keys(maillages).length ? { maillages } : {}) };
}

/** Format d'un maillage d'après son extension, `undefined` si inconnu. */
export function formatMaillage(chemin: string): MaillageFichier['format'] | undefined {
  const m = /\.(stl|glb|gltf)$/i.exec(chemin);
  return m ? (m[1].toLowerCase() as MaillageFichier['format']) : undefined;
}

/**
 * Tous les volumes d'un document. `paquetDe(type)` rend les octets du paquet
 * de bibliothèque (ou `undefined` : pas installé, l'élément intégré prendra
 * le relais côté webview) ; `fichiers` = entrées `system/…` du `.projix`,
 * chemins relatifs à `system/` (comme `lireProjix` les rend ; un préfixe
 * `system/` resté est retiré).
 */
export async function volumesDuSysteme(
  doc: DocumentSysteme,
  paquetDe: (type: string) => Uint8Array | undefined,
  fichiers: Array<{ path: string; data: Uint8Array }>,
  delai = DELAI_FORME_MS,
): Promise<VolumesSysteme> {
  const out: VolumesSysteme = { paquets: {}, fichiers: {} };
  const parChemin = new Map(fichiers.map((f) => [f.path.replace(/^system\//, ''), f.data]));
  for (const p of doc.pieces) {
    if (p.source.kind === 'kompix') {
      const type = p.source.type;
      if (type in out.paquets) continue;
      const octets = paquetDe(type);
      if (octets) out.paquets[type] = { ...(await volumeDePaquet(octets, delai)), type };
    } else {
      const chemin = p.source.path;
      const format = formatMaillage(chemin);
      const data = parChemin.get(chemin);
      if (format && data && !(chemin in out.fichiers)) out.fichiers[chemin] = { format, base64: Buffer.from(data).toString('base64') };
    }
  }
  return out;
}
