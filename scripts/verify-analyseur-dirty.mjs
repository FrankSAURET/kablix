// Ce que l'analyseur met — ou ne met plus — « à enregistrer » (v2026.9.4.124).
//
// HISTOIRE DE CE BANC. Au lot .123 il prouvait l'inverse de ce qu'il prouve
// aujourd'hui : la CAPTURE était gravée dans le .projix et devait poser le
// point ●. Au lot .124, Frank a tranché — une mesure n'est pas une pièce du
// projet. Elle vit désormais dans un journal CSV de session
// (src/analyseur-journal.ts), écrit au fil de l'eau et supprimé à la fermeture.
//
// LE BANC EST DONC RETOURNÉ, et c'est délibéré :
//   `analyseurCapture` NE DOIT PLUS marquer le projet (ni entrer dans les octets),
//   `analyseurDepart`  NE DOIT PLUS marquer le projet,
//   `analyseurReglages` DOIT TOUJOURS le marquer — déclenchement, décodages et
//   réglages de voie restent des préférences de projet, et elles pèsent
//   quelques octets.
//
// Il ne lit pas des motifs de source : il empaquette le VRAI panel.ts avec un
// faux `vscode`, pose une session, lui envoie ces messages et regarde deux
// choses à la fois — le point ● (onDocEdit) ET les octets réellement produits
// par buildProjixBytes. Un ● sans changement d'octets serait aussi faux qu'un
// changement d'octets sans ●.
//
// Usage : node scripts/verify-analyseur-dirty.mjs
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

// 1) LE NOUVEAU CONTRAT : une mesure qui remonte NE salit plus le projet.
//    Elle part dans le journal de session ; le .projix n'en sait rien.
{
	const p = session();
	const edits = envoyer(p, { type: 'analyseurCapture', capture: CAPTURE_A });
	check(edits === 0, 'capture : une mesure ne marque plus le projet', `${edits} edit(s)`);
	check(p.projectDirty === false, 'capture : le projet reste propre (la mesure est hors du fichier)');
}

// 2) …et elle n'entre PAS dans les octets du .projix. C'est ce qui évite au
//    fichier de grossir de dizaines de milliers de fronts.
{
	const p = session();
	envoyer(p, { type: 'analyseurCapture', capture: CAPTURE_A });
	const grave = p.analyseurPourProjix();
	check(grave === undefined || grave.voies === undefined,
		'octets : la mesure n’est plus gravée dans le .projix');
}

// 3) Quelle que soit la mesure — identique, différente, plus longue — le projet
//    ne bouge pas. Avant le lot .124, une capture différente posait le ●.
{
	const p = session();
	envoyer(p, { type: 'analyseurCapture', capture: CAPTURE_A });
	const edits = envoyer(p, { type: 'analyseurCapture', capture: CAPTURE_B });
	check(edits === 0, 'capture : une mesure différente ne marque pas davantage', `${edits} edit(s)`);
	check(p.projectDirty === false, 'capture : deux mesures de suite laissent le projet propre');
}

// 4) L'empreinte — ce qui décide du ● — doit être AVEUGLE à la mesure. Deux
//    sessions aux captures opposées mais aux mêmes réglages sont identiques
//    pour le .projix : c'est ce qui garantit qu'aucune mesure ne peut le salir.
{
	const reglages = { declenchement: { voie: 0, sens: 'montant' }, decodages: [], voiesReglages: {}, echantillonnage: 0 };
	const pa = session({ capture: CAPTURE_A, reglages });
	const pb = session({ capture: CAPTURE_B, reglages });
	check(pa.analyseurEmpreinte() === pb.analyseurEmpreinte(),
		'empreinte : deux mesures différentes donnent la même empreinte de projet');
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

// 6) DÉPART : relancer une simulation ne touche plus au fichier du projet.
//    C'est le journal de session qui repart de zéro, pas le .projix.
{
	const p = session({ capture: CAPTURE_A });
	const edits = envoyer(p, { type: 'analyseurDepart' });
	check(edits === 0, 'départ : relancer ne marque plus le projet', `${edits} edit(s)`);
	check(p.projectDirty === false, 'départ : le projet reste propre au lancement');
}

// 7) OUVERTURE d'un projet : la capture relue du fichier ne salit RIEN (sinon
//    tout projet portant une mesure s'ouvrirait déjà « modifié »).
{
	const p = session();
	p.chargerAnalyseur({ voies: CAPTURE_A.voies, declenchement: { voie: 1, sens: 'descendant' } });
	check(p.edits === 0, 'ouverture : un projet relu avec sa mesure s’ouvre propre', `${p.edits} edit(s)`);
	check(p.projectDirty === false, 'ouverture : projectDirty reste faux');
}

// 8) Contrôles de source. Motifs ANCRÉS en début de ligne : sans cela un
//    `if (false && …)` les laisserait verts (piège relevé au lot .122).
{
	const panelSrc = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
	check(/private markProjectDirty\(\): void \{[\s\S]{0,400}?this\.panel\.onDocEdit\?\.\(\);/.test(panelSrc),
		'natif : markProjectDirty empile bien un edit (point ● de VS Code)');
	check(/^\s*if \(this\.analyseurEmpreinte\(\) !== avant\) this\.markProjectDirty\(\);$/m.test(panelSrc),
		'source : le marquage passe par l’empreinte de ce qui sera gravé');
	// La capture ne doit plus être recopiée dans le bloc du .projix.
	check(!/\.\.\.\(voies && voies\.length > 0 \? \{ voies \} : \{\}\)/.test(panelSrc),
		'source : la capture n’est plus gravée dans le .projix');
	// Et elle doit partir au journal de session, au fil de l'eau.
	check(/^\s*this\.journalAnalyseur\(\)\.verser\(salves\);$/m.test(panelSrc),
		'source : les fronts partent au journal de session');
}

// --- Verdict --------------------------------------------------------------
if (fails.length > 0) {
	console.error(`analyseur-dirty : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
	process.exit(1);
}
console.log(`analyseur-dirty : ${ok} contrôles OK — la mesure ne salit plus le projet, les réglages si.`);

