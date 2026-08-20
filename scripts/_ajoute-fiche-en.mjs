// Ajoute la fiche d'aide anglaise dans les paquets .kompix DÉJÀ construits, sans
// toucher au dessin ni à la vignette : rebâtir le paquet demanderait la planche
// Inkscape et Chrome, et redessinerait tout pour une simple traduction.
// Usage : node scripts/_ajoute-fiche-en.mjs [type…]
import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'kablix_components');
const types = process.argv.slice(2).length ? process.argv.slice(2) : ['spot', 'dmx-grove'];

for (const type of types) {
	const paquet = join(DIR, `${type}.kompix`);
	const zip = await JSZip.loadAsync(readFileSync(paquet));
	const manifest = JSON.parse(await zip.file('manifest.json').async('string'));

	zip.file('help/en.md', readFileSync(join(DIR, 'help', type, 'en.md')));
	const langs = new Set([...(manifest.help ?? []), 'en']);
	manifest.help = [...langs];
	zip.file('manifest.json', JSON.stringify(manifest, null, 2));

	writeFileSync(paquet, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
	console.log(`${type} : help/en.md ajoutée, manifest.help = ${JSON.stringify(manifest.help)}`);
}
