// Répare la référence `codeFile` d'un .projix SANS toucher à son schéma.
// `_generate.mjs` reconstruit tout depuis la spec et écrase les bancs que Frank
// a redisposés : quand seule la référence au programme est morte (fichier
// déplacé, projet réenregistré sans code lié), c'est cet outil-là qu'il faut.
//   node scripts/_reparer-codefile.mjs           (tous ceux qui en ont besoin)
//   node scripts/_reparer-codefile.mjs --liste    (dire seulement, ne rien écrire)
//   node scripts/_reparer-codefile.mjs led-pico2  (ceux-là seulement)
import JSZip from 'jszip';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HERE, testCodeRef, testProjix } from '../testkablix/_paths.mjs';
import { TESTS } from '../testkablix/_spec.mjs';

const ROOT = join(HERE, '..');
const args = process.argv.slice(2);
const LISTE = args.includes('--liste');
const only = new Set(args.filter((a) => !a.startsWith('--')));

/**
 * La référence désigne-t-elle vraiment un fichier ? On n'accepte QUE les deux
 * résolutions qui suivent le chemin écrit — à côté du .projix, ou depuis la
 * racine du dépôt. L'extension a un troisième repli (le nom seul, dans le
 * dossier du .projix) : il rattrape un chemin périmé, et masquait donc les deux
 * `blink-pico2` qui pointaient encore `testkablix/pico2/` après le rangement.
 */
function resout(ref, fichier) {
	if (typeof ref !== 'string' || ref.length === 0) return false;
	return [join(dirname(fichier), ref), join(ROOT, ref)].some(existsSync);
}

let repares = 0;
for (const t of TESTS) {
	if (only.size > 0 && !only.has(t.name)) continue;
	const fichier = testProjix(t);
	if (!existsSync(fichier)) continue;
	const zip = await JSZip.loadAsync(readFileSync(fichier));
	const manifest = JSON.parse(await zip.file('kablix.json').async('string'));
	if (resout(manifest.codeFile, fichier)) continue;
	const attendu = testCodeRef(t);
	console.log(`${t.name} : « ${manifest.codeFile ?? '(absent)'} » → « ${attendu} »`);
	repares++;
	if (LISTE) continue;
	manifest.codeFile = attendu;
	// Le chemin absolu mémorisé à l'enregistrement sert de dernier repli côté
	// extension : périmé, il rouvrirait l'ancien emplacement.
	delete manifest.codeFileAbs;
	zip.file('kablix.json', JSON.stringify(manifest, null, 2));
	const octets = await zip.generateAsync({
		type: 'uint8array',
		compression: 'DEFLATE',
		compressionOptions: { level: 6 },
	});
	writeFileSync(fichier, octets);
}
console.log(`\n${repares} .projix ${LISTE ? 'à réparer' : 'réparé(s)'}.`);
