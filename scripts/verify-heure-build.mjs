// Sous le nom « Kablix » : la version publique, puis le NUMÉRO DE BUILD.
//
// LA DEMANDE. Frank, 19/09 : « ligne 1 "v2026.9.4", ligne 2 "build 105", c'est
// tout, pas d'heure, et ça reste dans les .vsix et à la publication. »
//
// CE QUI A CHANGÉ. Avant, la seconde ligne portait l'HEURE du `npm run build`,
// et l'hôte la cachait en production (`data-kx-dev` sur le `body`) : publiée,
// elle n'aurait dit à l'utilisateur que l'heure de fabrication du paquet. Le
// numéro de lot, lui, garde son sens partout — il identifie ce qui tourne dans
// un rapport de défaut. Le filtrage par mode a donc disparu, et avec lui
// l'attribut `data-kx-dev` et `versionAffichee()`.
//
// LES DEUX PIÈGES QUE CE BANC GARDE. D'abord l'heure, qui ne doit revenir dans
// aucun des deux modes. Ensuite la DOUBLE écriture du build : si la ligne 1
// repassait à `versionAffichee()`, la page afficherait « v2026.9.4.106 » puis
// « build 106 » — deux fois la même chose, alors que Frank a demandé la version
// nue en ligne 1.
//
// CE QU'ON MESURE. Pas la présence d'un `if` dans le source — un `if` peut être
// écrit à l'envers. On rend la VRAIE page dans Chrome, dans les DEUX modes, et
// on lit ce qui s'affiche.
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

// Une heure RECONNAISSABLE, qu'on cherchera dans la page : elle ne doit plus
// apparaître nulle part. Le banc l'injecte lui-même pour prouver que même
// fournie, elle n'est pas dessinée.
const HEURE = '03:14:15';

// --- Le vrai HTML de l'atelier, avec un faux module `vscode` ------------------
// `ExtensionMode` doit exister ici : c'est l'énumération que lit `version.ts`,
// et le banc rend les deux modes pour prouver qu'ils affichent la MÊME chose.
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
 * AVANT `buildWebviewHtml` : c'est l'ordre réel (`activate` le fait en premier).
 * Le mode ne doit plus rien changer à l'affichage — c'est justement ce qu'on
 * vérifie.
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

// --- Le paquet de la webview -------------------------------------------------
// `__BUILD_NUMBER__` est ce qu'injecte `esbuild.js` depuis le manifeste ; on lui
// donne ici le numéro fictif.
const pont = `
window.acquireVsCodeApi = () => ({
	postMessage: () => {}, getState: () => undefined, setState: () => {},
});
`;
const bundle = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview', 'sim.mts')],
	bundle: true, format: 'iife', write: false,
	define: { __BUILD_NUMBER__: JSON.stringify(String(BUILD)) },
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
	// `sim.mts` ait eu le temps de poser son élément.
	// `document.body.textContent` inclurait le texte de CE script, qui contient
	// l'heure cherchée : le contrôle serait rouge quoi qu'il arrive. On balaie
	// donc le texte VISIBLE, en sautant les balises `script` et `style`.
	page += `<script>window.addEventListener('load', () => setTimeout(() => {
		const e = document.querySelector('.brand__buildtime');
		const v = document.querySelector('.brand__version');
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
			version: v ? v.textContent : '',
			heureVisible: visible.indexOf(${JSON.stringify(HEURE)}) >= 0,
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

// --- L'hôte n'annonce plus de mode à la page ---------------------------------
// L'attribut `data-kx-dev` n'a plus de raison d'être : plus rien ne dépend du
// mode côté webview. S'il revenait, c'est qu'un filtrage par mode revient avec.
ok("l'hôte n'annonce plus le mode à la page (production)",
	!/<body[^>]*data-kx-dev/.test(htmlProd), 'attribut data-kx-dev présent en production');
ok("l'hôte n'annonce plus le mode à la page (développement)",
	!/<body[^>]*data-kx-dev/.test(htmlDev), 'attribut data-kx-dev présent en développement');

// --- Ligne 1 : la version PUBLIQUE NUE, dans les deux modes -------------------
// Le piège : un retour à `versionAffichee()` réécrirait « v2050.1.7.4242 » ici,
// et la page afficherait le build deux fois.
ok('production : ligne 1 = la version publique nue',
	htmlProd.includes(`class="brand__version">v${PUBLIQUE}<`)
	&& !htmlProd.includes(`${PUBLIQUE}.${BUILD}`),
	'ligne 1 incorrecte (4e segment collé à la version ?)');
ok('développement : ligne 1 = la version publique nue, elle aussi',
	htmlDev.includes(`class="brand__version">v${PUBLIQUE}<`)
	&& !htmlDev.includes(`${PUBLIQUE}.${BUILD}`),
	'ligne 1 incorrecte (4e segment collé à la version ?)');

if (!chrome) {
	console.log('Chrome introuvable — les mesures de page sont sautées.');
} else {
	const prod = rendre(htmlProd, 'prod.html');
	const dev = rendre(htmlDev, 'dev.html');
	ok('la page de production a fini son script', !!prod, 'aucune mesure rendue');
	ok('la page de développement a fini son script', !!dev, 'aucune mesure rendue');

	// LE contrôle de la demande : le build reste affiché une fois PUBLIÉ.
	ok('PUBLIÉE : la ligne « build » est affichée',
		prod && prod.present && prod.texte.trim() === `build ${BUILD}`,
		prod ? `élément ${prod.present ? 'présent' : 'absent'}, texte « ${prod.texte} »` : '');
	ok('DÉVELOPPEMENT : la ligne « build » est affichée à l\'identique',
		dev && dev.present && dev.texte.trim() === `build ${BUILD}`,
		dev ? `élément ${dev.present ? 'présent' : 'absent'}, texte « ${dev.texte} »` : '');

	// Ligne 1 telle que la page la rend, pas seulement telle que l'hôte l'écrit.
	ok('PUBLIÉE : ligne 1 rendue = v' + PUBLIQUE,
		prod && prod.version.trim() === `v${PUBLIQUE}`,
		prod ? `ligne 1 rendue « ${prod.version} »` : '');
	ok('DÉVELOPPEMENT : ligne 1 rendue = v' + PUBLIQUE,
		dev && dev.version.trim() === `v${PUBLIQUE}`,
		dev ? `ligne 1 rendue « ${dev.version} »` : '');

	// Plus d'heure nulle part : c'est ce qui a été retiré.
	ok("PUBLIÉE : aucune heure de construction dans la page",
		prod && !prod.heureVisible, 'une heure est affichée dans la page publiée');
	ok("DÉVELOPPEMENT : aucune heure de construction non plus",
		dev && !dev.heureVisible, 'une heure est affichée en développement');
}

const fails = checks.filter((c) => !c.ok).length;
console.log(fails
	? `heure-build : ${fails} échec(s).`
	: `heure-build : ${checks.length} contrôles OK — version publique puis numéro de build, partout.`);
process.exit(fails ? 1 : 0);
