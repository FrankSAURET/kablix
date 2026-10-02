// Vide les RELIQUATS de test de la bibliothèque de composants installée.
//
// Frank (02/10) : le gestionnaire de composants affiche « installé » des pièces
// qui reviennent après suppression, toutes en version 1.2.3 — celle que les
// bancs de test donnent à leurs pièces jetables (`verify-kompix.mjs`). Cette
// fonction les retire de la bibliothèque de l'utilisateur ; elle tourne à chaque
// livraison (voir `.claude/commands/livre.md`).
//
// Un RELIQUAT, c'est une entrée de `.kompix-index.json` dont la version est
// `1.2.3` ou dont le type commence par `test-`, avec son fichier `.kompix`. Les
// composants du dépôt officiel (`kablix_components/index.json`) ne sont jamais
// touchés, quelle que soit leur version. Un fichier `.kompix` sans entrée
// d'index n'est supprimé que si son nom commence par `test-`.
//
// Usage : node scripts/vider-reliquats.mjs [--simule] [--dossier=<bibliothèque>]
//  - sans `--dossier` : les emplacements standard de VS Code, Insiders et
//    VSCodium (Windows, macOS, Linux), ou `$KABLIX_COMPONENTS` ;
//  - `--simule` : liste sans rien supprimer.
// Un dossier absent n'est pas une erreur (poste de développement sans
// l'extension installée, session cloud) : on le dit et on rend la main.
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_TEST = '1.2.3';
const PREFIXE_TEST = 'test-';
const simule = process.argv.includes('--simule');
const dossierArg = process.argv.find((a) => a.startsWith('--dossier='))?.slice('--dossier='.length);

/** Types du dépôt officiel : jamais supprimés. */
function officiels() {
  try {
    const index = JSON.parse(readFileSync(join(ROOT, 'kablix_components', 'index.json'), 'utf8'));
    const liste = Array.isArray(index) ? index : (index.components ?? []);
    return new Set(liste.map((c) => c.type));
  } catch {
    return new Set();
  }
}

/** Dossiers de bibliothèque à examiner. */
function dossiers() {
  if (dossierArg) return [dossierArg];
  if (process.env.KABLIX_COMPONENTS) return [process.env.KABLIX_COMPONENTS];
  const home = homedir();
  const racines = [
    process.env.APPDATA,
    join(home, 'AppData', 'Roaming'),
    join(home, 'Library', 'Application Support'),
    join(home, '.config'),
  ].filter(Boolean);
  const produits = ['Code', 'Code - Insiders', 'VSCodium'];
  const out = [];
  for (const r of racines)
    for (const p of produits)
      out.push(join(r, p, 'User', 'globalStorage', 'electropol-fr.kablix', 'kablix_components'));
  return [...new Set(out)].filter(existsSync);
}

const gardes = officiels();
let total = 0;

for (const dossier of dossiers()) {
  const cheminIndex = join(dossier, '.kompix-index.json');
  let index = [];
  try {
    const lu = JSON.parse(readFileSync(cheminIndex, 'utf8'));
    if (Array.isArray(lu)) index = lu;
  } catch {
    // pas d'index lisible : on ne juge que les noms de fichiers
  }
  const reliquats = new Set(
    index
      .filter((e) => !gardes.has(e.type) && (e.version === VERSION_TEST || e.type.startsWith(PREFIXE_TEST)))
      .map((e) => e.type)
  );
  const fichiers = existsSync(dossier) ? readdirSync(dossier) : [];
  for (const f of fichiers) {
    if (f.endsWith('.kompix') && f.startsWith(PREFIXE_TEST)) reliquats.add(f.slice(0, -'.kompix'.length));
  }
  if (reliquats.size === 0) {
    console.log(`Reliquats : aucun dans ${dossier}`);
    continue;
  }
  for (const type of reliquats) {
    console.log(`Reliquat ${simule ? 'à retirer' : 'retiré'} : ${type}`);
    if (simule) continue;
    try {
      unlinkSync(join(dossier, `${type}.kompix`));
    } catch (err) {
      if (err?.code !== 'ENOENT') console.error(`  suppression impossible : ${err.message}`);
    }
  }
  if (!simule) {
    writeFileSync(cheminIndex, JSON.stringify(index.filter((e) => !reliquats.has(e.type)), null, 2), 'utf8');
  }
  total += reliquats.size;
}

console.log(total === 0 ? 'Reliquats : rien à vider.' : `Reliquats : ${total} ${simule ? 'à retirer' : 'retirés'}.`);
