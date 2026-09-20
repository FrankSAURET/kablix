// Test de régression : les broches restent SUR LA GRILLE de 10 px (v2026.7.105).
// Cause corrigée : rotateSelection/flipSelection tournaient autour du centre de
// la BOÎTE MESURÉE (gap de mise en page, dimensions impaires) sans re-snap —
// les broches quittaient la grille de ~2 px (LDR/CTN/CTP/LED à 90°), et les
// .projix enregistrés ainsi gardaient des positions fractionnaires (constaté
// sur le projet rv.projix : résistance tournée à 4,4 px de la grille).
// Contrôles : pose, rotations successives 90/180/270, 45° (premier pin), miroir,
// et réalignement doux au chargement d'un schéma « sale » (positions de rv.projix).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-align');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/ldr-element.mjs';
import '../../src/webview/composants/ntc-element.mjs';
import '../../src/webview/composants/ptc-element.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const offGrid = (v) => Math.min((v % 10 + 10) % 10, 10 - (v % 10 + 10) % 10);

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const world = document.querySelector('.canvas__world');
	// Centres des pastilles du DERNIER composant posé, en coordonnées monde.
	const pinCenters = () => {
		const wr = world.getBoundingClientRect();
		const cont = [...document.querySelectorAll('.part')].pop();
		return [...cont.querySelectorAll('.pin')].map((dot) => {
			const r = dot.getBoundingClientRect();
			return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
		});
	};
	const fmt = (pins) => pins.map((p) => '(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')').join(' ');

	// --- 1. Pose + rotations successives : toutes les broches sur la grille ----
	for (const type of ['resistor', 'led', 'ldr', 'ntc', 'ptc']) {
		// addPart brut ne snappe pas : on imite la pose palette (addPart + snap).
		const part = editor.addPart(type, 103, 57);
		await wait(60);
		editor.snapPartToGrid(part.id);
		editor.redrawWires();
		let pins = pinCenters();
		ok(type + ' : pose → broches sur la grille',
			pins.length >= 2 && pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
		for (const step of [90, 90, 90]) { // 90 puis 180 puis 270 cumulés
			editor.rotateSelection(step);
			await wait(20);
			pins = pinCenters();
			ok(type + ' : rotation cumulée → broches sur la grille',
				pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
		}
		// 45° : seul le PREMIER pin (référence du snap) peut être sur la grille.
		editor.rotateSelection(45 - 270);
		await wait(20);
		pins = pinCenters();
		ok(type + ' : 45° → premier pin sur la grille',
			offGrid(pins[0].x) < 0.05 && offGrid(pins[0].y) < 0.05, fmt(pins));
		editor.removePart(part.id);
	}

	// --- 1 bis. Les boutons ↺ ↻ tournent d'un QUART de tour (demande de Frank) --
	// Le pas de 45° reste sur les touches + et − : les boutons servent à poser un
	// composant debout ou couché, ce qui se fait toujours par quart de tour.
	{
		const part = editor.addPart('resistor', 103, 57);
		await wait(60);
		const btns = [...document.querySelectorAll('.inspector__transform-btn')];
		const droite = btns.find((b) => b.textContent === '↻');
		const gauche = btns.find((b) => b.textContent === '↺');
		ok('inspecteur : les deux boutons de rotation sont là', !!droite && !!gauche,
			btns.map((b) => b.textContent).join(' '));
		droite?.click();
		await wait(20);
		ok('bouton ↻ : un quart de tour (90°) et non 45°', part.rotation === 90, String(part.rotation));
		ok('… et son infobulle annonce bien 90°', /90/.test(droite?.title ?? ''), droite?.title);
		gauche?.click();
		gauche?.click();
		await wait(20);
		ok('bouton ↺ : quart de tour dans l’autre sens', part.rotation === 270, String(part.rotation));
		editor.removePart(part.id);
	}

	// --- 2. Miroir : broches sur la grille --------------------------------------
	const led = editor.addPart('led', 103, 57);
	await wait(60);
	editor.snapPartToGrid(led.id);
	editor.flipSelection('h');
	await wait(20);
	let pins = pinCenters();
	ok('miroir H : broches sur la grille',
		pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
	editor.removePart(led.id);

	// --- 3. Chargement d'un schéma « sale » (positions réelles de rv.projix) ----
	editor.loadDiagram({ parts: [
		{ id: 'ldr-72', type: 'ldr', x: 2198.5000486172257, y: 1878.5000707834274,
			attrs: {}, rotation: 90 },
		{ id: 'resistor-73', type: 'resistor', x: 2209.9342291141766, y: 1980.0854531439363,
			attrs: { value: '50000' }, rotation: 90 },
		{ id: 'ntc-76', type: 'ntc', x: 2390.006335238987, y: 1880.0015160697196, attrs: {} },
	], wires: [] });
	// Le réalignement se fait au settle (rAF) une fois les dessins mesurables.
	for (let i = 0; i < 6; i++) await wait(40);
	editor.redrawWires();
	const wr = world.getBoundingClientRect();
	const all = [...document.querySelectorAll('.part')].flatMap((cont) =>
		[...cont.querySelectorAll('.pin')].map((dot) => {
			const r = dot.getBoundingClientRect();
			return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
		}));
	ok('chargement sale : ' + all.length + ' broches recollées sur la grille',
		all.length >= 6 && all.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(all));

	// --- 4. Sonde logique : recollée même DROITE (v2026.9.4.91) ---------------
	// Une sonde n'accroche une broche qu'en la recouvrant exactement. Les .projix
	// existants en portent à des positions fractionnaires (dmx-pico : x=550,0092,
	// résidu de mesure sous-pixel passé dans gridOffset). Le recollage au
	// chargement ne visait que les composants TOURNÉS : une sonde droite restait
	// donc à côté de sa pastille. Elle se recolle maintenant quelle que soit sa
	// rotation.
	editor.loadDiagram({ parts: [
		{ id: 'SD1', type: 'sonde-logique', x: 550.0092, y: 319.9917,
			attrs: { voie: '0' }, rotation: 0 },
	], wires: [] });
	for (let i = 0; i < 6; i++) await wait(40);
	// On mesure la position ENREGISTRÉE, pas le DOM : c'est elle qui repart dans
	// le .projix, et c'est elle que le résidu sous-pixel polluait.
	const sd = editor.diagram.parts.find((p) => p.id === 'SD1');
	ok('sonde droite : position recollée sur la grille',
		sd && offGrid(sd.x) < 0.001 && offGrid(sd.y) < 0.001,
		sd ? '(' + sd.x + ',' + sd.y + ')' : 'sonde absente');

	// Et la PASTILLE elle-même, pas seulement la position enregistrée : c'est
	// son centre que l'élève pose sur la broche, donc c'est lui qui doit tomber
	// sur un croisement de la grille de 10 px.
	{
		const pins = pinCenters();
		ok('sonde : centre de la pastille sur un croisement de la grille',
			pins.length === 1 && offGrid(pins[0].x) < 0.05 && offGrid(pins[0].y) < 0.05, fmt(pins));
	}

	// Et TOURNÉE. Le cas de la sonde n'est pas celui d'une résistance : sa
	// pastille unique est en bas à GAUCHE du dessin, très loin du centre de
	// rotation. Un quart de tour la promène donc d'une trentaine de pixels, et
	// un résidu qui passait inaperçu à 0° l'écarte assez du croisement pour
	// qu'elle n'accroche plus rien. Une sonde se pose très souvent tournée —
	// c'est l'angle qui décide de quel côté part son câble.
	// rotateSelection agit sur la SÉLECTION : sans ce clic, elle tournerait
	// dans le vide et les trois contrôles passeraient sans rien mesurer.
	// (Pas de backtick dans ce bloc : tout le banc est un gabarit entre
	// backticks, un seul refermerait la chaîne et casserait le fichier.)
	// addPart sélectionne tout seul (c'est ce qui fait marcher la section 1),
	// mais loadDiagram ne sélectionne rien : il faut le faire à la main.
	editor.select({ kind: 'part', id: 'SD1' });
	await wait(20);
	// Position de la pastille AVANT toute rotation : c'est la broche qu'elle
	// pince, et la rotation ne doit pas l en decrocher (item 1.3 du 17/09 :
	// « la sonde doit tourner autour de sa broche de connection »).
	const pivot = pinCenters()[0];
	for (const [i, step] of [90, 90, 90].entries()) { // 90 puis 180 puis 270 cumulés
		editor.rotateSelection(step);
		await wait(20);
		const pins = pinCenters();
		const rot = editor.diagram.parts.find((p) => p.id === 'SD1')?.rotation;
		ok('sonde tournée à ' + ((i + 1) * 90) + '° : la pastille reste sur un croisement',
			rot === (i + 1) * 90 % 360 && pins.length === 1
				&& offGrid(pins[0].x) < 0.05 && offGrid(pins[0].y) < 0.05,
			'rotation=' + rot + ' ' + fmt(pins));
		// ET AU MÊME croisement. Avant ce lot la pastille restait bien sur la
		// grille — mais un carreau ou trois plus loin : le composant tournait
		// autour du centre de sa boite, puis on recollait la pastille sur le
		// croisement le plus proche de LÀ. Une pince posée sur GP0 se retrouvait
		// sur une autre broche, ou dans le vide.
		const dx = pins.length === 1 ? Math.abs(pins[0].x - pivot.x) : 999;
		const dy = pins.length === 1 ? Math.abs(pins[0].y - pivot.y) : 999;
		ok('sonde tournée à ' + ((i + 1) * 90) + '° : elle pivote AUTOUR de sa pastille (elle ne bouge pas)',
			dx < 0.6 && dy < 0.6,
			'écart=' + dx.toFixed(2) + ' ; ' + dy.toFixed(2) + ' px');
	}
	editor.rotateSelection(90); // retour à 0° pour les contrôles suivants
	await wait(20);

	// Et MIROITÉE. Même exigence que la rotation, même cause, et elle a échappé
	// au lot .97 (item 1.3 du 18/09 : « la rotation se fait bien avec pour
	// centre la patte de connexion mais pas les 2 symétries »). Le scale(-1) du
	// navigateur joue autour du centre de la boîte : sur un dessin de 80x80
	// dont la pastille est en bas à gauche, un miroir la projetait à l autre
	// bout. Les quatre bascules se testent d affilée, chacune devant laisser la
	// pastille immobile ; les deux dernières ramènent la sonde à l endroit.
	for (const [i, axe] of ['h', 'v', 'h', 'v'].entries()) {
		editor.flipSelection(axe);
		await wait(20);
		const pins = pinCenters();
		const dx = pins.length === 1 ? Math.abs(pins[0].x - pivot.x) : 999;
		const dy = pins.length === 1 ? Math.abs(pins[0].y - pivot.y) : 999;
		ok('sonde miroitée (' + axe + ', bascule ' + (i + 1) + ') : la pastille ne bouge pas',
			dx < 0.6 && dy < 0.6,
			'écart=' + dx.toFixed(2) + ' ; ' + dy.toFixed(2) + ' px');
		ok('sonde miroitée (' + axe + ', bascule ' + (i + 1) + ') : la pastille reste sur un croisement',
			pins.length === 1 && offGrid(pins[0].x) < 0.05 && offGrid(pins[0].y) < 0.05, fmt(pins));
	}

	// --- 5. Le CROCHET métallique : un ERGOT, pas une aiguille (v2026.9.4.97) -
	// Reprise du 17/09. Au lot .94 il était devenu un long trait peint par-dessus
	// tout le dessin — visible, mais posé SUR la pince comme une écharde. Frank
	// le veut court dehors, large, et donnant l'impression de RENTRER dans le
	// corps plastique. On mesure donc quatre choses : qu'il dépasse (sinon on ne
	// le voit pas), qu'il dépasse PEU, qu'il soit épais, et qu'il passe SOUS le
	// dessin coloré au lieu de le recouvrir.
	{
		const el = document.querySelector('[id="SD1"] kablix-sonde-logique')
			|| [...document.querySelectorAll('kablix-sonde-logique')].pop();
		const r = el && el.shadowRoot;
		const tige = r && r.querySelector('#path944');
		const bb = tige && tige.getBBox();
		// La boîte couvre l'ergot ET la partie enfouie : ~5,8 unités en diagonale.
		// Trop petite, le crochet ne rentrerait dans rien ; trop grande, il
		// ressortirait de l'autre bout du corps.
		ok('crochet : le trait entier mesure entre 4 et 9 unités de viewBox',
			bb && bb.width >= 4 && bb.width <= 9 && bb.height >= 4 && bb.height <= 9,
			bb ? bb.width.toFixed(2) + 'x' + bb.height.toFixed(2) : 'tige introuvable');
		// ASYMÉTRIE : c'est elle qui fait « rentrer » l'ergot. Le trait part du
		// croisement et file VERS L INTERIEUR du corps (haut-droit) ; rien ne le
		// prolonge au-dela. Un crochet symetrique — celui du lot .94 — a l air
		// plante en travers de la pince, ce que Frank a signale.
		// Depuis le 18/09 le bout EST le croisement, il n y a donc plus d ergot
		// sous la pastille a comparer : ce qu on verifie, c est que tout le trait
		// est du bon cote. Le demi-trait de la coupe en biais deborde de 0,78 au
		// plus (EP/2 en travers), on tolere donc ce residu.
		const pastilleY = 70; // SONDE_PIN.y, en unités de viewBox
		const dedans = bb ? (pastilleY - bb.y) : 0;
		const dehors = bb ? (bb.y + bb.height - pastilleY) : 0;
		ok('crochet : tout le trait file VERS L INTERIEUR du corps',
			dedans > 2.5 && dehors < 1,
			'dedans=' + dedans.toFixed(2) + ' dehors=' + dehors.toFixed(2));
		// Épaisseur : c'est la demande « pas assez large ». Elle se lit sur le
		// style, la boîte englobante d'une diagonale ne la donne pas.
		const st = tige && (tige.getAttribute('style') || '');
		// Découpage à la main plutôt qu'une expression régulière : ce fichier est
		// un gabarit entre backticks, les échappements y sont mangés (déjà vu).
		const ep = st ? Number(st.split('stroke-width:')[1].split(';')[0]) : NaN;
		ok("crochet : au moins 2 unités d'épaisseur (un ergot, pas un cheveu)",
			ep >= 2, 'stroke-width=' + ep);
		const mach = r && r.querySelector('#path14-32');
		const rc = tige && tige.getBoundingClientRect();
		const rm = mach && mach.getBoundingClientRect();
		// L EXTREMITE DU CROCHET EST LE POINT DE CONNEXION (item 1.2 du 18/09 :
		// « son extremite (bas gauche) doit etre sur une intersection de la
		// grille. La connection c'est bien l extremite du crochet »). On lit donc
		// le NOEUD du trait, pas sa boite englobante : la boite englobe la CALOTTE
		// arrondie, un demi-disque de rayon 1,1 autour du noeud, et voit donc son
		// bord le plus bas-gauche (9,27 ; 70,75). Le point de connexion est le
		// CENTRE de cette calotte, c est-a-dire le noeud lui-meme.
		const bout = tige && tige.getPointAtLength ? tige.getPointAtLength(0) : null;
		ok("crochet : son extremite tombe PILE sur le croisement de la grille",
			bout && Math.abs(bout.x - 10) < 0.05 && Math.abs(bout.y - 70) < 0.05,
			bout ? 'bout=(' + bout.x.toFixed(2) + ' ; ' + bout.y.toFixed(2) + ')' : 'tige introuvable');
		// ARRONDIE, et c est voulu. Ce controle exigeait l inverse (coupe nette)
		// sur une lecture fausse : la calotte qui deborde de 1,1 unite autour du
		// noeud n est pas un defaut d alignement, c est le RAYON de l arrondi, donc
		// symetrique — le centre de l arrondi, lui, tombe pile sur le croisement.
		// Frank (18/09) : « je l ai dessine arrondit et je souhaite qu il le reste
		// avec le centre de l arrondi sur une intersection de grille ». La mesure de
		// la peinture reelle est dans verify-crochet.mjs (lecture des pixels :
		// getBBox et getPointAtLength ignorent la terminaison du trait).
		ok("crochet : terminaison ARRONDIE (le centre de l arrondi est sur le croisement)",
			st && st.indexOf('stroke-linecap:round') >= 0, 'style=' + st);
		// Il reste VISIBLE : le trait sort du corps en biais sous la machoire.
		ok('crochet : son ergot reste visible hors de la machoire verte',
			rc && rm && rc.left < rm.left,
			rc && rm ? 'crochet gauche=' + rc.left.toFixed(1) + ' machoire gauche=' + rm.left.toFixed(1) : 'introuvable');
		// SOUS le plastique : premier enfant, donc peint en premier. C'est ce qui
		// donne l'impression que l'ergot entre dans le corps.
		ok('crochet : peint SOUS le dessin coloré (premier enfant du SVG)',
			tige && tige.parentNode.firstElementChild === tige,
			tige ? String(tige.parentNode.nodeName) : 'tige introuvable');
		// Dégradé argenté : recalé sur le nouveau segment, sinon le trait sort
		// d'une seule teinte plate (le dégradé d'origine est posé à des centaines
		// d'unités de là, userSpaceOnUse + gradientTransform hérité).
		const grad = r && r.querySelector('#linearGradient996');
		const gx1 = grad && Number(grad.getAttribute('x1'));
		ok('crochet : dégradé métallique recalé en travers du trait',
			grad && Math.abs(gx1 - 10) < 2 && grad.getAttribute('gradientTransform') === 'translate(0,0)',
			grad ? 'x1=' + gx1 + ' gt=' + grad.getAttribute('gradientTransform') : 'dégradé introuvable');
		// LA POINTE DESSINÉE DE LA MÂCHOIRE N'EST PLUS MESURÉE ICI (19/09).
		//
		// Ce contrôle comparait le coin de la boîte de la mâchoire à la pastille
		// et exigeait deux dixièmes d'unité d'écart. Il tenait tant que la pince
		// était calée au calcul ; il ne tient plus depuis que Frank l'a recalée
		// À L'ŒIL (la constante RECALAGE de sonde-logique-element.mts), et c'est
		// SON réglage qui fait foi : la pince est INCLINÉE, si bien que le coin
		// de sa boîte englobante n'est pas son point de pince — la boîte d'un
		// objet penché déborde toujours de sa pointe.
		//
		// Mesurer un coin de boîte revenait donc à mesurer l'inclinaison, pas
		// l'alignement. Le VRAI point de connexion, lui, reste gardé juste
		// au-dessus : « crochet : son extremite tombe PILE sur le croisement de
		// la grille », au vingtième d'unité près, mesuré sur le NŒUD du trait —
		// le point que le fil rejoint réellement, qu'importe l'inclinaison.
		// Ne pas remettre ce contrôle sans une mesure qui tienne compte de
		// l'inclinaison.
	}

	// --- 6. Grise tant qu'elle n'est accrochée à rien (v2026.9.4.94) ---------
	// Le geste demandé : on prend une pince, elle est grise ; posée elle prend
	// sa couleur ; décrochée elle redevient grise ; reposée elle RETROUVE la
	// même. L'indice de voie ne bouge jamais — seule la peinture change.
	{
		const el = [...document.querySelectorAll('kablix-sonde-logique')].pop();
		const GRIS = '#9e9e9e';
		el.setAttribute('accroche', '');
		await wait(20);
		const inerte = el.couleur;
		el.setAttribute('accroche', 'uno/13');
		await wait(20);
		const posee = el.couleur;
		el.setAttribute('accroche', '');
		await wait(20);
		const relachee = el.couleur;
		el.setAttribute('accroche', 'uno/12');
		await wait(20);
		const reposee = el.couleur;
		ok('sonde non accrochée : grise', inerte === GRIS, inerte);
		ok('sonde accrochée : elle prend la couleur de sa voie', posee !== GRIS, posee);
		ok('sonde décrochée : elle redevient grise', relachee === GRIS, relachee);
		ok('sonde reposée : elle retrouve EXACTEMENT sa couleur',
			reposee === posee, reposee + ' vs ' + posee);
		ok('décrochage : l’indice de voie survit (la teinte est retrouvable)',
			el.getAttribute('voie') === '0', el.getAttribute('voie'));
		// Et la peinture du dessin suit vraiment, pas seulement le getter : c'est
		// updateCouleur qui repeint le corps, et il ne tournait pas sur un
		// changement d accroche avant ce lot.
		const corps = el.shadowRoot.querySelector('#rect2-4');
		el.setAttribute('accroche', '');
		await wait(20);
		const gris = corps && corps.getAttribute('fill');
		el.setAttribute('accroche', 'uno/13');
		await wait(20);
		const colore = corps && corps.getAttribute('fill');
		ok('décrochage : le CORPS de la pince est repeint en gris', gris === GRIS, String(gris));
		ok('repose : le CORPS reprend la teinte de la voie', colore && colore !== GRIS, String(colore));

		// L AUTRE geste (v2026.9.4.97) : rien SOUS la pince, mais un cordon à son
		// crochet. La sonde mesure pour de bon, elle ne doit donc pas rester
		// grise. C est sim.mts qui pose l attribut relie d apres le cablage,
		// jamais le schema enregistre.
		el.setAttribute('accroche', '');
		await wait(20);
		const avantFil = el.couleur;
		el.setAttribute('relie', '1');
		await wait(20);
		const parFil = el.couleur;
		const corpsFil = corps && corps.getAttribute('fill');
		el.removeAttribute('relie');
		await wait(20);
		const filCoupe = el.couleur;
		ok('branchée par un FIL au crochet : elle prend la couleur de sa voie',
			avantFil === GRIS && parFil !== GRIS, avantFil + ' puis ' + parFil);
		ok('branchée par un fil : le CORPS aussi est repeint',
			corpsFil && corpsFil !== GRIS, String(corpsFil));
		ok('fil retiré : elle redevient grise', filCoupe === GRIS, filCoupe);
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
	`<div id="canvas" class="canvas" style="width:800px;height:600px"><svg id="wires" class="wires"></svg></div>` +
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
console.log(fail ? `align : ${fail} échec(s).` : `align : ${rows.length} contrôles OK — broches sur la grille (pose, rotations, miroir, chargement).`);
process.exit(fail ? 1 : 0);
