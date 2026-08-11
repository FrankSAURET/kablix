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
import { Editor, unstairPoly } from '../../src/webview/diagram/editor.mjs';
import { nameEquipotentials } from '../../src/webview/diagram/model.mjs';
import '../../src/webview/composants/ntc-element.mjs';
import '../../src/webview/composants/ptc-element.mjs';
import '../../src/webview/composants/ldr-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/pca9685-element.mjs';
import '../../src/webview/composants/servo-element.mjs';
import '../../src/webview/composants/7segment-element.mjs';
import '../../src/webview/composants/breadboard.mjs';
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

	// --- 13. Écart mini entre fils parallèles d'eqp différentes = 5 px ---------
	// Deux fils d'eqp différentes routés en parallèle ne se serrent pas à moins
	// de 5 px (GAP : 2 px en v120, 3 px en v124, 5 px depuis — un demi-pas de grille).
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
	ok('fils parallèles d eqp différentes : écart ≥ 5 px (GAP)',
		minGap === Infinity || minGap >= 5, 'écart mini=' + (minGap === Infinity ? 'aucun parallèle' : minGap.toFixed(1)));

	// --- Passe d'optimisation : 3 points colinéaires → coude supprimé (item v2026.7.146) -
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const oa = editor.addPart('ntc', 100, 400); // patte (110,470)
	const ob = editor.addPart('ntc', 400, 400); // patte (410,470) — même y
	await wait(30);
	editor.select(null);
	// Fil H aligné avec des coudes COLINÉAIRES superflus insérés à la main.
	editor.addWire({ partId: oa.id, pin: '2' }, { partId: ob.id, pin: '1' },
		{ points: [{ x: 200, y: 470 }, { x: 300, y: 470 }] }); // 2 coudes sur la même horizontale
	const wOpt = editor.diagram.wires[editor.diagram.wires.length - 1];
	const bendsBefore = (wOpt.points ?? []).length;
	editor.select(null); editor.autoRoute();
	await wait(30);
	const wOptR = editor.diagram.wires.find((x) => x.id === wOpt.id);
	ok('optimisation : coudes colinéaires supprimés (3 points alignés → 2)',
		(wOptR.points?.length ?? 0) === 0, 'coudes ' + bendsBefore + ' → ' + (wOptR.points?.length ?? 0));

	// --- Préservation d'un fil DÉJÀ bien tracé (≤4 coudes, rien survolé) --------
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const pa2 = editor.addPart('ntc', 100, 100);
	const pb2 = editor.addPart('ntc', 400, 350);
	await wait(30);
	editor.select(null);
	// Fil propre en L (2 coudes) construit à partir des VRAIES positions de broche :
	// il descend depuis la patte de pa2 (segment vertical hors des deux corps), puis
	// rejoint horizontalement la patte de pb2. Ne traverse aucun corps sur sa partie
	// interne, ne longe aucun autre fil, ne passe sur aucune broche étrangère.
	const ca = editor.hotspotCenter({ partId: pa2.id, pin: '2' });
	const cb = editor.hotspotCenter({ partId: pb2.id, pin: '1' });
	editor.addWire({ partId: pa2.id, pin: '2' }, { partId: pb2.id, pin: '1' },
		{ points: [{ x: ca.x, y: cb.y }] });
	const wKeep = editor.diagram.wires[editor.diagram.wires.length - 1];
	const keepBefore = JSON.stringify((wKeep.points ?? []).map((p) => [Math.round(p.x), Math.round(p.y)]));
	editor.select(null); editor.autoRoute();
	await wait(30);
	const wKeepR = editor.diagram.wires.find((x) => x.id === wKeep.id);
	const keepAfter = JSON.stringify((wKeepR.points ?? []).map((p) => [Math.round(p.x), Math.round(p.y)]));
	ok('préservation : fil propre (≤4 coudes, rien survolé) laissé INTACT',
		keepBefore === keepAfter, 'avant=' + keepBefore + ' après=' + keepAfter);

	// Idempotence : un 2e autoRoute ne change plus rien.
	editor.select(null); editor.autoRoute();
	await wait(30);
	const wKeepR2 = editor.diagram.wires.find((x) => x.id === wKeep.id);
	const keepAfter2 = JSON.stringify((wKeepR2.points ?? []).map((p) => [Math.round(p.x), Math.round(p.y)]));
	ok('préservation : idempotent (2e autoRoute inchangé)', keepAfter === keepAfter2, keepAfter2);

	// --- Fil ne passant PAS sur une broche voisine en COLONNE (item v2026.7.147) --
	// Sur le PCA, PWM7 / P8.5V / P8.GND sont sur la même verticale (10 px). Un fil
	// partant de P8.5V vers le HAUT écraserait PWM7 : la sortie doit être latérale.
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const pca = editor.addPart('pca9685', 300, 300);
	const srv = editor.addPart('servo', 300, 100); // au-dessus du pca
	await wait(200);
	editor.select(null);
	// Broches PWM7 / P8.5V du pca (existence selon le dessin) : on route V+/GND.
	const hasPin = (id, pin) => !!editor.hotspotCenter({ partId: id, pin });
	if (hasPin(pca.id, 'PWM7') && hasPin(pca.id, 'P8.5V') && hasPin(srv.id, 'V+')) {
		editor.addWire({ partId: srv.id, pin: 'V+' }, { partId: pca.id, pin: 'P8.5V' });
		editor.select(null); editor.autoRoute();
		await wait(50);
		const cPWM7 = editor.hotspotCenter({ partId: pca.id, pin: 'PWM7' });
		const wV = editor.diagram.wires[editor.diagram.wires.length - 1];
		const pv = [editor.hotspotCenter(wV.a), ...(wV.points ?? []), editor.hotspotCenter(wV.b)];
		const dseg = (p, a, b) => {
			const vx = b.x - a.x, vy = b.y - a.y, L2 = vx*vx+vy*vy;
			let t = L2 ? ((p.x-a.x)*vx+(p.y-a.y)*vy)/L2 : 0; t = Math.max(0, Math.min(1, t));
			return Math.hypot(p.x-(a.x+t*vx), p.y-(a.y+t*vy));
		};
		let near = Infinity;
		for (let i = 0; i < pv.length - 1; i++) near = Math.min(near, dseg(cPWM7, pv[i], pv[i + 1]));
		ok('colonne PCA : le fil V+ (P8.5V) N’ÉCRASE PAS la broche voisine PWM7',
			near > 4, 'dist au centre de PWM7 = ' + near.toFixed(1) + ' px');
	} else {
		ok('colonne PCA : broches PWM7/P8.5V présentes', false, 'broches introuvables sur le dessin PCA');
	}

	// --- Broche ENCLAVÉE : échappée latérale (item v2026.7.217) -----------------
	// P2.5V..P7.5V sont au MILIEU d'une colonne de 3 broches, avec les colonnes
	// voisines à 10 px : aucune sortie franche (haut/bas/gauche/droite) ne les
	// atteint sans écraser une voisine. Le routeur doit dégager d'un pas de grille
	// vers une colonne LIBRE, sortir de la carte par là, puis revenir de 10 px —
	// exactement le geste de la main (repro « 16 servo + alim.projix »).
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const pcaE = editor.addPart('pca9685', 300, 300);
	const srvE = editor.addPart('servo', 300, 100);
	await wait(200);
	editor.select(null);
	if (hasPin(pcaE.id, 'P5.5V') && hasPin(srvE.id, 'V+')) {
		const encRects = new Map(editor.partObstacles().map((o) => [o.id, o]));
		const encEnd = { partId: pcaE.id, pin: 'P5.5V' };
		const encC = editor.hotspotCenter(encEnd);
		const encPins = [];
		for (const [id, r] of editor.rendered) {
			for (const pin of r.hotspots.keys()) {
				const c = editor.hotspotCenter({ partId: id, pin });
				if (c && !(id === encEnd.partId && pin === encEnd.pin)) encPins.push(c);
			}
		}
		const encStubs = editor.pinStubs(encEnd, encC, encRects, 10, encPins);
		ok('broche enclavée : une échappée latérale (patte à 2 points) est proposée',
			encStubs.some((path) => path.length === 2 && Math.abs(path[0].y - encC.y) < 1 && Math.abs(path[0].x - encC.x - 0) > 1),
			encStubs.map((p) => p.map((q) => Math.round(q.x) + ',' + Math.round(q.y)).join('→')).join(' | '));
		editor.addWire({ partId: srvE.id, pin: 'V+' }, encEnd);
		editor.select(null); editor.autoRoute();
		await wait(50);
		const wE = editor.diagram.wires[editor.diagram.wires.length - 1];
		const pE = [editor.hotspotCenter(wE.a), ...(wE.points ?? []), editor.hotspotCenter(wE.b)];
		const dsegE = (p, a, b) => {
			const vx = b.x - a.x, vy = b.y - a.y, L2 = vx*vx+vy*vy;
			let t = L2 ? ((p.x-a.x)*vx+(p.y-a.y)*vy)/L2 : 0; t = Math.max(0, Math.min(1, t));
			return Math.hypot(p.x-(a.x+t*vx), p.y-(a.y+t*vy));
		};
		let pire = Infinity;
		let coupable = '';
		for (const [id, r] of editor.rendered) {
			for (const pin of r.hotspots.keys()) {
				if (id === wE.a.partId && pin === wE.a.pin) continue;
				if (id === wE.b.partId && pin === wE.b.pin) continue;
				const c = editor.hotspotCenter({ partId: id, pin });
				if (!c) continue;
				for (let i = 0; i < pE.length - 1; i++) {
					const d = dsegE(c, pE[i], pE[i + 1]);
					if (d < pire) { pire = d; coupable = id + '.' + pin; }
				}
			}
		}
		ok('broche enclavée : le fil vers P5.5V n’écrase AUCUNE broche voisine',
			pire > 4, 'plus proche = ' + coupable + ' à ' + pire.toFixed(1) + ' px | ' +
			pE.map((p) => Math.round(p.x) + ',' + Math.round(p.y)).join(' '));
		// Idempotence : le garde anti-dégradation ne doit pas reprendre l'ancien tracé.
		const encAvant = JSON.stringify((wE.points ?? []).map((p) => [Math.round(p.x), Math.round(p.y)]));
		editor.select(null); editor.autoRoute();
		await wait(50);
		const encApres = JSON.stringify((editor.diagram.wires[editor.diagram.wires.length - 1].points ?? []).map((p) => [Math.round(p.x), Math.round(p.y)]));
		ok('broche enclavée : tracé stable au 2e autoRoute', encAvant === encApres, encApres);
	} else {
		ok('broche enclavée : broche P5.5V présente', false, 'broche introuvable sur le dessin PCA');
	}

	// --- Sortie AXIALE d'une patte de résistance (item v2026.7.184) -------------
	// Les pattes d'une résistance sont sur les bords GAUCHE et DROIT du corps, à
	// la même distance (10 px) que les bords haut et bas : la liste des sorties
	// candidates, tronquée aux deux premières, perdait justement l'axiale (bord
	// droit à 10,2 px contre 10,0 px) et le fil de la patte 2 partait toujours en
	// vertical — un coude de plus qu'à la main (repro 7seg-pico2, fil orange GP2).
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const axR = editor.addPart('resistor', 300, 500); // pattes (310,510) et (370,510)
	const axT = editor.addPart('ntc', 590, 440); // patte 1 en (600,510) : même y que la patte 2
	await wait(80);
	const axC = editor.hotspotCenter({ partId: axR.id, pin: '2' });
	const axRects = new Map(editor.partObstacles().map((o) => [o.id, o]));
	// Une sortie est désormais un CHEMIN (1 point en général, 2 pour une échappée).
	const axStubs = (editor.pinStubs({ partId: axR.id, pin: '2' }, axC, axRects, 10) ?? []).map((path) => path[path.length - 1]);
	ok('résistance : la sortie AXIALE de la patte 2 est proposée à l A*',
		axStubs.some((p) => p.x > axC.x + 1 && Math.abs(p.y - axC.y) < 1),
		axStubs.map((p) => Math.round(p.x) + ',' + Math.round(p.y)).join(' | '));
	editor.addWire({ partId: axR.id, pin: '2' }, { partId: axT.id, pin: '1' });
	await wait(30);
	editor.select(null); editor.autoRoute();
	await wait(50);
	const wAx = editor.diagram.wires[editor.diagram.wires.length - 1];
	ok('résistance : patte 2 alignée avec la cible → fil DROIT (aucun coude)',
		(wAx.points?.length ?? 0) === 0,
		JSON.stringify((wAx.points ?? []).map((p) => [Math.round(p.x), Math.round(p.y)])));

	// --- Composant TOURNÉ : sa boîte d'obstacle suit la rotation (item v2026.7.201) -
	// La rotation est appliquée en CSS sur .part__body (autour de son centre) ;
	// l'encombrement retenu par le routeur se lisait, lui, sur (part.x, part.y) et
	// la taille NON tournée du dessin. Pour une résistance à 90° (dessin 80×20) le
	// routeur voyait donc 80×20 posés en haut à gauche là où le corps occupe 20×80
	// autour de son centre : la boîte tombait à côté du vrai corps et les fils
	// passaient tranquillement au travers (repro Frank : schema-kablix.projix, fil
	// LED A → GP13 traversant une résistance verticale).
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const rr = editor.addPart('resistor', 300, 300);
	await wait(60);
	editor.rotateSelection(90);
	await wait(120);
	const rBox = editor.partObstacles().find((o) => o.id === rr.id);
	ok('résistance à 90° : boîte d obstacle TOURNÉE (haute et étroite)',
		!!rBox && rBox.h > rBox.w + 20,
		rBox ? 'w=' + rBox.w.toFixed(0) + ' h=' + rBox.h.toFixed(0) : 'boîte introuvable');
	// Fil dont la LIGNE DROITE passe en plein dans le corps tourné, mais en dehors
	// de l'ancienne boîte (fausse) : sans le correctif, le fil file tout droit et
	// traverse la résistance. Le corps réel est reconstruit à partir des PATTES —
	// surtout pas à partir de la boîte de partObstacles(), qui est justement ce
	// qu'on teste. Depuis v2026.7.214 la boîte colle au DESSIN (et non plus au
	// viewBox) : les pattes tombent exactement sur ses bords, donc la demi-hauteur
	// du corps tourné vaut la demi-distance entre pattes, sans marge à ajouter.
	const rp1 = editor.hotspotCenter({ partId: rr.id, pin: '1' });
	const rp2 = editor.hotspotCenter({ partId: rr.id, pin: '2' });
	if (rp1 && rp2) {
		const cx = (rp1.x + rp2.x) / 2, cy = (rp1.y + rp2.y) / 2;
		const half = Math.abs(rp1.y - rp2.y) / 2; // demi-hauteur du corps tourné (≈30)
		const yLine = cy + half - 8; // dans le corps réel, hors de l'ancienne boîte (20 px de haut)
		const gl = editor.addPart('ntc', cx - 250, yLine - 70); // patte 2 à yLine
		const gr = editor.addPart('ntc', cx + 170, yLine - 70); // patte 1 à yLine
		await wait(120);
		const cL = editor.hotspotCenter({ partId: gl.id, pin: '2' });
		const cR = editor.hotspotCenter({ partId: gr.id, pin: '1' });
		ok('repro : ligne droite dans le corps tourné mais HORS de l ancienne boîte',
			Math.abs(cL.y - cR.y) <= 1 && cL.x < cx - 10 && cR.x > cx + 10 &&
			yLine > cy + 15 && yLine < cy + half - 4 &&
			Math.abs(yLine - Math.max(rp1.y, rp2.y)) > 4,
			'ligne y=' + yLine.toFixed(0) + ' corps y=' + (cy - half).toFixed(0) + '..' + (cy + half).toFixed(0) +
			' ancienne boîte y=' + (cy - 10).toFixed(0) + '..' + (cy + 10).toFixed(0) +
			' pattes y=' + rp1.y.toFixed(0) + '/' + rp2.y.toFixed(0));
		editor.addWire({ partId: gl.id, pin: '2' }, { partId: gr.id, pin: '1' });
		await wait(30);
		editor.select(null); editor.autoRoute();
		await wait(60);
		const wRot = editor.diagram.wires[editor.diagram.wires.length - 1];
		const polyRot = [cL, ...(wRot.points ?? []), cR];
		// Traversée du CŒUR de la résistance tournée (bords rognés de 4 px). Le
		// corps tourné fait ~11 px de large : ±6 px autour de l'axe des pattes.
		const M = 4;
		const x0 = cx - 6, x1 = cx + 6, y0 = cy - half + M, y1 = cy + half - M;
		let deep = 0;
		for (let i = 0; i < polyRot.length - 1; i++) {
			const p = polyRot[i], q = polyRot[i + 1];
			if (Math.abs(p.y - q.y) < 1 && p.y >= y0 && p.y <= y1) {
				deep += Math.max(0, Math.min(Math.max(p.x, q.x), x1) - Math.max(Math.min(p.x, q.x), x0));
			} else if (Math.abs(p.x - q.x) < 1 && p.x >= x0 && p.x <= x1) {
				deep += Math.max(0, Math.min(Math.max(p.y, q.y), y1) - Math.max(Math.min(p.y, q.y), y0));
			}
		}
		ok('fil qui passerait dans une résistance TOURNÉE : contourne (aucune traversée)',
			deep <= 1, 'traversée=' + deep.toFixed(0) + 'px points=' +
			JSON.stringify((wRot.points ?? []).map((p) => [Math.round(p.x), Math.round(p.y)])));
	} else {
		ok('repro : ligne droite dans le corps tourné mais HORS de l ancienne boîte', false, 'pattes introuvables');
		ok('fil qui passerait dans une résistance TOURNÉE : contourne (aucune traversée)', false, 'pattes introuvables');
	}

	// --- La boîte d'obstacle est le DESSIN, pas le viewBox (item v2026.7.201) ---
	// Un SVG de composant a du vide autour de son dessin (le 7 segments : 60×90 de
	// viewBox pour 50×78 de dessin, la résistance : 80×20 pour 60×11). Le routeur
	// prenait le viewBox et voyait donc des composants plus gros qu'ils ne sont —
	// des couloirs pourtant libres lui étaient fermés. La boîte doit désormais être
	// celle du rectangle de SÉLECTION, qui suit le dessin (fitSelectionBox).
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const bSeg = editor.addPart('7seg', 700, 60);
	const bRes = editor.addPart('resistor', 700, 220);
	await wait(200);
	const bBoxes = new Map(editor.partObstacles().map((o) => [o.id, o]));
	for (const [id, nom, vw, vh] of [[bSeg.id, '7 segments', 60, 90], [bRes.id, 'résistance', 80, 20]]) {
		const o = bBoxes.get(id);
		ok(nom + ' : boîte d obstacle PLUS PETITE que le viewBox du SVG',
			!!o && o.w < vw - 2 && o.h < vh - 2,
			o ? o.w.toFixed(1) + 'x' + o.h.toFixed(1) + ' contre viewBox ' + vw + 'x' + vh : 'boîte introuvable');
		// …et exactement le rectangle de sélection montré à l'utilisateur.
		const r = editor.rendered.get(id);
		editor.fitSelectionBox(id);
		const sb = r?.container.querySelector('.part__selbox')?.getBoundingClientRect();
		const tl = sb && editor.canvasPoint(sb.left, sb.top);
		const br = sb && editor.canvasPoint(sb.right, sb.bottom);
		ok(nom + ' : boîte d obstacle = rectangle de SÉLECTION',
			!!o && !!tl && Math.abs(o.x - Math.min(tl.x, br.x)) < 1 && Math.abs(o.y - Math.min(tl.y, br.y)) < 1 &&
			Math.abs(o.w - Math.abs(br.x - tl.x)) < 1 && Math.abs(o.h - Math.abs(br.y - tl.y)) < 1,
			o && tl ? 'obstacle ' + o.x.toFixed(0) + ',' + o.y.toFixed(0) + ' ' + o.w.toFixed(0) + 'x' + o.h.toFixed(0) +
				' | selbox ' + Math.min(tl.x, br.x).toFixed(0) + ',' + Math.min(tl.y, br.y).toFixed(0) + ' ' +
				Math.abs(br.x - tl.x).toFixed(0) + 'x' + Math.abs(br.y - tl.y).toFixed(0) : 'mesure impossible');
	}
	// Le cas EXACT de la plainte : deux résistances empilées recouvrent le bord
	// haut du 7 segments, la broche coincée dessous n'avait plus aucune sortie.
	// Avec la boîte au dessin, il reste 10 px de couloir libre entre le bas réel
	// des résistances et le haut réel de l'afficheur.
	const cSeg = editor.addPart('7seg', 300, 100);
	const cR1 = editor.addPart('resistor', 250, 30);
	const cR2 = editor.addPart('resistor', 260, 40);
	await wait(200);
	const cBox = new Map(editor.partObstacles().map((o) => [o.id, o]));
	const bas = Math.max(cBox.get(cR1.id).y + cBox.get(cR1.id).h, cBox.get(cR2.id).y + cBox.get(cR2.id).h);
	const haut = cBox.get(cSeg.id).y;
	ok('résistances empilées sur un 7 segments : le couloir libre est VU (≥ 5 px)',
		haut - bas >= 5, 'couloir=' + (haut - bas).toFixed(1) + 'px (bas résistances ' + bas.toFixed(1) +
		', haut afficheur ' + haut.toFixed(1) + ')');

	// --- Redressement des ESCALIERS — « zigouigoui » (v2026.7.241) --------------
	// Une marche d'un demi-pas entre deux segments du MÊME axe coûte deux coudes
	// pour rien (repro Frank : « A Examiner/bug routage.png », condo-pico).
	// unstairPoly est une fonction pure : on lui donne ici le coût géométrique nu
	// (longueur + 20 par coude) pour vérifier le mécanisme, puis un score qui
	// refuse tout changement pour vérifier qu'il a bien le dernier mot.
	const lenBends = (poly) => {
		let len = 0, bends = 0, prev = null;
		for (let i = 0; i < poly.length - 1; i++) {
			const dx = Math.abs(poly[i + 1].x - poly[i].x), dy = Math.abs(poly[i + 1].y - poly[i].y);
			if (dx < 0.5 && dy < 0.5) continue;
			len += dx + dy;
			const ax = dx >= dy ? 'h' : 'v';
			if (prev && ax !== prev) bends++;
			prev = ax;
		}
		return { len, bends };
	};
	const geo = (poly) => { const { len, bends } = lenBends(poly); return len + 20 * bends; };
	const P = (...xy) => xy.map(([x, y]) => ({ x, y }));
	const S = (poly) => poly.map((p) => Math.round(p.x) + ',' + Math.round(p.y)).join(' ');
	const ortho = (poly) => poly.every((p, i) =>
		i === 0 || Math.abs(p.x - poly[i - 1].x) <= 1 || Math.abs(p.y - poly[i - 1].y) <= 1);
	// Décroché : segment court entre deux segments de même axe ET de même sens.
	const jogs = (poly, maxLen = 20) => {
		let n = 0;
		for (let i = 1; i < poly.length - 2; i++) {
			const [p0, p1, p2, p3] = [poly[i - 1], poly[i], poly[i + 1], poly[i + 2]];
			const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
			if (len > maxLen || len < 0.5) continue;
			const ax = (p, q) => (Math.abs(p.x - q.x) <= 1 ? 'V' : 'H');
			if (ax(p0, p1) !== ax(p2, p3) || ax(p1, p2) === ax(p0, p1)) continue;
			const dir = (p, q) => (ax(p, q) === 'V' ? Math.sign(q.y - p.y) : Math.sign(q.x - p.x));
			if (dir(p0, p1) === dir(p2, p3)) n++;
		}
		return n;
	};
	// Marche de 5 px au milieu d'un tracé : elle disparaît, un des deux tronçons
	// glisse sur l'autre et le segment perpendiculaire voisin s'allonge d'autant.
	const esc = P([100, 100], [100, 140], [220, 140], [220, 145], [400, 145], [400, 200]);
	const red = unstairPoly(esc, 10, geo);
	ok('escalier : la marche de 5 px disparaît (coudes 4 → 2)', lenBends(red).bends === 2, S(red));
	ok('escalier : plus aucun décroché', jogs(red) === 0, S(red));
	ok('escalier : les deux extrémités NE bougent PAS',
		S([red[0], red[red.length - 1]]) === S([esc[0], esc[esc.length - 1]]), S(red));
	ok('escalier : tracé toujours orthogonal (H/V)', ortho(red), S(red));
	// Escalier à deux marches : les passes successives les redressent toutes.
	const esc2 = P([100, 100], [100, 140], [200, 140], [200, 145], [300, 145], [300, 150], [400, 150], [400, 200]);
	ok('escalier à 2 marches : redressé en une seule ligne (2 coudes)',
		lenBends(unstairPoly(esc2, 10, geo)).bends === 2, S(unstairPoly(esc2, 10, geo)));
	// Le score a le DERNIER mot : un décroché qui esquive quelque chose reste.
	const refuse = (poly) => (S(poly) === S(esc) ? 0 : 1e6);
	ok('escalier : le score peut REFUSER le redressement (décroché justifié gardé)',
		S(unstairPoly(esc, 10, refuse)) === S(esc), S(unstairPoly(esc, 10, refuse)));
	// Marche plus haute qu'un pas de grille : c'est un vrai détour, on n'y touche pas.
	const detour = P([100, 100], [100, 140], [220, 140], [220, 200], [400, 200], [400, 260]);
	ok('détour de 60 px : ce n est pas un escalier, tracé inchangé',
		S(unstairPoly(detour, 10, geo)) === S(detour), S(unstairPoly(detour, 10, geo)));
	// Marche entre les DEUX points de connexion (broches décalées de 10 px) :
	// aucun point n'est déplaçable, le Z reste — c'est le tracé minimal.
	const zMin = P([100, 100], [140, 100], [140, 110], [200, 110]);
	ok('marche imposée par les broches (Z minimal) : conservée',
		S(unstairPoly(zMin, 10, geo)) === S(zMin), S(unstairPoly(zMin, 10, geo)));

	// Intégration : un fil posé avec un escalier de 5 px ressort SANS décroché.
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const za = editor.addPart('ntc', 100, 100);
	const zb = editor.addPart('ntc', 500, 400);
	await wait(60);
	const zca = editor.hotspotCenter({ partId: za.id, pin: '2' });
	const zcb = editor.hotspotCenter({ partId: zb.id, pin: '1' });
	editor.addWire({ partId: za.id, pin: '2' }, { partId: zb.id, pin: '1' }, {
		points: [
			{ x: zca.x, y: zca.y + 60 }, { x: zca.x + 100, y: zca.y + 60 },
			{ x: zca.x + 100, y: zca.y + 65 }, { x: zcb.x, y: zca.y + 65 },
		],
	});
	const wZig = editor.diagram.wires[editor.diagram.wires.length - 1];
	editor.select(null); editor.autoRoute();
	await wait(50);
	const wZigR = editor.diagram.wires.find((x) => x.id === wZig.id);
	const zPoly = [editor.hotspotCenter(wZigR.a), ...(wZigR.points ?? []), editor.hotspotCenter(wZigR.b)];
	ok('autoRoute : le fil posé avec un escalier ressort SANS décroché', jogs(zPoly) === 0, S(zPoly));
	ok('autoRoute : et avec 4 coudes au plus (bon fil)', lenBends(zPoly).bends <= 4, S(zPoly));

	// --- Autoroutage PROGRESSIF : avancement, annulation, page vivante (v2026.7.265) -
	// Sur un gros schéma le calcul dure des minutes : il se fait par tranches, avec
	// barre d'avancement et bouton Annuler. Le tracé obtenu doit être le MÊME que
	// d'un trait, et la page doit continuer à servir ses tâches entre deux tranches.
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const prog = [];
	for (let i = 0; i < 8; i++) prog.push(editor.addPart('ntc', 100 + (i % 4) * 180, 100 + Math.floor(i / 4) * 200));
	await wait(120);
	editor.select(null);
	// Fils en diagonale : chacun demande un vrai routage (coudes, obstacles).
	for (let i = 0; i < 4; i++) editor.addWire({ partId: prog[i].id, pin: '2' }, { partId: prog[7 - i].id, pin: '1' });
	await wait(50);
	const polys = () => editor.diagram.wires.map((w) =>
		[editor.hotspotCenter(w.a), ...(w.points ?? []), editor.hotspotCenter(w.b)]
			.map((p) => Math.round(p.x) + ',' + Math.round(p.y)).join(' ')).join(' | ');
	editor.select(null); editor.autoRoute();
	await wait(50);
	const dUnTrait = polys();
	// Remise à plat : les fils repartent sans coude, pour router à neuf.
	for (const w of editor.diagram.wires) { w.points = undefined; editor.positionWire(w); }
	await wait(30);
	const vus = [];
	let ticks = 0;
	const tic = setInterval(() => { ticks++; }, 0);
	const r1 = await editor.autoRouteProgressive({ sliceMs: 0, onProgress: (d, t2) => vus.push([d, t2]) });
	clearInterval(tic);
	await wait(30);
	ok('progressif : même tracé que d un trait', polys() === dUnTrait, 'progressif=' + polys());
	ok('progressif : tous les fils routés, sans annulation',
		r1.cancelled === false && r1.done === r1.total && r1.total === editor.diagram.wires.length,
		JSON.stringify(r1));
	ok('progressif : l avancement monte de 0 au total',
		vus.length >= 2 && vus[0][0] === 0 && vus[vus.length - 1][0] === r1.total &&
		vus.every((v, i) => i === 0 || v[0] >= vus[i - 1][0]),
		JSON.stringify(vus));
	ok('progressif : la page respire entre deux tranches (macrotâches servies)',
		ticks > 0, 'tâches servies pendant le calcul = ' + ticks);

	// Annulation : ce qui est routé reste, le reste garde son tracé d'avant.
	for (const w of editor.diagram.wires) { w.points = undefined; editor.positionWire(w); }
	await wait(30);
	// Annulé à la 3e tranche : deux fils sont passés, les autres non.
	let vues = 0;
	const r2 = await editor.autoRouteProgressive({ sliceMs: 0, shouldCancel: () => ++vues >= 3 });
	await wait(30);
	ok('progressif : annulation prise en cours de route',
		r2.cancelled === true && r2.done >= 1 && r2.done < r2.total, JSON.stringify(r2));
	const routes = editor.diagram.wires.filter((w) => (w.points ?? []).length > 0).length;
	ok('progressif : annulé, les fils déjà routés sont conservés',
		routes >= 1 && routes <= r2.done, 'fils avec coudes = ' + routes + ' pour ' + r2.done + ' traités');

	// --- Routage SUR une platine d'essais (v2026.8.30) -------------------------
	// La platine n'est pas un obstacle mais le plan de travail : le fil la traverse
	// (aucun détour pour sortir de la carte) tout en évitant de RECOUVRIR ses trous
	// — ses centaines de trous sont un COÛT, pas une interdiction (les déclarer
	// interdits noyait le graphe de l'A\*, qui rendait les armes ; l'appelant
	// retombait alors sur un coude en L couché sur les trous).
	for (const p of [...editor.diagram.parts]) editor.removePart?.(p.id);
	await wait(30);
	const bbd = editor.addPart('breadboard', 100, 100);
	await wait(250);
	const bbPins = [...(editor.rendered.get(bbd.id)?.hotspots.keys() ?? [])];
	const trouA = bbPins.find((n) => /^a5$/i.test(n)) ?? bbPins[0];
	const trouB = bbPins.find((n) => /^j20$/i.test(n)) ?? bbPins[bbPins.length - 1];
	editor.addWire({ partId: bbd.id, pin: trouA }, { partId: bbd.id, pin: trouB }, { color: 'green' });
	await wait(50);
	const wBB = editor.diagram.wires[editor.diagram.wires.length - 1];
	editor.select(null); editor.autoRoute();
	await wait(80);
	const cTrou = (pin) => editor.hotspotCenter({ partId: bbd.id, pin });
	const polyBB = [cTrou(trouA), ...(wBB.points ?? []), cTrou(trouB)];
	// Trou recouvert : pastille de 9 px, son centre à moins de 4 px du trait.
	const surSeg = (c, p, q) => {
		if (c.x < Math.min(p.x, q.x) - 4 || c.x > Math.max(p.x, q.x) + 4) return false;
		if (c.y < Math.min(p.y, q.y) - 4 || c.y > Math.max(p.y, q.y) + 4) return false;
		if (Math.abs(p.y - q.y) < 1.5) return Math.abs(c.y - p.y) <= 4;
		if (Math.abs(p.x - q.x) < 1.5) return Math.abs(c.x - p.x) <= 4;
		return Math.hypot(c.x - p.x, c.y - p.y) <= 4;
	};
	const masques = [];
	for (const pin of bbPins) {
		if (pin === trouA || pin === trouB) continue;
		const c = cTrou(pin);
		if (!c) continue;
		for (let i = 0; i < polyBB.length - 1; i++) {
			if (surSeg(c, polyBB[i], polyBB[i + 1])) { masques.push(pin); break; }
		}
	}
	ok('platine : le fil ne RECOUVRE aucun trou étranger', masques.length === 0,
		masques.slice(0, 12).join(' ') + ' | ' + S(polyBB));
	const boiteBB = editor.partObstacles().find((o) => o.id === bbd.id);
	const dehors = polyBB.filter((p) =>
		p.x < boiteBB.x - 10 || p.x > boiteBB.x + boiteBB.w + 10 ||
		p.y < boiteBB.y - 10 || p.y > boiteBB.y + boiteBB.h + 10);
	ok('platine : aucun détour pour SORTIR de la carte', dehors.length === 0, S(polyBB));
	ok('platine : bon fil (4 coudes au plus)', lenBends(polyBB).bends <= 4, S(polyBB));
	// Un composant enfiché, lui, reste un obstacle plein.
	const ledBB = editor.addPart('led', 400, 400);
	await wait(150);
	editor.centerPartOn(ledBB.id, cTrou(bbPins.find((n) => /^e10$/i.test(n)) ?? bbPins[10]));
	await wait(60);
	editor.plugPlacedPart(ledBB);
	await wait(100);
	editor.select(null); editor.autoRoute();
	await wait(80);
	const polyBB2 = [cTrou(trouA), ...(wBB.points ?? []), cTrou(trouB)];
	const corpsLed = editor.partObstacles().find((o) => o.id === ledBB.id);
	let dansLed = 0;
	for (let i = 0; i < polyBB2.length - 1; i++) {
		const p = polyBB2[i], q = polyBB2[i + 1];
		const n = Math.max(2, Math.round((Math.abs(q.x - p.x) + Math.abs(q.y - p.y)) / 2));
		for (let k = 0; k <= n; k++) {
			const x = p.x + ((q.x - p.x) * k) / n, y = p.y + ((q.y - p.y) * k) / n;
			if (x > corpsLed.x + 4 && x < corpsLed.x + corpsLed.w - 4 &&
				y > corpsLed.y + 4 && y < corpsLed.y + corpsLed.h - 4) dansLed++;
		}
	}
	ok('platine : un composant ENFICHÉ reste un obstacle', dansLed === 0,
		dansLed + ' points dans le corps | ' + S(polyBB2));

	// --- Carrés de connexion au bout des fils (v2026.8.30) ---------------------
	// Demande de Frank : un carré de la couleur du fil sur chaque pastille de
	// connexion, un poil plus large que le trait (3 px).
	const caps = editor.wireCaps.get(wBB.id);
	ok('carrés : un à chaque bout du fil', !!caps && caps.children.length === 2,
		caps ? caps.children.length : 'aucun groupe');
	if (caps) {
		const r0 = caps.children[0], r1 = caps.children[1];
		const cx = (r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2;
		const cy = (r) => Number(r.getAttribute('y')) + Number(r.getAttribute('height')) / 2;
		const bA = cTrou(trouA), bB2 = cTrou(trouB);
		ok('carrés : centrés sur les deux points de connexion',
			Math.abs(cx(r0) - bA.x) < 0.6 && Math.abs(cy(r0) - bA.y) < 0.6 &&
			Math.abs(cx(r1) - bB2.x) < 0.6 && Math.abs(cy(r1) - bB2.y) < 0.6,
			S([{ x: cx(r0), y: cy(r0) }, { x: cx(r1), y: cy(r1) }]) + ' pour ' + S([bA, bB2]));
		ok('carrés : côté supérieur à la largeur du trait (3 px)',
			Number(r0.getAttribute('width')) > 3 && Number(r0.getAttribute('width')) <= 7,
			r0.getAttribute('width'));
		const avantFill = r0.style.fill;
		editor.setWireColor(wBB.id, 'red');
		await wait(40);
		ok('carrés : la couleur suit celle du fil',
			caps.children[0].style.fill !== avantFill &&
			caps.children[0].style.fill === editor.wirePaths.get(wBB.id).style.stroke,
			caps.children[0].style.fill);
	}

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
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT });
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

// --- Contrôle statique : traverser le CŒUR d'un corps « soft » reste prohibitif -
// Un corps devient « soft » (traversable) parce qu'une borne du fil tombe dans sa
// clearance — voisins jointifs à 10 px — et non pour qu'un fil le coupe en deux.
// La seule taxe au prorata du survol (×20/px) ne pesait pas assez : sur 7seg-uno
// le fil COM.1 → GND coupait 12 px d'une résistance voisine plutôt que de faire
// le détour (v2026.7.201).
const src = readFileSync(join(ROOT, 'src/webview/diagram/editor.mts'), 'utf8');
const soft = src.match(/const softCost[\s\S]{0,800}?\n\s*\};/);
rows.push({
	name: 'A* : la traversée du CŒUR d un corps « soft » est prohibitive',
	ok: !!soft && /segRectDeepCross\([^)]*\)\s*\*\s*(\d{3,})/.test(soft[0]),
	detail: soft ? soft[0].replace(/\s+/g, ' ').slice(0, 200) : 'softCost introuvable',
});

let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `route : ${fail} échec(s).` : `route : ${rows.length} contrôles OK — ligne droite préférée, obstacles respectés.`);
process.exit(fail ? 1 : 0);
