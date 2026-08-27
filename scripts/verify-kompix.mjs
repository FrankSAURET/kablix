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
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
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
  // Les dépôts sont pilotés par le banc (globalThis.__depots) : sans eux, le
  // gestionnaire ne voit aucun composant distant à comparer.
  getConfiguration: () => ({ get: (key, def) => (
    key === 'componentsFolder' ? DOSSIER
    : key === 'componentRepositories' ? (globalThis.__depots ?? def)
    : def
  ) }),
  createFileSystemWatcher: () => ({
    onDidCreate: () => nul, onDidChange: () => nul, onDidDelete: () => nul, dispose(){},
  }),
  workspaceFolders: undefined,
};
export class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } }
export class Disposable { constructor(fn) { this.dispose = fn || (() => {}); } }
export const Uri = { file: (p) => ({ fsPath: p }) };
export const window = {
  // Réponse de la modale pilotée par le banc : globalThis.__reponseModale.
  showWarningMessage: async () => globalThis.__reponseModale,
  showErrorMessage: async () => undefined,
  createWebviewPanel: () => ({ webview: { html: '', postMessage: () => {} }, reveal(){}, onDidDispose(){}, dispose(){} }),
};
export const ViewColumn = { One: 1 };
export const commands = { executeCommand: async () => undefined };
export const l10n = { t: (s) => s };
// Langue de l'éditeur, pilotée par le banc (globalThis.__langue) : c'est elle
// qui choisit la traduction des libellés d'un composant de bibliothèque.
export const env = { get language() { return globalThis.__langue ?? 'en'; } };
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

// Le gestionnaire de composants : même traitement, il sert à plusieurs tests
// (page rendue, désinstallation).
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
const { ComponentManagerPanel, compareVersions } = await import(`file://${gestionnaire.replace(/\\/g, '/')}`);

/** Un gestionnaire posé sur la vraie bibliothèque, avec un panneau bouchon. */
function gestionnaireNu() {
  const envoyes = [];
  const nu = Object.create(ComponentManagerPanel.prototype);
  nu.library = lib;
  nu.allComponents = [];
  nu.localTypes = new Set();
  nu.panel = { webview: { html: '', postMessage: (m) => envoyes.push(m) } };
  nu.envoyes = envoyes;
  return nu;
}

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

test('les propriétés et le contrôle de simulation reviennent intacts', async () => {
  // Ce que le format doit porter pour qu'un composant de bibliothèque soit
  // RÉGLABLE (champs de l'inspecteur, `prm_<nom>`) et PILOTABLE en simulation
  // (curseur ou interrupteur posé sur le composant) — sans quoi il ne serait
  // qu'un dessin câblable.
  const relu = await allerRetour({
    type: 'test-reglages',
    label: 'Réglable',
    kind: 'analog-source',
    pins: [{ name: 'AO', x: 0, y: 10 }, { name: 'GND', x: 20, y: 10 }],
    pinRoles: { AO: 'AO' },
    params: [
      { name: 'r1', label: 'Résistance à 1 Lx (Ω)', value: 12000 },
      { name: 'gamma', label: 'Gamma', value: 0.7 },
    ],
    control: { type: 'slider', label: 'Éclairement', unit: 'Lx', min: 1, max: 10000, step: 1, expr: '5 * r1 / (r1 + x)' },
    svg: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
  });
  eq(relu.params.length, 2, 'nombre de paramètres');
  eq(relu.params[1].name, 'gamma', 'nom du second paramètre');
  eq(relu.params[1].value, 0.7, 'valeur décimale de paramètre');
  eq(relu.control.type, 'slider', 'type de contrôle');
  eq(relu.control.unit, 'Lx', 'unité du contrôle');
  eq(relu.control.max, 10000, 'borne haute du contrôle');
  eq(relu.control.expr, '5 * r1 / (r1 + x)', 'caractéristique du contrôle');
});

test('la borne haute du curseur peut venir d’un paramètre', async () => {
  // Capteur de lumière Grove : sa pleine échelle se règle dans l'inspecteur, et
  // le curseur de simulation doit suivre. Le manifeste ne porte alors qu'un NOM
  // de paramètre (`maxParam`) ; sans lui, la course du curseur resterait figée
  // sur la valeur écrite au moment de la fabrication du paquet.
  const relu = await allerRetour({
    type: 'test-pleine-echelle',
    label: 'Pleine échelle',
    kind: 'analog-source',
    pins: [{ name: 'SIG', x: 0, y: 10 }, { name: 'GND', x: 20, y: 10 }],
    pinRoles: { AO: 'SIG' },
    params: [{ name: 'lxmax', label: 'Éclairement pleine échelle (lx)', value: 500 }],
    control: { type: 'slider', label: 'Éclairement', unit: 'lx', min: 0, max: 500, step: 1, maxParam: 'lxmax' },
    svg: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
  });
  eq(relu.control.maxParam, 'lxmax', 'paramètre de borne haute');
  eq(relu.params[0].name, 'lxmax', 'le paramètre désigné existe');
  eq(relu.params[0].value, 500, 'valeur de départ de la pleine échelle');
});

test('un composant sans contrôle de simulation n’en invente pas', async () => {
  const relu = await allerRetour({
    type: 'test-sans-controle',
    label: 'Sans contrôle',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
  });
  // `null` au manifeste, rien du tout côté composant : c'est `!!control` qui
  // décide de poser un curseur, un objet vide en ferait apparaître un.
  if (relu.control) throw new Error(`contrôle inventé : ${JSON.stringify(relu.control)}`);
});

test('les pièces mobiles du dessin et le lecteur de badges reviennent intacts', async () => {
  // Grove-RFID : deux blocs neufs du format. `toggles` dit quelles PIÈCES du
  // dessin un clic déplace (le cavalier de mode, la flèche qui pousse le badge)
  // et `rfid` dit ce que le module ENVOIE. Tout est déclaratif : perdre un seul
  // de ces champs en route rendrait le composant muet ou immobile, sans erreur.
  const relu = await allerRetour({
    type: 'test-badges',
    label: 'Lecteur',
    kind: 'passive',
    pins: [{ name: 'Tx', x: 0, y: 10 }, { name: 'Rx', x: 0, y: 20 }],
    toggles: [
      {
        attr: 'mode', knob: 'Cavalier', title: 'Mode',
        options: [{ value: 'uart', label: 'UART', dx: 0 }, { value: 'wiegand', label: 'Wiegand', dx: 10 }],
      },
      {
        attr: 'tag', knob: 'Badge', handle: 'Fleche', flip: 'Fleche',
        zone: { x: 22, y: 103, w: 40, h: 16 },
        options: [{ value: 'out', label: 'Dehors' }, { value: 'in', label: 'Dans la boucle', dx: 100, flip: true }],
      },
    ],
    rfid: {
      tagAttr: 'tag', tagIn: 'in', modeAttr: 'mode', display: 'CodeRFID', repeatMs: 1000,
      modes: [
        { value: 'uart', proto: 'uart', pin: 'Tx', baud: 9600, codes: ['0F0034AB12'] },
        { value: 'wiegand', proto: 'wiegand', pin: 'Tx', pin1: 'Rx', pulseUs: 50, gapUs: 2000, codes: ['1A34B12'] },
      ],
    },
    svg: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
  });
  eq(relu.toggles?.length, 2, 'nombre de bascules');
  eq(relu.toggles[0].knob, 'Cavalier', 'pièce déplacée par la première bascule');
  eq(relu.toggles[0].options[1].dx, 10, 'course du cavalier');
  eq(relu.toggles[1].handle, 'Fleche', 'pièce cliquable de la seconde bascule');
  eq(relu.toggles[1].flip, 'Fleche', 'pièce retournée');
  eq(relu.toggles[1].options[1].flip, true, 'retournement de la flèche');
  eq(relu.toggles[1].zone?.w, 40, 'zone cliquable de repli');
  eq(relu.rfid?.display, 'CodeRFID', 'zone de texte du numéro');
  eq(relu.rfid.repeatMs, 1000, 'cadence de répétition');
  eq(relu.rfid.modes.length, 2, 'nombre de langues');
  eq(relu.rfid.modes[0].baud, 9600, 'vitesse série');
  eq(relu.rfid.modes[1].pin1, 'Rx', 'second fil Wiegand');
  eq(relu.rfid.modes[1].gapUs, 2000, 'repos entre deux creux');
  eq(relu.rfid.modes[1].codes[0], '1A34B12', 'numéro de badge');
});

test('un composant ordinaire n’invente ni pièce mobile ni lecteur de badges', async () => {
  const relu = await allerRetour({
    type: 'test-sans-bascule',
    label: 'Ordinaire',
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
  });
  if (relu.toggles) throw new Error(`bascule inventée : ${JSON.stringify(relu.toggles)}`);
  if (relu.rfid) throw new Error(`lecteur inventé : ${JSON.stringify(relu.rfid)}`);
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
  // Retiré du dossier : laissé en place, il ferait râler la console à CHAQUE
  // scan des tests suivants et noierait le compte rendu.
  const { unlinkSync } = await import('node:fs');
  unlinkSync(join(WORK_DIR, 'casse.kompix'));
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
// Désinstallation d'un composant depuis le gestionnaire.
// ─────────────────────────────────────────────────────────────────────────────

/** Installe une pièce jetable et rend son type. */
async function installeJetable(type, origin = 'local') {
  await allerRetour({
    type,
    label: `Jetable ${type}`,
    kind: 'passive',
    pins: [],
    svg: '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
  }, origin);
  return type;
}

test('listInstalled() décrit ce qui est réellement installé', async () => {
  await installeJetable('test-liste', 'remote');
  const fiche = lib.listInstalled().find((c) => c.type === 'test-liste');
  if (!fiche) throw new Error('le composant installé n’est pas listé');
  eq(fiche.label, 'Jetable test-liste', 'libellé');
  eq(fiche.version, '1.2.3', 'version du manifeste');
  eq(fiche.origin, 'remote', 'origine');
  if (!fiche.thumbnail?.startsWith('data:image/svg+xml;base64,')) {
    throw new Error(`vignette absente ou mal formée : ${fiche.thumbnail}`);
  }
  const dessin = Buffer.from(fiche.thumbnail.split(',')[1], 'base64').toString('utf8');
  if (!dessin.includes('<rect width="10" height="10"/>')) throw new Error('vignette vide');
});

test('supprimer un composant efface le fichier ET son entrée d’index', async () => {
  await installeJetable('test-a-supprimer');
  eq(existsSync(join(WORK_DIR, 'test-a-supprimer.kompix')), true, 'fichier avant suppression');

  eq(await lib.removeKompix('test-a-supprimer'), true, 'suppression réussie');
  eq(existsSync(join(WORK_DIR, 'test-a-supprimer.kompix')), false, 'fichier après suppression');
  eq(lib.getIndexEntry('test-a-supprimer'), undefined, 'entrée d’index');
  // Le composant ne doit pas revenir au scan suivant.
  eq(lib.getComponents().some((c) => c.type === 'test-a-supprimer'), false, 'présence après suppression');
});

test('supprimer un fichier déjà absent purge quand même l’index', async () => {
  await installeJetable('test-fantome');
  const { unlinkSync } = await import('node:fs');
  unlinkSync(join(WORK_DIR, 'test-fantome.kompix')); // effacé dans le dos de la bibliothèque
  eq(await lib.removeKompix('test-fantome'), true, 'suppression d’un fichier absent');
  eq(lib.getIndexEntry('test-fantome'), undefined, 'entrée d’index purgée');
});

test('un installé qu’aucun dépôt ne propose apparaît quand même dans la grille', async () => {
  await installeJetable('test-hors-depot');
  const nu = gestionnaireNu();
  await nu.load();
  const fiche = nu.allComponents.find((c) => c.type === 'test-hors-depot');
  if (!fiche) throw new Error('le composant local est invisible : impossible de le supprimer');
  eq(fiche.local, true, 'marqué installé');
});

test('la modale refusée ne supprime rien', async () => {
  const type = await installeJetable('test-annule');
  const nu = gestionnaireNu();
  await nu.load();
  globalThis.__reponseModale = undefined; // « Annuler »
  await nu.deleteComponents([type]);
  eq(existsSync(join(WORK_DIR, `${type}.kompix`)), true, 'fichier après annulation');
  eq(nu.envoyes.at(-1).cancelled, true, 'annulation signalée à la page');
});

test('la modale acceptée supprime, et seulement ce qui est installé', async () => {
  const type = await installeJetable('test-confirme');
  const nu = gestionnaireNu();
  await nu.load();
  globalThis.__reponseModale = 'Delete'; // libellé rendu par le bouchon l10n
  await nu.deleteComponents([type, 'type-jamais-installe']);
  eq(existsSync(join(WORK_DIR, `${type}.kompix`)), false, 'fichier après confirmation');
  eq(nu.envoyes.at(-1).success, true, 'succès signalé à la page');
  eq(lib.getComponents().some((c) => c.type === type), false, 'composant encore en bibliothèque');
});

test('la page du gestionnaire sait vraiment parler à l’extension', () => {
  const nu = Object.create(ComponentManagerPanel.prototype);
  const html = nu.generateHtml([
    { type: 'led', label: 'LED', version: '1.0.0', local: true, origin: 'local' },
  ]);
  // Sans acquireVsCodeApi(), « vscode » n'existe pas : tout bouton lève une
  // ReferenceError silencieuse — c'est ce qui rendait « Télécharger » mort.
  if (!html.includes('acquireVsCodeApi()')) throw new Error('API webview jamais acquise');
  if (!/id="deleteBtn"/.test(html)) throw new Error('pas de bouton de suppression');
  if (!/command: 'delete'/.test(html)) throw new Error('le bouton n’envoie pas la demande');
  // Les vignettes sont des data: URI : sans img-src, la CSP les bloque toutes.
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html);
  if (!csp || !csp[1].includes('img-src data:')) throw new Error(`CSP sans img-src : ${csp && csp[1]}`);
});

test('la page, ouverte dans un vrai navigateur, sélectionne et demande la suppression', () => {
  const chrome = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
  if (!chrome) {
    console.log('    (Chrome introuvable — contrôle sauté)');
    return;
  }

  const nu = Object.create(ComponentManagerPanel.prototype);
  const html = nu.generateHtml([
    { type: 'led', label: 'LED', version: '1.0.0', local: true, origin: 'remote', sourceUrl: 'https://x/led.kompix' },
    { type: 'r220', label: 'Résistance', version: '2.0.0', local: false, sourceUrl: 'https://x/r220.kompix' },
    { type: 'perso', label: 'Le mien', version: '0.1.0', local: true, origin: 'local' },
  ]);
  const nonce = /<script nonce="([^"]+)">/.exec(html)[1];

  // L'API webview n'existe pas hors de VS Code : on la bouchonne, avec le même
  // nonce (la CSP de la page refuse tout script qui n'en porte pas).
  const avant = `<script nonce="${nonce}">
    window.__envois = [];
    window.acquireVsCodeApi = () => ({
      postMessage: (m) => window.__envois.push(m),
      getState: () => null,
      setState: () => {},
    });
  </script>`;

  const scenario = `<script nonce="${nonce}">
    const res = [];
    const ok = (name, cond, detail = '') => res.push({ name, ok: !!cond, detail: String(detail) });
    const cartes = () => [...document.querySelectorAll('.component-card')];
    const filtre = (n) => document.querySelectorAll('#filter button')[n];
    const dl = () => document.getElementById('downloadBtn');
    const del = () => document.getElementById('deleteBtn');

    ok('au départ, seuls les nouveaux sont montrés', cartes().length === 1, cartes().length);
    cartes()[0].click();
    ok('un nouveau active Télécharger', !dl().disabled);
    ok('un nouveau n active pas Supprimer', del().disabled);

    filtre(1).click(); // « Installés »
    ok('le filtre Installés montre les deux installés', cartes().length === 2, cartes().length);
    ok('changer de filtre remet les boutons au repos', dl().disabled && del().disabled);

    cartes()[1].click(); // « Le mien » : installé, proposé par aucun dépôt
    ok('un installé active Supprimer', !del().disabled);
    ok('un installé sans dépôt n active pas Télécharger', dl().disabled);
    cartes()[0].click(); // « LED » : installée ET proposée par un dépôt
    ok('un installé que le dépôt propose reste téléchargeable (mise à jour)', !dl().disabled);
    cartes()[0].click(); // désélectionnée : reste « Le mien »
    del().click();
    const envoi = window.__envois.at(-1);
    ok('le clic envoie la demande de suppression', envoi && envoi.command === 'delete', JSON.stringify(envoi));
    ok('avec le bon type', envoi && envoi.types.length === 1 && envoi.types[0] === 'perso', JSON.stringify(envoi));

    filtre(2).click(); // « Tous »
    ok('le filtre Tous montre tout', cartes().length === 3, cartes().length);

    const out = document.createElement('pre');
    out.id = 'mesures';
    out.textContent = JSON.stringify(res);
    document.body.appendChild(out);
  </script>`;

  const page = join(WORK_DIR, 'gestionnaire.html');
  writeFileSync(page, html.replace('</head>', `${avant}</head>`).replace('</body>', `${scenario}</body>`), 'utf8');

  const dom = execFileSync(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom',
      `file:///${page.replace(/\\/g, '/')}`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  const m = /<pre id="mesures"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) throw new Error('la page n’a rien mesuré : son script ne s’est pas exécuté');
  const rows = JSON.parse(
    m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  );
  const rates = rows.filter((r) => !r.ok);
  if (rates.length > 0) {
    throw new Error(rates.map((r) => `${r.name} (${r.detail})`).join(' ; '));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Mention « Experimental » : un composant que Frank n'a pas encore validé est
// visible dans le gestionnaire, mais sa carte le dit. Le drapeau part du
// manifeste et doit arriver jusqu'au dessin de la carte, en passant par l'index
// public (la carte d'un composant PAS ENCORE installé est dessinée depuis lui).
// ─────────────────────────────────────────────────────────────────────────────

test('la mention « Experimental » va du paquet jusqu’à la carte', async () => {
  const paquet = join(ROOT, 'kablix_components', 'grove-rfid.kompix');
  if (!existsSync(paquet)) {
    console.log('    (grove-rfid.kompix absent — contrôle sauté)');
    return;
  }
  const zip = await new JSZip().loadAsync(readFileSync(paquet));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  eq(manifest.experimental, true, 'drapeau dans le manifeste du paquet');

  // L'index public : sans lui, la carte ne saurait rien avant téléchargement.
  const index = JSON.parse(readFileSync(join(ROOT, 'kablix_components', 'index.json'), 'utf8'));
  const entree = index.components.find((c) => c.type === 'grove-rfid');
  eq(entree && entree.experimental, true, 'drapeau dans index.json');
  const etabli = index.components.find((c) => c.type === 'dmx-grove');
  eq(etabli && etabli.experimental, undefined, 'un composant validé n’a aucune mention');

  // Installé pour de bon : c'est la bibliothèque qui relit le manifeste.
  await lib.saveKompix(paquet, 'remote', 'https://exemple/grove-rfid.kompix');
  const installe = lib.listInstalled().find((c) => c.type === 'grove-rfid');
  eq(installe && installe.experimental, true, 'drapeau relu par la bibliothèque');
});

test('la carte d’un composant à l’essai porte la mention, les autres non', () => {
  const chrome = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
  if (!chrome) {
    console.log('    (Chrome introuvable — contrôle sauté)');
    return;
  }

  const nu = Object.create(ComponentManagerPanel.prototype);
  const html = nu.generateHtml([
    { type: 'essai', label: 'À l’essai', version: '2026.8.1', local: false, experimental: true },
    { type: 'etabli', label: 'Établi', version: '2026.8.1', local: false },
  ]);
  const nonce = /<script nonce="([^"]+)">/.exec(html)[1];
  const avant = `<script nonce="${nonce}">
    window.acquireVsCodeApi = () => ({ postMessage: () => {}, getState: () => null, setState: () => {} });
  </script>`;
  const scenario = `<script nonce="${nonce}">
    const res = [];
    const ok = (name, cond, detail = '') => res.push({ name, ok: !!cond, detail: String(detail) });
    const cartes = [...document.querySelectorAll('.component-card')];
    const pastilles = document.querySelectorAll('.badge-experimental');
    ok('une seule carte porte la pastille', pastilles.length === 1, pastilles.length);
    ok('la pastille est sur le composant à l essai',
      cartes[0] && cartes[0].querySelector('.badge-experimental'), cartes.length);
    ok('la pastille dit Experimental',
      pastilles[0] && /experimental/i.test(pastilles[0].textContent), pastilles[0] && pastilles[0].textContent);
    ok('sa carte se distingue aussi au cadre',
      cartes[0] && cartes[0].classList.contains('experimental'), cartes[0] && cartes[0].className);
    ok('le composant établi n a rien',
      cartes[1] && !cartes[1].classList.contains('experimental'), cartes[1] && cartes[1].className);
    const out = document.createElement('pre');
    out.id = 'mesures';
    out.textContent = JSON.stringify(res);
    document.body.appendChild(out);
  </script>`;

  const page = join(WORK_DIR, 'gestionnaire-essai.html');
  writeFileSync(page, html.replace('</head>', `${avant}</head>`).replace('</body>', `${scenario}</body>`), 'utf8');
  const dom = execFileSync(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom',
      `file:///${page.replace(/\\/g, '/')}`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  const m = /<pre id="mesures"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) throw new Error('la page n’a rien mesuré : son script ne s’est pas exécuté');
  const rows = JSON.parse(
    m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  );
  const rates = rows.filter((r) => !r.ok);
  if (rates.length > 0) throw new Error(rates.map((r) => `${r.name} (${r.detail})`).join(' ; '));
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

// ─────────────────────────────────────────────────────────────────────────────
// Mise à jour d'un composant déjà installé.
//
// Le filtre « Nouveaux » ne regardait que le TYPE : un composant corrigé dans le
// dépôt (fiche d'aide ajoutée, dessin repris) n'y apparaissait plus, et il
// fallait le supprimer pour le réinstaller. Il se signale maintenant tant que la
// version du dépôt dépasse celle de la machine.
// ─────────────────────────────────────────────────────────────────────────────

test('comparer deux versions se fait en nombres, pas en chaînes', () => {
  if (!(compareVersions('1.2.10', '1.2.9') > 0)) throw new Error('« 1.2.10 » doit dépasser « 1.2.9 »');
  if (!(compareVersions('1.1.0', '1.0.0') > 0)) throw new Error('mineure plus récente');
  if (!(compareVersions('2.0.0', '10.0.0') < 0)) throw new Error('majeure plus ancienne');
  eq(compareVersions('1.2.0', '1.2'), 0, 'segment absent = 0');
  eq(compareVersions('1.0.0', '1.0.0'), 0, 'versions identiques');
  eq(compareVersions(undefined, undefined), 0, 'versions inconnues');
  if (!(compareVersions('1.0.0', undefined) > 0)) throw new Error('une version connue dépasse l’inconnue');
});

/** Un gestionnaire dont le « dépôt » rend ce que le banc lui donne. */
function gestionnaireAvecDepot(composantsDistants) {
  const nu = gestionnaireNu();
  globalThis.__depots = ['https://exemple/depot'];
  nu.fetchRepositoryComponents = async () =>
    composantsDistants.map((c) => ({ ...c, sourceUrl: `https://exemple/depot/${c.type}.kompix` }));
  return nu;
}

test('un installé que le dépôt a fait avancer est marqué « à mettre à jour »', async () => {
  await installeJetable('test-maj', 'remote'); // installé en 1.2.3 (allerRetour)
  const nu = gestionnaireAvecDepot([
    { type: 'test-maj', label: 'À mettre à jour', version: '1.3.0', file: 'test-maj.kompix' },
  ]);
  await nu.load();
  const fiche = nu.allComponents.find((c) => c.type === 'test-maj');
  eq(fiche.local, true, 'toujours marqué installé');
  eq(fiche.update, true, 'mise à jour repérée');
  eq(fiche.installedVersion, '1.2.3', 'version de la machine retenue');
  eq(fiche.version, '1.3.0', 'version du dépôt affichée');
  globalThis.__depots = undefined;
});

test('un installé à jour (ou plus récent) ne réclame rien', async () => {
  await installeJetable('test-a-jour', 'remote');
  const nu = gestionnaireAvecDepot([
    { type: 'test-a-jour', label: 'Déjà à jour', version: '1.2.3', file: 'test-a-jour.kompix' },
  ]);
  await nu.load();
  eq(nu.allComponents.find((c) => c.type === 'test-a-jour').update, false, 'même version');

  const enRetard = gestionnaireAvecDepot([
    { type: 'test-a-jour', label: 'Dépôt en retard', version: '1.0.0', file: 'test-a-jour.kompix' },
  ]);
  await enRetard.load();
  eq(enRetard.allComponents.find((c) => c.type === 'test-a-jour').update, false, 'dépôt plus ancien');
  globalThis.__depots = undefined;
});

test('le filtre « Nouveaux » montre les mises à jour, pas les composants à jour', () => {
  const nu = Object.create(ComponentManagerPanel.prototype);
  const html = nu.generateHtml([
    { type: 'neuf', label: 'Jamais installé', version: '1.0.0', local: false },
    { type: 'maj', label: 'À mettre à jour', version: '2.0.0', installedVersion: '1.0.0', local: true, update: true },
    { type: 'ok', label: 'Déjà à jour', version: '1.0.0', installedVersion: '1.0.0', local: true, update: false },
  ]);

  // Le filtre vit dans le script de la page : on l'exécute sur les mêmes données.
  const filtre = /filteredComponents = components\.filter\(c =>([\s\S]*?)\);/.exec(html);
  if (!filtre) throw new Error('le filtre a disparu de la page');
  const composants = [
    { type: 'neuf', local: false, update: false },
    { type: 'maj', local: true, update: true },
    { type: 'ok', local: true, update: false },
  ];
  const predicat = new Function('c', 'mode', `return (${filtre[1].trim()});`);
  const garde = (mode) => composants.filter((c) => predicat(c, mode)).map((c) => c.type);
  eq(garde('new').join(','), 'neuf,maj', 'filtre « Nouveaux »');
  eq(garde('installed').join(','), 'maj,ok', 'filtre « Installés »');
  eq(garde('all').join(','), 'neuf,maj,ok', 'filtre « Tous »');

  // Et la carte le dit à l'œil : classe, badge, ancienne version barrée.
  if (!/component-card' \+ \(comp\.local \? ' local' : ''\) \+ \(comp\.update \? ' update' : ''\)/.test(html)) {
    throw new Error('la carte ne porte plus la classe « update »');
  }
  if (!html.includes('from-version')) throw new Error('l’ancienne version n’est plus affichée');
  if (!/\.component-card\.update::after/.test(html)) throw new Error('pas de badge de mise à jour');
});

// ─────────────────────────────────────────────────────────────────────────────
// Traduction des libellés d'un composant de bibliothèque : ils ne sont PAS dans
// le catalogue de Kablix (qui ne connaît que les composants natifs), le paquet
// emporte donc les siennes dans un bloc « l10n » de son manifeste.
// ─────────────────────────────────────────────────────────────────────────────

/** Pose un paquet traduit dans la bibliothèque et la fait rescanner. */
async function poseTraduit(type, langue) {
  globalThis.__langue = langue;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    kompixVersion: 1,
    type,
    label: 'Base label',
    description: 'Base description',
    version: '2026.8.1',
    author: 'Banc',
    kind: 'passive',
    category: 'Misc',
    pins: [{ name: 'A', x: 0, y: 0 }],
    params: [{ name: 'address', label: 'DMX address', value: 1 }],
    control: { type: 'slider', label: 'Level', unit: 'lx', min: 0, max: 10 },
    l10n: {
      fr: {
        label: 'Libellé traduit',
        description: 'Description traduite',
        params: { address: 'Adresse DMX' },
        control: { label: 'Niveau', unit: 'lux' },
      },
    },
  }));
  zip.file('schema.svg', `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><g id="${type}"><rect width="10" height="10"/></g></svg>`);
  writeFileSync(join(WORK_DIR, `${type}.kompix`), Buffer.from(await zip.generateAsync({ type: 'uint8array' })));
  await lib.scanLibrary();
  return lib.getComponents().find((c) => c.type === type);
}

/** Manifeste relu d'un tampon .kompix. */
async function manifesteDe(buffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await new JSZip().loadAsync(buffer);
  return JSON.parse(await zip.file('manifest.json').async('string'));
}

test('un composant de bibliothèque sort dans la langue de VS Code', async () => {
  const part = await poseTraduit('test-l10n', 'fr');
  eq(part.label, 'Libellé traduit', 'libellé de la palette');
  eq(part.params[0].label, 'Adresse DMX', 'libellé de propriété');
  eq(part.params[0].value, 1, 'valeur de propriété inchangée');
  eq(part.control.label, 'Niveau', 'libellé du contrôle');
  eq(part.control.unit, 'lux', 'unité du contrôle');
  eq(part.control.max, 10, 'course du contrôle inchangée');
  const fiche = lib.listInstalled().find((c) => c.type === 'test-l10n');
  eq(fiche.description, 'Description traduite', 'description de la carte du gestionnaire');
});

test('une langue sans traduction garde la langue de base du paquet', async () => {
  const part = await poseTraduit('test-l10n', 'de');
  eq(part.label, 'Base label', 'libellé non traduit');
  eq(part.params[0].label, 'DMX address', 'propriété non traduite');
  eq(part.control.label, 'Level', 'contrôle non traduit');
});

test('« fr-CA » retombe sur « fr », pas sur l’anglais', async () => {
  const part = await poseTraduit('test-l10n', 'fr-CA');
  eq(part.label, 'Libellé traduit', 'la variante régionale sert la langue');
});

test('réenregistrer un composant traduit ne grave pas la traduction', async () => {
  // La webview ne connaît QUE les libellés traduits : sans précaution, un
  // réenregistrement figerait le français en langue de base et perdrait le bloc.
  const part = await poseTraduit('test-l10n', 'fr');
  const manifest = await manifesteDe(await lib.createKompixBufferFromPartData(part, '2026.8.2'));
  eq(manifest.label, 'Base label', 'libellé rendu à sa langue de base');
  eq(manifest.description, 'Base description', 'description rendue à sa langue de base');
  eq(manifest.params[0].label, 'DMX address', 'propriété rendue à sa langue de base');
  eq(manifest.control.label, 'Level', 'contrôle rendu à sa langue de base');
  eq(manifest.control.unit, 'lx', 'unité rendue à sa langue de base');
  eq(manifest.l10n?.fr?.label, 'Libellé traduit', 'le bloc de traduction a survécu');
  eq(manifest.l10n?.fr?.params?.address, 'Adresse DMX', 'traduction des propriétés gardée');
  // Le composant vivant, lui, garde ses libellés traduits sous les yeux.
  eq(part.control.unit, 'lux', 'le contrôle affiché n’a pas été retourné en langue de base');
});

test('un libellé changé à la main est gardé tel quel', async () => {
  const part = await poseTraduit('test-l10n', 'fr');
  const modifie = { ...part, label: 'Mon nom à moi', params: [{ name: 'address', label: 'Mon réglage', value: 7 }] };
  const manifest = await manifesteDe(await lib.createKompixBufferFromPartData(modifie, '2026.8.2'));
  eq(manifest.label, 'Mon nom à moi', 'le libellé retouché est conservé');
  eq(manifest.params[0].label, 'Mon réglage', 'la propriété retouchée est conservée');
});

test('la vraie lecture d’un dépôt traduit les cartes du gestionnaire', async () => {
  const index = {
    components: [{
      type: 'depot-l10n',
      label: 'Repo label',
      description: 'Repo description',
      version: '2026.8.1',
      file: 'depot-l10n.kompix',
      l10n: { fr: { label: 'Libellé du dépôt', description: 'Description du dépôt' } },
    }],
  };
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => index });
  try {
    const nu = gestionnaireNu();
    globalThis.__langue = 'fr';
    const [enFr] = await nu.fetchRepositoryComponents('https://exemple/depot/');
    eq(enFr.label, 'Libellé du dépôt', 'carte en français');
    eq(enFr.description, 'Description du dépôt', 'description en français');
    eq(enFr.sourceUrl, 'https://exemple/depot/depot-l10n.kompix', 'URL du paquet toujours construite');

    globalThis.__langue = 'en';
    const [enEn] = await nu.fetchRepositoryComponents('https://exemple/depot/');
    eq(enEn.label, 'Repo label', 'carte en langue de base');
    eq(enEn.description, 'Repo description', 'description en langue de base');
  } finally {
    globalThis.fetch = vraiFetch;
    globalThis.__langue = 'en';
  }
});

test('les paquets publiés emportent bien leur traduction française', async () => {
  const { readFileSync } = await import('node:fs');
  const index = JSON.parse(readFileSync(join(ROOT, 'kablix_components', 'index.json'), 'utf8'));
  for (const type of ['dmx-grove', 'spot']) {
    const entree = index.components.find((c) => c.type === type);
    if (!entree) throw new Error(`« ${type} » absent de l’index publié`);
    if (!entree.l10n?.fr?.label) throw new Error(`« ${type} » : pas de libellé français dans l’index`);
    if (!entree.l10n.fr.description) throw new Error(`« ${type} » : pas de description française dans l’index`);
    if (!/^\d{4}\.\d{1,2}\.\d+$/.test(entree.version)) {
      throw new Error(`« ${type} » : version « ${entree.version} » hors calver`);
    }
    const manifest = await manifesteDe(readFileSync(join(ROOT, 'kablix_components', `${type}.kompix`)));
    eq(manifest.l10n?.fr?.label, entree.l10n.fr.label, `${type} : le paquet et l’index disent la même chose`);
    eq(manifest.version, entree.version, `${type} : même version dans le paquet et l’index`);
  }
  // La propriété du projecteur est traduite, elle aussi : c'est elle qu'on lit
  // dans le volet des propriétés une fois le composant posé.
  const spot = index.components.find((c) => c.type === 'spot');
  if (!spot.l10n.fr.params?.address) throw new Error('l’adresse DMX du projecteur n’est pas traduite');
});

await runTests();

rmSync(WORK_DIR, { recursive: true, force: true });

console.log(`\n✓ ${passed} / ${passed + failed} tests passed`);
if (failed > 0) process.exit(1);
