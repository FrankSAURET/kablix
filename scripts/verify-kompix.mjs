// Banc du format .kompix : empaquetage, dépaquetage, aller-retour.
//
// Le banc fait tourner la VRAIE classe KompixLibrary (bundlée par esbuild, avec
// un bouchon `vscode`), pas une réimplémentation : c'est elle qui découpe les
// SVG et remplit l'index de confiance, donc c'est elle qu'il faut mettre à
// l'épreuve. Une version précédente de ce banc empaquetait et dépaquetait avec
// JSZip directement — elle passait au vert pendant que la bibliothèque, elle,
// tronquait les dessins.
//
// Utilisation : npm run verify:kompix
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK_DIR = join(ROOT, 'node_modules', '.cache-verify-kompix');
rmSync(WORK_DIR, { recursive: true, force: true });
mkdirSync(WORK_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
}

function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what} : attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chargement de la vraie bibliothèque, avec un bouchon `vscode` : les seules
// choses qu'elle demande à l'éditeur sont le dossier de stockage, les watchers
// et Disposable.
// ─────────────────────────────────────────────────────────────────────────────
const STUB_VSCODE = `
const nul = { dispose(){} };
export const workspace = {
  getConfiguration: () => ({ get: (key, def) => (key === 'componentsFolder' ? DOSSIER : def) }),
  createFileSystemWatcher: () => ({
    onDidCreate: () => nul, onDidChange: () => nul, onDidDelete: () => nul, dispose(){},
  }),
  workspaceFolders: undefined,
};
export class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } }
export class Disposable { constructor(fn) { this.dispose = fn || (() => {}); } }
export const Uri = { file: (p) => ({ fsPath: p }) };
export const window = { showWarningMessage: async () => undefined, showErrorMessage: async () => undefined };
export const ViewColumn = { One: 1 };
export const commands = { executeCommand: async () => undefined };
export const l10n = { t: (s) => s };
`;

const bundle = join(WORK_DIR, 'kompix-library.mjs');
await build({
  entryPoints: [join(ROOT, 'src', 'kompixLibrary.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  external: ['jszip'],
  plugins: [
    {
      name: 'stub-vscode',
      setup(b) {
        b.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `const DOSSIER = ${JSON.stringify(WORK_DIR)};\n${STUB_VSCODE}`,
          loader: 'js',
        }));
      },
    },
  ],
});
const { KompixLibrary } = await import(`file://${bundle.replace(/\\/g, '/')}`);

const contexteBidon = { globalStorageUri: { fsPath: WORK_DIR } };
const lib = new KompixLibrary(contexteBidon);

/** Empaquette une pièce, l'installe, et rend ce que la bibliothèque en relit. */
async function allerRetour(part, origin = 'local') {
  const buffer = await lib.createKompixBufferFromPartData(part, '1.2.3');
  await lib.saveKompixFromBuffer(buffer, origin, origin === 'remote' ? 'https://exemple/x.kompix' : undefined);
  const relu = lib.getComponents().find((c) => c.type === part.type);
  if (!relu) throw new Error(`« ${part.type} » n'est pas ressorti de la bibliothèque`);
  return relu;
}

// ─────────────────────────────────────────────────────────────────────────────

test('un dessin à groupes imbriqués revient entier', async () => {
  // Inkscape imbrique les groupes en permanence. S'arrêter au premier </g>
  // coupait le composant en deux et rendait un XML non fermé.
  const relu = await allerRetour({
    type: 'test-imbrique',
    label: 'Imbriqué',
    kind: 'passive',
    pins: [{ name: 'A', x: 0, y: 0 }],
    svg: '<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">'
      + '<g id="corps"><rect width="240" height="160"/></g>'
      + '<path d="M0 0 L10 10"/>'
      + '</svg>',
  });
  if (!relu.svg.includes('<rect width="240" height="160"/>')) {
    throw new Error(`le groupe imbriqué a disparu : ${relu.svg}`);
  }
  if (!relu.svg.includes('M0 0 L10 10')) {
    throw new Error(`ce qui suivait le groupe imbriqué a été coupé : ${relu.svg}`);
  }
  eq((relu.svg.match(/<g\b/g) || []).length, (relu.svg.match(/<\/g>/g) || []).length, 'balises <g> ouvertes / fermées');
});

test('la viewBox d’origine survit à l’aller-retour', async () => {
  // C'est elle qui donne l'échelle du composant sur la feuille : une viewBox
  // forfaitaire « 0 0 100 100 » écrasait la taille de tout ce qui n'était pas carré.
  const relu = await allerRetour({
    type: 'test-echelle',
    label: 'Échelle',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="160"/></svg>',
  });
  const vb = /viewBox="([^"]+)"/.exec(relu.svg);
  eq(vb && vb[1], '0 0 240 160', 'viewBox relue');
});

test('une viewBox à origine décalée n’est pas recalée sur zéro', async () => {
  const relu = await allerRetour({
    type: 'test-decale',
    label: 'Décalé',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="12 34 240 160" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="160"/></svg>',
  });
  const vb = /viewBox="([^"]+)"/.exec(relu.svg);
  eq(vb && vb[1], '12 34 240 160', 'viewBox relue');
});

test('le dessin externe n’attrape pas le schéma interne', async () => {
  // L'id était cherché sans son guillemet fermant : demander « diode »
  // ramenait « diode-interne » dès qu'il était écrit en premier.
  const relu = await allerRetour({
    type: 'test-deux-vues',
    label: 'Deux vues',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="DEHORS"/></svg>',
    innerSvg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="DEDANS"/></svg>',
  });
  if (!relu.svg.includes('DEHORS') || relu.svg.includes('DEDANS')) {
    throw new Error(`vue externe polluée : ${relu.svg}`);
  }
  if (!relu.innerSvg || !relu.innerSvg.includes('DEDANS') || relu.innerSvg.includes('DEHORS')) {
    throw new Error(`vue interne polluée : ${relu.innerSvg}`);
  }
});

test('un type contenant un caractère spécial ne casse pas la recherche', async () => {
  // Le type partait tel quel dans une expression régulière : un point y valait
  // « n'importe quel caractère », et pire pour une parenthèse.
  const relu = await allerRetour({
    type: 'test.pt+2',
    label: 'Ponctué',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>',
  });
  if (!relu.svg.includes('<circle r="5"/>')) throw new Error(`dessin perdu : ${relu.svg}`);
});

test('les métadonnées du manifeste reviennent intactes', async () => {
  const relu = await allerRetour({
    type: 'test-meta',
    label: 'Métadonnées',
    kind: 'pushbutton',
    category: 'entrées',
    pins: [{ name: 'P1', x: 10, y: 20 }, { name: 'P2', x: 30, y: 20 }],
    pinRoles: { P1: 'gnd' },
    attrs: { resistance: '100' },
    params: [{ name: 'r', label: 'Résistance', value: 220 }],
    innerOffset: { x: 4, y: 6 },
    svg: '<svg viewBox="0 0 40 30" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="30"/></svg>',
  });
  eq(relu.label, 'Métadonnées', 'label');
  eq(relu.kind, 'pushbutton', 'kind');
  eq(relu.category, 'entrées', 'catégorie');
  eq(relu.pins.length, 2, 'nombre de pattes');
  eq(relu.pins[1].x, 30, 'x de la seconde patte');
  eq(relu.pinRoles.P1, 'gnd', 'rôle de patte');
  eq(relu.params[0].value, 220, 'valeur de paramètre');
  eq(relu.innerOffset.y, 6, 'décalage interne');
});

test('un composant sans schéma interne n’en invente pas', async () => {
  const relu = await allerRetour({
    type: 'test-sans-interne',
    label: 'Sans interne',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
  });
  eq(relu.innerSvg, undefined, 'schéma interne');
});

test('un comportement LOCAL est approuvé d’office', async () => {
  const relu = await allerRetour({
    type: 'test-comportement-local',
    label: 'Local',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
    behaviorScript: 'export function tick() {}\n',
  }, 'local');
  eq(relu.behaviorScript, 'export function tick() {}\n', 'script embarqué');
  eq(relu.kompixMeta.origin, 'local', 'origine');
  eq(relu.kompixMeta.behaviorAccepted, true, 'approbation');
});

test('un comportement DISTANT n’est pas approuvé par sa seule installation', async () => {
  // Installer ne vaut pas « je fais confiance » : c'est ce que la fenêtre
  // modale demande, et elle ne s'ouvrait jamais puisque l'index notait
  // l'acceptation dès l'écriture du fichier.
  const relu = await allerRetour({
    type: 'test-comportement-distant',
    label: 'Distant',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
    behaviorScript: 'export function tick() { /* code venu d’ailleurs */ }\n',
  }, 'remote');
  eq(relu.kompixMeta.origin, 'remote', 'origine');
  eq(relu.kompixMeta.behaviorAccepted, false, 'approbation avant confirmation');
  if (!relu.kompixMeta.behaviorHash) throw new Error('empreinte du comportement absente');
});

test('« Faire confiance » est mémorisé, et seulement pour CE code', async () => {
  const type = 'test-comportement-distant';
  const entree = lib.getIndexEntry(type);
  lib.acceptBehaviorHash(type, 'une-empreinte-qui-n-est-pas-la-bonne');
  eq(lib.getIndexEntry(type).acceptedAt, undefined, 'acceptation sur une autre empreinte');

  lib.acceptBehaviorHash(type, entree.behaviorHash);
  if (!lib.getIndexEntry(type).acceptedAt) throw new Error('acceptation non mémorisée');
});

test('un .kompix sans manifeste valide est écarté, pas planté', async () => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ kompixVersion: 1, label: 'Sans type' }));
  zip.file('schema.svg', '<svg viewBox="0 0 10 10"/>');
  const buffer = await zip.generateAsync({ type: 'uint8array' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(WORK_DIR, 'casse.kompix'), Buffer.from(buffer));

  // La bibliothèque signale le fichier fautif sur la console : c'est ce qu'on
  // attend d'elle, mais ça n'a rien à faire au milieu du compte rendu du banc.
  const rale = console.error;
  console.error = () => {};
  try {
    await lib.scanLibrary();
  } finally {
    console.error = rale;
  }
  if (lib.getComponents().some((c) => c.label === 'Sans type')) {
    throw new Error('un manifeste sans type a été accepté');
  }
  // Les composants valides, eux, sont toujours là.
  if (!lib.getComponents().some((c) => c.type === 'test-meta')) {
    throw new Error('le fichier cassé a interrompu le scan des autres');
  }
});

test('le fichier .kompix atterrit bien dans la bibliothèque', () => {
  if (!existsSync(join(WORK_DIR, 'test-meta.kompix'))) {
    throw new Error('aucun fichier écrit sur le disque');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Le gestionnaire de composants construit sa page en assemblant des chaînes.
// Une coquille dans un gabarit imbriqué (backtick fermé par un guillemet) y
// passait la compilation TypeScript sans broncher et ne cassait QUE le
// JavaScript produit : page muette, grille vide, bouton mort. On compile donc
// le script rendu pour de vrai.
// ─────────────────────────────────────────────────────────────────────────────

test('le script de la page du gestionnaire se compile', async () => {
  const gestionnaire = join(WORK_DIR, 'component-manager.mjs');
  await build({
    entryPoints: [join(ROOT, 'src', 'componentManager.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: gestionnaire,
    external: ['jszip'],
    // Le gestionnaire tire panel.ts, qui touche des dizaines d'API VS Code
    // absentes du bouchon : ces avertissements noieraient le compte rendu.
    // Une vraie erreur de compilation fait toujours échouer build().
    logLevel: 'silent',
    plugins: [
      {
        name: 'stub-vscode',
        setup(b) {
          b.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'stub' }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: `const DOSSIER = ${JSON.stringify(WORK_DIR)};\n${STUB_VSCODE}`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const { ComponentManagerPanel } = await import(`file://${gestionnaire.replace(/\\/g, '/')}`);

  // generateHtml n'a besoin ni du panneau ni de la bibliothèque : un objet nu
  // portant le prototype suffit à obtenir la page.
  const nu = Object.create(ComponentManagerPanel.prototype);
  const html = nu.generateHtml([
    { type: 'led', label: 'LED', description: 'Une LED', version: '1.0.0', author: 'Kablix', reference: 'L-1', local: true },
    { type: 'r220', label: 'Résistance', version: '2.0.0', local: false },
  ]);

  const script = /<script nonce="[^"]*">([\s\S]*?)<\/script>/.exec(html);
  if (!script) throw new Error('aucun script dans la page rendue');

  const { Script } = await import('node:vm');
  try {
    new Script(script[1]);
  } catch (err) {
    throw new Error(`le script rendu ne compile pas : ${err.message}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Le behavior.mjs d'un .kompix est un VRAI module ES (« export function tick »).
// Il partait dans un <script> classique enroulé dans une IIFE : « export » y est
// une erreur de syntaxe, donc aucun comportement embarqué ne s'exécutait jamais.
// On évalue ici la sortie de l'emballeur comme un vrai module.
// ─────────────────────────────────────────────────────────────────────────────

test('un behavior.mjs emballé s’exécute et republie ses fonctions', async () => {
  const emballeur = join(WORK_DIR, 'behavior-wrapper.mjs');
  await build({
    entryPoints: [join(ROOT, 'src', 'webview', 'behavior-wrapper.mts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile: emballeur,
  });
  const { wrapBehaviorModule, BEHAVIOR_REGISTRY } = await import(`file://${emballeur.replace(/\\/g, '/')}`);

  const script = [
    'export function init(ctx) { ctx.vu = "init"; }',
    'export function tick(ctx) { ctx.vu = "tick"; }',
    '',
  ].join('\n');
  const code = wrapBehaviorModule('mon-composant', script);
  await import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);

  const module = globalThis[BEHAVIOR_REGISTRY]?.['mon-composant'];
  if (!module) throw new Error('le module ne s’est pas enregistré');
  eq(typeof module.init, 'function', 'init republié');
  eq(typeof module.tick, 'function', 'tick republié');
  eq(module.destroy, undefined, 'destroy absent du script');

  const ctx = {};
  module.tick(ctx);
  eq(ctx.vu, 'tick', 'tick réellement appelable');

  // Un type venu d'un manifeste distant ne doit jamais s'échapper dans le code.
  const piege = wrapBehaviorModule("x'];globalThis.PIRATE=1;//", 'export function tick() {}\n');
  await import(`data:text/javascript;base64,${Buffer.from(piege, 'utf8').toString('base64')}`);
  eq(globalThis.PIRATE, undefined, 'injection par le nom du type');
});

await runTests();

rmSync(WORK_DIR, { recursive: true, force: true });

console.log(`\n✓ ${passed} / ${passed + failed} tests passed`);
if (failed > 0) process.exit(1);
