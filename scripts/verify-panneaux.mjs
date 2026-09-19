// Test de régression : les panneaux latéraux de l'atelier se REPLIENT
// (v2026.9.4.89) — bibliothèque à gauche, Propriétés/Variables à droite.
//
// Pourquoi une VRAIE souris ici : replier est un GESTE, le clic sur le chevron.
// Ce chevron est voisin immédiat du splitter, l'élément qui écoute `pointerdown`
// pour redimensionner la colonne. Un événement fabriqué (`new PointerEvent(...)`)
// aurait « marché » même si le clic partait en glissement de largeur au lieu de
// replier — c'est exactement le piège déjà payé deux fois sur le double-clic des
// étiquettes (v.71, v.72). Chrome est donc piloté en CDP brut : ce sont ses
// propres événements qui traversent la page.
//
// v2026.9.4.101 : le chevron a DÉMÉNAGÉ du splitter vers le panneau lui-même
// (`.panel__fold`), et le contenu défilant est passé dans une enveloppe
// `.panel__scroll` pour que l'ascenseur soit raccourci en haut et en bas.
//
// L'atelier monté est le VRAI : le HTML de webview-html.ts, la feuille
// media/styles.css et le module sim.mts, avec un faux pont VS Code. Sans le vrai
// CSS, la bande repliée n'aurait aucune largeur mesurable et le banc ne
// prouverait rien de ce que l'élève voit.
//
// Ce qui est vérifié :
//   1. les deux panneaux démarrent DÉPLOYÉS, chevron présent dans chaque splitter ;
//   2. un vrai clic sur le chevron gauche replie la bibliothèque en bande étroite,
//      son contenu est masqué et son nom s'écrit à la verticale ;
//   3. un second clic la rouvre à sa largeur d'avant ;
//   4. le même geste marche à droite, et il est INDÉPENDANT du panneau gauche ;
//   5. le repli est PERSISTÉ (message saveUiState) et restauré par `uiState` ;
//   6. un panneau replié ne se redimensionne PLUS au glissement (le chevron ne
//      doit pas non plus démarrer un glissement) ;
//   7. la simulation replie la bibliothèque et l'arrêt la rouvre (réglage
//      `foldLibraryOnRun`), mais elle laisse tranquille une bibliothèque que
//      l'élève avait repliée lui-même ;
//   8. réglage à faux : la simulation ne replie plus rien ;
//   9. en simulation, la bande de droite nomme « Variables » et non « Properties »
//      — c'est le panneau des variables qui y prend la place des propriétés ;
//  10. l'ascenseur du panneau est RACCOURCI symétriquement en haut et en bas : il
//      ne touche ni le bord haut ni le bord bas du panneau (arrondis préservés) ;
//  11. le chevron déployé n'EMPIÈTE ni sur l'ascenseur ni sur le texte du panneau ;
//  12. replié, le nom vertical est CENTRÉ horizontalement dans la bande, le
//      chevron au-dessus de lui.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-panneaux');
const PORT = 9413; // port propre à ce banc : la suite enchaîne les bancs CDP
mkdirSync(CACHE, { recursive: true });

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
/**
 * Un contrôle. `cond` peut être une FONCTION : elle est alors appelée sous
 * protection, et une exception vaut ÉCHEC, pas mort du banc. Sans cela, une
 * mesure absente (un élément que le code remisé ne crée pas) lève au premier
 * contrôle et le banc s'arrête AVANT d'afficher les échecs suivants — le piège
 * exact payé au lot .100, où un `grep ❌` comptait zéro sur un banc mort.
 */
const ok = (nom, cond, detail = '') => {
	let val = cond;
	if (typeof cond === 'function') {
		try { val = cond(); }
		catch (e) { val = false; detail = `mesure impossible : ${e.message}`; }
	}
	checks.push({ nom, ok: !!val, detail: String(detail) });
	console.log(`${val ? '✅' : '❌'} ${nom}${val ? '' : ` — ${detail}`}`);
};

// --- Le vrai HTML de l'atelier, avec un faux module `vscode` ------------------
const fauxVscode = {
	name: 'faux-vscode',
	setup(build) {
		build.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'faux' }));
		build.onLoad({ filter: /.*/, namespace: 'faux' }, () => ({
			contents: [
				'export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_, i) => a[i]) };',
				'export const Uri = { joinPath: (...p) => p.join("/") };',
				'export const workspace = { getConfiguration: () => ({ get: () => undefined }) };',
				'export const env = { language: "en" };',
				'export const extensions = { getExtension: () => ({ packageJSON: {} }) };',
			].join('\n'),
			loader: 'js',
		}));
	},
};
const htmlBundle = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview-html.ts')],
	bundle: true, format: 'esm', write: false, platform: 'node',
	external: ['node:crypto'], plugins: [fauxVscode], absWorkingDir: ROOT,
});
writeFileSync(join(CACHE, 'html.mjs'), htmlBundle.outputFiles[0].text);
const { buildWebviewHtml } = await import(
	'file:///' + join(CACHE, 'html.mjs').split(String.fromCharCode(92)).join('/'));
let html = buildWebviewHtml({ asWebviewUri: (u) => String(u), cspSource: 'file:' }, 'media');

// Le pont VS Code : il note les messages postés (c'est là qu'on lit la
// persistance du repli) et ne rend AUCUN état (atelier neuf).
const pont = `
window.__msgs = [];
window.__err = [];
window.addEventListener('error', (e) => window.__err.push('ERR ' + e.message));
window.acquireVsCodeApi = () => ({
	postMessage: (m) => window.__msgs.push(m),
	getState: () => undefined,
	setState: () => {},
});
`;

const b = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview', 'sim.mts')],
	bundle: true, format: 'iife', write: false,
	define: { __BUILD_NUMBER__: JSON.stringify('test') },
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl', '.gif': 'dataurl', '.mp4': 'dataurl', '.ico': 'dataurl' },
	absWorkingDir: ROOT,
});
writeFileSync(join(CACHE, 'pont.js'), pont);
writeFileSync(join(CACHE, 'bundle.js'), b.outputFiles[0].text);
html = html.replace(/<script[^>]*src="[^"]*webview\.js"[^>]*>[\s\S]*?<\/script>/,
	'<script src="pont.js"></scr' + 'ipt><script src="bundle.js"></scr' + 'ipt>');
html = html.replace(/<link[^>]*styles\.css[^>]*>/,
	`<style>${readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8')}</style>`);
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
writeFileSync(join(CACHE, 'p.html'), html);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }

const profil = join(CACHE, 'profil');
rmSync(profil, { recursive: true, force: true });
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--window-size=1400,1000',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { stdio: 'ignore' });

let ws = null;
try {
	let liste = null;
	for (let i = 0; i < 40 && !liste; i++) {
		try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
		catch { await attendre(250); }
	}
	if (!liste) throw new Error('Chrome ne répond pas sur le port de mise au point');
	const cible = liste.find((c) => c.type === 'page');
	ws = new WebSocket(cible.webSocketDebuggerUrl);
	let id = 0;
	const attentes = new Map();
	ws.addEventListener('message', (ev2) => {
		const m = JSON.parse(ev2.data);
		if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
	});
	await new Promise((r) => ws.addEventListener('open', r, { once: true }));
	const cdp = (method, params = {}) => new Promise((res) => {
		const n = ++id;
		attentes.set(n, res);
		ws.send(JSON.stringify({ id: n, method, params }));
	});
	const ev = async (expr) => {
		const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
		if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
		return r.result?.result?.value;
	};

	// L'atelier poste « ready » quand il est monté : on attend ce signal plutôt
	// qu'un délai au hasard.
	for (let i = 0; i < 60; i++) {
		if (await ev('(window.__msgs || []).some((m) => m && m.type === "ready")')) break;
		await attendre(200);
	}
	ok('l atelier démarre sans erreur et poste son « ready »',
		await ev('(window.__msgs || []).some((m) => m && m.type === "ready") && window.__err.length === 0'),
		await ev('JSON.stringify(window.__err)'));

	// Mesure commune aux deux côtés, injectée dans la page. Le chevron vit
	// désormais DANS le panneau : c'est lui qu'on interroge, pas le splitter.
	// `contenu` est le nombre d'enfants visibles AUTRES que le bouton de repli —
	// celui-ci reste affiché même replié (c'est par lui qu'on rouvre).
	const MESURE = `(p, s) => {
		const btn = p && p.querySelector(':scope > .panel__fold');
		const lab = btn && btn.querySelector('.panel__fold-label');
		const chev = btn && btn.querySelector('.panel__chevron');
		const scroll = p && p.querySelector(':scope > .panel__scroll');
		const enfants = p ? [...p.children].filter((c) => !c.hidden && c !== btn) : [];
		const visibles = enfants.filter((c) => getComputedStyle(c).display !== 'none').length;
		const bp = p ? p.getBoundingClientRect() : null;
		const bb = btn ? btn.getBoundingClientRect() : null;
		const bs = scroll ? scroll.getBoundingClientRect() : null;
		const bl = lab ? lab.getBoundingClientRect() : null;
		const bc = chev ? chev.getBoundingClientRect() : null;
		return {
			w: bp ? Math.round(bp.width) : -1,
			plie: p ? p.classList.contains('is-folded') : null,
			splitPlie: s ? s.classList.contains('splitter--folded') : null,
			visibles,
			bouton: !!btn,
			nomVertical: lab ? getComputedStyle(lab).writingMode.startsWith('vertical') : null,
			nom: lab ? lab.textContent.trim() : '',
			titre: btn ? btn.getAttribute('title') : '',
			// Géométrie, pour les contrôles d'ascenseur et de centrage.
			panneau: bp ? { x: bp.left, y: bp.top, w: bp.width, h: bp.height } : null,
			btnBox: bb ? { x: bb.left, y: bb.top, w: bb.width, h: bb.height } : null,
			scrollBox: bs ? { x: bs.left, y: bs.top, w: bs.width, h: bs.height } : null,
			labBox: bl ? { x: bl.left, y: bl.top, w: bl.width, h: bl.height } : null,
			chevBox: bc ? { x: bc.left, y: bc.top, w: bc.width, h: bc.height } : null,
			// Un ascenseur natif occupe la hauteur de son conteneur : la marge
			// haute et la marge basse de l'enveloppe le raccourcissent d'autant.
			margeHaut: bs && bp ? Math.round(bs.top - bp.top) : -1,
			margeBas: bs && bp ? Math.round(bp.bottom - bs.bottom) : -1,
			deborde: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : null,
			// Le panneau lui-même ne doit PAS défiler : sinon la barre reprendrait
			// toute la hauteur, arrondis compris.
			panneauDefile: p ? getComputedStyle(p).overflowY !== 'visible'
				&& p.scrollHeight > p.clientHeight + 1 : null,
		};
	}`;
	/** Mesure d'un panneau : largeur réelle, repli, contenu visible, nom vertical. */
	const mesurer = (sel, splitter) => ev(`JSON.stringify((${MESURE})(
		document.querySelector('${sel}'), document.querySelector('${splitter}')))`).then(JSON.parse);
	const gauche = () => mesurer('#palette', '#splitter-palette');
	/** À droite, le panneau visible est l'inspecteur, ou Variables en simulation. */
	const droite = () => ev(`(() => {
		const insp = document.getElementById('inspector');
		const dbg = document.getElementById('debug');
		const p = getComputedStyle(insp).display === 'none' ? dbg : insp;
		const m = (${MESURE})(p, document.querySelector('#splitter-inspector'));
		m.quel = p.id;
		// Un panneau caché ne doit PAS garder la classe de repli : il
		// reviendrait replié sans que le chevron le dise.
		m.autrePlie = (p === insp ? dbg : insp).classList.contains('is-folded');
		return JSON.stringify(m);
	})()`).then(JSON.parse);

	/** Coordonnées écran du centre du chevron d'un panneau (null s'il n'existe pas). */
	const centreChevron = async (panneau) => JSON.parse(await ev(`(() => {
		const el = document.querySelector('${panneau} > .panel__fold');
		if (!el) return 'null'; // bouton absent : le banc doit ÉCHOUER, pas mourir
		const b = el.getBoundingClientRect();
		return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) });
	})()`));

	// Clic RÉEL : c'est Chrome qui fabrique pointerdown/mousedown/click.
	const clic = async (x, y) => {
		const base = { x, y, button: 'left', clickCount: 1 };
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
		await attendre(150);
	};
	const clicChevron = async (panneau) => {
		const p = await centreChevron(panneau);
		if (!p) { ok(`le chevron de ${panneau} existe pour être cliqué`, false, 'bouton introuvable'); return; }
		await clic(p.x, p.y);
	};
	/** Chevron de la colonne de DROITE : celui du panneau réellement affiché. */
	const clicChevronDroite = async () => {
		const quel = (await droite()).quel;
		await clicChevron('#' + quel);
	};
	/** Dernier message `saveUiState` posté (la persistance du repli se lit là). */
	const dernierEtat = () => ev(`(() => {
		const m = [...window.__msgs].reverse().find((x) => x && x.type === 'saveUiState');
		return m ? JSON.stringify(m.state) : '';
	})()`).then((s) => (s ? JSON.parse(s) : null));

	// --- 1. État de départ : déployés, chevron en place ------------------------
	let g = await gauche();
	let d = await droite();
	ok('la bibliothèque démarre DÉPLOYÉE', g.plie === false && g.w > 80, JSON.stringify(g));
	ok('et son chevron de repli est bien DANS le panneau', g.bouton === true, JSON.stringify(g));
	ok('le panneau de droite démarre DÉPLOYÉ aussi', d.plie === false && d.w > 80, JSON.stringify(d));
	ok('et c est bien Propriétés qui occupe la colonne hors simulation',
		d.quel === 'inspector', d.quel);
	const largeurGauche = g.w;
	const largeurDroite = d.w;

	// --- 10. L'ascenseur est RACCOURCI en haut ET en bas ----------------------
	// L'ascenseur est celui de .panel__scroll et occupe TOUTE sa hauteur : ses
	// marges haute et basse sont donc, au pixel près, le raccourcissement demandé.
	// Il faut d'abord que la bibliothèque déborde, sans quoi il n'y a pas de barre
	// à mesurer et le contrôle serait vert sur du vide.
	ok('la bibliothèque déborde : il y a bien un ascenseur à raccourcir',
		g.deborde === true, JSON.stringify({ deborde: g.deborde, scroll: g.scrollBox }));
	ok('le panneau lui-même ne défile PAS (la barre y courrait sur les arrondis)',
		g.panneauDefile === false, JSON.stringify({ panneauDefile: g.panneauDefile }));
	ok('l ascenseur est raccourci EN HAUT (place du chevron)',
		g.margeHaut >= 18, g.margeHaut + ' px de marge haute');
	ok('l ascenseur est raccourci EN BAS (arrondi préservé)',
		g.margeBas >= 4, g.margeBas + ' px de marge basse');

	// --- 11. Le chevron déployé n'empiète sur rien ----------------------------
	// « Sans ascenseur, la flèche ne doit pas empiéter sur le texte » : le seul
	// moyen de le garantir est qu'elle soit AU-DESSUS du contenu, pas dessus.
	{
		const empiete = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x
			|| a.y + a.h <= b.y || b.y + b.h <= a.y);
		ok('déployé, le chevron est AU-DESSUS de la zone de défilement, pas dessus',
			() => g.btnBox.y + g.btnBox.h <= g.scrollBox.y + 1,
			JSON.stringify({ btn: g.btnBox, scroll: g.scrollBox }));
		ok('il ne recouvre donc AUCUN contenu du panneau',
			() => !empiete(g.btnBox, g.scrollBox), JSON.stringify({ btn: g.btnBox, scroll: g.scrollBox }));
		// Et il reste DANS le panneau : posé dans la gouttière, il retomberait sur
		// le canvas ou sur la bordure arrondie (l'état d'avant la v.101).
		ok('et il reste à l intérieur du panneau',
			() => g.btnBox.x >= g.panneau.x && g.btnBox.x + g.btnBox.w <= g.panneau.x + g.panneau.w + 1,
			JSON.stringify({ btn: g.btnBox, panneau: g.panneau }));
		// Cas « SANS ascenseur », celui que Frank nomme : les Propriétés ne
		// débordent pas au démarrage. La flèche ne doit pas non plus y mordre sur
		// le texte — c'est vrai par construction (elle est AU-DESSUS de la zone de
		// contenu), et c'est ce qu'on mesure, sur l'autre panneau donc.
		ok('le panneau de droite ne déborde PAS : c est bien le cas « sans ascenseur »',
			() => d.deborde === false, JSON.stringify({ deborde: d.deborde }));
		ok('et là aussi la flèche est au-dessus du contenu, pas dessus',
			() => d.btnBox.y + d.btnBox.h <= d.scrollBox.y + 1,
			JSON.stringify({ btn: d.btnBox, scroll: d.scrollBox }));
		ok('son ascenseur potentiel est raccourci des DEUX côtés lui aussi',
			() => d.margeHaut >= 18 && d.margeBas >= 4,
			JSON.stringify({ haut: d.margeHaut, bas: d.margeBas }));
	}

	// --- 2. Un vrai clic replie la bibliothèque -------------------------------
	await clicChevron('#palette');
	g = await gauche();
	ok('un VRAI clic sur le chevron replie la bibliothèque', g.plie === true, JSON.stringify(g));
	ok('et elle devient une BANDE étroite (moins de 30 px)',
		g.w > 0 && g.w < 30, g.w + ' px (déployée : ' + largeurGauche + ')');
	ok('son contenu est masqué', g.visibles === 0, g.visibles + ' enfant(s) encore visible(s)');
	ok('son nom s écrit à la VERTICALE sur la bande',
		g.nomVertical === true && g.nom.length > 0, JSON.stringify(g));
	ok('le splitter suit (plus de poignée de largeur)', g.splitPlie === true, JSON.stringify(g));
	ok('l infobulle du chevron propose de RÉAFFICHER le panneau',
		/show/i.test(g.titre), g.titre);

	// --- 12. Replié : le nom est CENTRÉ dans la bande, chevron au-dessus -------
	// Avant la v.101 le bouton vivait dans la gouttière : le nom vertical
	// s'écrivait À CÔTÉ de la bande vide, pas dedans. On mesure donc les deux
	// centres, et l'ordre vertical chevron/texte.
	{
		const centreBande = () => g.panneau.x + g.panneau.w / 2;
		ok('le nom vertical est DANS la bande repliée',
			() => g.labBox.x >= g.panneau.x - 1
				&& g.labBox.x + g.labBox.w <= g.panneau.x + g.panneau.w + 1,
			JSON.stringify({ nom: g.labBox, bande: g.panneau }));
		ok('et il y est CENTRÉ horizontalement (moins de 2 px d écart)',
			() => Math.abs((g.labBox.x + g.labBox.w / 2) - centreBande()) < 2,
			JSON.stringify({ nom: g.labBox, bande: g.panneau }));
		// La flèche elle-même, pas sa zone cliquable : repliée, celle-ci occupe
		// toute la bande et la comparer au nom serait vrai quoi qu'il arrive.
		ok('la FLÈCHE est au-dessus du nom, sans le chevaucher',
			() => g.chevBox.y + g.chevBox.h <= g.labBox.y + 1,
			JSON.stringify({ chevron: g.chevBox, nom: g.labBox }));
		ok('et la flèche est centrée dans la bande elle aussi',
			() => Math.abs((g.chevBox.x + g.chevBox.w / 2) - centreBande()) < 2,
			JSON.stringify({ chevron: g.chevBox, bande: g.panneau }));
	}
	// Le panneau de droite n'a pas bougé : les deux replis sont indépendants.
	d = await droite();
	ok('replier à gauche ne touche PAS le panneau de droite',
		d.plie === false && d.w === largeurDroite, JSON.stringify(d));

	// --- 5a. Le repli est PERSISTÉ --------------------------------------------
	let etat = await dernierEtat();
	ok('le repli est persisté dans l état d interface',
		etat && etat.paletteFolded === true, JSON.stringify(etat));

	// --- 6. Un panneau replié ne se redimensionne plus ------------------------
	// Glissement sur le splitter replié : la bande doit garder sa largeur.
	{
		const s = JSON.parse(await ev(`(() => { const b = document.querySelector('#splitter-palette').getBoundingClientRect();
			return JSON.stringify({ x: Math.round(b.left), y: Math.round(b.top + b.height / 2) }); })()`));
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.x, y: s.y, button: 'left', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: s.x, y: s.y, button: 'left', buttons: 1, clickCount: 1 });
		for (const dx of [40, 90, 150]) {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.x + dx, y: s.y, button: 'left', buttons: 1 });
		}
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: s.x + 150, y: s.y, button: 'left', buttons: 0, clickCount: 1 });
		await attendre(200);
		const apres = await gauche();
		ok('un panneau replié ne se REDIMENSIONNE pas au glissement',
			apres.plie === true && apres.w < 30, JSON.stringify(apres));
	}

	// --- 3. Second clic : la bibliothèque revient à sa largeur -----------------
	await clicChevron('#palette');
	g = await gauche();
	ok('un second clic la ROUVRE', g.plie === false, JSON.stringify(g));
	ok('et elle retrouve sa largeur d avant', g.w === largeurGauche,
		g.w + ' px au lieu de ' + largeurGauche);
	ok('son contenu est de nouveau visible', g.visibles > 0, String(g.visibles));
	etat = await dernierEtat();
	ok('la réouverture est persistée elle aussi',
		etat && etat.paletteFolded === false, JSON.stringify(etat));

	// --- 4. Le même geste à droite --------------------------------------------
	await clicChevronDroite();
	d = await droite();
	g = await gauche();
	ok('le chevron de droite replie le panneau des propriétés',
		d.plie === true && d.w > 0 && d.w < 30, JSON.stringify(d));
	ok('son contenu est masqué', d.visibles === 0, String(d.visibles));
	ok('et la bibliothèque reste ouverte (replis indépendants)',
		g.plie === false, JSON.stringify(g));
	etat = await dernierEtat();
	ok('le repli de droite est persisté', etat && etat.inspectorFolded === true, JSON.stringify(etat));
	await clicChevronDroite();
	d = await droite();
	ok('et il se rouvre au clic suivant', d.plie === false && d.w === largeurDroite, JSON.stringify(d));

	// --- 5b. L'état persisté est RESTAURÉ -------------------------------------
	await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
		type: 'uiState', state: { paletteFolded: true, inspectorFolded: true } } }))`);
	await attendre(250);
	g = await gauche();
	d = await droite();
	ok('un état persisté « les deux repliés » est RESTAURÉ à l ouverture',
		g.plie === true && d.plie === true, JSON.stringify({ g, d }));
	// Restauration SANS re-persistance : l'état rejoué ne doit pas se réécrire.
	await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
		type: 'uiState', state: { paletteFolded: false, inspectorFolded: false } } }))`);
	await attendre(250);
	g = await gauche();
	d = await droite();
	ok('et l état inverse est restauré aussi', g.plie === false && d.plie === false,
		JSON.stringify({ g, d }));

	// --- 7. La simulation replie la bibliothèque, l'arrêt la rouvre -----------
	// Le réglage arrive par le message `config`, comme depuis l'extension.
	await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
		type: 'config', showLoadBinary: false, showResetParts: false,
		showClearDiagram: false, foldLibraryOnRun: true } }))`);
	await attendre(120);
	// Démarrage par le VRAI chemin : le message `runProgram` de l'extension, celui
	// qui appelle `startRun()`. Le bouton ▶ ne fait que demander une compilation à
	// l'hôte — il ne démarre rien tout seul, cliquer dessus ne prouverait donc
	// rien. Le programme est un croquis AVR vide (une boucle infinie) : il suffit
	// à faire tourner le moteur, et le banc ne mesure que l'interface.
	const demarrer = async () => {
		await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
			type: 'runProgram', board: 'uno', bytes: [0xcfff] } }))`);
		await attendre(600);
	};
	const arreter = async () => {
		await ev(`document.getElementById('stop').click()`);
		await attendre(600);
	};
	await demarrer();
	g = await gauche();
	d = await droite();
	ok('la simulation REPLIE la bibliothèque', g.plie === true && g.w < 30, JSON.stringify(g));
	// --- 9. Et la bande de droite nomme le panneau réellement affiché ---------
	ok('en simulation, la colonne de droite est celle des VARIABLES',
		d.quel === 'debug', d.quel);
	ok('et la bande de droite le NOMME (Variables, pas Properties)',
		/variable/i.test(d.nom), d.nom);
	ok('le panneau caché ne garde PAS la classe de repli',
		d.autrePlie === false, JSON.stringify(d));
	// Le repli de course n'est PAS un choix de l'élève : rien n'est persisté.
	etat = await dernierEtat();
	ok('un repli décidé par la simulation n est pas persisté comme un choix',
		!etat || etat.paletteFolded !== true, JSON.stringify(etat));
	await arreter();
	g = await gauche();
	ok('l arrêt de la simulation la ROUVRE', g.plie === false, JSON.stringify(g));

	// Bibliothèque repliée par l'ÉLÈVE : la simulation n'y touche pas, et son
	// arrêt ne la rouvre pas (sinon son choix serait annulé par un run).
	await clicChevron('#palette');
	ok('la bibliothèque est repliée à la main avant le run', (await gauche()).plie === true);
	await demarrer();
	ok('la simulation la laisse repliée', (await gauche()).plie === true);
	await arreter();
	g = await gauche();
	ok('et l arrêt NE la rouvre pas : le choix de l élève tient',
		g.plie === true, JSON.stringify(g));
	await clicChevron('#palette'); // remise à plat pour le contrôle suivant

	// --- 8. Réglage à faux : la simulation ne replie plus rien ----------------
	await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
		type: 'config', showLoadBinary: false, showResetParts: false,
		showClearDiagram: false, foldLibraryOnRun: false } }))`);
	await attendre(120);
	await demarrer();
	g = await gauche();
	ok('réglage désactivé : la simulation ne replie PLUS la bibliothèque',
		g.plie === false, JSON.stringify(g));
	await arreter();
} finally {
	try { ws?.close(); } catch { /* déjà fermé */ }
	proc.kill();
}

const fail = checks.filter((c) => !c.ok).length;
console.log(fail
	? `panneaux : ${fail} échec(s).`
	: `panneaux : ${checks.length} contrôles OK — les panneaux latéraux se replient.`);
process.exit(fail ? 1 : 0);
