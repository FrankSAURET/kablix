// Banc : l'onglet d'analyseur doit SURVIVRE à un redémarrage de VS Code.
//
// LA PAGE GRISE DE FRANK (23/09), CAUSE RACINE. VS Code réaffiche au démarrage
// tous les onglets de webview qui étaient ouverts à la fermeture. Il ne les
// RESSUSCITE pas tout seul : l'extension doit enregistrer un
// `WebviewPanelSerializer` pour son viewType, sinon VS Code ne sait pas à qui
// rendre le panneau. Sans lui, l'onglet revient à l'écran mais reste un cadavre :
//   - il n'est plus dans le registre `AnalyseurPanel.ouverts`,
//   - donc `this.analyseur()` rend `undefined` dans panel.ts,
//   - donc AUCUN message (voies, depart, fronts) ne lui parvient jamais.
// L'utilisateur voit une page vide, sans même un nom de voie — pendant que le
// journal CSV, lui, se remplit correctement (il ne passe pas par l'onglet).
//
// C'est pourquoi trois bancs verts (relais de l'hôte, rendu de l'onglet,
// captures réelles) n'ont rien vu : tous partent d'un onglet ouvert par
// `AnalyseurPanel.ouvrir()`. Aucun ne rejouait un onglet RESTAURÉ.
//
// CE QU'IL MESURE : on simule l'API de VS Code, on « ferme et relance »
// l'extension avec un onglet resté ouvert, puis on rejoue une simulation et on
// compte les messages qui atteignent la page.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(tmpdir(), 'kablix-verif-analyseur-restaure');
mkdirSync(CACHE, { recursive: true });

let echecs = 0;
const check = (ok, quoi) => {
	console.log(`${ok ? '✓' : '✗'} ${quoi}`);
	if (!ok) echecs++;
};

// --- Une API `vscode` jouet, mais fidèle sur le point qui nous occupe : un
// panneau restauré est rendu par le SÉRIALISEUR, pas par createWebviewPanel.
// Le registre vit sur globalThis : le bundle et le banc importent ce module par
// deux chemins, et deux instances auraient chacune leur Map — le banc croirait
// alors qu'aucun sérialiseur n'a été posé.
const faux = `
const partage = (globalThis.__fauxVscode ||= { panneaux: [], serialiseurs: new Map() });
const panneaux = partage.panneaux;
export const serialiseurs = partage.serialiseurs;
class Emitter { constructor(){this.h=[];} event=(f)=>{this.h.push(f);return{dispose(){}};}; fire(v){for(const f of this.h)f(v);} }
function nouveauPanneau(viewType, title) {
	const recu = [];
	const p = {
		viewType, title, visible: true, active: true,
		recu,
		webview: {
			html: '',
			asWebviewUri: (u) => u,
			cspSource: '',
			postMessage(m) { recu.push(m); return Promise.resolve(true); },
			onDidReceiveMessage(f) { p._onMsg = f; return { dispose() {} }; },
		},
		onDidDispose(f) { p._onDispose = f; return { dispose() {} }; },
		onDidChangeViewState(f) { return { dispose() {} }; },
		reveal() { p.visible = true; },
		dispose() { p._onDispose?.(); },
	};
	panneaux.push(p);
	return p;
}
export const window = {
	createWebviewPanel: (viewType, title) => nouveauPanneau(viewType, title),
	registerWebviewPanelSerializer: (viewType, s) => { serialiseurs.set(viewType, s); return { dispose() {} }; },
	showErrorMessage() {}, showInformationMessage() {}, showWarningMessage() {},
	createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
	activeTextEditor: undefined,
	tabGroups: { all: [], onDidChangeTabs: new Emitter().event },
	onDidChangeActiveColorTheme: new Emitter().event,
	visibleTextEditors: [],
};
export const ViewColumn = { Beside: -2, One: 1, Two: 2 };
export const Uri = {
	file: (p) => ({ fsPath: p, path: p, scheme: 'file', toString: () => 'file://' + String(p).replace(/\\\\\\\\/g, '/') }),
	joinPath: (b, ...r) => Uri.file([b.fsPath, ...r].join('/')),
	parse: (s) => ({ fsPath: s, path: s, scheme: 'file', toString: () => s }),
};
export const workspace = {
	fs: { readFile: async () => new Uint8Array(), writeFile: async () => {}, stat: async () => ({}), delete: async () => {} },
	getConfiguration: () => ({ get: () => undefined, update: async () => {} }),
	onDidChangeConfiguration: new Emitter().event,
	workspaceFolders: [],
	openTextDocument: async () => ({}),
	applyEdit: async () => true,
};
export const commands = { executeCommand: async () => {}, registerCommand: () => ({ dispose() {} }) };
export const env = { openExternal: async () => {}, clipboard: { writeText: async () => {} }, language: 'fr' };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_, i) => a[i]) };
export const EventEmitter = Emitter;
export const Disposable = class { static from() { return { dispose() {} }; } dispose() {} };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export const ColorThemeKind = { Light: 1, Dark: 2 };
export const Position = class {}; export const Range = class {}; export const WorkspaceEdit = class {};
export const RelativePattern = class {};
export default { window, workspace, commands, env, l10n, Uri, ViewColumn, EventEmitter, Disposable, ExtensionMode, ColorThemeKind };
export { panneaux };
`;
writeFileSync(join(CACHE, 'faux-vscode.mjs'), faux);

const sortie = join(CACHE, 'panel.mjs');
await build({
	entryPoints: [join(ROOT, 'src/analyseur-panel.ts')],
	bundle: true, format: 'esm', platform: 'node', outfile: sortie,
	external: ['vscode'], absWorkingDir: ROOT,
	loader: { '.svg': 'text', '.webp': 'dataurl', '.html': 'text' },
	plugins: [{
		name: 'faux-vscode',
		setup(b) {
			b.onResolve({ filter: /^vscode$/ }, () => ({ path: join(CACHE, 'faux-vscode.mjs') }));
		},
	}],
});

const { AnalyseurPanel } = await import(pathToFileURL(sortie).href);
const vs = await import(pathToFileURL(join(CACHE, 'faux-vscode.mjs')).href);

const extUri = vs.Uri.file(ROOT);
const CLE = 'file:///W:/projet/sonde-logique-uno.projix';
const ETAT = () => ({ voies: [], capture: null });

// --- 1. Un sérialiseur DOIT être enregistré pour le viewType de l'analyseur.
// C'est la seule chose qui rende un onglet restauré à son extension.
check(typeof AnalyseurPanel.enregistrerRestauration === 'function',
	'AnalyseurPanel expose une reprise des onglets restaurés');

if (typeof AnalyseurPanel.enregistrerRestauration === 'function') {
	AnalyseurPanel.enregistrerRestauration(extUri, (cle) => ({
		etat: ETAT(),
		surReglages: () => {},
	}));
	check(vs.serialiseurs.has('kablix.analyseur'),
		'un WebviewPanelSerializer est posé sur le viewType kablix.analyseur');
}

// --- 2. LE CŒUR DU BANC : VS Code redémarre, l'onglet revient tout seul.
// Il n'est PAS passé par ouvrir() : il arrive par le sérialiseur, avec l'état
// que l'onglet avait mis de côté (sa clé de projet).
const s = vs.serialiseurs.get('kablix.analyseur');
if (!s) {
	console.log('✗ pas de sérialiseur : la suite du banc est sans objet');
	echecs++;
} else {
	// VS Code fabrique le panneau lui-même et le tend à l'extension.
	const restaure = vs.window.createWebviewPanel('kablix.analyseur', 'Logic analyzer — sonde-logique-uno');
	restaure.webview.html = ''; // comme au réveil : VS Code a gardé le DOM, pas nos abonnements
	await s.deserializeWebviewPanel(restaure, { cle: CLE });

	check(restaure.webview.html.length > 0,
		'la page de l’onglet restauré est réécrite (scripts réabonnés)');
	check(AnalyseurPanel.pour(CLE) !== undefined,
		'l’onglet restauré est REVENU dans le registre (this.analyseur() le trouve)');

	// --- 3. Une simulation part : l'onglet doit recevoir voies, depart, fronts.
	const vue = AnalyseurPanel.pour(CLE);
	if (vue) {
		// La page signale qu'elle est prête, comme le fait la vraie webview.
		restaure._onMsg?.({ type: 'analyseurPret' });
		vue.envoyer({ type: 'voies', voies: [{ voie: 0, pin: '8', nom: 'horloge', probleme: null, analogique: false, suivi: false }] });
		vue.envoyer({ type: 'depart' });
		vue.envoyer({ type: 'fronts', salves: { '8': [0, 1, 10, 0] } });

		const recu = restaure.recu;
		const voies = recu.filter((m) => m.type === 'voies' && (m.voies || []).length > 0);
		const fronts = recu.filter((m) => m.type === 'fronts');
		check(voies.length > 0, `l’onglet restauré reçoit ses voies (${voies.length} message(s))`);
		check(fronts.length > 0, `l’onglet restauré reçoit ses fronts (${fronts.length} salve(s))`);
	} else {
		console.log('✗ onglet introuvable : voies et fronts ne peuvent pas être mesurés');
		echecs += 2;
	}
}

// --- 4. Contre-mesure : un onglet restauré puis FERMÉ quitte bien le registre,
// sinon le suivant serait envoyé dans le vide.
{
	const p = AnalyseurPanel.pour(CLE);
	p?.['panel']?.dispose?.() ?? vs.panneaux.find((x) => x.viewType === 'kablix.analyseur')?.dispose();
	check(AnalyseurPanel.pour(CLE) === undefined,
		'un onglet restauré puis fermé sort du registre');
}

if (echecs) { console.log(`\n✗ ${echecs} échec(s) — un onglet d’analyseur restauré par VS Code reste sourd`); process.exit(1); }
console.log('\n✓ l’onglet d’analyseur survit à un redémarrage de VS Code');
