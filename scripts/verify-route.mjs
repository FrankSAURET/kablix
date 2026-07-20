// Test de régression : l'autoroutage préfère la LIGNE DROITE (v2026.7.106).
// Deux broches alignées H ou V avec un segment direct dégagé → AUCUN coude,
// même au ras des composants (les corps des deux extrémités sont exclus du
// test d'obstacle : le segment part de leurs broches). Un composant tiers sur
// la ligne → le routeur normal reprend la main.
// v2026.7.113 : les fils d'une MÊME équipotentielle se recouvrent volontiers
// (dorsale suivie avec remise RIDE).
// v2026.7.120 : équipotentielles NOMMÉES (eqp-x / eqp-x-y) ; plus AUCUN point
// d'embranchement ; un fil ne passe jamais sur une broche étrangère ; les fils
// d'eqp différentes peuvent se serrer jusqu'à 2 px (parallèles).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-route');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { nameEquipotentials } from '../../src/webview/diagram/model.mjs';
import '../../src/webview/composants/ntc-element.mjs';
import '../../src/webview/composants/ptc-element.mjs';
import '../../src/webview/composants/ldr-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));

	// --- 1. Broches alignées horizontalement, ligne dégagée → droite -----------
	// CTN et CTP voisines : pattes en bas des corps (l'ancien routage sortait en
	// stub perpendiculaire et faisait un Π à 2 coudes sous les composants).
	const ntc = editor.addPart('ntc', 100, 100); // pattes (110,170) (130,170)
	const ptc = editor.addPart('ptc', 170, 100); // pattes (180,170) (200,170)
	await wait(80);
	editor.addWire({ partId: ntc.id, pin: '2' }, { partId: ptc.id, pin: '1' });
	await wait(30);
	editor.select(null); editor.autoRoute();
	const w1 = editor.diagram.wires[0];
	ok('H alignées, ligne dégagée : AUCUN coude (droit)',
		!w1.points || w1.points.length === 0, JSON.stringify(w1.points ?? []));

	// --- 2. Toujours droit au ras des corps : les extrémités sont exclues -------
	// (le segment passe dans la zone des pattes des deux composants reliés)
	const ldr = editor.addPart('ldr', 240, 140); // pattes (250,170) (330,170) — même y
	await wait(60);
	editor.addWire({ partId: ptc.id, pin: '2' }, { partId: ldr.id, pin: '1' });
	await wait(30);
	editor.select(null); editor.autoRoute();
	const w2 = editor.diagram.wires[1];
	ok('H alignées au ras des corps d extrémité : droit quand même',
		!w2.points || w2.points.length === 0, JSON.stringify(w2.points ?? []));

	// --- 3. Composant tiers SUR la ligne → pas de ligne droite -------------------
	const led = editor.addPart('led', 150, 150); // corps à cheval sur y=170 entre ntc:2 et ldr:1 ? non — entre ntc:2 (130,170) et un point à droite
	await wait(60);
	// fil ntc:1 → ldr:2 : la ligne y=170 traverse les corps de la CTP et de la LED posées entre
	editor.addWire({ partId: ntc.id, pin: '1' }, { partId: ldr.id, pin: '2' });
	await wait(30);
	editor.select(null); editor.autoRoute();
	const w3 = editor.diagram.wires[2];
	ok('composant tiers sur la ligne : le routeur contourne (coudes présents)',
		(w3.points?.length ?? 0) > 0, JSON.stringify(w3.points ?? []));

	// --- 4. Corps sur la ligne + même net : détour SANS traverser le corps -------
	// Deuxième fil entre les MÊMES broches que w1 (même net) : la superposition
	// même-net est permise (v2026.7.113) mais la LED du cas 3 est posée sur la
	// ligne — le fil doit CONTOURNER son corps (coudes), pas le traverser tout
	// droit (régression guettée : l'A* exclut de "solid" les corps contenant une
	// borne, la traversée doit rester taxée).
	editor.addWire({ partId: ntc.id, pin: '2' }, { partId: ptc.id, pin: '1' });
	await wait(30);
	editor.select(null); editor.autoRoute();
	const w4 = editor.diagram.wires[3];
	const poly4 = [{ x: 130, y: 170 }, ...(w4.points ?? []), { x: 180, y: 170 }];
	let span4 = 0; // plus long tronçon horizontal posé sur la ligne y=170
	for (let i = 0; i < poly4.length - 1; i++) {
		const p = poly4[i], q = poly4[i + 1];
		if (Math.abs(p.y - 170) <= 1 && Math.abs(q.y - 170) <= 1) span4 = Math.max(span4, Math.abs(q.x - p.x));
	}
	ok('corps (LED) sur la ligne : détour présent, pas de traversée du corps',
		(w4.points?.length ?? 0) > 0 && span4 <= 30,
		'span=' + span4 + ' points=' + JSON.stringify(w4.points ?? []));

	// --- 5. Broches alignées verticalement (composants tournés 90°) → droite ----
	const ntc2 = editor.addPart('ntc', 500, 100);
	await wait(60);
	editor.rotateSelection(90);
	const ntc3 = editor.addPart('ntc', 500, 260);
	await wait(60);
	editor.rotateSelection(90);
	await wait(30);
	editor.addWire({ partId: ntc2.id, pin: '2' }, { partId: ntc3.id, pin: '1' });
	await wait(30);
	editor.select(null); editor.autoRoute();
	const w5 = editor.diagram.wires[4];
	ok('V alignées (tournées 90°), ligne dégagée : AUCUN coude (droit)',
		!w5.points || w5.points.length === 0, JSON.stringify(w5.points ?? []));

	// --- 6. V aligné qui TRANCHERAIT le corps d'arrivée → détour ----------------
	// Deux LED superposées : les broches sont sous le corps, la droite verticale
	// traverserait la LED du bas de part en part (> plafond d'extrémité).
	const ledA = editor.addPart('led', 600, 100);
	const ledB = editor.addPart('led', 600, 220);
	await wait(80);
	editor.addWire({ partId: ledA.id, pin: 'A' }, { partId: ledB.id, pin: 'A' });
	await wait(30);
	editor.select(null); editor.autoRoute();
	const w6 = editor.diagram.wires[5];
	ok('V aligné qui percerait le corps d arrivée : coudes présents',
		(w6.points?.length ?? 0) > 0, JSON.stringify(w6.points ?? []));

	// --- 7. Même équipotentielle : dorsale suivie + embranchement pointé ---------
	// Trois composants : A relié à B (dorsale droite y=370) et A relié à C (même
	// net via la broche A2). Le second fil doit MONTER sur la dorsale (long
	// recouvrement horizontal à y=370) puis s'en détacher vers C — chaque coude
	// posé sur la dorsale (entrée/sortie du tronçon commun) reçoit un point.
	const nA = editor.addPart('ntc', 100, 300); // A2 = (130,370)
	const pB = editor.addPart('ptc', 400, 300); // B1 = (410,370)
	const lC = editor.addPart('ldr', 300, 450); // C1 = (310,480)
	await wait(80);
	editor.addWire({ partId: nA.id, pin: '2' }, { partId: pB.id, pin: '1' }); // dorsale
	editor.addWire({ partId: nA.id, pin: '2' }, { partId: lC.id, pin: '1' }); // branche
	await wait(30);
	editor.select(null); editor.autoRoute();
	const wBk = editor.diagram.wires[editor.diagram.wires.length - 2];
	const wBr = editor.diagram.wires[editor.diagram.wires.length - 1];
	ok('dorsale A→B droite (référence du recouvrement)',
		!wBk.points || wBk.points.length === 0, JSON.stringify(wBk.points ?? []));
	// Recouvrement : le tracé de la branche possède un tronçon horizontal ≥ 50 px
	// SUR la ligne de la dorsale (y=370, entre les x des broches A2 et B1).
	const poly = [{ x: 130, y: 370 }, ...(wBr.points ?? []), { x: 310, y: 480 }];
	let ride = 0;
	for (let i = 0; i < poly.length - 1; i++) {
		const p = poly[i], q = poly[i + 1];
		if (Math.abs(p.y - 370) <= 1 && Math.abs(q.y - 370) <= 1) {
			const lo = Math.max(Math.min(p.x, q.x), 130), hi = Math.min(Math.max(p.x, q.x), 410);
			ride += Math.max(0, hi - lo);
		}
	}
	ok('branche même net : recouvre la dorsale (tronçon commun ≥ 50 px)',
		ride >= 50, 'ride=' + ride + ' points=' + JSON.stringify(wBr.points ?? []));
	await wait(30); // microtâche des (ex-)jonctions
	// v2026.7.120 : PLUS AUCUN point d'embranchement dessiné (demande de Frank).
	ok('aucun point d embranchement dessiné sur la dorsale',
		document.querySelectorAll('.wire-junctions circle').length === 0);
	// Doublon de dorsale (mêmes broches, ligne dégagée) : superposition acceptée,
	// le fil reste DROIT — l'ancien créneau anti-superposition ne joue plus entre
	// fils d'une même équipotentielle.
	editor.addWire({ partId: nA.id, pin: '2' }, { partId: pB.id, pin: '1' });
	await wait(30);
	editor.select(null); editor.autoRoute();
	const wDup = editor.diagram.wires[editor.diagram.wires.length - 1];
	ok('mêmes broches, ligne dégagée : superposé et droit (même net)',
		!wDup.points || wDup.points.length === 0, JSON.stringify(wDup.points ?? []));

	// --- 8. Jonction en T posée à la main → point pile au croisement -------------
	const mA = editor.addPart('ntc', 600, 400); // A2 = (630,470)
	const mB = editor.addPart('ptc', 750, 400); // B1 = (760,470)
	const mC = editor.addPart('ldr', 650, 500); // C1 = (660,530)
	await wait(80);
	editor.addWire({ partId: mA.id, pin: '2' }, { partId: mB.id, pin: '1' }); // droit y=470
	editor.addWire({ partId: mA.id, pin: '2' }, { partId: mC.id, pin: '1' },
		{ points: [{ x: 660, y: 470 }] }); // coude posé PILE sur le fil précédent
	await wait(30);
	// v2026.7.120 : même un T posé PILE à la main ne reçoit plus de point.
	ok('T manuel : aucun point d embranchement dessiné',
		document.querySelectorAll('.wire-junctions circle').length === 0);

	// --- 9. Nommage des équipotentielles (eqp-x / eqp-x-y) ----------------------
	// mA-mB et mA-mC sont sur le MÊME net (partagent mA/2) → même eqp ; le fil
	// mB-? d'un autre net aurait une eqp différente. Ici on vérifie le schéma
	// courant : les 2 fils du T (net de mA/2) ont la même eqp et des noms uniques.
	const eqp = nameEquipotentials(editor.diagram);
	const wAB = editor.diagram.wires.find((w) => w.a.partId === mA.id && w.b.partId === mB.id);
	const wAC = editor.diagram.wires.find((w) => w.a.partId === mA.id && w.b.partId === mC.id);
	ok('eqp : deux fils du même net → même eqp-x',
		!!wAB && !!wAC && eqp.sameEqp(wAB.id, wAC.id) &&
		/^eqp-\\d+$/.test(eqp.eqpOfWire(wAB.id) ?? ''),
		eqp.eqpOfWire(wAB?.id) + ' / ' + eqp.eqpOfWire(wAC?.id));
	ok('eqp : chaque fil a un nom unique eqp-x-y',
		!!wAB && !!wAC && eqp.nameOfWire(wAB.id) !== eqp.nameOfWire(wAC.id) &&
		/^eqp-\\d+-\\d+$/.test(eqp.nameOfWire(wAB.id) ?? ''),
		eqp.nameOfWire(wAB?.id) + ' / ' + eqp.nameOfWire(wAC?.id));
	// Un fil d'un AUTRE net : deux LED indépendantes reliées entre elles (net
	// distinct de celui de mA) → eqp différente → sameEqp faux.
	const pgA = editor.addPart('led', 900, 400);
	const pgB = editor.addPart('led', 1000, 400);
	await wait(60);
	editor.addWire({ partId: pgA.id, pin: 'A' }, { partId: pgB.id, pin: 'A' });
	await wait(20);
	const eqp2 = nameEquipotentials(editor.diagram);
	const wGid = editor.diagram.wires[editor.diagram.wires.length - 1].id;
	ok('eqp : fils de nets différents → eqp différentes (pas de recouvrement autorisé)',
		wAB && !eqp2.sameEqp(wAB.id, wGid) &&
		eqp2.eqpOfWire(wAB.id) !== eqp2.eqpOfWire(wGid),
		eqp2.eqpOfWire(wAB.id) + ' vs ' + eqp2.eqpOfWire(wGid));

	// --- 10. Un fil ne passe JAMAIS sur une broche étrangère --------------------
	// Trois composants en ligne : X (gauche) — Z (milieu) — Y (droite). On câble
	// X→Y : le tracé direct passerait sur une broche de Z (milieu). L'autoroutage
	// doit contourner (coudes) plutôt que traverser la broche de Z.
	const fX = editor.addPart('ntc', 200, 700); // pattes vers le bas
	const fZ = editor.addPart('ntc', 300, 700);
	const fY = editor.addPart('ntc', 400, 700);
	await wait(80);
	// Broche de Z sur la trajectoire directe X.1 → Y.1 (même y).
	const zPin = editor.hotspotCenter({ partId: fZ.id, pin: '1' });
	const wXY = editor.addWire({ partId: fX.id, pin: '1' }, { partId: fY.id, pin: '1' });
	editor.select(null); editor.autoRoute();
	await wait(30);
	const wXYr = editor.diagram.wires.find((w) => w.a.partId === fX.id && w.b.partId === fY.id);
	const xy = editor.hotspotCenter(wXYr.a), yy = editor.hotspotCenter(wXYr.b);
	const polyXY = [xy, ...(wXYr.points ?? []), yy];
	// Aucun segment du tracé ne passe sur la broche de Z (à 2 px près).
	let onZ = false;
	for (let i = 0; i < polyXY.length - 1; i++) {
		const p = polyXY[i], q = polyXY[i + 1];
		const minx = Math.min(p.x, q.x) - 2, maxx = Math.max(p.x, q.x) + 2;
		const miny = Math.min(p.y, q.y) - 2, maxy = Math.max(p.y, q.y) + 2;
		if (zPin.x >= minx && zPin.x <= maxx && zPin.y >= miny && zPin.y <= maxy) {
			const horiz = Math.abs(p.y - q.y) < 1, vert = Math.abs(p.x - q.x) < 1;
			if ((horiz && Math.abs(zPin.y - p.y) <= 2) || (vert && Math.abs(zPin.x - p.x) <= 2)) onZ = true;
		}
	}
	ok('fil X→Y ne passe pas sur la broche étrangère de Z (contourne)', !onZ,
		'points=' + JSON.stringify(wXYr.points ?? []) + ' zPin=' + Math.round(zPin.x) + ',' + Math.round(zPin.y));

	// --- 11. Résistance : ses deux pattes ne sont PAS la même équipotentielle ---
	// buildNets fusionne 1↔2 d'une résistance (elle conduit) ; pour le ROUTAGE
	// c'est faux — les deux côtés sont à des potentiels différents. Sans
	// joinResistors:false, les fils des deux côtés héritaient de la même eqp et
	// gagnaient le droit de se chevaucher.
	const rA = editor.addPart('ntc', 200, 900);
	const rR = editor.addPart('resistor', 320, 900);
	const rB = editor.addPart('ntc', 460, 900);
	await wait(80);
	// addWire ne renvoie rien : on relit les deux derniers fils du diagramme.
	editor.addWire({ partId: rA.id, pin: '1' }, { partId: rR.id, pin: '1' });
	editor.addWire({ partId: rR.id, pin: '2' }, { partId: rB.id, pin: '1' });
	await wait(30);
	const wIn = editor.diagram.wires[editor.diagram.wires.length - 2];
	const wOut = editor.diagram.wires[editor.diagram.wires.length - 1];
	const eqp3 = nameEquipotentials(editor.diagram);
	ok('résistance : les fils de ses 2 pattes ont des eqp DIFFÉRENTES',
		eqp3.eqpOfWire(wIn.id) !== undefined &&
		eqp3.eqpOfWire(wIn.id) !== eqp3.eqpOfWire(wOut.id),
		'patte1=' + eqp3.eqpOfWire(wIn.id) + ' patte2=' + eqp3.eqpOfWire(wOut.id));
	ok('résistance : sameEqp faux entre les deux côtés (pas de chevauchement permis)',
		!eqp3.sameEqp(wIn.id, wOut.id), 'sameEqp=' + eqp3.sameEqp(wIn.id, wOut.id));

	// --- 12. Nommage eqp posé sur le fil DESSINÉ (canvas, pas que l'export) ----
	editor.redrawWires();
	await wait(30);
	const drawn = document.querySelector('path[data-eqp-wire]');
	ok('nommage eqp visible sur le fil dessiné (data-eqp / data-eqp-wire)',
		!!drawn && /^eqp-\\d+$/.test(drawn.getAttribute('data-eqp') || '') &&
		/^eqp-\\d+-\\d+$/.test(drawn.getAttribute('data-eqp-wire') || ''),
		drawn ? drawn.getAttribute('data-eqp') + ' / ' + drawn.getAttribute('data-eqp-wire') : 'aucun path nommé');

	// --- 13. Écart mini entre fils parallèles d'eqp différentes = 3 px ---------
	// Deux fils d'eqp différentes routés en parallèle ne se serrent pas à moins
	// de 3 px (GAP remonté de 2 à 3 px).
	const qgA = editor.addPart('ntc', 200, 1100);
	const qgB = editor.addPart('ntc', 500, 1100);
	const qgC = editor.addPart('ntc', 200, 1160);
	const qgD = editor.addPart('ntc', 500, 1160);
	await wait(80);
	editor.addWire({ partId: qgA.id, pin: '1' }, { partId: qgB.id, pin: '1' });
	editor.addWire({ partId: qgC.id, pin: '1' }, { partId: qgD.id, pin: '1' });
	const wP1 = editor.diagram.wires[editor.diagram.wires.length - 2];
	const wP2 = editor.diagram.wires[editor.diagram.wires.length - 1];
	editor.select(null); editor.autoRoute();
	await wait(30);
	const polyOf = (w) => {
		const r = editor.diagram.wires.find((x) => x.id === w.id);
		return [editor.hotspotCenter(r.a), ...(r.points ?? []), editor.hotspotCenter(r.b)];
	};
	const p1 = polyOf(wP1), p2 = polyOf(wP2);
	// Plus petit écart entre deux segments PARALLÈLES qui se recouvrent.
	let minGap = Infinity;
	for (let i = 0; i < p1.length - 1; i++) {
		for (let j = 0; j < p2.length - 1; j++) {
			const a1 = p1[i], b1 = p1[i + 1], a2 = p2[j], b2 = p2[j + 1];
			const h1 = Math.abs(a1.y - b1.y) < 1, h2 = Math.abs(a2.y - b2.y) < 1;
			const v1 = Math.abs(a1.x - b1.x) < 1, v2 = Math.abs(a2.x - b2.x) < 1;
			if (h1 && h2) {
				const ovl = Math.min(Math.max(a1.x, b1.x), Math.max(a2.x, b2.x)) - Math.max(Math.min(a1.x, b1.x), Math.min(a2.x, b2.x));
				if (ovl > 1) minGap = Math.min(minGap, Math.abs(a1.y - a2.y));
			} else if (v1 && v2) {
				const ovl = Math.min(Math.max(a1.y, b1.y), Math.max(a2.y, b2.y)) - Math.max(Math.min(a1.y, b1.y), Math.min(a2.y, b2.y));
				if (ovl > 1) minGap = Math.min(minGap, Math.abs(a1.x - a2.x));
			}
		}
	}
	ok('fils parallèles d eqp différentes : écart ≥ 3 px (GAP)',
		minGap === Infinity || minGap >= 3, 'écart mini=' + (minGap === Infinity ? 'aucun parallèle' : minGap.toFixed(1)));

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
	`<div id="canvas" class="canvas" style="width:900px;height:600px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `route : ${fail} échec(s).` : `route : ${rows.length} contrôles OK — ligne droite préférée, obstacles respectés.`);
process.exit(fail ? 1 : 0);
