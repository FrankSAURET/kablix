// Disposition de l'espace de travail (src/layout.ts) : côté de Kablix, ratio des
// colonnes, « Sauvegarder cette organisation » et « Réarranger ».
//
// Régression v2026.7.183 (signalée par Frank) : après avoir inversé les deux
// zones, « réarranger » remettait le code à gauche et Kablix à droite — il ne
// reposait que les LARGEURS. Deux causes : le côté n'était lu que sur l'onglet
// ACTIF de chaque groupe (donc perdu dès qu'un autre onglet était au premier
// plan), et rien ne déplaçait le groupe.
//
// Le vrai module est bundlé avec un faux `vscode` qui enregistre les commandes
// exécutées : on vérifie les commandes RÉELLEMENT émises, pas une réécriture.
//
// Usage : node scripts/verify-layout.mjs
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-layout-'));

// --- Faux module `vscode` ----------------------------------------------------
// Piloté depuis le test par globalThis.__vs (groupes d'onglets, grille courante).
const STUB = `
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
    if (name === 'vscode.getEditorLayout') return globalThis.__vs.layout;
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
function setWorld({ projixCol = 2, projixActive = true, groups = 2, layout } = {}) {
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
    calls: [], status: [], errors: [],
  };
}

// 1. Choix de la commande d'échange (fonction pure exportée).
ok('échange : Kablix en colonne 2 attendu à gauche → moveEditorGroupLeft',
  L.groupSwapCommand(2, 1) === 'workbench.action.moveEditorGroupLeft', L.groupSwapCommand(2, 1));
ok('échange : Kablix en colonne 1 attendu à droite → moveEditorGroupRight',
  L.groupSwapCommand(1, 2) === 'workbench.action.moveEditorGroupRight', L.groupSwapCommand(1, 2));
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
  names.includes('workbench.action.moveEditorGroupLeft'), names.join(' · '));
ok('réarranger : focus donné au groupe de Kablix avant l’échange',
  names.indexOf('workbench.action.focusSecondEditorGroup') >= 0
  && names.indexOf('workbench.action.focusSecondEditorGroup') < names.indexOf('workbench.action.moveEditorGroupLeft'));
ok('réarranger : largeurs reposées APRÈS l’échange (l’échange emporte les tailles)',
  names.indexOf('vscode.setEditorLayout') > names.indexOf('workbench.action.moveEditorGroupLeft'));

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

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `layout : ${fail} échec(s).` : `layout : ${checks.length} contrôles OK — côté et largeurs rétablis par « réarranger ».`);
process.exit(fail ? 1 : 0);
