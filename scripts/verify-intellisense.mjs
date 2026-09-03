// La coloration et l'analyse de code restent VALIDES dans un projet Kablix :
// plus de rouge sous `Serial` dans un .ino, plus de « import machine
// introuvable » dans un .py de Pico.
//
// Kablix n'analyse rien lui-même : il pose le réglage qui manque à l'extension
// d'en face (Arduino VS Code IDE côté .ino, MicroPico + Pylance côté .py). Le
// banc exécute POUR DE VRAI `src/intellisense.ts` bundlé avec un faux `vscode`
// (extensions installées, réglages en mémoire, commandes enregistrées) et lit
// ce qui est réellement demandé et écrit.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-intellisense-'));

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
const modSrc = readFileSync(join(ROOT, 'src/intellisense.ts'), 'utf8');

const prop = pkg.contributes.configuration.properties['kablix.syncIntelliSense'];
check(!!prop, 'package.json : réglage kablix.syncIntelliSense');
check(prop?.type === 'boolean' && prop?.default === true, 'réglage booléen, actif par défaut');
check(!!nlsEn['kablix.config.syncIntelliSense'], 'description EN du réglage');

check(/import \{ syncIntelliSense, remettreAuPoint \} from '\.\/intellisense'/.test(panelSrc), 'panel.ts : mise au point importée');
check(
  /syncArduinoIdeBoard\(board, hint\)\.then\(\(\) => syncIntelliSense\(board, hint\)\)/.test(panelSrc),
  'panel.ts : la mise au point vient APRÈS l’écriture de arduino.yaml',
  'sinon l’extension d’en face régénère pour la carte précédente'
);
check(
  modSrc.includes("'paulober.pico-w-go'") && modSrc.includes("'arduino.rebuildIntelliSenseConfig'"),
  'les deux extensions visées sont nommées en clair'
);

// -------------------------------------------------- faux `vscode` (en mémoire)
const STUB = `
const norm = (p) => String(p).replace(/\\\\/g, '/').replace(/\\/+$/, '');
const uri = (p) => ({ fsPath: norm(p), scheme: 'file', path: norm(p), toString: () => norm(p) });
export const Uri = {
  file: (p) => uri(p),
  parse: (p) => uri(p),
  joinPath: (base, ...parts) => uri([norm(base.fsPath), ...parts].join('/')),
};
export const extensions = {
  getExtension: (id) => {
    const home = globalThis.__is.extensions[id];
    return home ? { id, isActive: false, extensionUri: uri(home), extensionPath: norm(home) } : undefined;
  },
};
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
const conf = (scope) => ({
  get: (key, d) => {
    const dossier = scope ? (globalThis.__is.folderSettings[norm(scope.fsPath)] ?? {}) : {};
    if (key in dossier) return dossier[key];
    if (key in globalThis.__is.workspaceSettings) return globalThis.__is.workspaceSettings[key];
    return key in globalThis.__is.config ? globalThis.__is.config[key] : d;
  },
  inspect: (key) => ({
    key,
    globalValue: undefined,
    workspaceValue: globalThis.__is.workspaceSettings[key],
    workspaceFolderValue: scope ? (globalThis.__is.folderSettings[norm(scope.fsPath)] ?? {})[key] : undefined,
  }),
  update: async (key, value, target) => {
    if (target === 3 && scope) {
      const f = norm(scope.fsPath);
      globalThis.__is.folderSettings[f] = { ...(globalThis.__is.folderSettings[f] ?? {}), [key]: value };
    } else {
      globalThis.__is.workspaceSettings[key] = value;
    }
    globalThis.__is.updates.push({ key, value, target });
  },
});
export const workspace = {
  get workspaceFolders() { return globalThis.__is.folders.map((f, index) => ({ uri: uri(f), name: f.split('/').pop(), index })); },
  getWorkspaceFolder: (target) => {
    const p = norm(target.fsPath);
    const hit = globalThis.__is.folders.filter((f) => p.toLowerCase().startsWith(norm(f).toLowerCase() + '/'));
    if (!hit.length) return undefined;
    hit.sort((a, b) => b.length - a.length);
    return { uri: uri(hit[0]), name: hit[0].split('/').pop(), index: 0 };
  },
  getConfiguration: (_section, scope) => conf(scope),
  fs: {
    stat: async (target) => {
      if (!globalThis.__is.paths.includes(norm(target.fsPath))) throw new Error('ENOENT ' + norm(target.fsPath));
      return { type: 2 };
    },
    readFile: async (target) => {
      const c = (globalThis.__is.files ?? {})[norm(target.fsPath)];
      if (c === undefined) throw new Error('ENOENT ' + norm(target.fsPath));
      return Buffer.from(c, 'utf8');
    },
    writeFile: async () => {},
  },
};
export const commands = {
  getCommands: async () => globalThis.__is.commands,
  executeCommand: async (id, ...args) => { globalThis.__is.executed.push(id); return undefined; },
  registerCommand: () => ({ dispose() {} }),
};
export const window = {
  showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
};
export const l10n = { t: (s) => s };
export default { Uri, extensions, workspace, commands, window, l10n, ConfigurationTarget };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

const outfile = join(tmp, 'intellisense.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src/intellisense.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { syncIntelliSense, remettreAuPoint, resetIntelliSenseCache, MICROPICO_EXTENSION_ID } = await import(pathToFileURL(outfile).href);

const ARDUINO_ID = 'electropol-fr.arduino-vscode-ide';
const PICO_HOME = 'W:/ext/pico-w-go';
const REBUILD = 'arduino.rebuildIntelliSenseConfig';
const CLOSE_PANEL = 'workbench.action.closePanel';

/** Monde de départ : un dossier ouvert, les deux extensions installées. */
const world = (over = {}) => {
  globalThis.__is = {
    folders: ['W:/projet'],
    extensions: { [ARDUINO_ID]: 'W:/ext/arduino', [MICROPICO_EXTENSION_ID]: PICO_HOME },
    paths: [PICO_HOME + '/mpy_stubs'],
    commands: [REBUILD, 'workbench.action.reloadWindow'],
    config: {},
    workspaceSettings: {},
    folderSettings: {},
    executed: [],
    updates: [],
    files: {},
    ...over,
  };
  resetIntelliSenseCache();
  return globalThis.__is;
};
const reglagesDu = (f = 'W:/projet') => globalThis.__is.folderSettings[f] ?? {};

check(MICROPICO_EXTENSION_ID === 'paulober.pico-w-go', 'identifiant MicroPico exporté (une seule vérité)');

// ------------------------------------------------------------ B. côté Arduino
world();
check((await syncIntelliSense('uno')) === true, 'Uno : la mise au point est faite');
check(globalThis.__is.executed.includes(REBUILD), 'Uno : la configuration IntelliSense est régénérée pour la carte');
check(Object.keys(reglagesDu()).length === 0, 'Uno : aucun réglage Python posé');

world({ extensions: {} });
check((await syncIntelliSense('mega')) === false, 'extension Arduino absente : rien, et aucune erreur');
check(globalThis.__is.executed.length === 0, 'extension absente : aucune commande lancée');

world({ commands: ['workbench.action.reloadWindow'] });
check((await syncIntelliSense('nano')) === false, 'commande de reconstruction inconnue : rien (version ancienne d’en face)');

world();
// On compte les RECONSTRUCTIONS, pas toutes les commandes : la fermeture de la
// fenêtre de sortie en lance une autre à chaque passage (voir B bis).
const reconstructions = () => globalThis.__is.executed.filter((c) => c === REBUILD).length;
await syncIntelliSense('uno');
const lance = reconstructions();
await syncIntelliSense('uno');
check(reconstructions() === lance, 'deux fois la même carte : une seule reconstruction');
await syncIntelliSense('mega');
check(reconstructions() === lance + 1, 'carte CHANGÉE : on régénère (le c_cpp_properties.json n’est plus le bon)');

// ------------------------------- B bis. la fenêtre de sortie ne s'ouvre plus
// L'extension d'en face montre sa sortie à CHAQUE compilation, analyse comprise :
// choisir une carte n'est pas une compilation, Kablix la referme donc derrière.
const propSortie = pkg.contributes.configuration.properties['kablix.showArduinoOutput'];
check(!!propSortie, 'package.json : réglage kablix.showArduinoOutput');
check(propSortie?.type === 'boolean' && propSortie?.default === false, 'sortie muette par défaut');
check(!!nlsEn['kablix.config.showArduinoOutput'], 'description EN du réglage de sortie');

world();
await syncIntelliSense('uno');
check(globalThis.__is.executed.includes(CLOSE_PANEL), 'Uno : la fenêtre de sortie ouverte par l’extension d’en face est refermée');
check(
  globalThis.__is.executed.indexOf(REBUILD) < globalThis.__is.executed.indexOf(CLOSE_PANEL),
  'on referme APRÈS l’analyse : la sortie s’ouvre pendant, pas avant'
);

world({ config: { 'kablix.showArduinoOutput': true } });
await syncIntelliSense('uno');
check(!globalThis.__is.executed.includes(CLOSE_PANEL), 'réglage à vrai : la sortie reste visible');

world();
await syncIntelliSense('pico');
check(!globalThis.__is.executed.includes(CLOSE_PANEL), 'Pico : aucun panneau refermé (rien ne s’ouvre de ce côté)');

// ---------------------------------------------------------- C. côté MicroPython
world();
check((await syncIntelliSense('pico')) === true, 'Pico : les réglages Python sont posés');
const r = reglagesDu();
check(
  (r['python.analysis.extraPaths'] ?? []).includes(PICO_HOME + '/mpy_stubs'),
  'Pico : le dossier de déclarations est montré à Pylance (extraPaths)',
  JSON.stringify(r['python.analysis.extraPaths'])
);
check(
  (r['python.analysis.typeshedPaths'] ?? []).includes(PICO_HOME + '/mpy_stubs'),
  'Pico : et en typeshedPaths (c’est là que Pylance cherche les .pyi)'
);
check(
  r['python.analysis.diagnosticSeverityOverrides']?.reportMissingModuleSource === 'none',
  'Pico : plus de trait ondulé « source introuvable » sous l’import (le module vit dans la puce)'
);
check(
  globalThis.__is.updates.every((u) => u.target === 3),
  'Pico : écrit dans le DOSSIER de travail (.vscode/settings.json), pas dans les réglages généraux'
);
check(!globalThis.__is.executed.includes(REBUILD), 'Pico : la commande Arduino n’est pas lancée');

world();
await syncIntelliSense('picow');
check((reglagesDu()['python.analysis.extraPaths'] ?? []).length === 1, 'Pico W : même traitement');
world();
await syncIntelliSense('pico2');
check((reglagesDu()['python.analysis.extraPaths'] ?? []).length === 1, 'Pico 2 : même traitement');

// Réglages déjà présents : on AJOUTE, on n'écrase pas.
world({
  folderSettings: {
    'W:/projet': {
      'python.analysis.extraPaths': ['W:/projet/lib'],
      'python.analysis.diagnosticSeverityOverrides': { reportUnusedImport: 'warning' },
    },
  },
});
await syncIntelliSense('pico');
const r2 = reglagesDu();
check(r2['python.analysis.extraPaths'].includes('W:/projet/lib'), 'le chemin de l’utilisateur est conservé');
check(r2['python.analysis.extraPaths'].includes(PICO_HOME + '/mpy_stubs'), 'et celui des déclarations ajouté à côté');
check(r2['python.analysis.diagnosticSeverityOverrides'].reportUnusedImport === 'warning', 'les autres surcharges de diagnostic survivent');

world({
  folderSettings: {
    'W:/projet': {
      'python.analysis.extraPaths': [PICO_HOME + '/mpy_stubs'],
      'python.analysis.typeshedPaths': [PICO_HOME + '/mpy_stubs'],
      'python.analysis.diagnosticSeverityOverrides': { reportMissingModuleSource: 'none' },
      'python.languageServer': 'Pylance',
      'python.analysis.typeCheckingMode': 'basic',
    },
  },
});
await syncIntelliSense('pico');
check(globalThis.__is.updates.length === 0, 'tout est déjà en place : aucune écriture (Pylance n’est pas réveillé pour rien)');

// Les deux réglages que MicroPico pose lui-même : sans le bon serveur d'analyse,
// les déclarations qu'on vient de montrer ne servent à personne.
world();
await syncIntelliSense('pico');
const rp = reglagesDu();
check(rp['python.languageServer'] === 'Pylance', 'Pico : le serveur d’analyse est Pylance (celui qui lit les .pyi)');
check(rp['python.analysis.typeCheckingMode'] === 'basic', 'Pico : analyse en mode « basic », comme un projet MicroPico');

// Déjà Pylance dans les réglages de l’utilisateur : on ne le réécrit pas.
world({ config: { 'python.languageServer': 'Pylance', 'python.analysis.typeCheckingMode': 'basic' } });
await syncIntelliSense('pico');
check(
  !globalThis.__is.updates.some((u) => u.key === 'python.languageServer' || u.key === 'python.analysis.typeCheckingMode'),
  'réglage déjà bon chez l’utilisateur : pas recopié dans le dossier'
);

world({ extensions: { [ARDUINO_ID]: 'W:/ext/arduino' } });
check((await syncIntelliSense('pico')) === false, 'MicroPico absent : rien, et aucune erreur');

world({ paths: [] });
check((await syncIntelliSense('pico')) === false, 'dossier de déclarations introuvable : rien (version d’en face inattendue)');

// ------------------------------------ C bis. remise au point À LA DEMANDE
// Le travail automatique est silencieux par choix : la commande de la palette
// est le seul endroit où l'utilisateur lit CE QUI MANQUE quand ça ne suffit pas.
const cmd = pkg.contributes.commands.find((c) => c.command === 'kablix.fixIntelliSense');
check(!!cmd && cmd.category === 'Kablix', 'package.json : commande kablix.fixIntelliSense dans la palette');
check(!!nlsEn['kablix.cmd.fixIntelliSense'], 'titre EN de la commande');
const extSrc = readFileSync(join(ROOT, 'src/extension.ts'), 'utf8');
check(extSrc.includes("registerCommand('kablix.fixIntelliSense'"), 'extension.ts : la commande est enregistrée');
check(/public fixIntelliSense\(\): Promise<string>/.test(panelSrc), 'panel.ts : le panneau sait la faire pour SA carte');

world({ folders: [] });
check((await remettreAuPoint('uno')).length > 0, 'aucun dossier ouvert : la commande le DIT au lieu de se taire');

world({ extensions: {} });
check(/Arduino/.test(await remettreAuPoint('uno')), 'extension Arduino absente : la commande nomme celle qui manque');

// Sans la clé `sketch` dans arduino.yaml, l'extension d'en face abandonne EN
// SILENCE : c'était la cause du .ino tout rouge.
world({ files: { 'W:/projet/.vscode/arduino.yaml': 'board: arduino:avr:uno\n' } });
const sansSketch = await remettreAuPoint('uno');
check(/sketch|\.ino/i.test(sansSketch), 'arduino.yaml sans sketch : la commande dit qu’il faut ouvrir le croquis');
check(!globalThis.__is.executed.includes(REBUILD), 'arduino.yaml sans sketch : la reconstruction n’est même pas lancée');

world({ files: { 'W:/projet/.vscode/arduino.yaml': 'board: arduino:avr:uno\nsketch: Arduino/blink/blink.ino\n' } });
await remettreAuPoint('uno');
check(globalThis.__is.executed.includes(REBUILD), 'arduino.yaml complet : la configuration IntelliSense est demandée');
check(!globalThis.__is.executed.includes(CLOSE_PANEL), 'commande explicite : la sortie reste ouverte (c’est là qu’on lit ce qui se passe)');

// Une demande explicite REFAIT le travail, même s'il a déjà eu lieu.
world({ files: { 'W:/projet/.vscode/arduino.yaml': 'board: arduino:avr:uno\nsketch: blink.ino\n' } });
await syncIntelliSense('uno');
const avant = globalThis.__is.executed.filter((c) => c === REBUILD).length;
await remettreAuPoint('uno');
check(
  globalThis.__is.executed.filter((c) => c === REBUILD).length === avant + 1,
  'la commande oublie le « déjà fait » et refait le travail'
);

world({ extensions: { [ARDUINO_ID]: 'W:/ext/arduino' } });
check(/MicroPico/.test(await remettreAuPoint('pico')), 'MicroPico absent : la commande nomme l’extension à installer');

world();
check((await remettreAuPoint('pico')).length > 0, 'Pico : la commande rend compte de ce qui a été posé');
check(Object.keys(reglagesDu()).length > 0, 'Pico : et les réglages sont bien écrits');

// ------------------------------------------------------------- D. garde-fous
world({ config: { 'kablix.syncIntelliSense': false } });
check((await syncIntelliSense('uno')) === false, 'réglage coupé : rien côté Arduino');
world({ config: { 'kablix.syncIntelliSense': false } });
check((await syncIntelliSense('pico')) === false, 'réglage coupé : rien côté Pico');

world({ folders: [] });
check((await syncIntelliSense('uno')) === false, 'aucun dossier ouvert : rien, et aucune erreur');

world({ folders: ['W:/autre', 'W:/projet'] });
await syncIntelliSense('pico', { fsPath: 'W:/projet/main.py', scheme: 'file' });
check(Object.keys(reglagesDu('W:/projet')).length > 0, 'multi-dossiers : les réglages vont dans le dossier du programme');
check(Object.keys(reglagesDu('W:/autre')).length === 0, 'multi-dossiers : l’autre dossier n’est pas touché');

if (fails.length) {
  console.log(`\nintellisense : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\nintellisense : ${ok} contrôles OK — plus rien n’est souligné pour une mauvaise raison.`);
