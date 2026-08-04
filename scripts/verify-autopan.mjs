// Vérifie que LA VUE SUIT LA SOURIS pendant un glissé (demande de Frank :
// « quand la souris a sélectionné un composant ou un fil (glissé), si elle sort
// de la fenêtre la vue suit »).
//
// Deux étages :
//  1. la loi de défilement seule (src/webview/diagram/autopan.mts), sans DOM ;
//  2. le VRAI éditeur en Chrome headless : composant déplacé au bord, fil en
//     cours de câblage, et les deux garde-fous (rien au repos, rien quand on
//     survole la barre d'outils sans rien tenir).
//
// L'invariant qui compte : pendant que la vue file, le composant tenu reste
// SOUS le curseur — sinon il s'échapperait à la vitesse du défilement.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(ROOT, 'node_modules', '.cache-autopan');
mkdirSync(CACHE, { recursive: true });

let failures = 0;
function check(label, ok, detail = '') {
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failures++;
}

// --- 1. La loi de défilement -------------------------------------------------
console.log('Loi de défilement :');
{
	const out = join(CACHE, 'autopan.bundle.mjs');
	await esbuild.build({
		entryPoints: [join(ROOT, 'src', 'webview', 'diagram', 'autopan.mts')],
		outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
		absWorkingDir: ROOT,
	});
	const A = await import(pathToFileURL(out).href);
	const { autoPanAxis, startAutoPan, AUTOPAN_EDGE, AUTOPAN_MAX } = A;

	// Vue de 0 à 800 : la zone franche ne bouge pas d'un pixel.
	check('au milieu de la vue : aucun défilement',
		autoPanAxis(400, 0, 800) === 0 && autoPanAxis(100, 0, 800) === 0);
	check('la bande de bord démarre AVANT le bord (câblage clic-à-clic)',
		autoPanAxis(800 - AUTOPAN_EDGE + 1, 0, 800) < 0 &&
		autoPanAxis(800 - AUTOPAN_EDGE - 1, 0, 800) === 0,
		'bande = ' + AUTOPAN_EDGE + ' px');
	check('bord DROIT : le monde recule (la vue découvre la droite)',
		autoPanAxis(795, 0, 800) < 0, autoPanAxis(795, 0, 800).toFixed(2));
	check('bord GAUCHE : le monde avance (la vue découvre la gauche)',
		autoPanAxis(5, 0, 800) > 0, autoPanAxis(5, 0, 800).toFixed(2));
	check('plus on sort, plus ça file',
		autoPanAxis(810, 0, 800) < autoPanAxis(795, 0, 800),
		autoPanAxis(795, 0, 800).toFixed(2) + ' puis ' + autoPanAxis(810, 0, 800).toFixed(2));
	check('vitesse plafonnée (la vue ne part pas à l’autre bout)',
		Math.abs(autoPanAxis(5000, 0, 800)) === AUTOPAN_MAX &&
		Math.abs(autoPanAxis(-5000, 0, 800)) === AUTOPAN_MAX,
		AUTOPAN_MAX + ' px/pas');
	check('vue plus étroite que deux bandes : il reste une zone franche',
		autoPanAxis(20, 0, 40) === 0, autoPanAxis(20, 0, 40).toFixed(2));

	// Le contrôleur : horloge, rejeu du geste, garde-fou « rien tenu ».
	const vue = { left: 0, top: 0, right: 800, bottom: 600 };
	const faire = () => {
		const trace = { dx: 0, dy: 0, rejeux: 0 };
		const auto = startAutoPan(
			{ viewport: () => vue, pan: (dx, dy) => { trace.dx += dx; trace.dy += dy; } },
			() => { trace.rejeux++; }
		);
		return { auto, trace };
	};
	{
		const { auto, trace } = faire();
		auto.track({ clientX: 400, clientY: 300, buttons: 1 });
		auto.tick();
		check('curseur au calme : le contrôleur ne bouge rien', trace.dx === 0 && trace.dy === 0);
		auto.stop();
	}
	{
		const { auto, trace } = faire();
		auto.track({ clientX: 900, clientY: 300, buttons: 1 });
		auto.tick(); auto.tick(); auto.tick();
		check('bouton tenu HORS de la vue : la vue suit', trace.dx < 0 && trace.dy === 0,
			'dx=' + trace.dx.toFixed(1));
		check('le geste est REJOUÉ à chaque pas (le composant reste sous le curseur)',
			trace.rejeux === 3, trace.rejeux + ' rejeux');
		auto.stop();
	}
	{
		const { auto, trace } = faire();
		auto.track({ clientX: 900, clientY: 300, buttons: 0 });
		auto.tick(); auto.tick();
		check('rien tenu et curseur HORS de la vue : on ne suit pas (barre d’outils)',
			trace.dx === 0 && trace.rejeux === 0, 'dx=' + trace.dx.toFixed(1));
		auto.stop();
	}
	{
		const { auto, trace } = faire();
		auto.track({ clientX: 790, clientY: 300, buttons: 0 });
		auto.tick();
		check('rien tenu mais curseur DANS la bande : la vue suit (câblage clic-à-clic)',
			trace.dx < 0, 'dx=' + trace.dx.toFixed(1));
		// Retour au calme : l'horloge doit s'éteindre d'elle-même.
		auto.track({ clientX: 400, clientY: 300, buttons: 0 });
		const avant = trace.dx;
		auto.tick();
		check('curseur revenu au centre : le défilement s’arrête', trace.dx === avant);
		auto.stop();
	}
	{
		const { auto, trace } = faire();
		auto.track({ clientX: 400, clientY: 610, buttons: 1 });
		auto.tick();
		check('les deux axes fonctionnent (bord BAS)', trace.dy < 0 && trace.dx === 0,
			'dy=' + trace.dy.toFixed(1));
		auto.stop();
	}
}

// --- 2. Les gestes de l'éditeur (lecture de la source) ----------------------
console.log('Gestes branchés sur le défilement :');
{
	const src = readFileSync(join(ROOT, 'src', 'webview', 'diagram', 'editor.mts'), 'utf8');
	// Bornes VÉRIFIÉES : un repère absent rendait `indexOf` négatif et le bloc
	// s'étendait jusqu'à la fin du fichier — le contrôle passait alors sur le
	// code d'un tout autre geste (`private addPart(` n'existe pas : la méthode
	// est publique).
	const corps = (debut, fin) => {
		const i = src.indexOf(debut);
		const j = src.indexOf(fin);
		if (i < 0 || j <= i) return '';
		return src.slice(i, j);
	};
	for (const [nom, debut, fin] of [
		['composant déplacé', 'private startDrag(', '// --- Platine d\'essai'],
		['coude de fil tiré', 'private dragHandle(', 'private alignToNeighbours('],
		['extrémité de fil rebranchée', 'private dragEndpoint(', 'private nearestPin('],
		['boîte de sélection', 'private startMarquee(', 'private partsInRect('],
	]) {
		const bloc = corps(debut, fin);
		const branche = bloc.length > 0 && /beginAutoPan/.test(bloc) && /auto\.track\(/.test(bloc) && /auto\.stop\(\)/.test(bloc);
		check(nom + ' : défilement branché et arrêté à la fin du geste', branche,
			branche ? '' : bloc.length === 0 ? 'bloc introuvable' : 'beginAutoPan/track/stop incomplet');
	}
	// L'exception voulue par Frank : la pose depuis la BIBLIOTHÈQUE ne défile
	// pas. Le geste part de la palette, donc du bord gauche : la bande sensible
	// s'amorcerait à l'appui et la vue filerait avant tout choix de place.
	{
		const bloc = corps('private startPlaceFromPalette(', 'private plugPlacedPart(');
		const propre = bloc.length > 0 && !/beginAutoPan/.test(bloc) && !/auto\.track\(/.test(bloc);
		check('pose depuis la palette : AUCUN défilement (demande de Frank)', propre,
			propre ? '' : bloc.length === 0 ? 'bloc introuvable' : 'il reste un beginAutoPan/track');
	}
	check('câblage en cours : défilement lancé à la broche et coupé avec le fil',
		/this\.pendingAutoPan = this\.beginAutoPan/.test(src) &&
		/this\.pendingAutoPan\?\.track\(e\)/.test(src) &&
		/private cancelPending\(\): void \{[\s\S]{0,240}?this\.pendingAutoPan\?\.stop\(\)/.test(src));
	check('composant déplacé : le pointeur est CAPTURÉ (relâché hors fenêtre)',
		/private capturePointer\(e: PointerEvent\)/.test(src) &&
		/const release = this\.capturePointer\(e\)/.test(src));
	check('composant déplacé : le défilement de la vue est COMPENSÉ',
		/const startPanX = this\.panX/.test(src) &&
		/\(dx - \(this\.panX - startPanX\)\) \/ this\.zoom/.test(src));
}

// --- 3. Le vrai éditeur (Chrome headless) -----------------------------------
console.log('Éditeur réel (Chrome headless) :');
{
	const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/led-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const pmove = (x, y, buttons = 1) =>
	window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, buttons }));
const pup = () => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));

async function run() {
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const led = editor.addPart('led', 300, 300);
	const led2 = editor.addPart('led', 500, 300);
	await wait(80);
	const vue = canvas.getBoundingClientRect();
	// La caméra démarre au centre de la feuille (2000, 1500) : on ramène les deux
	// composants DANS la vue, sinon le curseur d'appui serait déjà hors champ.
	const centre = editor.canvasPoint(vue.left + vue.width / 2, vue.top + vue.height / 2);
	editor.centerPartOn(led.id, { x: centre.x - 90, y: centre.y });
	editor.centerPartOn(led2.id, { x: centre.x + 90, y: centre.y });
	editor.redrawWires();
	await wait(30);
	const body = editor.elementOf(led.id).parentElement;

	// --- Composant tenu, curseur emmené au bord droit ------------------------
	const depart = body.getBoundingClientRect();
	const x0 = depart.left + depart.width / 2;
	const y0 = depart.top + depart.height / 2;
	body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: x0, clientY: y0 }));
	pmove(x0 + 20, y0);            // franchit le seuil de glissé
	const panRepos = editor.getCamera().panX;
	await wait(120);
	ok('composant tenu au MILIEU : la vue ne bouge pas',
		Math.abs(editor.getCamera().panX - panRepos) < 0.01,
		'panX ' + panRepos.toFixed(1) + ' → ' + editor.getCamera().panX.toFixed(1));

	// Au bord (dans la bande) : la vue doit filer vers la droite.
	const bordX = vue.right - 6;
	pmove(bordX, y0);
	const avantPan = editor.getCamera().panX;
	const avantEcran = body.getBoundingClientRect().left;
	const avantMonde = led.x;
	await wait(200);
	const apresPan = editor.getCamera().panX;
	const apresEcran = body.getBoundingClientRect().left;
	ok('composant tenu au BORD : la vue défile pour découvrir la suite',
		apresPan < avantPan - 40, 'panX ' + avantPan.toFixed(1) + ' → ' + apresPan.toFixed(1));
	ok('le composant reste SOUS le curseur pendant que la vue file',
		Math.abs(apresEcran - avantEcran) <= 6,
		'écran ' + avantEcran.toFixed(1) + ' → ' + apresEcran.toFixed(1) +
		' (vue déplacée de ' + (apresPan - avantPan).toFixed(0) + ' px)');
	ok('le composant AVANCE d’autant dans le monde',
		Math.abs((led.x - avantMonde) - (avantPan - apresPan)) <= 6,
		'monde +' + (led.x - avantMonde).toFixed(0) + ' pour ' + (avantPan - apresPan).toFixed(0) + ' px de vue');
	// Curseur ramené au centre : le défilement doit cesser.
	pmove(x0, y0);
	const calme = editor.getCamera().panX;
	await wait(120);
	ok('curseur ramené au centre : le défilement cesse',
		Math.abs(editor.getCamera().panX - calme) < 0.01,
		'panX ' + calme.toFixed(1) + ' → ' + editor.getCamera().panX.toFixed(1));
	pup();
	await wait(30);
	const apresLache = editor.getCamera().panX;
	pmove(vue.right - 6, y0, 0);
	await wait(150);
	ok('geste terminé : plus aucun défilement, même curseur au bord',
		Math.abs(editor.getCamera().panX - apresLache) < 0.01,
		'panX ' + apresLache.toFixed(1) + ' → ' + editor.getCamera().panX.toFixed(1));

	// --- Fil en cours de câblage --------------------------------------------
	const dot = editor.rendered.get(led2.id).hotspots.get('A');
	const d = dot.getBoundingClientRect();
	dot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1,
		clientX: d.left + d.width / 2, clientY: d.top + d.height / 2 }));
	pup(); // relâché sur la broche : câblage clic-à-clic, aucun bouton tenu
	await wait(20);
	const filPanAvant = editor.getCamera().panX;
	// Bouton relâché mais curseur DANS la bande : le fil doit entraîner la vue.
	pmove(vue.right - 6, y0, 0);
	await wait(200);
	const filPanApres = editor.getCamera().panX;
	ok('fil en cours : le curseur au bord entraîne la vue (sans bouton tenu)',
		filPanApres < filPanAvant - 40,
		'panX ' + filPanAvant.toFixed(1) + ' → ' + filPanApres.toFixed(1));
	const bout = editor.canvasPoint(vue.right - 6, y0);
	const trace = document.querySelector('path.wire--temp')?.getAttribute('d') || '';
	const dernier = trace.trim().split(/[ ,LM]+/).filter((s) => s.length).slice(-2).map(Number);
	ok('fil en cours : le tracé rejoint le curseur dans le monde défilé',
		Math.abs(dernier[0] - bout.x) <= 2 && Math.abs(dernier[1] - bout.y) <= 2,
		'tracé ' + dernier.join(',') + ' pour ' + bout.x.toFixed(0) + ',' + bout.y.toFixed(0));
	// Curseur HORS de la vue et rien tenu (on va cliquer un bouton de la barre) :
	// le plan de travail ne doit pas fuir.
	pmove(vue.right + 60, y0, 0);
	const dehorsAvant = editor.getCamera().panX;
	await wait(200);
	ok('fil en cours : hors de la vue et rien tenu, la vue reste en place',
		Math.abs(editor.getCamera().panX - dehorsAvant) < 0.01,
		'panX ' + dehorsAvant.toFixed(1) + ' → ' + editor.getCamera().panX.toFixed(1));
	// Fil posé : plus rien ne défile.
	const dot3 = editor.rendered.get(led.id).hotspots.get('C');
	dot3.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
	await wait(20);
	const finPan = editor.getCamera().panX;
	pmove(vue.right - 6, y0, 0);
	await wait(150);
	ok('fil posé : le défilement est coupé',
		Math.abs(editor.getCamera().panX - finPan) < 0.01 && !document.querySelector('path.wire--temp'),
		'panX ' + finPan.toFixed(1) + ' → ' + editor.getCamera().panX.toFixed(1));

	// --- Extrémité de fil rebranchée (demande de Frank) ----------------------
	// Le fil qui vient d'être posé relie les deux LED : on saisit sa poignée
	// d'extrémité et on l'emmène au bord. La vue doit suivre, comme pour un
	// coude — sinon rebrancher sur une broche hors écran oblige à lâcher.
	{
		const fil = editor.diagram.wires[editor.diagram.wires.length - 1];
		editor.select({ kind: 'wire', id: fil.id });
		await wait(40);
		const poignee = document.querySelectorAll('.wire-endpoint')[0];
		ok('extrémité de fil : la poignée existe', !!poignee);
		if (poignee) {
			const p = poignee.getBoundingClientRect();
			poignee.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1,
				clientX: p.left + p.width / 2, clientY: p.top + p.height / 2 }));
			pmove(vue.right - 6, y0);
			const boutAvant = editor.getCamera().panX;
			await wait(200);
			const boutApres = editor.getCamera().panX;
			ok('extrémité de fil tirée au BORD : la vue défile',
				boutApres < boutAvant - 40,
				'panX ' + boutAvant.toFixed(1) + ' → ' + boutApres.toFixed(1));
			pup();
			await wait(30);
			const boutLache = editor.getCamera().panX;
			pmove(vue.right - 6, y0, 0);
			await wait(150);
			ok('extrémité relâchée : le défilement est coupé',
				Math.abs(editor.getCamera().panX - boutLache) < 0.01,
				'panX ' + boutLache.toFixed(1) + ' → ' + editor.getCamera().panX.toFixed(1));
		}
	}

	// --- Pose depuis la BIBLIOTHÈQUE : surtout pas de défilement -------------
	// Le geste part de la palette, au bord gauche de la vue : la bande sensible
	// s'amorcerait dès l'appui et le plan de travail fuirait tout seul.
	{
		const paletteX = vue.left + 4;
		editor.startPlaceFromPalette(
			new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: paletteX, clientY: y0 }),
			'led');
		await wait(30);
		const posePan = editor.getCamera().panX;
		pmove(paletteX, y0);          // toujours sur la palette : le pire cas
		await wait(200);
		ok('pose depuis la bibliothèque : la vue ne bouge pas au bord GAUCHE',
			Math.abs(editor.getCamera().panX - posePan) < 0.01,
			'panX ' + posePan.toFixed(1) + ' → ' + editor.getCamera().panX.toFixed(1));
		pmove(vue.right - 6, y0);     // et pas davantage au bord droit
		await wait(200);
		ok('pose depuis la bibliothèque : la vue ne bouge pas au bord DROIT',
			Math.abs(editor.getCamera().panX - posePan) < 0.01,
			'panX ' + posePan.toFixed(1) + ' → ' + editor.getCamera().panX.toFixed(1));
		pup();
		await wait(30);
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
	writeFileSync(join(CACHE, 'e.mjs'), entry);
	const b = await esbuild.build({
		entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
		loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
	});
	const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
	writeFileSync(join(CACHE, 'p.html'),
		`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
		`<div class="workshop"><aside id="palette" class="palette"></aside>` +
		`<div id="canvas" class="canvas" style="width:800px;height:600px"><svg id="wires" class="wires"></svg></div>` +
		`<aside id="inspector" class="inspector"></aside></div>` +
		`<script>${b.outputFiles[0].text}</script></body>`);
	const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
	if (!chrome) {
		console.log('  – Chrome introuvable, défilement non mesuré');
	} else {
		const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
			'--window-size=1400,1000', '--virtual-time-budget=20000', '--dump-dom',
			`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
		if (!m) check('mesures relevées', false, 'aucune mesure dans le DOM');
		else for (const r of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))) {
			check(r.name, r.ok, r.detail);
		}
	}
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
