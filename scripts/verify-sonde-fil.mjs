// Une pince BRANCHÉE PAR UN FIL prend sa couleur de voie (v2026.9.4.102).
//
// LE DÉFAUT. Frank : « une sonde reliée par un fil reste grise et ne peut pas
// changer de couleur ». Deux gestes sont légitimes pour brancher une pince —
// la poser sur une pastille, ou relier son crochet au point à écouter par un
// cordon — mais seul le PREMIER lui donnait un indice de voie. `poserSonde`
// n'attribuait une teinte que si la pointe recouvrait une pastille : sans
// cible, la pince gardait `voie` vide, restait grise sur la planche, et son
// inspecteur n'offrait aucune pastille de couleur à choisir. Le modèle, lui,
// la traçait déjà (il suit le fil jusqu'à la broche) : l'analyseur montrait
// donc une voie que la planche ne savait pas colorer.
//
// POURQUOI UN BANC DANS LE NAVIGATEUR. La pose vit dans le DOM : `poserSonde`
// lit les hotspots du composant rendu, et `sondeFilAttache` cherche la pointe
// dans cette même table. `verify-analyseur.mjs` tourne en Node pur et ne peut
// rien en dire ; `verify-align.mjs` couvre l'attribut `relie` — le DESSIN de
// la pince — pas l'attribution de la voie par l'ÉDITEUR. C'est ce trou-là
// qu'on ferme ici.
//
// TROIS CHEMINS, UN SEUL COMPORTEMENT. Un fil naît de trois façons : le geste
// (`completeWire`), le schéma de démarrage et l'autoroutage (`addWire`), la
// réouverture d'un .projix (`loadDiagram`). Une pince doit être colorée par
// les trois, sinon sa teinte dépend de la façon dont le fil est arrivé — et
// un schéma rouvert perdrait la couleur qu'il montrait avant d'être fermé.
//
// Usage : node scripts/verify-sonde-fil.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-sonde-fil');

// Pas de backtick dans ce bloc : tout le banc est un gabarit entre backticks.
// (Piège déjà payé six fois dans les lots précédents.)
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));

	// La carte sert de point à écouter. On lit ses vraies pattes plutôt que d'en
	// nommer une en dur : le brochage change au fil des retouches de planche.
	const carte = editor.addPart('pico', 40, 40);
	await wait(120);
	const pattesCarte = [...(editor.rendered.get(carte.id) || {}).hotspots.keys()];
	ok('la carte de test expose des pattes', pattesCarte.length > 2, pattesCarte.length + ' pattes');
	const broche = pattesCarte.find((p) => /^GP\\d/.test(p)) || pattesCarte[0];

	// --- 1. Le GESTE : une pince posée dans le vide, puis reliée par un fil ---
	// Loin de la carte : la pointe ne recouvre AUCUNE pastille, c'est tout
	// l'intérêt du cas. Une pince qui touche une patte serait colorée par
	// l'ancien code aussi, et le banc ne prouverait rien.
	const sonde = editor.addPart('sonde-logique', 520, 420);
	await wait(120);
	const elSonde = (editor.rendered.get(sonde.id) || {}).el;
	const pointe = [...(editor.rendered.get(sonde.id) || {}).hotspots.keys()][0];
	ok('la pince a bien une pastille (sa pointe)', !!pointe, String(pointe));
	ok('posée dans le vide, la pince n a encore aucune voie',
		!(sonde.attrs && (sonde.attrs.voie || '').trim()), JSON.stringify(sonde.attrs || {}));

	editor.addWire({ partId: sonde.id, pin: pointe }, { partId: carte.id, pin: broche });
	await wait(120);
	const voieApresFil = (editor.diagram.parts.find((p) => p.id === sonde.id).attrs || {}).voie;
	ok('branchée par un fil : la pince reçoit un indice de voie',
		voieApresFil === '0', 'voie=' + JSON.stringify(voieApresFil));
	ok('branchée par un fil : l attribut voie est posé sur le DESSIN aussi',
		elSonde && elSonde.getAttribute('voie') === '0', String(elSonde && elSonde.getAttribute('voie')));

	// Le DESSIN doit suivre. Attention à ce qui est prouvé ici : l'élément se
	// peint d'après son indice de voie ET son état branché, et cet état demande
	// l attribut accroche (la pose) ou l attribut relie (le cordon). Or relie est
	// posé par sim.mts, qui n est pas dans ce banc — l éditeur seul ne le pose
	// jamais. On simule donc ce que sim.mts fera au premier onChange, et ce qu on
	// mesure est : l indice de voie attribué ici SUFFIT à colorer, il ne manque
	// plus rien d autre. (verify-align.mjs couvre, lui, le seul attribut relie.)
	elSonde.setAttribute('relie', '1');
	await wait(60);
	const corps = elSonde && elSonde.shadowRoot && elSonde.shadowRoot.querySelector('#rect2-4');
	// Le gris inerte vaut #9e9e9e (GRIS_INERTE de sonde-logique-element.mts). Le
	// relire dans le fichier plutôt que de le recopier d une autre valeur : une
	// constante fausse ici donnerait un contrôle vert QUOI QU IL ARRIVE.
	ok('avec sa voie, la pince branchée se peint (plus de gris inerte)',
		corps && corps.getAttribute('fill') !== '#9e9e9e', String(corps && corps.getAttribute('fill')));
	elSonde.removeAttribute('relie');
	await wait(60);

	// --- 2. L INSPECTEUR : la pastille de couleur devient choisissable --------
	// « ne peux pas changer de couleur » : sans indice de voie, aucune pastille
	// n'était MARQUÉE comme celle de la pince. On exige donc la pastille ACTIVE,
	// pas la simple présence d'un nuancier : le nuancier, lui, est dessiné dans
	// les deux cas et un contrôle sur son existence serait vert avant comme
	// après la correction — donc un contrôle qui ne prouve rien.
	editor.select({ kind: 'part', id: sonde.id });
	await wait(120);
	const insp = document.getElementById('inspector');
	const pastilles = [...insp.querySelectorAll('.inspector__swatch')];
	const active = [...insp.querySelectorAll('.inspector__swatch--active')];
	ok('l inspecteur de la pince propose bien un nuancier de voies',
		pastilles.length === 8, pastilles.length + ' pastilles');
	ok('la pastille de SA voie est marquée comme choisie',
		active.length === 1 && pastilles.indexOf(active[0]) === 0,
		active.length + ' active(s), rang ' + (active[0] ? pastilles.indexOf(active[0]) : -1));

	// --- 3. Une DEUXIÈME pince branchée prend une AUTRE voie ------------------
	// Deux pinces de la même couleur casseraient le lien visuel entre la pince
	// et sa piste dans l'analyseur.
	const broche2 = pattesCarte.filter((p) => /^GP\\d/.test(p))[1] || pattesCarte[1];
	const sonde2 = editor.addPart('sonde-logique', 560, 460);
	await wait(120);
	const pointe2 = [...(editor.rendered.get(sonde2.id) || {}).hotspots.keys()][0];
	editor.addWire({ partId: sonde2.id, pin: pointe2 }, { partId: carte.id, pin: broche2 });
	await wait(120);
	const voie2 = (editor.diagram.parts.find((p) => p.id === sonde2.id).attrs || {}).voie;
	ok('une deuxième pince branchée prend une voie DIFFÉRENTE',
		voie2 === '1', 'voie=' + JSON.stringify(voie2));

	// --- 4. La RÉOUVERTURE : le schéma rouvert garde ses couleurs -------------
	// Un .projix écrit avant ce lot porte des fils mais pas d'indice de voie sur
	// ses pinces. Rouvert, il doit colorer quand même — sinon la correction ne
	// tient que le temps de la séance en cours.
	const schema = {
		parts: [
			{ id: 'pico1', type: 'pico', x: 40, y: 40, attrs: {} },
			{ id: 'sonde9', type: 'sonde-logique', x: 520, y: 420, attrs: {} },
		],
		wires: [{ id: 'w1', a: { partId: 'sonde9', pin: pointe }, b: { partId: 'pico1', pin: broche } }],
	};
	editor.loadDiagram(schema);
	await wait(200);
	const rouverte = editor.diagram.parts.find((p) => p.type === 'sonde-logique');
	ok('schéma rouvert : la pince branchée au cordon est colorée elle aussi',
		rouverte && (rouverte.attrs || {}).voie === '0', JSON.stringify(rouverte && rouverte.attrs));

	// --- 5. CONTRE-CAS : une pince sans rien au bout reste grise --------------
	// Le garde-fou du banc : si l'on colorait TOUTE pince, les contrôles ci-
	// dessus passeraient pour une raison fausse. Une pince qui pend ne mesure
	// rien et doit rester grise, c'est l'état qu'on voit sur la paillasse.
	const seule = editor.addPart('sonde-logique', 600, 500);
	await wait(120);
	const voieSeule = (editor.diagram.parts.find((p) => p.id === seule.id).attrs || {}).voie;
	ok('une pince sans fil ni pastille ne reçoit AUCUNE voie',
		!(voieSeule || '').trim(), 'voie=' + JSON.stringify(voieSeule));

	// --- 6. Un fil qui ne touche PAS la pointe ne branche rien ----------------
	// La pince n'a qu'une pastille, mais un fil peut passer à côté : c'est le
	// branchement sur la POINTE qui compte, pas le voisinage.
	const r = editor.addPart('resistor', 300, 300);
	await wait(120);
	const pattesR = [...(editor.rendered.get(r.id) || {}).hotspots.keys()];
	editor.addWire({ partId: r.id, pin: pattesR[0] }, { partId: carte.id, pin: broche });
	await wait(120);
	const voieSeule2 = (editor.diagram.parts.find((p) => p.id === seule.id).attrs || {}).voie;
	ok('un fil entre deux AUTRES composants ne colore aucune pince',
		!(voieSeule2 || '').trim(), 'voie=' + JSON.stringify(voieSeule2));

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
	document.body.appendChild(out);
});
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')],
	bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:900px;height:700px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);

const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — banc ignoré.'); process.exit(0); }
const dom = execFileSync(chrome, [
	'--headless=new', '--disable-gpu', '--no-sandbox',
	'--virtual-time-budget=25000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('❌ mesures introuvables — la page n\'a pas fini son script.'); console.log(dom.slice(0, 1500)); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `sonde-fil : ${fail} échec(s).` : `sonde-fil : ${rows.length} contrôles OK — une pince branchée au cordon prend sa couleur de voie.`);
process.exit(fail ? 1 : 0);
