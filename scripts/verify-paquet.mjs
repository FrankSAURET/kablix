// Banc : tout ce que le build produit doit se retrouver DANS le .vsix.
//
// LE PIÈGE, VÉCU DEUX FOIS. `.vscodeignore` exclut `dist/**` en bloc, puis
// réautorise les fichiers un à un (`!dist/extension.js`…). C'est volontaire :
// les posters de brochage, eux, ne doivent pas y être. Mais la liste est tenue
// À LA MAIN, et un nouveau bundle n'y entre pas tout seul.
//   - v2026.8.55 : `dist/webview-worker.js` oublié. Plus aucune simulation dès
//     que le réglage du fil d'exécution passait à « activé ».
//   - v2026.9.4.126 : `dist/analyseur.js` oublié. L'onglet de l'analyseur
//     chargeait un script inexistant : page GRISE, sans un mot d'erreur.
//
// Et dans les deux cas, RIEN ne le voyait : en F5 le dossier `dist/` est sur le
// disque, donc tout marche. Le défaut n'existe QUE dans le paquet installé.
// Aucun banc ne peut le trouver en exécutant du code — il faut lire l'emballage.
//
// CE QU'IL MESURE : les `outfile` déclarés dans esbuild.js, confrontés aux
// exceptions de .vscodeignore. Un bundle produit et non réautorisé = échec.
// La liste se tient donc toute seule : ajouter un bundle au build suffit à ce
// que le banc réclame sa place dans le paquet.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let echecs = 0;
const ok = (quoi, vrai) => {
	console.log(`${vrai ? '✓' : '✗'} ${quoi}`);
	if (!vrai) echecs++;
};

const ignore = readFileSync(join(ROOT, '.vscodeignore'), 'utf8');
const esb = readFileSync(join(ROOT, 'esbuild.js'), 'utf8');

// Les lignes du .vscodeignore, commentaires et vide retirés.
const lignes = ignore
	.split(/\r?\n/)
	.map((l) => l.trim())
	.filter((l) => l && !l.startsWith('#'));

// `dist/**` exclu en bloc : c'est le choix du projet, et c'est bien lui qui rend
// la liste blanche obligatoire. S'il disparaissait, ce banc n'aurait plus d'objet.
ok(
	'.vscodeignore exclut dist/** en bloc (donc chaque bundle doit être réautorisé)',
	lignes.includes('dist/**')
);

// Tous les bundles que le build produit, lus à la source.
const bundles = [...esb.matchAll(/outfile:\s*'([^']+)'/g)].map((m) => m[1]);
ok(`esbuild.js déclare au moins 4 bundles (${bundles.length} trouvé(s))`, bundles.length >= 4);

for (const b of bundles) {
	const chemin = b.replace(/\\/g, '/');
	// La réautorisation doit être EXACTE et en début de ligne : un `!dist/x.js`
	// commenté, ou noyé dans une phrase, ne vaut rien pour vsce.
	const reautorise = lignes.includes(`!${chemin}`);
	ok(`.vscodeignore : ${chemin} est embarqué dans le vsix (!${chemin})`, reautorise);
}

// Contrôle croisé : le fichier existe-t-il vraiment après un build ? Sans cela
// une faute de frappe dans esbuild.js passerait pour une exclusion.
const construit = bundles.filter((b) => existsSync(join(ROOT, b)));
if (construit.length === 0) {
	console.log('⚠ aucun bundle sur le disque — lancez `npm run build` pour ce contrôle');
} else {
	ok(
		`les ${construit.length}/${bundles.length} bundles présents sur le disque portent bien le nom déclaré`,
		construit.length === bundles.length
	);
}

// Les ressources chargées par fetch, hors bundle, qui ont le même piège.
ok(
	'.vscodeignore : les posters de brochage sont embarqués (!dist/pinout/**)',
	lignes.includes('!dist/pinout/**')
);

if (echecs) {
	console.log(`\n✗ ${echecs} échec(s) — un fichier produit par le build manquerait au paquet installé`);
	process.exit(1);
}
console.log(`\n✓ paquet : les ${bundles.length} bundles du build sont embarqués dans le vsix`);
