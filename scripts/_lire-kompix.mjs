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

  // Fiches d'aide embarquées : `help/<lang>.md`. Ce sont les fichiers présents
  // qui font foi, pas la liste annoncée par le manifeste.
  const helpLangs = Object.keys(zip.files)
    .map((n) => (zip.files[n].dir ? null : /^help\/([a-z]{2})\.md$/i.exec(n)?.[1]?.toLowerCase()))
    .filter(Boolean)
    .sort();

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
    openDrain: manifest.openDrain,
    shield: manifest.shield,
    toggles: manifest.toggles,
    rfid: manifest.rfid,
    category: manifest.category,
    hasHelp: helpLangs.length > 0 || undefined,
    behaviorScript,
  };
  for (const k of Object.keys(part)) if (part[k] === undefined) delete part[k];
  return part;
}

/** Fiche d'aide d'un .kompix : son Markdown et ses illustrations en data: URI. */
export async function lireAideKompix(ref, lang = 'fr') {
  const path = ref.endsWith('.kompix') ? ref : join(KOMPIX_DIR, `${ref}.kompix`);
  const zip = await JSZip.loadAsync(readFileSync(path));
  const langs = Object.keys(zip.files)
    .map((n) => (zip.files[n].dir ? null : /^help\/([a-z]{2})\.md$/i.exec(n)?.[1]?.toLowerCase()))
    .filter(Boolean)
    .sort();
  if (!langs.length) return null;
  const chosen = langs.includes(lang) ? lang : langs[0];
  const text = await zip.file(`help/${chosen}.md`).async('string');

  const assets = new Map();
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (f.dir || /^help\/[a-z]{2}\.md$/i.test(name)) continue;
    if (!name.startsWith('help/') && name !== 'thumbnail.webp') continue;
    const b64 = Buffer.from(await f.async('uint8array')).toString('base64');
    const mime = name.endsWith('.png') ? 'image/png' : name.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
    assets.set(name, `data:${mime};base64,${b64}`);
    assets.set(name.replace(/^help\//, ''), `data:${mime};base64,${b64}`);
  }
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  return { type: manifest.type, lang: chosen, langs, text, assets };
}

/** Les composants .kompix d'une liste de types, dans l'ordre demandé. */
export async function lireKompixes(types) {
  return Promise.all(types.map((t) => lireKompix(t)));
}
