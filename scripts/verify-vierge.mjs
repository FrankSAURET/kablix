// Un « nouveau projet » JAMAIS touché réclamait un enregistrement à chaque
// changement de dossier (retour de Frank : « quand j'ouvre un nouveau dossier il
// veut toujours enregistrer un fichier nouveauprojet.projix alors qu'il n'y en a
// pas d'ouvert »).
//
// Cause : VS Code écrit un backup hot-exit de CHAQUE onglet, même intact. À la
// restauration, `resolveCustomEditor` remettait le point ● « non enregistré »
// sur tout untitled restauré, vierge ou non. Le faux ● se regravait ensuite dans
// le backup suivant (dirtyAtExit), si bien que la demande revenait POUR
// TOUJOURS, dans tous les dossiers ouverts ensuite.
//
// Correction : un schéma restauré VIERGE (aucun fil, aucune pièce hors la carte)
// n'a rien à perdre — pas de ●, pas de question. Dès qu'il contient quelque
// chose, le ● revient et le travail reste protégé.
//
// Ce banc exécute le VRAI `projix-editor.ts` (avec panel.ts et le vrai
// dézippage) sous un faux `vscode`, sur de vraies archives .projix.
//
// Usage : node scripts/verify-vierge.mjs
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-vierge-'));

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

// --- Faux `vscode` -----------------------------------------------------------
// Les octets rendus par `workspace.fs.readFile` sont pilotés par
// globalThis.__fichiers (clé = chemin), ce qui laisse le banc fabriquer un
// backup différent pour chaque scénario.
const STUB = `
const uri = (s) => {
  const i = s.indexOf(':');
  const scheme = i < 0 ? 'file' : s.slice(0, i);
  const path = i < 0 ? s : s.slice(i + 1);
  return { scheme, path, fsPath: path, toString: () => s, with: () => uri(s) };
};
export const Uri = { file: (p) => uri(p), parse: (s) => uri(s), joinPath: (b, ...r) => uri([b.fsPath, ...r].join('/')) };
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
  registerCustomEditorProvider: () => ({ dispose() {} }),
  activeTextEditor: undefined,
  visibleTextEditors: [],
  tabGroups: { all: [], activeTabGroup: undefined, close: async () => {} },
  onDidChangeActiveTextEditor: () => ({ dispose() {} }),
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/projet') }],
  fs: {
    writeFile: async () => {},
    readFile: async (u) => {
      const b = globalThis.__fichiers[u.toString()] ?? globalThis.__fichiers[u.path];
      if (!b) throw new Error('introuvable : ' + u.toString());
      return b;
    },
    stat: async () => ({ type: 1 }),
    delete: async () => {},
  },
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
export const ThemeIcon = class {};
export class EventEmitter {
  constructor() { this.ecouteurs = []; this.event = (fn) => { this.ecouteurs.push(fn); return { dispose: () => {} }; }; }
  fire(e) { for (const fn of this.ecouteurs) fn(e); }
  dispose() {}
}
export const TextEdit = { replace: () => ({}) };
export const WorkspaceEdit = class { replace() {} };
export const Disposable = class { static from() { return { dispose() {} }; } constructor(fn) { this.dispose = fn ?? (() => {}); } };
export const TabInputCustom = class { constructor(u, v) { this.uri = u; this.viewType = v; } };
export const TabInputText = class { constructor(u) { this.uri = u; } };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ProgressLocation = { Notification: 15 };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export const debug = { breakpoints: [], onDidChangeBreakpoints: () => ({ dispose() {} }) };
export const extensions = { getExtension: () => undefined };
export default { Uri, ViewColumn, l10n, window, workspace, commands, env };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
// Le vrai JSZip (projix.ts le charge paresseusement via ./zip.js).
writeFileSync(join(tmp, 'zip-stub.mjs'), "import JSZip from 'jszip';\nexport { JSZip };\n");

const out = join(tmp, 'editeur.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src/projix-editor.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  alias: { vscode: join(tmp, 'vscode-stub.mjs') },
  // Les stubs vivent hors du projet : sans ça esbuild ne retrouve pas jszip.
  nodePaths: [join(ROOT, 'node_modules')],
  plugins: [
    {
      name: 'zip-reel',
      setup(build) {
        build.onResolve({ filter: /^\.\/zip\.js$/ }, () => ({ path: join(tmp, 'zip-stub.mjs') }));
      },
    },
  ],
});
const { ProjixEditorProvider } = await import(pathToFileURL(out).href);
const { default: JSZip } = await import('jszip');

/** Fabrique une archive .projix (le vrai format : kablix.json + diagram.json). */
async function projix({ board = 'uno', dirtyAtExit, parts = [], wires = [] }) {
  const zip = new JSZip();
  zip.file(
    'kablix.json',
    JSON.stringify({ format: 'projix', version: 1, app: 'kablix', board, createdAt: '2026-09-02', dirtyAtExit })
  );
  zip.file('diagram.json', JSON.stringify({ parts, wires }));
  return zip.generateAsync({ type: 'uint8array' });
}

const CARTE = [{ id: 'uno1', type: 'uno', x: 0, y: 0 }];
const MONTAGE = [...CARTE, { id: 'led1', type: 'led', x: 100, y: 40 }];
const FIL = [{ id: 'w1', from: { partId: 'uno1', pin: '13' }, to: { partId: 'led1', pin: 'A' }, points: [] }];

/**
 * Rejoue une restauration hot-exit et dit si le point ● est apparu.
 * `backup` absent = ouverture normale (pas de restauration).
 */
async function restaure({ scheme, backup, fichier }) {
  globalThis.__fichiers = {};
  const nomDoc = scheme === 'untitled' ? 'untitled:Nouveau projet.projix' : 'file:W:/projet/horloge.projix';
  if (backup) globalThis.__fichiers['file:W:/backups/1'] = backup;
  if (fichier) globalThis.__fichiers[nomDoc] = fichier;

  const context = {
    extensionUri: { fsPath: ROOT, scheme: 'file', path: ROOT, toString: () => ROOT, with: () => undefined },
    globalState: { get: (_k, d) => d, update: async () => {} },
    workspaceState: { get: (_k, d) => d, update: async () => {} },
    subscriptions: [],
    extensionMode: 2,
  };
  const provider = new ProjixEditorProvider(context);
  let edits = 0;
  provider.onDidChangeCustomDocument(() => {
    edits++;
  });
  const doc = provider.openCustomDocument(
    { scheme, path: nomDoc.slice(nomDoc.indexOf(':') + 1), fsPath: nomDoc, toString: () => nomDoc },
    { backupId: backup ? 'file:W:/backups/1' : undefined }
  );
  const panel = {
    active: false,
    title: 'projet.projix',
    viewColumn: 1,
    webview: { options: {}, html: '', asWebviewUri: (u) => u, cspSource: '', postMessage: async () => true, onDidReceiveMessage: () => ({ dispose() {} }) },
    reveal: () => {},
    dispose: () => {},
    onDidDispose: () => ({ dispose() {} }),
    onDidChangeViewState: () => ({ dispose() {} }),
  };
  await provider.resolveCustomEditor(doc, panel);
  // markDirtyFromRestore part dans un setTimeout(…, 0).
  await new Promise((r) => setTimeout(r, 20));
  return { edits, doc };
}

// --- 1. Le cas de Frank : « nouveau projet » vierge restauré ------------------
{
  const backup = await projix({ dirtyAtExit: true, parts: CARTE });
  const { edits } = await restaure({ scheme: 'untitled', backup });
  check(
    'un « nouveau projet » VIERGE restauré ne réclame plus d\'enregistrement',
    edits === 0,
    `${edits} édition(s) empilée(s) → point ● et boîte « voulez-vous enregistrer ? »`
  );
}

// --- 2. Même sans la moindre pièce (backup vide) ------------------------------
{
  const { edits } = await restaure({ scheme: 'untitled', backup: new Uint8Array() });
  check('un backup vide ne pose pas de ● non plus', edits === 0, `${edits} édition(s)`);
}

// --- 3. Contre-épreuve : un untitled qui contient du travail garde son ● -------
{
  const backup = await projix({ dirtyAtExit: true, parts: MONTAGE });
  const { edits } = await restaure({ scheme: 'untitled', backup });
  check(
    'un untitled AVEC une pièce garde son ● (le travail reste protégé)',
    edits > 0,
    'sans ●, fermer la fenêtre jetterait le schéma sans rien demander'
  );
}

// --- 4. Un simple fil suffit à le rendre « à enregistrer » --------------------
{
  const backup = await projix({ dirtyAtExit: true, parts: CARTE, wires: FIL });
  const { edits } = await restaure({ scheme: 'untitled', backup });
  check('un untitled avec un seul FIL garde son ●', edits > 0);
}

// --- 5. Fichier .projix restauré : le drapeau dirtyAtExit fait toujours foi ----
{
  const backup = await projix({ dirtyAtExit: true, parts: MONTAGE });
  const fichier = await projix({ parts: MONTAGE });
  const { edits } = await restaure({ scheme: 'file', backup, fichier });
  check('un .projix restauré AVEC modifications en cours garde son ●', edits > 0);
}
{
  const backup = await projix({ dirtyAtExit: false, parts: MONTAGE });
  const fichier = await projix({ parts: MONTAGE });
  const { edits } = await restaure({ scheme: 'file', backup, fichier });
  check('un .projix restauré propre reste propre', edits === 0, `${edits} édition(s)`);
}

// --- 6. Ouverture normale (sans restauration) : jamais de ● -------------------
{
  const fichier = await projix({ parts: MONTAGE });
  const { edits } = await restaure({ scheme: 'file', fichier });
  check('ouvrir un .projix du disque ne le marque pas « à enregistrer »', edits === 0, `${edits} édition(s)`);
}

if (fails.length) {
  console.log(`\nvierge : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\nvierge : ${ok} contrôles OK — un atelier vierge se ferme sans rien demander.`);
