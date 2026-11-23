// Document système du .projix (piste 11, lot D1).
//
// Le montage 3D (pièces, poses, liaisons) vit dans le .projix : `system.json`
// à la racine, ses fichiers sous `system/`. Kablix ne l'édite pas encore, mais
// il ne doit JAMAIS le perdre : un projet monté dans Kompix Editor puis ouvert
// et réenregistré dans Kablix garderait sinon son schéma… et plus son montage.
//
// Trois étages :
//   A. `systeme.ts` seul : lecture tolérante, contrôle contre les repères,
//      renommage ;
//   B. `projix.ts` : l'archive grave et relit `system.json` + `system/` ;
//   C. `panel.ts` : ouvrir un .projix puis le réenregistrer garde le document
//      à l'identique (champs inconnus compris), un nouveau projet l'oublie,
//      et les problèmes donnent un avertissement à l'ouverture.
//
// Usage : node scripts/verify-systeme.mjs
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-systeme-'));

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

// Faux `vscode` : ce dont panel.ts et projix.ts ont besoin, avertissements relevés.
const STUB = `
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (b, ...r) => uri([b.fsPath, ...r].join('/')) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
globalThis.__avertis = [];
export const window = {
  showSaveDialog: async () => undefined, showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: (m) => { globalThis.__avertis.push(m); return Promise.resolve(undefined); },
  setStatusBarMessage: () => ({ dispose() {} }), createWebviewPanel: () => { throw new Error('non utilisé'); },
  activeTextEditor: undefined, tabGroups: { all: [], close: async () => {} },
  onDidChangeActiveTextEditor: () => ({ dispose() {} }), registerCustomEditorProvider: () => ({ dispose() {} }),
  visibleTextEditors: [],
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/projet') }],
  fs: { writeFile: async () => {}, readFile: async () => new Uint8Array(), stat: async () => ({ type: 1 }), delete: async () => {} },
  getConfiguration: () => ({ get: (_k, d) => d, update: async () => {} }),
  onDidSaveTextDocument: () => ({ dispose() {} }), onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidCloseTextDocument: () => ({ dispose() {} }), openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath), applyEdit: async () => true,
};
export const commands = { executeCommand: async () => undefined, registerCommand: () => ({ dispose() {} }) };
export const extensions = { getExtension: () => ({ packageJSON: { version: '9.9.9' } }) };
export const env = { clipboard: { readText: async () => '', writeText: async () => {} }, openExternal: async () => true, language: 'fr' };
export const Range = class {}; export const Position = class {}; export const Selection = class {};
export const ThemeIcon = class {}; export const EventEmitter = class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} };
export const TextEdit = { replace: () => ({}) }; export const WorkspaceEdit = class { replace() {} };
export const Disposable = class { static from() { return { dispose() {} }; } dispose() {} };
export const TabInputCustom = class {}; export const TabInputText = class {};
export const StatusBarAlignment = { Left: 1, Right: 2 }; export const ProgressLocation = { Notification: 15 };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 }; export const RelativePattern = class {};
export const FileType = { File: 1, Directory: 2 };
export default { Uri, ViewColumn, l10n, window, workspace, commands, env, extensions };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
const bundle = async (entry, out) => {
  await esbuild.build({
    entryPoints: [join(ROOT, entry)], outfile: join(tmp, out), bundle: true, platform: 'node',
    format: 'esm', logLevel: 'silent', alias: { vscode: join(tmp, 'vscode-stub.mjs') },
  });
  return import(pathToFileURL(join(tmp, out)).href);
};
const S = await bundle('src/systeme.ts', 'systeme.mjs');
const P = await bundle('src/projix.ts', 'projix.mjs');
const { SimulatorPanel } = await bundle('src/panel.ts', 'panel.mjs');

// Bras servo + aimant + Hall (piste 7) monté sur un châssis maillé.
const systeme = () => ({
  format: 'kablix-system',
  version: 1,
  pieces: [
    { id: 'chassis', nom: 'chassis', source: { kind: 'fichier', path: 'meshes/chassis.stl' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } } },
    { id: 'servo', nom: 'servo:Act1', ref: 'Act1', source: { kind: 'kompix', type: 'servo' }, pose: { pos: { x: 10, y: 5, z: 12 }, rot: { x: 0, y: 0, z: 90 } } },
    { id: 'aimant', nom: 'aimant:A1', ref: 'A1', source: { kind: 'kompix', type: 'aimant' }, pose: { pos: { x: 30, y: 5, z: 25 }, rot: { x: 0, y: 0, z: 0 }, miroir: true } },
    { id: 'hall', ref: 'U1', source: { kind: 'kompix', type: 'hall' }, pose: { pos: { x: 60, y: 5, z: 25 }, rot: { x: 0, y: 0, z: 0 } }, futur: 'champ inconnu' },
  ],
  liaisons: [
    { id: 'L1', type: 'encastrement', a: { piece: 'servo' }, b: { piece: 'chassis' } },
    { id: 'L2', type: 'pivot', a: { piece: 'aimant', axe: 'horn' }, b: { piece: 'servo', axe: 'horn' }, params: { min: 0, max: 180 } },
  ],
  editeur: { camera: [1, 2, 3] },
});
const TYPES = { Act1: 'servo', A1: 'aimant', U1: 'hall', R1: 'resistor', M2: 'moteur-dc' };
const schema = { parts: Object.entries(TYPES).map(([id, type]) => ({ id, type, x: 0, y: 0, attrs: {} })), wires: [] };
const maillage = new Uint8Array([115, 111, 108, 105, 100, 32, 99]);

// ------------------------------------------------- A. systeme.ts
{
  const { systeme: s, problemes } = S.lireSysteme(systeme());
  check(s && problemes.length === 0, 'A : un document sain se lit sans problème', JSON.stringify(problemes));
  check(s?.pieces.length === 4 && s?.liaisons.length === 2, 'A : 4 pièces, 2 liaisons');
  check(s?.pieces[1].pose.rot.z === 90 && s?.pieces[2].pose.miroir === true, 'A : poses lues (rotation, miroir)');
  check(s?.liaisons[1].a.axe === 'horn' && s?.liaisons[1].params?.max === 180, 'A : axes nommés et paramètres de liaison gardés');
  check(S.controlerSysteme(s, S.reperesDuSchema(schema), ['meshes/chassis.stl']).length === 0,
    'A : repères et fichier présents → aucun problème');

  check(S.lireSysteme({ pieces: [] }).problemes[0]?.cle === 'format', 'A : pas un document système → « format »');
  check(S.lireSysteme(null).systeme === undefined, 'A : rien → aucun document');
  check(S.lireSysteme({ ...systeme(), version: 7 }).problemes.some((p) => p.cle === 'version-future'),
    'A : version plus récente signalée');

  const abime = systeme();
  abime.pieces.push({ id: 'servo', source: { kind: 'kompix', type: 'servo' } }); // doublon
  abime.pieces.push({ id: 'sansSource' });
  abime.pieces.push({ id: 'evasion', source: { kind: 'fichier', path: '../../secret.stl' } });
  abime.pieces.push({ id: 'absolu', source: { kind: 'fichier', path: 'C:/Windows/x.stl' } });
  abime.liaisons.push({ id: 'L3', type: 'soudure', a: { piece: 'servo' }, b: { piece: 'hall' } });
  abime.liaisons.push({ id: 'L4', type: 'pivot', a: { piece: 'servo' }, b: { piece: 'fantome' } });
  const lu = S.lireSysteme(abime);
  const cles = lu.problemes.map((p) => `${p.cle}:${p.cible ?? ''}`);
  check(lu.systeme?.pieces.length === 4, 'A : pièces abîmées écartées, les bonnes gardées', cles.join(' '));
  check(cles.includes('piece-doublon:servo'), 'A : doublon de pièce signalé');
  check(cles.filter((c) => c.startsWith('piece-invalide')).length === 3,
    'A : pièce sans source, chemin qui remonte, chemin absolu → invalides', cles.join(' '));
  check(cles.includes('liaison-invalide:L3'), 'A : type de liaison inconnu → invalide');
  check(cles.includes('liaison-piece-absente:L4:fantome') && lu.systeme?.liaisons.length === 3,
    'A : liaison vers une pièce absente signalée (gardée)');

  const sansU1 = { parts: schema.parts.filter((p) => p.id !== 'U1') };
  const ctl = S.controlerSysteme(s, S.reperesDuSchema(sansU1), []).map((p) => `${p.cle}:${p.cible}`);
  check(ctl.includes('ref-absente:U1'), 'A : repère supprimé du schéma → « ref-absente »', ctl.join(' '));
  check(ctl.includes('fichier-absent:meshes/chassis.stl'), 'A : maillage absent de l’archive signalé');
  const deux = systeme();
  deux.pieces[3].ref = 'A1';
  const ctl2 = S.controlerSysteme(S.lireSysteme(deux).systeme, ['Act1', 'A1'], ['meshes/chassis.stl']);
  check(ctl2.some((p) => p.cle === 'ref-doublon' && p.cible === 'A1'), 'A : deux pièces pour un repère → doublon');
  check(S.reperesDuSchema({ nimporte: 1 }) === null, 'A : schéma illisible → null');

  const brut = systeme();
  check(S.renommerRepere(brut, 'Act1', 'Act7') === 1 && brut.pieces[1].ref === 'Act7', 'A : renommage suivi dans le brut');
  check(brut.pieces[3].futur === 'champ inconnu', 'A : renommage sans perte des champs inconnus');
  check(S.renommerRepere(brut, 'Zzz', 'Z1') === 0, 'A : renommage d’un repère inconnu → rien');
}

// ------------------------------------------------- D. rôles `rôle:repère` (lot D5)
{
  const R = S.lireRole;
  check(JSON.stringify(R(' Servo : Act1 ')) === JSON.stringify({ role: 'servo', repere: 'Act1', sorte: 'propre' }),
    'D : rôle insensible à la casse, espaces de bord retirés, repère gardé tel quel');
  check(R('roue:M2:avant')?.repere === 'M2:avant', 'D : coupure au PREMIER « : »');
  check(R('chassis') === null && R(undefined) === null, 'D : nom sans « : » → pas de rôle');
  check(R('Sol')?.role === 'sol', 'D : « sol » seul est un rôle');
  check(R('srevo:Act1')?.faute === 'role-inconnu' && R(':Act1')?.faute === 'role-inconnu', 'D : rôle inconnu (faute, rôle vide)');
  check(R('servo:')?.faute === 'role-sans-repere' && R('sol:x')?.faute === 'role-sans-repere', 'D : rôle sans repère, sol avec repère');
  check(S.repereEffectif({ nom: 'servo:Act1' }) === 'Act1' && S.repereEffectif({ nom: 'servo:Act1', ref: 'Act9' }) === 'Act9'
    && S.repereEffectif({ nom: 'roue:M2' }) === undefined, 'D : repère effectif (ref l’emporte ; roue sans repère propre)');

  const piece = (id, nom, extra = {}) => ({ id, nom, source: { kind: 'kompix', type: 'x' }, pose: {}, ...extra });
  const doc = (pieces) => S.lireSysteme({ format: 'kablix-system', version: 1, pieces, liaisons: [] }).systeme;
  const codes = (pieces, reperes = Object.keys(TYPES), types = new Map(Object.entries(TYPES))) =>
    S.controlerSysteme(doc(pieces), reperes, ['roue.stl'], types ?? undefined).map((p) => `${p.cle}:${p.cible}`).sort().join(' ');
  const mecanique = (id, nom) => ({ id, nom, source: { kind: 'fichier', path: 'roue.stl' }, pose: {} });

  // Montage sain : servo nommé sans ref, deux roues sur M2, sol, pièce libre.
  const sain = [
    { id: 's', nom: 'servo:Act1', source: { kind: 'kompix', type: 'servo' }, pose: {} },
    mecanique('r1', 'roue:M2'), mecanique('r2', 'roue:M2'), mecanique('sol', 'sol'), mecanique('c', 'chassis'),
  ];
  const ctlSain = S.controlerSysteme(doc(sain), Object.keys(TYPES), ['roue.stl'], new Map(Object.entries(TYPES)));
  check(ctlSain.length === 0, 'D : montage sain (rôle sans ref, deux roues, sol) → aucun problème', JSON.stringify(ctlSain));
  const { roles } = S.controlerRoles(doc(sain), new Map(Object.entries(TYPES)));
  check(roles.get('s')?.repere === 'Act1' && roles.get('r2')?.role === 'roue' && roles.get('sol')?.sorte === 'sol' && !roles.has('c'),
    'D : rôles rendus (pièce libre sans rôle)');

  check(codes([mecanique('m', 'srevo:Act1')]) === 'role-inconnu:m', 'D : faute de frappe → role-inconnu');
  check(codes([mecanique('m', 'servo:')]) === 'role-sans-repere:m', 'D : servo: → role-sans-repere');
  check(codes([mecanique('m', 'servo:Act1'), mecanique('n', 'Servo:Act1')]) === 'role-doublon:m role-doublon:n',
    'D : même rôle propre deux fois → role-doublon sur les deux, sans ref-doublon en plus');
  check(codes([{ ...mecanique('m', 'servo:Act1'), ref: 'U1' }]) === 'role-ref-different:m role-type:m',
    'D : ref différente → signalée, ref l’emporte (U1 est un hall → role-type)');
  check(codes([{ ...mecanique('m', 'servo:Act1'), ref: 'Act1' }]) === '', 'D : ref identique au nom → rien');
  check(codes([mecanique('m', 'servo:U1')]) === 'role-type:m', 'D : rôle servo sur un hall du schéma → role-type');
  check(codes([piece('m', 'aimant:A1', { source: { kind: 'kompix', type: 'servo' } })]) === 'role-type:m',
    'D : type de source incompatible → role-type');
  check(codes([mecanique('m', 'roue:R1')]) === 'role-type:m', 'D : roue entraînée par une résistance → role-type');
  check(codes([mecanique('m', 'roue:M9')]) === 'role-repere-absent:m', 'D : roue sur un moteur absent → role-repere-absent');
  check(codes([mecanique('m', 'servo:Act9')]) === 'ref-absente:Act9', 'D : rôle propre hors schéma → ref-absente sur le repère effectif');
  check(codes([mecanique('m', 'servo:Act1'), { ...mecanique('n', 'hall'), ref: 'Act1' }]) === 'ref-doublon:Act1',
    'D : repère effectif partagé avec une autre ref → ref-doublon');
  check(codes([mecanique('m', 'roue:M9'), mecanique('n', 'servo:U1')], Object.keys(TYPES), null) === '',
    'D : schéma illisible (pas de types) → pas de contrôle par le schéma');
  const pb = S.controlerRoles(doc([mecanique('m', 'servo:U1'), mecanique('n', 'servo:Act1')]), new Map(Object.entries(TYPES)));
  check(!pb.roles.has('m') && pb.roles.has('n'), 'D : pièce en défaut inerte, les autres gardent leur rôle');
}

// ------------------------------------------------- B. projix.ts
const manifest = { format: 'projix', version: 1, app: 'test', board: 'uno', createdAt: '2026-11-21T00:00:00Z' };
{
  const avec = await P.packProject({ manifest, diagramJson: JSON.stringify(schema), system: systeme(),
    systemFiles: [{ path: 'meshes/chassis.stl', data: maillage }] });
  const zip = await JSZip.loadAsync(avec);
  check(!!zip.file('system.json') && !!zip.file('system/meshes/chassis.stl'), 'B : system.json et system/ gravés');
  const relu = await P.unpackProject(avec);
  check(JSON.stringify(relu.system) === JSON.stringify(systeme()), 'B : document relu à l’identique');
  check(relu.systemFiles.length === 1 && relu.systemFiles[0].path === 'meshes/chassis.stl'
    && Buffer.from(relu.systemFiles[0].data).equals(Buffer.from(maillage)), 'B : maillage relu à l’octet');

  const sans = await P.packProject({ manifest, diagramJson: JSON.stringify(schema) });
  const zipSans = await JSZip.loadAsync(sans);
  check(!zipSans.file('system.json'), 'B : projet sans montage → pas de system.json');
  const reluSans = await P.unpackProject(sans);
  check(reluSans.system === undefined && reluSans.systemFiles.length === 0, 'B : relu sans montage');

  zipSans.file('system.json', '{ pas du json');
  const casse = await P.unpackProject(await zipSans.generateAsync({ type: 'uint8array' }));
  check(casse.system === undefined && Array.isArray(casse.diagram.parts), 'B : system.json illisible → schéma ouvert quand même');
}

// ------------------------------------------------- C. panel.ts : ouvrir puis réenregistrer
const panneau = () => {
  const p = Object.create(SimulatorPanel.prototype);
  const postes = [];
  Object.assign(p, {
    context: { globalState: { get: (_k, d) => d, update: async () => {} } },
    currentBoard: 'uno', codeFileRef: () => undefined, codeFileUri: undefined, effectiveDebugVars: () => ({}),
    embarquesDuProjet: new Map(),
    rememberLastProject() {}, postProjectName() {}, setCurrentBoard() {}, setDebugVars() {},
    postDebugVars() {}, chargerAnalyseur() {}, restoreCodeFile: async () => {}, post: (m) => postes.push(m),
    analyseurPourProjix: () => undefined,
  });
  return p;
};
{
  SimulatorPanel.library = undefined;
  const octets = await P.packProject({ manifest, diagramJson: JSON.stringify(schema), system: systeme(),
    systemFiles: [{ path: 'meshes/chassis.stl', data: maillage }] });
  globalThis.__avertis.length = 0;
  const p = panneau();
  await p.openProjectFromBytes(octets, { fsPath: 'W:/projet/bras.projix' });
  check(globalThis.__avertis.length === 0, 'C : projet sain → aucun avertissement', globalThis.__avertis.join(' | '));
  const regrave = await JSZip.loadAsync(await p.buildProjixBytes(schema, 'uno'));
  const doc = JSON.parse(await regrave.file('system.json')?.async('string') ?? 'null');
  check(JSON.stringify(doc) === JSON.stringify(systeme()),
    'C : réenregistré depuis Kablix, le montage repart à l’identique (champs inconnus compris)');
  check(!!regrave.file('system/meshes/chassis.stl'), 'C : les fichiers du montage repartent aussi');

  // Projet ancien, sans montage : rien n'apparaît.
  const q = panneau();
  await q.openProjectFromBytes(await P.packProject({ manifest, diagramJson: JSON.stringify(schema) }), { fsPath: 'W:/projet/vieux.projix' });
  const vieux = await JSZip.loadAsync(await q.buildProjixBytes(schema, 'uno'));
  check(!vieux.file('system.json'), 'C : projet sans montage → toujours sans montage après enregistrement');

  // Montage qui désigne un composant retiré du schéma : avertissement, document gardé.
  globalThis.__avertis.length = 0;
  const r = panneau();
  const sansU1 = { ...schema, parts: schema.parts.filter((x) => x.id !== 'U1') };
  await r.openProjectFromBytes(await P.packProject({ manifest, diagramJson: JSON.stringify(sansU1), system: systeme() }),
    { fsPath: 'W:/projet/abime.projix' });
  const msg = globalThis.__avertis.join(' | ');
  check(/U1/.test(msg) && /meshes\/chassis\.stl/.test(msg), 'C : repère absent et fichier manquant dits à l’ouverture', msg);
  const garde = await JSZip.loadAsync(await r.buildProjixBytes(sansU1, 'uno'));
  check(!!garde.file('system.json'), 'C : un montage à problème est gardé quand même (rien ne se perd)');

  // Rôle qui ne correspond pas au composant du schéma : dit à l'ouverture, par le panneau.
  globalThis.__avertis.length = 0;
  const faux = systeme();
  faux.pieces[2].nom = 'servo:U1';
  delete faux.pieces[2].ref;
  faux.pieces.push({ id: 'roueG', nom: 'roue:M9', source: { kind: 'fichier', path: 'meshes/chassis.stl' }, pose: {} });
  await panneau().openProjectFromBytes(await P.packProject({ manifest, diagramJson: JSON.stringify(schema), system: faux,
    systemFiles: [{ path: 'meshes/chassis.stl', data: maillage }] }), { fsPath: 'W:/projet/roles.projix' });
  const msgRoles = globalThis.__avertis.join(' | ');
  check(/role not matching the component: aimant/.test(msgRoles) && /driving component not in the schematic: roueG/.test(msgRoles),
    'C : rôle incompatible et entraîneur absent dits à l’ouverture', msgRoles);
}

// Le routage du message « newProject » est privé : on vérifie au moins qu'il oublie le montage.
{
  const src = (await import('node:fs')).readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
  const bloc = src.slice(src.indexOf("case 'newProject':"), src.indexOf("case 'help':"));
  check(/systemeDuProjet = undefined/.test(bloc), 'C : « nouveau projet » oublie le montage de l’ancien');
}

console.log(`\nverify:systeme — ${ok} contrôles OK, ${fails.length} échec(s)`);
if (fails.length) process.exit(1);
