// Que sort-il de l'hôte vers l'onglet, dans la séquence d'un LANCEMENT ?
// On empaquette le VRAI src/panel.ts avec un faux vscode, on lui envoie les
// messages exacts de l'atelier et on note ce qui part vers l'onglet.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-repro-hote-'));

const STUB = `
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (b, ...r) => uri([b.fsPath, ...r].join('/')) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\{(\d+)\}/g, (_m, i) => a[i]) };
export const window = {
  showSaveDialog: async () => undefined, showInformationMessage: () => Promise.resolve(),
  showErrorMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(),
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
  onDidCloseTextDocument: () => ({ dispose() {} }), openTextDocument: async () => { throw new Error('x'); },
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
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

// Faux onglet : il note tout ce qu'il reçoit, et à quel moment il est "ouvert".
writeFileSync(join(tmp, 'analyseur-panel-stub.mjs'), `
globalThis.__recu = [];
globalThis.__ouvert = null;
export class AnalyseurPanel {
  constructor(cle) { this.cle = cle; }
  static ouvrir(_u, cle, _t, fournirEtat, _onMsg) {
    const v = new AnalyseurPanel(cle);
    globalThis.__ouvert = v;
    globalThis.__cleOuverture = cle;
    // pousserEtat() du vrai module : voies puis restaure.
    const etat = fournirEtat();
    globalThis.__etatInitial = JSON.parse(JSON.stringify(etat));
    globalThis.__recu.push({ type: 'voies', voies: etat.voies });
    if (etat.capture) globalThis.__recu.push({ type: 'restaure', etat: etat.capture });
    return v;
  }
  static pour(cle) { return globalThis.__ouvert && globalThis.__ouvert.cle === cle ? globalThis.__ouvert : undefined; }
  static suivreProjet() {}
  envoyer(m) { globalThis.__recu.push(m); }
}
`);

const out = join(tmp, 'panel.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src/panel.ts')], outfile: out, bundle: true,
	platform: 'node', format: 'esm', logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
	plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /analyseur-panel$/ }, () => ({ path: join(tmp, 'analyseur-panel-stub.mjs') })); } }],
});
const { SimulatorPanel } = await import(pathToFileURL(out).href);

const VOIES = [
	{ voie: 0, pin: '8', nom: 'horloge', probleme: null, analogique: false, suivi: false },
	{ voie: 1, pin: '9', nom: '9', probleme: null, analogique: false, suivi: false },
	{ voie: 3, pin: 'A0', nom: 'A0', probleme: null, analogique: true, suivi: false },
];

const p = Object.create(SimulatorPanel.prototype);
p.panelId = 'p1';
p.documentUri = { fsPath: 'W:/projet/sonde-logique-uno.projix', scheme: 'file', toString: () => 'file:///W:/projet/sonde-logique-uno.projix' };
p.projectUri = p.documentUri;
p.projectBaseName = 'sonde-logique-uno';
p.projectDirty = false;
p.analyseurVoies = [];
p.analyseurCapture = null;
p.analyseurReglages = null;
p.extensionUri = { fsPath: 'W:/ext', scheme: 'file' };
p.post = () => {};
p.updateTitle = () => {};
p.panel = { onDocEdit: () => {} };

// LA SÉQUENCE RÉELLE D'UN LANCEMENT, dans l'ordre où sim.mts l'émet :
//   openAnalyseur  (startRun, avant tout le reste)
//   analyseurVoies (pousserVoiesLogiques)
//   analyseurDepart
//   analyseurFronts × n
p.onMessage({ type: 'openAnalyseur' });
p.onMessage({ type: 'analyseurVoies', voies: VOIES });
p.onMessage({ type: 'analyseurDepart' });
p.onMessage({ type: 'analyseurFronts', salves: { '8': [1, 1, 2, 0], '9': [1, 0], 'A0': [3, 1] } });
p.onMessage({ type: 'analyseurFronts', salves: { '8': [4, 1, 5, 0] } });

const recu = globalThis.__recu;
console.log('clé à l’ouverture :', globalThis.__cleOuverture);
console.log('état initial poussé :', JSON.stringify(globalThis.__etatInitial));
console.log('\nmessages reçus par l’onglet, dans l’ordre :');
for (const m of recu) {
	if (m.type === 'voies') console.log(`  voies (${m.voies.length}) ${JSON.stringify(m.voies.map((v) => v.pin))}`);
	else if (m.type === 'fronts') console.log(`  fronts ${JSON.stringify(Object.keys(m.salves))}`);
	else console.log(`  ${m.type}`);
}
const nbVoiesPleines = recu.filter((m) => m.type === 'voies' && m.voies.length > 0).length;
const nbFronts = recu.filter((m) => m.type === 'fronts').length;
console.log(`\nVERDICT : ${nbVoiesPleines} message(s) de voies NON VIDES, ${nbFronts} salve(s) de fronts.`);
if (nbVoiesPleines === 0) console.log('>>> L’ONGLET N’A JAMAIS REÇU SES VOIES : page vide garantie.');
if (nbFronts === 0) console.log('>>> L’ONGLET N’A JAMAIS REÇU DE FRONTS : page vide garantie.');
