// Fichier supprimé SOUS LE NEZ de l'atelier : son nom est BARRÉ en rouge.
//
// Demande de Frank : « Quand on supprime un fichier de code à l'extérieur et
// qu'il est ouvert, barre son nom en rouge. Fais pareil pour kablix. » VS Code
// barre l'onglet d'un fichier disparu ; Kablix, lui, affiche DEUX noms de
// fichier — le chip 📄 du programme et le nom du .Projix — qui restaient
// impassibles, laissant croire que le fichier était toujours là.
//
// Point dur : une suppression faite DEHORS (explorateur Windows, autre outil)
// ne déclenche AUCUN événement d'espace de travail (`onDidDeleteFiles` ne voit
// que les suppressions faites DANS VS Code). Seule une surveillance du système
// de fichiers la voit — c'est ce que ce banc vérifie, en exécutant pour de vrai
// `panel.ts` avec un faux `vscode` dont on pilote les surveillances.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-del-'));

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

// --- Faux `vscode` : seul ce dont panel.ts a besoin ici, plus des
//     surveillances de fichiers PILOTABLES (globalThis.__fsw).
const STUB = `
const uri = (p) => ({ fsPath: p, scheme: p.startsWith('untitled:') ? 'untitled' : 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = {
  file: (p) => uri(p),
  parse: (p) => uri(p),
  joinPath: (base, ...parts) => uri([base.fsPath, ...parts].join('/')),
};
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
  openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath),
  applyEdit: async () => true,
  // Chaque surveillance créée est enregistrée : le banc déclenche ensuite ses
  // événements à la main, comme le ferait le système de fichiers.
  createFileSystemWatcher: (pattern) => {
    const w = {
      pattern,
      base: pattern?.base ?? '',
      glob: pattern?.pattern ?? String(pattern),
      disposed: false,
      onDelete: [],
      onCreate: [],
      onDidDelete: (cb) => { w.onDelete.push(cb); return { dispose() {} }; },
      onDidCreate: (cb) => { w.onCreate.push(cb); return { dispose() {} }; },
      onDidChange: () => ({ dispose() {} }),
      dispose: () => { w.disposed = true; },
    };
    globalThis.__fsw.push(w);
    return w;
  },
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

/** Instance minimale (pas de webview) : on relève ce qui est POSTÉ à la vue. */
function atelier({ code, projet } = {}) {
  globalThis.__fsw = [];
  const p = Object.create(SimulatorPanel.prototype);
  p.disposables = [];
  p.watches = new Map();
  p.gone = new Set();
  p.posts = [];
  p.post = (msg) => p.posts.push(msg);
  p.postDebugVars = () => {};
  p.updateTitle = () => {};
  p.projectBaseName = projet ? projet.split(/[\\/]/).pop().replace(/\.projix$/i, '') : undefined;
  p.projectUri = projet ? { fsPath: projet, scheme: 'file' } : undefined;
  if (code) p.setCodeFile({ fsPath: code, scheme: 'file' });
  else p.postProjectName();
  return p;
}
const dernier = (p, type) => [...p.posts].reverse().find((m) => m.type === type);
const veille = (nom) => globalThis.__fsw.find((w) => w.glob === nom);

// --- 1. Le programme du projet ------------------------------------------------
{
  const p = atelier({ code: 'W:/projet/mon-programme.py', projet: 'W:/projet/demo.projix' });
  const w = veille('mon-programme.py');
  check('le programme est surveillé sur le disque (pas de motif large)',
    !!w && w.base === 'W:/projet/mon-programme.py/..',
    `surveillances posées : ${globalThis.__fsw.map((x) => x.glob).join(', ')}`);
  check('tant qu\'il est là, rien n\'est barré', dernier(p, 'codeFile')?.deleted === false);

  p.posts.length = 0;
  w.onDelete.forEach((cb) => cb({ fsPath: 'W:/projet/mon-programme.py' }));
  const efface = dernier(p, 'codeFile');
  check('supprimé DEHORS : la vue est prévenue tout de suite',
    efface?.deleted === true, JSON.stringify(efface ?? null));
  check('le nom reste affiché (c\'est LUI qu\'on barre)', efface?.name === 'mon-programme.py');

  p.posts.length = 0;
  w.onCreate.forEach((cb) => cb({ fsPath: 'W:/projet/mon-programme.py' }));
  check('rétabli (annulation, corbeille) : le nom redevient normal',
    dernier(p, 'codeFile')?.deleted === false,
    'sinon il resterait barré pour de bon');

  // Deux fois le même événement ne doit pas inonder la vue.
  p.posts.length = 0;
  w.onCreate.forEach((cb) => cb({}));
  check('un événement qui ne change rien ne renvoie rien', p.posts.length === 0);
}

// --- 2. Le .Projix lui-même ---------------------------------------------------
{
  const p = atelier({ code: 'W:/projet/mon-programme.py', projet: 'W:/projet/demo.projix' });
  const w = veille('demo.projix');
  check('le projet ouvert est surveillé lui aussi', !!w);
  p.posts.length = 0;
  w.onDelete.forEach((cb) => cb({}));
  const efface = dernier(p, 'projectName');
  check('.Projix supprimé sous le nez : son nom est barré à son tour',
    efface?.deleted === true && efface?.name === 'demo.Projix', JSON.stringify(efface ?? null));
  check('le programme, lui, n\'est pas barré pour autant',
    dernier(p, 'codeFile')?.deleted !== true,
    'les deux noms sont indépendants');
}

// --- 3. Changer de fichier remet le compteur à zéro ---------------------------
{
  const p = atelier({ code: 'W:/projet/ancien.py', projet: 'W:/projet/demo.projix' });
  veille('ancien.py').onDelete.forEach((cb) => cb({}));
  check('l\'ancien programme est bien barré', dernier(p, 'codeFile')?.deleted === true);
  p.setCodeFile({ fsPath: 'W:/projet/nouveau.py', scheme: 'file' });
  check('choisir un AUTRE programme lève l\'alerte',
    dernier(p, 'codeFile')?.deleted === false,
    'l\'alerte de l\'ancien fichier ne doit pas suivre le nouveau');
  check('l\'ancienne surveillance est relâchée', veille('ancien.py').disposed === true);
  check('le nouveau programme est surveillé à son tour', !!veille('nouveau.py'));
}

// --- 4. Un projet jamais enregistré n'a rien à surveiller ---------------------
{
  atelier({ code: undefined, projet: undefined });
  check('projet « sans titre » : aucune surveillance inutile', globalThis.__fsw.length === 0);
}

// --- 5. Le rendu : nom BARRÉ EN ROUGE ----------------------------------------
{
  const css = readFileSync(join(ROOT, 'media/styles.css'), 'utf8');
  const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
  const i18n = readFileSync(join(ROOT, 'src/webview/i18n.mts'), 'utf8');
  const bloc = (sel) => (new RegExp(`\\${sel}[^{]*\\{([^}]*)\\}`).exec(css) ?? [])[1] ?? '';
  for (const [quoi, sel] of [['le programme', '.toolbar__file--deleted'], ['le projet', '.project-name--deleted']]) {
    const style = bloc(sel);
    check(`${quoi} : le nom est BARRÉ`, /text-decoration:\s*line-through/.test(style), sel);
    check(`${quoi} : le trait est ROUGE`, /text-decoration-color:\s*#f/i.test(style), style.trim());
  }
  check('la vue pose la classe sur le chip du programme',
    /codeFileBtn\.classList\.toggle\('toolbar__file--deleted', deleted\)/.test(sim));
  check('la vue pose la classe sur le nom du projet',
    /projectNameEl\.classList\.toggle\('project-name--deleted', currentProjectDeleted\)/.test(sim));
  check('un fichier supprimé ne peut plus être lancé (▶ demande un fichier)',
    /hasCodeFile = name !== null && !missing && !deleted;/.test(sim),
    'sinon ▶ compilerait un fichier qui n\'existe plus');
  check('les deux infobulles disent ce qui s\'est passé',
    /Code file \{0\} has been deleted/.test(sim) && /Project \{0\} has been deleted from disk/.test(sim));
  check('les deux infobulles sont traduites en français',
    /'Code file \{0\} has been deleted[^']*':\s*\n?\s*'Fichier de code/.test(i18n)
    && /'Project \{0\} has been deleted from disk[^']*':\s*\n?\s*'Projet \{0\} supprimé/.test(i18n));
}

if (fails.length) {
  console.log(`\ndeleted-file : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\ndeleted-file : ${ok} contrôles OK — un fichier supprimé sous le nez de l'atelier voit son nom barré en rouge.`);
