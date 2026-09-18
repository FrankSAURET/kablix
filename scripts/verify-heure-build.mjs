// L'heure de construction ne doit PAS apparaître dans une version publiée.
//
// LA DEMANDE. Frank, item 1.1 du 18/09 : « L'heure du build ne dois pas
// apparaitre dans une version publiée. »
//
// D'OÙ VIENT CETTE HEURE. `esbuild.js` fige l'heure du `npm run build` dans le
// paquet de la webview (`__BUILD_TIME__`), et `sim.mts` l'écrit sous le nom
// « Kablix » — un repère de test F5 pour savoir quel paquet on exécute. Elle
// partait donc telle quelle chez l'utilisateur, qui lisait l'heure à laquelle
// le .vsix a été fabriqué.
//
// POURQUOI LA WEBVIEW NE PEUT PAS TRANCHER SEULE. La construction qui produit
// `dist/webview.js` est la MÊME en développement et pour la publication : rien
// dans le paquet ne distingue les deux. Seul l'hôte le sait, par
// `vscode.ExtensionMode`. Il le dit donc à la page par `data-kx-dev` sur le
// `body`, et la webview ne dessine l'heure que si l'attribut est là.
//
// CE QU'ON MESURE. Pas la présence d'un `if` dans le source — un `if` peut être
// écrit à l'envers. On rend la VRAIE page dans Chrome, dans les DEUX modes, et
// on regarde si l'élément existe. Les deux sens comptent : absent en
// production (la demande), présent en développement (le repère de F5, qu'on ne
// veut pas perdre au passage).
//
// Usage : node scripts/verify-heure-build.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-heure-build');
mkdirSync(CACHE, { recursive: true });

const checks = [];
const ok = (nom, cond, detail = '') => {
	let val = cond;
	if (typeof cond === 'function') {
		try { val = cond(); }
		catch (e) { val = false; detail = `mesure impossible : ${e.message}`; }
	}
	checks.push({ nom, ok: !!val });
	console.log(`${val ? '✅' : '❌'} ${nom}${val ? '' : ` — ${detail}`}`);
};

// Version et numéro de build fictifs, jamais ceux du manifeste : le banc ne doit
// pas être à refaire au prochain bump.
const PUBLIQUE = '2050.1.7';
const BUILD = 4242;

// --- Le vrai HTML de l'atelier, avec un faux module `vscode` ------------------
// `ExtensionMode` doit exister ici : c'est l'énumération que lit `version.ts`
// pour savoir où tourne l'extension, et c'est tout l'objet du banc.
const fauxVscode = {
	name: 'faux-vscode',
	setup(build) {
		build.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'faux' }));
		build.onLoad({ filter: /.*/, namespace: 'faux' }, () => ({
			contents: [
				'export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_, i) => a[i]) };',
				'export const Uri = { joinPath: (...p) => p.join("/") };',
				'export const workspace = { getConfiguration: () => ({ get: (k, d) => d }) };',
				'export const env = { language: "en" };',
				'export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };',
				// Numéros INVENTÉS : le banc ne doit pas être à refaire au prochain
				// bump, et une valeur reconnaissable dit tout de suite laquelle des
				// deux on a trouvée dans la page.
				'export const extensions = { getExtension: () => ({ packageJSON: '
					+ JSON.stringify({ version: PUBLIQUE, buildNumber: BUILD }) + ' }) };',
			].join('\n'),
			loader: 'js',
		}));
	},
};

/**
 * Rend le HTML de l'atelier dans le mode demandé.
 *
 * On passe par un point d'entrée fabriqué qui appelle `memoriserModeExtension`
 * AVANT `buildWebviewHtml` : c'est l'ordre réel (`activate` le fait en premier),
 * et c'est ce qui décide de l'attribut.
 */
async function htmlDuMode(mode, nomFichier) {
	const entree = join(CACHE, `entree-${nomFichier}.ts`);
	writeFileSync(entree, [
		"import * as vscode from 'vscode';",
		"import { memoriserModeExtension } from '../../src/version';",
		"import { buildWebviewHtml } from '../../src/webview-html';",
		`memoriserModeExtension(vscode.ExtensionMode.${mode});`,
		'export const html = buildWebviewHtml(',
		'  { asWebviewUri: (u) => String(u), cspSource: "file:" }, "media");',
	].join('\n'));
	const paquet = await esbuild({
		entryPoints: [entree],
		bundle: true, format: 'esm', write: false, platform: 'node',
		external: ['node:crypto'], plugins: [fauxVscode], absWorkingDir: ROOT,
	});
	const sortie = join(CACHE, `html-${nomFichier}.mjs`);
	writeFileSync(sortie, paquet.outputFiles[0].text);
	const mod = await import('file:///' + sortie.split(String.fromCharCode(92)).join('/'));
	return mod.html;
}

// --- Le paquet de la webview, avec une heure RECONNAISSABLE -------------------
// Une heure quelconque ne prouverait rien : il faut pouvoir la chercher dans la
// page rendue et être certain que c'est bien celle-là qu'on a trouvée.
const HEURE = '03:14:15';
const pont = `
window.acquireVsCodeApi = () => ({
	postMessage: () => {}, getState: () => undefined, setState: () => {},
});
`;
const bundle = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview', 'sim.mts')],
	bundle: true, format: 'iife', write: false,
	define: { __BUILD_TIME__: JSON.stringify(HEURE) },
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl', '.gif': 'dataurl', '.mp4': 'dataurl', '.ico': 'dataurl' },
	absWorkingDir: ROOT,
});
writeFileSync(join(CACHE, 'pont.js'), pont);
writeFileSync(join(CACHE, 'bundle.js'), bundle.outputFiles[0].text);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);

/** Rend la page du mode demandé dans Chrome et rapporte ce qu'on y voit. */
function rendre(html, nomFichier) {
	let page = html
		.replace(/<script[^>]*src="[^"]*webview\.js"[^>]*>[\s\S]*?<\/script>/,
			'<script src="pont.js"></scr' + 'ipt><script src="bundle.js"></scr' + 'ipt>')
		.replace(/<link[^>]*styles\.css[^>]*>/,
			`<style>${readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8')}</style>`)
		// La CSP de la webview interdirait nos scripts locaux sans nonce.
		.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
	// Le rapport est écrit APRÈS le chargement complet du paquet, pour que
	// `sim.mts` ait eu le temps de poser (ou non) son élément.
	// `document.body.textContent` inclurait le texte de CE script, qui contient
	// l'heure cherchée : le contrôle serait rouge quoi qu'il arrive. On balaie
	// donc le texte VISIBLE, en sautant les balises `script` et `style`.
	page += `<script>window.addEventListener('load', () => setTimeout(() => {
		const e = document.querySelector('.brand__buildtime');
		const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
			acceptNode: (n) => /^(SCRIPT|STYLE)$/.test(n.parentNode && n.parentNode.nodeName)
				? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
		});
		let visible = '';
		for (let n = marche.nextNode(); n; n = marche.nextNode()) visible += n.nodeValue;
		const p = document.createElement('pre');
		p.id = 'mesures';
		p.textContent = JSON.stringify({
			present: !!e,
			texte: e ? e.textContent : '',
			attribut: document.body.hasAttribute('data-kx-dev'),
			corpsEntier: visible.indexOf(${JSON.stringify(HEURE)}) >= 0,
		});
		document.body.appendChild(p);
	}, 400));</scr` + 'ipt>';
	const f = join(CACHE, nomFichier);
	writeFileSync(f, page);
	const dom = execFileSync(chrome, [
		'--headless=new', '--disable-gpu', '--no-sandbox',
		'--virtual-time-budget=20000', '--dump-dom',
		`file:///${f.replace(/\\/g, '/')}`,
	], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const m = dom.match(/<pre id="mesures"[^>]*>([\s\S]*?)<\/pre>/);
	if (!m) return null;
	return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

const htmlProd = await htmlDuMode('Production', 'prod');
const htmlDev = await htmlDuMode('Development', 'dev');

// --- L'attribut, lu dans le HTML que produit l'hôte --------------------------
// Il nomme la cause : quand les mesures de page tombent, on sait tout de suite
// si c'est l'hôte qui n'a rien dit ou la webview qui n'a pas écouté.
ok("production : l'hôte n'annonce PAS le mode développement",
	!/<body[^>]*data-kx-dev/.test(htmlProd), 'attribut data-kx-dev présent dans le HTML de production');
ok("développement : l'hôte annonce le mode développement",
	/<body[^>]*data-kx-dev/.test(htmlDev), 'attribut data-kx-dev absent du HTML de développement');

if (!chrome) {
	console.log('Chrome introuvable — les mesures de page sont sautées.');
} else {
	const prod = rendre(htmlProd, 'prod.html');
	const dev = rendre(htmlDev, 'dev.html');
	ok('la page de production a fini son script', !!prod, 'aucune mesure rendue');
	ok('la page de développement a fini son script', !!dev, 'aucune mesure rendue');

	// LE contrôle de la demande de Frank.
	ok("PUBLIÉE : l'heure de construction n'est nulle part dans la page",
		prod && !prod.present && !prod.corpsEntier,
		prod ? `élément ${prod.present ? 'présent' : 'absent'}, texte « ${prod.texte} », heure dans le corps : ${prod.corpsEntier}` : '');

	// Le garde-fou : masquer l'heure PARTOUT satisferait le contrôle ci-dessus
	// et détruirait le repère de F5 que Frank utilise pour savoir quel paquet
	// tourne. Les deux contrôles ne peuvent pas être verts par accident ensemble.
	ok('DÉVELOPPEMENT : le repère de F5 est toujours affiché',
		dev && dev.present && dev.texte.includes(HEURE),
		dev ? `élément ${dev.present ? 'présent' : 'absent'}, texte « ${dev.texte} »` : '');

	// Et l'attribut arrive bien jusqu'à la page rendue (pas seulement dans la
	// chaîne de caractères du HTML).
	ok("production : la page rendue ne porte pas l'attribut", prod && !prod.attribut);
	ok("développement : la page rendue porte l'attribut", dev && dev.attribut);
}

// --- Le numéro de build interne, déjà filtré : on ne le casse pas -------------
// Même règle, même fichier : le 4e segment ne doit pas fuir non plus. Un banc
// qui ne regarde que l'heure laisserait passer une régression sur le numéro.
ok("production : le numéro de build interne ne fuit pas non plus",
	htmlProd.includes(`class="brand__version">v${PUBLIQUE}<`)
	&& !htmlProd.includes(`${PUBLIQUE}.${BUILD}`),
	'le 4e segment apparaît dans la version publiée');
ok('développement : le numéro de build interne est affiché',
	htmlDev.includes(`class="brand__version">v${PUBLIQUE}.${BUILD}<`));

const fails = checks.filter((c) => !c.ok).length;
console.log(fails
	? `heure-build : ${fails} échec(s).`
	: `heure-build : ${checks.length} contrôles OK — l'heure de construction reste au développement.`);
process.exit(fails ? 1 : 0);
