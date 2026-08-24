// Autoroutage des bancs Pico 2, une fois pour toutes.
//
// Les jumeaux Pico 2 reprennent le montage de leur aîné Pico (cf. _spec.mjs),
// mais la carte y est en PORTRAIT : les points de passage tracés autour d'une
// carte paysage n'ont plus aucun sens, et un fil sans point de passage est une
// DIAGONALE qui traverse la carte. L'autoroutage de l'éditeur sait faire ce
// tracé — encore faut-il l'exécuter, et il lui faut un vrai DOM (il mesure les
// composants rendus pour connaître les obstacles).
//
// Ce script charge donc chaque jumeau dans le VRAI éditeur (Chrome headless),
// appelle `autoRoute()` et range le résultat dans `testkablix/_routage.json`,
// que `_spec.mjs` réapplique aux fils. Le routage est ainsi versionné, relu à
// chaque génération, et se refait à la demande :
//   node scripts/_router-jumeaux-pico2.mjs            (tous les jumeaux)
//   node scripts/_router-jumeaux-pico2.mjs led-pico2  (ceux-là seulement)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { lireKompixes } from './_lire-kompix.mjs';
import { TESTS } from '../testkablix/_spec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-router-pico2');
const SORTIE = join(ROOT, 'testkablix', '_routage.json');

const only = new Set(process.argv.slice(2));
const jumeaux = TESTS.filter((t) => t.codeFrom && (only.size === 0 || only.has(t.name)));
if (jumeaux.length === 0) {
	console.error('Aucun jumeau Pico 2 à router.');
	process.exit(1);
}

// Composants de bibliothèque embarqués : l'éditeur doit les connaître avant de
// charger le schéma, exactement comme la webview à l'ouverture d'un .projix.
const kompixParTest = {};
for (const t of jumeaux) if (t.kompix) kompixParTest[t.name] = await lireKompixes(t.kompix);

// Les forks de composants ne sont pas auto-chargés. La liste des tags à
// enregistrer est celle de la webview elle-même (`sim.mts`) : deviner le fichier
// d'après le nom du type rate la moitié du catalogue (`pot` →
// potentiometer-element, les quatre Pico → pico-board) et un composant absent
// n'est pas rendu — donc pas mesuré, donc pas un obstacle : l'autoroutage lui
// passerait AU TRAVERS.
const fichiers = [...readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8')
	.matchAll(/^import '\.\/composants\/(.+?)\.mjs';/gm)].map((m) => m[1]);

const BANCS = jumeaux.map((t) => ({
	name: t.name,
	parts: t.parts,
	wires: t.wires,
	customParts: kompixParTest[t.name] ?? [],
}));

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
${[...fichiers].map((f) => `import '../../src/webview/composants/${f}.mjs';`).join('\n')}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BANCS = ${JSON.stringify(BANCS)};

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const routage = {};
	for (const banc of BANCS) {
		if (banc.customParts.length) editor.loadCustomParts(banc.customParts);
		editor.loadDiagram({ parts: banc.parts, wires: banc.wires });
		// loadDiagram recolle les composants sur la grille par minuteries
		// échelonnées (120/350/800 ms) : router avant la dernière passe
		// calculerait les obstacles sur des positions qui vont encore bouger.
		await wait(1200);
		editor.autoRoute();
		await wait(100);
		const sortie = editor.serialize();
		// Les repères des composants sont conservés par loadDiagram, ceux des
		// fils NON (uid neuf à chaque ouverture) : on rattache chaque tracé à ses
		// EXTRÉMITÉS, seule clé stable d'une génération à l'autre.
		routage[banc.name] = sortie.wires.map((w) => ({
			cle: w.a.partId + '/' + w.a.pin + '—' + w.b.partId + '/' + w.b.pin,
			points: w.points ?? [],
		}));
	}
	trace(JSON.stringify(routage));
}
function trace(texte) {
	const out = document.createElement('pre');
	out.id = 'routage';
	out.textContent = texte;
	document.body.appendChild(out);
}
run().catch((e) => trace('ERREUR ' + (e && e.stack)));
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">`
	+ `<div class="workshop"><aside id="palette" class="palette"></aside>`
	+ `<div id="canvas" class="canvas" style="width:2400px;height:1600px"><svg id="wires" class="wires"></svg></div>`
	+ `<aside id="inspector" class="inspector"></aside></div>`
	+ `<script>${b.outputFiles[0].text}</script></body>`,
);

const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.error('Chrome introuvable.'); process.exit(1); }
// `--headless=old` : le nouveau mode rend la main sans attendre le budget de
// temps virtuel (cf. _view-projix.mjs). Budget large : 47 bancs × 1,3 s de
// temps VIRTUEL, que Chrome consomme aussi vite qu'il calcule.
const page = `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`;
const dom = execFileSync(chrome, [
	'--headless=old', '--disable-gpu', '--no-sandbox',
	'--virtual-time-budget=600000', '--window-size=2500,1600', '--dump-dom', page,
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const m = dom.match(/<pre id="routage"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.error('Aucune trace de routage — la page a échoué.'); process.exit(1); }
const brut = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
if (brut.startsWith('ERREUR')) { console.error(brut); process.exit(1); }

// Fusion avec le routage déjà en place : router un banc seul ne doit pas
// effacer les autres.
const ancien = existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf8')) : {};
const routage = { ...ancien, ...JSON.parse(brut) };
const trie = Object.fromEntries(Object.keys(routage).sort().map((k) => [k, routage[k]]));
writeFileSync(SORTIE, `${JSON.stringify(trie, null, 1)}\n`, 'utf8');

let coudes = 0;
let fils = 0;
for (const t of Object.keys(JSON.parse(brut))) {
	for (const w of routage[t]) { fils++; coudes += w.points.length; }
}
console.log(`OK : ${Object.keys(JSON.parse(brut)).length} bancs routés, ${fils} fils, ${coudes} points de passage.`);
console.log(`→ ${SORTIE}`);
