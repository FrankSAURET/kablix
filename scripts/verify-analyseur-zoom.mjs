// Banc : l'onglet de l'analyseur GARDE SON ZOOM (v2026.9.5.152).
//
// LE DÉFAUT (Frank, 25/09) : « si je déplace l'onglet ou que je change un
// paramètre (par exemple le déclenchement), la courbe est bien gardée mais pas
// le facteur de zoom ». DEUX causes :
//   1. Déplacer l'onglet vers une autre fenêtre RECHARGE la page : elle repart
//      de sa fenêtre par défaut, et la capture que l'hôte lui rend est
//      recadrée en entier (`ajuster`).
//   2. Un réglage de l'onglet marque le projet « modifié » ; la mise à jour du
//      titre qui suit (`updateTitle` → `suivreAnalyseur` →
//      `reprendreOngletRestaure`) RENVOYAIT toute la capture à l'onglet déjà
//      ouvert, recadrée elle aussi. La page seule garde son zoom : c'est l'hôte
//      qui le lui retirait.
//
// Partie HÔTE : vrai panel.ts empaqueté avec un faux `vscode`, faux onglet qui
// compte ce qu'on lui renvoie.
// Partie PAGE : vrai HTML de l'onglet (AnalyseurPanel.html), vrai
// analyseur.mts, Chrome headless piloté en CDP brut : VRAIE molette, VRAIS clics
// sur les boutons dessinés des pistes. Le zoom se lit sur l'écran, sans rien
// demander à la page : l'écart en pixels entre deux fronts d'une horloge de
// période connue.
//
// Contre-épreuve : `node scripts/verify-analyseur-zoom.mjs --ancien` prend
// analyseur.mts et panel.ts dans HEAD — le banc DOIT alors échouer.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-zoom-'));
const PORT = 9428;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
const echecs = [];
const check = (cond, titre, detail = '') => {
	if (cond) { ok++; console.log(`  ✓ ${titre}`); return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};

// --- Contre-épreuve : analyseur.mts et panel.ts pris dans HEAD ----------------
const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : src/webview/analyseur.mts et src/panel.ts en version HEAD)');
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /[\\/]src[\\/](webview[\\/]analyseur\.mts|panel\.ts)$/ }, (args) => {
			if (!ANCIEN) return undefined;
			const rel = relative(ROOT, args.path).replace(/\\/g, '/');
			const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};

// --- Hôte : ce que l'atelier renvoie à un onglet déjà ouvert ----------------
console.log('Hôte : l’atelier ne renvoie pas sa capture à l’onglet qu’il sert déjà');
{
	// Faux `vscode` : ce que panel.ts touche au chargement (cf. verify-analyseur-dirty).
	writeFileSync(join(tmp, 'vscode-stub-hote.mjs'), `
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (base, ...parts) => uri([base.fsPath, ...parts].join('/')) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const window = {
  showSaveDialog: async () => undefined, showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined),
  setStatusBarMessage: () => ({ dispose() {} }), createWebviewPanel: () => { throw new Error('non utilisé'); },
  activeTextEditor: undefined, tabGroups: { all: [], close: async () => {} },
  onDidChangeActiveTextEditor: () => ({ dispose() {} }), registerCustomEditorProvider: () => ({ dispose() {} }),
  visibleTextEditors: [], createTextEditorDecorationType: () => ({ dispose() {} }),
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/projet') }],
  fs: { writeFile: async () => {}, readFile: async () => new Uint8Array(), stat: async () => ({ type: 1 }), delete: async () => {} },
  getConfiguration: () => ({ get: (_k, d) => d, update: async () => {} }),
  onDidSaveTextDocument: () => ({ dispose() {} }), onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidCloseTextDocument: () => ({ dispose() {} }), openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath), applyEdit: async () => true,
  createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), onDidDelete: () => ({ dispose() {} }), dispose() {} }),
};
export const commands = { executeCommand: async () => undefined, registerCommand: () => ({ dispose() {} }) };
export const env = { clipboard: { readText: async () => '', writeText: async () => {} }, openExternal: async () => true, language: 'fr' };
export const Range = class {}; export const Position = class {}; export const Selection = class {};
export const ThemeIcon = class {}; export const EventEmitter = class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} };
export const TextEdit = { replace: () => ({}) }; export const WorkspaceEdit = class { replace() {} };
export const Disposable = class { static from() { return { dispose() {} }; } dispose() {} };
export const TabInputCustom = class {}; export const TabInputText = class {};
export const StatusBarAlignment = { Left: 1, Right: 2 }; export const ProgressLocation = { Notification: 15 };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export const RelativePattern = class {}; export const OverviewRulerLane = { Full: 7 };
export default { Uri, ViewColumn, l10n, window, workspace, commands, env };
`);
	// Faux onglet : `pour(clé)` rend l'onglet ouvert sous cette clé, qui compte
	// les états qu'on lui renvoie ; `ouvrir` range le rappel de ses réglages.
	writeFileSync(join(tmp, 'analyseur-panel-hote.mjs'), `
export class AnalyseurPanel {
  static ouvrir(_uri, _cle, _titre, etat, onMsg) { globalThis.__rappel = onMsg; }
  static pour(cle) { return globalThis.__onglets?.get(cle); }
  static suivreProjet() {}
}
`);
	const sortieHote = join(tmp, 'panel-hote.mjs');
	await esbuild.build({
		entryPoints: [join(ROOT, 'src/panel.ts')],
		outfile: sortieHote, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
		alias: { vscode: join(tmp, 'vscode-stub-hote.mjs') },
		plugins: [versionHead, {
			name: 'analyseur-panel-hote',
			setup(b) { b.onResolve({ filter: /analyseur-panel$/ }, () => ({ path: join(tmp, 'analyseur-panel-hote.mjs') })); },
		}],
	});
	const { SimulatorPanel } = await import(pathToFileURL(sortieHote).href);
	const cle = 'W:/projet/zoom.projix';
	const onglet = { reprises: 0, reprendreEtat() { this.reprises++; } };
	globalThis.__onglets = new Map([[cle, onglet]]);
	// Atelier minimal, sans webview : le VRAI updateTitle, le VRAI marquage.
	const p = Object.create(SimulatorPanel.prototype);
	Object.assign(p, {
		projectUri: { fsPath: cle, scheme: 'file', toString: () => cle },
		documentUri: { fsPath: cle, scheme: 'file', toString: () => cle },
		projectBaseName: 'zoom', projectDirty: false, gone: new Set(),
		analyseurVoies: [], analyseurCapture: null, analyseurReglages: null, analyseurEnCours: false,
		post: () => {},
		extensionUri: { fsPath: 'W:/ext', scheme: 'file' },
		panel: { onDocEdit() {}, setDirtyIndicator() {}, setDeletedIndicator() {} },
	});
	// 1. Onglet restauré par VS Code AVANT son atelier : l'atelier qui prend son
	//    .projix lui rend son état. C'est la raison d'être du chemin — il reste.
	p.updateTitle();
	check(onglet.reprises === 1, 'un onglet restauré reçoit l’état de l’atelier qui arrive', `${onglet.reprises} envoi(s)`);
	// 2. Un réglage de l'onglet (déclenchement) : le projet est marqué, le titre
	//    se met à jour… et l'onglet, déjà servi, ne reçoit RIEN.
	p.ouvrirAnalyseur();
	const rappel = globalThis.__rappel;
	check(typeof rappel === 'function', 'le rappel des réglages de l’onglet est posé');
	const avant = onglet.reprises;
	rappel?.({ type: 'analyseurReglages', declenchement: { voie: 0, sens: 'montant' }, decodages: [], voiesReglages: {}, echantillonnage: 0 });
	check(p.projectDirty === true, 'le réglage marque bien le projet (le titre est remis à jour)');
	check(onglet.reprises === avant, 'un réglage ne renvoie pas la capture à l’onglet', `${onglet.reprises - avant} envoi(s)`);
	// 3. Toute autre mise à jour du titre (retouche du schéma, enregistrement).
	p.updateTitle();
	p.updateTitle();
	check(onglet.reprises === avant, 'une mise à jour du titre ne la renvoie pas non plus', `${onglet.reprises - avant} envoi(s)`);
}

// --- La page : vrai HTML de l'onglet, vrai script ----------------------------
console.log('Page : le zoom tient à travers réglages et rechargement');
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
});
const { AnalyseurPanel } = await import(pathToFileURL(sortiePanneau).href);
const CLE = 'W:/p/zoom.projix';
let html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, CLE);
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// L'état de VS Code (getState/setState) SURVIT au rechargement de la page :
// c'est tout son rôle. Le faux le range donc dans sessionStorage, qui survit à
// Page.reload comme l'état d'un onglet de webview survit à son déplacement.
const FAUX_VSCODE = `window.__msgs = []; window.__erreurs = [];
window.addEventListener('error', (e) => window.__erreurs.push(e.message));
window.acquireVsCodeApi = () => ({
	postMessage(m) { window.__msgs.push(m); },
	setState(s) { sessionStorage.setItem('etat', JSON.stringify(s)); },
	getState() { const s = sessionStorage.getItem('etat'); return s ? JSON.parse(s) : undefined; },
});`;
html = html
	.replace('</head>', `<script nonce="${nonce}">${FAUX_VSCODE}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
const fichierPage = join(tmp, 'onglet.html');
writeFileSync(fichierPage, html);

// Horloge D8 : un front par milliseconde, de 1 à 400 ms. D9 : un toutes les 10 ms.
const horloge = (pas, n) => { const f = []; for (let k = 1; k <= n; k++) f.push(k * pas, k % 2); return f; };
const VOIES = [
	{ voie: 0, nom: 'horloge', pin: 'D8', probleme: null, analogique: false },
	{ voie: 1, nom: 'lent', pin: 'D9', probleme: null, analogique: false },
];
const capture = (reglages) => ({
	voies: [
		{ voie: 0, nom: 'horloge', pin: 'D8', fronts: horloge(1, 400), niveauInitial: 0 },
		{ voie: 1, nom: 'lent', pin: 'D9', fronts: horloge(10, 40), niveauInitial: 0 },
	],
	declenchement: null, decodages: [], voiesReglages: {}, echantillonnage: 0,
	...reglages,
});

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
	check(false, 'Chrome introuvable — le banc n’a pas pu être joué');
} else {
	const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
		`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,700',
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
		ws.addEventListener('message', (ev) => {
			const m = JSON.parse(ev.data);
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
		/** Abscisses des fronts de la piste 0 : colonnes peintes à mi-hauteur, regroupées. */
		const fronts = async () => {
			await envoyer({ type: 'repeindre' });
			await attendre(80);
			return ev(`(() => {
				const c = document.getElementById('trace');
				const d = c.getContext('2d').getImageData(106, 62 + 23, c.width - 106 - 14, 1).data;
				const xs = [];
				for (let x = 0; x < d.length / 4; x++) {
					if (d[x * 4 + 3] <= 60) continue;
					if (xs.length && x - xs.at(-1).fin <= 1) xs.at(-1).fin = x;
					else xs.push({ debut: x, fin: x });
				}
				return xs.map((s) => 106 + (s.debut + s.fin) / 2);
			})()`);
		};
		/** Zoom lu à l'écran : écart médian entre deux fronts voisins (= 1 ms). */
		const ecart = (xs) => {
			const d = xs.slice(1).map((x, i) => x - xs[i]).sort((a, b) => a - b);
			return d.length ? d[d.length >> 1] : 0;
		};
		const clic = async (x, y) => {
			const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
			await attendre(120);
		};
		/** Bouton dessiné d'une voie (colonne de gauche, rangée sous le nom). */
		const zone = (voie, quoi) => ev(`(() => {
			const r = document.getElementById('trace').getBoundingClientRect();
			const x = 8 + (${JSON.stringify({ teinte: 0, declenchement: 1, protocole: 2 })})[${JSON.stringify(quoi)}] * 22;
			return { x: r.left + x + 9, y: r.top + 62 + ${voie} * 64 + 15 + 8 + 9 };
		})()`);
		/** Ouvre un bouton de voie et clique l'entrée du menu dont le texte contient `libelle`. */
		const menu = async (voie, quoi, libelle) => {
			const z = await zone(voie, quoi);
			await clic(z.x, z.y);
			const b = await ev(`(() => {
				const p = document.querySelector('.flottant');
				if (!p) return null;
				const e = [...p.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(libelle)}));
				if (!e) return { entrees: [...p.querySelectorAll('button')].map((x) => x.textContent) };
				const r = e.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			})()`);
			if (!b || b.entrees) return `menu introuvable ${JSON.stringify(b)}`;
			await clic(b.x, b.y);
			return '';
		};
		const molette = async (crans) => {
			const r = await ev(`(() => { const r = document.getElementById('trace').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 60 }; })()`);
			for (let i = 0; i < Math.abs(crans); i++) {
				await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(r.x), y: Math.round(r.y), deltaX: 0, deltaY: crans < 0 ? -100 : 100 });
				await attendre(30);
			}
			await attendre(120);
		};
		const proche = (a, b) => Math.abs(a - b) <= Math.max(1.5, b * 0.03);

		check(await pret(), 'la page se dit prête');
		// 1. Capture arrêtée, rendue par l'hôte : toute la capture à l'écran.
		await envoyer({ type: 'voies', voies: VOIES });
		await envoyer({ type: 'restaure', etat: capture() });
		const tout = ecart(await fronts());
		// 2. Molette : dix crans vers l'avant, la fenêtre fond d'un facteur 9.
		await molette(-10);
		const zoome = ecart(await fronts());
		console.log(`  (écart entre deux fronts d'1 ms : toute la capture ${tout} px, zoomé ${zoome} px)`);
		check(zoome > tout * 5, 'la molette zoome', `${tout} → ${zoome} px`);
		// 3. Déclenchement sur front montant, par le menu « T » de la voie.
		const e3 = await menu(0, 'declenchement', 'Rising');
		const apresDecl = ecart(await fronts());
		check(!e3 && proche(apresDecl, zoome), 'choisir un déclenchement garde le zoom', e3 || `${zoome} → ${apresDecl} px`);
		// 4. Décodage UART sur la voie, par le menu « P ».
		const e4 = await menu(0, 'protocole', 'UART');
		const apresProto = ecart(await fronts());
		check(!e4 && proche(apresProto, zoome), 'poser un décodage garde le zoom', e4 || `${zoome} → ${apresProto} px`);
		const avantRecharge = await fronts();
		// 5. L'onglet change de fenêtre : VS Code recharge la page, puis l'hôte lui
		//    rend voies et capture, réglages compris (ce qu'elle lui a envoyés).
		const reglages = await ev(`(() => { const r = window.__msgs.filter((m) => m.type === 'analyseurReglages').at(-1); return r ? { declenchement: r.declenchement, decodages: r.decodages, voiesReglages: r.voiesReglages, echantillonnage: r.echantillonnage } : {}; })()`);
		await cdp('Page.reload');
		await attendre(300);
		check(await pret(), 'la page rechargée se redit prête');
		await envoyer({ type: 'voies', voies: VOIES });
		await envoyer({ type: 'restaure', etat: capture(reglages) });
		const apresRecharge = await fronts();
		check(proche(ecart(apresRecharge), zoome), 'onglet rechargé : le zoom est gardé', `${zoome} → ${ecart(apresRecharge)} px`);
		check(Math.abs((apresRecharge[0] ?? -99) - (avantRecharge[0] ?? 99)) <= 2,
			'onglet rechargé : la vue montre le même moment', `premier front à x=${avantRecharge[0]} puis x=${apresRecharge[0]}`);
		// Le sérialiseur de l'hôte relit la clé du projet dans cet état : la
		// fenêtre s'y ajoute, elle ne doit pas la remplacer.
		const etat = await ev(`sessionStorage.getItem('etat')`);
		check(JSON.parse(etat ?? '{}').cle === CLE, 'l’état confié à VS Code garde la clé du projet', etat ?? 'aucun');
		// 6. Un NOUVEAU projet rendu à l'onglet ouvert : là, on recadre sur toute
		//    sa capture — l'ancien zoom n'a rien à y faire.
		await envoyer({ type: 'restaure', etat: capture() });
		const autre = ecart(await fronts());
		check(proche(autre, tout), 'une capture rendue ensuite est recadrée en entier', `${autre} px pour ${tout} attendus`);
		const erreurs = await ev(`(window.__erreurs || []).join(' | ')`);
		check(!erreurs, 'la page ne lève aucune erreur', erreurs);
	} catch (e) {
		check(false, 'le banc s’est déroulé jusqu’au bout', String(e?.stack ?? e).slice(0, 400));
	} finally {
		try { ws?.close(); } catch { /* déjà fermé */ }
		proc.kill();
	}
}

await attendre(300);
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome relâche son profil un peu tard */ }

// Un banc qui n'a rien mesuré n'est pas un banc vert.
const total = ok + echecs.length;
if (total < 15) {
	echecs.push('le banc a joué tous ses contrôles');
	console.log(`  ✗ le banc a joué tous ses contrôles — seulement ${total} contrôle(s)`);
}
console.log(echecs.length ? `\n${echecs.length} échec(s) sur ${total}.` : `\n${ok} contrôles OK — l’onglet garde son zoom.`);
process.exit(echecs.length ? 1 : 0);
