// Banc : l'EXPORT CSV de la mesure de l'analyseur logique (v2026.9.4.128).
//
// L'export recopie le journal de session (src/analyseur-journal.ts), déjà écrit
// au format CSV au fil de l'eau. Il traverse deux mondes, et le banc les prouve
// l'un après l'autre, chacun avec du VRAI code :
//
//   1. LA PAGE. Le vrai HTML de l'onglet (AnalyseurPanel.html) et le vrai
//      analyseur.mts tournent dans Chrome ; le bouton « Export CSV » est cliqué
//      à la VRAIE souris, par le protocole de mise au point (CDP) — un clic
//      fabriqué en JS ne prouve pas qu'un geste arrive (cf. verify-souris.mjs).
//      On exige qu'il parte UN message `analyseurExport`, et rien d'autre.
//
//   2. L'HÔTE. Le vrai panel.ts, empaqueté avec un faux `vscode`, reçoit une
//      mesure par ses messages ordinaires (voies, départ, fronts) et écrit dans
//      le vrai journal sur le disque. Puis l'export est demandé par le rappel de
//      l'onglet, comme en vrai. On exige que le fichier écrit soit, octet pour
//      octet, le journal — et qu'il n'y ait besoin d'aucun arrêt de simulation.
//
// Usage : node scripts/verify-analyseur-export.mjs
import esbuild from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-export-'));
const PORT = 9415; // port propre à ce banc : la suite enchaîne les bancs CDP en parallèle

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
const vs = (globalThis.__vs ||= { dialogues: [], ecrits: [], infos: [], erreurs: [], cible: undefined, ecritureEchoue: false });
const uri = (p) => ({ fsPath: p, scheme: p.startsWith('untitled:') ? 'untitled' : 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (base, ...parts) => uri(posix.join(base.fsPath, ...parts)) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const window = {
  showSaveDialog: async (o) => { vs.dialogues.push(o); return vs.cible; },
  showInformationMessage: (m) => { vs.infos.push(m); return Promise.resolve(undefined); },
  showErrorMessage: (m) => { vs.erreurs.push(m); return Promise.resolve(undefined); },
  showWarningMessage: () => Promise.resolve(undefined),
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
export const env = { clipboard: { readText: async () => '', writeText: async () => {} }, openExternal: async () => true, language: 'en' };
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
// 1. LA PAGE : un vrai clic sur le bouton envoie la demande d'export
// ============================================================================
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
	});
	// La CSP de l'onglet est GARDÉE : nos deux scripts reçoivent son nonce, comme
	// le vrai bundle. Le faux acquireVsCodeApi range les messages dans la page.
	const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
	check(!!nonce, 'page : la CSP de l’onglet porte un nonce');
	const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
	html = html
		.replace('</head>', `<script nonce="${nonce}">window.__msgs = []; window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(m); }, setState() {} });</script></head>`)
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
		const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
			`--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--window-size=1000,700',
			`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
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
			for (let i = 0; i < 40 && !(await prete()); i++) await attendre(250);
			check(await prete(), 'page : l’onglet se monte et se déclare prêt');

			const boite = JSON.parse(await ev(`(() => {
				const b = document.getElementById('exporter');
				if (!b) return 'null';
				const r = b.getBoundingClientRect();
				return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
					texte: b.textContent.trim(), barre: !!b.closest('.barre') });
			})()`));
			check(!!boite, 'page : le bouton d’export existe');
			check(boite && boite.w > 0 && boite.h > 0, 'page : le bouton d’export est visible', JSON.stringify(boite));
			check(boite?.barre, 'page : le bouton est dans la barre d’outils de l’onglet');
			check(boite?.texte === 'Export CSV', 'page : son libellé dit ce qu’il fait', boite?.texte);

			if (boite) {
				const avant = await ev('window.__msgs.length');
				// Clic RÉEL : Chrome produit lui-même pointerdown/mousedown/click.
				const base = { x: Math.round(boite.x), y: Math.round(boite.y), button: 'left', clickCount: 1 };
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
				await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
				await attendre(200);
				const nouveaux = JSON.parse(await ev(`JSON.stringify(window.__msgs.slice(${avant}))`));
				const exports = nouveaux.filter((m) => m.type === 'analyseurExport');
				check(exports.length === 1, 'page : un vrai clic envoie UNE demande d’export à l’hôte', JSON.stringify(nouveaux));
				check(exports.length === 1 && Object.keys(exports[0]).length === 1,
					'page : la demande ne porte AUCUNE donnée — la mesure est côté hôte', JSON.stringify(exports[0]));
				check(!nouveaux.some((m) => m.type === 'analyseurReglages'),
					'page : exporter ne touche pas aux réglages (le projet ne passe pas « à enregistrer »)', JSON.stringify(nouveaux));
			}
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
	}],
});
const { SimulatorPanel } = await import(pathToFileURL(sortie).href);
const vs = globalThis.__vs;
const remettre = () => {
	vs.dialogues.length = 0; vs.ecrits.length = 0; vs.infos.length = 0; vs.erreurs.length = 0;
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
async function exporter(p) {
	globalThis.__an = undefined;
	p.ouvrirAnalyseur();
	const rappel = globalThis.__an?.onMsg;
	if (typeof rappel !== 'function') throw new Error('rappel de l’onglet absent');
	rappel({ type: 'analyseurExport' });
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
		const dossier = join(tempPrive, 'kablix-analyseur');
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
	check(texte === journal, 'mesure : le CSV exporté EST le journal, octet pour octet',
		`${texte.length} contre ${journal.length} caractères`);
	const lignes = texte.split('\n');
	check(lignes.includes('temps_ms,voie,broche,nom,niveau'), 'mesure : la ligne de colonnes est là');
	check(lignes.includes('# voie 1 = GP15 (SCL, horloge)'), 'mesure : l’en-tête décrit les voies, le fichier se lit seul');
	const donnees = lignes.filter((l) => /^\d/.test(l));
	check(donnees.length === 4, 'mesure : 4 fronts, aucun compté deux fois malgré le recouvrement', donnees.join(' | '));
	check(donnees.includes('0.75,1,GP15,"SCL, horloge",1'), 'mesure : un nom à virgule est cité, les colonnes restent justes', donnees.join(' | '));
	check(vs.infos.some((m) => m.includes('W:/sortie/banc-mesure.csv')), 'mesure : l’utilisateur est prévenu du chemin écrit', JSON.stringify(vs.infos));
	check(p.projectDirty === false, 'mesure : exporter ne met pas le projet « à enregistrer »');

	// Les fronts continuent d'arriver après l'export : un second export les a.
	remettre();
	p.onMessage({ type: 'analyseurFronts', salves: { GP15: [3, 0] } });
	vs.cible = { fsPath: 'W:/sortie/banc-2.csv' };
	await exporter(p);
	const second = (vs.ecrits[0]?.texte ?? '').split('\n').filter((l) => /^\d/.test(l));
	check(second.length === 5 && second.includes('3,1,GP15,"SCL, horloge",0'),
		'mesure : un second export, plus tard dans le run, porte les fronts arrivés entre-temps', second.join(' | '));

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
	check(relance.length === 1 && relance[0] === '0.1,0,GP14,SDA,1',
		'relance : l’export ne porte que la mesure du lancement en cours', relance.join(' | '));
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
	check(/^\s*\| \{ type: 'analyseurExport' \};$/m.test(panneauSrc), 'source : le message d’export est déclaré dans AnalyseurVersHote');
}

// Les journaux vivent dans le dossier privé du banc : il part en entier.
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome relâche son profil un peu tard */ }

// Un banc qui n'a rien mesuré n'est pas un banc vert.
const total = ok + echecs.length;
if (total < 30) {
	echecs.push('le banc a joué tous ses contrôles');
	console.log(`  ✗ le banc a joué tous ses contrôles — seulement ${total} contrôle(s)`);
}
console.log(echecs.length
	? `analyseur-export : ${echecs.length} échec(s) sur ${ok + echecs.length}.`
	: `analyseur-export : ${ok} contrôles OK — clic réel, journal recopié octet pour octet.`);
process.exit(echecs.length ? 1 : 0);
