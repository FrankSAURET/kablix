// Repro Frank (v2026.8.91) : « j'enregistre sous, dans un autre dossier, le
// projet dmx-uno — les composants venus de la bibliothèque disparaissent : on
// ne les voit plus, mais leurs connexions restent ».
//
// Le dessin d'un composant de bibliothèque est GRAVÉ dans le .projix. Celui des
// projets enregistrés avant v2026.8.89 n'a que sa `viewBox` : un `<svg>` sans
// `width`/`height` s'étale à la taille de son parent — ici un `inline-block` en
// `line-height: 0`, donc 0 × 0. Le composant est chargé, posé et câblé (ses
// fils, eux, se voient) mais invisible.
//
// Trois étages, du plus fin au bout en bout :
//   A. `withSvgSize` (catalog.mts) : la réparation du dessin elle-même ;
//   B. `buildProjixBytes` (panel.ts) : ce qu'un enregistrement grave vraiment ;
//   C. le VRAI éditeur dans Chrome : le schéma d'un .projix dégradé, chargé
//      comme le fait `loadProject`, puis la bibliothèque qui arrive APRÈS.
import esbuild, { build as esbuildBuild } from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { lireKompix } from './_lire-kompix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-projixparts');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-projixparts-'));

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

/** Retire width/height du <svg> racine : l'état d'un projet enregistré avant v2026.8.89. */
const degrade = (svg) =>
  svg.replace(/<svg\b[^>]*>/i, (tag) =>
    tag.replace(/\s+width=["'][^"']*["']/i, '').replace(/\s+height=["'][^"']*["']/i, '')
  );

// ------------------------------------------------- B. ce que grave un « enregistrer sous »
// Faux `vscode` : seul ce dont panel.ts a besoin pour construire l'archive.
const STUB = `
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (b, ...r) => uri([b.fsPath, ...r].join('/')) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const window = {
  showSaveDialog: async () => undefined, showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined),
  setStatusBarMessage: () => ({ dispose() {} }), createWebviewPanel: () => { throw new Error('non utilisé'); },
  activeTextEditor: undefined, tabGroups: { all: [], close: async () => {} },
  onDidChangeActiveTextEditor: () => ({ dispose() {} }), registerCustomEditorProvider: () => ({ dispose() {} }),
  visibleTextEditors: [],
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/projet') }],
  fs: { writeFile: async () => {}, readFile: async () => new Uint8Array(),
    // Étage D : la liste des fichiers qui EXISTENT vraiment, posée par le banc.
    stat: async (u) => {
      const liste = globalThis.__fichiers;
      if (liste && !liste.has(String(u.fsPath))) throw new Error('ENOENT');
      return { type: 1 };
    },
    delete: async () => {} },
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
export default { Uri, ViewColumn, l10n, window, workspace, commands, env, extensions };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
const panelOut = join(tmp, 'panel.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src/panel.ts')],
  outfile: panelOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { SimulatorPanel } = await import(pathToFileURL(panelOut).href);

const dmxGrove = await lireKompix('dmx-grove');
const spot = await lireKompix('spot');

/** Grave un .projix comme le fait « enregistrer (sous) », et rend son contenu. */
const graveAvec = async ({ library, globalParts }) => {
  SimulatorPanel.library = library;
  const p = Object.create(SimulatorPanel.prototype);
  p.context = { globalState: { get: (_k, d) => globalParts ?? d, update: async () => {} } };
  p.currentBoard = 'uno';
  p.codeFileRef = () => undefined;
  p.codeFileUri = undefined;
  p.effectiveDebugVars = () => ({});
  const bytes = await p.buildProjixBytes({ parts: [], wires: [] }, 'uno');
  const zip = await JSZip.loadAsync(bytes);
  return JSON.parse(await zip.file('diagram.json').async('string'));
};

// La bibliothèque installée est la source de vérité : c'est elle qui porte la
// version À JOUR du dessin (width/height posés depuis v2026.8.89).
const depuisLib = await graveAvec({
  library: { getComponents: () => [dmxGrove, { ...spot, behaviorScript: 'export function tick() {}' }] },
  globalParts: [{ type: 'perime', label: 'Périmé', kind: 'passive', pins: [], svg: degrade(dmxGrove.svg) }],
});
check(depuisLib.customParts?.length === 2, 'projix : les composants viennent de la BIBLIOTHÈQUE, pas de l’état global',
  `types gravés : ${(depuisLib.customParts ?? []).map((p) => p.type).join(', ') || 'aucun'}`);
check(!(depuisLib.customParts ?? []).some((p) => p.type === 'perime'), 'projix : l’état global périmé ne s’invite plus');
for (const part of depuisLib.customParts ?? []) {
  check(/<svg\b[^>]*\bwidth=/i.test(part.svg) && /<svg\b[^>]*\bheight=/i.test(part.svg),
    `projix : le dessin gravé de « ${part.type} » porte ses dimensions`);
  check(part.behaviorScript === undefined,
    `projix : le script de comportement de « ${part.type} » ne voyage pas dans le projet`);
}

// Sans bibliothèque (hôte réduit) : l'ancien état global reste le repli.
const sansLib = await graveAvec({ library: undefined, globalParts: [{ type: 'perso', svg: '<svg/>' }] });
check(sansLib.customParts?.[0]?.type === 'perso', 'projix : repli sur l’état global quand la bibliothèque manque');

// ------------------------------------------------- D. quel programme un « enregistrer sous » exécute
// Second volet du même « enregistrer sous » (Frank, v2026.8.91) : le manifeste
// garde la référence du programme de l'ancien projet. Le fichier relatif n'existe
// plus dans le nouveau dossier, mais le chemin ABSOLU mémorisé, lui, existe
// toujours — l'atelier compilait donc l'ancien sketch, sans erreur et sans effet.
const resoudre = async ({ ref, dossier, abs, nom, fichiers }) => {
  globalThis.__fichiers = new Set(fichiers);
  const p = Object.create(SimulatorPanel.prototype);
  let choisi;
  p.setCodeFile = (u) => { choisi = u ? u.fsPath : undefined; };
  p.post = () => {};
  await p.restoreCodeFile(ref, dossier ? { fsPath: dossier } : undefined, abs, nom);
  globalThis.__fichiers = undefined;
  return choisi;
};

const ANCIEN = 'H:/tests/dmx-uno/dmx-uno.ino';
check(
  (await resoudre({
    ref: 'Arduino/dmx-uno/dmx-uno.ino', dossier: 'W:/nouveau', abs: ANCIEN, nom: 'dmx-uno-lib',
    fichiers: [ANCIEN, 'W:/nouveau/dmx-uno-lib.ino'],
  })) === 'W:/nouveau/dmx-uno-lib.ino',
  'code : « enregistré sous » prend le sketch HOMONYME du projet, pas celui d’origine'
);
check(
  (await resoudre({
    ref: 'Arduino/dmx-uno/dmx-uno.ino', dossier: 'W:/nouveau', abs: ANCIEN, nom: 'dmx-uno-lib',
    fichiers: [ANCIEN],
  })) === ANCIEN,
  'code : sans homonyme, le chemin absolu mémorisé reste le repli'
);
check(
  (await resoudre({
    ref: 'autre.ino', dossier: 'W:/nouveau', abs: ANCIEN, nom: 'projet',
    fichiers: ['W:/nouveau/autre.ino', 'W:/nouveau/projet.ino', ANCIEN],
  })) === 'W:/nouveau/autre.ino',
  'code : une référence qui résout à côté du projet garde la priorité'
);
check(
  (await resoudre({
    ref: 'vieux.py', dossier: 'W:/nouveau', abs: 'H:/vieux/vieux.py', nom: 'blink-pico',
    fichiers: ['H:/vieux/vieux.py', 'W:/nouveau/blink-pico.py'],
  })) === 'W:/nouveau/blink-pico.py',
  'code : même règle pour un programme MicroPython (.py)'
);

// ------------------------------------------------- C. le schéma d'un vrai .projix dans Chrome
const projixPath = join(ROOT, 'testkablix', 'Arduino', 'dmx-uno', 'dmx-uno.projix');
if (!existsSync(projixPath)) {
  console.log(`projix-parts : ${projixPath} introuvable — étage C sauté.`);
} else {
  const zip = await JSZip.loadAsync(readFileSync(projixPath));
  const diagram = JSON.parse(await zip.file('diagram.json').async('string'));
  // Le cas de Frank : le projet embarque des dessins SANS dimensions.
  const embarques = (diagram.customParts ?? []).map((p) => ({ ...p, svg: degrade(p.svg) }));
  check(embarques.length >= 2, 'projix de test : au moins deux composants de bibliothèque embarqués');
  // Ce que la bibliothèque enverra ENSUITE : la version à jour, reconnaissable.
  const marque = (svg) => svg.replace(/<svg\b/i, '<svg data-source="library"');
  const aJour = [
    { ...dmxGrove, svg: marque(dmxGrove.svg) },
    { ...spot, svg: marque(spot.svg) },
  ];

  const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { withSvgSize } from '../../src/webview/diagram/catalog.mjs';
const DIAGRAM = ${JSON.stringify({ parts: diagram.parts ?? [], wires: diagram.wires ?? [], camera: diagram.camera })};
const EMBARQUES = ${JSON.stringify(embarques)};
const A_JOUR = ${JSON.stringify(aJour)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

// --- A. la réparation du dessin, en unitaire --------------------------------
const tag = (svg) => (/<svg\\b[^>]*>/i.exec(svg) ?? [''])[0];
const sansDim = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20"/></svg>';
ok('withSvgSize : un dessin sans dimensions en reçoit', /width="40"/.test(tag(withSvgSize(sansDim))) && /height="20"/.test(tag(withSvgSize(sansDim))), tag(withSvgSize(sansDim)));
const enPx = '<svg width="200" height="100" viewBox="0 0 40 20"></svg>';
ok('withSvgSize : des dimensions en pixels sont laissées telles quelles', withSvgSize(enPx) === enPx, tag(withSvgSize(enPx)));
const enMm = '<svg width="105mm" height="52.5mm" viewBox="0 0 40 20"></svg>';
ok('withSvgSize : les millimètres d’Inkscape sont remplacés par la viewBox', /width="40"/.test(tag(withSvgSize(enMm))), tag(withSvgSize(enMm)));
const uneSeule = '<svg width="80" viewBox="0 0 40 20"></svg>';
ok('withSvgSize : la dimension manquante suit le rapport de la viewBox', /height="40"/.test(tag(withSvgSize(uneSeule))), tag(withSvgSize(uneSeule)));
const sansVb = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
ok('withSvgSize : sans viewBox, rien n’est inventé', withSvgSize(sansVb) === sansVb, withSvgSize(sansVb));

// --- C. le schéma complet ---------------------------------------------------
async function run() {
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	await wait(30);

	// Ordre RÉEL d'un .projix ouvert : composants embarqués, puis le schéma.
	editor.loadCustomParts(EMBARQUES);
	editor.loadDiagram(DIAGRAM);
	editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
	await wait(200);

	const dessinDe = (racine) => racine?.querySelector('kablix-custom-part')?.shadowRoot?.querySelector('svg') ?? null;
	const conteneurDe = (id) => [...document.querySelectorAll('.part')]
		.find((c) => (c.querySelector('.part__id')?.textContent ?? '') === id) ?? null;
	const poses = DIAGRAM.parts.filter((p) => EMBARQUES.some((c) => c.type === p.type));
	ok('schéma : les composants de bibliothèque du .projix y sont', poses.length >= 2, poses.length + ' posé(s)');

	for (const part of poses) {
		const cont = conteneurDe(part.id);
		const svg = dessinDe(cont);
		const box = svg?.getBoundingClientRect();
		ok('schéma : « ' + part.type + ' » est dessiné', !!svg, cont ? 'pas de <svg>' : 'conteneur absent');
		ok('schéma : « ' + part.type + ' » a une taille non nulle', !!box && box.width > 8 && box.height > 8,
			box ? Math.round(box.width) + '×' + Math.round(box.height) : 'pas de boîte');
		const attendu = EMBARQUES.find((c) => c.type === part.type)?.pins.length ?? 0;
		const pins = cont ? cont.querySelectorAll('.pin').length : 0;
		ok('schéma : « ' + part.type + ' » montre ses ' + attendu + ' pattes', pins === attendu, pins + ' patte(s)');
	}

	// Les fils du projet doivent être tracés (le symptôme de Frank : eux seuls
	// restaient visibles).
	const traces = [...document.querySelectorAll('#wires path, #wires polyline, #wires line')].length;
	ok('schéma : les ' + DIAGRAM.wires.length + ' fils du projet sont tracés', traces >= DIAGRAM.wires.length, traces + ' tracé(s)');

	// La bibliothèque arrive APRÈS (whenReady) : les instances déjà posées
	// doivent adopter sa version, pas garder celle du fichier.
	editor.loadCustomParts(A_JOUR);
	await wait(200);
	for (const part of poses) {
		const cont = conteneurDe(part.id);
		const svg = dessinDe(cont);
		const box = svg?.getBoundingClientRect();
		ok('bibliothèque tardive : « ' + part.type + ' » adopte le dessin installé',
			svg?.getAttribute('data-source') === 'library', svg ? 'data-source=' + svg.getAttribute('data-source') : 'pas de <svg>');
		ok('bibliothèque tardive : « ' + part.type + ' » garde une taille non nulle',
			!!box && box.width > 8 && box.height > 8, box ? Math.round(box.width) + '×' + Math.round(box.height) : 'pas de boîte');
	}
	const apres = [...document.querySelectorAll('#wires path, #wires polyline, #wires line')].length;
	ok('bibliothèque tardive : les fils sont toujours là', apres >= DIAGRAM.wires.length, apres + ' tracé(s)');

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([...checks, { name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
	document.body.appendChild(out);
});
`;
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, 'e.mjs'), entry);
  const b = await esbuildBuild({
    entryPoints: [join(CACHE, 'e.mjs')],
    bundle: true,
    format: 'iife',
    write: false,
    loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' },
    absWorkingDir: ROOT,
  });
  const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
  writeFileSync(
    join(CACHE, 'p.html'),
    `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
      `<div class="workshop"><aside id="palette" class="palette"></aside>` +
      `<div id="canvas" class="canvas" style="width:1400px;height:1000px"><svg id="wires" class="wires"></svg></div>` +
      `<aside id="inspector" class="inspector"></aside></div>` +
      `<script>${b.outputFiles[0].text}</script></body>`
  );
  const chrome = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
  if (!chrome) {
    console.log('Chrome introuvable — étage C sauté.');
  } else {
    const dom = execFileSync(
      chrome,
      ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=40000', '--dump-dom',
        `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
    if (!m) {
      check(false, 'mesures du navigateur illisibles');
    } else {
      const rows = JSON.parse(
        m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      );
      for (const r of rows) check(r.ok, r.name, r.detail);
    }
  }
}

if (fails.length) {
  console.log(`\nprojix-parts : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\nprojix-parts : ${ok} contrôles OK — un projet rouvert (ou « enregistré sous ») montre ses composants de bibliothèque.`);
