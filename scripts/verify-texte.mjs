// Test de régression : les ÉTIQUETTES DE TEXTE LIBRES (v2026.9.2.65).
// Demande de Frank : « Ajoute un générateur d'étiquette. Juste du texte
// déplaçable comme un composant. Plusieurs lignes possible. La zone s'étend en
// fonction du texte. […] Un clic sur l'icône la passe en mode appuyé, on peut
// mettre du texte où on veut. On quitte le mode texte en recliquant sur l'icône
// ou en cliquant sur n'importe quoi d'autre […] Si le mode texte est activé, on
// peut éditer le texte. On peut aussi le copier ou coller du texte. »
//
// Ce qui est vérifié dans le VRAI éditeur (bundle esbuild, Chrome headless) :
//   1. le mode texte s'active/se quitte, et un clic sur le fond pose une
//      étiquette éditable au lieu d'ouvrir un rectangle de sélection ;
//   2. la zone s'étend avec le texte, en largeur ET en hauteur (multi-lignes) ;
//   3. l'étiquette se déplace comme un composant, et s'aligne sur la grille ;
//   4. hors mode texte, un clic la sélectionne SANS ouvrir la saisie ;
//   5. le mode se quitte au clic ailleurs (un composant) et à la perte de focus ;
//   6. couleurs et police posées par Frank (#100ae5 sur #ffe10067, taille du
//      bandeau de nom), et l'étiquette est au PREMIER PLAN (au-dessus des fils) ;
//   7. enregistrement/rechargement : le texte et sa position survivent, et un
//      schéma SANS étiquette ne grave pas le champ ;
//   8. suppression : Suppr sur l'étiquette sélectionnée, et une étiquette vidée
//      de son texte disparaît d'elle-même ;
//   9. la simulation (setLocked) quitte le mode texte et fige les étiquettes ;
//  10. l'export SVG emporte le texte, au premier plan.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-texte');

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
	const world = document.querySelector('.canvas__world');
	editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
	await wait(40);

	const notes = () => [...document.querySelectorAll('.text-note')];
	const corps = (n) => n.querySelector('.text-note__body');
	// Point ÉCRAN d'une coordonnée monde (zoom 1, pan connu) : le clic de pose
	// doit tomber sur le fond de la feuille, jamais sur un composant.
	const ecran = (wx, wy) => {
		const wr = world.getBoundingClientRect();
		const z = editor.getCamera().zoom;
		return { x: wr.left + wx * z, y: wr.top + wy * z };
	};
	// Clic sur le FOND : la cible doit être le canvas lui-même (c'est ce que
	// teste le gestionnaire de l'éditeur), donc on émet depuis lui.
	const clicFond = (wx, wy) => {
		const p = ecran(wx, wy);
		canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
			button: 0, clientX: p.x, clientY: p.y }));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: p.x, clientY: p.y }));
	};
	// Saisie dans l'étiquette en édition : on écrit dans le contenteditable puis
	// on émet 'input', comme le fait un vrai clavier.
	const tape = (n, texte) => {
		const b = corps(n);
		b.textContent = '';
		for (const [i, ligne] of texte.split('\\n').entries()) {
			if (i > 0) b.appendChild(document.createElement('br'));
			b.appendChild(document.createTextNode(ligne));
		}
		b.dispatchEvent(new InputEvent('input', { bubbles: true }));
	};
	const contOf = (id) => [...document.querySelectorAll('.part')]
		.find((c) => (c.querySelector('.part__id')?.textContent ?? '') === id);

	// --- 1. Le mode texte s'active, et le clic sur le fond pose une étiquette ---
	ok('au démarrage, le mode texte est éteint', editor.isTextMode() === false);
	let vus = [];
	editor.onTextModeChange = (on) => vus.push(on);
	ok('le bouton allume le mode texte', editor.toggleTextMode() === true && editor.isTextMode());
	ok('le changement est signalé au bouton de la barre (état enfoncé)',
		vus.length === 1 && vus[0] === true, JSON.stringify(vus));
	ok('la feuille annonce le mode par sa classe', canvas.classList.contains('canvas--text-mode'));

	ok('avant tout clic, aucune étiquette', notes().length === 0, notes().length);
	clicFond(300, 200);
	await wait(40);
	ok('un clic sur le fond POSE une étiquette', notes().length === 1, notes().length);
	ok('et aucun rectangle de sélection ne s est ouvert',
		document.querySelectorAll('.marquee').length === 0);
	let n1 = notes()[0];
	ok('elle est posée là où l on a cliqué (grille de 10 px)',
		n1.style.left === '300px' && n1.style.top === '200px',
		n1.style.left + ',' + n1.style.top);
	ok('sa saisie est ouverte tout de suite', corps(n1).contentEditable === 'true',
		corps(n1).contentEditable);
	ok('et elle est marquée comme en cours d édition', n1.classList.contains('text-note--editing'));

	// --- 2. La zone s'étend avec le texte ---------------------------------------
	const vide = n1.getBoundingClientRect();
	tape(n1, 'Alimentation 5 V');
	await wait(30);
	const court = n1.getBoundingClientRect();
	ok('la zone s élargit avec le texte', court.width > vide.width + 20,
		vide.width.toFixed(1) + ' -> ' + court.width.toFixed(1));
	tape(n1, 'Alimentation 5 V regulee, tres longue etiquette de test');
	await wait(30);
	const long = n1.getBoundingClientRect();
	ok('un texte plus long donne une zone plus large', long.width > court.width + 40,
		court.width.toFixed(1) + ' -> ' + long.width.toFixed(1));
	tape(n1, 'Ligne une\\nLigne deux\\nLigne trois');
	await wait(30);
	const multi = n1.getBoundingClientRect();
	ok('plusieurs lignes : la zone grandit en HAUTEUR', multi.height > vide.height * 2.2,
		vide.height.toFixed(1) + ' -> ' + multi.height.toFixed(1) + ' pour 3 lignes');

	// Validation : on ferme la saisie, le modèle doit porter les trois lignes.
	corps(n1).dispatchEvent(new FocusEvent('blur'));
	await wait(30);
	const modele = editor.diagram.texts;
	ok('le texte saisi est repris dans le schéma', modele.length === 1
		&& modele[0].text.split('\\n').length === 3, JSON.stringify(modele));
	ok('les sauts de ligne sont conservés tels quels',
		modele[0].text === 'Ligne une\\nLigne deux\\nLigne trois', JSON.stringify(modele[0].text));
	ok('et la saisie est refermée', corps(n1).contentEditable !== 'true');

	// --- 3. Déplacement comme un composant --------------------------------------
	const glisseNote = async (n, sdx, sdy) => {
		const b = n.getBoundingClientRect();
		const x0 = b.left + 5;
		const y0 = b.top + 5;
		n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
			button: 0, clientX: x0, clientY: y0 }));
		for (const k of [0.1, 0.5, 1]) {
			window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true,
				clientX: x0 + sdx * k, clientY: y0 + sdy * k }));
			await wait(12);
		}
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
		await wait(25);
	};
	await glisseNote(n1, 137, 84);
	const apres = editor.diagram.texts[0];
	ok('l étiquette se déplace comme un composant', apres.x > 400 && apres.y > 260,
		apres.x + ',' + apres.y);
	ok('et elle se recolle sur la grille de 10 px', apres.x % 10 === 0 && apres.y % 10 === 0,
		apres.x + ',' + apres.y);
	ok('le DOM suit le modèle', n1.style.left === apres.x + 'px' && n1.style.top === apres.y + 'px',
		n1.style.left + ',' + n1.style.top);

	// --- 4. Hors mode texte, un clic sélectionne sans ouvrir la saisie ----------
	editor.toggleTextMode(false);
	await wait(20);
	ok('recliquer l icône éteint le mode', editor.isTextMode() === false);
	const b4 = n1.getBoundingClientRect();
	n1.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
		button: 0, clientX: b4.left + 5, clientY: b4.top + 5 }));
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	await wait(30);
	ok('hors mode texte, le clic SÉLECTIONNE l étiquette',
		n1.classList.contains('text-note--selected'));
	ok('mais n ouvre PAS la saisie', corps(n1).contentEditable !== 'true',
		corps(n1).contentEditable);
	// Le clic sur le fond hors mode texte ne pose plus rien.
	clicFond(900, 700);
	await wait(30);
	ok('hors mode texte, un clic sur le fond ne pose aucune étiquette',
		notes().length === 1, notes().length);

	// --- 4 bis. Le double-clic ouvre la saisie ET allume le mode texte ----------
	// (v71) Retoucher une annotation ne doit plus passer par la barre d'outils :
	// le geste attendu sur du texte est le double-clic, et le bouton T suit.
	// (v72) Le geste est rejoué comme le navigateur l'émet VRAIMENT : deux
	// pointerdown dont le second porte detail 2. L'ancien banc envoyait un
	// dblclick synthétique isolé — événement que le vrai enchaînement ne
	// produit JAMAIS ici (le premier clic appelle preventDefault() et capture
	// le pointeur), d'où un banc vert sur une fonction qui ne marchait pas.
	const doubleClic = (n, detail2 = 2) => {
		const b = n.getBoundingClientRect();
		const pos = { clientX: b.left + 5, clientY: b.top + 5 };
		n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
			button: 0, detail: 1, ...pos }));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
		n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
			button: 0, detail: detail2, ...pos }));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	};
	vus.length = 0;
	ok('avant le double-clic, le mode texte est bien éteint', editor.isTextMode() === false);
	doubleClic(n1);
	await wait(30);
	ok('un double-clic sur une étiquette ouvre sa saisie',
		corps(n1).contentEditable === 'true', corps(n1).contentEditable);
	ok('et il allume le mode texte', editor.isTextMode() === true);
	ok('le bouton T en est prévenu (une seule bascule, vers allumé)',
		vus.length === 1 && vus[0] === true, JSON.stringify(vus));
	// Re-double-cliquer dans une saisie déjà ouverte ne doit rien rejouer.
	vus.length = 0;
	doubleClic(n1);
	await wait(20);
	ok('re-double-cliquer dans une saisie ouverte ne rebascule rien',
		vus.length === 0 && corps(n1).contentEditable === 'true', JSON.stringify(vus));
	corps(n1).blur();
	editor.toggleTextMode(false);
	await wait(20);
	// Un clic SIMPLE ne doit surtout pas ouvrir la saisie (il sélectionne).
	vus.length = 0;
	doubleClic(n1, 1); // deux clics « séparés » : detail reste à 1
	await wait(20);
	ok('deux clics SÉPARÉS (detail 1) n ouvrent pas la saisie',
		corps(n1).contentEditable !== 'true' && editor.isTextMode() === false,
		corps(n1).contentEditable + '/' + editor.isTextMode());
	// En simulation, rien n'est éditable : le double-clic ne doit pas rouvrir.
	editor.setLocked?.(true);
	vus.length = 0;
	doubleClic(n1);
	await wait(20);
	ok('en simulation, le double-clic n ouvre RIEN',
		corps(n1).contentEditable !== 'true' && editor.isTextMode() === false,
		corps(n1).contentEditable + '/' + editor.isTextMode());
	editor.setLocked?.(false);
	await wait(20);

	// --- 5. On quitte le mode texte en cliquant AILLEURS -------------------------
	const led = editor.addPart('led', 800, 500);
	await wait(120);
	editor.toggleTextMode(true);
	ok('mode texte rallumé', editor.isTextMode());
	const corpsLed = contOf(led.id).querySelector('.part__body');
	const bl = corpsLed.getBoundingClientRect();
	corpsLed.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
		button: 0, clientX: bl.left + 4, clientY: bl.top + 4 }));
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	await wait(30);
	ok('cliquer un COMPOSANT quitte le mode texte', editor.isTextMode() === false);
	editor.toggleTextMode(true);
	document.getElementById('inspector').dispatchEvent(new PointerEvent('pointerdown',
		{ bubbles: true, composed: true, button: 0, clientX: 5, clientY: 5 }));
	await wait(20);
	ok('cliquer l inspecteur quitte le mode texte', editor.isTextMode() === false);
	editor.toggleTextMode(true);
	window.dispatchEvent(new FocusEvent('blur'));
	await wait(20);
	ok('la perte de focus de Kablix quitte le mode texte', editor.isTextMode() === false);
	// Échap aussi (comme pour le câblage en cours).
	editor.toggleTextMode(true);
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await wait(20);
	ok('Échap quitte le mode texte', editor.isTextMode() === false);

	// --- 6. Aspect : couleurs, police, premier plan ------------------------------
	const cs = getComputedStyle(corps(n1));
	const csN = getComputedStyle(n1);
	ok('encre bleue #100ae5, comme demandé', cs.color === 'rgb(16, 10, 229)', cs.color);
	ok('fond jaune translucide #ffe10067', /^rgba\\(255, ?225, ?0, ?0\\.4/.test(csN.backgroundColor),
		csN.backgroundColor);
	ok('aucune bordure autour de la zone', csN.borderStyle === 'none' || csN.borderTopWidth === '0px',
		csN.borderStyle + ' ' + csN.borderTopWidth);
	ok('coins arrondis', parseFloat(csN.borderTopLeftRadius) > 0, csN.borderTopLeftRadius);
	// Même police et même taille que le bandeau de nom des composants.
	const head = contOf(led.id).querySelector('.part__head');
	const csH = getComputedStyle(head);
	ok('même taille de police que le bandeau de nom des composants',
		cs.fontSize === csH.fontSize, cs.fontSize + ' vs ' + csH.fontSize);
	ok('et la même police', cs.fontFamily === csH.fontFamily, cs.fontFamily);
	// Premier plan : la couche de texte doit passer au-dessus des fils (z=5) et
	// des composants (z=3), tout en restant sous les défauts (z=80).
	const zTexte = parseInt(getComputedStyle(document.querySelector('.text-layer')).zIndex, 10);
	const zFils = parseInt(getComputedStyle(document.getElementById('wires')).zIndex, 10) || 5;
	const zDefauts = parseInt(getComputedStyle(document.querySelector('.fault-layer')).zIndex, 10);
	ok('les étiquettes sont AU PREMIER PLAN (au-dessus des fils)', zTexte > zFils,
		'texte ' + zTexte + ' / fils ' + zFils);
	ok('mais sous les explications de défaut', zTexte < zDefauts,
		'texte ' + zTexte + ' / défauts ' + zDefauts);

	// --- 7. Enregistrement / rechargement ---------------------------------------
	const dump = editor.serialize();
	ok('le schéma enregistré porte l étiquette', dump.texts && dump.texts.length === 1,
		JSON.stringify(dump.texts));
	ok('avec son texte et sa position', dump.texts[0].text.includes('Ligne deux')
		&& dump.texts[0].x === apres.x, JSON.stringify(dump.texts[0]));
	editor.loadDiagram(dump);
	await wait(200);
	ok('après rechargement, l étiquette est toujours là', notes().length === 1, notes().length);
	ok('avec le MÊME texte', editor.diagram.texts[0].text === dump.texts[0].text,
		JSON.stringify(editor.diagram.texts[0]));
	ok('et à la même place', notes()[0].style.left === apres.x + 'px', notes()[0].style.left);
	// Un schéma sans aucune étiquette ne grave pas le champ (fichiers d'avant).
	editor.clear();
	await wait(40);
	const vierge = editor.serialize();
	ok('un schéma SANS étiquette ne grave pas le champ texts', !('texts' in vierge),
		JSON.stringify(Object.keys(vierge)));

	// --- 8. Suppression ----------------------------------------------------------
	editor.toggleTextMode(true);
	clicFond(200, 150);
	await wait(40);
	let n2 = notes()[0];
	tape(n2, 'A supprimer');
	corps(n2).dispatchEvent(new FocusEvent('blur'));
	await wait(30);
	ok('nouvelle étiquette enregistrée', editor.diagram.texts.length === 1);
	editor.toggleTextMode(false);
	const b8 = n2.getBoundingClientRect();
	n2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
		button: 0, clientX: b8.left + 5, clientY: b8.top + 5 }));
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	await wait(20);
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
	await wait(30);
	ok('Suppr efface l étiquette sélectionnée', editor.diagram.texts.length === 0
		&& notes().length === 0, editor.diagram.texts.length + ' / ' + notes().length);
	// Étiquette VIDÉE de son texte : elle disparaît d'elle-même.
	editor.toggleTextMode(true);
	clicFond(250, 250);
	await wait(40);
	let n3 = notes()[0];
	tape(n3, 'Provisoire');
	corps(n3).dispatchEvent(new FocusEvent('blur'));
	await wait(30);
	ok('étiquette posée puis validée', editor.diagram.texts.length === 1);
	const b3 = n3.getBoundingClientRect();
	n3.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
		button: 0, clientX: b3.left + 5, clientY: b3.top + 5 }));
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	await wait(30);
	ok('en mode texte, le clic ROUVRE la saisie', corps(n3).contentEditable === 'true',
		corps(n3).contentEditable);
	tape(n3, '   ');
	corps(n3).dispatchEvent(new FocusEvent('blur'));
	await wait(30);
	ok('une étiquette vidée de son texte disparaît',
		editor.diagram.texts.length === 0 && notes().length === 0,
		editor.diagram.texts.length + ' / ' + notes().length);

	// --- 9. Simulation : mode quitté, étiquettes figées ---------------------------
	editor.toggleTextMode(true);
	clicFond(400, 400);
	await wait(40);
	const n4 = notes()[0];
	tape(n4, 'Etiquette de sim');
	corps(n4).dispatchEvent(new FocusEvent('blur'));
	await wait(30);
	editor.toggleTextMode(true);
	editor.setLocked(true);
	await wait(40);
	ok('le lancement de la simulation quitte le mode texte', editor.isTextMode() === false);
	ok('et il refuse de le rallumer', editor.toggleTextMode(true) === false && !editor.isTextMode());
	ok('l étiquette reste VISIBLE pendant la simulation', notes().length === 1
		&& getComputedStyle(notes()[0]).display !== 'none');
	ok('mais elle ne se touche plus', getComputedStyle(notes()[0]).pointerEvents === 'none',
		getComputedStyle(notes()[0]).pointerEvents);
	editor.setLocked(false);
	await wait(30);
	ok('après la simulation, le mode texte est de nouveau permis',
		editor.toggleTextMode(true) === true);
	editor.toggleTextMode(false);

	// --- 10. Export SVG ------------------------------------------------------------
	editor.addPart('resistor', 300, 300);
	await wait(120);
	const svg = editor.exportSvg();
	ok('l export SVG emporte le texte de l étiquette', svg.includes('Etiquette de sim'), '');
	ok('avec l encre de Frank', svg.includes('#100ae5'), '');
	// Premier plan : le bloc de l'étiquette vient APRÈS le dessin du composant.
	const iNote = svg.indexOf('Etiquette de sim');
	const iPart = svg.indexOf('<g transform') >= 0 ? svg.indexOf('<g transform') : svg.indexOf('<svg', 40);
	ok('et elle est dessinée au premier plan (après les composants)', iNote > iPart,
		'note à ' + iNote + ', composants à ' + iPart);

	// --- 11. COLLER du texte dans une étiquette (v2026.9.2.66) --------------------
	// Frank : « Impossible de coller du texte dans la zone. » Deux chemins mènent
	// au collage — l'événement 'paste' natif, et Ctrl+V lu depuis le
	// presse-papier système quand la webview a intercepté le raccourci. Les deux
	// doivent poser du TEXTE BRUT à la position du curseur.
	editor.toggleTextMode(true);
	clicFond(600, 500);
	await wait(40);
	const nP = notes()[0];
	tape(nP, 'Debut ');
	// Curseur EN FIN de texte, comme après une frappe.
	const finDe = (b) => {
		const r = document.createRange();
		r.selectNodeContents(b);
		r.collapse(false);
		const s = window.getSelection();
		s.removeAllRanges();
		s.addRange(r);
	};
	finDe(corps(nP));
	const dt = new DataTransfer();
	dt.setData('text/plain', 'colle');
	corps(nP).dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
	await wait(30);
	ok('un collage insère le texte à la position du curseur',
		corps(nP).innerText === 'Debut colle', JSON.stringify(corps(nP).innerText));
	// Collage de HTML : seul le texte brut doit entrer, aucune balise.
	const dt2 = new DataTransfer();
	dt2.setData('text/plain', ' brut');
	dt2.setData('text/html', '<b style="color:red"> brut</b>');
	corps(nP).dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt2 }));
	await wait(30);
	ok('et il n emporte AUCUNE balise du presse-papier',
		!corps(nP).innerHTML.includes('<b') && corps(nP).innerText === 'Debut colle brut',
		corps(nP).innerHTML.slice(0, 80));
	// Texte sur plusieurs lignes : les sauts de ligne survivent au collage.
	const dt3 = new DataTransfer();
	dt3.setData('text/plain', '\\nligne 2');
	corps(nP).dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt3 }));
	await wait(30);
	ok('un texte multi-lignes se colle sur plusieurs lignes',
		corps(nP).innerText.split('\\n').length === 2, JSON.stringify(corps(nP).innerText));
	corps(nP).dispatchEvent(new FocusEvent('blur'));
	await wait(30);
	ok('le texte collé est bien enregistré dans le modèle',
		editor.diagram.texts.some((n) => n.text.includes('Debut colle brut')),
		JSON.stringify(editor.diagram.texts.map((n) => n.text)));

	// Chemin Ctrl+V : la webview intercepte 'paste', l'éditeur lit alors le
	// presse-papier système lui-même. On le simule via onClipboardRead (le repli
	// que l'éditeur utilise quand navigator.clipboard est refusé).
	const nq = notes().find((n) => corps(n).innerText.startsWith('Debut'));
	editor.toggleTextMode(true);
	const bq = nq.getBoundingClientRect();
	nq.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true,
		button: 0, clientX: bq.left + 5, clientY: bq.top + 5 }));
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	await wait(40);
	corps(nq).focus();
	finDe(corps(nq));
	// En headless, navigator.clipboard.readText() peut répondre (vide) avant le
	// repli : on le neutralise pour tester le chemin de l'hôte, celui qui sert
	// réellement dans la webview VS Code.
	try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (e) { void e; }
	editor.onClipboardRead = async () => ' via Ctrl+V';
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
	await wait(120);
	ok('Ctrl+V colle aussi quand l événement paste n arrive pas',
		corps(nq).innerText.includes('via Ctrl+V'), JSON.stringify(corps(nq).innerText));
	ok('et le texte collé par Ctrl+V est enregistré',
		editor.diagram.texts.some((n) => n.text.includes('via Ctrl+V')),
		JSON.stringify(editor.diagram.texts.map((n) => n.text)));
	// Un SCHÉMA copié depuis Kablix n'est pas du texte d'étiquette : il ne doit
	// pas se déverser dans l'annotation.
	const avant = corps(nq).innerText;
	// Forme exacte du presse-papier Kablix : « TAG:{json} » (cf. clipboard.mts).
	editor.onClipboardRead = async () => 'KABLIX-CLIPBOARD-V1:' + JSON.stringify({
		kablix: 'KABLIX-CLIPBOARD-V1', parts: [{ id: 'R9', type: 'resistor', x: 10, y: 10 }], wires: [] });
	finDe(corps(nq));
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
	await wait(120);
	ok('un schéma copié ne se colle PAS dans une étiquette',
		corps(nq).innerText === avant, JSON.stringify(corps(nq).innerText));

	// --- 11 bis. Ctrl+C / Ctrl+X DANS l'étiquette en saisie -----------------------
	// Même cause que le Ctrl+V ci-dessus : l'événement 'copy' n'atteint pas le
	// contenteditable dans la webview VS Code, l'éditeur écrit donc lui-même au
	// presse-papier (ici capté par onClipboardWrite, navigator.clipboard ayant été
	// neutralisé plus haut).
	let ecrit = null;
	editor.onClipboardWrite = (t) => { ecrit = t; };
	corps(nq).focus();
	// Sans sélection : Ctrl+C rend TOUTE la ligne de l'étiquette.
	finDe(corps(nq));
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
	await wait(60);
	ok('Ctrl+C sans sélection copie tout le texte de l étiquette',
		ecrit !== null && ecrit === corps(nq).innerText.replace(/\\s+$/, ''), JSON.stringify(ecrit));
	// Avec sélection : seule la portion sélectionnée part.
	const tout = corps(nq).innerText;
	const selPartielle = () => {
		const n = corps(nq).firstChild;
		const r = document.createRange();
		r.setStart(n, 0);
		r.setEnd(n, 5);
		const s = window.getSelection();
		s.removeAllRanges();
		s.addRange(r);
	};
	ecrit = null;
	selPartielle();
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
	await wait(60);
	ok('Ctrl+C avec sélection ne copie QUE la portion sélectionnée',
		ecrit === tout.slice(0, 5), JSON.stringify(ecrit));
	ok('et Ctrl+C ne modifie pas le texte de l étiquette',
		corps(nq).innerText === tout, JSON.stringify(corps(nq).innerText));
	// Ctrl+X : la portion part au presse-papier ET disparaît de l'étiquette.
	ecrit = null;
	selPartielle();
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true }));
	await wait(60);
	ok('Ctrl+X copie la portion sélectionnée', ecrit === tout.slice(0, 5), JSON.stringify(ecrit));
	ok('et Ctrl+X l efface de l étiquette',
		corps(nq).innerText === tout.slice(5), JSON.stringify(corps(nq).innerText));
	ok('et le texte coupé est enregistré dans le modèle',
		editor.diagram.texts.some((n) => n.text === tout.slice(5).replace(/\\s+$/, '')),
		JSON.stringify(editor.diagram.texts.map((n) => n.text)));
	// Le texte est remis tel qu'il était : les sections suivantes retrouvent leur
	// étiquette « Debut… » par son contenu.
	corps(nq).textContent = tout;
	corps(nq).dispatchEvent(new Event('input', { bubbles: true }));
	await wait(30);

	corps(nq).dispatchEvent(new FocusEvent('blur'));
	editor.toggleTextMode(false);
	await wait(30);

	// --- 12. Propriétés : couleur, fond, transparence, taille, police -------------
	const idQ = editor.diagram.texts.find((n) => n.text.includes('Debut colle')).id;
	editor.select({ kind: 'text', id: idQ });
	await wait(40);
	const insp = document.getElementById('inspector');
	const listes = [...insp.querySelectorAll('select')];
	ok('l inspecteur d une étiquette offre les nuanciers encre et fond',
		insp.querySelectorAll('.inspector__swatches').length === 2,
		insp.querySelectorAll('.inspector__swatches').length);
	ok('un curseur de transparence du fond', !!insp.querySelector('input[type=range]'));
	ok('une liste de tailles et une liste de polices', listes.length === 2, listes.length);

	const noeud = notes().find((n) => corps(n).innerText.startsWith('Debut'));
	editor.setTextStyle(idQ, { color: '#c00000' });
	await wait(20);
	ok('la couleur du texte se change', getComputedStyle(corps(noeud)).color === 'rgb(192, 0, 0)',
		getComputedStyle(corps(noeud)).color);
	editor.setTextStyle(idQ, { bg: '#000000', bgAlpha: 100 });
	await wait(20);
	ok('la couleur du fond aussi', getComputedStyle(noeud).backgroundColor === 'rgb(0, 0, 0)',
		getComputedStyle(noeud).backgroundColor);
	editor.setTextStyle(idQ, { bgAlpha: 0 });
	await wait(20);
	ok('et la transparence du fond va jusqu à l invisible',
		/rgba\\(0, ?0, ?0, ?0\\)/.test(getComputedStyle(noeud).backgroundColor),
		getComputedStyle(noeud).backgroundColor);
	const tailleAvant = parseFloat(getComputedStyle(corps(noeud)).fontSize);
	editor.setTextStyle(idQ, { size: 24 });
	await wait(20);
	ok('la taille du texte se change', parseFloat(getComputedStyle(corps(noeud)).fontSize) === 24,
		getComputedStyle(corps(noeud)).fontSize);
	const policeAvant = getComputedStyle(corps(noeud)).fontFamily;
	editor.setTextStyle(idQ, { font: 'monospace' });
	await wait(20);
	ok('la police se change', getComputedStyle(corps(noeud)).fontFamily === 'monospace',
		getComputedStyle(corps(noeud)).fontFamily);
	// Valeur d'origine : le réglage effacé rend la main au CSS de l'atelier.
	editor.clearTextStyle(idQ, 'size');
	editor.clearTextStyle(idQ, 'font');
	await wait(20);
	ok('un réglage effacé revient à la valeur de l atelier',
		parseFloat(getComputedStyle(corps(noeud)).fontSize) === tailleAvant
		&& getComputedStyle(corps(noeud)).fontFamily === policeAvant,
		getComputedStyle(corps(noeud)).fontSize + ' / ' + getComputedStyle(corps(noeud)).fontFamily);
	// Une valeur aberrante venue d'un fichier est ignorée, pas gravée.
	editor.setTextStyle(idQ, { color: 'rouge', size: 999 });
	await wait(20);
	const noteQ = editor.diagram.texts.find((n) => n.id === idQ);
	ok('une valeur de style invalide est refusée',
		noteQ.color === '#c00000' && noteQ.size === undefined,
		noteQ.color + ' / ' + noteQ.size);

	// Enregistrement : le style suit l'étiquette dans le fichier.
	editor.setTextStyle(idQ, { size: 20, font: 'serif' });
	await wait(20);
	const dumpS = editor.serialize();
	const noteS = dumpS.texts.find((n) => n.text.includes('Debut colle'));
	ok('le style part dans le fichier', noteS.color === '#c00000' && noteS.bg === '#000000'
		&& noteS.bgAlpha === 0 && noteS.size === 20 && noteS.font === 'serif',
		JSON.stringify(noteS));
	editor.loadDiagram(JSON.parse(JSON.stringify(dumpS)));
	await wait(120);
	const relu = editor.diagram.texts.find((n) => n.text.includes('Debut colle'));
	ok('et il revient au rechargement', relu.color === '#c00000' && relu.bgAlpha === 0
		&& relu.size === 20 && relu.font === 'serif', JSON.stringify(relu));
	const noeudR = notes().find((n) => corps(n).innerText.startsWith('Debut'));
	ok('avec le rendu qui va avec', parseFloat(getComputedStyle(corps(noeudR)).fontSize) === 20
		&& getComputedStyle(corps(noeudR)).color === 'rgb(192, 0, 0)',
		getComputedStyle(corps(noeudR)).fontSize + ' / ' + getComputedStyle(corps(noeudR)).color);
	// L'export SVG rend les MÊMES réglages que l'écran.
	const svg2 = editor.exportSvg();
	ok('l export SVG emporte les réglages de l étiquette',
		svg2.includes('#c00000') && svg2.includes('font-size="20"') && svg2.includes('serif'),
		svg2.slice(svg2.indexOf('Debut colle') - 200, svg2.indexOf('Debut colle')).slice(-160));

	// --- 13. Le curseur du mode texte porte un T ---------------------------------
	editor.toggleTextMode(true);
	await wait(20);
	const curseur = getComputedStyle(canvas).cursor;
	ok('en mode texte, le curseur est une flèche marquée d un T',
		curseur.includes('url(') && curseur.includes('svg'), curseur.slice(0, 60));
	editor.toggleTextMode(false);

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
console.log(fail ? `texte : ${fail} échec(s).` : `texte : ${rows.length} contrôles OK — étiquettes de texte libres.`);
process.exit(fail ? 1 : 0);
