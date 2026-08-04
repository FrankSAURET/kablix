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
import { DEFAULT_TRANSISTOR_FILTER, TRANSISTOR_REFS, transistorAttrs } from '../../src/webview/diagram/transistors.mjs';
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
	// patte 1 (repère 10,40 — celui du TO-92, cadre 40 × 50) : un TO-220, deux
	// fois plus haut et décalé, ne les étire pas.
	const trio = (y, x0) => [0, 1, 2].map((i) => ({ name: String(i + 1), x: x0 + 10 * i, y }));
	const wiring = (attrs, y, box) => internalWiringSvg('transistor', trio(y, box.x0), attrs, 'transistor', box);
	const gros = { w: 60, h: 90, x0: 20 };
	const petit = { w: 40, h: 50, x0: 10 };
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
		surTo220 && /translate\\(10\\.00 40\\.00\\)/.test(surTo220) && !/scale\\(/.test(surTo220),
		surTo220 && surTo220.slice(0, 60));
	// Sans fiche : le symbole GÉNÉRIQUE de la famille, jamais NPN1 — celui-ci
	// relie ses électrodes aux pattes dans l'ordre E-B-C et mentirait sur le
	// brochage d'un modèle câblé autrement (Frank, v2026.7.252).
	const sansFiche = wiring({ symbol: 'npn' }, 40, petit);
	ok('sans fiche (projets d avant) : symbole GÉNÉRIQUE, posé par translation',
		sansFiche === dessins.get('npn-generique'), sansFiche && sansFiche.slice(0, 60));
	ok('sans fiche : jamais le symbole NPN1, qui suppose un brochage E-B-C',
		sansFiche !== wiring({ schema: 'npn1' }, 40, petit));
	ok('fiche inconnue : on retombe sur le générique de la famille',
		wiring({ schema: 'inexistant', symbol: 'pnp' }, 40, petit) === dessins.get('pnp-generique'));
	ok('famille inconnue : repli sur le générique NPN plutôt que rien',
		wiring({ symbol: 'sait-pas' }, 40, petit) === dessins.get('npn-generique'));
	for (const [famille, attendu] of [['darlington-npn', 'darlington-npn'], ['darlington-pnp', 'darlington-pnp'], ['nmos', 'nmos-d']]) {
		ok('sans fiche : la famille « ' + famille + ' » garde SON symbole',
			wiring({ symbol: famille }, 40, petit) === dessins.get(attendu));
	}

	// --- 8. Liste de Frank : darlington, MOSFET, mise en évidence (v2026.7.248) --
	const q4 = editor.addPart('transistor', 120, 480);
	editor.select({ kind: 'part', id: q4.id });
	await wait(60);
	// Un transistor neuf n'a pas de modèle : le sélecteur s'ouvre tout seul.
	const selects = () => [...inspector.querySelectorAll('select')];
	const etiquettes = () => [...inspector.querySelectorAll('.inspector__label')].map((l) => l.textContent || '');
	const refBtn = (nom) => [...inspector.querySelectorAll('.inspector__ref')]
		.find((b) => ((b.querySelector('strong') || {}).textContent || '') === nom);
	ok('sélecteur : les cinq familles sont proposées',
		selects()[0] && selects()[0].options.length === 5,
		selects()[0] && [...selects()[0].options].map((o) => o.value).join(','));
	ok('NPN TO-92 : les références de la liste sont proposées',
		!!refBtn('BC639') && !!refBtn('MPSA42'));
	ok('références de la liste mises en évidence',
		refBtn('BC639') && refBtn('BC639').classList.contains('inspector__ref--nouveau'));
	ok('références déjà en place laissées telles quelles',
		refBtn('BC547') && !refBtn('BC547').classList.contains('inspector__ref--nouveau'));
	const choisir = (index, valeur) => {
		const s = selects()[index];
		s.value = valeur;
		s.dispatchEvent(new Event('change'));
	};
	choisir(0, 'darlington-npn');
	await wait(40);
	ok('famille darlington : BC517 proposé, sans les NPN ordinaires',
		!!refBtn('BC517') && !refBtn('BC547'));
	// Famille MOSFET : les critères ne sont plus les mêmes (pas de gain).
	choisir(0, 'nmos');
	await wait(40);
	ok('MOSFET : le critère Rds(on) remplace le gain',
		etiquettes().some((l) => /Rds/.test(l)) && !etiquettes().some((l) => /Gain|β/.test(l)),
		JSON.stringify(etiquettes()));
	ok('MOSFET TO-92 : BS170 proposé, aucun bipolaire', !!refBtn('BS170') && !refBtn('BC337'));
	choisir(1, 'to220');
	await wait(40);
	ok('MOSFET TO-220 : IRF530 proposé', !!refBtn('IRF530'));
	refBtn('IRF530').click();
	await wait(80);
	const el4 = editor.elementOf(q4.id);
	ok('IRF530 : pattes nommées G, D, S (brochage du boîtier)',
		el4 && el4.pinInfo.map((p) => p.name).join('') === 'GDS',
		el4 && JSON.stringify(el4.pinInfo.map((p) => p.name)));
	ok('IRF530 : dessin TO-220',
		el4 && el4.shadowRoot.querySelector('svg').getAttribute('viewBox') === '0 0 60 90');
	ok('IRF530 : le résumé annonce le brochage G D S et la résistance de passage',
		/G D S/.test(inspector.textContent) && /Rds\\(on\\) 0.16/.test(inspector.textContent),
		inspector.textContent.slice(0, 200));
	// Prototype personnalisé de la famille : c'est là que tout se règle.
	(button(inspector, 'Changer') || button(inspector, 'Change transistor')).click();
	await wait(40);
	choisir(0, 'nmos');
	await wait(40);
	const perso = [...inspector.querySelectorAll('.inspector__ref')].pop();
	ok('prototype personnalisé : proposé sous le nom de sa famille',
		perso && /MOSFET/.test(perso.textContent || ''), perso && perso.textContent);
	perso.click();
	await wait(60);
	ok('MOSFET personnalisé : grille/drain/source réglables, pas E/B/C',
		etiquettes().some((l) => /Grille|Gate/.test(l)) && !etiquettes().some((l) => /Base/.test(l)),
		JSON.stringify(etiquettes()));
	ok('MOSFET personnalisé : Rds(on) réglable, pas le gain',
		etiquettes().some((l) => /Rds/.test(l)) && !etiquettes().some((l) => /β/.test(l)),
		JSON.stringify(etiquettes()));

	// --- 9. Simulation des nouvelles familles (v2026.7.248) ---------------------
	// Darlington : DEUX jonctions base-émetteur, donc 1,4 V perdus sur la base et
	// 0,9 V entre collecteur et émetteur une fois saturé.
	const q5 = editor.addPart('transistor', 430, 480);
	for (const [a, v] of Object.entries(transistorAttrs('BC517', DEFAULT_TRANSISTOR_FILTER))) {
		editor.updatePartAttr(q5.id, a, v);
	}
	const r2 = editor.addPart('resistor', 300, 480);
	editor.updatePartAttr(r2.id, 'value', '4700');
	await wait(80);
	editor.addWire({ partId: mcu.id, pin: '8' }, { partId: r2.id, pin: '1' }, { color: 'green' });
	editor.addWire({ partId: r2.id, pin: '2' }, { partId: q5.id, pin: 'B' }, { color: 'green' });
	editor.addWire({ partId: q5.id, pin: 'E' }, { partId: mcu.id, pin: 'GND.1' }, { color: 'black' });
	editor.addWire({ partId: q5.id, pin: 'C' }, { partId: mcu.id, pin: '5V' }, { color: 'red' });
	// MOSFET : grille ISOLÉE, aucun courant n'y entre — la tension suffit. On
	// repose l'IRF530 sur le composant, laissé en « personnalisé » par le test
	// précédent, pour retrouver ses 14 A de courant de drain.
	for (const [a, v] of Object.entries(transistorAttrs('IRF530', DEFAULT_TRANSISTOR_FILTER))) {
		editor.updatePartAttr(q4.id, a, v);
	}
	await wait(40);
	editor.addWire({ partId: mcu.id, pin: '9' }, { partId: q4.id, pin: 'G' }, { color: 'green' });
	editor.addWire({ partId: q4.id, pin: 'S' }, { partId: mcu.id, pin: 'GND.1' }, { color: 'black' });
	editor.addWire({ partId: q4.id, pin: 'D' }, { partId: mcu.id, pin: '5V' }, { color: 'red' });
	await wait(60);
	const dar = etats(['8']).find((s) => s.partId === q5.id);
	const darIb = (5 - 1.4) / 4700;
	ok('darlington : conduit, avec DEUX jonctions à franchir (Vbe = 1,4 V)',
		dar && dar.on && Math.abs(dar.baseAmps - darIb) / darIb < 0.02, JSON.stringify(dar));
	ok('darlington : ne descend pas sous 0,9 V entre collecteur et émetteur',
		dar && dar.drop === 0.9, dar && dar.drop);
	ok('darlington : son gain énorme se retrouve dans le courant transmis',
		dar && dar.maxCollectorAmps > 20, dar && dar.maxCollectorAmps);
	const nmosOn = etats(['9']).find((s) => s.partId === q4.id);
	const nmosOff = etats([]).find((s) => s.partId === q4.id);
	ok('MOSFET : passant dès que la grille est haute', nmosOn && nmosOn.on, JSON.stringify(nmosOn));
	ok('MOSFET : sa grille ne consomme aucun courant',
		nmosOn && nmosOn.baseAmps === 0 && nmosOn.mos === true, JSON.stringify(nmosOn));
	ok('MOSFET : laisse passer jusqu au courant de drain du composant (14 A)',
		nmosOn && Math.abs(nmosOn.maxCollectorAmps - 14) < 0.01, nmosOn && nmosOn.maxCollectorAmps);
	ok('MOSFET : sa chute est négligeable, contrairement à un bipolaire',
		nmosOn && nmosOn.drop === 0, nmosOn && nmosOn.drop);
	ok('MOSFET : bloqué quand la grille retombe', nmosOff && !nmosOff.on, JSON.stringify(nmosOff));

	// --- 10. Changer de référence PENDANT que le composant est posé (v2026.7.252) --
	// L'IRF530 est un TO-220 à électrodes G/D/S : ses pastilles descendent de 40 à
	// 80 px et changent de nom. Sans re-rendu, le composant gardait les pastilles
	// E/B/C du TO-92 précédent, à mi-corps, loin des pattes dessinées.
	const q6 = editor.addPart('transistor', 700, 480);
	for (const [a, v] of Object.entries(transistorAttrs('PN2222A', DEFAULT_TRANSISTOR_FILTER))) {
		editor.updatePartAttr(q6.id, a, v);
	}
	await wait(80);
	editor.select({ kind: 'part', id: q6.id });
	await wait(80);
	const cadre = () => {
		const c = editor.rendered.get(q6.id).container.querySelector('.part__selbox');
		return c ? [parseFloat(c.style.left), parseFloat(c.style.top), parseFloat(c.style.width), parseFloat(c.style.height)] : null;
	};
	const pastilles = () => [...editor.rendered.get(q6.id).container.querySelectorAll('.pin')]
		.map((p) => p.title + '@' + parseFloat(p.style.top));
	const pastilles92 = () => [...editor.rendered.get(q6.id).container.querySelectorAll('.pin')]
		.map((p) => p.title + '@' + parseFloat(p.style.left));
	const cadre92 = cadre();
	ok('TO-92 sélectionné : cadre resserré sur le dessin, pas sur le viewBox',
		cadre92 && cadre92[2] < 45 && cadre92[3] < 45, JSON.stringify(cadre92));
	// Dessin repris de Composants.svg (v2026.7.259) : le cadre du boîtier serrait
	// 10 px de vide à droite, que le corps du composant traînait avec lui.
	const corps92 = editor.rendered.get(q6.id).container.querySelector('.part__body');
	ok('TO-92 : le corps a la largeur du dessin (40 px), sans vide à droite',
		corps92 && corps92.offsetWidth === 40,
		corps92 && corps92.offsetWidth + 'x' + corps92.offsetHeight);
	ok('TO-92 : cadre centré sur la patte du milieu (boîtier symétrique)',
		cadre92 && Math.abs(cadre92[0] + cadre92[2] / 2 - 20) <= 2, JSON.stringify(cadre92));
	ok('TO-92 : les trois pastilles au pas de 10 px, sous le cadre',
		pastilles92().join(' ') === 'E@10 B@20 C@30', JSON.stringify(pastilles92()));
	for (const [a, v] of Object.entries(transistorAttrs('IRF530', DEFAULT_TRANSISTOR_FILTER))) {
		editor.updatePartAttr(q6.id, a, v);
	}
	await wait(200);
	ok('changement de référence à chaud : pastilles G/D/S descendues sous le TO-220',
		pastilles().join(' ') === 'G@80 D@80 S@80', JSON.stringify(pastilles()));
	const cadre220 = cadre();
	ok('changement de référence à chaud : le cadre de sélection suit le nouveau dessin',
		cadre220 && cadre220[3] > 60 && cadre220[3] < 90, JSON.stringify(cadre220));
	ok('cadre : jamais le viewBox entier (il reste plus étroit que le corps)',
		cadre220 && cadre220[2] < 60 && cadre220[0] > 0, JSON.stringify(cadre220));

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
	// La base des modèles part telle quelle : elle est confrontée au CSV de Frank
	// côté Node (le banc, lui, ne sait pas lire de fichier).
	const base = document.createElement('pre');
	base.id = 'refs';
	base.textContent = JSON.stringify(TRANSISTOR_REFS);
	document.body.appendChild(base);
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
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(unesc(m[1]));

// --- La base des modèles tient-elle la liste de Frank ? ------------------------
// Le CSV donne, pour chaque référence, ses limites, son symbole interne et le
// NUMÉRO DE PATTE de chaque électrode — c'est le brochage qui piège en pratique.
const mr = dom.match(/<pre id="refs"[^>]*>([\s\S]*?)<\/pre>/);
const base = mr ? JSON.parse(unesc(mr[1])) : [];
const csv = readFileSync(join(ROOT, 'A Examiner', 'transistor.csv'), 'utf8').replace(/^﻿/, '');
const nombre = (s) => Number(String(s).replace(',', '.'));
const dansLeCsv = new Set();
for (const ligne of csv.split(/\r?\n/)) {
	const col = ligne.split(';');
	if (col.length < 10 || col[0] === '' || col[0] === 'Ref') continue;
	const [ref, type, boitier, vmax, imax, valeur, schema, p1, p2, p3] = col;
	dansLeCsv.add(ref);
	const r = base.find((x) => x.ref === ref);
	const attendu = { schema: schema.toLowerCase(), pkg: boitier.toLowerCase() };
	const mos = type.toUpperCase() === 'NMOS';
	// Brochage : le CSV dit « telle électrode est sur telle patte » ; la base le
	// range dans l'ordre des pattes. Les MOSFET n'en donnent pas (colonnes vides).
	const roles = mos ? ['G', 'D', 'S'] : ['E', 'B', 'C'];
	const places = [p1, p2, p3];
	const brochage = ['', '', ''];
	roles.forEach((role, i) => { if (places[i] !== '') brochage[Number(places[i]) - 1] = role; });
	const detail = JSON.stringify(r ?? null);
	rows.push({ name: `liste de Frank : ${ref} présent dans la base`, ok: !!r, detail: 'référence absente' });
	if (!r) continue;
	rows.push({
		name: `${ref} : boîtier, symbole interne et famille conformes au CSV`,
		ok: r.pkg === attendu.pkg && r.schema === attendu.schema
			&& (mos ? r.symbol === 'nmos' : r.symbol.includes(type.toLowerCase())),
		detail,
	});
	rows.push({
		name: `${ref} : limites conformes au CSV (${vmax} V, ${imax} A)`,
		ok: r.vcemax === nombre(vmax) && r.icmax === nombre(imax),
		detail,
	});
	rows.push({
		name: `${ref} : ${mos ? 'Rds(on)' : 'gain'} conforme au CSV (${valeur})`,
		ok: mos ? r.rdson === nombre(valeur) : r.gain === nombre(valeur),
		detail,
	});
	if (!brochage.includes('')) {
		rows.push({
			name: `${ref} : brochage ${brochage.join('-')} (le piège de cette référence)`,
			ok: r.pins.join('') === brochage.join(''),
			detail,
		});
	}
	rows.push({
		name: `${ref} : mis en évidence dans le sélecteur`,
		ok: r.nouveau === true,
		detail,
	});
}
// Hors liste de Frank : symbole GÉNÉRIQUE obligatoire. Un symbole nommé (NPN1)
// relie ses électrodes aux pattes dans un ordre figé — le poser sur une
// référence qui n'a pas été vérifiée ferait lire un faux brochage.
const GENERIQUES = {
	npn: 'npn-generique', pnp: 'pnp-generique',
	'darlington-npn': 'darlington-npn', 'darlington-pnp': 'darlington-pnp', nmos: 'nmos-d',
};
const intruses = base.filter((r) => !dansLeCsv.has(r.ref) && r.schema !== GENERIQUES[r.symbol]);
rows.push({
	name: `hors liste de Frank : les ${base.length - dansLeCsv.size} autres références portent le symbole générique`,
	ok: intruses.length === 0,
	detail: intruses.map((r) => `${r.ref} → ${r.schema}`).join(', '),
});

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
// Nouvelles familles et critères MOSFET : rien ne doit rester en anglais.
const A_TRADUIRE = [
	'Custom {0}', 'NPN Darlington', 'PNP Darlington', 'N-channel MOSFET',
	'Max Id at least', 'Max Vds at least', 'Rds\\(on\\) at most',
	'Gate on pin', 'Drain on pin', 'Source on pin',
	'Rds\\(on\\) \\(Ω\\)', 'Max Vds \\(V\\)', 'Max Id \\(A\\)',
];
const manquantes = A_TRADUIRE.filter((k) => !new RegExp(`'${k.replace(/[{}]/g, '\\$&')}':\\s*'[^']+'`).test(i18n));
rows.push({
	name: 'i18n : familles et critères des MOSFET traduits en français',
	ok: manquantes.length === 0,
	detail: `clés absentes : ${manquantes.join(', ')}`,
});
const cssSrc = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
// Le bleu du dessin (#1a5fb4) est foncé : illisible sur le fond sombre de
// l'inspecteur. Variante éclaircie par défaut (les webviews sont sombres),
// bleu d'origine rendu au thème clair (Frank, v2026.7.252).
const bleuDefaut = /\.inspector__ref--nouveau\s*\{[^}]*color:\s*(#[0-9a-f]{3,8})/i.exec(cssSrc);
rows.push({
	name: 'sélecteur : les modèles de la liste sont éclaircis en thème sombre',
	ok: !!bleuDefaut && bleuDefaut[1].toLowerCase() !== '#1a5fb4',
	detail: bleuDefaut ? bleuDefaut[1] : 'règle CSS absente',
});
rows.push({
	name: 'sélecteur : le bleu d origine (#1a5fb4) est rendu au thème clair',
	ok: /body\.vscode-light\s+\.inspector__ref--nouveau\s*\{[^}]*#1a5fb4/i.test(cssSrc),
	detail: 'règle de thème clair absente',
});
// Lettres des symboles internes : l'overlay pose un contour de 2 px sur tout le
// dessin, ce qui empâtait les e/b/c au point de les rendre illisibles.
rows.push({
	name: 'symboles internes : les lettres ne portent pas le contour du câblage',
	ok: /\.part__internal (?:text|tspan)[^{]*\{[^}]*stroke:\s*none/i.test(cssSrc),
	detail: 'règle CSS absente',
});
// La couleur écrite dans le dessin de Frank est un style EN LIGNE : elle gagne
// contre la règle CSS. Ce contrôle garde le dessin conforme à cette hypothèse.
const symboles = ['npn-generique', 'pnp-generique', 'darlington-npn', 'darlington-pnp', 'nmos-d'];
const sansCouleur = symboles.filter((nom) => {
	const svg = readFileSync(join(ROOT, 'src', 'webview', 'composants', 'interne', `${nom}-interne.svg`), 'utf8');
	const textes = svg.match(/<(?:text|tspan)\b[^>]*>/gs) || [];
	return textes.length === 0 || textes.some((t) => !/style="[^"]*fill\s*:/s.test(t));
});
rows.push({
	name: 'symboles internes : chaque lettre porte SA couleur en style en ligne',
	ok: sansCouleur.length === 0,
	detail: `symboles dont une lettre n a pas de couleur propre : ${sansCouleur.join(', ')}`,
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
