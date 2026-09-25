// Vérifie la barre de temps de l'onglet de l'analyseur, à la VRAIE souris :
// l'instant lu au réticule et les niveaux affichés dans la marge.
//
// - L'instant suit la souris en haut du tracé. Écrit à nu, il se mêlait à la
//   graduation qu'il survolait (Frank, 25/09 : « le temps qui suit le curseur
//   temporel n'est pas lisible s'il se superpose à une info de la barre
//   temporelle »). Il doit reposer sur une plaque opaque, peinte APRÈS la
//   graduation qu'il recouvre.
// - Le niveau 1 lu au réticule est vert #1BAF7A, dans les deux thèmes.
//
// Vrai HTML de l'onglet, vrai analyseur.mts, Chrome headless piloté en CDP brut
// (`Input.dispatchMouseEvent`) : le réticule suit un vrai `pointermove`, pas un
// événement fabriqué. Ce qui est peint se relit en interceptant `fillText` et
// `fillRect` (texte, position, couleur, ordre de dessin).
//
// Contre-épreuve sans toucher aux sources : `--ancien=<fichiers>` compile les
// fichiers nommés dans leur version du dernier enregistrement git (HEAD), par
// exemple `--ancien=analyseur-vue`. Le banc DOIT alors échouer.
//
// Usage : node scripts/verify-analyseur-marqueurs.mjs [--ancien=a,b] [--image=<dossier>]
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-marqueurs-'));
const PORT = 9418;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const ancien = (process.argv.find((a) => a.startsWith('--ancien=')) ?? '').slice('--ancien='.length).split(',').filter(Boolean);
const dossierImage = process.argv.find((a) => a.startsWith('--image='))?.slice('--image='.length);

let echecs = 0;
const check = (nom, ok, detail = '') => {
	if (ok) console.log(`  ✅ ${nom}`);
	else {
		echecs++;
		console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}`);
	}
};

// --- Capture : deux voies en opposition --------------------------------------
// Voie 0 : créneau de 1 ms de période sur 20 ms. Voie 1 : son complément. À tout
// instant, l'une lit 1 et l'autre 0 : les deux couleurs de niveau se voient.
const fronts0 = [];
const fronts1 = [];
for (let k = 0; k < 40; k++) {
	const t = 0.5 * k;
	fronts0.push(t, k % 2 === 0 ? 1 : 0);
	fronts1.push(t, k % 2 === 0 ? 0 : 1);
}
const ETAT = {
	voies: [
		{ voie: 0, nom: 'CLK', pin: 'GP2', fronts: fronts0, niveauInitial: 0 },
		{ voie: 1, nom: 'NCLK', pin: 'GP3', fronts: fronts1, niveauInitial: 1 },
	],
};

// --- Page : vrai HTML de l'onglet, vrai bundle -------------------------------
const STUB = `
export const Uri = { joinPath: (b, ...p) => ({ fsPath: [b.fsPath, ...p].join('/'), toString() { return this.fsPath; } }) };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const env = { language: 'fr' };
export const window = {}; export const ViewColumn = {};
export default { Uri, l10n, env, window, ViewColumn };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
await esbuild.build({
	entryPoints: [join(ROOT, 'src/analyseur-panel.ts')],
	outfile: join(tmp, 'analyseur-panel.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { AnalyseurPanel } = await import(pathToFileURL(join(tmp, 'analyseur-panel.mjs')).href);
const html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/banc.projix');

/** Remplace à la compilation les fichiers de `--ancien` par leur version HEAD. */
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /src[\\/]webview[\\/][^\\/]+\.mts$/ }, (args) => {
			const nom = args.path.replace(/\\/g, '/').split('/').pop().replace(/\.mts$/, '');
			if (!ancien.includes(nom)) return undefined;
			const contents = execFileSync('git', ['show', `HEAD:src/webview/${nom}.mts`], { cwd: ROOT, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
if (ancien.length) console.log(`(contre-épreuve : ${ancien.join(', ')} en version HEAD)`);
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Relevé de ce que la vue peint, dans l'ordre : textes (avec leur couleur et
// leur police) et rectangles pleins (avec leur opacité et leur couleur).
const ESPION = `
window.__msgs = [];
window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(m); }, setState() {} });
window.__peint = [];
const origine = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...r) {
	window.__peint.push({ quoi: 'texte', t: String(t), x, y, align: this.textAlign, w: this.measureText(String(t)).width,
		fill: String(this.fillStyle), font: this.font, alpha: this.globalAlpha });
	return origine.call(this, t, x, y, ...r);
};
const origineRect = CanvasRenderingContext2D.prototype.fillRect;
CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
	window.__peint.push({ quoi: 'rect', x, y, w, h, fill: String(this.fillStyle), alpha: this.globalAlpha });
	return origineRect.call(this, x, y, w, h);
};`;
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const fichier = join(tmp, 'onglet.html');
writeFileSync(fichier, html
	.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`));

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,500',
	`file:///${fichier.replace(/\\/g, '/')}`], { stdio: 'ignore' });
let ws;
try {
	let liste = null;
	for (let i = 0; i < 40 && !liste; i++) {
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
	const ev = async (expr) => {
		const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
		if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
		return r.result?.result?.value;
	};
	for (let i = 0; i < 40 && !(await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`).catch(() => false)); i++) await attendre(250);

	await ev(`window.postMessage(${JSON.stringify({ type: 'restaure', etat: ETAT })}, '*')`);
	await attendre(250);
	const boite = await ev(`(() => { const r = document.getElementById('trace').getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })()`);

	/** Un rendu forcé, rien d'autre : ce qu'il peint, dans l'ordre. */
	const releve = async () => {
		await attendre(200); // laisse passer les rendus que le geste a demandés
		await ev(`window.__peint = []`);
		await ev(`window.postMessage({ type: 'repeindre' }, '*')`);
		await attendre(60);
		return (await ev('window.__peint')).map((p, n) => ({ ...p, n }));
	};
	/** Souris déplacée pour de vrai, en coordonnées du canvas. */
	const bouger = async (x, y) => {
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(boite.left + x), y: Math.round(boite.top + y), buttons: 0 });
	};
	const bordG = (p) => (p.align === 'center' ? p.x - p.w / 2 : p.align === 'right' ? p.x - p.w : p.x);
	const seCouvrent = (a, b) => bordG(a) < bordG(b) + b.w && bordG(b) < bordG(a) + a.w;

	const THEMES = [
		{ nom: 'sombre', classe: 'vscode-dark', fond: '#1f1f1f', texte: '#cccccc' },
		{ nom: 'clair', classe: 'vscode-light', fond: '#ffffff', texte: '#3b3b3b' },
	];
	for (const th of THEMES) {
		// Les variables de thème que VS Code pose sur la page, comme dans l'éditeur.
		await ev(`(() => {
			document.documentElement.style.setProperty('--vscode-editor-background', '${th.fond}');
			document.documentElement.style.setProperty('--vscode-foreground', '${th.texte}');
			document.body.className = '${th.classe}';
		})()`);
		console.log(`Thème ${th.nom}`);

		// --- 1. L'instant du réticule, sur une graduation -----------------------
		await bouger(300, 100);
		const avant = await releve();
		const graduations = avant.filter((p) => p.quoi === 'texte' && p.align === 'center' && p.y < 22);
		check('témoin : la règle porte des graduations', graduations.length >= 4, `${graduations.length}`);
		for (const cote of ['gauche', 'droite']) {
			// Une graduation de la moitié voulue ; la souris un peu avant (à gauche :
			// le texte part vers la droite) ou un peu après (à droite : il part vers
			// la gauche), pour que l'instant écrit la recouvre.
			const milieu = boite.w / 2;
			const cible = graduations.find((g) => (cote === 'gauche' ? g.x > 150 && g.x < milieu - 60 : g.x > milieu + 60 && g.x < boite.w - 60));
			if (!cible) { check(`${cote} : une graduation à survoler`, false); continue; }
			const xs = cote === 'gauche' ? cible.x - 12 : cible.x + 12;
			await bouger(xs, 120);
			const vu = await releve();
			const instant = vu.find((p) => p.quoi === 'texte' && p.y < 22 && p.align !== 'center');
			check(`${cote} : l'instant du réticule est écrit en haut, à l'endroit d'une graduation (témoin)`,
				!!instant && seCouvrent(cible, instant), instant ? `« ${instant.t} » à ${bordG(instant).toFixed(0)}, graduation « ${cible.t} » à ${bordG(cible).toFixed(0)}` : 'aucun instant écrit');
			if (!instant) continue;
			// Aucun bout de graduation ne dépasse sous l'instant : celle qu'il
			// recouvre n'est plus écrite (la plaque seule laissait voir un « s »).
			const dessous = vu.filter((p) => p.quoi === 'texte' && p.y < 22 && p.align === 'center' && bordG(p) < bordG(instant) + instant.w + 3 && bordG(instant) - 3 < bordG(p) + p.w);
			check(`${cote} : aucune graduation n'est écrite sous l'instant, même en partie`,
				dessous.length === 0, dessous.map((p) => `« ${p.t} »`).join(' '));
			const g = bordG(instant);
			const plaque = vu.find((p) => p.quoi === 'rect' && p.alpha === 1 && p.n < instant.n
				&& p.x <= g - 1 && p.x + p.w >= g + instant.w + 1 && p.y <= instant.y - 6 && p.y + p.h >= instant.y + 6
				&& !vu.some((q) => q.quoi === 'texte' && q.y < 22 && q.n > p.n && q.n < instant.n));
			check(`${cote} : une plaque opaque est peinte juste SOUS l'instant, qu'elle déborde d'un pixel`,
				!!plaque, `instant [${g.toFixed(1)}–${(g + instant.w).toFixed(1)}] × y ${instant.y}`);
			check(`${cote} : la plaque a la couleur du fond de l'éditeur (${th.fond})`,
				plaque?.fill === th.fond, plaque?.fill ?? '—');
		}

		// --- 2. Niveaux dans la marge : 0 rouge, 1 vert #1BAF7A -------------------
		await bouger(boite.w / 2, 80);
		const niv = await releve();
		const niveaux = niv.filter((p) => p.quoi === 'texte' && /^[01]$/.test(p.t) && p.font.includes('bold') && p.x < 104);
		const uns = niveaux.filter((p) => p.t === '1');
		const zeros = niveaux.filter((p) => p.t === '0');
		check('témoin : les deux voies écrivent leur niveau, un 1 et un 0', uns.length === 1 && zeros.length === 1,
			niveaux.map((p) => p.t).join(','));
		check('le niveau 1 est vert #1BAF7A', uns.length > 0 && uns.every((p) => p.fill === '#1baf7a'), uns.map((p) => p.fill).join(','));
		check('le niveau 0 reste rouge', zeros.length > 0 && zeros.every((p) => /^#(d1242f|f85149)$/.test(p.fill)), zeros.map((p) => p.fill).join(','));

		if (dossierImage) {
			await bouger(boite.w - 200, 120);
			await attendre(250);
			const png = await cdp('Page.captureScreenshot', { format: 'png' });
			writeFileSync(join(dossierImage, `marqueurs-${th.nom}.png`), Buffer.from(png.result.data, 'base64'));
		}
	}
} catch (e) {
	echecs++;
	console.log('  ❌ ÉCHEC', e?.stack ?? e);
} finally {
	try { ws?.close(); } catch { /* */ }
	proc.kill();
	await attendre(300);
	try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
}
console.log(echecs === 0 ? '\nTout est vert.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
