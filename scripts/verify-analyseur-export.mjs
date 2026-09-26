// Banc : les EXPORTS de l'analyseur logique — menu ☰ (v2026.9.5.159), CSV
// (v2026.9.4.128, borné par M1 et M2 depuis la .159) et SVG copié ou enregistré.
//
// Le CSV recopie le journal de session (src/analyseur-journal.ts), déjà écrit au
// format CSV au fil de l'eau ; le SVG est dessiné par la page, au zoom affiché.
// Les exports traversent deux mondes, et le banc les prouve l'un après l'autre,
// chacun avec du VRAI code :
//
//   1. LA PAGE. Le vrai HTML de l'onglet (AnalyseurPanel.html) et le vrai
//      analyseur.mts tournent dans Chrome ; le bouton ☰ et les entrées de son
//      menu sont cliqués à la VRAIE souris, par le protocole de mise au point
//      (CDP) — un clic fabriqué en JS ne prouve pas qu'un geste arrive (cf.
//      verify-souris.mjs). M1 et M2 sont glissés de même. On exige les bons
//      messages, avec la bonne plage, et un SVG valide à l'échelle de l'écran.
//
//   2. L'HÔTE. Le vrai panel.ts, empaqueté avec un faux `vscode`, reçoit une
//      mesure par ses messages ordinaires (voies, départ, fronts) et écrit dans
//      le vrai journal sur le disque. Puis l'export est demandé par le rappel de
//      l'onglet, comme en vrai. On exige que le fichier écrit soit, octet pour
//      octet, le journal (ou sa découpe entre M1 et M2) — sans arrêt de
//      simulation — et que le SVG aille tel quel au presse-papier ou au fichier.
//
// Contre-épreuve sans toucher aux sources : `--ancien=<fichiers>` compile les
// fichiers de src/webview ou de src/ nommés dans leur version HEAD
// (ex. `--ancien=analyseur,panel`).
//
// Usage : node scripts/verify-analyseur-export.mjs [--ancien=a,b]
import esbuild from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-export-'));
const PORT = 9415; // port propre à ce banc : la suite enchaîne les bancs CDP en parallèle
const ancien = (process.argv.find((a) => a.startsWith('--ancien=')) ?? '').slice('--ancien='.length).split(',').filter(Boolean);

// Le journal vit sous os.tmpdir(). On le détourne vers un dossier PRIVÉ :
// verify-analyseur-journal, qui tourne peut-être en même temps, balaie les
// journaux « orphelins » de ce dossier et emporterait les nôtres en plein banc.
// Sous Windows, os.tmpdir() relit TEMP/TMP à chaque appel.
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
	if (vrai) { ok++; return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Faux `vscode` -----------------------------------------------------------
// Ce que panel.ts touche au chargement, plus les trois appels de l'export
// (dialogue, écriture, messages), tous ENREGISTRÉS dans globalThis.__vs pour que
// le banc voie ce que l'extension a réellement demandé.
// joinPath NORMALISE, comme le vrai (`path.posix.join`) : c'est ce qui fait de
// `projet.projix/../x.csv` un fichier à côté du projet.
const STUB = `
import { posix } from 'node:path';
const vs = (globalThis.__vs ||= { dialogues: [], ecrits: [], infos: [], erreurs: [], avertis: [], presse: [], cible: undefined, ecritureEchoue: false });
const uri = (p) => ({ fsPath: p, scheme: p.startsWith('untitled:') ? 'untitled' : 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (base, ...parts) => uri(posix.join(base.fsPath, ...parts)) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const window = {
  showSaveDialog: async (o) => { vs.dialogues.push(o); return vs.cible; },
  showInformationMessage: (m) => { vs.infos.push(m); return Promise.resolve(undefined); },
  showErrorMessage: (m) => { vs.erreurs.push(m); return Promise.resolve(undefined); },
  showWarningMessage: (m) => { vs.avertis.push(m); return Promise.resolve(undefined); },
  setStatusBarMessage: () => ({ dispose() {} }),
  createWebviewPanel: () => { throw new Error('non utilisé'); },
  registerWebviewPanelSerializer: () => ({ dispose() {} }),
  activeTextEditor: undefined,
  tabGroups: { all: [], close: async () => {} },
  onDidChangeActiveTextEditor: () => ({ dispose() {} }),
  registerCustomEditorProvider: () => ({ dispose() {} }),
  visibleTextEditors: [],
  createTextEditorDecorationType: () => ({ dispose() {} }),
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/espace') }],
  fs: {
    writeFile: async (u, octets) => {
      if (vs.ecritureEchoue) throw new Error('disque plein');
      vs.ecrits.push({ chemin: u.fsPath, texte: new TextDecoder().decode(octets) });
    },
    readFile: async () => new Uint8Array(), stat: async () => ({ type: 1 }), delete: async () => {},
  },
  getConfiguration: () => ({ get: (_k, d) => d, update: async () => {} }),
  onDidSaveTextDocument: () => ({ dispose() {} }),
  onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidCloseTextDocument: () => ({ dispose() {} }),
  openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath),
  applyEdit: async () => true,
  createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), onDidDelete: () => ({ dispose() {} }), dispose() {} }),
};
export const commands = { executeCommand: async () => undefined, registerCommand: () => ({ dispose() {} }) };
export const env = { clipboard: { readText: async () => '', writeText: async (t) => { vs.presse.push(t); } }, openExternal: async () => true, language: 'en' };
export const Range = class {}; export const Position = class {}; export const Selection = class {};
export const ThemeIcon = class {}; export const EventEmitter = class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} };
export const TextEdit = { replace: () => ({}) };
export const WorkspaceEdit = class { replace() {} };
export const Disposable = class { static from() { return { dispose() {} }; } dispose() {} };
export const TabInputCustom = class {}; export const TabInputText = class {};
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ProgressLocation = { Notification: 15 };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export const RelativePattern = class {};
export const OverviewRulerLane = { Full: 7 };
export default { Uri, ViewColumn, l10n, window, workspace, commands, env };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

// ============================================================================
// 1. LA PAGE : le menu ☰, ses trois entrées, M1 et M2 pour borner l'export
// ============================================================================
// Capture : deux voies en opposition, un front toutes les 0,5 ms sur 20 ms.
const fronts0 = [];
const fronts1 = [];
for (let k = 0; k < 40; k++) {
	fronts0.push(0.5 * k, k % 2 === 0 ? 1 : 0);
	fronts1.push(0.5 * k, k % 2 === 0 ? 0 : 1);
}
const ETAT = {
	voies: [
		{ voie: 0, nom: 'CLK', pin: 'GP2', fronts: fronts0, niveauInitial: 0 },
		{ voie: 1, nom: 'NCLK', pin: 'GP3', fronts: fronts1, niveauInitial: 1 },
	],
};
/** Remplace à la compilation les fichiers de `--ancien` par leur version HEAD. */
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /src[\\/](webview[\\/])?[^\\/]+\.m?ts$/ }, (args) => {
			const rel = args.path.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/');
			const nom = rel.split('/').pop().replace(/\.m?ts$/, '');
			if (!ancien.includes(nom)) return undefined;
			const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
if (ancien.length) console.log(`(contre-épreuve : ${ancien.join(', ')} en version HEAD)`);
{
	// Le vrai HTML de l'onglet, tel que l'hôte l'écrit dans la webview.
	const sortiePanneau = join(tmp, 'analyseur-panel.mjs');
	await esbuild.build({
		entryPoints: [join(ROOT, 'src/analyseur-panel.ts')],
		outfile: sortiePanneau, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
		alias: { vscode: join(tmp, 'vscode-stub.mjs') },
	});
	const { AnalyseurPanel } = await import(pathToFileURL(sortiePanneau).href);
	const webview = { asWebviewUri: (u) => u, cspSource: 'vscode-resource:' };
	let html = AnalyseurPanel.html(webview, { fsPath: 'W:/ext', path: 'W:/ext', toString: () => 'W:/ext' }, 'W:/projet/banc.projix');

	// Le vrai analyseur.mts, empaqueté comme esbuild.js le fait pour dist/.
	const page = await esbuild.build({
		entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
		bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
		plugins: [versionHead],
	});
	// La CSP de l'onglet est GARDÉE : nos deux scripts reçoivent son nonce, comme
	// le vrai bundle. Le faux acquireVsCodeApi range les messages dans la page ;
	// l'espion relève les textes peints (drapeaux M1/M2, graduations).
	const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
	check(!!nonce, 'page : la CSP de l’onglet porte un nonce');
	const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
	const ESPION = `
window.__msgs = [];
window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(m); }, setState() {} });
window.__peint = [];
const origine = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...r) {
	window.__peint.push({ t: String(t), x, y, align: this.textAlign });
	return origine.call(this, t, x, y, ...r);
};`;
	html = html
		.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
		.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
	check(!/<script[^>]*\ssrc=/.test(html), 'page : le script externe a bien été remplacé par le vrai bundle');
	const fichierPage = join(tmp, 'onglet.html');
	writeFileSync(fichierPage, html);

	const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
	if (!chrome) {
		check(false, 'page : Chrome introuvable — le clic réel n’a pas pu être joué');
	} else {
		const profil = join(tmp, 'profil');
		rmSync(profil, { recursive: true, force: true });
		const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
			`--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--window-size=1000,700',
			`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
		let ws = null;
		try {
			let liste = null;
			// 30 s : sous verify:all, sept bancs en parallèle, Chrome met parfois plus de 10 s à ouvrir son port.
			for (let i = 0; i < 120 && !liste; i++) {
				try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
				catch { await attendre(250); }
			}
			if (!liste) throw new Error('Chrome ne répond pas sur le port de mise au point');
			const cible = liste.find((c) => c.type === 'page');
			ws = new WebSocket(cible.webSocketDebuggerUrl);
			let id = 0;
			const attentes = new Map();
			ws.addEventListener('message', (ev) => {
				const m = JSON.parse(ev.data);
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
			// La page est montée quand elle a dit « prête » à l'hôte. Les premières
			// interrogations tombent encore sur about:blank : pas de __msgs.
			const prete = () => ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`);
			for (let i = 0; i < 120 && !(await prete()); i++) await attendre(250);
			check(await prete(), 'page : l’onglet se monte et se déclare prêt');
			// Presse-papier : permis comme VS Code le permet à ses webviews
			// (clipboard-sanitized-write), page tenue pour active (focus).
			await cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
			await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });

			// Thème sombre posé comme VS Code le fait : le SVG doit en garder le fond.
			await ev(`(() => {
				document.documentElement.style.setProperty('--vscode-editor-background', '#1f1f1f');
				document.documentElement.style.setProperty('--vscode-foreground', '#cccccc');
				document.body.className = 'vscode-dark';
			})()`);
			await ev(`window.postMessage(${JSON.stringify({ type: 'restaure', etat: ETAT })}, '*')`);
			await attendre(250);

			/** Clic RÉEL : Chrome produit lui-même pointerdown/mousedown/click. */
			const clic = async (x, y) => {
				const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
				await attendre(150);
			};
			const rectDe = async (sel) => JSON.parse(await ev(`(() => {
				const b = document.querySelector(${JSON.stringify(sel)});
				if (!b) return 'null';
				const r = b.getBoundingClientRect();
				return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, bottom: r.bottom,
					w: r.width, h: r.height, texte: b.textContent.trim() });
			})()`));
			const menuOuvert = async () => ev(`(() => { const m = document.getElementById('menu-export-liste'); return !!m && !m.hidden && m.offsetWidth > 0; })()`);
			const messagesApres = async (avant) => JSON.parse(await ev(`JSON.stringify(window.__msgs.slice(${avant}))`));
			/** Ouvre le menu ☰ et clique l'entrée demandée ; rend les messages partis. */
			const choisir = async (entree) => {
				const bouton = await rectDe('#menu-export');
				if (!bouton) throw new Error('bouton ☰ absent');
				await clic(bouton.x, bouton.y);
				const e = await rectDe(`#menu-export-liste button[data-export="${entree}"]`);
				if (!e || e.w === 0) throw new Error(`entrée ${entree} invisible`);
				const avant = await ev('window.__msgs.length');
				await clic(e.x, e.y);
				// La copie en image répond APRÈS l'écriture du presse-papier (PNG encodé) : on l'attend.
				for (let k = 0; k < 60 && !(await ev(`window.__msgs.slice(${avant}).some((m) => m.type === 'analyseurSvg' || m.type === 'analyseurExport')`)); k++) await attendre(50);
				return messagesApres(avant);
			};
			/** Ce que le presse-papier de ce Chrome contient (le sien : sans fenêtre, il n'est pas celui du système). */
			const pressePapier = async () => JSON.parse(await ev(`(async () => {
				try {
					const items = await navigator.clipboard.read();
					const out = [];
					for (const it of items) {
						for (const type of it.types) {
							const b = await it.getType(type);
							let info = { type, taille: b.size };
							if (type === 'image/svg+xml' || type === 'text/plain') info.texte = await b.text();
							if (type === 'image/png') {
								const img = await createImageBitmap(b);
								info.l = img.width; info.h = img.height;
							}
							out.push(info);
						}
					}
					return JSON.stringify(out);
				} catch (e) { return JSON.stringify([{ erreur: String(e) }]); }
			})()`));

			// --- Le bouton ☰ remplace « Export CSV » -----------------------------
			const bouton = await rectDe('#menu-export');
			check(!!bouton, 'menu : le bouton ☰ existe');
			check(bouton && bouton.w > 0 && bouton.h > 0, 'menu : le bouton ☰ est visible', JSON.stringify(bouton));
			check(bouton?.texte === '☰', 'menu : le bouton porte le signe ☰', bouton?.texte);
			check(await ev(`!!document.getElementById('menu-export')?.closest('.barre')`), 'menu : le bouton est dans la barre d’outils de l’onglet');
			check(!(await ev(`!!document.getElementById('exporter')`)), 'menu : l’ancien bouton « Export CSV » a disparu de la barre');
			check(!(await menuOuvert()), 'menu : fermé à l’ouverture de l’onglet');
			check(!(await ev(`!!document.querySelector('.flottant')`)),
				'menu : caché dans la page, il ne se fait pas passer pour le panneau ouvert d’une voie (.flottant)');

			// --- Ouverture, contenu, fermetures ------------------------------------
			if (bouton) {
				await clic(bouton.x, bouton.y);
				check(await menuOuvert(), 'menu : un vrai clic sur ☰ ouvre le menu');
				check(await ev(`document.getElementById('menu-export').getAttribute('aria-expanded') === 'true'`), 'menu : aria-expanded suit l’ouverture');
				const liste = await rectDe('#menu-export-liste');
				check(liste && liste.top >= bouton.bottom && liste.top <= bouton.bottom + 12 && Math.abs(liste.left - bouton.left) < 2,
					'menu : il s’ouvre juste sous le bouton', JSON.stringify({ liste, bouton }));
				const entrees = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#menu-export-liste button')].map((b) => [b.dataset.export, b.textContent.trim(), !!b.title]))`));
				check(JSON.stringify(entrees.map((x) => x[1])) === JSON.stringify(['Export CSV', 'Copy SVG', 'Export SVG']),
					'menu : trois entrées, Export CSV, Copy SVG, Export SVG', JSON.stringify(entrees));
				check(entrees.every((x) => x[2]), 'menu : chaque entrée a son infobulle');
				await clic(bouton.x, bouton.y);
				check(!(await menuOuvert()), 'menu : un second clic sur ☰ le referme');
				check(await ev(`document.getElementById('menu-export').getAttribute('aria-expanded') === 'false'`), 'menu : aria-expanded suit la fermeture');

				await clic(bouton.x, bouton.y);
				await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
				await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
				await attendre(100);
				check(!(await menuOuvert()), 'menu : Échap le referme');

				await clic(bouton.x, bouton.y);
				await clic(500, 650); // sous les pistes, dans le vide
				check(!(await menuOuvert()), 'menu : un clic à côté le referme');
			}

			// --- Sans marqueur : CSV entier, SVG de la fenêtre -------------------
			let msgs = await choisir('csv');
			check(!(await menuOuvert()), 'CSV : choisir une entrée referme le menu');
			let exports = msgs.filter((m) => m.type === 'analyseurExport');
			check(exports.length === 1 && !('plage' in exports[0]),
				'CSV : sans M1 ni M2, la demande ne porte aucune plage — toute la mesure', JSON.stringify(msgs));
			// Les colonnes : chaque voie, sous son nom (Frank, 26/09 : « seul Sig est exporté »).
			check(JSON.stringify(exports[0]?.voies) === JSON.stringify([{ voie: 0, pin: 'GP2', nom: 'CLK' }, { voie: 1, pin: 'GP3', nom: 'NCLK' }]),
				'CSV : la demande porte les voies de l’onglet, une colonne chacune', JSON.stringify(exports[0]?.voies));
			check(!msgs.some((m) => m.type === 'analyseurReglages'),
				'CSV : exporter ne touche pas aux réglages (le projet ne passe pas « à enregistrer »)', JSON.stringify(msgs));

			const toile = await rectDe('#trace');
			let svgPlage = '';
			msgs = await choisir('copier-svg');
			let svgs = msgs.filter((m) => m.type === 'analyseurSvg');
			check(svgs.length === 1 && svgs[0].action === 'copier' && /^<svg /.test(svgs[0].svg ?? ''),
				'SVG : « Copy SVG » envoie un SVG à copier', JSON.stringify(msgs).slice(0, 300));
			const largeurSvg = (s) => Number(/<svg [^>]*width="([\d.]+)"/.exec(s ?? '')?.[1]);
			check(Math.abs(largeurSvg(svgs[0]?.svg) - toile.w) < 0.5,
				'SVG : sans M1 ni M2, l’image fait la largeur de la vue', `${largeurSvg(svgs[0]?.svg)} contre ${toile.w}`);

			// --- Copie en IMAGE (Frank, 26/09 : « dans Word le texte, dans Inkscape rien ») ---
			check(svgs[0]?.copie === 'image',
				'copie : la page a écrit elle-même l’image et le dit à l’hôte (copie: image)', JSON.stringify(svgs.map((m) => m.copie)));
			const pp = await pressePapier();
			const types = pp.map((x) => x.type);
			check(types.includes('image/svg+xml'), 'copie : le presse-papier porte image/svg+xml (ce qu’Inkscape colle)', JSON.stringify(pp).slice(0, 300));
			check(types.includes('image/png'), 'copie : et image/png (Chrome le dépose aussi en bitmap : ce que Word colle)', JSON.stringify(types));
			check(!types.includes('text/plain'), 'copie : pas de texte — Word collait le code SVG', JSON.stringify(types));
			const ppSvg = pp.find((x) => x.type === 'image/svg+xml');
			check(ppSvg && /^<svg[\s>]/.test(ppSvg.texte ?? '') && (ppSvg.texte ?? '').includes('CLK'),
				'copie : le SVG du presse-papier est le dessin des courbes', (ppSvg?.texte ?? '').slice(0, 120));
			const ppPng = pp.find((x) => x.type === 'image/png');
			check(ppPng && Math.abs(ppPng.l - 2 * toile.w) <= 1 && ppPng.h > 40,
				'copie : le PNG est le même dessin, deux fois plus fin que l’écran', JSON.stringify(ppPng));
			// Écriture refusée par le navigateur : l'hôte reprend la main, en texte.
			await ev(`navigator.clipboard.write = () => Promise.reject(new DOMException('refus', 'NotAllowedError'))`);
			msgs = await choisir('copier-svg');
			await ev('delete navigator.clipboard.write');
			const repli = msgs.filter((m) => m.type === 'analyseurSvg');
			check(repli.length === 1 && !repli[0].copie && /^<svg /.test(repli[0].svg ?? ''),
				'copie : écriture refusée, le SVG part à l’hôte pour la copie en texte (repli)', JSON.stringify(repli.map((m) => [m.copie, m.svg?.length])));

			// --- M1 et M2 glissés à la vraie souris -------------------------------
			const glisser = async (x0, y0, x1, y1) => {
				const X = (x) => Math.round(toile.left + x);
				const Y = (y) => Math.round(toile.top + y);
				await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(x0), y: Y(y0), buttons: 0 });
				await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: X(x0), y: Y(y0), button: 'left', buttons: 1, clickCount: 1 });
				for (let k = 1; k <= 8; k++) {
					await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(x0 + ((x1 - x0) * k) / 8), y: Y(y0 + ((y1 - y0) * k) / 8), button: 'left', buttons: 1 });
					await attendre(15);
				}
				await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X(x1), y: Y(y1), button: 'left', buttons: 0, clickCount: 1 });
				await attendre(150);
			};
			const releve = async () => {
				await ev(`window.__peint = []`);
				await ev(`window.postMessage({ type: 'repeindre' }, '*')`);
				await attendre(80);
				return ev('window.__peint');
			};
			let vu = await releve();
			const grads = vu.filter((p) => p.align === 'center' && p.y < 22 && / ms$/.test(p.t))
				.map((p) => ({ t: parseFloat(p.t.replace(',', '.').replace(/\s/g, '')), x: p.x }));
			const [ga, gb] = [grads[1], grads[grads.length - 2]];
			const pxParMs = ga && gb ? (gb.x - ga.x) / (gb.t - ga.t) : NaN;
			const xDe = (t) => ga.x + (t - ga.t) * pxParMs;
			const Y_BANDE = 32;
			const drapeau = (nom) => vu.find((p) => p.t === nom) ?? null;
			check(Number.isFinite(pxParMs) && pxParMs > 0, 'marqueurs : l’échelle des temps se relit sur les graduations', JSON.stringify(grads.slice(0, 3)));
			if (Number.isFinite(pxParMs)) {
				await glisser(Math.round(drapeau('M1')?.x ?? 20), Y_BANDE, xDe(5), Y_BANDE);
				vu = await releve();
				await glisser(Math.round(drapeau('M2')?.x ?? 50), Y_BANDE, xDe(8), Y_BANDE);
				vu = await releve();
				check(Math.abs((drapeau('M1')?.x ?? 0) - xDe(5)) < 2 && Math.abs((drapeau('M2')?.x ?? 0) - xDe(8)) < 2,
					'marqueurs : M1 posé à 5 ms, M2 à 8 ms', `M1 ${drapeau('M1')?.x}, M2 ${drapeau('M2')?.x}, attendus ${xDe(5)}, ${xDe(8)}`);

				// CSV : la plage entre les deux marqueurs.
				msgs = await choisir('csv');
				exports = msgs.filter((m) => m.type === 'analyseurExport');
				const pl = exports[0]?.plage;
				check(exports.length === 1 && pl && Math.abs(pl.t1 - 5) < 1e-9 && Math.abs(pl.t2 - 8) < 1e-9,
					'CSV : M1 et M2 posés, la demande porte leur plage (5 → 8 ms)', JSON.stringify(msgs));

				// SVG : la plage, au zoom affiché.
				msgs = await choisir('copier-svg');
				svgs = msgs.filter((m) => m.type === 'analyseurSvg');
				const svg = svgs[0]?.svg ?? '';
				const attendue = 104 + 12 + 3 * pxParMs;
				check(svgs.length === 1 && Math.abs(largeurSvg(svg) - attendue) < 1,
					'SVG : entre M1 et M2, l’image a la largeur de 3 ms au zoom affiché', `${largeurSvg(svg)} contre ${attendue.toFixed(2)}`);
				// Le SVG relu par le navigateur : XML valide, image décodable, peinte.
				const lu = JSON.parse(await ev(`(async () => {
					const svg = ${JSON.stringify(svg)};
					const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
					const erreur = !!doc.querySelector('parsererror');
					const textes = [...doc.querySelectorAll('text')].map((t) => ({ t: t.textContent, x: +t.getAttribute('x'), y: +t.getAttribute('y'), a: t.getAttribute('text-anchor') }));
					const premier = doc.documentElement.firstElementChild;
					return JSON.stringify({ erreur, textes,
						fond: premier ? [premier.tagName, premier.getAttribute('fill'), premier.getAttribute('width')] : null });
				})()`));
				svgPlage = svg;
				check(!lu.erreur, 'SVG : le document est du XML valide');
				check(lu.fond?.[0] === 'rect' && lu.fond?.[1] === '#1f1f1f' && Math.abs(Number(lu.fond?.[2]) - attendue) < 1,
					'SVG : fond plein du thème en premier (textes clairs lisibles hors de VS Code)', JSON.stringify(lu.fond));
				const noms = lu.textes.map((t) => t.t);
				check(noms.includes('CLK') && noms.includes('NCLK'), 'SVG : les noms des voies y sont, en texte', JSON.stringify(noms.slice(0, 12)));
				const m1 = lu.textes.find((t) => t.t === 'M1');
				const m2 = lu.textes.find((t) => t.t === 'M2');
				check(m1 && m2 && Math.abs(m1.x - 104) < 1 && Math.abs(m2.x - (attendue - 12)) < 1,
					'SVG : M1 au début du tracé, M2 à la fin', JSON.stringify({ m1, m2 }));
				// Échelle des temps de l'image = celle de l'écran.
				const gSvg = lu.textes.filter((t) => t.a === 'middle' && t.y < 22 && / ms$/.test(t.t))
					.map((t) => ({ t: parseFloat(t.t.replace(',', '.').replace(/\s/g, '')), x: t.x }));
				// Sur 3 ms, une graduation tous les ~90 px n'en laisse qu'une ou deux :
				// chacune doit tomber à 104 + (t − 5) × px/ms de l'écran.
				check(gSvg.length >= 1 && gSvg.some((g) => g.t === 5) && gSvg.every((g) => Math.abs(g.x - (104 + (g.t - 5) * pxParMs)) < 1),
					'SVG : les graduations tombent à l’échelle de l’écran (5 ms sur M1)', JSON.stringify(gSvg));
				check(!/rgba\(|dominant-baseline|#[0-9a-f]{8}"/i.test(svg), 'SVG : ni rgba(), ni #rrggbbaa, ni dominant-baseline (lecteurs anciens)');
				check(!noms.includes('T') && !noms.includes('P'), 'SVG : sans les boutons T et P de la colonne des voies', JSON.stringify(noms));

				// « Export SVG » : même dessin, à enregistrer.
				msgs = await choisir('svg');
				const aEnreg = msgs.filter((m) => m.type === 'analyseurSvg');
				check(aEnreg.length === 1 && aEnreg[0].action === 'enregistrer' && aEnreg[0].svg === svg,
					'SVG : « Export SVG » envoie le même dessin, à enregistrer', JSON.stringify(aEnreg.map((m) => [m.action, m.svg?.length])));

				// Marqueurs trop proches à ce zoom : refus « étroit », rien de dessiné.
				await glisser(xDe(8), Y_BANDE, xDe(5.5), Y_BANDE);
				vu = await releve();
				msgs = await choisir('copier-svg');
				svgs = msgs.filter((m) => m.type === 'analyseurSvg');
				check(svgs.length === 1 && svgs[0].svg === '' && svgs[0].refus === 'etroit' && svgs[0].largeur > 0 && svgs[0].largeur < 40,
					'SVG : M1 et M2 trop proches à ce zoom, l’hôte est prévenu (refus « étroit »)', JSON.stringify(svgs));

				// Zoom très poussé (vraie molette), marqueurs écartés : refus « large ».
				await glisser(xDe(5), Y_BANDE, xDe(1), Y_BANDE);
				vu = await releve();
				check(Math.abs((drapeau('M1')?.x ?? 0) - xDe(1)) < 2 && Math.abs((drapeau('M2')?.x ?? 0) - xDe(5.5)) < 2,
					'marqueurs : M1 ramené à 1 ms, M2 resté à 5,5 ms', `M1 ${drapeau('M1')?.x}, M2 ${drapeau('M2')?.x}`);
				for (let k = 0; k < 30; k++) {
					await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(toile.left + toile.w / 2), y: Math.round(toile.top + 120), deltaX: 0, deltaY: -100 });
					await attendre(10);
				}
				await attendre(150);
				msgs = await choisir('copier-svg');
				svgs = msgs.filter((m) => m.type === 'analyseurSvg');
				check(svgs.length === 1 && svgs[0].svg === '' && svgs[0].refus === 'large' && svgs[0].largeur > 50000,
					'SVG : 4,5 ms à fort zoom dépasseraient 50 000 px, l’hôte est prévenu (refus « large »)', JSON.stringify(svgs));
			}

			// Pince NCLK passée sur la patte `-` d'une paire DMX : la colonne est
			// lue inversée, comme la piste — la demande le dit à l'hôte.
			const voiesMsg = [
				{ voie: 0, nom: 'CLK', pin: 'GP2', probleme: null, analogique: false },
				{ voie: 1, nom: 'NCLK', pin: 'GP3', probleme: null, analogique: false, inverse: true },
				{ voie: 2, nom: 'X', pin: '', probleme: 'nowhere', analogique: false },
			];
			await ev(`window.postMessage(${JSON.stringify({ type: 'voies', voies: voiesMsg })}, '*')`);
			await attendre(150);
			msgs = await choisir('csv');
			exports = msgs.filter((m) => m.type === 'analyseurExport');
			check(JSON.stringify(exports[0]?.voies) === JSON.stringify([{ voie: 0, pin: 'GP2', nom: 'CLK' }, { voie: 1, pin: 'GP3', nom: 'NCLK', inverse: true }]),
				'CSV : une voie inversée par son câblage part inversée ; une pince posée nulle part, pas de colonne', JSON.stringify(exports[0]?.voies));

			// Le SVG décodé comme IMAGE, et peint. Pas dans l'onglet : sa CSP (sans
			// img-src) y refuse toute image ; une page vierge n'en a pas.
			await cdp('Page.navigate', { url: 'about:blank' });
			await attendre(300);
			const image = JSON.parse(await ev(`(async () => {
				const img = new Image();
				img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svgPlage)});
				let decode = true;
				try { await img.decode(); } catch { decode = false; }
				if (!decode) return JSON.stringify({ decode });
				const c = document.createElement('canvas');
				c.width = img.naturalWidth; c.height = img.naturalHeight;
				const g = c.getContext('2d');
				g.drawImage(img, 0, 0);
				// Pixels « d'encre » dans la zone du tracé : ce qui n'est pas le fond.
				const px = g.getImageData(104, 62, Math.max(1, c.width - 116), Math.max(1, c.height - 70)).data;
				let encre = 0;
				for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - 0x1f) + Math.abs(px[i + 1] - 0x1f) + Math.abs(px[i + 2] - 0x1f) > 60) encre++;
				return JSON.stringify({ decode, w: img.naturalWidth, h: img.naturalHeight, encre });
			})()`));
			check(image.decode && image.w > 0 && image.h > 0, 'SVG : le navigateur le décode comme une image', JSON.stringify(image));
			check(image.encre > 500, 'SVG : les créneaux sont bien peints dans la zone du tracé', `${image.encre} pixels d’encre`);
		} catch (e) {
			check(false, 'page : le volet navigateur va jusqu’au bout sans exception', (e && e.stack) || String(e));
		} finally {
			try { ws?.close(); } catch { /* déjà fermé */ }
			proc.kill();
		}
	}
}

// ============================================================================
// 2. L'HÔTE : la demande d'export recopie le journal, octet pour octet
// ============================================================================
// L'onglet est une AUTRE webview : on ne garde que le rappel qu'il rend à
// l'atelier, rangé dans globalThis.__an par ce faux module.
writeFileSync(join(tmp, 'analyseur-panel-stub.mjs'), `
export class AnalyseurPanel {
  static ouvrir(_uri, _cle, _titre, etat, onMsg) { globalThis.__an = { etat, onMsg }; }
  static pour() { return undefined; }
  static suivreProjet() {}
}
`);
const sortie = join(tmp, 'panel.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src/panel.ts')],
	outfile: sortie, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
	plugins: [{
		name: 'analyseur-panel-stub',
		setup(b) {
			b.onResolve({ filter: /analyseur-panel$/ }, () => ({ path: join(tmp, 'analyseur-panel-stub.mjs') }));
		},
	}, versionHead],
});
const { SimulatorPanel } = await import(pathToFileURL(sortie).href);
const vs = globalThis.__vs;
const remettre = () => {
	vs.dialogues.length = 0; vs.ecrits.length = 0; vs.infos.length = 0; vs.erreurs.length = 0;
	vs.avertis.length = 0; vs.presse.length = 0;
	vs.cible = undefined; vs.ecritureEchoue = false;
};

let numero = 0;
/** Atelier minimal : pas de webview, pas d'onglet ouvert. `projet` absent =
 *  projet jamais enregistré. */
function atelier(projet) {
	const p = Object.create(SimulatorPanel.prototype);
	p.panelId = `banc-${++numero}`;
	if (projet) {
		p.documentUri = { fsPath: projet, scheme: 'file', toString: () => projet };
		p.projectUri = p.documentUri;
		p.projectBaseName = projet.replace(/^.*\//, '').replace(/\.projix$/, '');
	}
	p.projectDirty = false;
	p.analyseurVoies = [];
	p.analyseurCapture = null;
	p.analyseurReglages = null;
	p.post = () => {};
	p.updateTitle = () => {};
	p.panel = { onDocEdit: () => { p.projectDirty = true; } };
	p.analyseur = () => undefined;
	p.extensionUri = { fsPath: 'W:/ext', scheme: 'file' };
	return p;
}

/** Demande l'export comme l'onglet le fait : par le rappel posé à l'ouverture. */
async function exporter(p, msg = { type: 'analyseurExport' }) {
	globalThis.__an = undefined;
	p.ouvrirAnalyseur();
	const rappel = globalThis.__an?.onMsg;
	if (typeof rappel !== 'function') throw new Error('rappel de l’onglet absent');
	rappel(msg);
	// L'export est asynchrone (dialogue puis écriture) : on laisse filer.
	await attendre(50);
}

const VOIES = [
	{ voie: 0, pin: 'GP14', nom: 'SDA' },
	{ voie: 1, pin: 'GP15', nom: 'SCL, horloge' }, // la virgule doit être citée dans le CSV
];

// 2a) Rien de mesuré : on le DIT, on n'ouvre pas de dialogue, on n'écrit rien.
{
	remettre();
	const p = atelier('W:/projet/vide.projix');
	vs.cible = { fsPath: 'W:/sortie/vide.csv' };
	await exporter(p);
	check(vs.dialogues.length === 0, 'vide : pas de dialogue d’enregistrement sans mesure', `${vs.dialogues.length} dialogue(s)`);
	check(vs.ecrits.length === 0, 'vide : aucun fichier écrit');
	check(vs.infos.length === 1 && /no measurement/i.test(vs.infos[0]), 'vide : un message dit qu’il n’y a rien à exporter', JSON.stringify(vs.infos));

	// Une simulation lancée SANS aucun front reste « rien à exporter » : un
	// en-tête seul n'est pas une mesure.
	remettre();
	p.onMessage({ type: 'analyseurVoies', voies: VOIES });
	p.onMessage({ type: 'analyseurDepart' });
	await exporter(p);
	check(vs.dialogues.length === 0 && vs.infos.length === 1, 'vide : un départ sans front ne s’exporte pas encore');
}

// 2b) Une mesure EN COURS s'exporte telle quelle — aucun arrêt de simulation.
{
	remettre();
	const p = atelier('W:/projet/banc.projix');
	p.onMessage({ type: 'analyseurVoies', voies: VOIES });
	p.onMessage({ type: 'analyseurDepart' });
	p.onMessage({ type: 'analyseurFronts', salves: { GP14: [0.5, 1, 1.25, 0], GP15: [0.75, 1] } });
	// Salve qui recouvre la précédente : le journal ne doit rien compter deux fois.
	p.onMessage({ type: 'analyseurFronts', salves: { GP14: [0.5, 1, 1.25, 0, 2, 1] } });
	vs.cible = { fsPath: 'W:/sortie/banc-mesure.csv' };
	await exporter(p);

	let journal = null;
	try {
		// Un dossier par processus (v2026.9.5.139) : `kablix-analyseur/<pid>/`.
		const dossier = join(tempPrive, 'kablix-analyseur', String(process.pid));
		journal = readFileSync(join(dossier, readdirPremier(dossier, 'banc-')), 'utf8');
	} catch (e) {
		check(false, 'mesure : le journal de session est bien sur le disque', e.message);
	}
	check(vs.dialogues.length === 1, 'mesure : le dialogue d’enregistrement s’ouvre', `${vs.dialogues.length}`);
	const d = vs.dialogues[0] ?? {};
	check(d.defaultUri?.fsPath === 'W:/projet/banc-analyzer.csv',
		'mesure : le fichier est proposé À CÔTÉ du .projix, au nom du projet', d.defaultUri?.fsPath);
	check(JSON.stringify(Object.values(d.filters ?? {})) === '[["csv"]]', 'mesure : le filtre du dialogue est .csv', JSON.stringify(d.filters));
	check(vs.ecrits.length === 1 && vs.ecrits[0].chemin === 'W:/sortie/banc-mesure.csv',
		'mesure : le fichier est écrit là où l’utilisateur l’a choisi', JSON.stringify(vs.ecrits.map((e) => e.chemin)));
	const texte = vs.ecrits[0]?.texte ?? '';
	check(journal && journal.includes('temps_ms,voie,broche,nom,niveau'), 'mesure : le journal de session garde son format, une ligne par front');
	const lignes = texte.split('\n');
	check(lignes.includes('temps_ms,SDA,"SCL, horloge"'), 'mesure : une colonne par voie, le nom à virgule cité', lignes.find((l) => l.startsWith('temps_ms')));
	check(lignes.includes('# voie 1 = GP15 (SCL, horloge)'), 'mesure : l’en-tête décrit les voies, le fichier se lit seul');
	const donnees = lignes.filter((l) => /^\d/.test(l));
	// Fronts du journal : GP14 0,5→1 1,25→0 2→1 ; GP15 0,75→1. Deux lignes par
	// front (avant, après) au même instant ; case vide tant qu'une voie n'a pas bougé.
	check(JSON.stringify(donnees) === JSON.stringify(['0.5,1,', '0.75,1,', '0.75,1,1', '1.25,1,1', '1.25,0,1', '2,0,1', '2,1,1']),
		'mesure : fronts en créneaux (deux lignes au même instant), triés, aucun compté deux fois malgré le recouvrement', donnees.join(' | '));
	check(vs.infos.some((m) => m.includes('W:/sortie/banc-mesure.csv')), 'mesure : l’utilisateur est prévenu du chemin écrit', JSON.stringify(vs.infos));
	check(p.projectDirty === false, 'mesure : exporter ne met pas le projet « à enregistrer »');

	// Les fronts continuent d'arriver après l'export : un second export les a.
	remettre();
	p.onMessage({ type: 'analyseurFronts', salves: { GP15: [3, 0] } });
	vs.cible = { fsPath: 'W:/sortie/banc-2.csv' };
	await exporter(p);
	const second = (vs.ecrits[0]?.texte ?? '').split('\n').filter((l) => /^\d/.test(l));
	check(second.length === 9 && second.slice(-2).join('|') === '3,1,1|3,1,0',
		'mesure : un second export, plus tard dans le run, porte les fronts arrivés entre-temps', second.join(' | '));

	// Plage M1 → M2, donnée à l'envers : l'ordre des marqueurs ne compte pas.
	// Fronts du journal : GP14 0,5→1 1,25→0 2→1 ; GP15 0,75→1 3→0.
	remettre();
	vs.cible = { fsPath: 'W:/sortie/banc-plage.csv' };
	await exporter(p, { type: 'analyseurExport', plage: { t1: 2.5, t2: 1 } });
	const plageL = (vs.ecrits[0]?.texte ?? '').split('\n');
	const plageD = plageL.filter((l) => /^\d/.test(l));
	check(JSON.stringify(plageD) === JSON.stringify(['1,1,1', '1.25,1,1', '1.25,0,1', '2,0,1', '2,1,1', '2.5,1,1']),
		'plage : niveaux à M1, les seuls fronts entre M1 et M2, niveaux à M2', plageD.join(' | '));
	const iCol = plageL.findIndex((l) => l.startsWith('temps_ms,'));
	check(iCol > 0 && plageL.slice(0, iCol).some((l) => /^# plage exportée : de 1 à 2\.5 ms/.test(l)),
		'plage : l’en-tête dit la plage exportée, avant la ligne de colonnes', plageL.slice(0, iCol + 1).join(' | '));
	check(plageL.includes('# voie 1 = GP15 (SCL, horloge)'), 'plage : la description des voies est gardée');
	check(vs.dialogues[0]?.defaultUri?.fsPath === 'W:/projet/banc-analyzer.csv', 'plage : même fichier proposé qu’un export complet');

	// Plage sans front : le niveau de chaque voie seul, rien d'inventé.
	remettre();
	vs.cible = { fsPath: 'W:/sortie/banc-calme.csv' };
	await exporter(p, { type: 'analyseurExport', plage: { t1: 3.5, t2: 4 } });
	const calme = (vs.ecrits[0]?.texte ?? '').split('\n').filter((l) => /^\d/.test(l));
	check(JSON.stringify(calme) === JSON.stringify(['3.5,1,0', '4,1,0']),
		'plage : entre deux fronts, le niveau de chaque voie à M1 et à M2', calme.join(' | '));

	// Plage avant tout front : aucune ligne de données, pas de niveau inventé.
	remettre();
	vs.cible = { fsPath: 'W:/sortie/banc-tot.csv' };
	await exporter(p, { type: 'analyseurExport', plage: { t1: 0, t2: 0.25 } });
	const tot = (vs.ecrits[0]?.texte ?? '').split('\n').filter((l) => /^\d/.test(l));
	check(vs.ecrits.length === 1 && tot.length === 0, 'plage : avant le premier front, aucune donnée inventée', tot.join(' | '));

	// Dialogue annulé : rien n'est écrit, aucun message.
	remettre();
	vs.cible = undefined;
	await exporter(p);
	check(vs.dialogues.length === 1 && vs.ecrits.length === 0 && vs.infos.length === 0 && vs.erreurs.length === 0,
		'annulé : fermer le dialogue n’écrit rien et ne dit rien');

	// Écriture refusée par le disque : l'utilisateur le SAIT.
	remettre();
	vs.cible = { fsPath: 'W:/sortie/banc-3.csv' };
	vs.ecritureEchoue = true;
	await exporter(p);
	check(vs.erreurs.length === 1 && /disque plein/.test(vs.erreurs[0]), 'échec : une écriture refusée est signalée, pas avalée', JSON.stringify(vs.erreurs));

	// ONGLET RESTAURÉ au démarrage : il ne passe pas par ouvrirAnalyseur mais par
	// reprendreAnalyseur. Son bouton d'export doit marcher aussi — c'est l'onglet
	// que Frank retrouve en rouvrant VS Code.
	remettre();
	SimulatorPanel.panels.add(p);
	try {
		vs.cible = { fsPath: 'W:/sortie/banc-restaure.csv' };
		SimulatorPanel.reprendreAnalyseur(p.analyseurCle()).surReglages({ type: 'analyseurExport' });
		await attendre(50);
		check(vs.ecrits.length === 1 && vs.ecrits[0].chemin === 'W:/sortie/banc-restaure.csv',
			'restauré : l’export marche depuis un onglet rendu par VS Code au démarrage', JSON.stringify(vs.ecrits.map((e) => e.chemin)));
	} finally {
		SimulatorPanel.panels.delete(p);
	}

	// Nouveau départ : le journal repart de zéro, l'export aussi.
	remettre();
	p.onMessage({ type: 'analyseurDepart' });
	p.onMessage({ type: 'analyseurFronts', salves: { GP14: [0.1, 1] } });
	vs.cible = { fsPath: 'W:/sortie/banc-4.csv' };
	await exporter(p);
	const relance = (vs.ecrits[0]?.texte ?? '').split('\n').filter((l) => /^\d/.test(l));
	check(relance.length === 1 && relance[0] === '0.1,1,',
		'relance : l’export ne porte que la mesure du lancement en cours', relance.join(' | '));
}

// 2b bis) TROIS PINCES SUR UNE BROCHE (Frank, 26/09, dmx-uno : « il manque 2
// signaux sur 3, seul Sig est exporté »). Sig, DMX- et DMX+ écoutent la
// broche 3 ; le journal ne l'écrit qu'une fois. DMX- est lue inversée.
{
	remettre();
	const p = atelier('W:/projet/dmx.projix');
	const TROIS = [
		{ voie: 0, pin: '3', nom: 'Sig' },
		{ voie: 2, pin: '3', nom: 'DMX-' },
		{ voie: 3, pin: '3', nom: 'DMX+' },
	];
	p.onMessage({ type: 'analyseurVoies', voies: TROIS });
	p.onMessage({ type: 'analyseurDepart' });
	p.onMessage({ type: 'analyseurFronts', salves: { 3: [1, 1, 2, 0, 2.5, 1] } });
	vs.cible = { fsPath: 'W:/sortie/dmx.csv' };
	await exporter(p, { type: 'analyseurExport', voies: [TROIS[0], { ...TROIS[1], inverse: true }, TROIS[2]] });
	const l = (vs.ecrits[0]?.texte ?? '').split('\n');
	check(l.includes('temps_ms,Sig,DMX-,DMX+'), 'broche partagée : trois colonnes, une par pince', l.find((x) => x.startsWith('temps_ms')));
	check(JSON.stringify(l.filter((x) => /^\d/.test(x))) === JSON.stringify(['1,1,0,1', '2,1,0,1', '2,0,1,0', '2.5,0,1,0', '2.5,1,0,1']),
		'broche partagée : les trois voies suivent la broche, DMX- à l’envers', l.filter((x) => /^\d/.test(x)).join(' | '));
	check(l.includes('# voie 2 = 3 (DMX-), lue inversée'), 'broche partagée : l’en-tête dit que DMX- est lue inversée');

	// Sans colonnes données par l'onglet : celles que l'atelier a déclarées.
	remettre();
	vs.cible = { fsPath: 'W:/sortie/dmx-2.csv' };
	await exporter(p);
	const l2 = (vs.ecrits[0]?.texte ?? '').split('\n');
	check(l2.includes('temps_ms,Sig,DMX-,DMX+') && l2.includes('2,0,0,0'),
		'broche partagée : sans l’onglet, les voies du journal donnent les colonnes', l2.filter((x) => /^[t\d]/.test(x)).join(' | '));
}

// 2c) Projet jamais enregistré : pas de dossier, on se rabat sur l'espace de travail.
{
	remettre();
	const p = atelier(undefined);
	p.onMessage({ type: 'analyseurVoies', voies: VOIES });
	p.onMessage({ type: 'analyseurDepart' });
	p.onMessage({ type: 'analyseurFronts', salves: { GP14: [1, 1] } });
	vs.cible = { fsPath: 'W:/sortie/sans-nom.csv' };
	await exporter(p);
	check(vs.dialogues[0]?.defaultUri?.fsPath === 'W:/espace/kablix-analyzer.csv',
		'sans nom : le fichier est proposé dans l’espace de travail', vs.dialogues[0]?.defaultUri?.fsPath);
	check(vs.ecrits.length === 1, 'sans nom : l’export d’un projet jamais enregistré marche aussi');
}

// 2d) SVG : l'onglet dessine, l'hôte copie ou enregistre TEL QUEL.
{
	const p = atelier('W:/projet/banc.projix');
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="178" viewBox="0 0 300 178"><rect width="300" height="178" fill="#1f1f1f"/></svg>\n';

	remettre();
	await exporter(p, { type: 'analyseurSvg', action: 'copier', svg });
	check(vs.presse.length === 1 && vs.presse[0] === svg, 'svg : « Copy SVG » met le dessin tel quel au presse-papier', JSON.stringify(vs.presse).slice(0, 120));
	check(vs.infos.length === 1 && /clipboard/i.test(vs.infos[0]), 'svg : l’utilisateur est prévenu de la copie', JSON.stringify(vs.infos));
	check(vs.dialogues.length === 0 && vs.ecrits.length === 0, 'svg : copier n’ouvre aucun dialogue et n’écrit rien');

	// Copie en image déjà faite par l'onglet : l'hôte ne réécrit PAS le presse-papier en texte.
	remettre();
	await exporter(p, { type: 'analyseurSvg', action: 'copier', svg, copie: 'image' });
	check(vs.presse.length === 0, 'svg : image copiée par l’onglet, l’hôte n’écrase pas le presse-papier avec du texte', JSON.stringify(vs.presse).slice(0, 120));
	check(vs.infos.length === 1 && /picture/i.test(vs.infos[0]), 'svg : l’utilisateur est prévenu que c’est une image', JSON.stringify(vs.infos));
	check(vs.dialogues.length === 0 && vs.ecrits.length === 0, 'svg : ni dialogue ni fichier pour une copie en image');

	remettre();
	vs.cible = { fsPath: 'W:/sortie/courbes.svg' };
	await exporter(p, { type: 'analyseurSvg', action: 'enregistrer', svg });
	const d = vs.dialogues[0] ?? {};
	check(d.defaultUri?.fsPath === 'W:/projet/banc-analyzer.svg', 'svg : le fichier est proposé à côté du .projix, en .svg', d.defaultUri?.fsPath);
	check(JSON.stringify(Object.values(d.filters ?? {})) === '[["svg"]]', 'svg : le filtre du dialogue est .svg', JSON.stringify(d.filters));
	check(vs.ecrits.length === 1 && vs.ecrits[0].chemin === 'W:/sortie/courbes.svg' && vs.ecrits[0].texte === svg,
		'svg : « Export SVG » écrit le dessin, octet pour octet, là où l’utilisateur l’a choisi', JSON.stringify(vs.ecrits.map((e) => e.chemin)));
	check(vs.presse.length === 0, 'svg : enregistrer ne touche pas au presse-papier');

	// Refus décidés par l'onglet : dits à l'utilisateur, rien d'autre.
	const rien = () => vs.dialogues.length === 0 && vs.ecrits.length === 0 && vs.presse.length === 0;
	remettre();
	await exporter(p, { type: 'analyseurSvg', action: 'copier', svg: '', refus: 'vide' });
	check(rien() && vs.infos.length === 1 && /no measurement/i.test(vs.infos[0]), 'svg : sans mesure, on le dit et on ne fait rien', JSON.stringify(vs.infos));
	remettre();
	await exporter(p, { type: 'analyseurSvg', action: 'enregistrer', svg: '', refus: 'etroit', largeur: 23 });
	check(rien() && vs.avertis.length === 1 && /\b23\b/.test(vs.avertis[0]) && /zoom in/i.test(vs.avertis[0]),
		'svg : tracé trop étroit, avertissement avec sa largeur, sans dialogue', JSON.stringify(vs.avertis));
	remettre();
	await exporter(p, { type: 'analyseurSvg', action: 'copier', svg: '', refus: 'large', largeur: 61234 });
	check(rien() && vs.avertis.length === 1 && /\b61234\b/.test(vs.avertis[0]) && /zoom out/i.test(vs.avertis[0]),
		'svg : image trop large, avertissement avec sa largeur, presse-papier intact', JSON.stringify(vs.avertis));
	remettre();
	await exporter(p, { type: 'analyseurSvg', action: 'copier', svg: 'alert(1)' });
	check(rien() && vs.infos.length === 0 && vs.avertis.length === 0, 'svg : un contenu qui n’est pas un SVG est ignoré');
}

/** L'unique fichier d'un dossier dont le nom commence par `prefixe`. */
function readdirPremier(dossier, prefixe) {
	let noms = [];
	try { noms = readdirSync(dossier); } catch { /* dossier absent : zéro journal */ }
	noms = noms.filter((n) => n.startsWith(prefixe));
	if (noms.length !== 1) throw new Error(`${noms.length} journal(aux) « ${prefixe}* » dans ${dossier}`);
	return noms[0];
}

// Contrôles de source, ANCRÉS en début de ligne : un `if (false && …)` devant
// ne les laisserait pas verts.
{
	const panneauSrc = readFileSync(join(ROOT, 'src/analyseur-panel.ts'), 'utf8');
	check(/^\s*\| \{ type: 'analyseurExport'; plage\?: \{ t1: number; t2: number \}; voies\?: VoieExport\[\] \}$/m.test(panneauSrc), 'source : le message d’export CSV (plage et voies facultatives) est déclaré dans AnalyseurVersHote');
	check(/^\s*type: 'analyseurSvg';$/m.test(panneauSrc), 'source : le message d’export SVG est déclaré dans AnalyseurVersHote');
}

// Les journaux vivent dans le dossier privé du banc : il part en entier.
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome relâche son profil un peu tard */ }

// Un banc qui n'a rien mesuré n'est pas un banc vert.
const total = ok + echecs.length;
if (total < 80) {
	echecs.push('le banc a joué tous ses contrôles');
	console.log(`  ✗ le banc a joué tous ses contrôles — seulement ${total} contrôle(s)`);
}
console.log(echecs.length
	? `analyseur-export : ${echecs.length} échec(s) sur ${ok + echecs.length}.`
	: `analyseur-export : ${ok} contrôles OK — menu ☰ à la vraie souris, CSV borné par M1/M2, SVG à l’échelle de l’écran.`);
process.exit(echecs.length ? 1 : 0);
