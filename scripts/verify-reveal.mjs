// Icône Kablix : RÉVÉLER l'atelier .projix déjà ouvert au lieu d'empiler un
// « nouveau projet » (src/openproject.ts).
//
// Défaut signalé par Frank : « si je change de dossier, il ouvre un nouveau
// kablix dans un nouveau panneau ; je veux le même panneau s'il en existe un
// d'ouvert ». Cause : après un rechargement de fenêtre, VS Code restaure bien
// l'onglet .projix, mais un éditeur PERSONNALISÉ n'est résolu que lorsqu'il
// devient visible — `SimulatorPanel.active()` renvoie donc `undefined` alors
// qu'un atelier est là, replié dans un autre groupe. L'icône ouvrait un second
// atelier à côté du premier.
//
// Le vrai module est bundlé avec un faux `vscode` (mêmes classes `TabInput*`,
// donc le même `instanceof` que dans VS Code) : on vérifie les commandes
// RÉELLEMENT émises, pas une réécriture.
//
// Usage : node scripts/verify-reveal.mjs
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-reveal-'));

// --- Faux module `vscode` ----------------------------------------------------
// Piloté par globalThis.__vs (groupes d'onglets, groupe actif, commandes émises).
// `TabInputCustom` / `TabInputText` / `TabInputNotebook` sont de VRAIES classes,
// comme dans l'API : le module testé les distingue par `instanceof`.
const STUB = `
export class TabInputCustom { constructor(uri, viewType) { this.uri = uri; this.viewType = viewType; } }
export class TabInputText { constructor(uri) { this.uri = uri; } }
export class TabInputNotebook { constructor(uri, notebookType) { this.uri = uri; this.notebookType = notebookType; } }
export const ViewColumn = { One: 1, Two: 2 };
export const l10n = { t: (s, ...a) => s.replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const Uri = { parse: (s) => ({ scheme: s.split(':')[0], path: s.slice(s.indexOf(':') + 1), toString: () => s }) };
export const window = {
  get tabGroups() {
    return {
      all: globalThis.__vs.groups,
      activeTabGroup: globalThis.__vs.groups.find((g) => g.isActive),
    };
  },
  setStatusBarMessage: (m) => globalThis.__vs.status.push(m),
  showErrorMessage: (m) => globalThis.__vs.errors.push(m),
};
export const commands = {
  executeCommand: async (name, ...args) => {
    globalThis.__vs.calls.push({ name, args });
    if (globalThis.__vs.failing.includes(name)) throw new Error('échec simulé : ' + name);
    // Fichier disparu du disque : seule l'ouverture de CETTE uri échoue.
    if (globalThis.__vs.failingUri && String(args[0]) === globalThis.__vs.failingUri) {
      throw new Error('fichier introuvable : ' + args[0]);
    }
    if (name === 'vscode.getEditorLayout') return globalThis.__vs.layout;
    return undefined;
  },
};
// Les classes sont publiées sur globalThis : le stub est INLINÉ dans le bundle,
// donc l'importer à part depuis le test donnerait des classes JUMELLES et tous
// les \`instanceof\` du module testé échoueraient.
globalThis.__vscodeStub = { TabInputCustom, TabInputText, TabInputNotebook };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

const stubPlugin = {
  name: 'vscode-stub',
  setup(build) {
    build.onResolve({ filter: /^vscode$/ }, () => ({ path: join(tmp, 'vscode-stub.mjs') }));
  },
};
const out = join(tmp, 'openproject.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src', 'openproject.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  plugins: [stubPlugin],
  logLevel: 'silent',
});
const O = await import(pathToFileURL(out).href);
const V = globalThis.__vscodeStub;

// --- Bancs -------------------------------------------------------------------
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

/** Contexte d'extension minimal : un globalState en mémoire. */
const makeContext = (state = {}) => ({
  globalState: {
    get: (k, d) => (k in state ? state[k] : d),
    update: async (k, v) => {
      state[k] = v;
    },
  },
  _state: state,
});

const projixTab = (uri) => ({ input: new V.TabInputCustom(uri, 'kablix.projix') });
const textTab = (uri) => ({ input: new V.TabInputText(uri) });
const otherCustomTab = (uri) => ({ input: new V.TabInputCustom(uri, 'imagePreview.previewEditor') });
const notebookTab = (uri) => ({ input: new V.TabInputNotebook(uri, 'jupyter-notebook') });

/**
 * Monde à N groupes. `spec` : tableau d'objets { tabs, active, isActive } où
 * `active` est l'index de l'onglet au premier plan du groupe.
 */
function setWorld(spec, { failing = [], failingUri } = {}) {
  const groups = spec.map((g, i) => {
    const group = { viewColumn: i + 1, tabs: g.tabs, isActive: !!g.isActive };
    group.activeTab = g.tabs[g.active ?? 0];
    for (const t of g.tabs) t.group = group;
    return group;
  });
  globalThis.__vs = { groups, calls: [], status: [], errors: [], failing, failingUri };
}

/** Appels `vscode.openWith` émis depuis la remise à zéro du monde. */
const openings = () =>
  globalThis.__vs.calls
    .filter((c) => c.name === 'vscode.openWith')
    .map((c) => ({ uri: String(c.args[0]), viewType: c.args[1], column: c.args[2] }));

// 1. Aucun atelier ouvert → nouveau projet (comportement historique préservé).
setWorld([{ tabs: [textTab('main.py')], isActive: true }]);
await O.openOrRevealProjix(makeContext({ 'kablix.layout.kablixSide': 'right' }));
let opened = openings();
ok(
  'aucun .projix ouvert → un « nouveau projet » untitled est créé',
  opened.length === 1 && opened[0].uri.startsWith('untitled:') && opened[0].viewType === 'kablix.projix',
  JSON.stringify(opened)
);
ok('nouveau projet : posé dans la colonne Kablix mémorisée (droite → 2)', opened[0]?.column === 2, opened[0]?.column);

setWorld([{ tabs: [textTab('main.py')], isActive: true }]);
await O.openOrRevealProjix(makeContext({ 'kablix.layout.kablixSide': 'left' }));
ok('nouveau projet : côté gauche mémorisé → colonne 1', openings()[0]?.column === 1, openings()[0]?.column);

// 2. RÉGRESSION (changement de dossier) : l'onglet .projix est restauré dans un
//    autre groupe et n'est PAS au premier plan. Aucune session vivante — c'est
//    exactement le cas où l'icône empilait un second atelier.
setWorld([
  { tabs: [textTab('main.py')], isActive: true },
  { tabs: [textTab('notes.md'), projixTab('projet.projix')], active: 0 },
]);
await O.openOrRevealProjix(makeContext({ 'kablix.layout.kablixSide': 'right' }));
opened = openings();
ok(
  'atelier restauré dans un autre groupe → il est RÉVÉLÉ (aucun nouveau projet)',
  opened.length === 1 && opened[0].uri === 'projet.projix',
  JSON.stringify(opened)
);
ok(
  'atelier révélé : dans SA colonne (celle de son groupe), pas la colonne mémorisée',
  opened[0]?.column === 2,
  opened[0]?.column
);
ok('atelier révélé : rouvert dans le MÊME viewType (sinon VS Code ouvrirait un éditeur différent)',
  opened[0]?.viewType === 'kablix.projix', opened[0]?.viewType);
ok('atelier révélé : aucun untitled créé au passage',
  opened.every((o) => !o.uri.startsWith('untitled:')), JSON.stringify(opened));

// 3. Un « nouveau projet » jamais enregistré est un atelier comme un autre : il
//    est révélé, pas doublé par un second untitled.
setWorld([{ tabs: [projixTab('untitled:Nouveau projet.projix')], isActive: true }]);
await O.openOrRevealProjix(makeContext());
opened = openings();
ok(
  'atelier untitled restauré → révélé, pas un second « nouveau projet »',
  opened.length === 1 && opened[0].uri === 'untitled:Nouveau projet.projix',
  JSON.stringify(opened)
);

// 4. Priorités de choix.
setWorld([
  { tabs: [projixTab('gauche.projix')], isActive: false },
  { tabs: [projixTab('droite.projix')], isActive: true },
]);
ok(
  'priorité : l’atelier du groupe ACTIF l’emporte',
  O.findOpenProjixTab()?.input.uri === 'droite.projix',
  O.findOpenProjixTab()?.input.uri
);

setWorld([
  { tabs: [textTab('main.py')], isActive: true },
  { tabs: [textTab('notes.md'), projixTab('caché.projix')], active: 0 },
  { tabs: [projixTab('devant.projix')], active: 0 },
]);
ok(
  'priorité : un atelier au PREMIER PLAN de son groupe passe devant un atelier en arrière-plan',
  O.findOpenProjixTab()?.input.uri === 'devant.projix',
  O.findOpenProjixTab()?.input.uri
);

setWorld([
  { tabs: [textTab('main.py')], isActive: true },
  { tabs: [textTab('notes.md'), projixTab('seul.projix')], active: 0 },
]);
ok(
  'priorité : aucun atelier au premier plan → le premier trouvé, même en arrière-plan',
  O.findOpenProjixTab()?.input.uri === 'seul.projix',
  O.findOpenProjixTab()?.input.uri
);

// 5. Onglets étrangers : jamais pris pour un atelier.
setWorld([
  { tabs: [textTab('x.projix'), otherCustomTab('photo.png'), notebookTab('essai.ipynb')], isActive: true },
]);
ok(
  'un fichier texte nommé .projix n’est pas un atelier (l’éditeur personnalisé seul compte)',
  O.findOpenProjixTab() === undefined
);
ok('un autre éditeur personnalisé (aperçu d’image) n’est pas un atelier', O.findOpenProjixTab() === undefined);
await O.openOrRevealProjix(makeContext({ 'kablix.layout.kablixSide': 'right' }));
ok(
  'onglets étrangers seuls → on retombe bien sur un nouveau projet',
  openings().length === 1 && openings()[0].uri.startsWith('untitled:'),
  JSON.stringify(openings())
);

// 6. Aucun groupe du tout (fenêtre vide) : pas d'exception.
setWorld([]);
ok('fenêtre sans aucun groupe → aucun atelier trouvé, pas d’exception', O.findOpenProjixTab() === undefined);
await O.openOrRevealProjix(makeContext());
ok('fenêtre sans aucun groupe → un nouveau projet est ouvert', openings().length === 1);

// 7. Chaque « nouveau projet » a une URI DISTINCTE (même URI ⇒ VS Code se
//    contenterait de révéler l'onglet déjà ouvert).
setWorld([{ tabs: [textTab('main.py')], isActive: true }]);
const ctx = makeContext();
await O.openNewProjix(ctx);
await O.openNewProjix(ctx);
await O.openNewProjix(ctx);
const uris = openings().map((o) => o.uri);
ok('nouveaux projets : trois URI untitled distinctes', new Set(uris).size === 3, uris.join(' · '));

// 8. ROBUSTESSE : l'onglet restauré pointe un fichier disparu → on ne laisse pas
//    l'icône sans effet (l'appelant fait `void`, un rejet passerait inaperçu).
setWorld([{ tabs: [projixTab('disparu.projix')], isActive: true }], {
  failingUri: 'disparu.projix',
});
let rejected = false;
await O.openOrRevealProjix(makeContext()).catch(() => {
  rejected = true;
});
ok('robustesse : openOrRevealProjix ne rejette pas si l’ouverture échoue', !rejected);
ok(
  'robustesse : fichier disparu → repli sur un nouveau projet',
  openings().length === 2 && openings()[1].uri.startsWith('untitled:'),
  JSON.stringify(openings())
);

// 9. Garde-fous de source : le câblage réel de l'icône Kablix.
const extSrc = readFileSync(join(ROOT, 'src', 'extension.ts'), 'utf8');
// Ce que fait l'icône de la barre d'activité, isolé du reste du fichier :
// `openWorkshop` l'ouvre, `registerProjixEditor` le suit. La tranche couvre les
// DEUX chemins qui y mènent — l'événement de visibilité et, depuis l'activation
// paresseuse, le rattrapage « volet déjà visible quand `activate()` tourne ».
const handler = extSrc.slice(
  extSrc.indexOf('const openWorkshop'),
  extSrc.indexOf('registerProjixEditor(context)')
);
ok(
  'extension.ts : sans session vivante, l’icône passe par openOrRevealProjix',
  /openOrRevealProjix\(context\)/.test(handler)
);
ok(
  'extension.ts : l’icône n’appelle plus openNewProjix directement (source du doublon)',
  handler.length > 100 && !/openNewProjix\(/.test(handler),
  `${handler.length} caractères`
);
ok(
  'extension.ts : une session vivante est toujours révélée telle quelle',
  /const active = SimulatorPanel\.active\(\);[\s\S]{0,400}?active\.reveal\(\)/.test(handler)
);

// 10. Le type d'éditeur a UNE seule source : un littéral en double se
//     désynchroniserait sans que rien ne le signale.
const editorSrc = readFileSync(join(ROOT, 'src', 'projix-editor.ts'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
ok(
  'projix-editor.ts : viewType repris de PROJIX_VIEW_TYPE (plus de littéral en double)',
  /viewType = PROJIX_VIEW_TYPE;/.test(editorSrc) && !/viewType = 'kablix\.projix'/.test(editorSrc)
);
ok(
  'package.json : l’éditeur personnalisé déclaré porte bien ce viewType',
  (manifest.contributes?.customEditors ?? []).some((e) => e.viewType === O.PROJIX_VIEW_TYPE),
  O.PROJIX_VIEW_TYPE
);

// 11. Activation paresseuse : l'extension ne doit plus s'allumer dans les fenêtres
//     qui ne s'en servent pas, et le clic sur l'icône doit quand même ouvrir
//     l'atelier DU PREMIER COUP.
ok(
  'package.json : plus d’onStartupFinished (l’extension ne s’allume plus à chaque fenêtre)',
  !(manifest.activationEvents ?? []).includes('onStartupFinished'),
  JSON.stringify(manifest.activationEvents ?? [])
);
// Les trois portes qui doivent rester déclarées, sans quoi plus RIEN n'active
// l'extension : les commandes, la vue de la barre d'activité, l'éditeur .projix.
ok(
  'package.json : les trois points d’activation implicites sont déclarés',
  (manifest.contributes?.commands ?? []).length > 0 &&
    (manifest.contributes?.views?.kablix ?? []).some((v) => v.id === 'kablix.home') &&
    (manifest.contributes?.customEditors ?? []).length > 0
);
ok(
  'extension.ts : le volet déjà visible à l’activation ouvre l’atelier (1er clic sur l’icône)',
  /homeView\.visible[\s\S]{0,80}?openWorkshop\(\)/.test(extSrc)
);
// Le garde-fou anti-parasite ne peut plus se caler sur `activate()` : en activation
// paresseuse, il tomberait sur le clic au lieu de la restauration de session.
ok(
  'extension.ts : le garde-fou de démarrage se cale sur l’âge du processus, pas sur activate()',
  /process\.uptime\(\)/.test(extSrc) && /STARTUP_GRACE_MS/.test(extSrc)
);
ok(
  'extension.ts : une seule ouverture si les deux chemins tombent ensemble',
  /lastOpen/.test(handler)
);

// --- Rapport -----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.ok || !c.detail ? '' : ` — ${c.detail}`}`);
}
console.log(`\n${checks.length - failed}/${checks.length} contrôles OK`);
process.exit(failed ? 1 : 0);
