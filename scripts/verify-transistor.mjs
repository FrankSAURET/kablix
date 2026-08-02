// Transistor générique : champ d'inscription et enregistrement dans les
// composants personnalisés (v2026.7.238). Vrai Editor en Chrome headless :
//  - le champ « Inscription » est une zone de 3 lignes, sans mention parasite ;
//  - le bouton « Enregistrer dans mes composants… » n'apparaît QUE sur un
//    modèle générique (une référence du commerce est figée par sa fiche) ;
//  - le composant enregistré porte le dessin AVEC son inscription, le schéma
//    interne, les rôles E/B/C et le gain — il est donc simulable ;
//  - il arrive dans la palette, section « Composants personnalisés », et
//    réenregistrer la même inscription MET À JOUR au lieu d'empiler.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-transistor');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { partDef } from '../../src/webview/diagram/catalog.mjs';
import { transistorStates } from '../../src/webview/diagram/model.mjs';
import { internalWiringSvg } from '../../src/webview/diagram/internal-wiring.mjs';
import '../../src/webview/composants/transistor-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

/** Bouton de l'inspecteur portant ce texte. */
const button = (inspector, texte) =>
	[...inspector.querySelectorAll('button')].find((b) => (b.textContent || '').includes(texte));

async function run() {
	const inspector = document.getElementById('inspector');
	const palette = document.getElementById('palette');
	const editor = new Editor(
		document.getElementById('canvas'), palette,
		document.getElementById('wires'), inspector);
	// Les composants enregistrés partent normalement vers l'extension : on les
	// capte pour vérifier ce qui serait persisté.
	let persistes = [];
	editor.onCustomPartsChange = (parts) => { persistes = parts; };

	// --- 1. Champ « Inscription » : 3 lignes, sans mention ----------------------
	const q1 = editor.addPart('transistor', 100, 100);
	editor.updatePartAttr(q1.id, 'ref', 'custom-npn');
	editor.updatePartAttr(q1.id, 'symbol', 'npn');
	editor.updatePartAttr(q1.id, 'named', '');
	editor.updatePartAttr(q1.id, 'gain', '250');
	editor.updatePartAttr(q1.id, 'vcemax', '45');
	editor.updatePartAttr(q1.id, 'icmax', '0.1');
	editor.updatePartAttr(q1.id, 'e', '3');
	editor.updatePartAttr(q1.id, 'b', '2');
	editor.updatePartAttr(q1.id, 'c', '1');
	editor.updatePartAttr(q1.id, 'text', 'KB\\n123\\nA');
	editor.select({ kind: 'part', id: q1.id });
	await wait(60);
	const zone = inspector.querySelector('textarea');
	const labels = [...inspector.querySelectorAll('.inspector__label')].map((l) => l.textContent || '');
	const marquage = labels.find((l) => /Inscription|Marking/i.test(l)) || '';
	ok('inscription : champ multiligne présent', !!zone, zone ? zone.outerHTML.slice(0, 60) : 'absent');
	ok('inscription : 3 lignes visibles par défaut', zone && Number(zone.rows) === 3, zone && zone.rows);
	ok('inscription : plus de mention « une ligne par ligne »',
		marquage !== '' && !/ligne par|one line/i.test(marquage), JSON.stringify(marquage));

	// --- 2. Le bouton d'enregistrement n'est là que sur le générique ------------
	const btn = button(inspector, 'Enregistrer') || button(inspector, 'Save to my parts');
	ok('générique : bouton « Enregistrer dans mes composants… » proposé', !!btn);
	editor.updatePartAttr(q1.id, 'ref', 'BC547');
	editor.select(null);
	editor.select({ kind: 'part', id: q1.id });
	await wait(40);
	ok('référence du commerce : aucun bouton d enregistrement (fiche figée)',
		!button(inspector, 'Enregistrer') && !button(inspector, 'Save to my parts'));
	editor.updatePartAttr(q1.id, 'ref', 'custom-npn');
	editor.select(null);
	editor.select({ kind: 'part', id: q1.id });
	await wait(40);

	// --- 3. Enregistrement : contenu du composant produit -----------------------
	const avant = palette.querySelectorAll('.palette__custom').length;
	(button(inspector, 'Enregistrer') || button(inspector, 'Save to my parts')).click();
	await wait(60);
	const data = persistes[0];
	ok('enregistrement : un composant persisté', persistes.length === 1, JSON.stringify(persistes.length));
	ok('enregistrement : nommé d après l inscription (« KB 123 A »)',
		data && data.label === 'KB 123 A', data && data.label);
	ok('enregistrement : modèle de simulation « transistor »',
		data && data.kind === 'transistor', data && data.kind);
	ok('enregistrement : les 3 pattes du boîtier sont des broches',
		data && data.pins.length === 3, data && JSON.stringify(data.pins));
	ok('enregistrement : rôles E/B/C posés sur les bonnes pattes (3/2/1)',
		data && data.pinRoles && data.pinRoles.E === '3' && data.pinRoles.B === '2' && data.pinRoles.C === '1',
		data && JSON.stringify(data.pinRoles));
	ok('enregistrement : le gain suit le composant (250)',
		data && data.attrs && data.attrs.gain === '250', data && JSON.stringify(data.attrs));
	ok('enregistrement : le dessin emporte son inscription',
		data && /KB/.test(data.svg) && /123/.test(data.svg), data && data.svg.slice(0, 80));
	ok('enregistrement : le dessin emporte sa police (hors du shadow DOM)',
		data && /font-family/.test(data.svg));
	ok('enregistrement : schéma interne joint', data && !!data.innerSvg && /<svg/.test(data.innerSvg));
	ok('palette : une entrée de plus dans les composants',
		palette.querySelectorAll('.palette__custom').length === avant + 1);

	// Section d'accueil : « Composants personnalisés » (aucune catégorie posée).
	let section = '';
	for (const child of palette.children) {
		if (child.classList.contains('palette__section')) section = (child.textContent || '').trim();
		else if ((child.textContent || '').includes('KB 123 A')) break;
	}
	ok('palette : rangé dans « Composants personnalisés »', /personnalis|Custom/i.test(section), section);

	// --- 4. Reposé depuis la bibliothèque : simulé comme un transistor ----------
	const def = partDef(data.type);
	ok('bibliothèque : le type enregistré est connu du catalogue',
		def && def.kind === 'transistor', def && def.kind);
	const q2 = editor.addPart(data.type, 400, 100);
	await wait(60);
	const r1 = editor.addPart('resistor', 260, 100);
	editor.updatePartAttr(r1.id, 'value', '4700');
	const led = editor.addPart('led', 560, 60);
	await wait(60);
	// Commande côté bas : broche 7 → base par 4,7 kΩ, émetteur à la masse, LED
	// au 5 V par le collecteur. Ib = (5 − 0,7)/4700 → Ic max = 250 × Ib.
	const mcu = editor.addPart('uno', 20, 300);
	await wait(80);
	editor.addWire({ partId: mcu.id, pin: '7' }, { partId: r1.id, pin: '1' }, { color: 'green' });
	editor.addWire({ partId: r1.id, pin: '2' }, { partId: q2.id, pin: '2' }, { color: 'green' });
	editor.addWire({ partId: q2.id, pin: '3' }, { partId: mcu.id, pin: 'GND.1' }, { color: 'black' });
	editor.addWire({ partId: q2.id, pin: '1' }, { partId: led.id, pin: 'C' }, { color: 'blue' });
	editor.addWire({ partId: led.id, pin: 'A' }, { partId: mcu.id, pin: '5V' }, { color: 'red' });
	await wait(40);
	const etats = (haut) => transistorStates(editor.diagram, (p) => haut.includes(p), 5);
	const on = etats(['7']).find((s) => s.partId === q2.id);
	const off = etats([]).find((s) => s.partId === q2.id);
	const attendu = 250 * ((5 - 0.7) / 4700);
	ok('simulation : le composant enregistré conduit (base haute)',
		on && on.on && Math.abs(on.maxCollectorAmps - attendu) / attendu < 0.02,
		JSON.stringify(on));
	ok('simulation : bloqué quand la base retombe', off && !off.on, JSON.stringify(off));

	// --- 5. Réenregistrement : mise à jour, pas d empilement --------------------
	editor.select(null);
	editor.select({ kind: 'part', id: q1.id });
	await wait(40);
	editor.updatePartAttr(q1.id, 'gain', '300');
	editor.select(null);
	editor.select({ kind: 'part', id: q1.id });
	await wait(40);
	(button(inspector, 'Enregistrer') || button(inspector, 'Save to my parts')).click();
	await wait(60);
	ok('réenregistrement : toujours UN seul composant (mis à jour)',
		persistes.length === 1, JSON.stringify(persistes.map((p) => p.type)));
	ok('réenregistrement : la nouvelle valeur a bien remplacé l ancienne',
		persistes[0] && persistes[0].attrs.gain === '300', persistes[0] && persistes[0].attrs.gain);
	const note = inspector.querySelector('.inspector__note');
	ok('confirmation affichée à l utilisateur', !!note && (note.textContent || '').length > 10,
		note && note.textContent);
	ok('confirmation : elle dit OÙ retrouver le composant',
		note && /personnalis|Custom/i.test(note.textContent || ''), note && note.textContent);

	// --- 6. Boîtier TO-220 (v2026.7.247) ---------------------------------------
	const q3 = editor.addPart('transistor', 700, 300);
	editor.updatePartAttr(q3.id, 'pkg', 'to220');
	editor.updatePartAttr(q3.id, 'text', 'BD911');
	await wait(80);
	const el3 = editor.elementOf(q3.id);
	const svg3 = el3 && el3.shadowRoot && el3.shadowRoot.querySelector('svg');
	ok('TO-220 : dessin 60 × 90 px', svg3 && svg3.getAttribute('viewBox') === '0 0 60 90',
		svg3 && svg3.getAttribute('viewBox'));
	const pins3 = el3 ? el3.pinInfo : [];
	ok('TO-220 : trois pattes au pas de 10 px, alignées sous le boîtier',
		pins3.length === 3 && pins3.every((p, i) => p.x === 20 + 10 * i && p.y === 80),
		JSON.stringify(pins3));
	const t3 = svg3 && svg3.querySelector('text');
	const ty = t3 ? Number(t3.getAttribute('y')) : 0;
	ok('TO-220 : inscription centrée sur la face noire (x = 30, y entre 39 et 61)',
		t3 && Number(t3.getAttribute('x')) === 30 && ty > 39 && ty < 61,
		t3 && t3.outerHTML.slice(0, 90));
	ok('TO-220 : inscription claire sur le noir, à sa taille pleine',
		t3 && t3.getAttribute('fill') === '#e6e6e6' && Number(t3.getAttribute('font-size')) === 5.5,
		t3 && t3.outerHTML.slice(0, 90));
	// La face du TO-220 est assez large pour une référence entière, là où le
	// TO-92 oblige à la couper en deux lignes.
	ok('TO-220 : une référence entière tient sur UNE ligne',
		svg3 && svg3.querySelectorAll('text').length === 1,
		svg3 && svg3.querySelectorAll('text').length);

	// --- 7. Symboles internes désignés par la fiche (v2026.7.247) --------------
	// Symboles GÉNÉRIQUES : pattes non reliées, posés par TRANSLATION sur la
	// patte 1 (repère 20,40) — un TO-220, deux fois plus haut, ne les étire pas.
	const trio = (y) => [{ name: '1', x: 20, y }, { name: '2', x: 30, y }, { name: '3', x: 40, y }];
	const wiring = (attrs, y, box) => internalWiringSvg('transistor', trio(y), attrs, 'transistor', box);
	const gros = { w: 60, h: 90 };
	const petit = { w: 50, h: 50 };
	const NOUVEAUX = ['npn-generique', 'pnp-generique', 'darlington-npn', 'darlington-pnp', 'nmos-d'];
	const dessins = new Map();
	for (const nom of NOUVEAUX) {
		const s = wiring({ schema: nom }, 40, petit);
		dessins.set(nom, s || '');
		ok('symbole « ' + nom + ' » : dessin trouvé et calé sur la patte 1',
			!!s && s.length > 200 && s.startsWith('<g transform="translate(0.00 0.00)">'),
			s ? s.slice(0, 60) : 'absent');
	}
	ok('symboles : les cinq dessins sont bien distincts',
		new Set([...dessins.values()]).size === NOUVEAUX.length);
	const surTo220 = wiring({ schema: 'npn-generique' }, 80, gros);
	ok('symbole sur TO-220 : posé par translation, jamais étiré',
		surTo220 && /translate\\(0\\.00 40\\.00\\)/.test(surTo220) && !/scale\\(/.test(surTo220),
		surTo220 && surTo220.slice(0, 60));
	const sansFiche = wiring({ symbol: 'npn' }, 40, petit);
	ok('sans fiche (projets d avant) : symbole NPN1 à l ancienne, mis à l échelle',
		sansFiche && /scale\\(/.test(sansFiche), sansFiche && sansFiche.slice(0, 60));
	ok('fiche inconnue : on retombe sur le symbole historique',
		wiring({ schema: 'inexistant', symbol: 'pnp' }, 40, petit) === wiring({ symbol: 'pnp' }, 40, petit));

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
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
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
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(
	chrome,
	['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1500,1000', '--virtual-time-budget=20000',
		'--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
	{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
// Contrôles i18n côté Node (le banc Chrome tourne en anglais).
const i18n = readFileSync(join(ROOT, 'src', 'webview', 'i18n.mts'), 'utf8');
rows.push({
	name: 'i18n : « Marking » traduit en « Inscription » (sans mention)',
	ok: /'Marking':\s*'Inscription'/.test(i18n) && !/'Marking \(one line each\)'/.test(i18n),
	detail: 'catalogue FR non à jour',
});
rows.push({
	name: 'i18n : bouton d enregistrement traduit',
	ok: /'Save to my parts…':\s*'[^']+'/.test(i18n),
	detail: 'clé absente du catalogue FR',
});
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail
	? `transistor : ${fail} échec(s).`
	: `transistor : ${rows.length} contrôles OK — inscription à 3 lignes, générique enregistrable et simulable.`);
process.exit(fail ? 1 : 0);
