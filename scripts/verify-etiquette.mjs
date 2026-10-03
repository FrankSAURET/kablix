// Test de régression : étiquette libre des appareils de mesure (v2026.9.2.59).
// Demande de Frank : « ajouter une étiquette libre sur les appareils de mesure.
// Vide par défaut. Si elle est remplie elle s'affiche automatiquement dans la
// même zone que l'id ou le nom des composants. »
// Contrôles : vide au départ (rien ne sort), remplie elle sort SANS qu'aucune
// case du menu Noms soit cochée, elle cohabite avec l'id et le nom quand ils
// sont demandés, elle SURVIT à la simulation (le bandeau est masqué en verrou,
// sauf pour elle) alors que l'id et le nom y retombent, et la vider referme tout.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-etiquette');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/multimetre-element.mjs';
import '../../src/webview/composants/oscillo-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	await wait(30);

	const contOf = (id) => [...document.querySelectorAll('.part')]
		.find((c) => (c.querySelector('.part__id')?.textContent ?? '') === id);
	// Un élément est-il RÉELLEMENT visible ? getComputedStyle, pas la classe :
	// c'est bien la cascade CSS qu'on teste, pas l'intention du code.
	const vu = (el) => !!el && getComputedStyle(el).display !== 'none';
	const tagOf = (id) => contOf(id)?.querySelector('.part__tag');
	const headOf = (id) => contOf(id)?.querySelector('.part__head');
	const idOf = (id) => contOf(id)?.querySelector('.part__id');
	const nameOf = (id) => contOf(id)?.querySelector('.part__name');
	// Les trois modes du menu Noms, tels que sim.mts les pose sur le canevas.
	const noms = (mode, ids) => {
		canvas.classList.toggle('canvas--show-labels', mode === 'all');
		canvas.classList.toggle('canvas--labels-sel', mode === 'selected');
		canvas.classList.toggle('canvas--show-ids', !!ids);
	};

	const m = editor.addPart('multimetre', 200, 200);
	const o = editor.addPart('oscillo', 600, 200);
	await wait(120);

	// 1. Vide par défaut : aucune étiquette, et le bandeau reste fermé.
	noms('none', false);
	ok('1. multimetre : le span etiquette existe mais est vide', tagOf(m.id)?.textContent === '',
		JSON.stringify(tagOf(m.id)?.textContent));
	ok('1. multimetre : etiquette vide = rien d affiche', !vu(tagOf(m.id)));
	ok('1. multimetre : etiquette vide = bandeau ferme (comme avant)', !vu(headOf(m.id)));
	ok('1. oscilloscope : etiquette vide aussi', tagOf(o.id)?.textContent === '' && !vu(headOf(o.id)));

	// 2. Remplie : elle sort TOUTE SEULE, sans aucune case du menu Noms.
	editor.updatePartAttr(m.id, 'etiquette', 'Vce');
	await wait(60);
	ok('2. remplie : le texte est pose dans le bandeau', tagOf(m.id)?.textContent === 'Vce',
		JSON.stringify(tagOf(m.id)?.textContent));
	ok('2. remplie : le bandeau s ouvre sans case cochee', vu(headOf(m.id)));
	ok('2. remplie : l etiquette est visible', vu(tagOf(m.id)));
	ok('2. remplie : l id reste cache (aucune case cochee)', !vu(idOf(m.id)));
	ok('2. remplie : le nom reste cache (aucune case cochee)', !vu(nameOf(m.id)));
	ok('2. le voisin sans etiquette n a pas bouge', !vu(headOf(o.id)) && !vu(tagOf(o.id)));

	// 3. Cohabitation : « id + tous les noms » -> les trois ensemble, dans l ordre.
	noms('all', true);
	await wait(30);
	ok('3. id + noms : les trois sortent ensemble',
		vu(idOf(m.id)) && vu(nameOf(m.id)) && vu(tagOf(m.id)));
	const head = headOf(m.id);
	const ordre = [...head.children].filter((c) => vu(c)).map((c) => c.className);
	ok('3. ordre dans le bandeau : id, separateur, nom, etiquette',
		ordre.join('|') === 'part__id|part__sep|part__name|part__tag', ordre.join('|'));
	const bi = idOf(m.id).getBoundingClientRect();
	const bt = tagOf(m.id).getBoundingClientRect();
	ok('3. l etiquette est bien dans la MEME zone que l id (meme ligne)',
		Math.abs(bi.top - bt.top) < 3 && bt.left > bi.left,
		'id y=' + bi.top.toFixed(0) + ' etiquette y=' + bt.top.toFixed(0));
	const ecart = bt.left - nameOf(m.id).getBoundingClientRect().right;
	ok('3. et elle est ecartee du nom qui la precede', ecart >= 4, 'ecart ' + ecart.toFixed(1) + ' px');

	// 4. Simulation : le bandeau disparait partout SAUF la ou il y a une etiquette,
	// et il n y reste QUE l etiquette — l id et le nom retombent.
	editor.setLocked(true);
	await wait(60);
	ok('4. simulation : le bandeau de l appareil etiquete reste', vu(headOf(m.id)));
	ok('4. simulation : l etiquette y est lisible', vu(tagOf(m.id)));
	ok('4. simulation : l id retombe malgre sa case cochee', !vu(idOf(m.id)));
	ok('4. simulation : le nom retombe aussi', !vu(nameOf(m.id)));
	ok('4. simulation : l appareil SANS etiquette n a plus de bandeau', !vu(headOf(o.id)));
	editor.setLocked(false);
	await wait(40);

	// 5. Vidée : tout redevient comme avant.
	noms('none', false);
	editor.updatePartAttr(m.id, 'etiquette', '');
	await wait(60);
	ok('5. videe : le bandeau se referme', !vu(headOf(m.id)));
	ok('5. videe : plus de classe part--tagged', !contOf(m.id).classList.contains('part--tagged'));
	// Espaces seuls = vide : on ne garde pas un bandeau ouvert sur du blanc.
	editor.updatePartAttr(m.id, 'etiquette', '   ');
	await wait(40);
	ok('5. des espaces seuls ne comptent pas pour une etiquette', !vu(headOf(m.id)));

	// 6. L etiquette n est PAS un reglage du dessin : rien ne doit etre pose sur
	// l element Lit (elle vit dans le bandeau, cf. renderPart).
	editor.updatePartAttr(o.id, 'etiquette', 'Signal PWM');
	await wait(60);
	const el = contOf(o.id).querySelector('kablix-oscillo');
	ok('6. rien n est pose sur l element dessine', !el.hasAttribute('etiquette'));
	ok('6. mais le bandeau de l oscilloscope, lui, la porte',
		vu(headOf(o.id)) && tagOf(o.id).textContent === 'Signal PWM');

	// 7. Elle SURVIT a un enregistrement / relecture du schema (attribut du .projix).
	const json = JSON.stringify(editor.diagram);
	ok('7. l etiquette part dans le schema enregistre', json.includes('"etiquette":"Signal PWM"'),
		json.slice(0, 200));
	editor.loadDiagram(JSON.parse(json));
	await wait(150);
	ok('7. et elle revient au rechargement', tagOf(o.id)?.textContent === 'Signal PWM' && vu(headOf(o.id)),
		JSON.stringify(tagOf(o.id)?.textContent));

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
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1200px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=40000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `étiquette : ${fail} échec(s).` : `étiquette : ${rows.length} contrôles OK — l'étiquette libre sort seule, cohabite et survit à la simulation.`);
process.exit(fail ? 1 : 0);
