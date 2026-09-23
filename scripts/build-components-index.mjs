// Script pour générer index.json et README.md des composants .kompix.
// À lancer après avoir ajouté/modifié des .kompix dans kablix_components/.
//
// Le README porte DEUX inventaires : les composants de la bibliothèque (les
// .kompix de ce dossier) et ceux déjà INTÉGRÉS à Kablix, lus dans le catalogue
// du code (src/webview/diagram/catalog.mts). Le second évite la question qui
// revient toujours — « ce composant existe-t-il déjà ? » — avant d'en dessiner
// un doublon.
//
// Utilisation : node scripts/build-components-index.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KOMPONIX_DIR = join(ROOT, 'kablix_components');
/** Miniatures dépaquetées pour le README : GitHub ne rend pas une image `data:`. */
const THUMBS_REL = 'thumbnails';
const THUMBS_DIR = join(KOMPONIX_DIR, THUMBS_REL);
// Version de l'extension : `require` n'existe pas dans un .mjs.
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// --- Composants intégrés : lus dans le VRAI catalogue -------------------------
// Les `.mts` du code ne sont pas importables tels quels par Node : on les
// empaquette au vol, comme le fait verify-docs.mjs. Une liste réécrite à la main
// aurait vieilli dès le composant suivant.
const TMP = mkdtempSync(join(tmpdir(), 'kablix-index-'));
async function charger(entree, nom) {
  const out = join(TMP, nom);
  await esbuild.build({
    entryPoints: [join(ROOT, entree)], outfile: out,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

/**
 * Une ligne de tableau Markdown, tirée d'un texte de fiche d'aide : le gras et
 * les liens sont retirés (une coupe au milieu d'un `**` laisserait le reste du
 * tableau en gras), et la coupe tombe sur un mot, pas sur une lettre.
 */
function resumer(texte, max) {
  let t = String(texte || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')  // [libellé](lien) → libellé
    .replace(/\*\*|__|`/g, '')
    .replace(/[|\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  t = t.slice(0, max);
  const espace = t.lastIndexOf(' ');
  if (espace > max * 0.6) t = t.slice(0, espace);
  return `${t.replace(/[\s,;:.]+$/, '')}…`;
}

/**
 * Inventaire des composants livrés avec Kablix : une ligne par type de la
 * palette (les variantes en sont exclues — elles se choisissent dans les
 * propriétés d'un composant déjà listé, elles n'ont ni vignette ni fiche).
 * Le libellé, la description et l'illustration viennent de la fiche d'aide FR,
 * seule source écrite pour l'utilisateur.
 */
async function composantsIntegres() {
  const { PALETTE_CATALOG, partCategory } = await charger('src/webview/diagram/catalog.mts', 'catalog.mjs');
  const { initLocale, t } = await charger('src/webview/i18n.mts', 'i18n.mjs');
  initLocale('fr');

  const lignes = [];
  for (const def of PALETTE_CATALOG) {
    const fiche = join(ROOT, 'docs', 'fr', 'composants', `${def.type}.md`);
    let titre = def.label;
    let description = '';
    if (existsSync(fiche)) {
      const md = readFileSync(fiche, 'utf8');
      const h1 = md.match(/^\s*#\s+(.+)$/m);
      if (h1) titre = h1[1].trim().replace(/`/g, '');
      // Description = premier paragraphe de texte de la fiche, c'est-à-dire la
      // première ligne qui n'est ni le titre, ni l'illustration, ni une citation.
      for (const ligne of md.split(/\r?\n/)) {
        const l = ligne.trim();
        if (!l || l.startsWith('#') || l.startsWith('![') || l.startsWith('>') || l.startsWith('|')) continue;
        description = l;
        break;
      }
    }
    const img = join(ROOT, 'docs', 'img', 'composants', `${def.type}.webp`);
    lignes.push({
      type: def.type,
      label: titre,
      categorie: t(partCategory(def)),
      description,
      // Chemin relatif à kablix_components/ : le README y est écrit.
      vignette: existsSync(img) ? `../docs/img/composants/${def.type}.webp` : undefined,
      fiche: existsSync(fiche) ? `../docs/fr/composants/${def.type}.md` : undefined,
    });
  }
  return lignes;
}

async function generateIndex() {
  // Le dossier n'existe pas encore tant qu'aucun composant n'a été publié.
  mkdirSync(KOMPONIX_DIR, { recursive: true });
  const kompixFiles = readdirSync(KOMPONIX_DIR).filter((f) => f.endsWith('.kompix'));
  const index = { components: [], generated: new Date().toISOString() };
  const entries = [];

  for (const file of kompixFiles.sort()) {
    try {
      const path = join(KOMPONIX_DIR, file);
      const data = readFileSync(path);
      const zip = new JSZip();
      await zip.loadAsync(new Uint8Array(data.buffer, data.byteOffset, data.length));

      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) {
        console.warn(`  ⚠ ${file} : pas de manifest.json`);
        continue;
      }

      const manifestText = await manifestFile.async('string');
      const manifest = JSON.parse(manifestText);
      if (!manifest.type) {
        console.warn(`  ⚠ ${file} : manifest sans « type »`);
        continue;
      }

      // Extrait miniature optionnelle en base64.
      let thumbnail = undefined;
      // Même miniature écrite EN FICHIER pour le README : GitHub n'affiche pas
      // une image `data:` dans un tableau Markdown, il lui faut un chemin.
      let vignette = undefined;
      const thumbFile = zip.file('thumbnail.webp');
      if (thumbFile) {
        const thumbData = await thumbFile.async('arraybuffer');
        thumbnail = `data:image/webp;base64,${Buffer.from(thumbData).toString('base64')}`;
        mkdirSync(THUMBS_DIR, { recursive: true });
        writeFileSync(join(THUMBS_DIR, `${manifest.type}.webp`), Buffer.from(thumbData));
        vignette = `${THUMBS_REL}/${manifest.type}.webp`;
      }

      const entry = {
        type: manifest.type,
        label: manifest.label,
        version: manifest.version,
        author: manifest.author || 'Unknown',
        description: manifest.description || '',
        category: manifest.category || 'custom',
        kind: manifest.kind || 'passive',
        // « file » et pas « filename » : c'est le nom que lit le gestionnaire de
        // composants pour reconstruire l'URL du .kompix à télécharger.
        file,
        thumbnail,
      };
      // Traductions des libellés : la carte du gestionnaire est dessinée depuis
      // l'index, AVANT tout téléchargement — sans ce report, un composant non
      // installé s'annoncerait en anglais chez un francophone.
      if (manifest.l10n && Object.keys(manifest.l10n).length) entry.l10n = manifest.l10n;
      // Composant encore a l'essai : le gestionnaire le montre, mais dit ce
      // qu'il en est. Sans ce report, la carte ne pourrait pas le savoir avant
      // le telechargement.
      if (manifest.experimental) entry.experimental = true;

      index.components.push(entry);
      // Le README lit `vignette` ; l'index, lui, ne la connaît pas — c'est un
      // chemin relatif au dépôt, sans valeur pour le gestionnaire.
      entries.push({ ...entry, vignette });
      console.log(`  ✓ ${manifest.type} (v${manifest.version})`);
    } catch (err) {
      console.error(`  ! ${file} : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Écrit index.json.
  const indexPath = join(KOMPONIX_DIR, 'index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n  → index.json (${index.components.length} composant(s))`);

  // Génère README.md.
  const integres = await composantsIntegres();

  let readme = `# Composants Kablix

Bibliothèque publique de composants Kablix au format **.kompix**.

## Format .kompix

Fichier ZIP contenant :
- \`manifest.json\` : métadonnées du composant
- \`schema.svg\` : dessin externe et optionnel schéma interne
- \`thumbnail.webp\` : miniature optionnelle
- \`behavior.mjs\` : code de simulation optionnel
- \`help/<lang>.md\` : fiche d'aide du composant, ouverte par le bouton **Aide du composant** du volet des propriétés (ses illustrations sont posées à côté)

Voir [kompix_specification.md](../docs/kompix_specification.md) pour les détails.

## Créer un composant

| Guide | Ce qu'il couvre |
|---|---|
| [Créer ses propres composants](../docs/fr/USAGE.md#créer-ses-propres-composants) | Le créateur intégré (bouton **+ Créer un composant**), sans toucher au code |
| [Créer un composant Kablix](../docs/fr/Creating-components.md) | La chaîne complète d'un composant **intégré au dépôt** : dessin, extraction, élément, catalogue, simulation, tests, fiche d'aide |
| [Modifier les SVG des composants](../docs/fr/Editing-svg-components.md) | Retoucher un dessin, un schéma interne, la grille de 10 px et les pastilles de broches |
| [Dessiner les systèmes en volume](../docs/fr/Drawing-systems.md) | Les pièces mises en volume par le moteur isométrique : profils, assemblages, pattes |
| [Format .kompix](../docs/kompix_specification.md) | La spécification du paquet : manifeste, SVG, comportement, aide, traductions |

Deux scénarios de bout en bout, dessin compris :
- [Créer un composant 2D.md](../Créer%20un%20composant%202D.md) — une carte moteur Joy-it SBC-MotoDriver3 (I²C, 4 moteurs)
- [Créer un composant 3D.md](../Créer%20un%20composant%203D.md) — un petit véhicule découpé en PMMA (Pico, carte moteur, 4 roues)

## Composants disponibles

Composants de cette bibliothèque, à installer depuis Kablix (**⚙ Gérer les composants**).

<details>
<summary><strong>${entries.length} composant(s) à télécharger</strong></summary>

| | Type | Label | Version | Catégorie | Description |
|---|------|-------|---------|-----------|-------------|
`;

  for (const entry of entries.sort((a, b) => String(a.type).localeCompare(String(b.type)))) {
    const desc = resumer(entry.description, 110);
    // Le tableau porte la meme mention que la carte du gestionnaire.
    const essai = entry.experimental ? ' **(expérimental)**' : '';
    // Largeur imposée : les miniatures n'ont pas toutes la même taille, sans
    // ça une ligne du tableau ferait trois fois la hauteur de sa voisine.
    const img = entry.vignette
      ? `<img src="${entry.vignette}" alt="${entry.label}" width="64">`
      : '';
    readme += `| ${img} | \`${entry.type}\` | ${entry.label}${essai} | ${entry.version} | ${entry.category} | ${desc} |\n`;
  }

  readme += `
</details>

## Composants inclus dans Kablix

Déjà livrés avec l'extension : rien à télécharger, ils sont dans la palette. **À consulter avant d'en dessiner un nouveau.**

<details>
<summary><strong>${integres.length} composant(s) livrés</strong></summary>

| | Type | Label | Catégorie | Description |
|---|------|-------|-----------|-------------|
`;

  for (const part of integres.sort((a, b) => a.type.localeCompare(b.type))) {
    const desc = resumer(part.description, 110);
    const img = part.vignette
      ? `<img src="${part.vignette}" alt="${part.label}" width="64">`
      : '';
    // Le libellé renvoie à la fiche d'aide : c'est le seul texte qui explique
    // vraiment le composant, et il est déjà écrit.
    const label = part.fiche ? `[${part.label}](${part.fiche})` : part.label;
    readme += `| ${img} | \`${part.type}\` | ${label} | ${part.categorie} | ${desc} |\n`;
  }

  readme += `
</details>

## Utilisation

1. Ouvrir un schéma dans Kablix
2. Clic sur **⚙ Gérer les composants** dans la palette
3. Sélectionner les composants et clic sur **Télécharger**

## Contribution

Pour proposer un composant :
1. Créer un dossier local \`kablix_components/\`
2. Concevoir le composant avec Kablix (bouton **+ Créer un composant**)
3. Exporter en **⇩** (fichier .kompix)
4. Proposer une pull request sur le dépôt

## Pourquoi cette bibliothèque reste dans le dépôt de Kablix

La question se pose : un dépôt séparé ne serait-il pas plus propre ? **Non, pas au volume actuel.**

Ce dossier **n'est pas livré dans l'extension** (il est écarté par \`.vscodeignore\`) : il est servi directement depuis GitHub, en \`raw\`, et l'extension le télécharge à la demande. Il ne pèse donc rien pour l'utilisateur, et ses ${entries.length} composants tiennent dans quelques centaines de kilo-octets.

| Ce qu'un dépôt dédié apporterait | Ce qu'il coûterait |
|---|---|
| Un historique séparé de celui du code | Deux dépôts à cloner, deux à étiqueter, deux à garder en phase |
| Des contributions externes sans accès au code | L'URL du dépôt officiel est **écrite dans le code** (\`kompixLibrary.ts\`) : la changer casse toutes les installations en place |
| Un cycle de publication propre aux composants | Les scripts de construction (\`build-kompix.mjs\`, \`build-components-index.mjs\`) et les bancs (\`verify:kompix\`) vivent dans le dépôt du code |
| | Un composant et le code qui le simule se modifient **ensemble** : séparés, un enregistrement sur deux devient une paire d'enregistrements à synchroniser |

Le point décisif est le dernier : tant qu'un composant de bibliothèque peut dépendre d'une version de l'extension, les deux doivent avancer dans le même enregistrement.

**Quand reconsidérer :** si la bibliothèque dépasse quelques dizaines de mégaoctets, si des contributeurs extérieurs deviennent réguliers, ou si les composants cessent d'être couplés aux versions de l'extension. D'ici là, le dossier reste ici.

---

Généré le ${new Date().toLocaleString('fr-FR')} — Kablix v${VERSION}
`;

  const readmePath = join(KOMPONIX_DIR, 'README.md');
  writeFileSync(readmePath, readme);
  console.log(`  → README.md`);

  console.log(`\n✓ Index généré : ${index.components.length} composant(s)`);
}

generateIndex().catch((err) => {
  console.error('\n✗ Erreur :', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
