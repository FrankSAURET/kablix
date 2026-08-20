// L'aide d'un composant de bibliothèque, du paquet jusqu'au bouton.
//
// Un composant .kompix n'a pas de fiche dans `docs/` : la sienne voyage DANS son
// paquet (`help/<lang>.md` + ses images). Quatre étages, du bas vers le haut :
//   A. le PAQUET       — la fiche et ses illustrations y sont, et le Markdown ne
//                        référence rien qui manque ;
//   B. la BIBLIOTHÈQUE — la VRAIE classe `KompixLibrary` (bundlée avec un stub
//                        de l'API VS Code) relit la fiche du paquet, allume
//                        `hasHelp`, et ne la perd pas en réenregistrant ;
//   C. le RENDU        — le VRAI `renderMarkdown` de l'aide, images du paquet
//                        résolues en data: URI, liens vers une autre fiche ;
//   D. l'INSPECTEUR    — le VRAI éditeur dans Chrome : le bouton « Aide du
//                        composant » apparaît pour un composant qui a une fiche,
//                        pas pour un composant qui n'en a pas.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';
import { lireKompix, KOMPIX_DIR } from './_lire-kompix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-kompixhelp');

const rows = [];
const ok = (name, cond, detail = '') => rows.push({ name, ok: !!cond, detail: String(detail) });

/** Composants de la bibliothèque publique du dépôt. */
const TYPES = ['spot', 'dmx-grove'];

// ---------------------------------------------------------------- A. le paquet
for (const type of TYPES) {
	const zip = await JSZip.loadAsync(readFileSync(join(KOMPIX_DIR, `${type}.kompix`)));
	const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
	const noms = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

	const fiche = zip.file('help/fr.md');
	ok(`${type} : le paquet embarque help/fr.md`, !!fiche, noms.join(' '));
	if (!fiche) continue;
	const md = await fiche.async('string');

	ok(`${type} : le manifeste annonce sa fiche`,
		Array.isArray(manifest.help) && manifest.help.includes('fr'), JSON.stringify(manifest.help));
	ok(`${type} : la fiche a un titre`, /^#\s+\S/m.test(md), md.slice(0, 40));
	ok(`${type} : illustration help/${type}.webp`, !!zip.file(`help/${type}.webp`), noms.join(' '));

	// Chaque image citée par le Markdown doit exister dans le paquet : une fiche
	// embarquée n'a pas de dossier voisin où aller chercher ce qui manque.
	for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
		const rel = m[1];
		ok(`${type} : l'image « ${rel} » est dans le paquet`, !!zip.file(`help/${rel}`) || !!zip.file(rel), noms.join(' '));
	}
	// Un lien vers une autre fiche doit désigner un composant réel.
	for (const m of md.matchAll(/\[[^\]]+\]\(([^)\s]+\.md)\)/g)) {
		const cible = m[1].replace(/\.md$/, '');
		ok(`${type} : le lien « ${m[1]} » mène à une fiche connue`,
			TYPES.includes(cible) || existsSync(join(ROOT, 'docs', 'fr', 'composants', m[1])), cible);
	}
}

// Le lecteur node (copie de unpackKompix, utilisé par testkablix) voit l'aide.
const partSpot = await lireKompix('spot');
ok('lecteur node : hasHelp allumé sur un paquet avec fiche', partSpot.hasHelp === true, JSON.stringify(partSpot.hasHelp));

// --------------------------------------------------------- B. la bibliothèque
mkdirSync(CACHE, { recursive: true });
const LIB_DIR = join(CACHE, 'bibliotheque');
rmSync(LIB_DIR, { recursive: true, force: true });
mkdirSync(LIB_DIR, { recursive: true });
for (const type of TYPES) copyFileSync(join(KOMPIX_DIR, `${type}.kompix`), join(LIB_DIR, `${type}.kompix`));

// Un troisième paquet SANS aide, fabriqué ici : c'est le témoin négatif.
{
	const zip = new JSZip();
	zip.file('manifest.json', JSON.stringify({
		kompixVersion: 1, type: 'sans-aide', label: 'Sans aide', description: '', version: '1.0.0',
		author: 'test', kind: 'passive', pins: [{ name: 'A', x: 0, y: 10 }],
	}));
	zip.file('schema.svg',
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><g id="sans-aide"><rect width="20" height="20"/></g></svg>');
	writeFileSync(join(LIB_DIR, 'sans-aide.kompix'), await zip.generateAsync({ type: 'nodebuffer' }));
}

// La VRAIE classe de l'extension, bundlée avec un stub de l'API VS Code : c'est
// son code à elle qu'on veut éprouver, pas une redite dans le banc.
writeFileSync(join(CACHE, 'vscode-stub.mjs'), [
	'export const workspace = {',
	'	getConfiguration: () => ({ get: (_k, d) => d }),',
	'	createFileSystemWatcher: () => ({ onDidCreate() {}, onDidChange() {}, onDidDelete() {}, dispose() {} }),',
	'	workspaceFolders: undefined,',
	'};',
	'export const Uri = { file: (p) => ({ fsPath: p }) };',
	'export class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } }',
	'export class Disposable { constructor(fn) { this.fn = fn; } dispose() { this.fn?.(); } }',
	'export const env = { language: "fr" };',
	'export const window = { showInformationMessage() {} };',
].join('\n'));
writeFileSync(join(CACHE, 'lib-entry.mjs'), "export { KompixLibrary } from '../../src/kompixLibrary.ts';\n");
const libBundle = await esbuild({
	entryPoints: [join(CACHE, 'lib-entry.mjs')],
	bundle: true, format: 'esm', platform: 'node', write: false, absWorkingDir: ROOT,
	external: ['jszip'],
	alias: { vscode: join(CACHE, 'vscode-stub.mjs') },
});
const libFile = join(CACHE, 'lib.mjs');
writeFileSync(libFile, libBundle.outputFiles[0].text);
const { KompixLibrary } = await import(`file:///${libFile.replace(/\\/g, '/')}?t=${Date.now()}`);

const library = new KompixLibrary({ globalStorageUri: { fsPath: CACHE } });
// Le dossier de bibliothèque est celui qu'on vient de garnir.
library.libraryFolder = LIB_DIR;
library.indexPath = join(LIB_DIR, '.kompix-index.json');
await library.start();

const composants = new Map(library.getComponents().map((c) => [c.type, c]));
ok('bibliothèque : les trois paquets sont lus', composants.size === 3, [...composants.keys()].join(' '));
ok('bibliothèque : hasHelp allumé sur « spot »', composants.get('spot')?.hasHelp === true,
	JSON.stringify(composants.get('spot')?.hasHelp));
ok('bibliothèque : hasHelp éteint sur un paquet sans fiche', !composants.get('sans-aide')?.hasHelp,
	JSON.stringify(composants.get('sans-aide')?.hasHelp));
ok('bibliothèque : langues annoncées pour « spot »', library.helpLanguages('spot').join(',') === 'fr',
	library.helpLanguages('spot').join(','));
ok('bibliothèque : aucune langue pour un paquet sans fiche', library.helpLanguages('sans-aide').length === 0,
	library.helpLanguages('sans-aide').join(','));

const aide = await library.readHelp('spot', 'fr');
ok('lecture : la fiche FR sort du paquet', !!aide && /^#\s+\S/m.test(aide.text), aide?.text?.slice(0, 40));
ok('lecture : la langue rendue est celle demandée', aide?.lang === 'fr', aide?.lang);
ok('lecture : les illustrations sortent en data: URI',
	[...(aide?.assets?.values() ?? [])].length > 0 && [...(aide?.assets?.values() ?? [])].every((v) => v.startsWith('data:image/')),
	[...(aide?.assets?.keys() ?? [])].join(' '));
ok("lecture : l'image est atteignable par son nom RELATIF (comme dans le Markdown)",
	!!aide?.assets?.get('spot.webp')?.startsWith('data:image/webp'), [...(aide?.assets?.keys() ?? [])].join(' '));
// Langue absente : repli sur la première disponible plutôt que rien du tout —
// la version anglaise arrive avec le lot de traduction d'avant publication.
const aideEn = await library.readHelp('spot', 'en');
ok('lecture : langue absente → repli sur la fiche existante', aideEn?.lang === 'fr', aideEn?.lang);
ok("lecture : rien à ouvrir pour un paquet sans fiche", (await library.readHelp('sans-aide', 'fr')) === undefined);
ok("lecture : rien à ouvrir pour un composant inconnu", (await library.readHelp('inexistant', 'fr')) === undefined);

// Réenregistrer le composant ne doit pas effacer sa fiche : elle ne voyage pas
// dans CustomPartData (seul `hasHelp` en vient), une recopie naïve la perdrait.
const buf = await library.createKompixBufferFromPartData(composants.get('spot'), '1.1.0');
const relu = await JSZip.loadAsync(buf);
ok('export : la fiche est recopiée dans le paquet reconstruit', !!relu.file('help/fr.md'), Object.keys(relu.files).join(' '));
ok('export : les illustrations suivent', !!relu.file('help/spot.webp'), Object.keys(relu.files).join(' '));
ok('export : le manifeste reconstruit annonce la fiche',
	JSON.parse(await relu.file('manifest.json').async('string')).help?.includes('fr'));
const sansAideRelu = await JSZip.loadAsync(await library.createKompixBufferFromPartData(composants.get('sans-aide'), '1.0.0'));
ok("export : rien d'inventé quand il n'y a pas de fiche",
	!Object.keys(sansAideRelu.files).some((n) => n.startsWith('help/')), Object.keys(sansAideRelu.files).join(' '));

// ------------------------------------------------------------------ C. le rendu
writeFileSync(join(CACHE, 'md-entry.mjs'), "export { renderMarkdown, markdownTitle } from '../../src/markdown.ts';\n");
const mdBundle = await esbuild({
	entryPoints: [join(CACHE, 'md-entry.mjs')],
	bundle: true, format: 'esm', platform: 'node', write: false, absWorkingDir: ROOT,
});
const mdFile = join(CACHE, 'md.mjs');
writeFileSync(mdFile, mdBundle.outputFiles[0].text);
const { renderMarkdown, markdownTitle } = await import(`file:///${mdFile.replace(/\\/g, '/')}?t=${Date.now()}`);

const liens = [];
const html = renderMarkdown(aide.text, {
	// Exactement ce que fait partHelp.ts pour une fiche embarquée.
	resolveAsset: (rel) => aide.assets.get(rel.replace(/^\.\//, '')) ?? '',
	resolveDocLink: (rel) => {
		liens.push(rel);
		return `command:kablix.showPartHelp?${encodeURIComponent(JSON.stringify([rel.replace(/\.md$/, '')]))}`;
	},
});
ok('rendu : le titre de la fiche est trouvé', markdownTitle(aide.text) === 'Projecteur PAR 38 DMX', markdownTitle(aide.text));
const imgs = [...html.matchAll(/<img[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
ok('rendu : au moins une illustration', imgs.length > 0);
ok('rendu : toutes les images sont des data: URI (aucune source vide)',
	imgs.length > 0 && imgs.every((s) => s.startsWith('data:image/')), imgs.map((s) => s.slice(0, 24)).join(' | '));
ok("rendu : le lien vers l'autre fiche devient une commande",
	html.includes('command:kablix.showPartHelp') && liens.includes('dmx-grove.md'), liens.join(' '));
ok('rendu : les tableaux de la fiche sortent en HTML', html.includes('<table>'));

// ------------------------------------------------------------ D. l'inspecteur
const partsPourEditeur = [
	{ ...composants.get('spot'), kompixMeta: { origin: 'remote' } },
	{ ...composants.get('sans-aide'), kompixMeta: { origin: 'remote' } },
];
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
const PARTS = ${JSON.stringify(partsPourEditeur)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const editor = new Editor(document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
	editor.loadCustomParts(PARTS);
	await wait(120);

	const demandes = [];
	editor.onComponentHelp = (type) => demandes.push(type);
	const bouton = () => document.querySelector('#inspector .inspector__doc');

	for (const p of PARTS) {
		const attendu = p.type === 'spot';
		const id = editor.addPart(p.type, 100, 100);
		editor.select(id);
		await wait(60);
		const b = bouton();
		ok('inspecteur : le bouton d\\'aide est ' + (attendu ? 'là' : 'absent') + ' pour « ' + p.type + ' »', !!b === attendu,
			(document.getElementById('inspector').textContent || '').slice(0, 140));
		if (b && attendu) {
			b.click();
			await wait(20);
			ok('inspecteur : le bouton demande l\\'aide du bon composant',
				demandes[demandes.length - 1] === p.type, demandes.join(' '));
		}
		editor.removePart(id);
		await wait(20);
	}

	// Contre-épreuve : le même composant SANS hasHelp perd son bouton — c'est
	// la fiche embarquée qui commande, pas le simple fait d'être un composant
	// de bibliothèque.
	const sansDrapeau = { ...PARTS[0], type: 'spot-nu', label: 'Spot sans fiche' };
	delete sansDrapeau.hasHelp;
	editor.loadCustomParts([sansDrapeau]);
	await wait(80);
	editor.select(editor.addPart('spot-nu', 200, 200));
	await wait(60);
	ok('inspecteur : sans fiche embarquée, pas de bouton', !bouton(),
		(document.getElementById('inspector').textContent || '').slice(0, 140));

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
	document.body.appendChild(out);
});
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, absWorkingDir: ROOT,
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' },
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1200px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
	ok('inspecteur : Chrome introuvable — étage sauté', true);
} else {
	const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=40000', '--dump-dom',
		`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
	if (!m) {
		ok('inspecteur : mesures introuvables', false, dom.slice(0, 300));
	} else {
		const dec = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
		for (const r of JSON.parse(dec)) rows.push(r);
	}
}

let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail
	? `aide des composants : ${fail} échec(s).`
	: `aide des composants : ${rows.length} contrôles OK — la fiche voyage dans le paquet et son bouton s'affiche.`);
process.exit(fail ? 1 : 0);
