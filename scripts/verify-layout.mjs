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
};

// --- Faux module `vscode` ----------------------------------------------------
// Piloté depuis le test par globalThis.__vs (groupes d'onglets, grille courante).
// `executeCommand` se comporte comme le vrai : rejet sur un id inconnu, et rejet
// forcé pour les ids listés dans __vs.failing (test de robustesse).
const STUB = `
const KNOWN = ${JSON.stringify(Object.keys(KNOWN_COMMANDS))};
export const ViewColumn = { One: 1, Two: 2 };
export const l10n = { t: (s, ...a) => s.replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const window = {
  get tabGroups() { return { all: globalThis.__vs.groups }; },
  setStatusBarMessage: (m) => globalThis.__vs.status.push(m),
  showErrorMessage: (m) => globalThis.__vs.errors.push(m),
};
export const commands = {
  executeCommand: async (name, arg) => {
    globalThis.__vs.calls.push(arg === undefined ? name : { name, arg });
    if (!KNOWN.includes(name)) {
      globalThis.__vs.unknown.push(name);
      throw new Error("command '" + name + "' not found");
    }
    if (globalThis.__vs.failing.includes(name)) throw new Error('échec simulé : ' + name);
    if (name === 'vscode.getEditorLayout') return globalThis.__vs.layout;
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
        g[i].activeTab = g[i].tabs[0]; g[j].activeTab = g[j].tabs[0];
        globalThis.__vs.focused = j + 1;
      }
    }
    // Déplacement d'un ONGLET (pas du groupe) : l'onglet actif est celui du
    // fichier suivi par le test (__vs.movingUri).
    if (name === 'workbench.action.moveEditorToLeftGroup' || name === 'workbench.action.moveEditorToRightGroup') {
      const g = globalThis.__vs.groups;
      const isMoving = (t) => t.input && !('viewType' in t.input) && t.input.uri === globalThis.__vs.movingUri;
      const i = g.findIndex((gr) => gr.tabs.some(isMoving));
      const j = name.includes('Left') ? i - 1 : i + 1;
      if (i >= 0 && g[j]) {
        const tab = g[i].tabs.find(isMoving);
        g[i].tabs = g[i].tabs.filter((t) => t !== tab);
        g[j].tabs.push(tab);
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
function setWorld({ projixCol = 2, projixActive = true, groups = 2, layout, failing = [] } = {}) {
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
    return { viewColumn: col, tabs, activeTab: tabs[0] };
  };
  globalThis.__vs = {
    groups: Array.from({ length: groups }, (_, i) => mk(i + 1)),
    layout: layout ?? { orientation: 0, groups: [{ size: 0.25 }, { size: 0.75 }] },
    calls: [], status: [], errors: [], unknown: [], failing, focused: 1,
  };
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
  globalThis.__vs.groups[codeCol - 1].tabs.push({ input: { uri: 'code.py' } });
  if (alsoIn) globalThis.__vs.groups[alsoIn - 1].tabs.push({ input: { uri: 'code.py' } });
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

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail
  ? `layout : ${fail} échec(s).`
  : `layout : ${checks.length} contrôles OK — côté et largeurs rétablis par « réarranger », ids de commandes réels.`);
process.exit(fail ? 1 : 0);
