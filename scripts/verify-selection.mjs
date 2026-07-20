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
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/servo-element.mjs';
import '../../src/webview/composants/buzzer-element.mjs';
import '../../src/webview/composants/membrane-keypad-element.mjs';
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
	// « Fil A → C (Nœud 1) » : le nom de l'équipotentielle n'existait que dans le
	// DOM des fils / l'export SVG, il devient LISIBLE dans l'inspecteur. Le
	// libellé technique « Eqp<n> » a laissé place au terme métier TRADUISIBLE
	// « Nœud <n> », et il est CLIQUABLE (sélectionne toute l'équipotentielle).
	// Le banc tourne en anglais (pas de KABLIX_LANG) : on contrôle donc la chaîne
	// SOURCE « Node <n> », dont « Nœud <n> » est la traduction FR (i18n.mts).
	const wireTitle = inspector.querySelector('.inspector__subtitle')?.textContent || '';
	ok('inspecteur : titre du fil suffixé de son nœud (Node/Nœud <n>)',
		/\\((?:Node|N\\u0153ud) \\d+\\)\\s*$/.test(wireTitle), JSON.stringify(wireTitle));
	ok('inspecteur : titre du fil = broches puis nœud',
		/A.+C.*\\((?:Node|N\\u0153ud) 1\\)/.test(wireTitle), JSON.stringify(wireTitle));
	ok('inspecteur : plus aucun libellé technique « Eqp<n> » affiché',
		!/Eqp\\d/.test(wireTitle), JSON.stringify(wireTitle));
	const eqpLink = inspector.querySelector('.inspector__eqp');
	ok('inspecteur : le nom du nœud est un bouton cliquable',
		!!eqpLink && eqpLink.tagName === 'BUTTON' &&
		/(?:Node|N\\u0153ud) 1/.test(eqpLink.textContent || ''),
		eqpLink ? eqpLink.outerHTML.slice(0, 80) : 'absent');
	ok('inspecteur : le nom du nœud est présenté comme un lien (souligné)',
		!!eqpLink && getComputedStyle(eqpLink).textDecorationLine.includes('underline'));

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
	// Le cadre est porté par .part__selbox (calée sur le dessin), le corps ne
	// sert que de repli quand la boîte n'a pas pu être mesurée.
	const frame1 = body1.querySelector('.part__selbox') ?? body1;
	const csBody = getComputedStyle(frame1);
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

	// --- 6 bis. Clic sur « Nœud n » : toute l'équipotentielle sélectionnée -----
	// Trois fils, DEUX potentiels : led1.A—led2.C et led2.C—led3.A partagent la
	// borne led2.C (donc le même nœud), led3.C—led4.A est un nœud à part. Un clic
	// sur le nom du nœud doit prendre les DEUX premiers et EXCLURE le troisième.
	const led3 = editor.addPart('led', 500, 100);
	const led4 = editor.addPart('led', 700, 100);
	await wait(60);
	editor.addWire({ partId: led2.id, pin: 'C' }, { partId: led3.id, pin: 'A' }, { points: [] });
	editor.addWire({ partId: led3.id, pin: 'C' }, { partId: led4.id, pin: 'A' }, { points: [] });
	editor.redrawWires();
	await wait(30);
	editor.select(null);
	clickSelect(svg.querySelector('path.wire'));
	const link6 = inspector.querySelector('.inspector__eqp');
	ok('nœud : bouton présent sur le fil sélectionné', !!link6);
	link6?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	const selWires = [...svg.querySelectorAll('path.wire.wire--selected')];
	ok('clic sur le nœud : les 2 fils du MÊME potentiel sont sélectionnés',
		selWires.length === 2, 'sélectionnés=' + selWires.length);
	ok('clic sur le nœud : le fil de l\\'autre potentiel reste NON sélectionné',
		svg.querySelectorAll('path.wire').length === 3 && selWires.length === 2);
	ok('clic sur le nœud : aucun composant embarqué dans la sélection',
		document.querySelectorAll('.part--selected').length === 0);
	// Le lot ainsi constitué est un lot de câbles ordinaire : l'inspecteur
	// affiche son décompte et la suppression groupée s'applique.
	ok('clic sur le nœud : l\\'inspecteur montre le lot de câbles',
		/2/.test(inspector.textContent || '') &&
		!!inspector.querySelector('.inspector__hint'));
	// Remise en état pour la suite : on repart du seul premier fil.
	editor.select(null);
	for (const w of [...editor.diagram.wires].slice(1)) editor.removeWire(w.id);
	editor.removePart(led3.id);
	editor.removePart(led4.id);
	editor.redrawWires();
	await wait(30);

	// --- 7. Suppression du fil sélectionné : fil ET fourmis hors du DOM ---------
	clickSelect(svg.querySelector('path.wire'));
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

	// --- 13. Glisser-déposer palette → canvas (v2026.7.128) --------------------
	// Le composant doit se poser À L'ÉCHELLE 1 (taille du canvas, pas celle de la
	// vignette) et CENTRÉ sur le point de lâcher.
	editor.select(null);
	await wait(10);
	const dt = {
		types: ['application/x-kablix-part'],
		data: {},
		effectAllowed: '', dropEffect: '',
		setData(k, v) { this.data[k] = v; this.types.includes(k) || this.types.push(k); },
		getData(k) { return this.data[k] ?? ''; },
		dragImage: null,
		setDragImage(el, x, y) { this.dragImage = { el, x, y }; },
	};
	// Bouton de palette d'une LED : dragstart → image de glissement.
	const ledBtn = [...palette.querySelectorAll('.palette__item')]
		.find((b) => (b.dataset.search || '').includes('led') || /LED/i.test(b.textContent));
	ok('palette : bouton de composant trouvé pour le glisser', !!ledBtn, ledBtn?.textContent);
	if (ledBtn) {
		// Comme un vrai utilisateur : la souris passe sur le bouton avant de glisser
		// (c'est ce survol qui prépare le fantôme, le rendu Lit n'étant pas synchrone).
		ledBtn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
		await wait(60);
		const ev = new Event('dragstart', { bubbles: true });
		Object.defineProperty(ev, 'dataTransfer', { value: dt });
		ledBtn.dispatchEvent(ev);
		// Taille RÉELLE d'une LED posée sur la feuille (référence d'échelle).
		const ref = editor.addPart('led', 20, 500);
		await wait(40);
		const refEl = editor.elementOf(ref.id);
		const rw = refEl.offsetWidth, rh = refEl.offsetHeight;
		const img = dt.dragImage;
		ok('glisser : image de glissement posée', !!img && !!img.el);
		// Échelle 1 (zoom = 1 par défaut) : l'image fait la taille du composant réel,
		// pas 46×30 (la vignette réduite de la palette).
		const iw = img ? parseFloat(img.el.style.width) : 0;
		const ih = img ? parseFloat(img.el.style.height) : 0;
		ok("glisser : image à l'échelle du canvas (taille du composant réel, pas la vignette)",
			Math.abs(iw - rw * editor.zoom) <= 2 && Math.abs(ih - rh * editor.zoom) <= 2,
			'image ' + iw + 'x' + ih + ' vs composant ' + rw + 'x' + rh + ' (zoom ' + editor.zoom + ')');
		ok('glisser : image de glissement ancrée en son centre',
			img && Math.abs(img.x - iw / 2) <= 1 && Math.abs(img.y - ih / 2) <= 1,
			img ? img.x + ',' + img.y : 'absente');
		editor.removePart(ref.id);
		// Lâcher au milieu du canvas : le composant se pose CENTRÉ sur ce point.
		const before = editor.diagram.parts.length;
		const cbox = canvas.getBoundingClientRect();
		const dropX = cbox.left + 400, dropY = cbox.top + 300;
		const drop = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(drop, 'dataTransfer', { value: dt });
		Object.defineProperty(drop, 'clientX', { value: dropX });
		Object.defineProperty(drop, 'clientY', { value: dropY });
		canvas.dispatchEvent(drop);
		await wait(900); // le recentrage attend que le rendu Lit se stabilise
		ok('lâcher : un composant a été posé', editor.diagram.parts.length === before + 1);
		const dropped = editor.diagram.parts[editor.diagram.parts.length - 1];
		const dEl = editor.elementOf(dropped.id);
		const dBody = dEl.closest('.part__body') ?? dEl.parentElement;
		const dr = dBody.getBoundingClientRect();
		const cxx = dr.left + dr.width / 2, cyy = dr.top + dr.height / 2;
		// Tolérance = l'accrochage grille de 10 px (snapPartToGrid) + demi-pastille.
		ok('lâcher : composant posé CENTRÉ sur le point de lâcher (±12 px)',
			Math.abs(cxx - dropX) <= 12 && Math.abs(cyy - dropY) <= 12,
			'centre ' + Math.round(cxx) + ',' + Math.round(cyy) +
			' vs lâcher ' + Math.round(dropX) + ',' + Math.round(dropY));
		// Échelle 1 : le composant posé fait la même taille que la référence.
		ok("lâcher : composant à l'échelle 1 (même taille que le même composant déjà posé)",
			Math.abs(dEl.offsetWidth - rw) <= 1 && Math.abs(dEl.offsetHeight - rh) <= 1,
			dEl.offsetWidth + 'x' + dEl.offsetHeight + ' vs ' + rw + 'x' + rh);
	}

	// --- 12. Rectangle de sélection CALÉ SUR LE DESSIN -------------------------
	// Le cadre était porté par .part__body, c'est-à-dire par le viewBox du SVG,
	// que le dessin ne remplit presque jamais : 51 px de vide sous le servo,
	// 14 px sous la LED, 10 px de chaque côté d'une résistance. Il est désormais
	// posé sur la boîte réellement dessinée (getBBox), sans toucher ni la
	// position, ni la taille, ni les broches du composant.
	const rdd = (v) => Math.round(v * 10) / 10;
	const tightBox = (el) => {
		// Boîte du contenu dessiné, en pixels écran (mesure indépendante du code testé).
		const svgs = [...(el.shadowRoot ?? el).querySelectorAll('svg')].filter((s) => !s.parentElement?.closest('svg'));
		const svg = svgs.sort((a, b) => (b.width.baseVal.value * b.height.baseVal.value) - (a.width.baseVal.value * a.height.baseVal.value))[0];
		const g = svg.getBBox();
		const m = svg.getScreenCTM();
		const pt = (px, py) => ({ x: m.a * px + m.c * py + m.e, y: m.b * px + m.d * py + m.f });
		const p1 = pt(g.x, g.y), p2 = pt(g.x + g.width, g.y + g.height);
		return { left: Math.min(p1.x, p2.x), top: Math.min(p1.y, p2.y), right: Math.max(p1.x, p2.x), bottom: Math.max(p1.y, p2.y) };
	};
	const fitRows = [];
	let fx = 100;
	for (const type of ['led', 'resistor', 'servo', 'keypad', 'buzzer']) {
		const p = editor.addPart(type, fx, 1400);
		fx += 340;
		await wait(120);
		editor.select({ kind: 'part', id: p.id });
		await wait(80);
		const r = editor.rendered.get(p.id);
		const bodyEl = r.container.querySelector('.part__body');
		const sel = bodyEl.querySelector('.part__selbox');
		const sb = sel ? sel.getBoundingClientRect() : null;
		const bb = bodyEl.getBoundingClientRect();
		const tb = tightBox(r.el);
		fitRows.push({ type, sel: !!sel,
			gainW: sb ? rdd(bb.width - sb.width) : 0, gainH: sb ? rdd(bb.height - sb.height) : 0,
			dl: sb ? rdd(tb.left - sb.left) : 0, dt: sb ? rdd(tb.top - sb.top) : 0,
			dr: sb ? rdd(sb.right - tb.right) : 0, db: sb ? rdd(sb.bottom - tb.bottom) : 0,
			id: p.id, x: r.part.x, y: r.part.y });
	}
	ok('sélection : boîte mesurée posée sur chaque composant',
		fitRows.every((f) => f.sel), fitRows.map((f) => f.type + ':' + f.sel).join(' '));
	ok('sélection : cadre COLLÉ au dessin (±1 px sur les 4 côtés)',
		fitRows.every((f) => Math.abs(f.dl) <= 1 && Math.abs(f.dt) <= 1 && Math.abs(f.dr) <= 1 && Math.abs(f.db) <= 1),
		fitRows.map((f) => f.type + ' ' + [f.dl, f.dt, f.dr, f.db].join('/')).join(' | '));
	ok('sélection : cadre PLUS SERRÉ que le corps (viewBox)',
		fitRows.every((f) => f.gainW > 0 || f.gainH > 0),
		fitRows.map((f) => f.type + ' -' + f.gainW + 'x-' + f.gainH).join(' '));
	// Le buzzer place une note de musique de 8x8 AVANT son dessin : le cadre ne
	// doit pas se caler dessus (contre-epreuve du choix du plus grand svg).
	const buz = fitRows.find((f) => f.type === 'buzzer');
	ok('sélection : buzzer encadré sur son DESSIN, pas sur sa note de musique (8 px)',
		buz && buz.gainW >= 0 && buz.gainH >= 0 && buz.dl <= 1, JSON.stringify(buz));
	// La geometrie du composant ne bouge pas : c'est le cadre qui change, pas lui.
	const geomOk = fitRows.every((f) => {
		const r = editor.rendered.get(f.id);
		return r.part.x === f.x && r.part.y === f.y;
	});
	ok('sélection : le composant n a PAS bougé (pattes toujours sur la grille)', geomOk);
	// Rotation : le cadre tourne avec le corps et reste colle au dessin.
	const rotId = fitRows.find((f) => f.type === 'servo').id;
	const rr = editor.rendered.get(rotId);
	const rotBody = rr.container.querySelector('.part__body');
	// Re-sélectionner : les composants mesurés ensuite dans la boucle ont pris la
	// sélection, la boîte du servo n'est donc plus affichée (donc mesurée à 0).
	editor.select({ kind: 'part', id: rotId });
	await wait(60);
	const b0el = rotBody.querySelector('.part__selbox');
	const b0 = b0el ? b0el.getBoundingClientRect() : { width: 0, height: 0 };
	rr.part.rotation = 90;
	editor.applyRotation(rr.part, rotBody);
	editor.select(null);
	editor.select({ kind: 'part', id: rotId });
	await wait(80);
	const b90el = rotBody.querySelector('.part__selbox');
	const b90 = b90el ? b90el.getBoundingClientRect() : null;
	ok('sélection : cadre tourné à 90° (dimensions échangées, toujours collé)',
		b90 && Math.abs(b90.width - b0.height) < 1.5 && Math.abs(b90.height - b0.width) < 1.5,
		b90 ? rdd(b0.width) + 'x' + rdd(b0.height) + ' -> ' + rdd(b90.width) + 'x' + rdd(b90.height) : 'aucune boîte');
	editor.select(null);

	// --- 13. Quadrillage masquable (bouton ▦ de la barre de dessin) ------------
	// Bascule d'AFFICHAGE seulement : la feuille garde son fond (la zone de
	// travail reste delimitee) et la grille MAGNETIQUE de pose n'est pas touchee.
	const sheet = canvas.querySelector('.canvas__sheet');
	const gridOf = () => getComputedStyle(sheet).backgroundImage;
	const gridOn0 = gridOf();
	ok('grille : quadrillee par defaut', gridOn0.includes('gradient'), gridOn0.slice(0, 40));
	const off = editor.toggleGrid();
	await wait(30);
	ok('grille : bouton ▦ masque le quadrillage',
		off === false && !gridOf().includes('gradient') && editor.isGridShown() === false, gridOf().slice(0, 40));
	ok('grille masquee : la feuille garde son fond (zone de travail delimitee)',
		getComputedStyle(sheet).backgroundColor !== 'rgba(0, 0, 0, 0)', getComputedStyle(sheet).backgroundColor);
	// La pose reste magnetique : un composant pose hors grille est recale au pas de 10.
	// La bascule ne touche QUE l'affichage : un meme composant pose grille masquee
	// puis grille visible atterrit exactement au meme endroit, avec les memes broches.
	const posOf = (p) => {
		const pins = editor.rendered.get(p.id).el.pinInfo;
		return p.x + '/' + p.y + '/' + pins.map((pn) => pn.x + ',' + pn.y).join(' ');
	};
	const snapOff = editor.addPart('led', 137, 143);
	await wait(160);
	const geomOff = posOf(snapOff);
	editor.toggleGrid(true);
	await wait(30);
	const snapOn = editor.addPart('led', 137, 343);
	await wait(160);
	const geomOn = posOf(snapOn).replace('/343/', '/143/');
	editor.toggleGrid(false);
	await wait(30);
	ok('grille masquee : pose et broches INCHANGEES (affichage seulement)',
		geomOff === geomOn, geomOff + '  vs  ' + geomOn);
	const on = editor.toggleGrid();
	await wait(30);
	ok('grille : second clic la ramene',
		on === true && gridOf().includes('gradient') && editor.isGridShown() === true, gridOf().slice(0, 40));

	// --- 14. Propriétés PARTAGÉES d'une sélection multiple homogène ------------
	// Plusieurs composants du MÊME type sélectionnés : leurs propriétés sont
	// éditables dans l'inspecteur et chaque changement s'applique à TOUS. Types
	// mêlés : ancien comportement (résumé + transformations seulement).
	const ml = [editor.addPart('led', 100, 1900), editor.addPart('led', 240, 1900), editor.addPart('led', 380, 1900)];
	await wait(160);
	editor.select(null); // addPart sélectionne le dernier posé : on repart de zéro
	await wait(30);
	// Ctrl+clic réel sur les 3 corps (le vrai chemin utilisateur).
	for (const p of ml) {
		clickSelect(editor.rendered.get(p.id).container.querySelector('.part__body'), { ctrlKey: true });
		await wait(30);
	}
	ok('multi : 3 LED sélectionnées', editor.selectedParts.size === 3, 'n=' + editor.selectedParts.size);
	const insText = () => inspector.textContent || '';
	// Le banc tourne en anglais (i18n de la webview non chargé) : « 3 × LED — shared properties ».
	ok('multi homogène : titre « 3 × LED — propriétés communes »',
		// Le signe multiplie est bati par son code point : un « × » ecrit dans
		// une chaine serait consomme par le litteral, et le caractere brut ne
		// survit pas au bundle esbuild. Banc en anglais : « shared properties ».
		insText().includes('3 ' + String.fromCharCode(0xd7) + ' LED')
			&& /shared properties|propriétés communes/i.test(insText()),
		JSON.stringify(insText().slice(10, 24)));
	// Ligne PROPRE à la sélection homogène : « Drag a part to move the whole
	// selection. » existait déjà, on exige donc le texte « Changing a property ».
	ok('multi homogène : aide « modifier une propriété l applique à toute la sélection »',
		/Changing a property|Modifier une propriété/i.test(inspector.querySelector('.inspector__help')?.textContent || ''),
		(inspector.querySelector('.inspector__help')?.textContent || 'absente').slice(0, 70));
	// La propriété color de la LED s'affiche en pastilles : elles doivent être là.
	const sw = [...inspector.querySelectorAll('.inspector__swatch')];
	ok('multi homogène : contrôle de propriété affiché (7 pastilles de couleur)',
		sw.length === 7, 'n=' + sw.length);
	// Clic sur « blue » (4e couleur du catalogue : red green blue …) → les 3 LED.
	const before = ml.map((p) => editor.rendered.get(p.id).part.attrs.color).join(',');
	if (sw[2]) sw[2].click(); // absent = fonctionnalite neutralisee : echec propre plus bas
	await wait(80);
	const after = ml.map((p) => editor.rendered.get(p.id).part.attrs.color);
	ok('multi homogène : un clic change la propriété des TROIS composants',
		after.every((c) => c === 'blue'), before + ' -> ' + after.join(','));
	// L'élément rendu suit aussi (attribut DOM), pas seulement le modèle.
	const attrs = ml.map((p) => editor.rendered.get(p.id).el.getAttribute('color'));
	ok('multi homogène : attribut posé sur les 3 éléments rendus (dessin à jour)',
		attrs.every((c) => c === 'blue'), attrs.join(','));
	// Champ à suffixes SI (résistance) : même chose sur une valeur numérique.
	const mr = [editor.addPart('resistor', 100, 2100), editor.addPart('resistor', 240, 2100)];
	await wait(160);
	editor.select(null);
	await wait(30);
	for (const p of mr) {
		clickSelect(editor.rendered.get(p.id).container.querySelector('.part__body'), { ctrlKey: true });
		await wait(30);
	}
	const rin = inspector.querySelector('.inspector__control');
	if (rin) {
		rin.value = '2.2k';
		rin.dispatchEvent(new Event('change', { bubbles: true }));
	}
	await wait(80);
	const rvals = mr.map((p) => editor.rendered.get(p.id).part.attrs.value);
	ok('multi homogène : champ SI (2.2k) appliqué aux DEUX résistances',
		!!rin && rvals.every((v) => Number(v) === 2200), rvals.join(','));
	// Contre-épreuve : types MÊLÉS → pas de propriété partagée, résumé d'origine.
	const mixA = editor.addPart('led', 100, 2300);
	const mixB = editor.addPart('resistor', 240, 2300);
	await wait(160);
	editor.select(null);
	await wait(30);
	for (const p of [mixA, mixB]) {
		clickSelect(editor.rendered.get(p.id).container.querySelector('.part__body'), { ctrlKey: true });
		await wait(30);
	}
	const mixText = insText();
	ok('multi MÊLÉ : résumé d origine, aucune propriété partagée',
		/2/.test(mixText) && !/×/.test(mixText) && inspector.querySelectorAll('.inspector__swatch').length === 0,
		mixText.slice(0, 80));
	// Un seul composant sélectionné : inspecteur individuel inchangé.
	editor.select(null);
	editor.select({ kind: 'part', id: ml[0].id });
	await wait(60);
	ok('sélection simple : inspecteur individuel INCHANGÉ (titre LED, pas de « × »)',
		/LED/.test(insText()) && !/×/.test(insText()) && inspector.querySelectorAll('.inspector__swatch').length === 7,
		insText().slice(0, 60));
	editor.select(null);

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
// Contrôle i18n côté Node (le banc Chrome tourne en anglais) : le libellé du
// nœud doit être une chaîne TRADUISIBLE, présente dans le catalogue FR.
const i18n = readFileSync(join(ROOT, 'src', 'webview', 'i18n.mts'), 'utf8');
rows.push({
	name: 'i18n : « Node {0} » traduit en « Nœud {0} »',
	ok: /'Node \{0\}':\s*'Nœud \{0\}'/.test(i18n),
	detail: 'clé absente du catalogue FR',
});
rows.push({
	name: 'i18n : infobulle du nœud traduite',
	ok: /'Select every wire of this node':\s*'[^']+'/.test(i18n),
	detail: 'clé absente du catalogue FR',
});
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `selection : ${fail} échec(s).` : `selection : ${rows.length} contrôles OK — sélection bien visualisée (fils, coudes, composants).`);
process.exit(fail ? 1 : 0);
