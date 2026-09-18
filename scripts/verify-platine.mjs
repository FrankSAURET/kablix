// La platine d'essai a la bonne géométrie, et elle montre ses liaisons.
//
// LA DEMANDE. Frank, item 2 du 18/09 : « Nos 3 platines d'essais sont fausses.
// L'écart entre les lignes du haut et du bas doit être de 3 pas (pour nous 30px)
// actuellement il n'y en a que 2. Corrige. En même temps tu fais un schéma
// interne qui montre les liaison entre les trous, matérialisé par des lignes
// jaunes orangé semi transparentes qui relient les trous. »
//
// CE QUE CE BANC PROUVE.
//   1. L'écart entre la rangée `e` (bas du bloc du haut) et la rangée `f` (haut
//      du bloc du bas) vaut 3 pas de 10 px, sur les TROIS tailles. C'est le
//      0,3 pouce d'un boîtier DIL, qui doit enjamber la rigole une patte de
//      chaque côté : à 2 pas, aucun circuit intégré ne tombait juste.
//   2. Le reste de la géométrie n'a pas bougé au passage : pas de 10 px partout
//      ailleurs, trous toujours alignés sur la grille, hauteur cohérente.
//   3. La vue interne existe pour les trois tailles, ses lignes sont jaune
//      orangé et semi-transparentes, et surtout elles relient EXACTEMENT les
//      bandes de la netlist — une ligne par bande, d'un bout à l'autre.
//
// POURQUOI MESURER LA GÉOMÉTRIE ET NON LIRE LA CONSTANTE. Relire `CHANNEL === 30`
// ne prouverait rien : la constante sert à calculer `bottomStart`, et c'est cette
// chaîne-là qui peut se tromper. On demande donc leurs coordonnées aux trous
// eux-mêmes, par la fonction dont se sert l'élément visuel.
//
// POURQUOI COMPARER LA VUE INTERNE À LA NETLIST. Un schéma interne dessiné à
// part finirait par mentir : il montrerait des liaisons que la simulation ne
// fait pas (ou l'inverse). Le banc exige donc que chaque ligne tracée corresponde
// à une bande de `breadboardStrips` — la MÊME fonction que celle qui construit
// les équipotentielles.
//
// Usage : node scripts/verify-platine.mjs
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-platine');
mkdirSync(CACHE, { recursive: true });

const checks = [];
const ok = (nom, cond, detail = '') => {
	let val = cond;
	if (typeof cond === 'function') {
		try { val = cond(); }
		catch (e) { val = false; detail = `mesure impossible : ${e.message}`; }
	}
	checks.push({ nom, ok: !!val });
	console.log(`${val ? '✅' : '❌'} ${nom}${val ? '' : ` — ${detail}`}`);
};

// Géométrie et câblage interne sont en TypeScript : on les compile pour node.
// Le module de câblage interne importe des .svg (les schémas dessinés), que
// node ne sait pas charger : on les remplace par une chaîne vide, ce banc ne
// s'intéressant qu'au tracé PROCÉDURAL de la platine.
const svgVide = {
	name: 'svg-vide',
	setup(build) {
		build.onLoad({ filter: /\.svg$/ }, () => ({ contents: 'export default "";', loader: 'js' }));
	},
};

async function charger(entree) {
	const paquet = await esbuild({
		entryPoints: [join(ROOT, entree)],
		bundle: true, format: 'esm', write: false, platform: 'node', absWorkingDir: ROOT,
		plugins: [svgVide],
	});
	const url = 'data:text/javascript;base64,' + Buffer.from(paquet.outputFiles[0].text).toString('base64');
	return import(url);
}

const bb = await charger('src/webview/diagram/breadboard.mts');
const cablage = await charger('src/webview/diagram/internal-wiring.mts');

const TAILLES = ['mini', 'half', 'full'];
const PAS = bb.BB_STEP;

ok('le pas de la platine vaut 10 px', PAS === 10, `BB_STEP=${PAS}`);

// --- 1. L'écart e → f, la demande elle-même ----------------------------------
for (const taille of TAILLES) {
	const trous = bb.breadboardPins(taille);
	const at = (nom) => trous.find((p) => p.name === nom);
	const e1 = at('e1');
	const f1 = at('f1');
	ok(`${taille} : les rangées e et f existent`, !!e1 && !!f1);
	if (!e1 || !f1) continue;
	const ecart = f1.y - e1.y;
	ok(`${taille} : l'écart entre les lignes du haut et du bas vaut 3 pas`,
		ecart === 3 * PAS, `mesuré ${ecart} px, soit ${ecart / PAS} pas`);
	// L'écart doit valoir 3 pas sur TOUTE la longueur, pas seulement colonne 1 :
	// une rangée penchée passerait le contrôle précédent.
	const cols = bb.BREADBOARD_SIZES[taille].cols;
	let constant = true;
	for (let c = 1; c <= cols; c++) {
		const e = at(`e${c}`);
		const f = at(`f${c}`);
		if (!e || !f || f.y - e.y !== 3 * PAS) { constant = false; break; }
	}
	ok(`${taille} : l'écart vaut 3 pas sur les ${cols} colonnes`, constant);
}

// --- 2. Le reste de la géométrie n'a pas bougé -------------------------------
for (const taille of TAILLES) {
	const trous = bb.breadboardPins(taille);
	const at = (nom) => trous.find((p) => p.name === nom);
	// Dans un bloc, les rangées restent à un pas l'une de l'autre : le
	// déplacement ne doit pas avoir écarté a–e ou f–j au passage.
	const blocHaut = ['a1', 'b1', 'c1', 'd1', 'e1'].map(at);
	const blocBas = ['f1', 'g1', 'h1', 'i1', 'j1'].map(at);
	const serre = (bloc) => bloc.every((p, i) => i === 0 || p.y - bloc[i - 1].y === PAS);
	ok(`${taille} : les 5 rangées du bloc du haut restent au pas de 10 px`, serre(blocHaut));
	ok(`${taille} : les 5 rangées du bloc du bas restent au pas de 10 px`, serre(blocBas));
	// Colonnes au pas, elles aussi.
	ok(`${taille} : les colonnes restent au pas de 10 px`,
		at('a2').x - at('a1').x === PAS, `${at('a2').x - at('a1').x} px`);
	// Les trous restent sur une MAILLE de 10 px. On mesure l'écart au trou 'a1',
	// pas la position absolue : la planche porte une marge de 16 px à gauche
	// (`MARGIN_X`), donc x vaut 16, 26, 36… Ce qui compte pour poser un composant
	// sans le décaler d'un demi-carreau, c'est que TOUS les trous soient à un
	// multiple du pas les uns des autres — la platine entière se cale ensuite
	// d'un bloc sur la grille de l'éditeur.
	const zero = at('a1');
	ok(`${taille} : tous les trous sont sur la même maille de 10 px`,
		trous.every((p) => (p.x - zero.x) % PAS === 0 && (p.y - zero.y) % PAS === 0),
		trous.filter((p) => (p.x - zero.x) % PAS || (p.y - zero.y) % PAS)
			.slice(0, 3).map((p) => `${p.name}(${p.x},${p.y})`).join(', '));
	// La platine doit contenir ses trous : le bloc du bas est descendu de 10 px,
	// la hauteur doit avoir suivi.
	const dims = bb.breadboardDims(taille);
	const basTrou = Math.max(...trous.map((p) => p.y));
	ok(`${taille} : la planche est assez haute pour ses trous`,
		basTrou < dims.height, `trou le plus bas à ${basTrou}, hauteur ${dims.height}`);
}

// --- 3. La vue interne : existence, couleur, transparence --------------------
for (const taille of TAILLES) {
	const trous = bb.breadboardPins(taille).map((p) => ({ name: p.name, x: p.x, y: p.y }));
	const svg = cablage.internalWiringSvg('breadboard', trous, { size: taille }, 'breadboard',
		bb.breadboardDims(taille));
	ok(`${taille} : la platine a une vue interne`, typeof svg === 'string' && svg.length > 0);
	if (!svg) continue;
	// Jaune orangé : rouge fort, vert moyen, bleu faible. On lit la couleur
	// écrite plutôt que de comparer à une chaîne figée — repeindre d'un autre
	// jaune orangé ne doit pas faire tomber le banc, virer au vert si.
	const couleur = /stroke="#([0-9a-fA-F]{6})"/.exec(svg)?.[1];
	ok(`${taille} : les lignes ont une couleur`, !!couleur, svg.slice(0, 120));
	if (couleur) {
		const r = parseInt(couleur.slice(0, 2), 16);
		const v = parseInt(couleur.slice(2, 4), 16);
		const b = parseInt(couleur.slice(4, 6), 16);
		ok(`${taille} : la couleur est un jaune orangé (#${couleur})`,
			r > 200 && v > 100 && v < r && b < 100, `r=${r} v=${v} b=${b}`);
	}
	const opacite = Number(/stroke-opacity="([\d.]+)"/.exec(svg)?.[1] ?? NaN);
	ok(`${taille} : les lignes sont semi-transparentes`,
		opacite > 0 && opacite < 1, `stroke-opacity=${opacite}`);
	// Encadrement des deux côtés : un cheveu ne « matérialiserait » rien, mais un
	// trait plus large que les trous (4 px) les enfouirait — et une liaison qui
	// cache ce qu'elle relie ne montre plus rien. Mesuré au rendu Chrome.
	const epaisseur = Number(/stroke-width="([\d.]+)"/.exec(svg)?.[1] ?? NaN);
	ok(`${taille} : les lignes se voient sans enfouir les trous`,
		epaisseur >= 2 && epaisseur <= 4, `stroke-width=${epaisseur}`);
}

// --- 4. Les lignes disent la MÊME chose que la netlist -----------------------
for (const taille of TAILLES) {
	const trous = bb.breadboardPins(taille).map((p) => ({ name: p.name, x: p.x, y: p.y }));
	const at = new Map(trous.map((p) => [p.name, p]));
	const svg = cablage.internalWiringSvg('breadboard', trous, { size: taille }, 'breadboard',
		bb.breadboardDims(taille));
	if (!svg) continue;
	const tracees = [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"\/>/g)]
		.map((m) => `${m[1]},${m[2]}→${m[3]},${m[4]}`);
	const bandes = bb.breadboardStrips(taille).filter((s) => s.length >= 2);
	// Une ligne par bande : ni bande oubliée (liaison invisible), ni ligne en
	// trop (liaison montrée qui n'existe pas).
	ok(`${taille} : autant de lignes que de bandes (${bandes.length})`,
		tracees.length === bandes.length, `${tracees.length} ligne(s) tracée(s)`);
	// Et chaque ligne va bien du PREMIER au DERNIER trou de sa bande.
	const attendues = new Set(bandes.map((bande) => {
		const a = at.get(bande[0]);
		const z = at.get(bande[bande.length - 1]);
		return `${a.x},${a.y}→${z.x},${z.y}`;
	}));
	const manquantes = [...attendues].filter((t) => !tracees.includes(t));
	ok(`${taille} : chaque bande est reliée d'un bout à l'autre`,
		manquantes.length === 0, `${manquantes.length} manquante(s) : ${manquantes.slice(0, 3).join(' ')}`);
	const enTrop = tracees.filter((t) => !attendues.has(t));
	ok(`${taille} : aucune liaison montrée qui n'existe pas`,
		enTrop.length === 0, `${enTrop.length} en trop : ${enTrop.slice(0, 3).join(' ')}`);
}

// --- 5. Contrôle du contrôle -------------------------------------------------
// Ce banc lit un tracé au marqueur `<line …/>` : si le format changeait, tout
// le bloc 4 deviendrait vert en ne mesurant plus rien. On vérifie donc qu'il y
// a bien des lignes à lire, et que la mini (sans rails) en a moins que la full.
const nLignes = (taille) => {
	const trous = bb.breadboardPins(taille).map((p) => ({ name: p.name, x: p.x, y: p.y }));
	const svg = cablage.internalWiringSvg('breadboard', trous, { size: taille }, 'breadboard',
		bb.breadboardDims(taille)) ?? '';
	return [...svg.matchAll(/<line /g)].length;
};
ok('la mini trace bien des lignes (le banc mesure quelque chose)', nLignes('mini') > 0,
	`${nLignes('mini')} ligne(s)`);
ok('la full en trace plus que la mini (63 colonnes contre 17, plus les rails)',
	nLignes('full') > nLignes('mini'), `full=${nLignes('full')} mini=${nLignes('mini')}`);
// La mini n'a PAS de rails : aucune de ses bandes ne doit porter un nom de rail.
ok('la mini n\'a pas de rail d\'alimentation',
	bb.breadboardStrips('mini').every((s) => !/^[tb][pn]\./.test(s[0])));
ok('la half et la full ont leurs 4 rails',
	['half', 'full'].every((t) =>
		bb.breadboardStrips(t).filter((s) => /^[tb][pn]\./.test(s[0])).length === 4));

const rates = checks.filter((c) => !c.ok);
console.log(rates.length === 0
	? `platine : ${checks.length} contrôles OK — 3 pas entre les blocs, et les liaisons affichées sont celles de la netlist.`
	: `platine : ${rates.length} échec(s) sur ${checks.length}.`);
process.exit(rates.length === 0 ? 0 : 1);
