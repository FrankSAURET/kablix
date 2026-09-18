// Un fil qui passe SUR une pince d'analyseur est dessiné DESSOUS.
//
// LA DEMANDE. Frank, item 1.2 du 18/09 : « Les fils qui passent sur une sonde
// doivent etre dessinés dessous ».
//
// CE QUI ÉTAIT DÉJÀ FAIT, ET QUI NE SUFFIT PAS. Le lot .98 a réglé le TRAJET :
// l'autoroutage traite une sonde comme un obstacle qu'on traverse et non qu'on
// contourne, si bien qu'un câble a le droit de passer dessous. Mais un trajet
// n'est pas un dessin : tous les composants sont peints sous les fils (z=3
// contre z=5), donc le câble qui passait sous la pince était quand même peint
// PAR-DESSUS elle. Le geste disait une chose, l'image en montrait une autre.
//
// POURQUOI LA PINCE FAIT EXCEPTION. La règle générale — un dessin ne masque
// jamais un fil — protège la lecture du câblage : une résistance qui
// recouvrirait un câble cacherait le montage. Une pince crocodile n'est pas
// dans le montage, elle est POSÉE DESSUS, comme sur une paillasse. Elle est
// donc le seul composant hissé au-dessus des fils.
//
// CE QU'ON MESURE. `elementFromPoint` au point de croisement : c'est l'élément
// RÉELLEMENT peint en dernier à cet endroit, empilement résolu par le
// navigateur. Comparer des `z-index` dans la feuille de style ne prouverait
// rien — ils dépendent du contexte d'empilement et de l'ordre des règles, et
// c'est justement là qu'on se trompe (le survol d'une broche rabaissait la
// pince à z=4 par une règle écrite plus bas dans le fichier).
//
// Usage : node scripts/verify-sonde-dessus.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-sonde-dessus');

// Pas de backtick dans ce bloc : tout le banc est un gabarit entre backticks.
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => {
	let bon = false, boum = '';
	try { bon = typeof cond === 'function' ? !!cond() : !!cond; }
	catch (e) { boum = ' [exception: ' + (e && e.message) + ']'; }
	checks.push({ name, ok: bon, detail: String(detail) + boum });
};

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));

	// Une pince, et un fil qui la TRAVERSE. Le fil relie deux résistances
	// placées de part et d autre : il n est donc pas branché sur la pince, il ne
	// fait que passer dessus — c est exactement le cas de Frank.
	const sonde = editor.addPart('sonde-logique', 300, 300);
	const rG = editor.addPart('resistor', 150, 330);
	const rD = editor.addPart('resistor', 520, 330);
	await wait(250);

	const rs = editor.rendered.get(sonde.id);
	ok('la pince est rendue', !!rs);
	if (!rs) { publier(); return; }

	const pattesG = [...editor.rendered.get(rG.id).hotspots.keys()];
	const pattesD = [...editor.rendered.get(rD.id).hotspots.keys()];
	editor.addWire({ partId: rG.id, pin: pattesG[1] }, { partId: rD.id, pin: pattesD[0] });
	await wait(250);
	// Ramener la scène dans la fenêtre : les coordonnées passées à addPart sont
	// celles du MONDE, et la caméra par défaut les place hors de l écran (mesuré :
	// le centre de la pince tombait en -1088 ; -781). elementFromPoint ne rend
	// rien hors fenêtre — le banc échouerait pour une raison qui n est pas le
	// code testé.
	editor.fitView();
	await wait(250);

	// Point de croisement : le CENTRE du dessin de la pince. On vérifie d abord
	// qu un fil y passe vraiment, sinon le contrôle suivant serait vert pour la
	// mauvaise raison (rien à masquer = pince forcément devant).
	const bc = rs.container.getBoundingClientRect();
	const cx = Math.round(bc.left + bc.width / 2);
	const cy = Math.round(bc.top + bc.height / 2);

	const svg = document.getElementById('wires');
	// Le SVG est pointer-events:none : elementFromPoint ne le renverra jamais.
	// On cherche donc le fil par sa GÉOMÉTRIE — passe-t-il par ce point ? — et
	// l empilement par elementFromPoint.
	const traces = [...svg.querySelectorAll('path')];
	const filPasseIci = traces.some((p) => {
		const b = p.getBoundingClientRect();
		return cx >= b.left - 2 && cx <= b.right + 2 && cy >= b.top - 6 && cy <= b.bottom + 6;
	});
	ok('un fil passe bien SUR la pince (sinon le banc ne prouverait rien)',
		filPasseIci, traces.length + ' tracé(s)');

	// L élément peint au point de croisement doit appartenir à la PINCE.
	const dessus = document.elementFromPoint(cx, cy);
	const dansLaPince = !!dessus && rs.container.contains(dessus);
	ok('au point de croisement, c est la PINCE qui est peinte par-dessus',
		dansLaPince, (dessus ? (dessus.className || dessus.tagName) : 'rien')
		+ ' au point (' + cx + ' ; ' + cy + '), fenêtre '
		+ window.innerWidth + 'x' + window.innerHeight);

	// La classe qui porte la règle : nommer la cause quand la mesure tombe.
	ok('la pince porte la classe qui la hisse au-dessus des fils',
		rs.container.classList.contains('part--over-wires'), rs.container.className);

	// Et son empilement calculé est bien AU-DESSUS de celui des fils.
	const zP = Number(getComputedStyle(rs.container).zIndex);
	const zF = Number(getComputedStyle(svg).zIndex);
	ok('empilement calculé : la pince passe devant le calque des fils',
		zP > zF, 'pince ' + zP + ' contre fils ' + zF);

	// --- Le SURVOL d une broche ne doit pas la faire replonger ---------------
	// L éditeur hisse le composant dont une broche est approchée (z=4) pour que
	// le clic atteigne la pastille. Sur la pince, cette règle la ferait passer
	// DERRIÈRE les fils le temps du survol — un clignotement, et le défaut de
	// Frank qui revient dès qu on approche la souris.
	rs.container.classList.add('part--pin-reachable');
	await wait(80);
	const zSurvol = Number(getComputedStyle(rs.container).zIndex);
	const dessusSurvol = document.elementFromPoint(cx, cy);
	ok('broche survolée : la pince RESTE au-dessus des fils',
		zSurvol > zF, 'z=' + zSurvol + ' contre fils ' + zF);
	ok('broche survolée : c est toujours la pince qui est peinte au croisement',
		!!dessusSurvol && rs.container.contains(dessusSurvol),
		dessusSurvol ? (dessusSurvol.className || dessusSurvol.tagName) : 'rien');
	rs.container.classList.remove('part--pin-reachable');

	// --- CONTRE-CAS : un composant ORDINAIRE reste sous les fils --------------
	// Le garde-fou. Si l on avait hissé tout le monde, les contrôles ci-dessus
	// passeraient pour une raison fausse — et le câblage deviendrait illisible
	// partout ailleurs, ce que la règle générale interdit.
	const rr = editor.rendered.get(rG.id);
	const zR = Number(getComputedStyle(rr.container).zIndex);
	ok('une résistance, elle, reste SOUS les fils (la règle générale tient)',
		zR < zF, 'résistance ' + zR + ' contre fils ' + zF);

	publier();
}
function publier() {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	checks.push({ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) });
	publier();
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
	'--window-size=1200,800', '--virtual-time-budget=25000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('❌ mesures introuvables — la page n\'a pas fini son script.'); console.log(dom.slice(0, 1200)); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `sonde-dessus : ${fail} échec(s).` : `sonde-dessus : ${rows.length} contrôles OK — les fils passent sous la pince.`);
process.exit(fail ? 1 : 0);
