// La file d'attente de l'onglet ne perd JAMAIS les voies (v2026.9.4.115).
//
// LE DÉFAUT. Frank, 19/09 : « je ne vois toujours rien du tout dans l'onglet
// analyseur logique », « je ne vois jamais aucune courbe ». Le moteur produit
// pourtant ses fronts (verify-analyseur-e2e.mjs) et la page sait peindre
// (verify-analyseur-rendu.mjs). Le trou était dans le RELAIS.
//
// L'onglet naît derrière l'atelier et met un moment à se charger. Pendant ce
// temps l'hôte met les messages de côté, dans une file bornée à 200 pour que
// la mémoire ne gonfle pas si la page ne se charge jamais. Quand le plafond
// était atteint, elle jetait le PLUS ANCIEN message — or les premiers arrivés
// sont `voies`, `depart` et `restaure`, les seuls qui ne se rattrapent pas.
//
// L'ENCHAÎNEMENT FATAL. `capture.verser()` ignore EN SILENCE les broches dont
// elle n'a pas la voie (son journal est commun avec l'oscilloscope, elle y
// reçoit donc des broches qui ne la concernent pas). `voies` perdu, chaque
// salve suivante est donc jetée sans la moindre erreur, et l'onglet reste
// vide POUR TOUJOURS — rien ne redéclare les voies après coup.
//
// À 60 images par seconde, 200 messages font un peu plus de trois secondes :
// tout onglet plus lent que cela à se charger tombait dedans.
//
// Usage : node scripts/verify-analyseur-file.mjs
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-file-'));
const out = join(tmp, 'panel.mjs');
await esbuild.build({
	entryPoints: [join(root, 'src/analyseur-panel.ts')],
	outfile: out,
	bundle: true,
	platform: 'node',
	format: 'esm',
	logLevel: 'silent',
	// `vscode` n'existe qu'à l'intérieur de l'extension : on le remplace par un
	// module vide. Seule la logique de file nous intéresse ici, et elle est pure.
	external: ['vscode'],
	plugins: [{
		name: 'vscode-vide',
		setup(b) {
			b.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'vide' }));
			b.onLoad({ filter: /.*/, namespace: 'vide' }, () => ({ contents: 'export default {};', loader: 'js' }));
		},
	}],
});
const { rangerEnAttente, ATTENTE_MAX } = await import(pathToFileURL(out).href);

let echecs = 0;
const ok = (nom, cond, detail = '') => {
	if (cond) console.log(`  ✅ ${nom}`);
	else { echecs++; console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}`); }
};

// --- Le scénario RÉEL : un run qui démarre, un onglet lent à se charger -------
// L'atelier poste ses voies, son départ, puis une salve de fronts par image.
// L'onglet, lui, n'est pas encore prêt : tout s'empile.
const file = [];
rangerEnAttente(file, { type: 'voies', voies: [{ voie: 1, pin: 'GP14' }] });
rangerEnAttente(file, { type: 'depart' });
// Dix secondes de simulation à 60 images/s : trois fois le plafond.
for (let i = 0; i < 600; i++) rangerEnAttente(file, { type: 'fronts', salves: { GP14: [i, 1] } });

ok('la file reste bornée', file.length <= ATTENTE_MAX, `${file.length} messages`);
ok('les VOIES sont toujours là (sans elles, tout est jeté en aval)',
	file.some((m) => m.type === 'voies'));
ok('le DÉPART est toujours là (sinon la capture précédente traîne)',
	file.some((m) => m.type === 'depart'));
ok('des fronts ont bien été gardés', file.some((m) => m.type === 'fronts'));
// Ce sont les fronts les PLUS RÉCENTS qu'on garde : l'écran montre la fin de la
// capture, comme le fait déjà le plafond par voie dans analyseur-capture.
const derniers = file.filter((m) => m.type === 'fronts');
ok('ce sont les fronts les plus RÉCENTS qui restent',
	derniers[derniers.length - 1]?.salves?.GP14?.[0] === 599,
	'dernier=' + derniers[derniers.length - 1]?.salves?.GP14?.[0]);
// L'ordre chronologique des fronts gardés n'est pas mélangé par l'éviction.
const temps = derniers.map((m) => m.salves.GP14[0]);
ok('les fronts gardés restent dans l\'ordre',
	temps.every((t, i) => i === 0 || t > temps[i - 1]));

// --- Cas dégénéré : QUE des messages irremplaçables --------------------------
// Si la file ne contient aucune salve à évincer, le plafond doit tout de même
// tenir : on retombe alors sur l'éviction du plus ancien, faute de mieux.
const file2 = [];
for (let i = 0; i < ATTENTE_MAX + 50; i++) rangerEnAttente(file2, { type: 'voies', voies: [] });
ok('sans aucune salve à évincer, le plafond tient quand même',
	file2.length <= ATTENTE_MAX, `${file2.length} messages`);

// --- Restaure : irremplaçable lui aussi --------------------------------------
const file3 = [];
rangerEnAttente(file3, { type: 'restaure', etat: { voies: [] } });
for (let i = 0; i < 400; i++) rangerEnAttente(file3, { type: 'fronts', salves: {} });
ok('la RESTAURATION d\'une capture enregistrée survit au plafond',
	file3.some((m) => m.type === 'restaure'));

console.log(echecs ? `\nanalyseur-file : ${echecs} échec(s).` : `\nanalyseur-file : file d'attente OK — les voies survivent à un onglet lent.`);
process.exit(echecs ? 1 : 0);
