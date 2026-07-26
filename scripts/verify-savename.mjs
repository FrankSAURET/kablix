// Nom proposé à l'enregistrement d'un projet .projix encore « untitled ».
//
// Régression signalée par Frank (v2026.7.197) : le BOUTON « Enregistrer »
// proposait bien le nom du fichier de code (mon-programme.projix), mais Ctrl+S
// proposait « Nouveau projet.projix ». Cause : le raccourci portait un `when`
// en deux morceaux — `activeCustomEditorId == 'kablix.projix' && resourceScheme
// == 'untitled'` — dont le second ne se vérifiait pas sur un .projix untitled,
// si bien que Ctrl+S retombait sur le save natif de VS Code.
//
// Le banc vérifie les DEUX bouts de la chaîne :
//   A. le raccourci et la commande (package.json + extension.ts) ;
//   B. la logique de nommage, exécutée pour de vrai : `saveProject` de panel.ts
//      est bundlé avec un faux `vscode` et on lit le `defaultUri` réellement
//      passé à showSaveDialog selon l'état (untitled + code, untitled sans code,
//      fichier déjà nommé).
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-savename-'));

let ok = 0;
const fails = [];
const check = (cond, label) => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}`);
  }
};

// ------------------------------------------- A. raccourci Ctrl+S et commande
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const ext = readFileSync(join(ROOT, 'src/extension.ts'), 'utf8');
const panelSrc = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');

const kb = (pkg.contributes.keybindings ?? []).find((k) => k.command === 'kablix.saveProjectSmart');
check(!!kb, 'package.json : Ctrl+S lié à kablix.saveProjectSmart');
check(kb?.key === 'ctrl+s' && kb?.mac === 'cmd+s', 'raccourci Ctrl+S / Cmd+S');
check(/activeCustomEditorId == 'kablix\.projix'/.test(kb?.when ?? ''), 'when : limité à l’onglet .projix');
check(!/resourceScheme/.test(kb?.when ?? ''), 'when : PLUS de condition resourceScheme (elle bloquait le raccourci)');
check(/registerCommand\('kablix\.saveProjectSmart'/.test(ext), 'extension.ts : commande enregistrée');
check(/panel\.saveSmart\(false\)/.test(ext), 'extension.ts : Ctrl+S appelle saveSmart — le chemin du bouton Enregistrer');
check(/case 'nativeSave':[\s\S]{0,400}?this\.saveSmart\(false\)/.test(panelSrc), 'panel.ts : le bouton Enregistrer appelle le MÊME saveSmart');

// ------------------------------------- B. nom réellement proposé au dialogue
// Faux `vscode` : seul ce dont panel.ts a besoin pour atteindre showSaveDialog.
const STUB = `
const uri = (p) => ({ fsPath: p, scheme: p.startsWith('untitled:') ? 'untitled' : 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = {
  file: (p) => uri(p),
  parse: (p) => uri(p),
  joinPath: (base, ...parts) => uri([base.fsPath, ...parts].join('/')),
};
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const window = {
  showSaveDialog: async (opts) => { globalThis.__save.dialogs.push(opts); return globalThis.__save.answer; },
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
  fs: {
    writeFile: async (target, bytes) => { globalThis.__save.written.push({ path: target.fsPath, size: bytes.length }); },
    readFile: async () => new Uint8Array(),
    stat: async () => ({ type: 1 }),
    delete: async () => {},
  },
  getConfiguration: () => ({ get: (_k, d) => d, update: async () => {} }),
  onDidSaveTextDocument: () => ({ dispose() {} }),
  onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidCloseTextDocument: () => ({ dispose() {} }),
  openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath),
  applyEdit: async () => true,
};
export const commands = {
  executeCommand: async (id, ...args) => { globalThis.__save.commands.push(id); return undefined; },
  registerCommand: () => ({ dispose() {} }),
};
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
  // Tout est embarqué (le bundle vit hors du projet, donc hors node_modules) —
  // seul `vscode` est remplacé par le stub.
  alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { SimulatorPanel } = await import(pathToFileURL(out).href);

/** Prépare une instance SANS passer par le constructeur (pas de webview ici) et
 *  lui pose l'état voulu, puis déclenche l'enregistrement comme le fait la
 *  webview en réponse à `requestSaveProject`. */
const saveWith = async ({ documentPath, codeFile, projectBaseName, projectPath }) => {
  globalThis.__save = { dialogs: [], written: [], commands: [], answer: undefined };
  const p = Object.create(SimulatorPanel.prototype);
  p.documentUri = documentPath ? { fsPath: documentPath, scheme: documentPath.startsWith('untitled:') ? 'untitled' : 'file' } : undefined;
  p.codeFileUri = codeFile ? { fsPath: codeFile, scheme: 'file' } : undefined;
  p.projectBaseName = projectBaseName;
  p.projectUri = projectPath ? { fsPath: projectPath, scheme: 'file' } : undefined;
  p.post = () => {};
  p.reportError = (e) => { throw e; };
  p.buildProjixBytes = async () => new Uint8Array([1, 2, 3]);
  p.rememberLastProject = () => {};
  p.postProjectName = () => {};
  p.reopenAsFile = async () => {};
  await p.saveProject({ parts: [], wires: [] }, 'uno');
  return globalThis.__save;
};

// 1) Cas de Frank : projet jamais enregistré + programme mon-programme.py.
const untitledWithCode = await saveWith({
  documentPath: 'untitled:Nouveau projet.projix',
  codeFile: 'W:/projet/mon-programme.py',
});
const proposed = untitledWithCode.dialogs[0]?.defaultUri?.fsPath ?? '';
check(untitledWithCode.dialogs.length === 1, 'untitled : un dialogue d’enregistrement est ouvert');
check(/mon-programme\.projix$/.test(proposed), `nom proposé = celui du code (obtenu ${JSON.stringify(proposed)})`);
check(!/Nouveau projet/.test(proposed), 'nom proposé : plus « Nouveau projet »');
check(/^W:\/projet\//.test(proposed), 'proposé dans le dossier du workspace');
check(untitledWithCode.written.length === 0, 'dialogue annulé → rien n’est écrit');

// 2) Untitled SANS code associé : repli générique (comportement inchangé).
const untitledNoCode = await saveWith({ documentPath: 'untitled:Nouveau projet.projix' });
check(/schema-kablix\.projix$/.test(untitledNoCode.dialogs[0]?.defaultUri?.fsPath ?? ''), 'untitled sans code : repli schema-kablix.projix');

// 3) Projet déjà enregistré : AUCUN dialogue, écriture directe au même endroit.
const named = await saveWith({
  documentPath: 'W:/projet/demo.projix',
  codeFile: 'W:/projet/mon-programme.py',
  projectBaseName: 'demo',
  projectPath: 'W:/projet/demo.projix',
});
check(named.dialogs.length === 0, 'projet nommé : pas de dialogue');
check(named.written[0]?.path === 'W:/projet/demo.projix', 'projet nommé : écrit au même endroit');

// 4) Le nom du PROJET l'emporte sur celui du code (projet ouvert puis « sous »).
const bothNames = await saveWith({
  documentPath: 'untitled:Nouveau projet.projix',
  codeFile: 'W:/projet/mon-programme.py',
  projectBaseName: 'ancien-projet',
});
check(/ancien-projet\.projix$/.test(bothNames.dialogs[0]?.defaultUri?.fsPath ?? ''), 'nom du projet prioritaire sur le nom du code');

// ---------------------------------------------------------------- C. aide
const usageFr = readFileSync(join(ROOT, 'docs/fr/USAGE.md'), 'utf8');
const usageEn = readFileSync(join(ROOT, 'docs/en/USAGE.md'), 'utf8');
check(/\|\s*`Ctrl\+S`\s*\|/.test(usageFr), 'aide FR : Ctrl+S dans le tableau des raccourcis');
check(/\|\s*`Ctrl\+S`\s*\|/.test(usageEn), 'aide EN : Ctrl+S dans le tableau des raccourcis');
check(/`Ctrl\+S`.{0,200}nom proposé est celui du \*\*code\*\*/s.test(usageFr), 'aide FR : nom proposé = celui du code');
check(/`Ctrl\+S`.{0,200}suggested name is the \*\*code\*\*/s.test(usageEn), 'aide EN : nom proposé = celui du code');

if (fails.length) {
  console.log(`\nsavename : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\nsavename : ${ok} contrôles OK — Ctrl+S propose le nom du fichier de code, comme le bouton Enregistrer.`);
