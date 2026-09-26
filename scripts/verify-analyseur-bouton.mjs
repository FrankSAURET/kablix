// Banc : le bouton « Analyseur » de la barre de simulation ROUVRE un onglet
// d'analyseur fermé (v2026.9.5.157).
//
// LA DEMANDE (Frank, 26/09) : « Dans media\icones.svg, j'ai rajouté une icone
// Analyseur. Tu l'utilise pour rajouter un bouton analyseur dans la barre de
// simulation. Il n'apparaîtra que si une simulation avec analyseur logique
// existe et a été fermée et permettra de la rouvrir. »
//
// C'est toujours la SONDE qui ouvre l'analyseur (v2026.9.4.90) ; le bouton ne
// fait que rattraper un onglet fermé. Il se montre quand TROIS conditions
// tiennent : une pince posée sur le schéma (la page seule le sait), quelque
// chose à rouvrir (l'hôte seul le sait : onglet déjà vu ouvert, mesure dans le
// journal, capture d'un ancien .projix), et l'onglet fermé.
//
// Deux volets, chacun avec du VRAI code :
//   A. L'HÔTE. Vrais panel.ts (construit par `createForHost`, abonnement du
//      constructeur compris), analyseur-panel.ts et journal, faux `vscode`. On
//      suit les messages `analyseurOnglet` : page prête, run lancé, onglet
//      ouvert, onglet fermé, page rechargée, ancien .projix — et jamais de
//      doublon, ni de signal venu de l'onglet d'un AUTRE atelier.
//   B. LA PAGE (Chrome, VRAIE souris). Vrais HTML, CSS et sim.mts. Le bouton se
//      montre ou se cache selon les pinces et le signal de l'hôte, et un clic
//      réel, émis par Chrome en CDP, poste `openAnalyseur`.
//
// Contre-épreuve : `node scripts/verify-analyseur-bouton.mjs --ancien` prend
// les fichiers du lot dans HEAD (greffon esbuild, `git show`) — le banc DOIT
// alors échouer. `--ancien=src/panel.ts,…` n'en prend que certains.
import esbuild from 'esbuild';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-bouton-'));
const PORT = 9431; // port propre à ce banc : la suite lance les bancs CDP en parallèle

// Le journal vit sous os.tmpdir() : dossier PRIVÉ, sinon verify-analyseur-journal
// (peut-être lancé en même temps) balaierait nos journaux en plein banc.
const tempPrive = join(tmp, 'temp');
mkdirSync(tempPrive, { recursive: true });
process.env.TEMP = tempPrive;
process.env.TMP = tempPrive;
process.env.TMPDIR = tempPrive;

let ok = 0;
const echecs = [];
/** `cond` peut être une fonction : une exception vaut échec NOMMÉ, pas mort du banc. */
const check = (cond, titre, detail = '') => {
	let vrai = false;
	try { vrai = typeof cond === 'function' ? !!cond() : !!cond; } catch (e) { detail = `exception : ${e?.message ?? e}`; }
	if (vrai) { ok++; console.log(`  ✓ ${titre}`); return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Contre-épreuve : fichiers du lot pris dans HEAD -------------------------
const LOT = [
	'src/panel.ts',
	'src/analyseur-panel.ts',
	'src/webview-html.ts',
	'src/webview/sim.mts',
];
const argAncien = process.argv.find((a) => a.startsWith('--ancien'));
const ANCIENS = !argAncien ? [] : argAncien.includes('=') ? argAncien.split('=')[1].split(',') : LOT;
if (ANCIENS.length) console.log(`(contre-épreuve : ${ANCIENS.join(', ')} en version HEAD)`);
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /[\\/]src[\\/].*\.m?ts$/ }, (args) => {
			const rel = relative(ROOT, args.path).replace(/\\/g, '/');
			if (!ANCIENS.includes(rel)) return undefined;
			const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};

// ============================================================================
// A. L'HÔTE : le signal `analyseurOnglet`
// ============================================================================
console.log('A. hôte');
const STUB = `
import { posix } from 'node:path';
const vs = (globalThis.__vs ||= { panneaux: [] });
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p, with: () => uri(p) });
const rien = () => ({ dispose() {} });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (base, ...parts) => uri(posix.join(base.fsPath, ...parts)) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
function nouveauPanneau(viewType, title) {
  const p = {
    viewType, title, visible: true, recu: [],
    webview: {
      html: '', options: {}, cspSource: 'x:', asWebviewUri: (u) => u,
      postMessage(m) { p.recu.push(m); return Promise.resolve(true); },
      onDidReceiveMessage(f) { p._onMsg = f; return rien(); },
    },
    onDidDispose(f) { p._onDispose = f; return rien(); },
    onDidChangeViewState: rien,
    reveal() { p.visible = true; },
    dispose() { p._onDispose?.(); },
  };
  vs.panneaux.push(p);
  return p;
}
export const window = {
  createWebviewPanel: (viewType, title) => nouveauPanneau(viewType, title),
  registerWebviewPanelSerializer: rien,
  showSaveDialog: async () => undefined,
  showOpenDialog: async () => undefined,
  showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  setStatusBarMessage: rien,
  activeTextEditor: undefined,
  tabGroups: { all: [], close: async () => {} },
  onDidChangeActiveTextEditor: rien,
  registerCustomEditorProvider: rien,
  visibleTextEditors: [],
  createTextEditorDecorationType: rien,
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/espace') }],
  fs: { writeFile: async () => {}, readFile: async () => new Uint8Array(), stat: async () => ({ type: 1 }), delete: async () => {}, readDirectory: async () => [] },
  getConfiguration: () => ({ get: (_k, d) => d, update: async () => {} }),
  onDidChangeConfiguration: rien,
  onDidSaveTextDocument: rien,
  onDidChangeTextDocument: rien,
  onDidCloseTextDocument: rien,
  openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath),
  applyEdit: async () => true,
  createFileSystemWatcher: () => ({ onDidChange: rien, onDidCreate: rien, onDidDelete: rien, dispose() {} }),
};
export const debug = { breakpoints: [], onDidChangeBreakpoints: rien };
export const extensions = { getExtension: () => ({ packageJSON: {} }) };
export const commands = { executeCommand: async () => undefined, registerCommand: rien };
export const env = { clipboard: { readText: async () => '', writeText: async () => {} }, openExternal: async () => true, language: 'en' };
export const Range = class {}; export const Position = class {}; export const Selection = class {};
export const SourceBreakpoint = class {}; export const ThemeColor = class {};
export const TextEditorRevealType = { InCenterIfOutsideViewport: 2 };
export const ThemeIcon = class {}; export const EventEmitter = class { constructor() { this.event = rien; } fire() {} dispose() {} };
export const TextEdit = { replace: () => ({}) };
export const WorkspaceEdit = class { replace() {} };
export const Disposable = class { static from() { return { dispose() {} }; } dispose() {} };
export const TabInputCustom = class {}; export const TabInputText = class {};
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ProgressLocation = { Notification: 15 };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export const RelativePattern = class {};
export const OverviewRulerLane = { Full: 7 };
export default { Uri, ViewColumn, l10n, window, workspace, commands, env, debug, extensions };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
{
	const sortie = join(tmp, 'panel.mjs');
	await esbuild.build({
		entryPoints: [join(ROOT, 'src/panel.ts')],
		outfile: sortie, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
		alias: { vscode: join(tmp, 'vscode-stub.mjs') },
		plugins: [versionHead],
	});
	const { SimulatorPanel } = await import(pathToFileURL(sortie).href);
	const vs = globalThis.__vs;
	// Une exception (méthode absente sur l'ancien code) vaut échec NOMMÉ : le
	// volet page doit tourner quand même.
	try {

	const contexte = {
		extensionUri: { fsPath: 'W:/ext', scheme: 'file', path: 'W:/ext', toString: () => 'W:/ext' },
		globalState: { get: (_k, d) => d, update: async () => {}, keys: () => [] },
		workspaceState: { get: (_k, d) => d, update: async () => {}, keys: () => [] },
		subscriptions: [],
		extensionMode: 1,
	};
	/**
	 * Un atelier construit par le VRAI constructeur : c'est lui qui abonne la
	 * page aux ouvertures/fermetures d'onglet. `recu` = ce que la page reçoit.
	 */
	const atelier = () => {
		const hote = {
			recu: [],
			viewColumn: 1,
			webview: {
				html: '', options: {}, cspSource: 'x:', asWebviewUri: (u) => u,
				postMessage(m) { hote.recu.push(m); return Promise.resolve(true); },
				onDidReceiveMessage(f) { hote._onMsg = f; return { dispose() {} }; },
			},
			reveal() {},
			dispose() { hote._onDispose?.(); },
			onDidDispose(f) { hote._onDispose = f; },
			onDidChangeViewState() {},
			setDirtyIndicator() {},
		};
		const p = SimulatorPanel.createForHost(hote, contexte);
		return { p, hote };
	};
	/** Messages `analyseurOnglet` reçus depuis `depuis`, résumés « ouvert/rouvrable ». */
	const signaux = (hote, depuis = 0) => hote.recu.slice(depuis)
		.filter((m) => m?.type === 'analyseurOnglet')
		.map((m) => `${m.ouvert}/${m.rouvrable}`);
	/** Fait agir la page et rend les signaux que ce geste a produits. */
	const geste = (hote, msg) => {
		const avant = hote.recu.length;
		hote._onMsg(msg);
		return signaux(hote, avant);
	};
	const VOIES = [{ voie: 0, pin: 'GP14', nom: 'SDA', probleme: null, analogique: false, suivi: false }];

	// A1. Le parcours complet d'une session.
	const a = atelier();
	check(() => geste(a.hote, { type: 'ready' }).join(' ') === 'false/false',
		'A1 : page prête, rien encore mesuré — onglet fermé, rien à rouvrir (bouton caché)', signaux(a.hote).join(' '));
	check(() => geste(a.hote, { type: 'analyseurVoies', voies: VOIES }).length === 0,
		'A1 : poser une pince ne dit rien de plus (les pinces, la page les connaît)', signaux(a.hote).join(' '));
	check(() => geste(a.hote, { type: 'analyseurDepart' }).join(' ') === 'false/true',
		'A1 : run lancé sans onglet — le journal tient une mesure, elle est à rouvrir', signaux(a.hote).join(' '));
	check(() => geste(a.hote, { type: 'analyseurFronts', salves: { GP14: [1, 1, 2, 0] } }).length === 0,
		'A1 : les salves de fronts ne répètent pas le signal', signaux(a.hote).join(' '));
	check(() => geste(a.hote, { type: 'openAnalyseur' }).join(' ') === 'true/true',
		'A1 : clic sur le bouton — l’onglet est ouvert, le bouton doit disparaître', signaux(a.hote).join(' '));
	const onglet = vs.panneaux.at(-1);
	onglet._onMsg?.({ type: 'analyseurPret' });
	check(() => signaux(a.hote).at(-1) === 'true/true' && geste(a.hote, { type: 'openAnalyseur' }).length === 0,
		'A1 : révéler un onglet déjà ouvert ne redit rien', signaux(a.hote).join(' '));
	{
		const avant = a.hote.recu.length;
		onglet.dispose();
		check(() => signaux(a.hote, avant).join(' ') === 'false/true',
			'A1 : onglet FERMÉ — la page l’apprend tout de suite et peut le rouvrir', signaux(a.hote).join(' '));
	}
	check(() => geste(a.hote, { type: 'ready' }).join(' ') === 'false/true',
		'A1 : page rechargée (elle a tout oublié) — l’état lui est redit', signaux(a.hote).join(' '));
	check(() => geste(a.hote, { type: 'openAnalyseur' }).join(' ') === 'true/true',
		'A1 : rouvert par le bouton', signaux(a.hote).join(' '));
	const onglet2 = vs.panneaux.at(-1);
	check(onglet2 !== onglet, 'A1 : c’est bien un NOUVEL onglet qui s’ouvre');

	// A2. Un onglet ouvert puis fermé AVANT tout run : il reste à rouvrir.
	const b = atelier();
	geste(b.hote, { type: 'ready' });
	check(() => geste(b.hote, { type: 'openAnalyseur' }).join(' ') === 'true/true',
		'A2 : second atelier, son onglet s’ouvre', signaux(b.hote).join(' '));
	{
		const ongletB = vs.panneaux.at(-1);
		const avantA = a.hote.recu.length;
		const avantB = b.hote.recu.length;
		ongletB.dispose();
		check(() => signaux(b.hote, avantB).join(' ') === 'false/true',
			'A2 : fermé sans avoir rien mesuré — rouvrable quand même (il a été ouvert)', signaux(b.hote).join(' '));
		check(() => signaux(a.hote, avantA).length === 0,
			'A2 : l’onglet d’un AUTRE atelier qui se ferme ne touche pas au bouton du premier', signaux(a.hote, avantA).join(' '));
	}
	{
		const avant = a.hote.recu.length;
		onglet2.dispose();
		check(() => signaux(a.hote, avant).join(' ') === 'false/true', 'A2 : le premier atelier suit toujours son propre onglet', signaux(a.hote).join(' '));
	}

	// A3. Ancien .projix : sa capture suffit à rendre l'analyseur rouvrable…
	const c = atelier();
	geste(c.hote, { type: 'ready' });
	{
		const avant = c.hote.recu.length;
		c.p.chargerAnalyseur({ voies: [{ voie: 0, pin: 'GP14', nom: 'SDA', fronts: [900, 1, 950, 0] }] });
		check(() => signaux(c.hote, avant).join(' ') === 'false/true',
			'A3 : projet chargé avec une capture — elle se rouvre sans avoir lancé la simulation', signaux(c.hote).join(' '));
	}
	{
		// …et un projet sans analyseur chargé à sa place retire le bouton.
		const avant = c.hote.recu.length;
		c.p.chargerAnalyseur(undefined);
		check(() => signaux(c.hote, avant).join(' ') === 'false/false',
			'A3 : projet sans capture chargé à sa place — plus rien à rouvrir', signaux(c.hote).join(' '));
	}
	for (const x of [a, b, c]) x.hote.dispose();
	} catch (err) {
		check(false, 'A : le volet hôte va jusqu’au bout', err?.message ?? String(err));
	}
}

// ============================================================================
// B. LA PAGE : vrais HTML, CSS et sim.mts, VRAIE souris
// ============================================================================
console.log('B. page');
{
	const CACHE = join(tmp, 'page');
	mkdirSync(CACHE, { recursive: true });
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
					'export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };',
				].join('\n'),
				loader: 'js',
			}));
		},
	};
	const htmlBundle = await esbuild.build({
		entryPoints: [join(ROOT, 'src', 'webview-html.ts')],
		bundle: true, format: 'esm', write: false, platform: 'node',
		external: ['node:crypto'], plugins: [fauxVscode, versionHead], absWorkingDir: ROOT,
	});
	writeFileSync(join(CACHE, 'html.mjs'), htmlBundle.outputFiles[0].text);
	const { buildWebviewHtml } = await import(pathToFileURL(join(CACHE, 'html.mjs')).href);
	// Les images de la page pointent sur le VRAI dossier media : l'icône du
	// bouton doit se charger pour de bon, pas seulement être nommée.
	const media = pathToFileURL(ROOT).href;
	let html = buildWebviewHtml({ asWebviewUri: (u) => String(u), cspSource: 'file:' }, media);

	// Le pont VS Code : il note les messages postés par la page.
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
	const bundle = await esbuild.build({
		entryPoints: [join(ROOT, 'src', 'webview', 'sim.mts')],
		bundle: true, format: 'iife', write: false, logLevel: 'silent',
		define: { __BUILD_NUMBER__: JSON.stringify('test') },
		loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl', '.gif': 'dataurl', '.mp4': 'dataurl', '.ico': 'dataurl' },
		plugins: [versionHead],
		absWorkingDir: ROOT,
	});
	writeFileSync(join(CACHE, 'pont.js'), pont);
	writeFileSync(join(CACHE, 'bundle.js'), bundle.outputFiles[0].text);
	html = html.replace(/<script[^>]*src="[^"]*webview\.js"[^>]*>[\s\S]*?<\/script>/,
		'<script src="pont.js"></scr' + 'ipt><script src="bundle.js"></scr' + 'ipt>');
	html = html.replace(/<link[^>]*styles\.css[^>]*>/,
		`<style>${readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8')}</style>`);
	html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
	writeFileSync(join(CACHE, 'p.html'), html);

	const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
	if (!chrome) {
		check(false, 'B : Chrome introuvable — le volet page n’a pas pu tourner');
	} else {
		const profil = join(CACHE, 'profil');
		rmSync(profil, { recursive: true, force: true });
		const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
			`--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--window-size=1400,1000',
			pathToFileURL(join(CACHE, 'p.html')).href], { stdio: 'ignore' });
		let ws = null;
		try {
			let liste = null;
			// 30 s : sous verify:all, sept bancs en parallèle, Chrome met parfois plus de 10 s à ouvrir son port.
			for (let i = 0; i < 120 && !liste; i++) {
				try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
				catch { await attendre(250); }
			}
			if (!liste) throw new Error('Chrome ne répond pas sur le port de mise au point');
			const cible = liste.find((x) => x.type === 'page');
			ws = new WebSocket(cible.webSocketDebuggerUrl);
			let id = 0;
			const attentes = new Map();
			ws.addEventListener('message', (e) => {
				const m = JSON.parse(e.data);
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
			for (let i = 0; i < 150; i++) {
				if (await ev('(window.__msgs || []).some((m) => m && m.type === "ready")')) break;
				await attendre(200);
			}
			check(await ev('(window.__msgs || []).some((m) => m && m.type === "ready") && window.__err.length === 0'),
				'B : l’atelier démarre sans erreur et poste son « ready »', await ev('JSON.stringify(window.__err)'));

			/** Ce que l'élève voit du bouton : présent, affiché, taille, icône chargée. */
			const bouton = async () => JSON.parse(await ev(`(() => {
				const b = document.getElementById('open-analyseur');
				if (!b) return JSON.stringify({ existe: false });
				const r = b.getBoundingClientRect();
				const img = b.querySelector('img');
				const barre = b.closest('.canvas-controls');
				return JSON.stringify({
					existe: true,
					visible: !b.hidden && getComputedStyle(b).display !== 'none' && r.width > 0 && r.height > 0,
					x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
					w: Math.round(r.width), h: Math.round(r.height),
					icone: img ? img.getAttribute('src') : '',
					iconeChargee: !!img && img.complete && img.naturalWidth > 0,
					barre: barre ? barre.getAttribute('role') === 'toolbar' && !barre.classList.contains('canvas-controls--right') : false,
					titre: b.getAttribute('title') || '',
				});
			})()`));
			/** Message de l'hôte, reçu comme la page reçoit ceux de VS Code. */
			const hote = async (msg) => {
				await ev(`window.postMessage(${JSON.stringify(msg)}, '*')`);
				await attendre(120);
			};
			const onglet = (ouvert, rouvrable) => hote({ type: 'analyseurOnglet', ouvert, rouvrable });
			const projet = (parts) => hote({ type: 'loadProject', diagram: { parts, wires: [] }, board: 'pico', customParts: [] });
			const PICO = { id: 'pico', type: 'pico', x: 100, y: 100 };
			const SONDE = { id: 'SD1', type: 'sonde-logique', x: 400, y: 100, attrs: { voie: '0' } };

			let e = await bouton();
			check(e.existe, 'B1 : le bouton existe dans la page', JSON.stringify(e));
			check(e.barre, 'B1 : il vit dans la barre de SIMULATION', JSON.stringify(e));
			check(e.existe && !e.visible, 'B1 : atelier neuf — bouton caché', JSON.stringify(e));

			await onglet(false, true);
			e = await bouton();
			check(e.existe && !e.visible, 'B2 : une mesure à rouvrir mais AUCUNE pince sur le schéma — caché', JSON.stringify(e));

			await projet([PICO, SONDE]);
			e = await bouton();
			check(e.visible, 'B3 : pince posée + onglet fermé + mesure à rouvrir — le bouton APPARAÎT', JSON.stringify(e));
			check(e.w >= 16 && e.h >= 16, 'B3 : il a une vraie taille de bouton', `${e.w}×${e.h}`);
			check(/analyseur\.svg$/.test(e.icone ?? ''), 'B3 : son image est l’icône Analyseur de Frank (media/analyseur.svg)', e.icone);
			check(e.iconeChargee, 'B3 : l’icône se charge pour de bon', e.icone);
			check(/reopen the logic analy[sz]er/i.test(e.titre), 'B3 : son info-bulle dit qu’il ROUVRE l’analyseur', e.titre);

			await onglet(true, true);
			e = await bouton();
			check(e.existe && !e.visible, 'B4 : onglet ouvert — bouton caché', JSON.stringify(e));

			await onglet(false, false);
			e = await bouton();
			check(e.existe && !e.visible, 'B5 : rien à rouvrir (jamais ouvert, rien mesuré) — caché : c’est la sonde qui ouvrira', JSON.stringify(e));

			// B6. Le GESTE : clic réel, émis par Chrome.
			await onglet(false, true);
			e = await bouton();
			const avant = await ev('window.__msgs.filter((m) => m && m.type === "openAnalyseur").length');
			if (e.visible) {
				const base = { x: e.x, y: e.y, button: 'left', clickCount: 1 };
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
				await attendre(200);
			}
			const apres = await ev('window.__msgs.filter((m) => m && m.type === "openAnalyseur").length');
			check(e.visible && apres === avant + 1, 'B6 : un VRAI clic sur le bouton demande à l’hôte de rouvrir l’analyseur (un seul openAnalyseur)',
				`${apres - avant} message(s)`);

			// B7. Dernière pince retirée : plus rien à rouvrir, même si l'hôte le permet.
			await projet([PICO]);
			e = await bouton();
			check(e.existe && !e.visible, 'B7 : dernière pince retirée — bouton caché', JSON.stringify(e));
			check(await ev('window.__err.length === 0'), 'B : aucune erreur dans la page', await ev('JSON.stringify(window.__err)'));
		} catch (err) {
			check(false, 'B : le volet page va jusqu’au bout', err?.message ?? String(err));
		} finally {
			try { ws?.close(); } catch { /* déjà fermé */ }
			proc.kill();
		}
	}
}

try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome tient peut-être encore son profil */ }
if (echecs.length) {
	console.log(`\nbouton analyseur : ${echecs.length} ÉCHEC(S) sur ${ok + echecs.length} contrôles.`);
	process.exit(1);
}
console.log(`\nbouton analyseur : ${ok} contrôles OK — le bouton rouvre un analyseur fermé, et seulement lui.`);
process.exit(0);
