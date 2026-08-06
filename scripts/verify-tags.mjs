// Banc : tout composant du catalogue est-il RÉELLEMENT rendu dans l'atelier ?
//
// Défaut attrapé (v2026.8.7, patte de robot) : le fork existait, le catalogue le
// citait, les tests et les docs passaient — mais `patte-element.mjs` n'était
// importé NULLE PART depuis `sim.mts`. La balise n'était donc jamais définie dans
// le bundle de la webview : pas de shadow root, pas de dessin, et l'éditeur
// n'affichait qu'un minuscule carré de sélection.
//
// Deux familles de contrôles, tous statiques (aucun navigateur) :
//  1. chaque `tag` du catalogue est défini par un fichier ATTEIGNABLE depuis
//     `sim.mts` en suivant les imports statiques ;
//  2. chaque fork dont `_capture-part.mjs` tire une illustration impose un
//     `display` sur `:host` — sans quoi l'hôte reste `display: inline`, le
//     `transform` de mise à l'échelle est ignoré par le navigateur et le .webp de
//     la fiche d'aide sort BLANC (l'autre moitié du même défaut).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEBVIEW = join(ROOT, 'src', 'webview');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

/** Résout un import relatif `.mjs` (TypeScript NodeNext) vers son `.mts` source. */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const cand of [base.replace(/\.mjs$/, '.mts'), base.replace(/\.js$/, '.ts'), base, `${base}.mts`, `${base}.ts`]) {
    if (existsSync(cand) && /\.(mts|ts)$/.test(cand)) return cand;
  }
  return null;
}

/** Tous les fichiers source atteints depuis `entry` par imports statiques. */
function reachable(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    // `import './x.mjs'`, `import a from './x.mjs'`, `export … from './x.mjs'`
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, m[1]);
      if (next) stack.push(next);
    }
    // Imports dynamiques (chargement paresseux d'un composant).
    for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const next = resolveImport(file, m[1]);
      if (next) stack.push(next);
    }
  }
  return seen;
}

const reached = reachable(join(WEBVIEW, 'sim.mts'));

// --- 1. Chaque balise du catalogue est définie dans le bundle -----------------
console.log("Balises du catalogue définies dans le bundle de l'atelier :");
{
  const catalog = readFileSync(join(WEBVIEW, 'diagram', 'catalog.mts'), 'utf8');
  const tags = [...new Set([...catalog.matchAll(/\btag:\s*'([^']+)'/g)].map((m) => m[1]))];
  check('catalogue lu (au moins 40 balises)', tags.length >= 40, String(tags.length));

  // Où chaque balise est-elle définie ? (tous les forks, atteints ou non)
  const defs = new Map(); // tag -> fichier
  const dir = join(WEBVIEW, 'composants');
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.mts')) continue;
    const file = join(dir, name);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/customElements\.define\(\s*'([^']+)'/g)) defs.set(m[1], file);
  }

  const undefinedTags = tags.filter((t) => !defs.has(t));
  check('aucune balise du catalogue sans customElements.define', undefinedTags.length === 0,
    undefinedTags.join(', '));

  const orphans = tags.filter((t) => defs.has(t) && !reached.has(defs.get(t)));
  check('aucun fork oublié dans les imports de sim.mts', orphans.length === 0,
    orphans.map((t) => `${t} (${defs.get(t).replace(/.*composants./, '')})`).join(', '));
}

// --- 2. Les forks illustrés imposent un display sur :host --------------------
console.log("Forks illustrés dans les fiches d'aide : hôte dimensionné :");
{
  const capture = readFileSync(join(ROOT, 'scripts', '_capture-part.mjs'), 'utf8');
  const modules = [...new Set([...capture.matchAll(/module:\s*'([^']+)'/g)].map((m) => m[1]))];
  check('liste des composants illustrés lue', modules.length >= 10, String(modules.length));

  const inline = [];
  for (const mod of modules) {
    const file = join(WEBVIEW, 'composants', mod.replace(/\.mjs$/, '.mts'));
    if (!existsSync(file)) { check(`${mod} introuvable`, false); continue; }
    const src = readFileSync(file, 'utf8');
    // Un élément qui construit son DOM à la main (pas LitElement) n'a pas de
    // :host à styler : il enveloppe son dessin dans un <div>, déjà en bloc.
    if (!/extends\s+LitElement/.test(src)) continue;
    if (!/:host[^{]*\{[^}]*display\s*:/.test(src)) inline.push(mod);
  }
  check('aucun fork illustré laissé en display: inline', inline.length === 0, inline.join(', '));
}

console.log(`\nRESULTAT: ${failures === 0 ? 'OK' : `${failures} ÉCHEC(S)`}`);
process.exit(failures === 0 ? 0 : 1);
