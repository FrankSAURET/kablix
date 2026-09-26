// Banc : fenêtre F1/F2 de l'analyseur (v2026.9.5.163), à la VRAIE souris.
//
// LA DEMANDE (Frank, 26/09) : « Rajoute 2 marqueurs F1 et F2 (pour fenêtre).
// Par défaut ils apparaissent en dessous de M1 et M2, ils ont aussi leur flèche
// de rappel. Il sont positionnés par rapport au déclenchement et ne bouge pas
// quand on passe d'un frame start à l'autre. ils permettent de surligner qqc
// pour le vérifier d'une trame à l'autre. Ils sont matérialisés par un
// rectangle coloré (mais vide) entre eux qui recouvre toutes les trames. Les
// bords du rectangle sont semi-transparent. »
//
// Vrai HTML de l'onglet, vrai analyseur.mts, Chrome headless piloté en CDP brut
// (`Input.dispatchMouseEvent`) : F1 et F2 se glissent pour de vrai, ⏭ et les
// menus « T » se cliquent pour de vrai. Ce qui est peint se relit en
// interceptant le contexte 2D (drapeaux, chemin et trait du cadre, opacité).
//
// Contre-épreuve : `node scripts/verify-analyseur-fenetre.mjs --ancien` prend
// les sources de l'analyseur dans HEAD — le banc DOIT alors échouer.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-fenetre-'));
const PORT = 9434;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
const echecs = [];
const check = (cond, titre, detail = '') => {
	if (cond) { ok++; console.log(`  ✓ ${titre}`); return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};

// --- Contre-épreuve : les sources de l'analyseur prises dans HEAD ------------
const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : sources de l’analyseur en version HEAD)');
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /[\\/]src[\\/](webview[\\/]analyseur(-capture|-decodage|-vue)?\.mts|analyseur-panel\.ts)$/ }, (args) => {
			if (!ANCIEN) return undefined;
			const rel = relative(ROOT, args.path).replace(/\\/g, '/');
			const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};

// --- La page : vrai HTML de l'onglet, vrai script ----------------------------
const STUB = `
export const Uri = { joinPath: (b, ...p) => ({ fsPath: [b.fsPath, ...p].join('/'), toString() { return this.fsPath; } }) };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const env = { language: 'en' };
export const window = {}; export const ViewColumn = {};
export default { Uri, l10n, env, window, ViewColumn };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
const sortiePanneau = join(tmp, 'analyseur-panel.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src/analyseur-panel.ts')],
	outfile: sortiePanneau, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
	plugins: [versionHead],
});
const { AnalyseurPanel } = await import(pathToFileURL(sortiePanneau).href);
let html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/fenetre.projix');
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Faux VS Code (état gardé en sessionStorage : la fenêtre de temps s'y relit),
// et relevé de ce que la vue peint, dans l'ordre : textes, remplissages,
// chemins (début, points, rectangles) et traits, avec couleur, épaisseur et
// opacité.
const ESPION = `window.__msgs = []; window.__erreurs = [];
window.addEventListener('error', (e) => window.__erreurs.push(e.message));
window.acquireVsCodeApi = () => ({
	postMessage(m) { window.__msgs.push(m); },
	setState(s) { sessionStorage.setItem('etat', JSON.stringify(s)); },
	getState() { const s = sessionStorage.getItem('etat'); return s ? JSON.parse(s) : undefined; },
});
window.__peint = [];
const P = CanvasRenderingContext2D.prototype;
const espionner = (nom, releve) => {
	const origine = P[nom];
	P[nom] = function (...a) { window.__peint.push(releve.call(this, ...a)); return origine.apply(this, a); };
};
espionner('fillText', function (t, x, y) { return { quoi: 'texte', t: String(t), x, y, fill: String(this.fillStyle), alpha: this.globalAlpha }; });
espionner('fillRect', function (x, y, w, h) { return { quoi: 'rect', x, y, w, h, fill: String(this.fillStyle), alpha: this.globalAlpha }; });
espionner('fill', function () { return { quoi: 'fill', fill: String(this.fillStyle), alpha: this.globalAlpha }; });
espionner('beginPath', function () { return { quoi: 'beginPath' }; });
espionner('moveTo', function (x, y) { return { quoi: 'moveTo', x, y }; });
espionner('lineTo', function (x, y) { return { quoi: 'lineTo', x, y, stroke: String(this.strokeStyle), lw: this.lineWidth }; });
espionner('rect', function (x, y, w, h) { return { quoi: 'chemin-rect', x, y, w, h }; });
espionner('stroke', function () { return { quoi: 'stroke', stroke: String(this.strokeStyle), lw: this.lineWidth, alpha: this.globalAlpha, tirets: this.getLineDash().length }; });`;
html = html
	.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
const fichierPage = join(tmp, 'onglet.html');
writeFileSync(fichierPage, html);

// Ligne série 9600 bauds, 8N1, décodée : trois trames différentes (A, B, C) et
// deux répétitions (A2, B2), comme le banc des trames. Voie 1 : une horloge
// lente, sans décodage — ses fronts montant (10 ms) et descendant (20 ms)
// servent de déclenchement.
const BIT = 1000 / 9600;
const serie = (trames) => {
	const f = [];
	let niveau = 1;
	for (const { t: debut, octets } of trames) {
		let t = debut;
		const palier = (n) => { if (n !== niveau) { f.push(t, n); niveau = n; } t += BIT; };
		for (const o of octets) {
			palier(0);
			for (let k = 0; k < 8; k++) palier((o >> k) & 1);
			palier(1);
		}
	}
	return f;
};
const TX = serie([
	{ t: 2, octets: [0x41, 0x42] }, { t: 16, octets: [0x41, 0x42] },
	{ t: 30, octets: [0x55, 0x43] }, { t: 45, octets: [0x55, 0x43] },
	{ t: 60, octets: [0x5a] },
]);
const horloge = (pas, n) => { const f = []; for (let k = 1; k <= n; k++) f.push(k * pas, k % 2); return f; };
const VOIES = [
	{ voie: 0, nom: 'TX', pin: 'D1', probleme: null, analogique: false },
	{ voie: 1, nom: 'lent', pin: 'D9', probleme: null, analogique: false },
];
const CAPTURE = {
	voies: [
		{ voie: 0, nom: 'TX', pin: 'D1', fronts: TX, niveauInitial: 1 },
		{ voie: 1, nom: 'lent', pin: 'D9', fronts: horloge(10, 7), niveauInitial: 0 },
	],
	declenchement: null, decodages: [{ protocole: 'uart', id: 'd1', donnees: 0, bauds: 9600 }], voiesReglages: {}, echantillonnage: 0,
};

// Couleur de la fenêtre au thème clair, et bandes sous les graduations (M
// d'abord, F dessous) : analyseur-vue.
const VIOLET = '#8250df';
const Y_M = 32;
const Y_F = 52;

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
	check(false, 'Chrome introuvable — le banc n’a pas pu être joué');
} else {
	const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
		`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,500',
		`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
	let ws;
	try {
		let liste = null;
		// 30 s : sous verify:all, sept bancs en parallèle, Chrome met parfois plus de 10 s à ouvrir son port.
		for (let i = 0; i < 120 && !liste; i++) {
			try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await attendre(250); }
		}
		ws = new WebSocket(liste.find((c) => c.type === 'page').webSocketDebuggerUrl);
		let id = 0;
		const attentes = new Map();
		ws.addEventListener('message', (e) => {
			const m = JSON.parse(e.data);
			if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
		});
		await new Promise((r) => ws.addEventListener('open', r, { once: true }));
		const cdp = (method, params = {}) => new Promise((res) => { const n = ++id; attentes.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
		const ev = async (expr) => {
			const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
			if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
			return r.result?.result?.value;
		};
		const pret = async () => {
			for (let i = 0; i < 120; i++) {
				if (await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`)) return true;
				await attendre(250);
			}
			return false;
		};
		const envoyer = (m) => ev(`window.postMessage(${JSON.stringify(m)}, '*')`);

		check(await pret(), 'la page se dit prête');
		await envoyer({ type: 'voies', voies: VOIES });
		await envoyer({ type: 'restaure', etat: CAPTURE });
		// Thème clair, avec les variables que VS Code pose sur la page.
		await ev(`(() => {
			document.documentElement.style.setProperty('--vscode-editor-background', '#ffffff');
			document.documentElement.style.setProperty('--vscode-foreground', '#3b3b3b');
			document.body.className = 'vscode-light';
		})()`);
		await attendre(250);
		const boite = await ev(`(() => { const c = document.getElementById('trace'); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height, largeur: c.width }; })()`);

		// --- Outils ---------------------------------------------------------------
		/** Un rendu forcé, rien d'autre : ce qu'il peint, dans l'ordre. */
		const releve = async () => {
			await attendre(200); // laisse passer les rendus que le geste a demandés
			await ev(`window.__peint = []`);
			await envoyer({ type: 'repeindre' });
			await attendre(60);
			return (await ev('window.__peint')).map((p, n) => ({ ...p, n }));
		};
		/** Fenêtre de temps que la page vient de confier à VS Code. */
		const fenetre = async () => {
			await envoyer({ type: 'repeindre' });
			await attendre(80);
			return ev(`JSON.parse(sessionStorage.getItem('etat') || '{}').fenetre ?? null`);
		};
		/** Abscisse, dans le canvas, d'un instant de la fenêtre (marges de analyseur-vue). */
		const xDe = (t, f) => 104 + ((t - f.t0) / f.duree) * (boite.largeur - 104 - 12);
		const X = (x) => Math.round(boite.left + x);
		const Y = (y) => Math.round(boite.top + y);
		const bouger = async (x, y) => {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(x), y: Y(y), buttons: 0 });
			await attendre(80);
		};
		/** Clic en coordonnées de la PAGE. */
		const clicPage = async (x, y) => {
			const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
			await attendre(150);
		};
		const glisser = async (x0, y0, x1, y1) => {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(x0), y: Y(y0), buttons: 0 });
			await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: X(x0), y: Y(y0), button: 'left', buttons: 1, clickCount: 1 });
			for (let k = 1; k <= 8; k++) {
				await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(x0 + ((x1 - x0) * k) / 8), y: Y(y0 + ((y1 - y0) * k) / 8), button: 'left', buttons: 1 });
				await attendre(15);
			}
			await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X(x1), y: Y(y1), button: 'left', buttons: 0, clickCount: 1 });
		};
		const molette = async (crans) => {
			for (let i = 0; i < Math.abs(crans); i++) {
				await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: X(boite.w / 2), y: Y(150), deltaX: 0, deltaY: crans < 0 ? -100 : 100 });
				await attendre(30);
			}
			await attendre(150);
		};
		/** Bouton de la barre : son centre, en coordonnées de la page. */
		const cliquerBouton = async (idBouton) => {
			const b = await ev(`(() => {
				const b = document.getElementById(${JSON.stringify(idBouton)});
				if (!b) return null;
				const r = b.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			})()`);
			if (b) await clicPage(b.x, b.y);
			return !!b;
		};
		/** Bouton « T » dessiné d'une voie : ouvre son menu et choisit `libelle`. */
		const declencherSur = async (voie, libelle) => {
			await clicPage(boite.left + 8 + 22 + 9, boite.top + 62 + voie * 64 + 15 + 8 + 9);
			const b = await ev(`(() => {
				const e = [...(document.querySelector('.flottant')?.querySelectorAll('button') ?? [])]
					.find((x) => x.textContent.includes(${JSON.stringify(libelle)}));
				if (!e) return null;
				const r = e.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			})()`);
			if (b) await clicPage(b.x, b.y);
			return !!b;
		};
		const drapeauDe = (vu, nom) => vu.find((p) => p.quoi === 'texte' && p.t === nom) ?? null;
		/** Teinte d'un drapeau : le remplissage peint juste avant son nom. */
		const teinteDe = (vu, d) => (d && vu[d.n - 1]?.quoi === 'fill' ? vu[d.n - 1].fill : '');
		/** Hampe de la flèche d'un bouton de rappel, dans la bande de `y`. */
		const rappelDans = (vu, y) => vu.find((p) => p.quoi === 'rect' && Math.abs(p.y + p.h / 2 - y) < 2 && p.h <= 3 && p.w <= 8 && p.x < 104) ?? null;
		/** Traits du cadre : couleur de la fenêtre, 3 px, avec le chemin qu'ils tracent. */
		const cadres = (vu) => vu.filter((p) => p.quoi === 'stroke' && p.stroke === VIOLET && p.lw === 3).map((s) => {
			let debut = s.n;
			while (debut > 0 && vu[debut].quoi !== 'beginPath') debut--;
			return { ...s, chemin: vu.slice(debut + 1, s.n).filter((p) => /^(moveTo|lineTo|chemin-rect)$/.test(p.quoi)) };
		});
		const pres = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
		const fmt = (x) => (x == null ? '—' : x.toFixed(1));

		// --- 1. À l'ouverture : F1 et F2 garés sous M1 et M2 -----------------------
		console.log('Garage');
		let vu = await releve();
		const m1g = drapeauDe(vu, 'M1');
		const m2g = drapeauDe(vu, 'M2');
		const f1g = drapeauDe(vu, 'F1');
		const f2g = drapeauDe(vu, 'F2');
		check(!!m1g && !!m2g && m1g.y < 42, 'témoin : M1 et M2 garés dans leur bande');
		check(!!f1g && !!f2g && f1g.y > 42 && f1g.y < 62 && f2g.y > 42 && f2g.y < 62 && f1g.x < 104 && f2g.x < 104,
			'F1 et F2 sont garés à gauche, dans une bande sous celle de M1 et M2',
			`F1 ${fmt(f1g?.x)},${fmt(f1g?.y)} · F2 ${fmt(f2g?.x)},${fmt(f2g?.y)}`);
		check(pres(f1g?.x, m1g?.x, 0.5) && pres(f2g?.x, m2g?.x, 0.5), 'F1 juste sous M1, F2 juste sous M2',
			`F1 ${fmt(f1g?.x)} / M1 ${fmt(m1g?.x)} · F2 ${fmt(f2g?.x)} / M2 ${fmt(m2g?.x)}`);
		check(teinteDe(vu, f1g) === VIOLET && teinteDe(vu, f2g) === VIOLET, `F1 et F2 ont la couleur de la fenêtre (${VIOLET})`,
			`${teinteDe(vu, f1g)} / ${teinteDe(vu, f2g)}`);
		check(cadres(vu).length === 0, 'garés, ils ne tracent aucun cadre', `${cadres(vu).length} trait(s)`);
		const rappelF = rappelDans(vu, Y_F);
		const rappelM = rappelDans(vu, Y_M);
		check(!!rappelF && pres(rappelF.x, rappelM?.x, 0.5), 'F a sa flèche de rappel, sous celle de M',
			rappelF ? `F ${fmt(rappelF.x)}, M ${fmt(rappelM?.x)}` : 'absente');
		check(rappelF?.alpha < 0.5, 'rien de posé : le rappel de F est pâle', String(rappelF?.alpha));
		await bouger(f1g?.x ?? 37, Y_F);
		const bulleGare = await ev(`document.getElementById('trace').title`);
		check(/^Window marker F1: drag/.test(bulleGare), 'F1 garé : sa bulle dit à quoi sert la fenêtre', bulleGare);
		check((await ev(`document.getElementById('trace').style.cursor`)) === 'ew-resize', 'sur F1 garé, le curseur annonce la prise');

		// --- 2. Zoom, déclenchement sur le front montant de la voie lente ----------
		// La vue saute sur le déclenchement (10 ms) : F1 et F2 se posent autour.
		console.log('Poser F1 et F2');
		await molette(-8);
		const decl1 = await declencherSur(1, 'Rising edge');
		const fR = await fenetre();
		check(decl1 && !!fR && fR.duree < 30 && pres(fR.t0, 10 - fR.duree * 0.1, 1e-6),
			'témoin : zoom, puis déclenchement au front montant, la vue saute à 10 ms', JSON.stringify(fR));

		// F1 lâché loin de tout front : il reste où on le lâche, sans cadre encore.
		const xF1 = Math.round(xDe(12, fR));
		await glisser(f1g?.x ?? 37, Y_F, xF1, Y_F);
		vu = await releve();
		const f1 = drapeauDe(vu, 'F1');
		check(pres(f1?.x, xF1, 1.2), 'F1 glissé sur les courbes reste où on le lâche', `drapeau ${fmt(f1?.x)}, lâché ${xF1}`);
		check(pres(f1?.y, f1g?.y, 0.5), 'posé, son drapeau reste dans sa bande', `y ${fmt(f1?.y)}`);
		let c = cadres(vu);
		const bord = c[0]?.chemin ?? [];
		check(c.length === 1 && bord.length === 2 && bord[0].quoi === 'moveTo' && bord[1].quoi === 'lineTo'
			&& pres(bord[0].x, Math.round(xF1) + 0.5, 1.2) && bord[0].x === bord[1].x,
			'F1 seul : un bord vertical, à son instant', JSON.stringify(bord));
		check(pres(bord[0]?.y, 63.5, 0.01) && pres(bord[1]?.y, boite.h - 5.5, 0.01),
			'le bord descend de la première piste à la dernière', `${fmt(bord[0]?.y)} → ${fmt(bord[1]?.y)}, canvas ${boite.h}`);
		check(!vu.some((p) => p.quoi === 'lineTo' && p.stroke === VIOLET && p.lw === 1.5),
			'F1 ne trace pas le trait pointillé des marqueurs M');
		check((await fenetre())?.t0 === fR.t0, 'prendre F1 ne fait pas défiler la vue');

		// F2 lâché à 5 px du départ de la trame A2 (16 ms) : il s'y colle.
		const xA2 = xDe(16, fR);
		await glisser(f2g?.x ?? 67, Y_F, Math.round(xA2) - 5, Y_F);
		vu = await releve();
		const f2 = drapeauDe(vu, 'F2');
		check(pres(f2?.x, xA2, 0.8), 'F2 lâché à 5 px d’un front s’y colle, comme M1 et M2', `drapeau ${fmt(f2?.x)}, front ${fmt(xA2)}`);
		c = cadres(vu);
		const rect = c[0]?.chemin.length === 1 && c[0].chemin[0].quoi === 'chemin-rect' ? c[0].chemin[0] : null;
		check(c.length === 1 && !!rect, 'F1 et F2 posés : un rectangle, tracé d’un seul trait', JSON.stringify(c.map((s) => s.chemin)));
		check(!!rect && pres(rect.x, Math.round(xF1) + 0.5, 1.2) && pres(rect.x + rect.w, Math.round(xA2) + 0.5, 1.2),
			'le rectangle va de F1 à F2', rect ? `${fmt(rect.x)} → ${fmt(rect.x + rect.w)}` : '—');
		check(!!rect && rect.y <= 62 + 2 && rect.y + rect.h >= boite.h - 8,
			'il recouvre toutes les pistes, de la règle au bas de la dernière', rect ? `${fmt(rect.y)} → ${fmt(rect.y + rect.h)}, canvas ${boite.h}` : '—');
		check(c[0]?.alpha > 0.2 && c[0]?.alpha < 0.8 && c[0]?.tirets === 0, 'ses bords sont semi-transparents et pleins',
			`opacité ${c[0]?.alpha}, tirets ${c[0]?.tirets}`);
		const remplis = vu.filter((p) => (p.quoi === 'fill' || p.quoi === 'rect') && p.fill === VIOLET);
		check(remplis.length === 2 && remplis.every((p) => vu[p.n + 1]?.quoi === 'texte' && /^F[12]$/.test(vu[p.n + 1].t)),
			'le rectangle est vide : la couleur de la fenêtre ne remplit que les deux drapeaux', `${remplis.length} remplissage(s)`);
		check(!vu.some((p) => p.quoi === 'texte' && p.y > 42 && p.y < 62 && /(ms|µs)$/.test(p.t)),
			'F1 et F2 n’écrivent pas d’écart : la fenêtre encadre, elle ne mesure pas');
		check(rappelDans(vu, Y_F)?.alpha === 1, 'F posés : leur rappel est vif', String(rappelDans(vu, Y_F)?.alpha));

		// M1, témoin : posé au milieu, il suit son INSTANT, pas l'écran.
		const xM1 = Math.round(xDe(14, fR));
		await glisser(m1g?.x ?? 37, Y_M, xM1, Y_M);
		vu = await releve();
		const m1 = drapeauDe(vu, 'M1');
		check(pres(m1?.x, xM1, 1.2), 'témoin : M1 posé entre F1 et F2', `M1 ${fmt(m1?.x)}`);

		// --- 3. Le déclenchement tombe ailleurs : F le suit ------------------------
		// Front descendant de la même voie : 20 ms au lieu de 10. La vue saute
		// dessus ; F1 et F2 ont suivi, ils sont au même endroit de l'écran.
		console.log('Déclenchement déplacé');
		const decl2 = await declencherSur(1, 'Falling edge');
		const fF = await fenetre();
		check(decl2 && !!fF && pres(fF.t0, 20 - fF.duree * 0.1, 1e-6), 'témoin : déclenchement au front descendant, la vue saute à 20 ms',
			JSON.stringify(fF));
		vu = await releve();
		const f1d = drapeauDe(vu, 'F1');
		const f2d = drapeauDe(vu, 'F2');
		check(pres(f1d?.x, f1?.x, 1) && pres(f2d?.x, f2?.x, 1), 'F1 et F2 suivent le déclenchement : même place à l’écran',
			`F1 ${fmt(f1?.x)} → ${fmt(f1d?.x)} · F2 ${fmt(f2?.x)} → ${fmt(f2d?.x)}`);
		const rectD = cadres(vu)[0]?.chemin[0];
		check(rectD?.quoi === 'chemin-rect' && pres(rectD.x, rect?.x, 1) && pres(rectD.w, rect?.w, 1), 'le rectangle aussi',
			JSON.stringify(rectD));
		const m1d = drapeauDe(vu, 'M1');
		check(!m1d || Math.abs(m1d.x - (m1?.x ?? 0)) > 5, 'témoin : M1, lui, est resté sur son instant',
			m1d ? `M1 ${fmt(m1?.x)} → ${fmt(m1d.x)}` : 'M1 sorti de la vue');

		// --- 4. ⏭ : la trame suivante ; F1 et F2 ne bougent pas à l'écran ----------
		console.log('Trame suivante');
		for (const [fleche, nomFleche] of [['trame-suiv', '⏭'], ['trame-prec', '⏮']]) {
			const fAvant = await fenetre();
			const vAvant = await releve();
			const avant = ['F1', 'F2', 'M1'].map((n) => drapeauDe(vAvant, n)?.x ?? null);
			await cliquerBouton(fleche);
			const fApres = await fenetre();
			check(!!fApres && !!fAvant && Math.abs(fApres.t0 - fAvant.t0) > 1, `témoin : ${nomFleche} a sauté à une autre trame`,
				`${fmt(fAvant?.t0)} → ${fmt(fApres?.t0)} ms`);
			vu = await releve();
			const apres = ['F1', 'F2', 'M1'].map((n) => drapeauDe(vu, n)?.x ?? null);
			check(avant[0] !== null && pres(apres[0], avant[0], 1) && pres(apres[1], avant[1], 1),
				`${nomFleche} : F1 et F2 restent à la même place de l’écran`,
				`F1 ${fmt(avant[0])} → ${fmt(apres[0])} · F2 ${fmt(avant[1])} → ${fmt(apres[1])}`);
			const r = cadres(vu)[0]?.chemin[0];
			check(r?.quoi === 'chemin-rect' && pres(r.x, rect?.x, 1) && pres(r.w, rect?.w, 1), `${nomFleche} : le rectangle aussi`, JSON.stringify(r));
			check(apres[2] === null || avant[2] === null || Math.abs(apres[2] - avant[2]) > 5, `témoin : ${nomFleche} emporte M1 avec les courbes`,
				`M1 ${fmt(avant[2])} → ${fmt(apres[2])}`);
		}

		// --- 5. Rappel de F : F1 et F2 au garage, M1 reste posé ---------------------
		console.log('Rappel');
		vu = await releve();
		const xRappel = Math.round(rappelDans(vu, Y_F)?.x ?? 17);
		await bouger(xRappel, Y_F);
		const bulleRappel = await ev(`document.getElementById('trace').title`);
		check(/^Bring F1 and F2 back/.test(bulleRappel), 'la bulle du rappel de F nomme F1 et F2', bulleRappel);
		check((await ev(`document.getElementById('trace').style.cursor`)) === 'pointer', 'sur le rappel de F, le curseur annonce un bouton');
		const fAvantRappel = await fenetre();
		await clicPage(X(xRappel), Y(Y_F));
		vu = await releve();
		const f1r = drapeauDe(vu, 'F1');
		const f2r = drapeauDe(vu, 'F2');
		check(pres(f1r?.x, f1g?.x, 1) && pres(f2r?.x, f2g?.x, 1) && pres(f1r?.y, f1g?.y, 0.5),
			'un clic sur le rappel ramène F1 et F2 au garage', `F1 ${fmt(f1r?.x)} · F2 ${fmt(f2r?.x)}`);
		check(cadres(vu).length === 0, 'ramenés, ils ne tracent plus de cadre');
		check(rappelDans(vu, Y_F)?.alpha < 0.5, 'plus rien à ramener : le rappel de F redevient pâle');
		check(rappelDans(vu, Y_M)?.alpha === 1, 'M1 n’a pas été ramené : le rappel de M reste vif', String(rappelDans(vu, Y_M)?.alpha));
		check((await fenetre())?.t0 === fAvantRappel?.t0, 'le clic ne fait pas défiler la vue');

		const erreurs = await ev(`(window.__erreurs || []).join(' | ')`);
		check(erreurs === '', 'aucune erreur dans la page', erreurs);
	} catch (e) {
		check(false, 'le banc s’est déroulé jusqu’au bout', e?.stack ?? String(e));
	} finally {
		try { ws?.close(); } catch { /* */ }
		proc.kill();
		await attendre(300);
		try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
	}
}
console.log(echecs.length === 0 ? `\nTout est vert (${ok} contrôles).` : `\n${echecs.length} échec(s) sur ${ok + echecs.length} contrôles.`);
process.exit(echecs.length === 0 ? 0 : 1);
