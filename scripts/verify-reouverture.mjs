// Test de régression : ouvrir un .projix ne doit PAS laisser une feuille grise.
//
// Repro Frank (v2026.9.2.59) : « si j'ouvre mesure-pico.projix je me trouve avec
// une feuille grise dans tous les projets projix (le fichier s'affiche puis tout
// s'efface) ». Le fichier était sain — le schéma se charge parfaitement. La
// cause est une COURSE entre deux messages de l'extension :
//
//   1. `loadProject` part le premier (file d'attente vidée sur « ready ») : le
//      schéma s'affiche, c'est le « le fichier s'affiche » ;
//   2. `sendCustomParts()` attend la bibliothèque (`await library.whenReady()`),
//      donc son message `customParts` arrive APRÈS ;
//   3. le gestionnaire de `customParts` rejoue l'état persisté de la webview
//      (`vscode.getState()`), prévu pour un déplacement d'onglet — et cet état
//      appartient à un AUTRE document, voire est vide : « puis tout s'efface ».
//
// Le banc rejoue cette séquence exacte dans le vrai atelier, en Chrome headless,
// avec le vrai HTML de webview-html.ts et un faux pont VS Code dont `getState`
// rend un atelier vide (le cas de Frank).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-reouverture');
mkdirSync(CACHE, { recursive: true });

/** Extrait `diagram.json` d'un .projix (zip sans dépendance externe). */
function diagrammeDuProjix(fichier) {
	const b = readFileSync(fichier);
	let i = 0;
	while ((i = b.indexOf(Buffer.from('PK\x03\x04'), i)) >= 0) {
		const nlen = b.readUInt16LE(i + 26), elen = b.readUInt16LE(i + 28);
		const nom = b.slice(i + 30, i + 30 + nlen).toString();
		const csize = b.readUInt32LE(i + 18);
		const debut = i + 30 + nlen + elen;
		if (nom === 'diagram.json') return zlib.inflateRawSync(b.slice(debut, debut + csize)).toString();
		i += 4;
	}
	throw new Error('diagram.json introuvable dans ' + fichier);
}

const PROJIX = join(ROOT, 'testkablix', 'mesure-pico.projix');
const diagram = diagrammeDuProjix(PROJIX);
const nbParts = JSON.parse(diagram).parts.length;

// --- L'HTML réel de l'atelier, avec un faux module `vscode` -------------------
const fauxVscode = {
	name: 'faux-vscode',
	setup(build) {
		build.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'faux' }));
		build.onLoad({ filter: /.*/, namespace: 'faux' }, () => ({
			contents: [
				'export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_, i) => a[i]) };',
				'export const Uri = { joinPath: (...p) => p.join("/") };',
				'export const workspace = { getConfiguration: () => ({ get: () => undefined }) };',
				'export const env = { language: "fr" };',
				'export const extensions = { getExtension: () => ({ packageJSON: {} }) };',
			].join('\n'),
			loader: 'js',
		}));
	},
};
const htmlBundle = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview-html.ts')],
	bundle: true, format: 'esm', write: false, platform: 'node',
	external: ['node:crypto'], plugins: [fauxVscode], absWorkingDir: ROOT,
});
writeFileSync(join(CACHE, 'html.mjs'), htmlBundle.outputFiles[0].text);
const { buildWebviewHtml } = await import(
	'file:///' + join(CACHE, 'html.mjs').split(String.fromCharCode(92)).join('/'));
let html = buildWebviewHtml({ asWebviewUri: (u) => String(u), cspSource: 'file:' }, 'media');

// --- Le faux pont VS Code : il rend l'état persisté (un atelier VIDE) ---------
const pont = `
window.__err = [];
window.__msgs = [];
window.addEventListener('error', (e) => window.__err.push('ERR ' + e.message));
window.addEventListener('unhandledrejection', (e) => window.__err.push('REJ ' + ((e.reason && e.reason.message) || e.reason)));
const DIAG = ${diagram};
// L'état d'un AUTRE onglet, ou celui d'un atelier jamais rempli : c'est lui qui
// écrasait le projet fraîchement ouvert.
const ETAT = { diagram: { parts: [], wires: [] }, board: 'uno' };
window.acquireVsCodeApi = () => ({
	postMessage: (m) => window.__msgs.push(m && m.type),
	getState: () => ETAT,
	setState: () => {},
});
`;
const scenario = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (m) => window.dispatchEvent(new MessageEvent('message', { data: m }));
const compte = () => document.querySelectorAll('.part').length;
(async () => {
	const mesures = { err: window.__err.slice(0, 3).join(' ~~ ').slice(0, 300) };
	// On attend le « ready » de la webview : c'est lui qui déclenche, côté
	// extension, l'envoi de la file puis de sendCustomParts().
	for (let i = 0; i < 60 && !window.__msgs.includes('ready'); i++) await wait(100);
	mesures.pret = window.__msgs.includes('ready');
	mesures.avant = compte();
	// 1. Le projet arrive (file vidée sur « ready »).
	post({ type: 'loadProject', diagram: DIAG, board: 'pico', customParts: [] });
	await wait(1200);
	mesures.apresProjet = compte();
	// 2. sendCustomParts() a attendu la bibliothèque : son message arrive APRÈS.
	post({ type: 'customParts', parts: [] });
	await wait(1200);
	mesures.apresComposants = compte();
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(mesures);
	document.body.appendChild(out);
})();
`;

const b = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview', 'sim.mts')],
	bundle: true, format: 'iife', write: false,
	// `__BUILD_NUMBER__` est injecté par esbuild.js : sans lui le module lève une
	// ReferenceError au chargement et l'atelier reste inerte, sans rien afficher.
	define: { __BUILD_NUMBER__: JSON.stringify('test') },
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl', '.gif': 'dataurl', '.mp4': 'dataurl', '.ico': 'dataurl' },
	absWorkingDir: ROOT,
});
// Scripts en FICHIERS et non en ligne : un `</script>` caché dans une chaîne du
// bundle refermerait la balise.
writeFileSync(join(CACHE, 'pont.js'), pont);
writeFileSync(join(CACHE, 'bundle.js'), b.outputFiles[0].text);
writeFileSync(join(CACHE, 'scenario.js'), scenario);
html = html.replace(/<script[^>]*src="[^"]*webview\.js"[^>]*>[\s\S]*?<\/script>/,
	'<script src="pont.js"></scr' + 'ipt><script src="bundle.js"></scr' + 'ipt>'
	+ '<script src="scenario.js"></scr' + 'ipt>');
html = html.replace(/<link[^>]*styles\.css[^>]*>/,
	`<style>${readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8')}</style>`);
// La CSP de la webview exige un nonce par script : hors VS Code elle bloquerait
// tout. Elle ne fait pas partie de ce qu'on teste.
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
writeFileSync(join(CACHE, 'p.html'), html);

const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const url = 'file:///' + join(CACHE, 'p.html').split(String.fromCharCode(92)).join('/');
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
	'--virtual-time-budget=60000', '--dump-dom', url],
	{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
	.replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

const checks = [];
const ok = (nom, cond, detail = '') => checks.push({ nom, ok: !!cond, detail: String(detail) });
ok('l atelier démarre sans erreur et poste son « ready »', r.pret && !r.err, r.err || 'ready reçu');
ok('feuille vide avant le projet', r.avant === 0, r.avant + ' composant(s)');
ok('le projet s affiche : ses ' + nbParts + ' composants sont posés',
	r.apresProjet === nbParts, r.apresProjet + ' posé(s) sur ' + nbParts);
ok('et il RESTE affiché quand les composants perso arrivent après (la feuille grise)',
	r.apresComposants === nbParts,
	r.apresComposants + ' composant(s) après `customParts` — attendu ' + nbParts);

let fail = 0;
for (const c of checks) {
	if (!c.ok) fail++;
	console.log(`${c.ok ? '✅' : '❌'} ${c.nom}${!c.ok ? ` — ${c.detail}` : ''}`);
}
console.log(fail
	? `réouverture : ${fail} échec(s).`
	: `réouverture : ${checks.length} contrôles OK — un .projix ouvert reste affiché.`);
process.exit(fail ? 1 : 0);
