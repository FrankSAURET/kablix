// Test de régression : export SVG et STABILITÉ DES POSITIONS au rechargement
// (v2026.7.131). Vrai Editor en Chrome headless.
//
// Bug corrigé : `loadDiagram` recollait sur la grille de 10 px la PREMIÈRE BROCHE
// de CHAQUE composant (3 balayages différés + settle), réparation écrite en
// v2026.7.105 pour les vieux fichiers aux composants tournés hors grille. Le
// balayage étant inconditionnel, il déplaçait aussi tout composant DROIT posé
// volontairement hors grille — jusqu'à 5 px par axe à chaque ouverture. Le
// glissement se voyait surtout sur les composants NON CÂBLÉS : un composant
// câblé garde ses fils collés à ses broches (redrawWires suit), rien ne trahit
// le décalage, alors qu'un composant isolé n'a rien qui le suive.
//
// Contrôles : aller-retour save -> loadDiagram (positions au pixel près, câblés
// comme isolés, hors grille compris), contre-épreuve que le recollage des
// composants TOURNÉS fonctionne toujours, et cadrage de la feuille exportée
// (viewBox englobant tout le contenu + marge, identique avant/après).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-export');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/membrane-keypad-element.mjs';
import '../../src/webview/composants/alim-element.mjs';
// Le servo porte un sodipodi:type="star" (servo.edit.svg) : c'est LUI qui
// rendait l'export illisible chez Frank (8 servos dans son montage).
import '../../src/webview/composants/servo-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const vbOf = (svg) => {
	const m = svg.match(/viewBox="([-\\d.]+) ([-\\d.]+) ([-\\d.]+) ([-\\d.]+)"/);
	return m ? m.slice(1).map(Number) : null;
};

async function run() {
	const canvas = document.getElementById('canvas');
	const palette = document.getElementById('palette');
	const svg = document.getElementById('wires');
	const inspector = document.getElementById('inspector');
	const editor = new Editor(canvas, palette, svg, inspector);

	const pico = editor.addPart('pico', 200, 200);
	const ledCablee = editor.addPart('led', 400, 200);
	// Volontairement HORS grille de 10 px : c'est ce que le balayage déplaçait.
	const ledIsolee = editor.addPart('led', 703, 503);
	const resIsole = editor.addPart('resistor', 63, 63);
	// Deux composants riches en résidus Inkscape, et DEUX FOIS le même type :
	// c'est le partage d'ids (dégradés de l'alim) qui vidait le bouton à l'export.
	editor.addPart('keypad', 500, 450);
	editor.addPart('alim', 60, 450);
	editor.addPart('alim', 300, 450);
	editor.addPart('servo', 700, 60);
	// Servo TOURNÉ à 270° et CÂBLÉ : c'est le montage de Frank (16 servos à 270°).
	// L'échelle était prise sur la boîte ÉCRAN — déjà tournée — d'où sx≠sy (servo
	// grossi + étiré) ; et le centre de rotation ignorait le bandeau de nom, d'où
	// ~96 px de décalage. Contrôle par CTM plus bas.
	const servoT = editor.addPart('servo', 700, 300);
	editor.select({ kind: 'part', id: servoT.id });
	editor.rotateSelection(270);
	editor.select(null);
	await wait(300);
	editor.addWire({ partId: pico.id, pin: 'GP0' }, { partId: ledCablee.id, pin: 'A' }, { color: 'green' });
	editor.addWire({ partId: pico.id, pin: 'GP1' }, { partId: servoT.id, pin: 'PWM' }, { color: 'yellow' });
	editor.redrawWires();
	await wait(400);

	const avant = editor.diagram.parts.map((p) => ({ type: p.type, x: p.x, y: p.y }));
	const svgAvant = editor.exportSvg();
	const vbAvant = vbOf(svgAvant);

	// --- 1. Cadrage de la feuille exportée -------------------------------------
	// La zone visible englobe tout le contenu avec une marge de 30 px.
	const MARGE = 30;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of editor.diagram.parts) {
		const r = editor.rendered.get(p.id);
		const body = r.container.querySelector('.part__body') ?? r.el;
		minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x + body.offsetWidth);
		maxY = Math.max(maxY, p.y + body.offsetHeight);
	}
	ok('export : viewBox présent', !!vbAvant, JSON.stringify(vbAvant));
	if (vbAvant) {
		const [vx, vy, vw, vh] = vbAvant;
		ok('export : la feuille englobe tout le contenu (rien de rogné)',
			vx <= minX && vy <= minY && vx + vw >= maxX && vy + vh >= maxY,
			'viewBox ' + vbAvant.join(' ') + ' vs contenu ' +
			[minX, minY, maxX, maxY].map(Math.round).join(','));
		// Ajustée : pas de feuille démesurée autour du schéma (marge ~30 px).
		ok('export : feuille AJUSTÉE au contenu (marge ~30 px, pas de vide)',
			minX - vx <= MARGE + 2 && minY - vy <= MARGE + 2 &&
			(vx + vw) - maxX <= MARGE + 2 && (vy + vh) - maxY <= MARGE + 2,
			'marges g/h/d/b = ' + [minX - vx, minY - vy, (vx + vw) - maxX, (vy + vh) - maxY].map(Math.round).join('/'));
	}
	// Chaque composant est bien posé à SA position dans le SVG exporté.
	const groups = [...svgAvant.matchAll(/<g id="kpart-\\d+" transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)/g)]
		.map((m) => ({ tx: +m[1], ty: +m[2] }));
	ok('export : un groupe par composant', groups.length === editor.diagram.parts.length,
		groups.length + ' groupes / ' + editor.diagram.parts.length + ' composants');
	const posOk = editor.diagram.parts.every((p) =>
		groups.some((g) => Math.abs(g.tx - p.x) <= 0.5 && Math.abs(g.ty - p.y) <= 0.5));
	ok('export : chaque composant exporté à SA position (câblé ou non)', posOk,
		JSON.stringify(groups.map((g) => [Math.round(g.tx), Math.round(g.ty)])));

	// --- 1 bis. VALIDITÉ XML du fichier exporté ---------------------------------
	// Cœur de l'item : le dessin sortait du shadow DOM avec ses attributs
	// Inkscape, dont les préfixes ne sont PAS déclarés par le <svg> racine. Un
	// seul sodipodi:type suffisait à rendre le fichier illisible (Firefox et
	// Chrome le refusent, VS Code affiche « une erreur s'est produite »,
	// Inkscape plante au dégroupage). DOMParser en application/xml est le même
	// analyseur strict que celui des navigateurs.
	const doc = new DOMParser().parseFromString(svgAvant, 'application/xml');
	const perr = doc.querySelector('parsererror');
	ok('export : XML BIEN FORMÉ (analysé sans erreur)', !perr,
		perr ? perr.textContent.replace(/\s+/g, ' ').slice(0, 200) : '');
	ok('export : plus AUCUN attribut sodipodi:/inkscape: (préfixes non déclarés)',
		!/\s(sodipodi|inkscape):/.test(svgAvant),
		(svgAvant.match(/\s(?:sodipodi|inkscape):[a-zA-Z-]+/g) || []).slice(0, 6).join(' '));
	// (motif bâti par RegExp : un slash littéral fermerait le littéral de gabarit)
	ok('export : plus AUCUN noeud <sodipodi:namedview> / <inkscape:*>',
		!new RegExp('<[' + String.fromCharCode(47) + ']?(sodipodi|inkscape):').test(svgAvant), '');
	// sodipodi:type="star" faisait reconstruire une étoile PARAMÉTRIQUE au
	// dégroupage, au lieu du chemin dessiné : forme changée ou disparue.
	ok('export : aucune forme paramétrique Inkscape (sodipodi:type)',
		!/sodipodi:type/.test(svgAvant), '');

	// --- 1 ter. Ids UNIQUES et références qui résolvent -------------------------
	// Deux alim partagent les ids de leurs dégradés : sans préfixe par composant,
	// le url(#…) de la seconde pointait sur les défs de la première -> bouton noir.
	const ids = [...svgAvant.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
	const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
	ok('export : aucun id DUPLIQUÉ (deux composants du même type)',
		dup.length === 0, [...new Set(dup)].slice(0, 8).join(' '));
	// Toute référence url(#id) doit désigner un id RÉELLEMENT présent.
	const refs = [...svgAvant.matchAll(/url\(#([^)"'\s]+)\)/g)].map((m) => m[1]);
	const orphelines = [...new Set(refs)].filter((r) => !ids.includes(r));
	ok('export : toutes les références url(#id) résolvent (dégradés, filtres)',
		orphelines.length === 0, orphelines.slice(0, 8).join(' '));

	// --- 1 quater. Taille des composants ----------------------------------------
	// Un <svg> imbriqué sans width/height vaut 100 % du viewport dans le fichier
	// exporté (= le viewBox de l'export entier) : le clavier sortait géant alors
	// que sa boîte de sélection restait juste.
	if (!perr) {
		const nested = [...doc.documentElement.querySelectorAll('svg')];
		const sansTaille = nested.filter(
			(s) => s.getAttribute('viewBox') && (!s.getAttribute('width') || !s.getAttribute('height')));
		ok('export : tout <svg> imbriqué a une taille EXPLICITE (pas de composant géant)',
			sansTaille.length === 0, sansTaille.length + ' sans width/height / ' + nested.length);
	}
	// Chaque composant tient dans la feuille : un composant géant déborderait.
	if (vbAvant && !perr) {
		const [, , vw0, vh0] = vbAvant;
		const trop = [...doc.documentElement.querySelectorAll('g[id^="kpart-"] > svg')]
			.filter((s) => +s.getAttribute('width') > vw0 || +s.getAttribute('height') > vh0);
		ok('export : aucun composant plus grand que la feuille entière',
			trop.length === 0, trop.length + ' débordant(s)');
	}
	// Contrôle de fond : le nombre de groupes de composants est bien celui du
	// schéma — un fichier tronqué par une erreur XML n'en livrerait qu'une partie
	// (symptôme « CTRL+A ne sélectionne que le pico »).
	// (les ids INTERNES sont eux aussi préfixés kpart-N : on ne compte que les
	// groupes de PREMIER NIVEAU, ceux que Ctrl+A sélectionne dans Inkscape)
	// (motif bâti par RegExp : dans ce littéral de gabarit, \\d serait consommé)
	const reKpart = new RegExp('^kpart-[0-9]+$');
	// Un composant TOURNÉ est enveloppé dans <g transform="rotate(...)"> (sans id) :
	// son <g id=kpart> n'est donc PAS enfant direct du root. On compte tout groupe
	// kpart de PREMIER NIVEAU logique — aucun ancêtre n'étant lui-même un kpart —,
	// ce que Ctrl+A sélectionne dans Inkscape (le wrapper rotate n'a pas d'id).
	const racines = perr ? [] : [...doc.documentElement.querySelectorAll('g[id]')].filter((el) => {
		if (!reKpart.test(el.getAttribute('id') || '')) return false;
		for (let a = el.parentElement; a && a !== doc.documentElement; a = a.parentElement) {
			if (reKpart.test(a.getAttribute('id') || '')) return false; // imbriqué (id interne)
		}
		return true;
	});
	ok('export : TOUS les composants présents (Ctrl+A les prend tous)',
		!perr && racines.length === editor.diagram.parts.length,
		(perr ? 'XML invalide' : racines.length + ' / ' + editor.diagram.parts.length));

	// --- 1 quinquies. Broches DESSINÉES sous les bouts de fil (v2026.7.137) -----
	// Item « les fils parfaitement alignés sur kablix ne le sont pas sur inkscape
	// (fils des servo) ». L'échelle du groupe composant était calculée sur
	// .part__body, qui englobe AUSSI l'étiquette sous le composant : le servo
	// est dessiné 160×140 dans un corps de 160×144, d'où sy = 1,0286 pour sx = 1
	// — un étirement VERTICAL de 2,8 % que le dessin ne subit pas à l'écran. Les
	// fils, en coordonnées monde, ne sont pas étirés : la broche dessinée
	// s'éloignait de son fil d'autant plus qu'elle était basse dans le viewBox.
	// Mesuré sans le correctif : servo PWM 2,29 px, LED anode 3,20 px, en dy PUR
	// (signature de l'étirement anisotrope).
	//
	// Contrôle : on lit le transform de chaque groupe DANS le fichier exporté,
	// on l'applique à la position de la broche exprimée en unités viewBox, et on
	// compare au point où le fil l'attend. Pas de getBBox (boîte d'encre) : de
	// l'arithmétique sur les valeurs du fichier, comme fait Inkscape.
	const tf = [...svgAvant.matchAll(new RegExp(
		'<g id="(kpart-[0-9]+)" transform="translate\\\\(([-0-9.]+) ([-0-9.]+)\\\\) scale\\\\(([-0-9.]+) ([-0-9.]+)\\\\)"', 'g'
	))].map((m) => ({ tx: +m[2], ty: +m[3], sx: +m[4], sy: +m[5] }));
	// Même ordre que buildSvg : supports d'abord, puis le reste.
	const derriere = (p) => (p.type === 'breadboard' || p.type === 'grove-shield' ? 0 : 1);
	const ordre = [...editor.rendered.values()].sort(
		(a, b) => derriere(a.part) - derriere(b.part));
	let ecartMax = 0;
	let pire = '';
	ordre.forEach((r, i) => {
		const t = tf[i];
		// Ce contrôle mesure la broche sur la boîte ÉCRAN (getBoundingClientRect),
		// elle-même TOURNÉE pour un composant pivoté : il est valable uniquement
		// pour les composants DROITS. Les tournés sont couverts par le contrôle CTM
		// « composants TOURNÉS sous le fil » (vérité terrain, insensible à l'angle).
		if ((r.part.rotation ?? 0) % 360 !== 0) return;
		const svgEl = (r.el.shadowRoot ?? r.el).querySelector('svg');
		if (!t || !svgEl) return;
		const vb = svgEl.viewBox?.baseVal;
		if (!vb || !vb.width || !vb.height) return;
		const srect = svgEl.getBoundingClientRect();
		if (!srect.width || !srect.height) return;
		for (const [nom, dot] of r.hotspots) {
			const dr = dot.getBoundingClientRect();
			const mx = dr.left + dr.width / 2;
			const my = dr.top + dr.height / 2;
			// Position de la broche en unités viewBox du dessin.
			const ux = ((mx - srect.left) / srect.width) * vb.width + vb.x;
			const uy = ((my - srect.top) / srect.height) * vb.height + vb.y;
			// Où l'export la pose, vs où le fil l'attend.
			const c = editor.canvasPoint(mx, my);
			const d = Math.hypot(t.tx + ux * t.sx - c.x, t.ty + uy * t.sy - c.y);
			if (d > ecartMax) {
				ecartMax = d;
				pire = r.part.type + '.' + nom + ' ' + d.toFixed(2) + ' px';
			}
		}
	});
	// Seuil serré : le correctif donne 0 px sur les 46 broches du montage.
	ok("export : chaque broche DESSINÉE tombe sous le bout de son fil (pas d'étirement)",
		ecartMax < 0.3, 'écart max ' + ecartMax.toFixed(3) + ' px' + (pire ? ' (' + pire + ')' : ''));

	// --- 1 sexies. Composants TOURNÉS : broche dessinée SOUS le fil (v2026.7.138) --
	// Le contrôle ci-dessus mesure sur la boîte ÉCRAN, elle-même tournée : il ne
	// voit PAS le défaut des composants pivotés. VÉRITÉ TERRAIN robuste : on
	// re-rend le SVG EXPORTÉ dans le DOM, on place un point aux coords viewBox de
	// chaque broche DANS son groupe kpart (donc soumis à translate+scale + rotate
	// englobant, exactement comme le dessin) et on lit sa position en coords SVG
	// via getScreenCTM — pas de boîte écran tournée. On compare au bout de fil que
	// l'éditeur vise (hotspotCenter, coords monde). Sans le correctif : servo à
	// 270° grossi + étiré (sx≠sy) et broches à ~96 px de leurs fils.
	const attendu = new Map();
	for (const wire of editor.diagram.wires) {
		if (wire.auto) continue;
		for (const end of [wire.a, wire.b]) {
			const c = editor.hotspotCenter(end);
			if (c) attendu.set(end.partId + '|' + end.pin, c);
		}
	}
	const host = document.createElement('div');
	host.style.cssText = 'position:absolute;left:0;top:0';
	host.innerHTML = svgAvant;
	document.body.appendChild(host);
	const rootSvg = host.querySelector('svg');
	await wait(150);
	let ecartRot = 0, pireRot = '', mesuresRot = 0;
	if (rootSvg && rootSvg.getScreenCTM) {
		const inv = rootSvg.getScreenCTM().inverse();
		const kparts = [...rootSvg.querySelectorAll('g[id^="kpart-"]')].filter((g) => /^kpart-[0-9]+$/.test(g.id));
		ordre.forEach((r, i) => {
			const g = kparts[i];
			const pins = (r.el.pinInfo || []);
			if (!g) return;
			for (const p of pins) {
				const exp = attendu.get(r.part.id + '|' + p.name);
				if (!exp) continue;
				const pt = rootSvg.createSVGPoint(); pt.x = p.x; pt.y = p.y;
				const screen = pt.matrixTransform(g.getScreenCTM());
				const wp = rootSvg.createSVGPoint(); wp.x = screen.x; wp.y = screen.y;
				const world = wp.matrixTransform(inv);
				const d = Math.hypot(world.x - exp.x, world.y - exp.y);
				mesuresRot++;
				if (d > ecartRot) { ecartRot = d; pireRot = r.part.type + '(rot ' + (r.part.rotation||0) + ').' + p.name + ' ' + d.toFixed(2) + 'px'; }
			}
		});
	}
	ok('export : broche des composants TOURNÉS sous le fil (CTM du SVG exporté)',
		mesuresRot > 0 && ecartRot < 0.3,
		mesuresRot + ' broches câblées, écart max ' + ecartRot.toFixed(3) + ' px' + (pireRot ? ' (' + pireRot + ')' : ''));

	// --- 2. Aller-retour save -> loadDiagram : positions INCHANGÉES -------------
	const sauve = JSON.parse(JSON.stringify({ parts: editor.diagram.parts, wires: editor.diagram.wires }));
	// Contre-épreuve : un composant TOURNÉ aux broches hors grille (vieux fichier).
	sauve.parts.push({ id: 'vieux-tourne', type: 'resistor', x: 303, y: 303, rotation: 90, attrs: {} });

	editor.loadDiagram(sauve);
	await wait(1700); // 3 balayages différés (120/350/800 ms) + settle

	const apres = editor.diagram.parts.map((p) => ({ type: p.type, x: p.x, y: p.y }));
	const deltas = avant.map((a, i) => ({
		type: a.type, rot: editor.diagram.parts[i].rotation || 0,
		dx: apres[i].x - a.x, dy: apres[i].y - a.y,
	}));
	// Le recollage grille de l'ouverture ne touche QUE les composants tournés
	// (broches hors grille, cf. v2026.7.105) : on ne contrôle donc l'immobilité
	// que sur les composants DROITS. Les tournés sont couverts par le contrôle
	// « composant TOURNÉ hors grille TOUJOURS recollé » plus bas.
	const bouge = deltas.filter((d) => (d.dx || d.dy) && d.rot % 360 === 0);
	ok('rechargement : AUCUN composant DROIT ne bouge (hors grille compris)',
		bouge.length === 0,
		bouge.map((d) => d.type + ' ' + d.dx.toFixed(2) + ',' + d.dy.toFixed(2)).join(' | '));
	// Ciblé : le composant isolé hors grille, cœur de l'item.
	const iso = deltas[2];
	ok('rechargement : composant NON CÂBLÉ hors grille garde sa position',
		iso && !iso.dx && !iso.dy, iso ? iso.dx + ',' + iso.dy : 'absent');
	const cab = deltas[1];
	ok('rechargement : composant câblé garde sa position',
		cab && !cab.dx && !cab.dy, cab ? cab.dx + ',' + cab.dy : 'absent');

	// --- 3. Le recollage des composants TOURNÉS marche toujours (v2026.7.105) ---
	const tourne = editor.diagram.parts[editor.diagram.parts.length - 1];
	ok('rechargement : composant TOURNÉ hors grille TOUJOURS recollé',
		tourne && (tourne.rotation ?? 0) === 90 && (tourne.x !== 303 || tourne.y !== 303),
		tourne ? tourne.x + ',' + tourne.y + ' (rot ' + tourne.rotation + ')' : 'absent');

	// --- 4. Cadrage stable d'une ouverture à l'autre ----------------------------
	const vbApres = vbOf(editor.exportSvg());
	// (le composant tourné ajouté agrandit le contenu : on compare l'origine)
	ok('export : cadrage stable au rechargement (origine inchangée)',
		vbAvant && vbApres && vbAvant[0] === vbApres[0] && vbAvant[1] === vbApres[1],
		JSON.stringify(vbAvant) + ' -> ' + JSON.stringify(vbApres));

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
	`<div id="canvas" class="canvas" style="width:1000px;height:800px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=25000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `export : ${fail} échec(s).` : `export : ${rows.length} contrôles OK — positions stables au rechargement, feuille ajustée.`);
process.exit(fail ? 1 : 0);
