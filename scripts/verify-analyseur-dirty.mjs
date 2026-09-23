// Une mesure de l'analyseur met le projet « à enregistrer » (v2026.9.4.123).
//
// LE DÉFAUT. Frank, 23/09 : « 1 fichier simulé vers l'analyseur logique ne se
// note pas comme à enregistrer et donc se quitte sans sauvegarder les données ».
// La capture de l'analyseur EST gravée dans le .projix (buildProjixBytes →
// manifest.analyseur), mais rien ne posait le point ● : à la fermeture de
// l'onglet, VS Code ne demandait rien et la mesure partait à la poubelle.
//
// Trois messages changent ce que le fichier contiendra :
//   `analyseurCapture` (fin de simulation : la mesure elle-même),
//   `analyseurReglages` (déclenchement, décodages, échantillonnage, réglages de
//   voie — ils viennent de l'ONGLET, l'autre webview),
//   `analyseurDepart`  (un nouveau lancement JETTE la capture gravée).
//
// Ce banc ne lit pas des motifs de source : il bundle le VRAI panel.ts avec un
// faux `vscode`, pose une session, lui envoie ces messages et regarde deux
// choses à la fois — le point ● (onDocEdit) ET les octets réellement produits
// par buildProjixBytes. Un ● sans changement d'octets serait aussi faux qu'un
// changement d'octets sans ●.
//
// Usage : node scripts/verify-analyseur-dirty.mjs
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-dirty-'));

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
	if (cond) ok++;
	else {
		fails.push(label);
		console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
	}
};

// Faux `vscode` : seul ce que panel.ts touche au chargement du module.
const STUB = `
const uri = (p) => ({ fsPath: p, scheme: p.startsWith('untitled:') ? 'untitled' : 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (base, ...parts) => uri([base.fsPath, ...parts].join('/')) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const window = {
  showSaveDialog: async () => undefined,
  showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  setStatusBarMessage: () => ({ dispose() {} }),
  createWebviewPanel: () => { throw new Error('non utilisé'); },
  activeTextEditor: undefined,
  tabGroups: { all: [], close: async () => {} },
  onDidChangeActiveTextEditor: () => ({ dispose() {} }),
  registerCustomEditorProvider: () => ({ dispose() {} }),
  visibleTextEditors: [],
  createTextEditorDecorationType: () => ({ dispose() {} }),
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/projet') }],
  fs: { writeFile: async () => {}, readFile: async () => new Uint8Array(), stat: async () => ({ type: 1 }), delete: async () => {} },
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
export const env = { clipboard: { readText: async () => '', writeText: async () => {} }, openExternal: async () => true, language: 'fr' };
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

// L'onglet de l'analyseur est une AUTRE webview : ici on ne veut que le rappel
// qu'il rend à l'atelier (`ouvrir(..., onMsg)`), pas la page. Faux module qui le
// range dans une variable globale.
writeFileSync(join(tmp, 'analyseur-panel-stub.mjs'), `
export class AnalyseurPanel {
  static ouvrir(_uri, _cle, _titre, etat, onMsg) { globalThis.__an = { etat, onMsg }; }
  static pour() { return undefined; }
  static suivreProjet() {}
}
`);

const out = join(tmp, 'panel.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src/panel.ts')],
	outfile: out,
	bundle: true,
	platform: 'node',
	format: 'esm',
	logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
	plugins: [{
		name: 'analyseur-panel-stub',
		setup(b) {
			b.onResolve({ filter: /analyseur-panel$/ }, () => ({ path: join(tmp, 'analyseur-panel-stub.mjs') }));
		},
	}],
});
const { SimulatorPanel } = await import(pathToFileURL(out).href);

/** Session minimale : pas de webview, pas d'onglet d'analyseur ouvert. On note
 *  chaque appel à onDocEdit (le point ● natif du CustomEditor). */
function session({ capture = null, reglages = null } = {}) {
	const p = Object.create(SimulatorPanel.prototype);
	p.edits = 0;
	p.documentUri = { fsPath: 'W:/projet/demo.projix', scheme: 'file' };
	p.projectUri = p.documentUri;
	p.projectBaseName = 'demo';
	p.projectDirty = false;
	p.analyseurVoies = [];
	p.analyseurCapture = capture;
	p.analyseurReglages = reglages;
	p.post = () => {};
	p.updateTitle = () => {};
	p.panel = { onDocEdit: () => { p.edits++; } };
	// Aucun onglet d'analyseur ouvert : le relais ne doit rien changer au verdict.
	p.analyseur = () => undefined;
	return p;
}

/** Envoie un message d'atelier et rend le nombre de points ● posés. */
function envoyer(p, msg) {
	const avant = p.edits;
	p.onMessage(msg);
	return p.edits - avant;
}

const CAPTURE_A = { voies: [{ voie: 0, nom: 'SDA', pin: 'GP20', fronts: [0, 12, 40], niveauInitial: 1 }] };
const CAPTURE_B = { voies: [{ voie: 0, nom: 'SDA', pin: 'GP20', fronts: [0, 7, 19, 33], niveauInitial: 0 }] };

// 1) LE CAS DE FRANK : projet propre, on simule, l'atelier remonte sa capture.
{
	const p = session();
	const edits = envoyer(p, { type: 'analyseurCapture', capture: CAPTURE_A });
	check(edits === 1, 'capture : une mesure marque le projet « à enregistrer »', `${edits} edit(s)`);
	check(p.projectDirty === true, 'capture : projectDirty passe à vrai (fermeture → VS Code demande)');
	check(p.analyseurCapture === CAPTURE_A, 'capture : la mesure est bien rangée pour l’enregistrement');
}

// 2) …et elle est RÉELLEMENT dans les octets du .projix. Un ● qui ne
//    correspondrait à aucun changement de fichier serait un faux positif.
{
	const p = session();
	const vide = p.analyseurPourProjix();
	envoyer(p, { type: 'analyseurCapture', capture: CAPTURE_A });
	const plein = p.analyseurPourProjix();
	check(vide === undefined, 'octets : un projet sans mesure n’écrit pas de bloc analyseur');
	check(JSON.stringify(plein?.voies) === JSON.stringify(CAPTURE_A.voies),
		'octets : la mesure entre dans ce qui sera gravé (manifest.analyseur)');
}

// 3) Une capture IDENTIQUE ne salit pas : sinon rouvrir un projet et relancer la
//    même mesure demanderait un enregistrement sans rien avoir changé.
{
	const p = session({ capture: CAPTURE_A });
	const edits = envoyer(p, { type: 'analyseurCapture', capture: JSON.parse(JSON.stringify(CAPTURE_A)) });
	check(edits === 0, 'capture : une mesure identique ne marque rien', `${edits} edit(s)`);
	check(p.projectDirty === false, 'capture identique : le projet reste propre');
}

// 4) Une capture DIFFÉRENTE salit (deuxième run, fronts différents).
{
	const p = session({ capture: CAPTURE_A });
	const edits = envoyer(p, { type: 'analyseurCapture', capture: CAPTURE_B });
	check(edits === 1, 'capture : une mesure différente marque le projet', `${edits} edit(s)`);
}

// 5) RÉGLAGES venus de l'onglet (déclenchement, décodage, échantillonnage) : ils
//    sont gravés eux aussi, ils marquent donc le projet. Ils n'arrivent pas par
//    onMessage mais par le rappel passé à AnalyseurPanel.ouvrir : on relit ce
//    rappel en déclenchant l'ouverture, avec un faux AnalyseurPanel.
{
	const p = session();
	p.analyseurCle = () => 'W:/projet/demo.projix';
	p.analyseurTitre = () => 'demo';
	p.extensionUri = { fsPath: 'W:/ext', scheme: 'file' };
	// ouvrirAnalyseur passe le rappel en 5e argument d'AnalyseurPanel.ouvrir,
	// que le faux module range dans globalThis.__an.
	globalThis.__an = undefined;
	p.ouvrirAnalyseur();
	const rappel = globalThis.__an?.onMsg;
	check(typeof rappel === 'function', 'réglages : le rappel de l’onglet est bien posé');
	if (typeof rappel === 'function') {
		const e1 = (() => { const a = p.edits; rappel({ type: 'analyseurReglages', declenchement: { voie: 0, sens: 'montant' }, decodages: [], voiesReglages: {}, echantillonnage: 0 }); return p.edits - a; })();
		check(e1 === 1, 'réglages : poser un déclenchement marque le projet', `${e1} edit(s)`);
		const e2 = (() => { const a = p.edits; rappel({ type: 'analyseurReglages', declenchement: { voie: 0, sens: 'montant' }, decodages: [], voiesReglages: {}, echantillonnage: 0 }); return p.edits - a; })();
		check(e2 === 0, 'réglages : le MÊME réglage renvoyé ne marque rien', `${e2} edit(s)`);
		const e3 = (() => { const a = p.edits; rappel({ type: 'analyseurReglages', declenchement: { voie: 0, sens: 'montant' }, decodages: [{ type: 'i2c' }], voiesReglages: {}, echantillonnage: 0 }); return p.edits - a; })();
		check(e3 === 1, 'réglages : ajouter un décodage marque le projet', `${e3} edit(s)`);
	}
}

// 6) DÉPART : un nouveau lancement jette la capture gravée — le fichier du disque
//    en est changé, donc ●. Mais sans capture en place, il n'y a rien à jeter.
{
	const p = session({ capture: CAPTURE_A });
	const edits = envoyer(p, { type: 'analyseurDepart' });
	check(edits === 1, 'départ : relancer jette la mesure gravée et marque le projet', `${edits} edit(s)`);
	check(p.analyseurCapture === null, 'départ : la capture précédente est bien oubliée');
	const vierge = session();
	const e0 = envoyer(vierge, { type: 'analyseurDepart' });
	check(e0 === 0, 'départ : sans mesure gravée, rien à jeter, pas de ●', `${e0} edit(s)`);
}

// 7) OUVERTURE d'un projet : la capture relue du fichier ne salit RIEN (sinon
//    tout projet portant une mesure s'ouvrirait déjà « modifié »).
{
	const p = session();
	p.chargerAnalyseur({ voies: CAPTURE_A.voies, declenchement: { voie: 1, sens: 'descendant' } });
	check(p.edits === 0, 'ouverture : un projet relu avec sa mesure s’ouvre propre', `${p.edits} edit(s)`);
	check(p.projectDirty === false, 'ouverture : projectDirty reste faux');
}

// 8) Le ● doit être le ● NATIF du CustomEditor (edit empilé), pas un simple
//    titre : sans onDocEdit, VS Code ferme l'onglet sans rien demander.
{
	const panelSrc = (await import('node:fs')).readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
	check(/private markProjectDirty\(\): void \{[\s\S]{0,400}?this\.panel\.onDocEdit\?\.\(\);/.test(panelSrc),
		'natif : markProjectDirty empile bien un edit (point ● de VS Code)');
	// Motif ANCRÉ en début de ligne : sans cela un `if (false && …)` le laisserait
	// vert (vérifié — c'est le piège relevé au lot .122).
	check(/^\s*if \(this\.analyseurEmpreinte\(\) !== avant\) this\.markProjectDirty\(\);$/m.test(panelSrc),
		'source : le marquage passe par l’empreinte de ce qui sera gravé');
}

if (fails.length) {
	console.log(`\nanalyseur-dirty : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
	process.exit(1);
}
console.log(`\nanalyseur-dirty : ${ok} contrôles OK — une mesure ou un réglage d'analyseur met le projet « à enregistrer ».`);
