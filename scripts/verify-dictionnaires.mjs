// Banc : les dictionnaires de traduction hors des bundles de page (v2026.9.7.176).
//
// LA DEMANDE (Frank, 29/09) : réduire le coût d'une langue ajoutée. Chaque
// dictionnaire (40 à 50 Ko) était inclus dans webview.js ET dans analyseur.js :
// chargé et analysé à chaque ouverture, quelle que soit la langue de VS Code.
// Le chinois pesait en plus 20 % de trop, esbuild écrivant chaque caractère en
// `\uXXXX`.
//
// Désormais un fichier par langue, dist/i18n-<langue>.js, posé par la page juste
// avant son script, et seulement celui de la langue active.
//
// Il contrôle, sur les VRAIS fichiers de dist/ (`npm run build` avant) :
//   A. les bundles de page ne contiennent plus aucun dictionnaire ; chaque
//      dictionnaire est dans son fichier, le chinois en UTF-8 et non en \uXXXX ;
//   B. la balise posée par la page suit la langue de VS Code (zh-cn, zh-tw → zh ;
//      anglais et langue inconnue : aucune) ;
//   C. la VRAIE page de l'analyseur (Chrome headless, vrais fichiers) parle la
//      langue de VS Code et ne charge QUE son dictionnaire.
//
// Contre-épreuve : `git stash`, `npm run build`, relancer — A et C échouent.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-dicts-'));
const PORT = 9438;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const echecs = [];
const check = (cond, titre, detail = '') => {
	if (cond) { ok++; console.log(`  ✓ ${titre}`); return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};
const dist = (f) => join(ROOT, 'dist', f);
const lire = (f) => (existsSync(dist(f)) ? readFileSync(dist(f), 'utf8') : '');

// Une chaîne témoin par langue, peinte par la page de l'analyseur sans sonde.
const SOURCE = 'No logic probe on the board — clip one onto a pin.';
const TEMOINS = {
	fr: 'Aucune sonde logique sur le montage — accrochez-en une sur une broche.',
	es: 'Ninguna sonda lógica en el montaje — engánchela a un pin.',
	zh: '电路上没有逻辑探头 — 请把一个探头夹到引脚上。',
};

// --- A. Les fichiers -----------------------------------------------------------
console.log('A. Fichiers de dist/');
const pages = { 'webview.js': lire('webview.js'), 'analyseur.js': lire('analyseur.js') };
check(Object.values(pages).every((t) => t.length > 0), 'les deux bundles de page sont construits (npm run build)');
for (const [nom, texte] of Object.entries(pages)) {
	const dedans = Object.entries(TEMOINS).filter(([, v]) => texte.includes(v)).map(([l]) => l);
	check(dedans.length === 0 && texte.includes('KABLIX_DICTS'), `${nom} : aucun dictionnaire dedans, il lit KABLIX_DICTS`,
		dedans.length ? `contient encore ${dedans.join(', ')}` : 'KABLIX_DICTS absent');
}
for (const [l, v] of Object.entries(TEMOINS)) {
	const t = lire(`i18n-${l}.js`);
	check(t.includes(v), `i18n-${l}.js porte le dictionnaire ${l}`, `${t.length} octets`);
}
const zh = lire('i18n-zh.js');
check(zh.length > 0 && !/\\u[4-9][0-9a-f]{3}/i.test(zh), 'i18n-zh.js écrit le chinois en UTF-8, pas en \\uXXXX');

// --- B. La balise de la page ------------------------------------------------------
console.log('B. Balise posée par la page');
const STUB = `
export const Uri = { joinPath: (b, ...p) => ({ fsPath: [b.fsPath, ...p].join('/'), toString() { return this.fsPath; } }) };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const env = { get language() { return globalThis.__langue ?? 'en'; } };
export const window = {}; export const ViewColumn = {};
export default { Uri, l10n, env, window, ViewColumn };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
const construire = async (entree, sortie) => {
	await esbuild.build({ entryPoints: [join(ROOT, entree)], outfile: join(tmp, sortie), bundle: true, platform: 'node',
		format: 'esm', logLevel: 'silent', alias: { vscode: join(tmp, 'vscode-stub.mjs') } });
	return import(pathToFileURL(join(tmp, sortie)).href);
};
const { scriptDictionnaire } = await construire('src/dictionnaire.ts', 'dictionnaire.mjs');
const webview = { asWebviewUri: (u) => u };
const racine = { fsPath: ROOT.replace(/\/$/, '') };
const attendu = { fr: 'fr', 'fr-FR': 'fr', es: 'es', 'zh-cn': 'zh', 'zh-tw': 'zh', en: null, de: null };
for (const [langue, l] of Object.entries(attendu)) {
	globalThis.__langue = langue;
	const b = scriptDictionnaire(webview, racine, 'N');
	check(l ? b.includes(`dist/i18n-${l}.js`) && b.includes('nonce="N"') : b === '',
		`VS Code en « ${langue} » : ${l ? `dist/i18n-${l}.js` : 'aucun dictionnaire'}`, b);
}

// --- C. La vraie page de l'analyseur ----------------------------------------------
console.log('C. Page de l’analyseur, vrais fichiers');
const { AnalyseurPanel } = await construire('src/analyseur-panel.ts', 'analyseur-panel.mjs');
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].find((c) => c && existsSync(c));
if (!chrome) {
	check(false, 'Chrome introuvable — la page n’a pas pu être jouée');
} else {
	const ESPION = `window.__peint = [];
const P = CanvasRenderingContext2D.prototype, f = P.fillText;
P.fillText = function (t, ...a) { window.__peint.push(String(t)); return f.call(this, t, ...a); };
window.acquireVsCodeApi = () => ({ postMessage() {}, setState() {}, getState() {} });`;
	const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
		`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1000,400', 'about:blank'], { stdio: 'ignore' });
	let ws;
	try {
		let liste = null;
		for (let i = 0; i < 120 && !liste; i++) {
			try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await attendre(250); }
		}
		ws = new WebSocket(liste.find((c) => c.type === 'page').webSocketDebuggerUrl);
		let id = 0;
		const attentes = new Map();
		ws.addEventListener('message', (e) => {
			const m = JSON.parse(e.data);
			if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
		});
		await new Promise((r) => ws.addEventListener('open', r, { once: true }));
		const cdp = (method, params = {}) => new Promise((res) => { const n = ++id; attentes.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
		const ev = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
		const webviewFichier = { asWebviewUri: (u) => pathToFileURL(u.fsPath).href, cspSource: 'file:' };
		for (const langue of ['fr', 'es', 'zh-cn', 'en']) {
			globalThis.__langue = langue;
			const l = langue.slice(0, 2);
			let html = AnalyseurPanel.html(webviewFichier, racine, 'W:/p/x.projix');
			const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
			html = html.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`);
			const page = join(tmp, `page-${langue}.html`);
			writeFileSync(page, html);
			await cdp('Page.navigate', { url: pathToFileURL(page).href });
			let peint = [];
			for (let i = 0; i < 40; i++) {
				await attendre(100);
				peint = (await ev('window.__peint')) ?? [];
				if (peint.length) break;
			}
			const charges = (await ev('Object.keys(window.KABLIX_DICTS ?? {}).join(",")')) ?? '';
			const voulu = TEMOINS[l] ?? SOURCE;
			check(peint.includes(voulu) && charges === (TEMOINS[l] ? l : ''),
				`VS Code en « ${langue} » : la page peint « ${voulu.slice(0, 28)}… », dictionnaire(s) chargé(s) : ${charges || 'aucun'}`,
				`peint ${JSON.stringify(peint.slice(0, 3))}, chargés « ${charges} »`);
		}
	} catch (e) {
		check(false, 'le banc s’est déroulé jusqu’au bout', e.message);
	} finally {
		try { ws?.close(); } catch {}
		proc.kill();
	}
}
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(echecs.length ? `\nÉCHEC (${echecs.length}) : ${echecs.join(' · ')}` : `\nTout est vert (${ok} contrôles).`);
process.exit(echecs.length ? 1 : 0);
