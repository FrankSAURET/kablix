// Test de régression : la touche Suppr efface ce qui est sélectionné.
// Repro Frank : « l'appui sur la touche Suppr doit supprimer un composant ou un
// fil sélectionné, ou un groupe de composants ou de fils ». Cinq cas se
// tenaient debout, deux tombaient : la sélection MIXTE (rectangle qui attrape
// des composants ET des câbles — seuls les composants partaient) et le clavier
// perdu dès que le focus était dans la webview mais hors du canvas.
// Contrôles : composant seul, fil seul, lot de composants, lot de fils, lot
// mixte, Ctrl+A, coudes de fil, Retour arrière, champ de saisie épargné,
// simulation verrouillée.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-suppression');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
	await wait(30);

	const contOf = (id) => [...document.querySelectorAll('.part')]
		.find((c) => (c.querySelector('.part__id')?.textContent ?? '') === id);
	const clic = (id, ctrl = false) => {
		const body = contOf(id).querySelector('.part__body');
		const b = body.getBoundingClientRect();
		body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0,
			ctrlKey: ctrl, clientX: b.left + 3, clientY: b.top + 3 }));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	};
	const clicFil = (id, ctrl = false) => {
		const path = editor.wirePaths.get(id);
		path.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0,
			ctrlKey: ctrl, clientX: 0, clientY: 0 }));
	};
	// Frappe clavier fidèle : le vrai navigateur remet l'événement à l'élément
	// qui a le focus, et il remonte de là. Dispatcher sur window sauterait
	// justement le trajet qu'on veut vérifier.
	const frappe = (key = 'Delete', cible = null) => {
		const target = cible ?? document.activeElement ?? document.body;
		target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	};
	const vide = async () => {
		for (const p of [...editor.diagram.parts]) editor.removePart(p.id);
		for (const w of [...editor.diagram.wires]) editor.removeWire(w.id);
		editor.select(null);
		await wait(40);
	};
	const nbParts = () => editor.diagram.parts.length;
	const nbFils = () => editor.diagram.wires.length;
	// Deux LED câblées entre elles : un fil visible, deux composants.
	const montage = async (n = 2) => {
		await vide();
		const parts = [];
		for (let i = 0; i < n; i++) parts.push(editor.addPart('led', 200 + i * 200, 200));
		await wait(120);
		for (let i = 0; i + 1 < n; i++) {
			editor.addWire({ partId: parts[i].id, pin: 'C' }, { partId: parts[i + 1].id, pin: 'A' });
		}
		await wait(60);
		return parts;
	};

	// --- 1. Un composant seul ---------------------------------------------------
	let p = await montage(1);
	clic(p[0].id);
	await wait(20);
	frappe();
	await wait(40);
	ok('composant seul : sélectionné puis Suppr, il disparaît', nbParts() === 0, nbParts() + ' composant(s) restant(s)');

	// --- 2. Un fil seul ---------------------------------------------------------
	await montage(2);
	clicFil(editor.diagram.wires[0].id);
	await wait(20);
	frappe();
	await wait(40);
	ok('fil seul : sélectionné puis Suppr, il disparaît',
		nbFils() === 0 && nbParts() === 2, nbFils() + ' fil(s), ' + nbParts() + ' composant(s)');

	// --- 3. Un lot de composants (Ctrl+clic) ------------------------------------
	let ps = await montage(3);
	clic(ps[0].id);
	clic(ps[1].id, true);
	clic(ps[2].id, true);
	await wait(20);
	frappe();
	await wait(60);
	ok('lot de composants : les trois partent d un coup', nbParts() === 0, nbParts() + ' restant(s)');

	// --- 4. Un lot de fils (Ctrl+clic) ------------------------------------------
	ps = await montage(3);
	const fils = editor.diagram.wires.map((w) => w.id);
	clicFil(fils[0]);
	clicFil(fils[1], true);
	await wait(20);
	frappe();
	await wait(60);
	ok('lot de fils : les deux câbles partent, les composants restent',
		nbFils() === 0 && nbParts() === 3, nbFils() + ' fil(s), ' + nbParts() + ' composant(s)');

	// --- 5. Lot MIXTE : des composants ET des fils (rectangle de sélection) -----
	// Le rectangle rafle les deux ; la touche Suppr, elle, ne traitait que les
	// composants — un câble du lot NON branché sur eux restait à l'écran.
	// Montage : 4 LED en file, 3 fils (0-1, 1-2, 2-3). Lot = la LED 0 + le fil
	// 2-3. Attendu : LED 0 et son fil 0-1 partent, le fil 2-3 aussi, il ne reste
	// que 3 LED et le fil 1-2.
	ps = await montage(4);
	editor.selectedParts = new Set([ps[0].id]);
	editor.selectedWires = new Set([editor.diagram.wires[2].id]);
	editor.selection = null;
	editor.setPartHighlight();
	await wait(20);
	frappe();
	await wait(60);
	ok('lot mixte : le câble du lot part avec les composants, même s il est branché ailleurs',
		nbParts() === 3 && nbFils() === 1, nbParts() + ' composant(s), ' + nbFils() + ' fil(s)');

	// --- 6. Ctrl+A puis Suppr : la feuille est nette ----------------------------
	await montage(3);
	editor.selectAllParts();
	await wait(20);
	frappe();
	await wait(80);
	ok('Ctrl+A puis Suppr : plus rien sur la feuille',
		nbParts() === 0 && nbFils() === 0, nbParts() + ' composant(s), ' + nbFils() + ' fil(s)');

	// --- 7. Coudes de fil : Suppr n enlève QUE les coudes -----------------------
	ps = await montage(2);
	const w0 = editor.diagram.wires[0];
	editor.insertWirePoint(w0.id, { x: 300, y: 400 });
	await wait(40);
	const avant = (editor.diagram.wires[0].points ?? []).length;
	clicFil(w0.id);
	await wait(20);
	editor.selectedHandles = new Set([0]);
	editor.activeHandle = { wireId: w0.id, index: 0 };
	frappe();
	await wait(40);
	const apres = (editor.diagram.wires[0]?.points ?? []).length;
	ok('coude sélectionné : Suppr retire le coude, pas le fil',
		nbFils() === 1 && avant === 1 && apres === 0, avant + ' coude(s) → ' + apres + ', ' + nbFils() + ' fil(s)');

	// --- 8. Retour arrière fait la même chose -----------------------------------
	p = await montage(1);
	clic(p[0].id);
	await wait(20);
	frappe('Backspace');
	await wait(40);
	ok('Retour arrière supprime comme Suppr', nbParts() === 0, nbParts() + ' restant(s)');

	// --- 9. Une saisie en cours est épargnée ------------------------------------
	// La frappe appartient au texte tant qu on écrit : la recherche de la palette
	// est le champ le plus exposé (on tape, puis on regarde le schéma).
	await vide();
	const led9 = editor.addPart('led', 200, 200);
	await wait(120);
	clic(led9.id);
	await wait(20);
	const recherche = document.querySelector('.palette__search');
	recherche.focus();
	frappe('Delete', recherche);
	await wait(40);
	ok('saisie en cours : Suppr efface du texte, PAS le composant', nbParts() === 1,
		nbParts() + ' composant(s)');
	recherche.blur();

	// --- 10. LE BUG DE FRANK : le focus resté dans un champ mangeait la touche --
	// L appui sur un composant est preventDefault (pas de sélection de texte
	// pendant le glissé) — et ce preventDefault empêche AUSSI le navigateur de
	// déplacer le focus. Après avoir tapé dans la recherche de la palette, le
	// focus y restait : cliquer sur un composant puis Suppr ne faisait rien.
	await vide();
	const led10 = editor.addPart('led', 200, 200);
	await wait(120);
	recherche.focus();
	recherche.value = 'led';
	recherche.dispatchEvent(new Event('input', { bubbles: true }));
	await wait(30);
	clic(led10.id); // le clic sur la feuille doit rendre le clavier à l éditeur
	await wait(30);
	ok('clic sur un composant : le focus quitte le champ de recherche',
		document.activeElement !== recherche,
		'focus sur ' + (document.activeElement?.className || document.activeElement?.tagName));
	frappe(); // frappe sur l élément qui a VRAIMENT le focus
	await wait(40);
	ok('après une recherche dans la palette, Suppr efface bien le composant cliqué',
		nbParts() === 0, nbParts() + ' composant(s)');
	recherche.value = '';
	recherche.dispatchEvent(new Event('input', { bubbles: true }));
	recherche.blur(); // les épreuves suivantes repartent d un clavier libre
	await wait(30);

	// --- 11. Simulation : rien ne s efface --------------------------------------
	p = await montage(1);
	clic(p[0].id);
	await wait(20);
	let bloque = 0;
	editor.onBlockedEdit = () => { bloque++; };
	editor.setLocked(true); // le verrou vide la sélection : on la remet pour l épreuve
	editor.selectedParts = new Set([p[0].id]);
	frappe();
	await wait(40);
	ok('simulation : Suppr n efface rien et prévient l utilisateur',
		nbParts() === 1 && bloque === 1, nbParts() + ' composant(s), ' + bloque + ' alerte(s)');
	editor.setLocked(false);

	// --- 12. Le clavier marche depuis n importe où dans l atelier ---------------
	// Après un clic sur un bouton de barre ou sur la palette, le focus vit hors du
	// canvas. La frappe doit rester entendue tant qu on ne saisit pas de texte.
	p = await montage(1);
	clic(p[0].id);
	await wait(20);
	frappe('Delete', document.getElementById('palette'));
	await wait(40);
	ok('clavier : Suppr entendue même quand le focus est hors du canvas',
		nbParts() === 0, nbParts() + ' composant(s)');

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
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
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
console.log(fail ? `suppression : ${fail} échec(s).` : `suppression : ${rows.length} contrôles OK — Suppr efface bien ce qui est sélectionné.`);
process.exit(fail ? 1 : 0);
