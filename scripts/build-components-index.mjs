// Script pour générer index.json et README.md des composants .kompix.
// À lancer après avoir ajouté/modifié des .kompix dans kablix_components/.
//
// Utilisation : node scripts/build-components-index.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KOMPONIX_DIR = join(ROOT, 'kablix_components');
// Version de l'extension : `require` n'existe pas dans un .mjs.
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

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
      const thumbFile = zip.file('thumbnail.webp');
      if (thumbFile) {
        const thumbData = await thumbFile.async('arraybuffer');
        thumbnail = `data:image/webp;base64,${Buffer.from(thumbData).toString('base64')}`;
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

      index.components.push(entry);
      entries.push(entry);
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
  let readme = `# Composants Kablix

Bibliothèque publique de composants Kablix au format **.kompix**.

## Format .kompix

Fichier ZIP contenant :
- \`manifest.json\` : métadonnées du composant
- \`schema.svg\` : dessin externe et optionnel schéma interne
- \`thumbnail.webp\` : miniature optionnelle
- \`behavior.mjs\` : code de simulation optionnel

Voir [kompix_specification.md](../docs/kompix_specification.md) pour les détails.

## Composants disponibles

| Type | Label | Version | Catégorie | Description |
|------|-------|---------|-----------|-------------|
`;

  for (const entry of entries.sort((a, b) => String(a.type).localeCompare(String(b.type)))) {
    const desc = (entry.description || '').replace(/[|\n]/g, ' ').slice(0, 50);
    readme += `| \`${entry.type}\` | ${entry.label} | ${entry.version} | ${entry.category} | ${desc} |\n`;
  }

  readme += `\n## Utilisation

1. Ouvrir un schéma dans Kablix
2. Clic sur **⇩ Importer des composants** dans la palette
3. Sélectionner les composants et clic sur **Télécharger**

## Contribution

Pour proposer un composant :
1. Créer un dossier local \`kablix_components/\`
2. Concevoir le composant avec Kablix (bouton **+ Créer un composant**)
3. Exporter en **⇩** (fichier .kompix)
4. Proposer une pull request sur le dépôt

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
