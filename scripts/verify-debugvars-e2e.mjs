// Test de régression : les VARIABLES d'un croquis Arduino s'affichent dans le
// panneau quand la simulation est en pause (bouton ⏸, pas à pas).
//
// Pourquoi ce banc : le défaut « plus aucune variable en pause » (Frank, 25/09)
// est passé sans qu'aucun banc ne rougisse. verify-debug-avr contrôle
// l'extraction DWARF et le moteur SEUL ; verify-debugvars ne contrôle que des
// chaînes. Personne ne regardait le panneau réel, monté par le vrai chemin — le
// message `runProgram` de l'extension, puis le fil de simulation (Web Worker,
// actif par défaut) qui renvoie la pause à la page.
//
// La cause : une pince d'analyseur posée replie Variables au lancement
// (v2026.9.5.139), et la pause laissait le panneau replié. La pause le déplie
// désormais ; la reprise le replie. Contre-épreuve : `--sim-git=<réf>` monte le
// sim.mts d'un enregistrement git sans toucher au disque.
//
// L'atelier monté est le VRAI : HTML de webview-html.ts, media/styles.css,
// sim.mts et le bundle du worker, servis par un petit serveur HTTP local (un
// worker ne se charge pas depuis file://). Chrome est piloté en CDP brut et le
// bouton ⏸ est cliqué à la VRAIE souris.
//
// Le programme est un croquis AVR minuscule écrit à la main : il incrémente un
// octet en SRAM (0x0100) en boucle. Les infos de débogage (lignes, globale
// `compteur`) sont celles qu'enverrait compiler.ts : le banc n'a donc besoin
// d'aucune chaîne de compilation.
//
// Chaque contrôle est joué DEUX fois : fil de simulation (worker) et fil
// principal.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-debugvars-e2e');
const PORT = 9427; // port CDP propre à ce banc : la suite enchaîne les bancs CDP
mkdirSync(CACHE, { recursive: true });

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (nom, cond, detail = '') => {
	let val = cond;
	if (typeof cond === 'function') {
		try { val = cond(); }
		catch (e) { val = false; detail = `mesure impossible : ${e.message}`; }
	}
	checks.push({ nom, ok: !!val, detail: String(detail) });
	console.log(`${val ? '✅' : '❌'} ${nom}${val ? '' : ` — ${detail}`}`);
};

// --- Le programme et ses infos de débogage -----------------------------------
// 0: ldi r16,0   1: inc r16   2-3: sts 0x0100,r16   4: rjmp 1
const PROGRAMME = [0xe000, 0x9503, 0x9300, 0x0100, 0xcffc];
const DEBUG = {
	// Adresses flash en OCTETS (mot × 2), comme la table DWARF.
	lines: [
		{ addr: 0, line: 3 },
		{ addr: 2, line: 4 },
		{ addr: 4, line: 5 },
		{ addr: 8, line: 6 },
	],
	globals: [{ name: 'compteur', addr: 0x0100, size: 1, type: 'unsigned char' }],
	locals: ['travail'],
};
// Une carte et UNE pince d'analyseur posée sur D8 : au lancement, l'analyseur
// s'ouvre et replie Variables pour laisser la place aux courbes (v2026.9.5.139).
// C'est ce repli qui cachait les variables en pause.
const SCHEMA_PINCE = {
	parts: [
		{ id: 'U1', type: 'uno', x: 40, y: 60 },
		{ id: 'SD1', type: 'sonde-logique', x: 220, y: 10, attrs: { voie: '0', accroche: 'U1/8' } },
	],
	wires: [],
};
// `--payload=<entrée du cache de compilation>` rejoue une VRAIE compilation
// (fichier JSON de globalStorage/…/cache-compilation) au lieu du croquis maison.
const argPayload = process.argv.find((a) => a.startsWith('--payload='))?.slice(10);
const REEL = argPayload ? JSON.parse(readFileSync(argPayload, 'utf8')).payload : null;
const BYTES = REEL ? REEL.bytes : PROGRAMME;
const INFOS = REEL ? REEL.debug : DEBUG;
const NOM = INFOS.globals[0].name;
// Ligne du point d'arrêt : `--ligne=N`, sinon celle du `sts` du croquis maison.
const LIGNE = Number(process.argv.find((a) => a.startsWith('--ligne='))?.slice(8) ?? 5);
// `--projix=<fichier>` monte d'abord le schéma de ce projet (message loadProject,
// comme à l'ouverture du fichier), avec ses réglages du panneau de débogage.
const argProjix = process.argv.find((a) => a.startsWith('--projix='))?.slice(9);
let PROJET = null;
if (argProjix) {
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(readFileSync(argProjix));
	PROJET = {
		manifest: JSON.parse(await zip.file('kablix.json').async('string')),
		diagram: JSON.parse(await zip.file('diagram.json').async('string')),
	};
}

// --- Le vrai HTML de l'atelier, avec un faux module `vscode` ------------------
const fauxVscode = {
	name: 'faux-vscode',
	setup(build) {
		build.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'faux' }));
		build.onLoad({ filter: /.*/, namespace: 'faux' }, () => ({
			contents: [
				'export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_, i) => a[i]) };',
				'export const Uri = { joinPath: (...p) => p.join("/") };',
				'export const workspace = { getConfiguration: () => ({ get: () => undefined }) };',
				'export const env = { language: "en" };',
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
let html = buildWebviewHtml({ asWebviewUri: (u) => String(u), cspSource: 'http:' }, 'media');

// Le pont VS Code note les messages postés. Il choisit aussi le fil de
// simulation d'après l'adresse (`?worker=0` = fil principal) et compte les
// workers créés : c'est la preuve que le mode worker tourne VRAIMENT dans un
// worker, et pas dans le repli silencieux sur le fil principal.
const pont = `
window.__msgs = [];
window.__err = [];
window.__workers = 0;
window.addEventListener('error', (e) => window.__err.push('ERR ' + e.message));
window.acquireVsCodeApi = () => ({
	postMessage: (m) => window.__msgs.push(m),
	getState: () => undefined,
	setState: () => {},
});
window.KABLIX_SIM_WORKER = new URLSearchParams(location.search).get('worker') !== '0';
window.KABLIX_WORKER_URL = 'worker.js';
const W = window.Worker;
window.Worker = class extends W { constructor(...a) { super(...a); window.__workers++; } };
`;

// Contre-épreuve : `--sim-git=<réf>` monte le sim.mts d'un enregistrement git
// (`--sim-git=HEAD` = avant correctif) sans toucher au fichier sur disque.
const argSimGit = process.argv.find((a) => a.startsWith('--sim-git='))?.slice(10);
const simGit = {
	name: 'sim-git',
	setup(build) {
		if (!argSimGit) return;
		build.onLoad({ filter: /[\\/]webview[\\/]sim\.mts$/ }, () => ({
			contents: execFileSync('git', ['show', `${argSimGit}:src/webview/sim.mts`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }),
			loader: 'ts',
			resolveDir: join(ROOT, 'src', 'webview'),
		}));
	},
};
if (argSimGit) console.log(`sim.mts pris dans git : ${argSimGit}`);

// Mêmes réglages que esbuild.js en production (`npm run build`) : cible es2020 et
// code MINIFIÉ — c'est ce code-là que reçoivent les utilisateurs.
const b = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview', 'sim.mts')],
	bundle: true, format: 'iife', write: false, platform: 'browser', target: 'es2020', minify: true,
	// __BUILD_TIME__ : lu par les sim.mts d'avant v2026.9.4.103 (contre-épreuve).
	define: { __BUILD_NUMBER__: JSON.stringify('test'), __BUILD_TIME__: JSON.stringify('') },
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl', '.gif': 'dataurl', '.mp4': 'dataurl', '.ico': 'dataurl' },
	plugins: [simGit],
	absWorkingDir: ROOT,
});
const w = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview', 'engines', 'sim-worker.mts')],
	bundle: true, format: 'iife', write: false, platform: 'browser', target: 'es2020', minify: true,
	absWorkingDir: ROOT,
});
writeFileSync(join(CACHE, 'pont.js'), pont);
writeFileSync(join(CACHE, 'bundle.js'), b.outputFiles[0].text);
writeFileSync(join(CACHE, 'worker.js'), w.outputFiles[0].text);
html = html.replace(/<script[^>]*src="[^"]*webview\.js"[^>]*>[\s\S]*?<\/script>/,
	'<script src="pont.js"></scr' + 'ipt><script src="bundle.js"></scr' + 'ipt>');
html = html.replace(/<link[^>]*styles\.css[^>]*>/,
	`<style>${readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8')}</style>`);
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
writeFileSync(join(CACHE, 'p.html'), html);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }

// Serveur HTTP minimal : le dossier du banc, rien d'autre.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const serveur = createServer((req, res) => {
	const nom = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
	const fichier = join(CACHE, nom);
	if (!nom || nom.includes('..') || !existsSync(fichier)) { res.writeHead(404); res.end(); return; }
	res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] ?? 'application/octet-stream' });
	res.end(readFileSync(fichier));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const HTTP = `http://127.0.0.1:${serveur.address().port}`;

const profil = join(CACHE, 'profil');
rmSync(profil, { recursive: true, force: true });
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`,
	`--window-size=${process.argv.find((a) => a.startsWith('--fenetre='))?.slice(10) ?? '1400,1000'}`,
	'about:blank'], { stdio: 'ignore' });

let ws = null;
try {
	let liste = null;
	for (let i = 0; i < 40 && !liste; i++) {
		try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
		catch { await attendre(250); }
	}
	if (!liste) throw new Error('Chrome ne répond pas sur le port de mise au point');
	const cible = liste.find((c) => c.type === 'page');
	ws = new WebSocket(cible.webSocketDebuggerUrl);
	let id = 0;
	const attentes = new Map();
	ws.addEventListener('message', (ev2) => {
		const m = JSON.parse(ev2.data);
		if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
	});
	await new Promise((r) => ws.addEventListener('open', r, { once: true }));
	const cdp = (method, params = {}) => new Promise((res) => {
		const n = ++id;
		attentes.set(n, res);
		ws.send(JSON.stringify({ id: n, method, params }));
	});
	const ev = async (expr) => {
		const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
		if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
		return r.result?.result?.value;
	};

	// Clic RÉEL : c'est Chrome qui fabrique pointerdown/mousedown/click.
	const clic = async (sel) => {
		const p = JSON.parse(await ev(`(() => {
			const el = document.querySelector('${sel}');
			if (!el) return 'null';
			const b = el.getBoundingClientRect();
			return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) });
		})()`));
		if (!p) throw new Error(`${sel} introuvable`);
		const base = { x: p.x, y: p.y, button: 'left', clickCount: 1 };
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
	};

	/** Ce que l'élève voit du panneau Variables. */
	const panneau = () => ev(`(() => {
		const dbg = document.getElementById('debug');
		const table = document.getElementById('debug-vars');
		const rows = table ? [...table.rows] : [];
		const tb = table ? table.getBoundingClientRect() : null;
		return JSON.stringify({
			cache: dbg ? dbg.hidden : null,
			affiche: dbg ? getComputedStyle(dbg).display !== 'none' : null,
			replie: dbg ? dbg.classList.contains('is-folded') : null,
			proprietesRepliees: document.getElementById('inspector')?.classList.contains('is-folded') ?? null,
			lignes: rows.map((r) => r.textContent.replace(/\\s+/g, ' ').trim()),
			hauteur: tb ? Math.round(tb.height) : -1,
			pause: document.getElementById('pause')?.textContent,
			etat: document.getElementById('status')?.textContent ?? '',
		});
	})()`).then(JSON.parse);
	const compteur = (p) => p.lignes.find((l) => l.includes(`${NOM} :`));
	const valeur = (p) => {
		const brut = (compteur(p) ?? '').split(`${NOM} :`)[1]?.trim().split(' ')[0];
		return brut === undefined ? NaN : brut === 'true' || brut === 'false' ? Number(brut === 'true') : Number(brut);
	};

	for (const mode of ['worker', 'fil principal']) {
		console.log(`\n— ${mode} —`);
		await cdp('Page.enable');
		await cdp('Page.navigate', { url: `${HTTP}/p.html${mode === 'worker' ? '' : '?worker=0'}` });
		for (let i = 0; i < 60; i++) {
			if (await ev('(window.__msgs || []).some((m) => m && m.type === "ready")').catch(() => false)) break;
			await attendre(200);
		}
		// Le bundle du worker est récupéré et sondé au chargement : on lui laisse
		// le temps de répondre avant le premier run.
		await attendre(800);
		ok(`[${mode}] l atelier démarre sans erreur`,
			await ev('(window.__msgs || []).some((m) => m && m.type === "ready") && window.__err.length === 0'),
			await ev('JSON.stringify(window.__err)'));

		if (PROJET) {
			const dv = PROJET.manifest.debugVars ?? {};
			await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
				type: 'debugVars', hidden: ${JSON.stringify(dv.hidden ?? [])}, bases: ${JSON.stringify(dv.bases ?? {})} } }))`);
			await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
				type: 'loadProject', diagram: ${JSON.stringify(PROJET.diagram)}, board: ${JSON.stringify(PROJET.manifest.board)} } }))`);
			await attendre(600);
		}
		await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
			type: 'runProgram', board: 'uno', bytes: ${JSON.stringify(BYTES)},
			debug: ${JSON.stringify(INFOS)} } }))`);
		await attendre(500);
		const workers = await ev('window.__workers');
		if (mode === 'worker') {
			// Un worker pour la sonde du chargement, un autre pour le moteur.
			ok('[worker] la simulation tourne bien dans un worker', workers >= 2, `${workers} worker(s) créé(s)`);
		} else {
			ok('[fil principal] aucun worker n est monté', workers === 0, `${workers} worker(s) créé(s)`);
		}
		let p = await panneau();
		ok(`[${mode}] en marche, le panneau Variables est affiché`, p.affiche && !p.cache, JSON.stringify(p));

		// --- ⏸ à la vraie souris : les variables doivent apparaître ----------
		await clic('#pause');
		await attendre(500);
		p = await panneau();
		// `--capture=<dossier>` : photo de l'atelier en pause, pour voir ce que voit l'élève.
		const argCapture = process.argv.find((a) => a.startsWith('--capture='))?.slice(10);
		if (argCapture) {
			const img = await cdp('Page.captureScreenshot', { format: 'png' });
			writeFileSync(join(argCapture, `pause-${mode === 'worker' ? 'worker' : 'principal'}.png`),
				Buffer.from(img.result.data, 'base64'));
		}
		ok(`[${mode}] la pause est prise (bouton ▶)`, p.pause === '▶', JSON.stringify(p));
		ok(`[${mode}] en pause, la globale « ${NOM} » est LISTÉE`, !!compteur(p), JSON.stringify(p));
		ok(`[${mode}] et sa valeur est lue en mémoire`, Number.isFinite(valeur(p)), compteur(p) ?? '(absente)');
		ok(`[${mode}] la table est visible (hauteur non nulle)`, p.hauteur > 0, JSON.stringify(p));
		if (!REEL) {
			ok(`[${mode}] la locale non lisible est nommée`, p.lignes.some((l) => /travail/.test(l)), JSON.stringify(p.lignes));
		}

		// --- Pas à pas : les variables restent, la valeur avance -------------
		const avant = valeur(p);
		for (let i = 0; i < 4; i++) { await clic('#step'); await attendre(250); }
		p = await panneau();
		ok(`[${mode}] après des pas, les variables sont toujours LÀ`, !!compteur(p), JSON.stringify(p));
		if (!REEL) ok(`[${mode}] et « ${NOM} » a AVANCÉ`, valeur(p) !== avant, `${avant} → ${valeur(p)}`);

		// --- Reprise puis nouvelle pause : le panneau se remplit de nouveau ----
		await clic('#pause');
		await attendre(300);
		p = await panneau();
		ok(`[${mode}] à la reprise, l instantané périmé est retiré`, !compteur(p), JSON.stringify(p));
		await clic('#pause');
		await attendre(500);
		p = await panneau();
		ok(`[${mode}] seconde pause : les variables REVIENNENT`, !!compteur(p), JSON.stringify(p));

		// --- Point d'arrêt de la gouttière -----------------------------------
		// Même ordre que l'hôte : `runProgram`, puis tout de suite `breakpoints`
		// (panel.ts, runProgram → sendBreakpoints). En mode worker, le point
		// d'arrêt part donc AVANT que le moteur du worker ait fini de monter.
		await ev(`document.getElementById('stop').click()`);
		await attendre(300);
		await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
			type: 'runProgram', board: 'uno', bytes: ${JSON.stringify(BYTES)},
			debug: ${JSON.stringify(INFOS)} } }));
			window.dispatchEvent(new MessageEvent('message', { data: {
			type: 'breakpoints', breakpoints: [{ line: ${LIGNE} }] } }))`);
		await attendre(1200);
		p = await panneau();
		ok(`[${mode}] le point d arrêt ligne ${LIGNE} suspend la simulation`, p.pause === '▶', JSON.stringify(p));
		ok(`[${mode}] et les variables sont LISTÉES à l arrêt`, !!compteur(p), JSON.stringify(p));
		ok(`[${mode}] le panneau est lisible (ni replié ni vide)`, !p.replie && p.hauteur > 0, JSON.stringify(p));
		const ligneVue = await ev(`document.getElementById('debug-line')?.textContent ?? ''`);
		ok(`[${mode}] la ligne d arrêt est annoncée`, ligneVue.includes(String(LIGNE)), ligneVue);
		await ev(`window.dispatchEvent(new MessageEvent('message', { data: { type: 'breakpoints', breakpoints: [] } }))`);

		await ev(`document.getElementById('stop').click()`);
		await attendre(300);

		// --- Pince d'analyseur posée : Variables replié au lancement ----------
		// LE défaut vu par Frank (25/09) : l'analyseur replie Variables au
		// lancement, et la pause laissait le panneau replié — table de hauteur
		// nulle, « plus aucune variable ». La pause doit le DÉPLIER, la reprise le
		// replier de nouveau (la place revient aux courbes).
		const lancer = () => ev(`window.dispatchEvent(new MessageEvent('message', { data: {
			type: 'runProgram', board: 'uno', bytes: ${JSON.stringify(BYTES)},
			debug: ${JSON.stringify(INFOS)} } }))`);
		await ev(`window.dispatchEvent(new MessageEvent('message', { data: {
			type: 'loadProject', diagram: ${JSON.stringify(SCHEMA_PINCE)}, board: 'uno' } }))`);
		await attendre(600);
		await lancer();
		await attendre(500);
		p = await panneau();
		ok(`[${mode}] pince posée : en marche, Variables est replié (place aux courbes)`, p.replie, JSON.stringify(p));
		await clic('#pause');
		await attendre(500);
		p = await panneau();
		ok(`[${mode}] pince posée : la pause DÉPLIE Variables`, !p.replie && p.hauteur > 0, JSON.stringify(p));
		ok(`[${mode}] pince posée : et la globale « ${NOM} » est LISTÉE`, !!compteur(p), JSON.stringify(p));
		await clic('#step');
		await attendre(250);
		p = await panneau();
		ok(`[${mode}] pince posée : un pas, le panneau reste déplié`, !p.replie && !!compteur(p), JSON.stringify(p));
		await clic('#pause');
		await attendre(300);
		p = await panneau();
		ok(`[${mode}] pince posée : à la reprise, Variables se replie de nouveau`, p.replie, JSON.stringify(p));
		// Replié À LA MAIN pendant une pause : les pas suivants le respectent.
		await clic('#pause');
		await attendre(500);
		await clic('#fold-debug');
		await attendre(200);
		await clic('#step');
		await attendre(250);
		p = await panneau();
		ok(`[${mode}] replié à la main en pause : le pas suivant ne le rouvre pas`, p.replie, JSON.stringify(p));
		await ev(`document.getElementById('stop').click()`);
		await attendre(300);
		p = await panneau();
		ok(`[${mode}] repli à la main gardé à l arrêt (colonne Propriétés repliée)`, p.proprietesRepliees, JSON.stringify(p));

		// Panneau replié par l'élève AVANT le lancement : la pause le déplie
		// quand même, et l'arrêt en pleine pause rend son repli à l'élève.
		await lancer();
		await attendre(500);
		await clic('#pause');
		await attendre(500);
		p = await panneau();
		ok(`[${mode}] replié par l élève : la pause le déplie`, !p.replie && !!compteur(p), JSON.stringify(p));
		await ev(`document.getElementById('stop').click()`);
		await attendre(300);
		p = await panneau();
		ok(`[${mode}] arrêt en pleine pause : le repli de l élève revient`, p.proprietesRepliees, JSON.stringify(p));
		ok(`[${mode}] aucune erreur de page pendant tout le parcours`,
			await ev('window.__err.length === 0'), await ev('JSON.stringify(window.__err)'));
	}
} finally {
	try { ws?.close(); } catch { /* déjà fermé */ }
	proc.kill();
	serveur.close();
}

const fail = checks.filter((c) => !c.ok).length;
console.log(fail
	? `debugvars-e2e : ${fail} échec(s).`
	: `debugvars-e2e : ${checks.length} contrôles OK — les variables s'affichent en pause.`);
process.exit(fail ? 1 : 0);
