// L'atelier s'ouvrait VIDE au hasard (retours de Frank : dht11, CI3-uno,
// ventilo — « le fichier diagram.json semble pourtant correct », « je ferme et
// rouvre VS Code et il apparaît »).
//
// Cause : `resolveCustomEditor` lit le `.projix` et poste `loadProject` en
// quelques millisecondes, alors que la webview met bien plus longtemps à charger
// son bundle. Le message partait donc AVANT que le script n'installe son
// écouteur ; le tampon interne de VS Code le rattrape la plupart du temps, mais
// pas toujours — et le schéma tombait dans le vide, sans la moindre erreur.
//
// Correction : tout envoi est MIS EN FILE tant que la webview n'a pas dit
// « ready », puis rejoué dans l'ordre. Ce banc exécute pour de vrai `panel.ts`
// avec un faux `vscode`, et vérifie la file de bout en bout.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-blank-'));

let ok = 0;
const fails = [];
const check = (label, cond, detail) => {
  if (cond) {
    ok++;
    console.log(`✅ ${label}`);
  } else {
    fails.push(label);
    console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

// --- Faux `vscode` : le strict nécessaire pour charger panel.ts.
const STUB = `
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (b, ...r) => uri([b.fsPath, ...r].join('/')) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const RelativePattern = class { constructor(base, pattern) { this.base = base?.fsPath ?? base; this.pattern = pattern; } };
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
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/projet') }],
  fs: { writeFile: async () => {}, readFile: async () => new Uint8Array(), stat: async () => ({ type: 1 }), delete: async () => {} },
  getConfiguration: () => ({ get: (_k, d) => d, update: async () => {} }),
  onDidSaveTextDocument: () => ({ dispose() {} }),
  onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidCloseTextDocument: () => ({ dispose() {} }),
  onDidChangeConfiguration: () => ({ dispose() {} }),
  openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath),
  applyEdit: async () => true,
  createFileSystemWatcher: () => ({ onDidDelete: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), onDidChange: () => ({ dispose() {} }), dispose() {} }),
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
export const debug = { breakpoints: [], onDidChangeBreakpoints: () => ({ dispose() {} }) };
export const extensions = { getExtension: () => undefined };
export default { Uri, ViewColumn, l10n, window, workspace, commands, env };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

const out = join(tmp, 'panel.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src/panel.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { SimulatorPanel } = await import(pathToFileURL(out).href);

/** Atelier minimal : on relève ce qui atteint VRAIMENT la webview. */
function atelier() {
  const p = Object.create(SimulatorPanel.prototype);
  p.recus = []; // messages réellement livrés à la vue
  p.panel = { webview: { postMessage: (m) => { p.recus.push(m); return Promise.resolve(true); } } };
  p.postQueue = [];
  p.webviewReady = false;
  p.disposables = [];
  p.watches = new Map();
  p.gone = new Set();
  p.context = { globalState: { get: (_k, d) => d, update: async () => {} } };
  p.postDebugVars = () => {};
  p.updateTitle = () => {};
  p.setCodeFile = () => {};
  p.postUiConfig = () => {};
  p.missingCodeFileRef = undefined;
  return p;
}
const types = (p) => p.recus.map((m) => m?.type);

// --- 1. Rien ne part avant que la webview écoute ------------------------------
{
  const p = atelier();
  p.post({ type: 'loadProject', diagram: { parts: [1, 2, 3] } });
  p.post({ type: 'projectName', name: 'dht11.Projix' });
  check('le schéma n\'est PAS jeté à une webview qui ne peut pas l\'entendre',
    p.recus.length === 0, `livrés trop tôt : ${types(p).join(', ')}`);
  check('il est mis de côté, pas perdu', p.postQueue.length === 2, `${p.postQueue.length} en attente`);
  check('un filet est armé au cas où « ready » n\'arriverait jamais',
    p.readyTimer !== undefined, 'sinon un bundle en erreur gèlerait tout envoi pour de bon');

  p.onMessage({ type: 'ready' });
  check('« ready » livre enfin le schéma', types(p).includes('loadProject'), types(p).join(', '));
  check('le schéma part AVANT le reste (l\'ordre d\'émission est gardé)',
    types(p)[0] === 'loadProject' && types(p)[1] === 'projectName', types(p).join(', '));
  check('le schéma livré est INTACT',
    JSON.stringify(p.recus[0].diagram) === JSON.stringify({ parts: [1, 2, 3] }));
  check('la file est vidée, pas rejouée deux fois', p.postQueue.length === 0);
  check('le filet est désarmé une fois la vue prête', p.readyTimer === undefined);
}

// --- 2. Après « ready », les envois repartent en direct ------------------------
{
  const p = atelier();
  p.onMessage({ type: 'ready' });
  const avant = p.recus.length;
  p.post({ type: 'serial', data: 'hello' });
  check('une fois la vue prête, plus aucune retenue',
    p.recus.length === avant + 1 && p.recus.at(-1).type === 'serial');
  check('la file reste vide (aucune fuite mémoire pendant la simulation)',
    p.postQueue.length === 0);
}

// --- 3. Un second « ready » (rechargement de la vue) ne rejoue rien de travers -
{
  const p = atelier();
  p.post({ type: 'loadProject' });
  p.onMessage({ type: 'ready' });
  const apres = p.recus.length;
  p.onMessage({ type: 'ready' });
  check('un « ready » de plus ne renvoie pas le schéma en double',
    p.recus.filter((m) => m.type === 'loadProject').length === 1,
    `${p.recus.filter((m) => m.type === 'loadProject').length} fois`);
  check('il repose seulement l\'état d\'ouverture habituel', p.recus.length > apres);
}

// --- 4. Le filet de sécurité finit par livrer ---------------------------------
{
  const p = atelier();
  p.post({ type: 'loadProject' });
  p.flushPostQueue(); // ce que fait le filet au bout de 20 s
  check('« ready » jamais reçu : le filet livre quand même (jamais pire qu\'avant)',
    types(p).includes('loadProject'));
}

// --- 5. La chaîne d'ouverture passe bien par là -------------------------------
{
  const panel = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
  const editor = readFileSync(join(ROOT, 'src/projix-editor.ts'), 'utf8');
  check('l\'ouverture d\'un .projix poste le schéma par la voie mise en file',
    /this\.post\(\{\s*\n?\s*type: 'loadProject'/.test(panel), 'openProjectFromBytes');
  check('le CustomEditor charge bien le fichier lu dans la session',
    /await session\.loadProjixBytes\(bytes, document\.uri\)/.test(editor));
  check('un seul chemin de sortie vers la vue (pas d\'envoi qui contourne la file)',
    (panel.match(/this\.panel\.webview\.postMessage\(/g) ?? []).length === 2,
    'post() et flushPostQueue() seulement');
  check('« ready » vide la file AVANT de reposer l\'état d\'ouverture',
    /case 'ready':[\s\S]{0,400}this\.flushPostQueue\(\);/.test(panel));
}

if (fails.length) {
  console.log(`\nopen-blank : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\nopen-blank : ${ok} contrôles OK — le schéma attend que la webview écoute, l'atelier ne s'ouvre plus vide.`);
