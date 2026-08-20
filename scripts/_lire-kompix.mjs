// Lecteur node d'un paquet .kompix → objet `CustomPartData`, celui-là même que
// l'extension envoie à la webview (`src/kompixLibrary.ts`, unpackKompix).
//
// Sert hors extension : les tests de `testkablix/` embarquent leurs composants
// de bibliothèque dans le .projix (`diagram.customParts`), et le vérificateur
// les enregistre au catalogue avant de contrôler types et pattes. Sans ça, un
// schéma de test utilisant un composant .kompix serait rejeté comme inconnu.
//
// La logique d'extraction de groupe est volontairement RECOPIÉE de
// kompixLibrary.ts plutôt qu'importée : ce fichier-là est du TypeScript lié à
// l'API VS Code, inutilisable depuis un script node.
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const KOMPIX_DIR = join(ROOT, 'kablix_components');

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** viewBox du document (l'échelle du composant sur la feuille). */
const viewBoxOf = (svg) =>
  (/<svg\b[^>]*\bviewBox=["']([^"']+)["']/i.exec(svg) ?? [, '0 0 100 100'])[1].trim();

/**
 * Contenu du groupe `groupId`, ou null s'il est absent. Compte les `<g>` ouverts
 * pour trouver le `</g>` qui ferme VRAIMENT le groupe : Inkscape imbrique les
 * groupes, s'arrêter au premier `</g>` couperait le dessin en deux.
 */
function groupContent(svg, groupId) {
  const id = escapeRe(groupId);
  const opener = new RegExp(`<g\\b[^>]*\\bid=(?:"${id}"|'${id}')[^>]*?(/?)>`, 'i');
  const open = opener.exec(svg);
  if (!open) return null;
  if (open[1] === '/') return '';
  const start = open.index + open[0].length;
  const tags = /<g\b[^>]*?(\/?)>|<\/g\s*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  let tag;
  while ((tag = tags.exec(svg)) !== null) {
    if (tag[0].startsWith('</')) {
      if (--depth === 0) return svg.slice(start, tag.index);
    } else if (tag[1] !== '/') depth++;
  }
  return null;
}

/**
 * Groupe `groupId` réenveloppé dans un SVG autonome, '' s'il n'existe pas.
 * `width`/`height` sont indispensables : sans eux le dessin s'étale à la taille
 * de son parent, qui vaut 0 dans le composant (cf. kompixLibrary.ts).
 */
function extraireGroupe(svg, groupId) {
  const content = groupContent(svg, groupId);
  if (content === null) return '';
  const viewBox = viewBoxOf(svg);
  const [, , w = '100', h = '100'] = viewBox.split(/\s+/);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${content}</svg>`;
}

/** Lit un .kompix (chemin complet ou simple type de la bibliothèque du dépôt). */
export async function lireKompix(ref) {
  const path = ref.endsWith('.kompix') ? ref : join(KOMPIX_DIR, `${ref}.kompix`);
  const zip = await JSZip.loadAsync(readFileSync(path));

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error(`${path} : manifest.json absent`);
  const manifest = JSON.parse(await manifestFile.async('string'));
  if (!manifest.type || !manifest.label || !Array.isArray(manifest.pins)) {
    throw new Error(`${path} : manifest invalide (type, label, pins requis)`);
  }

  const schemaFile = zip.file('schema.svg');
  if (!schemaFile) throw new Error(`${path} : schema.svg absent`);
  const svg = await schemaFile.async('string');

  let behaviorScript;
  if (manifest.behavior) {
    const f = zip.file(manifest.behavior);
    if (f) behaviorScript = await f.async('string');
  }

  const part = {
    type: manifest.type,
    label: manifest.label,
    kind: manifest.kind,
    svg: extraireGroupe(svg, manifest.type),
    pins: manifest.pins,
    pinRoles: manifest.pinRoles,
    attrs: manifest.attrs,
    innerSvg: extraireGroupe(svg, `${manifest.type}-interne`) || undefined,
    innerOffset: manifest.innerOffset || undefined,
    extAnchor: manifest.extAnchor || undefined,
    intAnchor: manifest.intAnchor || undefined,
    params: manifest.params,
    control: manifest.control,
    category: manifest.category,
    behaviorScript,
  };
  for (const k of Object.keys(part)) if (part[k] === undefined) delete part[k];
  return part;
}

/** Les composants .kompix d'une liste de types, dans l'ordre demandé. */
export async function lireKompixes(types) {
  return Promise.all(types.map((t) => lireKompix(t)));
}
