// Disposition de l'espace de travail (src/layout.ts) : côté de Kablix, ratio des
// colonnes, « Sauvegarder cette organisation » et « Réarranger ».
//
// Régression v2026.7.183 (signalée par Frank) : après avoir inversé les deux
// zones, « réarranger » remettait le code à gauche et Kablix à droite — il ne
// reposait que les LARGEURS. Deux causes : le côté n'était lu que sur l'onglet
// ACTIF de chaque groupe (donc perdu dès qu'un autre onglet était au premier
// plan), et rien ne déplaçait le groupe.
//
// Régression v2026.7.184 (signalée par Frank : « ça ne marche plus du tout ») :
// les ids d'échange de groupe posés en v183 — `workbench.action.moveEditorGroup*`
// — N'EXISTENT PAS (les vrais : `moveActiveEditorGroup*`). `executeCommand`
// REJETAIT, l'exception traversait `applyDefaultLayout` et la grille n'était
// jamais posée : ni le côté ni les largeurs n'étaient plus rétablis.
//
// Le vrai module est bundlé avec un faux `vscode` qui enregistre les commandes
// exécutées : on vérifie les commandes RÉELLEMENT émises, pas une réécriture.
// Le stub REJETTE tout id absent de la liste des commandes réelles (ci-dessous,
// relues dans le bundle du VS Code installé quand il est trouvable) — un id
// inventé fait donc échouer le banc au lieu de passer inaperçu.
//
// Usage : node scripts/verify-layout.mjs
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-layout-'));

/**
 * Commandes VS Code que layout.ts est autorisé à émettre. Chacune est vérifiée
 * plus bas contre le bundle du VS Code installé (contrôle sauté s'il est
 * introuvable, p. ex. en CI). Les `vscode.*` sont implémentées côté extension
 * host (absentes du bundle workbench) : marquées `host`.
 */
const KNOWN_COMMANDS = {
  'workbench.action.closeSidebar': 'workbench',
  'workbench.action.closePanel': 'workbench',
  'workbench.action.closeAuxiliaryBar': 'workbench',
  'workbench.action.lockEditorGroup': 'workbench',
  'workbench.action.unlockEditorGroup': 'workbench',
  'workbench.action.focusFirstEditorGroup': 'workbench',
  'workbench.action.focusSecondEditorGroup': 'workbench',
  'workbench.action.focusThirdEditorGroup': 'workbench',
  'workbench.action.focusFourthEditorGroup': 'workbench',
  'workbench.action.focusFifthEditorGroup': 'workbench',
  'workbench.action.focusSixthEditorGroup': 'workbench',
  'workbench.action.focusSeventhEditorGroup': 'workbench',
  'workbench.action.focusEighthEditorGroup': 'workbench',
  'workbench.action.moveActiveEditorGroupLeft': 'workbench',
  'workbench.action.moveActiveEditorGroupRight': 'workbench',
  'workbench.action.moveEditorToLeftGroup': 'workbench',
  'workbench.action.moveEditorToRightGroup': 'workbench',
  'vscode.setEditorLayout': 'host',
  'vscode.getEditorLayout': 'host',
  'vscode.open': 'host',
  'vscode.openWith': 'host',
};

// --- Faux module `vscode` ----------------------------------------------------
// Piloté depuis le test par globalThis.__vs (groupes d'onglets, grille courante).
// `executeCommand` se comporte comme le vrai : rejet sur un id inconnu, et rejet
// forcé pour les ids listés dans __vs.failing (test de robustesse).
const STUB = `
const KNOWN = ${JSON.stringify(Object.keys(KNOWN_COMMANDS))};
export const ViewColumn = { One: 1, Two: 2 };
export const l10n = { t: (s, ...a) => s.replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
/** Retire un onglet de son groupe (API tabGroups.close), comme le vrai VS Code. */
function closeTab(tab) {
  for (const g of globalThis.__vs.groups) {
    if (!g.tabs.includes(tab)) continue;
    g.tabs = g.tabs.filter((t) => t !== tab);
    g.activeTab = g.tabs[0];
    globalThis.__vs.closed.push(tab);
    return true;
  }
  return false;
}
export const window = {
  get tabGroups() {
    return {
      all: globalThis.__vs.groups,
      close: async (tab) => closeTab(tab),
    };
  },
  setStatusBarMessage: (m) => globalThis.__vs.status.push(m),
  showErrorMessage: (m) => globalThis.__vs.errors.push(m),
};
export const commands = {
  executeCommand: async (name, ...args) => {
    const arg = args[0];
    globalThis.__vs.calls.push(args.length === 0 ? name : { name, arg, args });
    if (!KNOWN.includes(name)) {
      globalThis.__vs.unknown.push(name);
      throw new Error("command '" + name + "' not found");
    }
    if (globalThis.__vs.failing.includes(name)) throw new Error('échec simulé : ' + name);
    if (name === 'vscode.getEditorLayout') return globalThis.__vs.layout;
    // Pose de la grille : les groupes manquants sont créés VIDES… puis VS Code
    // les referme aussitôt (workbench.editor.closeEmptyGroups, activé par
    // défaut). C'est exactement ce qui annulait la disposition quand tous les
    // fichiers de code étaient fermés.
    if (name === 'vscode.setEditorLayout') {
      globalThis.__vs.grid = (arg?.groups ?? []).map((g) => g.size);
      const g = globalThis.__vs.groups;
      while (g.length < (arg?.groups ?? []).length) {
        g.push({ viewColumn: g.length + 1, tabs: [], activeTab: undefined });
      }
      if (globalThis.__vs.closeEmptyGroups !== false) {
        const kept = g.filter((gr) => gr.tabs.length > 0);
        if (kept.length) {
          kept.forEach((gr, i) => { gr.viewColumn = i + 1; });
          globalThis.__vs.groups = kept;
          if (kept.length < (arg?.groups ?? []).length) globalThis.__vs.grid = undefined;
        }
      }
      return undefined;
    }
    // Effets simulés : le focus retient la colonne active, et l'échange de
    // groupes PERMUTE réellement les contenus (la colonne suit la position) —
    // sans quoi on ne pourrait pas vérifier où Kablix atterrit.
    const focus = /^workbench\\.action\\.focus(\\w+)EditorGroup$/.exec(name);
    if (focus) {
      const rank = ['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth'].indexOf(focus[1]);
      if (rank >= 0) globalThis.__vs.focused = rank + 1;
    }
    if (name === 'workbench.action.moveActiveEditorGroupLeft' || name === 'workbench.action.moveActiveEditorGroupRight') {
      const g = globalThis.__vs.groups;
      const i = (globalThis.__vs.focused ?? 1) - 1;
      const j = name.endsWith('Left') ? i - 1 : i + 1;
      if (g[i] && g[j]) {
        const t = g[i].tabs; g[i].tabs = g[j].tabs; g[j].tabs = t;
        const l = g[i].locked; g[i].locked = g[j].locked; g[j].locked = l;
        g[i].activeTab = g[i].tabs[0]; g[j].activeTab = g[j].tabs[0];
        // tab.group suit le contenu (l'API expose le groupe depuis l'onglet).
        for (const gr of [g[i], g[j]]) for (const tab of gr.tabs) tab.group = gr;
        globalThis.__vs.focused = j + 1;
      }
    }
    // Activation d'un onglet EXISTANT dans sa propre colonne : rouvrir la même
    // ressource (même viewType) n'ouvre rien de neuf, VS Code active l'onglet en
    // place. C'est lui qui deviendra la cible des moveEditorTo*Group.
    if (name === 'vscode.open' || name === 'vscode.openWith') {
      const uri = args[0];
      const viewType = name === 'vscode.openWith' ? args[1] : undefined;
      globalThis.__vs.moving = { uri, viewType };
      const g = globalThis.__vs.groups.find((gr) =>
        gr.tabs.some((t) => t.input?.uri === uri && t.input?.viewType === viewType));
      if (g) {
        g.activeTab = g.tabs.find((t) => t.input?.uri === uri && t.input?.viewType === viewType);
        globalThis.__vs.focused = g.viewColumn;
      }
    }
    if (name === 'workbench.action.unlockEditorGroup' || name === 'workbench.action.lockEditorGroup') {
      const g = globalThis.__vs.groups[(globalThis.__vs.focused ?? 1) - 1];
      if (g) g.locked = name.startsWith('workbench.action.lock');
    }
    // Déplacement d'un ONGLET (pas du groupe) : celui qui vient d'être activé
    // (vscode.open/openWith), ou à défaut le fichier suivi par le test
    // (__vs.movingUri — bancs antérieurs au tri par zone).
    if (name === 'workbench.action.moveEditorToLeftGroup' || name === 'workbench.action.moveEditorToRightGroup') {
      const g = globalThis.__vs.groups;
      const ref = globalThis.__vs.moving ?? { uri: globalThis.__vs.movingUri, viewType: undefined };
      const isMoving = (t) => t.input && t.input.uri === ref.uri && t.input.viewType === ref.viewType;
      const i = g.findIndex((gr) => gr.tabs.some(isMoving));
      const j = name.includes('Left') ? i - 1 : i + 1;
      // Un groupe VERROUILLÉ refuse tout éditeur entrant : sans déverrouillage
      // préalable, le tri ne pourrait pas ramener l'atelier dans sa zone.
      if (i >= 0 && g[j] && !g[j].locked) {
        const tab = g[i].tabs.find(isMoving);
        g[i].tabs = g[i].tabs.filter((t) => t !== tab);
        g[j].tabs.push(tab);
        tab.group = g[j];
        g[i].activeTab = g[i].tabs[0];
        g[j].activeTab = tab;
      }
    }
    return undefined;
  },
};
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

const stubPlugin = {
  name: 'vscode-stub',
  setup(build) {
    build.onResolve({ filter: /^vscode$/ }, () => ({ path: join(tmp, 'vscode-stub.mjs') }));
  },
};
const out = join(tmp, 'layout.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src', 'layout.ts')],
  outfile: out, bundle: true, platform: 'node', format: 'esm',
  plugins: [stubPlugin], logLevel: 'silent',
});
const L = await import(pathToFileURL(out).href);

/**
 * Chemin du bundle `workbench.desktop.main.js` du VS Code installé, ou undefined.
 * Sert de source de vérité pour les ids de commandes. L'installateur Windows
 * range `resources/` sous un dossier au nom haché (ex. `1b6a188127/`) : on essaie
 * donc la racine puis ses sous-dossiers de 1er niveau.
 */
function findWorkbenchBundle() {
  const REL = join('resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
  const roots = [
    'C:\\Program Files\\Microsoft VS Code',
    'C:\\Program Files\\Microsoft VS Code Insiders',
    join(homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code'),
    '/Applications/Visual Studio Code.app/Contents',
    '/usr/share/code',
    '/usr/lib/code',
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const direct = join(root, REL);
    if (existsSync(direct)) return direct;
    let entries = [];
    try { entries = readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const nested = join(root, e.name, REL);
      if (existsSync(nested)) return nested;
    }
  }
  return undefined;
}

// --- Bancs -------------------------------------------------------------------
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

/** Contexte d'extension minimal : un globalState en mémoire. */
const makeContext = (state = {}) => ({
  globalState: {
    get: (k, d) => (k in state ? state[k] : d),
    update: async (k, v) => { state[k] = v; },
  },
  _state: state,
});

/** Réinitialise le faux VS Code. `tabs` : colonne du .projix, activeIdx du groupe. */
function setWorld({ projixCol = 2, projixActive = true, groups = 2, layout, failing = [], lockedCol } = {}) {
  const mk = (col) => {
    const tabs = [];
    if (col === projixCol) {
      const projix = { input: { viewType: 'kablix.projix', uri: 'x.projix' } };
      const autre = { input: { uri: 'main.py' } };
      // Onglet .projix pas au premier plan : le cas qui faisait perdre le côté.
      tabs.push(...(projixActive ? [projix, autre] : [autre, projix]));
    } else {
      tabs.push({ input: { uri: 'main.py' } });
    }
    // Chaque onglet connaît son groupe (tab.group.viewColumn), comme dans l'API.
    const group = { viewColumn: col, tabs, activeTab: tabs[0], locked: col === lockedCol };
    for (const t of tabs) t.group = group;
    return group;
  };
  globalThis.__vs = {
    groups: Array.from({ length: groups }, (_, i) => mk(i + 1)),
    layout: layout ?? { orientation: 0, groups: [{ size: 0.25 }, { size: 0.75 }] },
    calls: [], status: [], errors: [], unknown: [], failing, focused: 1,
    closed: [], moving: undefined,
  };
}

/** Ajoute un onglet à une colonne du faux VS Code (en gardant `tab.group` cohérent). */
function addTab(col, input) {
  const g = globalThis.__vs.groups[col - 1];
  const tab = { input, group: g };
  g.tabs.push(tab);
  g.activeTab ??= tab;
  return tab;
}

/** Colonne où se trouve l'onglet .projix dans le faux VS Code (1 = gauche). */
const projixColumnNow = () => globalThis.__vs.groups.find((g) =>
  g.tabs.some((t) => String(t.input?.viewType ?? '').includes('kablix.projix')))?.viewColumn;

/** Noms des commandes émises depuis la dernière remise à zéro du monde. */
const emitted = () => globalThis.__vs.calls.map((c) => (typeof c === 'string' ? c : c.name));

// 1. Choix de la commande d'échange (fonction pure exportée).
ok('échange : Kablix en colonne 2 attendu à gauche → moveActiveEditorGroupLeft',
  L.groupSwapCommand(2, 1) === 'workbench.action.moveActiveEditorGroupLeft', L.groupSwapCommand(2, 1));
ok('échange : Kablix en colonne 1 attendu à droite → moveActiveEditorGroupRight',
  L.groupSwapCommand(1, 2) === 'workbench.action.moveActiveEditorGroupRight', L.groupSwapCommand(1, 2));
ok('échange : déjà du bon côté → aucune commande', L.groupSwapCommand(2, 2) === null);

// 2. Colonnes déduites du côté mémorisé.
const ctxRight = makeContext({ 'kablix.layout.kablixSide': 'right' });
const ctxLeft = makeContext({ 'kablix.layout.kablixSide': 'left' });
ok('colonnes : Kablix à droite → Kablix col.2, code col.1',
  L.kablixColumn(ctxRight) === 2 && L.codeColumn(ctxRight) === 1);
ok('colonnes : Kablix à gauche → Kablix col.1, code col.2',
  L.kablixColumn(ctxLeft) === 1 && L.codeColumn(ctxLeft) === 2);

// 3. Grille : le ratio du CODE est placé du bon côté.
setWorld();
await L.applyEditorGrid(makeContext({ 'kablix.layout.kablixSide': 'right', 'kablix.layout.codeRatio': 0.3 }));
let grid = globalThis.__vs.calls.find((c) => c.name === 'vscode.setEditorLayout')?.arg;
ok('grille : Kablix à droite → 30 % à gauche (code), 70 % à droite',
  Math.abs(grid.groups[0].size - 0.3) < 1e-9 && Math.abs(grid.groups[1].size - 0.7) < 1e-9,
  JSON.stringify(grid?.groups));
setWorld();
await L.applyEditorGrid(makeContext({ 'kablix.layout.kablixSide': 'left', 'kablix.layout.codeRatio': 0.3 }));
grid = globalThis.__vs.calls.find((c) => c.name === 'vscode.setEditorLayout')?.arg;
ok('grille : Kablix à gauche → 70 % à gauche (Kablix), 30 % à droite (code)',
  Math.abs(grid.groups[0].size - 0.7) < 1e-9 && Math.abs(grid.groups[1].size - 0.3) < 1e-9,
  JSON.stringify(grid?.groups));

// 4. RÉGRESSION : le côté est mémorisé même si l'onglet .projix n'est pas actif.
setWorld({ projixCol: 1, projixActive: false, layout: { groups: [{ size: 0.7 }, { size: 0.3 }] } });
const ctxSave = makeContext();
await L.saveDefaultLayout(ctxSave);
ok('enregistrer : côté gauche retenu même si l’onglet .projix n’est pas au premier plan',
  ctxSave._state['kablix.layout.kablixSide'] === 'left', ctxSave._state['kablix.layout.kablixSide']);
ok('enregistrer : ratio du CODE lu dans la BONNE colonne (Kablix à gauche → code à droite)',
  Math.abs(ctxSave._state['kablix.layout.codeRatio'] - 0.3) < 1e-9, ctxSave._state['kablix.layout.codeRatio']);

// 5. RÉGRESSION : « réarranger » remet Kablix du côté mémorisé.
setWorld({ projixCol: 2 }); // Kablix actuellement à DROITE…
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true); // …attendu à GAUCHE
let names = globalThis.__vs.calls.map((c) => (typeof c === 'string' ? c : c.name));
ok('réarranger : zones inversées → le groupe de Kablix est bien déplacé',
  names.includes('workbench.action.moveActiveEditorGroupLeft'), names.join(' · '));
ok('réarranger : focus donné au groupe de Kablix avant l’échange',
  names.indexOf('workbench.action.focusSecondEditorGroup') >= 0
  && names.indexOf('workbench.action.focusSecondEditorGroup') < names.indexOf('workbench.action.moveActiveEditorGroupLeft'));
ok('réarranger : largeurs reposées APRÈS l’échange (l’échange emporte les tailles)',
  names.indexOf('vscode.setEditorLayout') > names.indexOf('workbench.action.moveActiveEditorGroupLeft'));

// 6. Déjà du bon côté : aucun déplacement (pas de clignotement inutile).
setWorld({ projixCol: 1 });
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true);
names = globalThis.__vs.calls.map((c) => (typeof c === 'string' ? c : c.name));
ok('réarranger : déjà du bon côté → aucun déplacement de groupe',
  !names.some((n) => n.startsWith('workbench.action.moveEditorGroup')), names.join(' · '));

// 7. Une seule zone d'éditeur : rien à échanger (et pas d'exception).
setWorld({ projixCol: 1, groups: 1 });
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'right' }), true);
names = globalThis.__vs.calls.map((c) => (typeof c === 'string' ? c : c.name));
ok('réarranger : une seule zone → aucun échange, la grille est quand même posée',
  !names.some((n) => n.startsWith('workbench.action.moveEditorGroup')) && names.includes('vscode.setEditorLayout'),
  names.join(' · '));

// 8. Panneaux et barres refermés à chaque réarrangement.
ok('réarranger : barre latérale, panneau et barre auxiliaire refermés',
  ['closeSidebar', 'closePanel', 'closeAuxiliaryBar'].every((c) => names.includes('workbench.action.' + c)));

// 9. RÉGRESSION v184 : aucun id de commande inventé (le stub rejette l'inconnu,
//    comme le vrai VS Code). C'est le contrôle qui aurait attrapé
//    `moveEditorGroupLeft` : il n'existe pas, `executeCommand` rejette.
setWorld({ projixCol: 2 });
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true);
ok('ids : toutes les commandes émises existent réellement dans VS Code',
  globalThis.__vs.unknown.length === 0, globalThis.__vs.unknown.join(' · '));
ok('échange : les ids sont bien moveACTIVEEditorGroup* (les seuls existants)',
  L.groupSwapCommand(2, 1) === 'workbench.action.moveActiveEditorGroupLeft'
  && L.groupSwapCommand(1, 2) === 'workbench.action.moveActiveEditorGroupRight',
  `${L.groupSwapCommand(2, 1)} / ${L.groupSwapCommand(1, 2)}`);

// 10. Contre-vérification : chaque id de la liste blanche existe VRAIMENT dans le
//     bundle du VS Code installé (sauté si introuvable — CI, autre plateforme).
const bundle = findWorkbenchBundle();
if (bundle) {
  const src = readFileSync(bundle, 'utf8');
  const missing = Object.entries(KNOWN_COMMANDS)
    .filter(([id, kind]) => kind === 'workbench' && !src.includes(id))
    .map(([id]) => id);
  ok('ids : les commandes workbench.* sont présentes dans le VS Code installé',
    missing.length === 0, missing.join(' · '));
} else {
  ok('ids : bundle VS Code introuvable — contre-vérification sautée', true);
}

// 11. ROBUSTESSE : une commande qui échoue n'empêche plus le reste. Avant, une
//     seule exception (id inconnu, commande absente d'une version de VS Code)
//     interrompait tout et la grille n'était jamais posée.
setWorld({ projixCol: 2, failing: ['workbench.action.closeAuxiliaryBar', 'workbench.action.moveActiveEditorGroupLeft'] });
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true);
names = emitted();
ok('robustesse : une commande en échec n’empêche pas les suivantes',
  names.includes('workbench.action.moveActiveEditorGroupLeft')
  && names.includes('vscode.setEditorLayout'), names.join(' · '));

// 11 bis. Le déplacement amène VRAIMENT Kablix sur la colonne cible (le faux
//     VS Code permute les contenus comme le vrai échange de groupes).
setWorld({ projixCol: 2 });
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true);
ok('réarranger : après l’échange, l’onglet Kablix est bien en colonne 1',
  projixColumnNow() === 1, projixColumnNow());

// 11 ter. TROIS colonnes : un seul échange ne suffit pas à ramener Kablix à
//     gauche — la boucle bornée enchaîne les déplacements, et le focus vise le
//     BON groupe (focusThirdEditorGroup, pas le second, sinon on déplaçait un
//     groupe étranger).
setWorld({ projixCol: 3, groups: 3 });
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true);
names = emitted();
ok('3 colonnes : le focus vise le groupe de Kablix (3e), pas le 2e',
  names.includes('workbench.action.focusThirdEditorGroup'), names.join(' · '));
ok('3 colonnes : Kablix ramené jusqu’à la colonne 1 (deux échanges)',
  projixColumnNow() === 1
  && names.filter((n) => n === 'workbench.action.moveActiveEditorGroupLeft').length === 2,
  `col=${projixColumnNow()} · ${names.join(' · ')}`);
ok('focus : au-delà de la 8e colonne, aucune commande (VS Code n’en a pas)',
  L.focusGroupCommand(9) === null && L.focusGroupCommand(8) === 'workbench.action.focusEighthEditorGroup');

// 12. …et applyDefaultLayout ne rejette jamais (l'appelant fait `void`, un rejet
//     serait avalé sans trace et la disposition resterait à moitié posée).
setWorld({ projixCol: 2, failing: Object.keys(KNOWN_COMMANDS) });
let rejected = false;
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true).catch(() => { rejected = true; });
ok('robustesse : applyDefaultLayout ne rejette pas, même si TOUT échoue', !rejected);

// 13. Onglet de code déjà ouvert : on le RETROUVE et on le repositionne, au lieu
//     d'en ouvrir un second (doublon signalé au lancement du débogage).
/** Monde à `groups` colonnes, onglet `code.py` dans la colonne `codeCol`. */
function setCodeWorld({ codeCol = 1, groups = 2, alsoIn } = {}) {
  setWorld({ projixCol: groups, groups });
  globalThis.__vs.movingUri = 'code.py';
  for (const g of globalThis.__vs.groups) g.tabs = g.tabs.filter((t) => t.input?.uri !== 'code.py');
  addTab(codeCol, { uri: 'code.py' });
  if (alsoIn) addTab(alsoIn, { uri: 'code.py' });
}
const codeTabCol = (preferred) => L.textTabColumn('code.py', preferred);

setCodeWorld({ codeCol: 1 });
ok('onglet : le code déjà ouvert est retrouvé dans sa colonne', codeTabCol(2) === 1, codeTabCol(2));
ok('onglet : l’onglet .projix (viewType) n’est jamais pris pour un fichier de code',
  L.textTabColumn('x.projix') === undefined, L.textTabColumn('x.projix'));
setCodeWorld({ codeCol: 1, alsoIn: 2 });
ok('onglet : ouvert deux fois → la colonne préférée l’emporte', codeTabCol(2) === 2, codeTabCol(2));
ok('onglet : commande de déplacement d’un cran (Left/Right, pas de ToNthGroup)',
  L.editorMoveCommand(1, 2) === 'workbench.action.moveEditorToRightGroup'
  && L.editorMoveCommand(2, 1) === 'workbench.action.moveEditorToLeftGroup'
  && L.editorMoveCommand(2, 2) === null);

setCodeWorld({ codeCol: 1 });
await L.moveEditorToColumn('code.py', 2);
names = emitted();
ok('onglet : repositionné dans la colonne de code (un seul cran)',
  codeTabCol(2) === 2 && names.filter((n) => n === 'workbench.action.moveEditorToRightGroup').length === 1,
  `col=${codeTabCol(2)} · ${names.join(' · ')}`);

setCodeWorld({ codeCol: 3, groups: 3 });
await L.moveEditorToColumn('code.py', 1);
names = emitted();
ok('onglet : 3 colonnes → deux crans jusqu’à la colonne 1',
  codeTabCol(1) === 1 && names.filter((n) => n === 'workbench.action.moveEditorToLeftGroup').length === 2,
  `col=${codeTabCol(1)} · ${names.join(' · ')}`);

setCodeWorld({ codeCol: 2 });
await L.moveEditorToColumn('code.py', 2);
ok('onglet : déjà du bon côté → aucun déplacement', emitted().length === 0, emitted().join(' · '));

// 14. panel.ts passe bien par revealSource : demander `viewColumn: codeColumn`
//     à `showTextDocument` alors que le fichier est ouvert ailleurs est
//     EXACTEMENT ce qui créait le doublon.
const panelSrc = readFileSync(join(ROOT, 'src', 'panel.ts'), 'utf8');
ok('panel.ts : plus de showTextDocument forcé sur codeColumn (source du doublon)',
  !/viewColumn:\s*codeColumn\(/.test(panelSrc));
ok('panel.ts : openCodeFile et la ligne de débogage passent par revealSource',
  (panelSrc.match(/this\.revealSource\(/g) ?? []).length >= 2
  && /private async revealSource\(/.test(panelSrc));

// 15. v2026.7.188 — à l'ouverture d'un projet, son programme s'ouvre AUSSI, à
//     côté, sans voler le focus à Kablix. Le point délicat est le MOMENT :
//     ouvrir l'onglet pendant resolveCustomEditor volerait l'activation au
//     .projix (le layout attend `panel.active`) et le code atterrirait dans le
//     groupe de Kablix, pas encore verrouillé.
const editorSrc = readFileSync(join(ROOT, 'src', 'projix-editor.ts'), 'utf8');
ok('ouverture : le programme du projet est retenu pour être montré (pendingCodeReveal)',
  /this\.pendingCodeReveal = uri;/.test(panelSrc) && /public async revealPendingCodeFile\(/.test(panelSrc));
ok('ouverture : montré SANS voler le focus (revealSource preserveFocus) et focus rendu à Kablix',
  /revealPendingCodeFile[\s\S]{0,900}?this\.revealSource\(uri, true\)[\s\S]{0,200}?this\.panel\.reveal\(undefined, false\)/.test(panelSrc));
ok('ouverture : un artefact compilé (.hex/.uf2/.elf/.bin) n’est jamais ouvert',
  /revealPendingCodeFile[\s\S]{0,600}?\\\.\(hex\|uf2\|elf\|bin\)\$/.test(panelSrc));
ok('ouverture : le programme du projet PRÉCÉDENT est oublié (remis à undefined)',
  /restoreCodeFile[\s\S]{0,400}?this\.pendingCodeReveal = undefined;/.test(panelSrc));
ok('ouverture : le .projix montre le code APRÈS la disposition et le verrou du groupe',
  editorSrc.indexOf('revealPendingCodeFile') > editorSrc.indexOf('lockSimulatorGroup()')
  && editorSrc.indexOf('lockSimulatorGroup()') > editorSrc.indexOf('applyDefaultLayout(this.context)'),
  `layout=${editorSrc.indexOf('applyDefaultLayout(this.context)')} lock=${editorSrc.indexOf('lockSimulatorGroup()')} reveal=${editorSrc.indexOf('revealPendingCodeFile')}`);
ok('ouverture : « Ouvrir un projet » (dialogue) montre lui aussi le programme',
  /openProjectFromBytes\(bytes, picked\[0\]\);[\s\S]{0,300}?await this\.revealPendingCodeFile\(\);/.test(panelSrc));

// 16. v2026.7.188 — le panneau d'accueil est réduit à UN bouton. La VUE reste
//     déclarée : c'est elle qui porte l'icône de la barre d'activité et le
//     déclencheur d'ouverture (extension.ts, onDidChangeVisibility).
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const nlsEn = JSON.parse(readFileSync(join(ROOT, 'package.nls.json'), 'utf8'));
const nlsFr = JSON.parse(readFileSync(join(ROOT, 'package.nls.fr.json'), 'utf8'));
const links = (s) => [...s.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
for (const [lang, nls] of [['en', nlsEn], ['fr', nlsFr]]) {
  ok(`accueil (${lang}) : un seul bouton, « ouvrir le simulateur »`,
    links(nls['kablix.welcome']).length === 1
    && links(nls['kablix.welcome'])[0] === 'command:kablix.openSimulator',
    links(nls['kablix.welcome']).join(' · '));
}
ok('accueil : la commande du bouton est bien déclarée dans le manifeste',
  manifest.contributes.commands.some((c) => c.command === 'kablix.openSimulator'));
ok('accueil : la vue kablix.home reste déclarée (elle porte l’icône de la barre d’activité)',
  manifest.contributes.views?.kablix?.some((v) => v.id === 'kablix.home')
  && manifest.contributes.viewsContainers?.activitybar?.some((c) => c.id === 'kablix'));
ok('accueil : l’icône Kablix ouvre toujours le simulateur (onDidChangeVisibility)',
  /createTreeView\('kablix\.home'/.test(readFileSync(join(ROOT, 'src', 'extension.ts'), 'utf8'))
  && /homeView\.onDidChangeVisibility/.test(readFileSync(join(ROOT, 'src', 'extension.ts'), 'utf8')));

// 17. v2026.7.199 — RÉGRESSION signalée par Frank : « tous les fichiers de code
//     fermés, j'ouvre un .projix → le code s'ouvre au bon endroit mais la taille
//     des panneaux n'est pas refaite ». Il n'y a alors qu'UNE zone : la seconde,
//     créée vide par setEditorLayout, est refermée par VS Code (closeEmptyGroups)
//     et la grille est perdue AVANT que le code n'arrive.
/** Ouvre un onglet de code : le groupe de Kablix étant verrouillé, il part dans
 *  une NOUVELLE zone, à droite (ce que fait VS Code). */
function openCodeTabInNewGroup() {
  const g = globalThis.__vs.groups;
  g.push({ viewColumn: g.length + 1, tabs: [], activeTab: undefined, locked: false });
  addTab(g.length, { uri: 'main.py' });
}

setWorld({ projixCol: 1, groups: 1 });
globalThis.__vs.groups[0].tabs = [];
addTab(1, { viewType: 'kablix.projix', uri: 'x.projix' });
const ctxSettle = makeContext({ 'kablix.layout.kablixSide': 'right', 'kablix.layout.codeRatio': 0.3 });
await L.applyDefaultLayout(ctxSettle, true);
ok('une seule zone : la grille posée sur une zone VIDE ne survit pas (cause de la régression)',
  globalThis.__vs.groups.length === 1 && globalThis.__vs.grid === undefined,
  `zones=${globalThis.__vs.groups.length} grille=${JSON.stringify(globalThis.__vs.grid)}`);

// Repli si l'API manque (ancienne version) : le banc doit ÉCHOUER en listant les
// contrôles, pas casser net sur un TypeError.
ok('layout.ts : editorGroupCount et settleLayoutAfterCode sont exportés',
  typeof L.editorGroupCount === 'function' && typeof L.settleLayoutAfterCode === 'function');
const editorGroupCount = L.editorGroupCount ?? (() => globalThis.__vs.groups.length);
const settleLayoutAfterCode = L.settleLayoutAfterCode ?? (async () => {});

const groupsBefore = editorGroupCount();
ok('mesure : une seule zone avant l’ouverture du code', groupsBefore === 1, groupsBefore);
openCodeTabInNewGroup();
globalThis.__vs.calls = [];
await settleLayoutAfterCode(ctxSettle, groupsBefore);
names = emitted();
ok('après le code : la grille est REPOSÉE (30 % code / 70 % Kablix)',
  Math.abs((globalThis.__vs.grid ?? [])[0] - 0.3) < 1e-9
  && Math.abs((globalThis.__vs.grid ?? [])[1] - 0.7) < 1e-9,
  JSON.stringify(globalThis.__vs.grid));
ok('après le code : Kablix ramené du côté mémorisé (droite), le code à gauche',
  projixColumnNow() === 2, projixColumnNow());
ok('après le code : largeurs reposées APRÈS l’échange de côté',
  names.indexOf('vscode.setEditorLayout') > names.indexOf('workbench.action.moveActiveEditorGroupRight'),
  names.join(' · '));

// 17 bis. Les deux zones existaient déjà : on ne retouche à RIEN (un ajustement
//     manuel de l'utilisateur doit être respecté).
setWorld({ projixCol: 2 });
globalThis.__vs.calls = [];
await settleLayoutAfterCode(makeContext({ 'kablix.layout.kablixSide': 'left' }), 2);
ok('deux zones déjà là : aucune commande (la disposition en place est respectée)',
  emitted().length === 0, emitted().join(' · '));

// 17 ter. Le code n'a finalement pas ouvert de seconde zone (artefact compilé,
//     fichier disparu) : rien à répartir, aucune commande.
setWorld({ projixCol: 1, groups: 1 });
globalThis.__vs.calls = [];
await settleLayoutAfterCode(makeContext({ 'kablix.layout.kablixSide': 'right' }), 1);
ok('toujours une seule zone : aucune commande', emitted().length === 0, emitted().join(' · '));

// 17 quater. Le câblage : projix-editor mesure les zones AVANT le reveal du code
//     et repose la disposition APRÈS.
ok('projix-editor : zones comptées avant le reveal, disposition reposée après',
  /const groupsBefore = editorGroupCount\(\);[\s\S]{0,200}?revealPendingCodeFile\(\);[\s\S]{0,200}?settleLayoutAfterCode\(this\.context, groupsBefore\)/.test(editorSrc));

// 18. v2026.8.1 — RÉGRESSION signalée par Frank : « pour une raison quelconque
//     une .projix s'est ouverte dans CHAQUE zone, et là c'est la panique ».
//     Le côté de Kablix n'est alors plus défini (le premier .projix trouvé ne
//     veut rien dire), l'échange de groupes déplace n'importe quoi et le verrou
//     protège la mauvaise zone. « Réarranger » remet désormais chaque onglet
//     dans SA zone : ateliers côté Kablix, fichiers de code côté code.
ok('layout.ts : sortTabsIntoColumns est exporté', typeof L.sortTabsIntoColumns === 'function');

/** Monde à deux zones décrit à la carte : onglets de la col.1, puis de la col.2. */
function setTabs(col1, col2, { lockedCols = [] } = {}) {
  globalThis.__vs = {
    groups: [1, 2].map((c) => ({
      viewColumn: c, tabs: [], activeTab: undefined, locked: lockedCols.includes(c),
    })),
    layout: { orientation: 0, groups: [{ size: 0.3 }, { size: 0.7 }] },
    calls: [], status: [], errors: [], unknown: [], failing: [], focused: 1,
    closed: [], moving: undefined,
  };
  for (const input of col1) addTab(1, input);
  for (const input of col2) addTab(2, input);
}
/** Onglet d'atelier / de fichier / de fiche d'aide (webview à viewType). */
const P = (uri) => ({ viewType: 'kablix.projix', uri });
const F = (uri) => ({ uri });
const AIDE = (uri) => ({ viewType: 'kablix.partHelp', uri });
/** Contenu lisible d'une colonne : « projix:x.projix code:main.py ». */
const contenu = (col) => (globalThis.__vs.groups.find((g) => g.viewColumn === col)?.tabs ?? [])
  .map((t) => (t.input.viewType ? t.input.viewType.replace('kablix.', '') : 'code') + ':' + t.input.uri)
  .join(' ');
/** Zones verrouillées, dans l'ordre des colonnes. */
const verrous = () => globalThis.__vs.groups.map((g) => (g.locked ? g.viewColumn : 0)).filter(Boolean);

const ctxDroite = () => makeContext({ 'kablix.layout.kablixSide': 'right', 'kablix.layout.codeRatio': 0.3 });

// 18a. Le MÊME atelier ouvert des deux côtés : l'exemplaire égaré est FERMÉ (le
//      document survit dans l'autre onglet — rien à enregistrer, aucun prompt).
setTabs([F('main.py'), P('x.projix')], [P('x.projix')], { lockedCols: [2] });
await L.applyDefaultLayout(ctxDroite(), true);
ok('panique : même atelier dans les deux zones → le doublon est fermé, pas dupliqué',
  contenu(1) === 'code:main.py' && contenu(2) === 'projix:x.projix',
  `col1=[${contenu(1)}] col2=[${contenu(2)}]`);
ok('panique : la fermeture porte bien sur l’onglet égaré (un seul fermé)',
  globalThis.__vs.closed.length === 1, globalThis.__vs.closed.length);

// 18b. DEUX ateliers différents, un par zone : celui de la zone de code est
//      déplacé (surtout pas fermé — c'est un autre projet), et le code repart
//      dans sa zone.
setTabs([P('a.projix')], [P('b.projix'), F('main.py')], { lockedCols: [2] });
await L.applyDefaultLayout(ctxDroite(), true);
ok('panique : deux ateliers différents → tous les deux côté Kablix, aucun fermé',
  contenu(2).includes('projix:a.projix') && contenu(2).includes('projix:b.projix')
  && globalThis.__vs.closed.length === 0,
  `col1=[${contenu(1)}] col2=[${contenu(2)}] fermés=${globalThis.__vs.closed.length}`);
ok('panique : le fichier de code est renvoyé dans la zone de code',
  contenu(1) === 'code:main.py', `col1=[${contenu(1)}]`);

// 18c. Le verrou de la zone Kablix refuse les éditeurs entrants : sans
//      déverrouillage, l'atelier égaré ne pourrait PAS y revenir.
setTabs([P('a.projix')], [F('main.py')], { lockedCols: [2] });
await L.applyDefaultLayout(ctxDroite(), true);
names = emitted();
ok('verrou : la zone Kablix est déverrouillée avant le tri, reverrouillée après',
  names.indexOf('workbench.action.unlockEditorGroup') >= 0
  && names.lastIndexOf('workbench.action.lockEditorGroup') > names.indexOf('workbench.action.moveEditorToRightGroup'),
  names.join(' · '));
ok('verrou : à la fin, SEULE la zone Kablix est verrouillée',
  verrous().join(',') === '2', `verrouillées=[${verrous().join(',')}]`);
ok('verrou : l’atelier a bien franchi le verrou', contenu(2).includes('projix:a.projix'),
  `col1=[${contenu(1)}] col2=[${contenu(2)}]`);

// 18d. Zone de CODE restée verrouillée (état hérité) : plus aucun fichier ne
//      pouvait y revenir. Le tri la déverrouille aussi.
setTabs([P('a.projix')], [F('main.py')], { lockedCols: [1, 2] });
await L.applyDefaultLayout(ctxDroite(), true);
ok('verrou : la zone de code est déverrouillée elle aussi (sinon le code y reste bloqué)',
  verrous().join(',') === '2', `verrouillées=[${verrous().join(',')}]`);

// 18e. Les webviews Kablix qui ne sont PAS l'atelier (fiche d'aide, guide) ne
//      sont jamais déplacées : l'utilisateur les met où il veut.
setTabs([AIDE('led.md'), F('main.py')], [P('x.projix')], { lockedCols: [2] });
await L.applyDefaultLayout(ctxDroite(), true);
ok('tri : une fiche d’aide reste où elle est (seul l’atelier est repositionné)',
  contenu(1) === 'partHelp:led.md code:main.py' && contenu(2) === 'projix:x.projix',
  `col1=[${contenu(1)}] col2=[${contenu(2)}]`);

// 18f. Kablix à GAUCHE : le tri suit le côté mémorisé, pas une colonne figée.
setTabs([F('main.py')], [P('x.projix')], { lockedCols: [] });
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true);
ok('tri : côté mémorisé à gauche → atelier en col.1, code en col.2',
  contenu(1).includes('projix:x.projix') && contenu(2).includes('code:main.py'),
  `col1=[${contenu(1)}] col2=[${contenu(2)}]`);

// 18g. Rien à trier : aucun déplacement, aucune fermeture (pas de clignotement).
setTabs([F('main.py')], [P('x.projix')], { lockedCols: [2] });
await L.applyDefaultLayout(ctxDroite(), true);
names = emitted();
ok('tri : tout est déjà en place → aucun déplacement d’onglet ni fermeture',
  !names.includes('workbench.action.moveEditorToLeftGroup')
  && !names.includes('workbench.action.moveEditorToRightGroup')
  && globalThis.__vs.closed.length === 0, names.join(' · '));

// 18h. Une seule zone : ne PAS pousser l'unique onglet dans une zone qui
//      n'existe pas — elle serait créée puis la zone d'origine, vidée, refermée
//      (aller-retour visible pour rien).
setTabs([P('x.projix')], [], { lockedCols: [] });
globalThis.__vs.groups = globalThis.__vs.groups.slice(0, 1);
await L.applyDefaultLayout(ctxDroite(), true);
ok('une seule zone : l’unique atelier n’est pas ballotté vers une zone inexistante',
  contenu(1) === 'projix:x.projix' && globalThis.__vs.groups.length === 1,
  `col1=[${contenu(1)}] zones=${globalThis.__vs.groups.length}`);

// 18i. Le tri tourne AUSSI à l'ouverture (retour de Frank en v2026.8.2 : « ça tu
//      le remets ; à l'ouverture on réorganise comme le format sauvegardé »).
//      La v2026.8.1 l'avait réservé à « réarranger » ; un atelier resté côté
//      code après une restauration de session brouillait alors tout le reste.
const layoutSrc = readFileSync(join(ROOT, 'src', 'layout.ts'), 'utf8');
ok('tri : appelé à CHAQUE pose de disposition, ouverture comprise',
  /^\s*await sortTabsIntoColumns\(context\);/m.test(layoutSrc)
  && !/if \(force\) await sortTabsIntoColumns/.test(layoutSrc));
ok('tri : « réarranger » (kablix.rearrangeLayout) force bien la disposition',
  /registerCommand\('kablix\.rearrangeLayout'[\s\S]{0,300}?applyDefaultLayout\(context, true\)/
    .test(readFileSync(join(ROOT, 'src', 'extension.ts'), 'utf8')));
// L'ouverture automatique reste IDEMPOTENTE : une fois la disposition posée
// dans la session, on n'y retouche plus (sinon les onglets sauteraient à chaque
// projet ouvert, alors que l'utilisateur a peut-être réarrangé à la main).
ok('ouverture : la disposition n’est posée qu’UNE fois par session',
  /if \(!force && layoutAppliedThisSession\) return;/.test(layoutSrc));

// 18j. Ateliers dans plusieurs zones : l'échange de GROUPES est suspendu (il
//      déplacerait des groupes au hasard) — c'est le tri qui rassemble.
setTabs([P('a.projix')], [P('b.projix')], { lockedCols: [2] });
await L.applyDefaultLayout(makeContext({ 'kablix.layout.kablixSide': 'left' }), true);
names = emitted();
ok('panique : aucun échange de groupes tant que les ateliers sont éparpillés',
  !names.some((n) => n.startsWith('workbench.action.moveActiveEditorGroup')), names.join(' · '));
ok('panique : les deux ateliers finissent dans la zone Kablix (gauche)',
  contenu(1).includes('projix:a.projix') && contenu(1).includes('projix:b.projix'),
  `col1=[${contenu(1)}] col2=[${contenu(2)}]`);

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail
  ? `layout : ${fail} échec(s).`
  : `layout : ${checks.length} contrôles OK — côté et largeurs rétablis par « réarranger », ids de commandes réels.`);
process.exit(fail ? 1 : 0);
