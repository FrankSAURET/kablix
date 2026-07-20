// Test de régression : visualisation de la sélection dans l'éditeur (v2026.7.103).
// Vrai Editor + vraie feuille media/styles.css en Chrome headless :
//  - fil sélectionné = classe wire--selected (halo accent) + « fourmis en
//    marche » (g.wire-ants, 2 tracés pointillés alternés au même `d` que le fil,
//    resynchronisés par positionWire) ;
//  - coude sélectionné = disque d'accent cerclé (.wire-handle--active) ;
//  - composant sélectionné = pointillé + halo (.part--selected .part__body) ;
//  - désélection / suppression : plus aucune trace (classes ET fourmis).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-selection');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/pca9685-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

function pdown(el, opts = {}) {
	el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ...opts }));
}
function pup() {
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
}
function clickSelect(el, opts = {}) {
	pdown(el, opts);
	pup();
}

async function run() {
	const canvas = document.getElementById('canvas');
	const palette = document.getElementById('palette');
	const svg = document.getElementById('wires');
	const inspector = document.getElementById('inspector');
	const editor = new Editor(canvas, palette, svg, inspector);
	const led1 = editor.addPart('led', 100, 100);
	const led2 = editor.addPart('led', 300, 100);
	await wait(60);
	editor.addWire({ partId: led1.id, pin: 'A' }, { partId: led2.id, pin: 'C' },
		{ points: [{ x: 200, y: 60 }], color: 'green' });
	editor.redrawWires();
	await wait(30);

	// --- 1. Sélection d'un fil : classe + fourmis + halo -----------------------
	const path = svg.querySelector('path.wire');
	clickSelect(path);
	ok('fil : classe wire--selected posée', path.classList.contains('wire--selected'));
	let ants = svg.querySelector('g.wire-ants');
	const antPaths = ants ? [...ants.children] : [];
	const d0 = path.getAttribute('d') || '';
	ok('fil : fourmis présentes (2 tracés, d identique non vide)',
		ants && antPaths.length === 2 && d0.length > 0 && antPaths.every((p) => p.getAttribute('d') === d0),
		'd=' + d0.slice(0, 30));
	const csDark = ants ? getComputedStyle(antPaths[0]) : null;
	const csLight = ants ? getComputedStyle(antPaths[1]) : null;
	ok('fourmis : pointillés animés (dasharray 5, animation ants-march)',
		csDark && csDark.strokeDasharray.includes('5') && csDark.animationName === 'ants-march',
		csDark ? csDark.strokeDasharray + ' / ' + csDark.animationName : 'absent');
	ok('fourmis : deux teintes alternées (sombre != clair)',
		csDark && csLight && csDark.stroke !== csLight.stroke,
		(csDark && csDark.stroke) + ' vs ' + (csLight && csLight.stroke));
	ok('fil : halo accent (filter drop-shadow)',
		getComputedStyle(path).filter.includes('drop-shadow'));

	// --- 1 bis. Titre de l'inspecteur : équipotentielle accolée ----------------
	// « Fil A → C (Eqp1) » : le nom de l'équipotentielle n'existait que dans le
	// DOM des fils / l'export SVG, il devient LISIBLE dans l'inspecteur.
	const wireTitle = inspector.querySelector('.inspector__subtitle')?.textContent || '';
	ok('inspecteur : titre du fil suffixé de son équipotentielle (Eqp<n>)',
		/\\(Eqp\\d+\\)\\s*$/.test(wireTitle), JSON.stringify(wireTitle));
	ok('inspecteur : titre du fil = broches puis équipotentielle',
		/A.+C.*\\(Eqp1\\)/.test(wireTitle), JSON.stringify(wireTitle));

	// --- 2. Coude inséré au double-clic : fourmis resynchronisées --------------
	const box = path.getBoundingClientRect();
	path.dispatchEvent(new MouseEvent('dblclick', {
		bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
	}));
	await wait(20);
	ants = svg.querySelector('g.wire-ants');
	const d1 = path.getAttribute('d') || '';
	ok('coude inséré : d du fil changé + fourmis resynchronisées',
		d1 !== d0 && ants && [...ants.children].every((p) => p.getAttribute('d') === d1));

	// --- 3. Coude sélectionné : disque d'accent cerclé --------------------------
	const handle = document.querySelector('.wire-handle');
	ok('poignées de coude affichées', !!handle);
	if (handle) {
		clickSelect(handle);
		const cs = getComputedStyle(handle);
		ok('coude actif : classe wire-handle--active', handle.classList.contains('wire-handle--active'));
		ok('coude actif : disque (fond accent, rond, anneau)',
			cs.borderRadius === '50%' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.boxShadow !== 'none',
			cs.borderRadius + ' / ' + cs.backgroundColor);
	}

	// --- 4. Sélection de composants : pointillé + halo --------------------------
	const body1 = editor.elementOf(led1.id).closest('.part__body') ??
		editor.elementOf(led1.id).parentElement;
	clickSelect(body1);
	const cont1 = body1.closest('.part') ?? body1.parentElement;
	ok('composant : classe part--selected posée', cont1.classList.contains('part--selected'));
	const csBody = getComputedStyle(body1);
	ok('composant : pointillé + halo (outline dashed, box-shadow)',
		csBody.outlineStyle === 'dashed' && csBody.boxShadow !== 'none',
		csBody.outlineStyle + ' / ' + csBody.boxShadow.slice(0, 40));
	ok('composant : la sélection du composant a retiré les fourmis du fil',
		!svg.querySelector('g.wire-ants') && !path.classList.contains('wire--selected'));
	const body2 = editor.elementOf(led2.id).parentElement;
	pdown(body2, { ctrlKey: true });
	ok('Ctrl+clic : 2 composants en surbrillance',
		document.querySelectorAll('.part--selected').length === 2);

	// --- 5. Désélection : plus aucune trace -------------------------------------
	clickSelect(canvas);
	ok('clic sur le fond : plus de part--selected ni de poignées',
		document.querySelectorAll('.part--selected').length === 0 &&
		document.querySelectorAll('.wire-handle').length === 0);

	// --- 6. Lot de câbles (Ctrl+clic) : fourmis posées/retirées -----------------
	pdown(path, { ctrlKey: true });
	ok('Ctrl+clic fil : lot → fourmis + classe',
		!!svg.querySelector('g.wire-ants') && path.classList.contains('wire--selected'));
	pdown(path, { ctrlKey: true });
	ok('re-Ctrl+clic fil : lot vidé → fourmis retirées',
		!svg.querySelector('g.wire-ants') && !path.classList.contains('wire--selected'));

	// --- 7. Suppression du fil sélectionné : fil ET fourmis hors du DOM ---------
	clickSelect(path);
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
	ok('Suppr : fil et fourmis retirés du DOM',
		!svg.querySelector('path.wire') && !svg.querySelector('g.wire-ants'));

	// --- 8. Modes d'affichage des noms (bouton « Noms », v2026.7.108) ----------
	// canvas--show-labels = tous ; canvas--labels-sel = sélection seule ;
	// aucune classe = aucun nom, même sélectionné ; pinout-shown gagne toujours.
	const bodyA = editor.elementOf(led1.id).parentElement;
	clickSelect(bodyA); // led1 sélectionnée, led2 non
	const headOf = (id) => editor.elementOf(id).closest('.part').querySelector('.part__head');
	const shown = (id) => getComputedStyle(headOf(id)).display !== 'none';
	canvas.classList.remove('canvas--show-labels', 'canvas--labels-sel');
	ok('noms : aucune case cochée → aucun nom, même sélectionné',
		!shown(led1.id) && !shown(led2.id));
	canvas.classList.add('canvas--labels-sel');
	ok('noms : « sélection seule » → nom du sélectionné uniquement',
		shown(led1.id) && !shown(led2.id));
	canvas.classList.remove('canvas--labels-sel');
	canvas.classList.add('canvas--show-labels');
	ok('noms : « tous les noms » → tous affichés', shown(led1.id) && shown(led2.id));
	headOf(led2.id).closest('.part').classList.add('part--pinout-shown');
	ok('noms : poster de brochage affiché → bandeau masqué malgré tout',
		shown(led1.id) && !shown(led2.id));
	canvas.classList.remove('canvas--show-labels');

	// --- 9. Catégorie des composants personnalisés (créateur, v2026.7.112) -----
	// category assignée → rangé dans la section standard ; sans → « Custom parts ».
	editor.loadCustomParts([
		{ type: 'custom-cat', label: 'Capteur Zz', kind: 'passive',
			svg: '<svg viewBox="0 0 20 20"><rect width="20" height="20"/></svg>', pins: [], category: 'Sensors' },
		{ type: 'custom-nocat', label: 'Truc Yy', kind: 'passive',
			svg: '<svg viewBox="0 0 20 20"><rect width="20" height="20"/></svg>', pins: [] },
	]);
	await wait(30);
	const sectionOf = (label) => {
		let current = '';
		for (const child of palette.children) {
			if (child.classList.contains('palette__section')) current = child.textContent.trim();
			else if (child.textContent.includes(label)) return current;
		}
		return null;
	};
	const sensorsLabel = sectionOf('Capteur Zz');
	const customLabel = sectionOf('Truc Yy');
	ok('créateur : composant catégorisé rangé dans sa catégorie (Sensors)',
		sensorsLabel !== null && sensorsLabel !== customLabel && /Capteurs|Sensors/.test(sensorsLabel ?? ''),
		sensorsLabel);
	ok('créateur : composant sans catégorie dans « Composants personnalisés »',
		/personnalisés|Custom/.test(customLabel ?? ''), customLabel);

	// --- 10. Bulle de nom de broche pendant le câblage (v2026.7.117) ------------
	const hotspotOf = (id, pin) => editor.rendered.get(id).hotspots.get(pin);
	const enter = (dot) => dot.dispatchEvent(new PointerEvent('pointerenter'));
	// Hors câblage : pas de bulle (le title natif suffit).
	enter(hotspotOf(led2.id, 'A'));
	ok('bulle : absente hors câblage', !document.querySelector('.pin-bubble'));
	// Câblage entamé depuis led1.A → survol de led2.A : bulle instantanée.
	hotspotOf(led1.id, 'A').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	window.dispatchEvent(new PointerEvent('pointerup'));
	enter(hotspotOf(led2.id, 'A'));
	const bubble = document.querySelector('.pin-bubble');
	ok('bulle : affichée sur la broche visée pendant le câblage', !!bubble, bubble?.textContent);
	ok('bulle : porte le nom de la broche (anode)', /A|anode/i.test(bubble?.textContent ?? ''));
	ok('bulle : halo jaune préservé (pastilles .pin toujours survolables)',
		getComputedStyle(hotspotOf(led2.id, 'A')).pointerEvents !== 'none');
	// Fil terminé : la bulle disparaît et le title natif est restauré.
	hotspotOf(led2.id, 'A').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	ok('bulle : retirée à la fin du câblage', !document.querySelector('.pin-bubble'));
	ok('bulle : title natif restauré', hotspotOf(led2.id, 'A').title.length > 0);

	// --- 11. Couleur de sélection --kx-select (v2026.7.119) ---------------------
	// On repart d'un schéma propre : le fil de la section 8 a été supprimé et la
	// section 10 (bulle) a pu créer un fil parasite → on efface tout et on en
	// recrée UN seul.
	editor.select(null);
	for (const w of [...editor.diagram.wires]) editor.removeWire(w.id);
	await wait(10);
	editor.addWire({ partId: led1.id, pin: 'A' }, { partId: led2.id, pin: 'C' },
		{ points: [{ x: 200, y: 60 }], color: 'green' });
	editor.redrawWires();
	await wait(20);
	const wpath = svg.querySelector('path.wire');
	// Défaut vif #e973e9 = rgb(233,115,233) : le fil sélectionné en porte le halo.
	clickSelect(wpath);
	await wait(20);
	const rose = 'rgb(233, 115, 233)';
	const wFilter = getComputedStyle(wpath).filter;
	ok('couleur : halo du fil = --kx-select rose par défaut (#e973e9)',
		wFilter.includes(rose) || wFilter.includes('#e973e9') || wFilter.toLowerCase().includes('e973e9'), 'filter=' + wFilter);
	// Variable surchargée sur :root → le halo suit la nouvelle couleur.
	document.documentElement.style.setProperty('--kx-select', '#00ff00');
	await wait(10);
	ok('couleur : réglable (--kx-select #00ff00 → halo vert)',
		getComputedStyle(wpath).filter.includes("rgb(0, 255, 0)"));
	document.documentElement.style.removeProperty('--kx-select');
	editor.select(null);
	await wait(10);

	// --- 12. Boîte de sélection (marquee) : les CÂBLES sont marqués (v2026.7.119) -
	// On travaille en coords CLIENT (écran) : positions réelles des pastilles des
	// extrémités du fil, pour que le marquee (qui reconvertit via canvasPoint,
	// pan/zoom compris) englobe bien le câble.
	const dotOf = (ep) => editor.rendered.get(ep.partId).hotspots.get(ep.pin).getBoundingClientRect();
	const dA = dotOf(editor.diagram.wires[0].a), dB = dotOf(editor.diagram.wires[0].b);
	const aX = dA.left + dA.width / 2, aY = dA.top + dA.height / 2;
	const bX = dB.left + dB.width / 2, bY = dB.top + dB.height / 2;
	const cMin = { x: Math.min(aX, bX) - 40, y: Math.min(aY, bY) - 60 };
	const cMax = { x: Math.max(aX, bX) + 40, y: Math.max(aY, bY) + 60 };
	// Coords monde pour le contrôle direct de wiresInRect (via canvasPoint).
	const aC = editor.hotspotCenter(editor.diagram.wires[0].a);
	const bC = editor.hotspotCenter(editor.diagram.wires[0].b);
	const boxMinX = Math.min(aC.x, bC.x) - 40, boxMaxX = Math.max(aC.x, bC.x) + 40;
	const boxMinY = Math.min(aC.y, bC.y) - 60, boxMaxY = Math.max(aC.y, bC.y) + 60;
	// Marquee englobant les 2 extrémités → le câble est pris.
	pdown(canvas, { clientX: cMin.x, clientY: cMin.y });
	window.dispatchEvent(new PointerEvent('pointermove', { clientX: cMin.x + 10, clientY: cMin.y + 10, bubbles: true }));
	window.dispatchEvent(new PointerEvent('pointermove', { clientX: (cMin.x + cMax.x) / 2, clientY: (cMin.y + cMax.y) / 2, bubbles: true }));
	window.dispatchEvent(new PointerEvent('pointermove', { clientX: cMax.x, clientY: cMax.y, bubbles: true }));
	await wait(10);
	const wSelDuringMarquee = !!svg.querySelector('path.wire.wire--selected');
	pup();
	await wait(20);
	ok('marquee : le câble entièrement encadré est marqué wire--selected',
		wSelDuringMarquee || !!svg.querySelector('path.wire.wire--selected'));
	// Contre-épreuve : boîte qui ne couvre qu'UNE extrémité → fil non pris.
	editor.select(null);
	await wait(10);
	const midCX = (aX + bX) / 2;
	pdown(canvas, { clientX: Math.min(aX, bX) - 40, clientY: cMin.y });
	window.dispatchEvent(new PointerEvent('pointermove', { clientX: Math.min(aX, bX) - 30, clientY: cMin.y + 10, bubbles: true }));
	window.dispatchEvent(new PointerEvent('pointermove', { clientX: midCX, clientY: cMax.y, bubbles: true }));
	await wait(10);
	const partialSel = svg.querySelector('path.wire')?.classList.contains('wire--selected');
	pup();
	await wait(10);
	ok('marquee : fil à cheval sur le bord NON pris (extrémité hors boîte)', !partialSel);

	// --- Inspecteur du PCA9685 : adresse réglée par les pads AD0..AD5 ----------
	// L'adresse n'est plus une liste : six cases (pad haut = 1) et l'adresse
	// 0x40..0x7F calculée s'affiche sous elles ET part dans l'attr address
	// (c'est lui que lit la simulation).
	const pca = editor.addPart('pca9685', 600, 400);
	await wait(60);
	editor.select({ kind: 'part', id: pca.id });
	await wait(30);
	const boxes = [...inspector.querySelectorAll('input.inspector__checkbox')];
	ok('inspecteur PCA : 6 cases à cocher AD0..AD5', boxes.length === 6, boxes.length);
	ok("inspecteur PCA : plus de liste déroulante d'adresse",
		!inspector.querySelector('select'));
	const addrText = () => inspector.querySelector('.inspector__address')?.textContent ?? '';
	ok("inspecteur PCA : adresse 0x7F affichée (pads d'usine tous hauts)",
		addrText().includes('0x7F'), addrText());
	ok('inspecteur PCA : les 6 cases sont cochées au départ', boxes.every((b) => b.checked));
	// Décoche AD0 → 0x7E, et l'attr suit.
	boxes[0].checked = false;
	boxes[0].dispatchEvent(new Event('change', { bubbles: true }));
	await wait(40);
	ok('inspecteur PCA : AD0 décoché → adresse 0x7E affichée', addrText().includes('0x7E'), addrText());
	ok('inspecteur PCA : attr address = 0x7E (lu par la simulation)',
		pca.attrs?.address === '0x7E', pca.attrs?.address);
	// Décoche tout → 0x40 (PCA9685 nu).
	for (const b of [...inspector.querySelectorAll('input.inspector__checkbox')]) {
		if (b.checked) { b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); await wait(30); }
	}
	ok('inspecteur PCA : tous les pads bas → 0x40', pca.attrs?.address === '0x40' && addrText().includes('0x40'),
		\`\${pca.attrs?.address} / \${addrText()}\`);

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
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:800px;height:600px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `selection : ${fail} échec(s).` : `selection : ${rows.length} contrôles OK — sélection bien visualisée (fils, coudes, composants).`);
process.exit(fail ? 1 : 0);
