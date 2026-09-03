// Choisir une carte Arduino dans Kablix la choisit AUSSI dans l'extension
// « Arduino VS Code IDE » (electropol-fr.arduino-vscode-ide), pour que le
// sketch .ino soit reconnu sans re-choisir la carte de l'autre côté.
//
// L'extension d'en face n'a pas d'API : son réglage de projet est le fichier
// `.vscode/arduino.yaml` (clés `board` = FQBN et `configuration` = options du
// menu de la carte), qu'elle surveille et relit à chaque écriture. Le banc
// exécute POUR DE VRAI `src/arduinoIde.ts` et `src/panel.ts` bundlés avec un
// faux `vscode` (extensions, réglages, système de fichiers en mémoire), et lit
// ce qui est réellement écrit sur le disque simulé.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-arduinoide-'));

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

// ------------------------------------------------- A. réglage et branchements
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const nlsEn = JSON.parse(readFileSync(join(ROOT, 'package.nls.json'), 'utf8'));
const panelSrc = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
const recoSrc = readFileSync(join(ROOT, 'src/recommend.ts'), 'utf8');
const modSrc = readFileSync(join(ROOT, 'src/arduinoIde.ts'), 'utf8');

const prop = pkg.contributes.configuration.properties['kablix.syncArduinoIdeBoard'];
check(!!prop, 'package.json : réglage kablix.syncArduinoIdeBoard');
check(prop?.type === 'boolean' && prop?.default === true, 'réglage booléen, actif par défaut');
check(!!nlsEn['kablix.config.syncArduinoIdeBoard'], 'description EN du réglage');

check(/import \{ syncArduinoIdeBoard \} from '\.\/arduinoIde'/.test(panelSrc), 'panel.ts : passerelle importée');
check(/private setCurrentBoard\(board: Board\): void \{/.test(panelSrc), 'panel.ts : setCurrentBoard centralise la carte');
check(
  !/this\.currentBoard = (?!board;)/.test(panelSrc),
  'panel.ts : plus AUCUNE affectation directe de currentBoard hors du setter',
  'la synchro serait sautée sur ce chemin'
);
check((panelSrc.match(/this\.setCurrentBoard\(/g) ?? []).length >= 6, 'panel.ts : les six chemins de carte passent par le setter');
check(
  modSrc.includes("'electropol-fr.arduino-vscode-ide'") && recoSrc.includes("'electropol-fr.arduino-vscode-ide'"),
  'même identifiant d’extension que la liste des recommandées'
);

// -------------------------------------------------- faux `vscode` (FS mémoire)
const STUB = `
const norm = (p) => String(p).replace(/\\\\/g, '/').replace(/\\/+$/, '');
const uri = (p) => ({ fsPath: norm(p), scheme: 'file', path: norm(p), toString: () => norm(p) });
export const Uri = {
  file: (p) => uri(p),
  parse: (p) => uri(p),
  joinPath: (base, ...parts) => uri([norm(base.fsPath), ...parts].join('/')),
};
export const RelativePattern = class { constructor(base, pattern) { this.base = norm(base.fsPath ?? base); this.pattern = pattern; } };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const extensions = {
  getExtension: (id) => (globalThis.__ard.installed.includes(id) ? { id, isActive: false } : undefined),
};
export const workspace = {
  get workspaceFolders() { return globalThis.__ard.folders.map((f) => ({ uri: uri(f), name: f.split('/').pop(), index: 0 })); },
  getWorkspaceFolder: (target) => {
    const p = norm(target.fsPath);
    const hit = globalThis.__ard.folders.filter((f) => p.toLowerCase().startsWith(norm(f).toLowerCase() + '/'));
    if (!hit.length) return undefined;
    hit.sort((a, b) => b.length - a.length); // le dossier le plus précis gagne
    return { uri: uri(hit[0]), name: hit[0].split('/').pop(), index: 0 };
  },
  findFiles: async (pattern) => {
    const base = norm(pattern.base ?? '');
    const ext = String(pattern.pattern ?? '').replace('**/*', '');
    return Object.keys(globalThis.__ard.files)
      .filter((p) => p.toLowerCase().startsWith(base.toLowerCase() + '/') && p.endsWith(ext))
      .map((p) => uri(p));
  },
  fs: {
    readFile: async (target) => {
      const content = globalThis.__ard.files[norm(target.fsPath)];
      if (content === undefined) throw new Error('ENOENT ' + norm(target.fsPath));
      return Buffer.from(content, 'utf8');
    },
    writeFile: async (target, bytes) => {
      globalThis.__ard.files[norm(target.fsPath)] = Buffer.from(bytes).toString('utf8');
      globalThis.__ard.writes.push(norm(target.fsPath));
    },
    stat: async () => ({ type: 1 }),
    delete: async () => {},
  },
  getConfiguration: () => ({ get: (key, d) => (key in globalThis.__ard.config ? globalThis.__ard.config[key] : d), update: async () => {} }),
  onDidSaveTextDocument: () => ({ dispose() {} }),
  onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidCloseTextDocument: () => ({ dispose() {} }),
  openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath),
  applyEdit: async () => true,
};
export const window = {
  showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showSaveDialog: async () => undefined,
  setStatusBarMessage: () => ({ dispose() {} }),
  createWebviewPanel: () => { throw new Error('non utilisé'); },
  activeTextEditor: undefined,
  tabGroups: { all: [], close: async () => {} },
  onDidChangeActiveTextEditor: () => ({ dispose() {} }),
  registerCustomEditorProvider: () => ({ dispose() {} }),
  visibleTextEditors: [],
};
export const commands = { executeCommand: async () => undefined, registerCommand: () => ({ dispose() {} }) };
export const env = { clipboard: { readText: async () => '', writeText: async () => {} }, openExternal: async () => true, language: 'fr' };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const Range = class {}; export const Position = class {}; export const Selection = class {};
export const ThemeIcon = class {}; export const EventEmitter = class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} };
export const TextEdit = { replace: () => ({}) };
export const WorkspaceEdit = class { replace() {} };
export const Disposable = class { static from() { return { dispose() {} }; } dispose() {} };
export const TabInputCustom = class {}; export const TabInputText = class {};
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ProgressLocation = { Notification: 15 };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export default { Uri, l10n, window, workspace, commands, env, extensions };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

const bundle = async (entry, name) => {
  const outfile = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    alias: { vscode: join(tmp, 'vscode-stub.mjs') },
  });
  return import(pathToFileURL(outfile).href);
};

const { arduinoIdeTarget, patchArduinoYaml, sketchRelatif, syncArduinoIdeBoard } = await bundle('src/arduinoIde.ts', 'arduinoide.mjs');
const { SimulatorPanel } = await bundle('src/panel.ts', 'panel.mjs');

const ARDUINO_ID = 'electropol-fr.arduino-vscode-ide';
/** Monde de départ : un dossier ouvert, l'extension installée, un sketch dedans. */
const world = (over = {}) => {
  globalThis.__ard = {
    installed: [ARDUINO_ID],
    folders: ['W:/projet'],
    files: { 'W:/projet/blink.ino': 'void setup() {}' },
    config: {},
    writes: [],
    ...over,
  };
  return globalThis.__ard;
};
const yamlOf = (path = 'W:/projet/.vscode/arduino.yaml') => globalThis.__ard.files[path];

// ------------------------------------------------------ B. cible d'une carte
check(arduinoIdeTarget('uno')?.board === 'arduino:avr:uno', 'Uno → arduino:avr:uno');
check(arduinoIdeTarget('uno')?.configuration === '', 'Uno : pas d’option de menu (elle n’existe pas sur cette carte)');
check(arduinoIdeTarget('nano')?.board === 'arduino:avr:nano', 'Nano → arduino:avr:nano');
check(arduinoIdeTarget('nano')?.configuration === 'cpu=atmega328', 'Nano : cpu=atmega328');
check(arduinoIdeTarget('mega')?.board === 'arduino:avr:mega', 'Mega → arduino:avr:mega');
check(arduinoIdeTarget('mega')?.configuration === 'cpu=atmega2560', 'Mega : cpu=atmega2560 (sinon arduino-cli compile pour la mauvaise puce)');
check(arduinoIdeTarget('pico') === undefined && arduinoIdeTarget('picow') === undefined, 'Pico / Pico W : aucune cible Arduino');
// Les FQBN sont ceux avec lesquels Kablix compile déjà : une seule vérité.
const compilerSrc = readFileSync(join(ROOT, 'src/compiler.ts'), 'utf8');
check(
  compilerSrc.includes("'arduino:avr:mega'") && compilerSrc.includes("'arduino:avr:uno'"),
  'mêmes FQBN que la compilation arduino-cli de Kablix'
);

// ------------------------------------------------------- C. réécriture du YAML
const only = patchArduinoYaml('', arduinoIdeTarget('mega'));
check(only === 'board: arduino:avr:mega\nconfiguration: cpu=atmega2560\n', 'fichier neuf : les deux clés, format js-yaml', JSON.stringify(only));

const kept = patchArduinoYaml(
  'sketch: blink.ino\nboard: arduino:avr:uno\nport: COM3\noutput: build\n',
  arduinoIdeTarget('mega')
);
check(/^sketch: blink\.ino$/m.test(kept) && /^port: COM3$/m.test(kept) && /^output: build$/m.test(kept), 'les autres clés sont intactes');
check(/^board: arduino:avr:mega$/m.test(kept), 'la carte est remplacée sur place');
check(kept.split('\n').filter((l) => l.startsWith('board:')).length === 1, 'une seule clé board');
check(/^configuration: cpu=atmega2560$/m.test(kept), 'la configuration manquante est ajoutée');

const cleaned = patchArduinoYaml('board: arduino:avr:mega\nconfiguration: cpu=atmega2560\nsketch: blink.ino\n', arduinoIdeTarget('uno'));
check(!/configuration:/.test(cleaned ?? ''), 'Uno : la configuration de la Mega est RETIRÉE (elle vaudrait pour une autre carte)');
check(/^board: arduino:avr:uno$/m.test(cleaned ?? ''), 'Uno : carte écrite');

check(
  patchArduinoYaml('sketch: blink.ino\nboard: arduino:avr:uno\n', arduinoIdeTarget('uno')) === undefined,
  'déjà la bonne carte : rien à écrire (le watcher d’en face n’est pas réveillé pour rien)'
);

const nested = patchArduinoYaml(
  'sketch: blink.ino\nbuildPreferences:\n    -\n        - build.extra_flags\n        - -DDEBUG\nboard: arduino:avr:uno\n',
  arduinoIdeTarget('mega')
);
check(/-DDEBUG/.test(nested) && /buildPreferences:/.test(nested), 'une valeur imbriquée (buildPreferences) survit');
check(/^board: arduino:avr:mega$/m.test(nested), 'carte remplacée malgré la valeur imbriquée');

const crlf = patchArduinoYaml('sketch: blink.ino\r\nboard: arduino:avr:uno\r\n', arduinoIdeTarget('mega'));
check(!/[^\r]\n/.test(crlf), 'fichier en CRLF : les fins de ligne sont conservées');

// ------------------------------------------------- C bis. la clé `sketch`
// Sans elle, l'extension d'en face abandonne l'analyse SANS RIEN DIRE : le .ino
// restait tout rouge alors que la carte était bien écrite (Frank, v2026.9.0.46).
const avecSketch = patchArduinoYaml('', { ...arduinoIdeTarget('uno'), sketch: 'blink.ino' });
check(/^sketch: blink\.ino$/m.test(avecSketch ?? ''), 'le croquis ouvert est écrit dans arduino.yaml');

const changeSketch = patchArduinoYaml(
  'board: arduino:avr:uno\nsketch: vieux.ino\n',
  { ...arduinoIdeTarget('uno'), sketch: 'neuf.ino' }
);
check(/^sketch: neuf\.ino$/m.test(changeSketch ?? ''), 'changer de croquis remplace la clé sur place');
check((changeSketch ?? '').split('\n').filter((l) => l.startsWith('sketch:')).length === 1, 'une seule clé sketch');

check(
  patchArduinoYaml('board: arduino:avr:uno\nsketch: blink.ino\n', { ...arduinoIdeTarget('uno'), sketch: 'blink.ino' }) === undefined,
  'tout est déjà bon : aucune réécriture (sinon l’autre extension repart en boucle)'
);

check(
  /^sketch: garde\.ino$/m.test(patchArduinoYaml('sketch: garde.ino\nboard: arduino:avr:mega\n', arduinoIdeTarget('uno')) ?? ''),
  'sans croquis à proposer, celui du fichier est CONSERVÉ'
);

// chemin du croquis : relatif au dossier, toujours en barres obliques
check(sketchRelatif('W:/projet', 'W:/projet/blink.ino') === 'blink.ino', 'croquis à la racine du dossier');
check(
  sketchRelatif('W:\\projet', 'W:\\projet\\Arduino\\blink\\blink.ino') === 'Arduino/blink/blink.ino',
  'sous-dossier : chemin relatif en barres obliques (les antislashs de Windows ne passent pas)'
);
check(sketchRelatif('W:/projet', 'W:/autre/blink.ino') === undefined, 'croquis hors du dossier : aucune clé sketch');
check(sketchRelatif('W:/projet', 'W:/projet/main.py') === undefined, 'fichier qui n’est pas un .ino : aucune clé sketch');
// ------------------------------------------- D. synchro complète (module seul)
world();
check((await syncArduinoIdeBoard('mega')) === true, 'carte Mega : le fichier est écrit');
check(/^board: arduino:avr:mega$/m.test(yamlOf() ?? ''), '.vscode/arduino.yaml porte la Mega', yamlOf());

world();
await syncArduinoIdeBoard('pico');
check(yamlOf() === undefined, 'Pico : rien n’est écrit (ce n’est pas un projet Arduino)');

world({ files: { 'W:/projet/.vscode/arduino.yaml': 'sketch: blink.ino\nboard: arduino:avr:mega\n' } });
await syncArduinoIdeBoard('pico');
check(
  yamlOf() === 'sketch: blink.ino\nboard: arduino:avr:mega\n',
  'Pico : la carte Arduino déjà choisie n’est PAS effacée'
);

world({ installed: [] });
await syncArduinoIdeBoard('uno');
check(yamlOf() === undefined, 'extension Arduino absente : Kablix n’écrit rien');

world({ config: { 'kablix.syncArduinoIdeBoard': false } });
await syncArduinoIdeBoard('uno');
check(yamlOf() === undefined, 'réglage coupé : Kablix n’écrit rien');

world({ files: {} });
await syncArduinoIdeBoard('uno');
check(yamlOf() === undefined, 'ni sketch .ino ni arduino.yaml : aucun fichier semé dans le dossier');

world({ files: { 'W:/projet/.vscode/arduino.yaml': 'sketch: autre.ino\n' } });
await syncArduinoIdeBoard('uno');
check(/^board: arduino:avr:uno$/m.test(yamlOf() ?? ''), 'arduino.yaml existant sans sketch .ino : la carte est quand même posée');

world();
await syncArduinoIdeBoard('uno');
const writes = globalThis.__ard.writes.length;
await syncArduinoIdeBoard('uno');
check(globalThis.__ard.writes.length === writes, 'deux fois la même carte : une seule écriture');

// Le croquis ouvert dans Kablix devient celui du projet Arduino.
world({ files: { 'W:/projet/Arduino/blink/blink.ino': 'void setup() {}' } });
await syncArduinoIdeBoard('uno', { fsPath: 'W:/projet/Arduino/blink/blink.ino', scheme: 'file' });
check(/^sketch: Arduino\/blink\/blink\.ino$/m.test(yamlOf() ?? ''), 'croquis ouvert → clé sketch écrite', yamlOf());
check(/^board: arduino:avr:uno$/m.test(yamlOf() ?? ''), 'et la carte avec');

world({ files: { 'W:/projet/main.py': '', 'W:/projet/.vscode/arduino.yaml': 'sketch: blink.ino\n' } });
await syncArduinoIdeBoard('uno', { fsPath: 'W:/projet/main.py', scheme: 'file' });
check(/^sketch: blink\.ino$/m.test(yamlOf() ?? ''), 'un .py ouvert ne remplace pas le croquis du projet');
// Multi-dossiers : le fichier de code désigne SON dossier.
world({
  folders: ['W:/autre', 'W:/projet'],
  files: { 'W:/projet/blink.ino': 'void setup() {}', 'W:/autre/rien.txt': '' },
});
await syncArduinoIdeBoard('mega', { fsPath: 'W:/projet/blink.ino', scheme: 'file' });
check(!!yamlOf('W:/projet/.vscode/arduino.yaml'), 'multi-dossiers : écrit dans le dossier du sketch');
check(!yamlOf('W:/autre/.vscode/arduino.yaml'), 'multi-dossiers : l’autre dossier n’est pas touché');

// Sans indice, c'est le dossier qui porte DÉJÀ un arduino.yaml (repli de l'extension d'en face).
world({
  folders: ['W:/autre', 'W:/projet'],
  files: { 'W:/projet/.vscode/arduino.yaml': 'sketch: blink.ino\n', 'W:/autre/blink.ino': '' },
});
await syncArduinoIdeBoard('mega');
check(/arduino:avr:mega/.test(yamlOf('W:/projet/.vscode/arduino.yaml') ?? ''), 'sans indice : le dossier qui a déjà un arduino.yaml');

world({ folders: [] });
check((await syncArduinoIdeBoard('uno')) === false, 'aucun dossier ouvert : rien, et aucune erreur');

// ---------------------------------- E. bout en bout : le message de la webview
/** Panneau minimal (pas de webview) : seul le chemin du message `board` sert. */
const panelWith = (over = {}) => {
  const p = Object.create(SimulatorPanel.prototype);
  p.post = () => {};
  p.codeFileUri = undefined;
  p.projectUri = undefined;
  p.documentUri = undefined;
  Object.assign(p, over);
  return p;
};

world();
panelWith().onMessage({ type: 'board', board: 'mega' });
await new Promise((r) => setTimeout(r, 20)); // l'écriture est lancée sans être attendue
check(/^board: arduino:avr:mega$/m.test(yamlOf() ?? ''), 'webview → hôte : choisir la Mega écrit la carte pour l’autre extension');

world();
panelWith().onMessage({ type: 'board', board: 'picow' });
await new Promise((r) => setTimeout(r, 20));
check(yamlOf() === undefined, 'webview → hôte : passer au Pico W ne touche à rien');

world({
  folders: ['W:/autre', 'W:/projet'],
  files: { 'W:/projet/blink.ino': '' },
});
panelWith({ codeFileUri: { fsPath: 'W:/projet/blink.ino', scheme: 'file' } }).onMessage({ type: 'board', board: 'uno' });
await new Promise((r) => setTimeout(r, 20));
check(!!yamlOf('W:/projet/.vscode/arduino.yaml'), 'le fichier de code du projet choisit le dossier visé');

// ------------------------------------------------------------------ F. aide
const usageFr = readFileSync(join(ROOT, 'docs/fr/USAGE.md'), 'utf8');
check(/arduino\.yaml/.test(usageFr), 'aide FR : le fichier .vscode/arduino.yaml est expliqué');
check(/kablix\.syncArduinoIdeBoard/.test(usageFr), 'aide FR : le réglage est nommé');

if (fails.length) {
  console.log(`\narduinoide : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\narduinoide : ${ok} contrôles OK — la carte choisie dans Kablix devient celle du projet Arduino.`);
