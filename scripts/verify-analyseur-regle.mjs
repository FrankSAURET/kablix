// La barre de temps s'adapte-t-elle au zoom ? Les bits 1-Wire vont-ils d'un
// creux au suivant ? (v2026.9.6.171)
//
// LES DÉFAUTS (Frank, 28/09, capture d'un DS18B20 sur Pico) :
//  1. « L'affichage dans la barre de temps doit s'adapter au zoom et non rester
//     sur des secondes. » Chaque graduation prenait l'unité de SON instant :
//     à 12 s de capture et 20 µs par graduation, toutes s'écrivaient
//     « 12,346 s » — la même étiquette partout, et le réticule idem.
//  2. « Pourquoi pour le ds18b20, tu matérialises le bit avec une durée de 60 µs
//     et pas jusqu'au front suivant. » La case d'un bit s'arrêtait après 60 µs,
//     laissant un trou avant le bit suivant (récupération, 10 µs et plus).
//
// Vraie page de l'onglet, vrai bundle, Chrome headless en CDP brut (VRAIE souris
// pour le réticule). La capture : un DS18B20 lu à 12 s (MATCH ROM, READ
// SCRATCHPAD), décodé en 1-Wire, case Bits cochée. Trois vues posées par l'état
// de l'onglet : 600 µs à 12 s, 5 ms au début, 20 s en entier.
//
// Contre-épreuve : `node scripts/verify-analyseur-regle.mjs --ancien` prend les
// sources de l'analyseur dans HEAD — le banc DOIT échouer.
import esbuild from 'esbuild';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-regle-'));
const PORT = 9436;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
const echecs = [];
const check = (cond, titre, detail = '') => {
	if (cond) { ok++; console.log(`  ✓ ${titre}`); return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};

// --- Contre-épreuve : les sources de l'analyseur prises dans HEAD ------------
const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : sources de l’analyseur en version HEAD)');
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /[\\/]src[\\/](webview[\\/]analyseur(-capture|-decodage|-vue)?\.mts|analyseur-panel\.ts)$/ }, (args) => {
			if (!ANCIEN) return undefined;
			const rel = relative(ROOT, args.path).replace(/\\/g, '/');
			const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};

// --- La page : vrai HTML de l'onglet, vrai script ----------------------------
const STUB = `
export const Uri = { joinPath: (b, ...p) => ({ fsPath: [b.fsPath, ...p].join('/'), toString() { return this.fsPath; } }) };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const env = { language: 'en' };
export const window = {}; export const ViewColumn = {};
export default { Uri, l10n, env, window, ViewColumn };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
const sortiePanneau = join(tmp, 'analyseur-panel.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src/analyseur-panel.ts')],
	outfile: sortiePanneau, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
	plugins: [versionHead],
});
const { AnalyseurPanel } = await import(pathToFileURL(sortiePanneau).href);
let html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/regle.projix');
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Faux VS Code (état gardé en sessionStorage : il survit au rechargement, comme
// celui que VS Code rend à un onglet), et relevé de ce que la vue peint.
const ESPION = `window.__msgs = []; window.__erreurs = [];
window.addEventListener('error', (e) => window.__erreurs.push(e.message));
window.acquireVsCodeApi = () => ({
	postMessage(m) { window.__msgs.push(m); },
	setState(s) { sessionStorage.setItem('etat', JSON.stringify(s)); },
	getState() { const s = sessionStorage.getItem('etat'); return s ? JSON.parse(s) : undefined; },
});
window.__peint = [];
const P = CanvasRenderingContext2D.prototype;
const espionner = (nom, releve) => {
	const origine = P[nom];
	P[nom] = function (...a) { window.__peint.push(releve.call(this, ...a)); return origine.apply(this, a); };
};
espionner('fillText', function (t, x, y) { return { quoi: 'texte', t: String(t), x, y }; });
espionner('fillRect', function (x, y, w, h) { return { quoi: 'rect', x, y, w, h, c: String(this.fillStyle), a: this.globalAlpha }; });`;
html = html
	.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
const fichierPage = join(tmp, 'onglet.html');
writeFileSync(fichierPage, html);

// --- Le signal : un DS18B20 lu à 12 s, aux durées du capteur simulé ----------
// RESET 480 µs, présence 110 µs ; slot de 70 µs ; le maître écrit un 1 en 6 µs,
// un 0 en 60 µs ; le capteur répond un 0 en 30 µs.
const US = 1 / 1000;
const DQ = [];
const creux = (t, us) => { DQ.push(t, 0, t + us * US, 1); };
const transaction = (t, octets) => {
	creux(t, 480);
	creux(t + 510 * US, 110);
	let s = t + 960 * US;
	for (const o of octets) {
		for (let k = 0; k < 8; k++) {
			creux(s, (o >> k) & 1 ? 6 : 60);
			s += 70 * US;
		}
	}
};
const T12 = 12000;
transaction(1, [0xcc, 0x44]);
transaction(T12, [0x55, 0x28, 0x24, 0x61, 0xf5, 0x8c, 0x7e, 0xac, 0xe7, 0xbe]);
transaction(20000, [0xcc, 0x44]);

const REGLAGE = { protocole: 'onewire', id: 'd1', donnees: 0, bits: true };
const VOIES = [{ voie: 0, nom: 'DQ', pin: 'GP14', probleme: null, analogique: false }];
const CAPTURE = {
	voies: [{ voie: 0, nom: 'DQ', pin: 'GP14', fronts: DQ, niveauInitial: 1 }],
	declenchement: null, decodages: [REGLAGE], voiesReglages: {}, echantillonnage: 0,
};
/** Les trois vues : au cœur de l'adresse du MATCH ROM, au début, en entier. */
const VUES = [
	{ nom: '600 µs à 12 s', f: { t0: T12 + 1.6, duree: 0.6 }, unite: 'µs' },
	{ nom: '5 ms au début', f: { t0: 0.5, duree: 5 }, unite: 'ms' },
	{ nom: '20 s en entier', f: { t0: 0, duree: 21000 }, unite: 's' },
];
const GRAD_H = 22; // analyseur-vue : bande des graduations

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
	check(false, 'Chrome introuvable — le banc n’a pas pu être joué');
} else {
	const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
		`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,400',
		`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
	let ws;
	try {
		let liste = null;
		// 30 s : sous verify:all, sept bancs en parallèle, Chrome met parfois plus de 10 s à ouvrir son port.
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
		const ev = async (expr) => {
			const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
			if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
			return r.result?.result?.value;
		};
		const pret = async () => {
			for (let i = 0; i < 120; i++) {
				if (await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`)) return true;
				await attendre(250);
			}
			return false;
		};
		const envoyer = (m) => ev(`window.postMessage(${JSON.stringify(m)}, '*')`);

		// La vue de départ passe par l'état que VS Code rend à l'onglet : c'est la
		// seule porte vers une fenêtre précise sans zoomer à la molette.
		check(await pret(), 'la page se dit prête');
		let boite = null;
		const releve = async () => {
			await attendre(120);
			await ev(`window.__peint = []`);
			await envoyer({ type: 'repeindre' });
			await attendre(60);
			return ev('window.__peint');
		};
		/** Étiquettes des graduations : les textes écrits dans leur bande, de gauche à droite. */
		const graduations = (vu) => vu.filter((p) => p.quoi === 'texte' && p.y < GRAD_H && p.x > 100)
			.sort((a, b) => a.x - b.x).map((p) => p.t);
		const X = (x) => Math.round(boite.left + x);
		const Y = (y) => Math.round(boite.top + y);

		for (const [i, vue] of VUES.entries()) {
			console.log(`Vue ${vue.nom}`);
			await ev(`sessionStorage.setItem('etat', ${JSON.stringify(JSON.stringify({ fenetre: vue.f, suivi: false }))})`);
			await cdp('Page.reload');
			await attendre(300);
			await pret();
			await envoyer({ type: 'voies', voies: VOIES });
			await envoyer({ type: 'restaure', etat: CAPTURE });
			await attendre(250);
			if (i === 0) boite = await ev(`(() => { const c = document.getElementById('trace'); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })()`);
			const vu = await releve();
			const g = graduations(vu);
			check(g.length >= 5, `${vue.nom} : la règle porte ses graduations`, g.join(' | '));
			check(new Set(g).size === g.length, `${vue.nom} : aucune étiquette répétée`, g.join(' | '));
			const unites = g.map((t) => / (s|ms|µs|ns)$/.exec(t)?.[1]);
			check(unites.slice(i === 0 ? 1 : 0).every((u) => u === vue.unite), `${vue.nom} : graduations en ${vue.unite}`, g.join(' | '));
			if (i === 0) {
				check(/^12[.,]\d{4,} s$/.test(g[0] ?? '') && g.slice(1).every((t) => /^\+\d+ µs$/.test(t)),
					'600 µs à 12 s : la première donne l’instant entier, les autres leur écart (« +50 µs »)', g.join(' | '));

				// `--image=<dossier>` : photo de la vue, pour l'œil.
				const dossierImage = process.argv.find((a) => a.startsWith('--image='))?.slice('--image='.length);
				if (dossierImage) {
					const png = await cdp('Page.captureScreenshot', { format: 'png' });
					writeFileSync(join(dossierImage, 'regle-600us-a-12s.png'), Buffer.from(png.result.data, 'base64'));
				}

				// Réticule : la VRAIE souris au milieu du tracé, son instant écrit à la précision d'un pixel.
				await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(boite.w / 2), y: Y(150), buttons: 0 });
				await attendre(150);
				const vuR = await releve();
				const textes = vuR.filter((p) => p.quoi === 'texte').map((p) => p.t);
				const instant = textes.find((t) => /^12[.,]\d+ s$/.test(t) && !g.includes(t));
				check(!!instant && /^12[.,]\d{6,} s$/.test(instant), 'réticule : l’instant garde ses chiffres utiles (≥ 6 décimales de seconde)', instant ?? `absent (${textes.filter((t) => / s$/.test(t)).join(' | ')})`);
				await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(boite.w - 2), y: Y(boite.h + 40), buttons: 0 });

				// Cases des bits : le fond pâle de chaque « 0 »/« 1 », de gauche à droite.
				const bits = vu.filter((p) => p.quoi === 'texte' && /^[01]$/.test(p.t));
				// La plus étroite des cases pâles qui contiennent le chiffre : celle du
				// bit, pas celle de l'octet de la ligne voisine.
				const cases = bits.map((b) => vu.filter((r) => r.quoi === 'rect' && r.a > 0.1 && r.a < 0.5 && b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h + 4)
					.sort((a, c) => a.w - c.w)[0])
					.filter(Boolean).sort((a, b) => a.x - b.x);
				const trous = [];
				for (let k = 0; k + 1 < cases.length; k++) trous.push(cases[k + 1].x - (cases[k].x + cases[k].w));
				check(cases.length >= 6, 'témoin : les bits de l’adresse sont écrits dans leur case', `${cases.length} cases`);
				check(trous.length > 0 && trous.every((d) => d > -1.5 && d < 3), 'bits 1-Wire : chaque case va jusqu’au creux du bit suivant, sans trou',
					trous.map((d) => d.toFixed(1)).join(" "));
			}
		}
		const erreurs = await ev(`(window.__erreurs || []).join(' | ')`);
		check(!erreurs, 'aucune erreur dans la page', erreurs);
	} catch (e) {
		check(false, 'le banc a planté', e?.stack ?? String(e));
	} finally {
		try { ws?.close(); } catch { /* fermé */ }
		proc.kill();
	}
}

console.log(echecs.length ? `\n${echecs.length} échec(s) sur ${ok + echecs.length} contrôles.` : `\nTout est vert (${ok} contrôles).`);
process.exit(echecs.length ? 1 : 0);
