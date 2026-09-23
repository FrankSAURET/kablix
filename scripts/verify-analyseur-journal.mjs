// Banc du journal CSV de session de l'analyseur logique.
//
// Ce que ce banc prouve, et que le stockage dans le .projix ne permettait pas :
// les fronts sont sur le DISQUE au fil de l'eau, pendant la mesure. Il n'y a
// plus d'instant unique (l'arrêt de la simulation) dont tout dépend.
//
// Il fait tourner le VRAI src/analyseur-journal.ts, empaqueté par esbuild, et
// relit les fichiers écrits — pas de bouchon, pas de simulacre d'écriture.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// fileURLToPath, pas `.pathname` : le chemin du projet contient des espaces,
// qui resteraient encodés en %20 et rendraient le fichier introuvable.
const RACINE = fileURLToPath(new URL('..', import.meta.url));

let ok = 0;
const echecs = [];
function check(cond, titre, detail) {
	if (cond) { ok++; return; }
	echecs.push(detail ? `${titre} — ${detail}` : titre);
}

// --- Empaquetage du vrai module ------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'kablix-journal-'));
const bundle = join(tmp, 'journal.mjs');
await build({
	entryPoints: [join(RACINE, 'src/analyseur-journal.ts')],
	bundle: true,
	format: 'esm',
	platform: 'node',
	outfile: bundle,
	external: ['node:fs', 'node:path', 'node:os', 'node:crypto'],
	logLevel: 'silent',
});
const { AnalyseurJournal } = await import(pathToFileURL(bundle).href);

const VOIES = [
	{ voie: 0, pin: 'GP14', nom: 'SDA' },
	{ voie: 1, pin: 'GP15', nom: 'SCL' },
];

// --- 1. Une mesure écrit réellement sur le disque -------------------------
const j = AnalyseurJournal.pour('file:///projet-a.projix', 'projet-a');
j.demarrer(VOIES);
check(existsSync(j.chemin), 'le journal existe sur le disque dès le démarrage', j.chemin);

const entete = readFileSync(j.chemin, 'utf8');
check(entete.includes('temps_ms,voie,broche,nom,niveau'), 'le CSV porte sa ligne de colonnes');
check(entete.includes('# voie 0 = GP14 (SDA)'), 'l’en-tête décrit les voies : le CSV se lit seul');

// --- 2. Les fronts arrivent AU FIL DE L'EAU -------------------------------
// C'est le point que Frank a relevé : rien ne doit dépendre d'un arrêt propre.
check(j.aDesDonnees() === false, 'avant tout front, le journal se déclare vide');

j.verser({ GP14: [10, 1, 20, 0, 30, 1] });
check(j.aDesDonnees() === true, 'un versement suffit à garnir le journal — pas besoin d’un arrêt');

const apres1 = readFileSync(j.chemin, 'utf8');
check(apres1.includes('10,0,GP14,SDA,1'), 'le premier front est écrit, daté, nommé');
check(apres1.trim().split('\n').filter((l) => /^\d/.test(l)).length === 3,
	'les 3 fronts de la salve sont sur le disque');

// Deuxième salve : le fichier doit s'ALLONGER, pas être réécrit.
j.verser({ GP15: [15, 1, 25, 0] });
const apres2 = readFileSync(j.chemin, 'utf8');
check(apres2.startsWith(apres1), 'la salve suivante s’ajoute, elle ne réécrit rien');
check(apres2.includes('15,1,GP15,SCL,1'), 'la seconde voie entre au journal');

// --- 3. Pas de doublon si l'atelier renvoie sa fenêtre --------------------
// L'atelier peut renvoyer des fronts déjà transmis : les compter deux fois
// fabriquerait des transitions qui n'ont jamais eu lieu.
j.verser({ GP14: [10, 1, 20, 0, 30, 1, 40, 0] });
const apres3 = readFileSync(j.chemin, 'utf8');
const gp14 = apres3.split('\n').filter((l) => l.includes(',GP14,'));
check(gp14.length === 4, 'un front déjà écrit n’est pas réécrit', `${gp14.length} lignes au lieu de 4`);
check(apres3.includes('40,0,GP14,SDA,0'), 'seul le front nouveau de la salve est ajouté');

// --- 4. Un nouveau départ repart de zéro ----------------------------------
j.demarrer(VOIES);
const apresRedemarrage = readFileSync(j.chemin, 'utf8');
check(!apresRedemarrage.includes('10,0,GP14'), 'un nouveau lancement efface la mesure précédente');
check(j.aDesDonnees() === false, 'après redémarrage le journal se redéclare vide');

// --- 5. Un journal par projet ---------------------------------------------
// Frank : « plusieurs projix avec plusieurs analyses = plusieurs fichiers ».
const jb = AnalyseurJournal.pour('file:///projet-b.projix', 'projet-b');
check(jb.chemin !== j.chemin, 'deux projets ont deux journaux distincts');
jb.demarrer([{ voie: 0, pin: 'GP2', nom: 'TX' }]);
jb.verser({ GP2: [5, 1] });
j.verser({ GP14: [7, 1] });
check(readFileSync(jb.chemin, 'utf8').includes('5,0,GP2,TX,1'), 'le projet B écrit dans SON journal');
check(!readFileSync(jb.chemin, 'utf8').includes('GP14'), 'aucune fuite du projet A vers le projet B');

// Même clé = même journal (pas de second fichier pour un projet déjà ouvert).
check(AnalyseurJournal.pour('file:///projet-a.projix', 'projet-a') === j,
	'rouvrir la même clé rend le journal déjà ouvert');

// --- 6. La fermeture du projet supprime son fichier -----------------------
// Frank : « c'est la fermeture du projix qui supprimera le fichier ».
const cheminB = jb.chemin;
AnalyseurJournal.fermer('file:///projet-b.projix');
check(!existsSync(cheminB), 'la fermeture du projet supprime son journal');
check(existsSync(j.chemin), 'et ne touche pas au journal de l’autre projet');

// --- 7. « Enregistrer sous » : le journal suit ----------------------------
// Sans cela le fichier resterait rangé sous l'ancienne URI, orphelin à jamais.
AnalyseurJournal.suivreProjet('file:///projet-a.projix', 'file:///projet-a2.projix');
check(AnalyseurJournal.existant('file:///projet-a2.projix') === j,
	'après « enregistrer sous », le journal est rangé sous la nouvelle clé');
check(AnalyseurJournal.existant('file:///projet-a.projix') === undefined,
	'et plus sous l’ancienne');
AnalyseurJournal.fermer('file:///projet-a2.projix');
check(!existsSync(j.chemin), 'le journal renommé est bien supprimé à la fermeture');

// --- 8. Export CSV --------------------------------------------------------
const je = AnalyseurJournal.pour('file:///export.projix', 'export');
je.demarrer(VOIES);
check(je.lire() === undefined, 'un journal sans front n’a rien à exporter');
je.verser({ GP14: [1, 1, 2, 0] });
const exporte = je.lire();
check(typeof exporte === 'string' && exporte.includes('1,0,GP14,SDA,1'),
	'l’export rend le CSV tel quel : aucune conversion à faire');

// Un nom de voie à virgule ne doit pas casser les colonnes.
const jv = AnalyseurJournal.pour('file:///virgule.projix', 'virgule');
jv.demarrer([{ voie: 0, pin: 'GP1', nom: 'bus, ligne A' }]);
jv.verser({ GP1: [1, 1] });
check(readFileSync(jv.chemin, 'utf8').includes('"bus, ligne A"'),
	'un nom contenant une virgule est cité : les colonnes tiennent');

// --- 9. Nettoyage des orphelins ------------------------------------------
// VS Code peut s'arrêter brutalement : les journaux d'alors doivent partir.
const cheminOrphelin = je.chemin;
AnalyseurJournal.nettoyerOrphelins();
check(existsSync(cheminOrphelin), 'un journal de la session en cours est épargné par le nettoyage');
check(existsSync(jv.chemin), 'idem pour les autres journaux vivants');

AnalyseurJournal.fermerTous();
check(!existsSync(cheminOrphelin) && !existsSync(jv.chemin),
	'fermerTous() ne laisse aucun journal derrière lui');
// Plus rien de vivant : un balayage doit vider le dossier.
AnalyseurJournal.nettoyerOrphelins();
const restants = existsSync(join(tmpdir(), 'kablix-analyseur'))
	? readdirSync(join(tmpdir(), 'kablix-analyseur'))
	: [];
check(restants.length === 0, 'le balayage efface les journaux orphelins', restants.join(', '));

// --- 10. Contrôles de source ---------------------------------------------
// Motifs ANCRÉS en début de ligne : sans cela un `if (false && …)` les
// laisserait verts (piège relevé au lot .122, revérifié au .123).
const panel = readFileSync(join(RACINE, 'src/panel.ts'), 'utf8');
check(/^\s*this\.journalAnalyseur\(\)\.verser\(salves\);$/m.test(panel),
	'source : les fronts sont versés au journal au fil de l’eau');
check(/^\s*this\.journalAnalyseur\(\)\.demarrer\(this\.voiesJournal\(\)\);$/m.test(panel),
	'source : un nouveau lancement redémarre le journal');
check(/^\s*AnalyseurJournal\.fermer\(this\.analyseurCleRangee \?\? this\.analyseurCle\(\)\);$/m.test(panel),
	'source : la fermeture du projet ferme son journal');
check(!/\.\.\.\(voies && voies\.length > 0 \? \{ voies \} : \{\}\)/.test(panel),
	'source : la capture n’est plus gravée dans le .projix');

// --- Verdict --------------------------------------------------------------
if (echecs.length > 0) {
	for (const e of echecs) console.error(`✗ ${e}`);
	console.error(`analyseur-journal : ${echecs.length} échec(s) sur ${ok + echecs.length}.`);
	process.exit(1);
}
console.log(`analyseur-journal : ${ok} contrôles OK — les mesures sont écrites au fil de l'eau, un fichier par projet, supprimé à la fermeture.`);
