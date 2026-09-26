// Diagnostic : l'onglet de l'analyseur qui SE FIGE (Frank, 26/09 : « les menus
// s'ouvrent mais rien ne bouge — curseurs, déclenchement, zoom, déplacement »).
//
// Vrai HTML de l'onglet, vrai analyseur.mts, Chrome headless en CDP brut. Une
// capture DMX de type dmx-uno-lib (Sig, DMX-, DMX+ sur la MÊME broche 3, trois
// décodages DMX, déclenchement START code), puis des centaines de gestes tirés
// au hasard à la VRAIE souris : molette, glissés (lâchés hors de la fenêtre
// compris), marqueurs, boutons de voie et leurs menus, barre d'outils, clavier,
// menu ☰. Un run peut défiler pendant ce temps (salves de fronts, arrêts).
//
// Après chaque geste : aucune exception dans la page, fenêtre de temps finie,
// et la vue VIVANTE (une molette de contrôle change bien la fenêtre).
//
// Usage : node scripts/_diag-analyseur-gel.mjs [graine] [gestes] [--run] [--gros=s] [--ancien=a,b]
import esbuild from 'esbuild';
import { writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-gel-'));
const PORT = 9417;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let graine = Number(args[0] ?? 1) >>> 0 || 1;
const NB = Number(args[1] ?? 400);
const RUN = process.argv.includes('--run');
/** Hasard reproductible (xorshift). */
const hasard = () => {
	graine ^= graine << 13; graine >>>= 0;
	graine ^= graine >>> 17;
	graine ^= graine << 5; graine >>>= 0;
	return graine / 4294967296;
};
const entre = (a, b) => a + hasard() * (b - a);
const parmi = (l) => l[Math.floor(hasard() * l.length)];

// --- Signal DMX (DmxSimple : BREAK 76,6 µs, 250 kbauds) ------------------------
const BIT = 0.004;
/** Fronts [t, niveau, …] d'une trame DMX de `n` canaux partant à t0. */
function trameDmx(t0, valeurs, fronts) {
	let niveau = 1;
	const poser = (t, v) => { if (v !== niveau) { fronts.push(t, v); niveau = v; } };
	let t = t0;
	poser(t, 0); t += 0.0766; // BREAK
	poser(t, 1); t += 0.012; // MAB
	for (const octet of [0, ...valeurs]) {
		const bits = [0];
		for (let b = 0; b < 8; b++) bits.push((octet >> b) & 1);
		bits.push(1, 1);
		for (const b of bits) { poser(t, b); t += BIT; }
	}
	poser(t, 1);
	return t;
}
function signal(debut, fin, periode = 3) {
	const f = [];
	let k = 0;
	for (let t = debut; t < fin; t += periode, k++) {
		const serie = Math.floor(k / 5);
		trameDmx(t, Array.from({ length: 24 }, (_, c) => (c * 37 + serie * 11) & 255), f);
	}
	return f;
}

// --- Page -------------------------------------------------------------------
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
});
const { AnalyseurPanel } = await import(pathToFileURL(sortiePanneau).href);
let html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/banc.projix');
// Contre-épreuve : `--ancien=<fichiers>` compile ces fichiers de src/webview dans leur version HEAD.
const ancien = (process.argv.find((a) => a.startsWith('--ancien=')) ?? '').slice('--ancien='.length).split(',').filter(Boolean);
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /src[\\/]webview[\\/][^\\/]+\.mts$/ }, (a) => {
			const nom = a.path.replace(/\\/g, '/').split('/').pop().replace(/\.mts$/, '');
			if (!ancien.includes(nom)) return undefined;
			const contents = execFileSync('git', ['show', `HEAD:src/webview/${nom}.mts`], { cwd: ROOT, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(a.path) };
		});
	},
};
if (ancien.length) console.log(`(contre-épreuve : ${ancien.join(', ')} en version HEAD)`);
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
let bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Sonde : chaque rendu publie la fenêtre qu'il peint.
const avantSonde = bundle;
bundle = bundle.replace(/function rendu\(\) \{/, `function rendu() {
	const debut = performance.now();
	try { return renduSonde(); } finally {
		window.__rendus = (window.__rendus || 0) + 1; window.__fen = JSON.stringify(fenetre);
		(window.__durees ||= []).push(performance.now() - debut);
	}
}
function renduSonde() {`);
if (bundle === avantSonde) throw new Error('sonde : « function rendu() » introuvable dans le bundle');
// Part du décodage dans chaque rendu.
bundle = bundle.replace(/annotations = calculerAnnotations\(\);/, 'const __da = performance.now(); annotations = calculerAnnotations(); (window.__decodes ||= []).push(performance.now() - __da);');
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
html = html
	.replace('</head>', `<script nonce="${nonce}">window.__msgs = []; window.__erreurs = [];
window.addEventListener('error', (e) => window.__erreurs.push(String(e.error?.stack || e.message)));
window.addEventListener('unhandledrejection', (e) => window.__erreurs.push('promesse : ' + String(e.reason?.stack || e.reason)));
window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(m); }, setState() {} });
window.__peint = [];
const origine = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...r) { window.__peint.push({ t: String(t), x, y }); return origine.call(this, t, x, y, ...r); };
</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
const fichierPage = join(tmp, 'onglet.html');
writeFileSync(fichierPage, html);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,800',
	`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
let ws;
let code = 0;
try {
	let liste = null;
	for (let i = 0; i < 120 && !liste; i++) {
		try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await attendre(250); }
	}
	ws = new WebSocket(liste.find((c) => c.type === 'page').webSocketDebuggerUrl);
	let id = 0;
	const attentes = new Map();
	ws.addEventListener('message', (ev) => {
		const m = JSON.parse(ev.data);
		if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
	});
	await new Promise((r) => ws.addEventListener('open', r, { once: true }));
	const cdp = (method, params = {}) => new Promise((res) => { const n = ++id; attentes.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
	const ev = async (expr) => {
		const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
		if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
		return r.result?.result?.value;
	};
	for (let i = 0; i < 120 && !(await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`)); i++) await attendre(250);

	const VOIES = [
		{ voie: 0, nom: 'Sig', pin: '3', probleme: null, analogique: false, volts: 5 },
		{ voie: 2, nom: 'DMX-', pin: '3', probleme: null, analogique: false, inverse: true, volts: 5, voltsBas: 0 },
		{ voie: 3, nom: 'DMX+', pin: '3', probleme: null, analogique: false, volts: 5 },
	];
	const post = (m) => ev(`window.postMessage(${JSON.stringify(m)}, '*')`);
	await post({ type: 'voies', voies: VOIES });
	let tRun = 0;
	const GROS = Number(/--gros=(\d+)/.exec(process.argv.join(' '))?.[1] ?? 0);
	if (GROS) {
		// Capture LONGUE comme celle de Frank (20 s de DmxSimple) : fabriquée
		// dans la page, un JSON de millions de fronts ne passerait pas le CDP.
		const n = await ev(`(() => {
			const BIT = ${BIT};
			${trameDmx.toString()}
			const f = []; let t = 10;
			for (let k = 0; t < ${GROS} * 1000; k++) { trameDmx(t, [k & 255, (k >> 3) & 255, 40], f); t += 0.27; }
			window.postMessage({ type: 'restaure', etat: {
				voies: ${JSON.stringify(VOIES)}.map((v) => ({ voie: v.voie, nom: v.nom, pin: v.pin, fronts: f, niveauInitial: 1 })),
				declenchement: { voie: 0, sens: 'dmxStart' },
				decodages: [{ protocole: 'dmx', id: 'd1', donnees: 3, base: 'dec', bits: true }, { protocole: 'dmx', id: 'd1', donnees: 0, base: 'dec' }, { protocole: 'dmx', id: 'd2', donnees: 2, base: 'dec' }],
				voiesReglages: { 2: { repos: 1 } },
			} }, '*');
			return f.length / 2;
		})()`);
		console.log(`capture longue : ${n} fronts par voie`);
		await attendre(3000);
	} else if (RUN) {
		await post({ type: 'depart' });
	} else {
		const f = signal(10, 400);
		tRun = 400;
		await post({
			type: 'restaure',
			etat: {
				voies: VOIES.map((v) => ({ voie: v.voie, nom: v.nom, pin: v.pin, fronts: f, niveauInitial: 1 })),
				declenchement: { voie: 0, sens: 'dmxStart' },
				decodages: [
					{ protocole: 'dmx', id: 'd1', donnees: 3, base: 'dec', bits: true },
					{ protocole: 'dmx', id: 'd1', donnees: 0, base: 'dec' },
					{ protocole: 'dmx', id: 'd2', donnees: 2, base: 'dec' },
				],
				voiesReglages: { 2: { repos: 1 } },
			},
		});
	}
	await attendre(300);
	const toile = JSON.parse(await ev(`JSON.stringify((() => { const r = document.getElementById('trace').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })())`));
	const X = (x) => Math.round(toile.x + x);
	const Y = (y) => Math.round(toile.y + y);
	const souris = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, ...extra });
	const clic = async (x, y) => {
		await souris('mouseMoved', x, y, { buttons: 0 });
		await souris('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 });
		await souris('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 });
	};
	const glisser = async (x0, y0, x1, y1, pas = 6) => {
		await souris('mouseMoved', x0, y0, { buttons: 0 });
		await souris('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
		for (let k = 1; k <= pas; k++) await souris('mouseMoved', Math.round(x0 + ((x1 - x0) * k) / pas), Math.round(y0 + ((y1 - y0) * k) / pas), { button: 'left', buttons: 1 });
		await souris('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 });
	};
	const touche = async (key, code, vk) => {
		await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
		await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
	};
	const bouton = async (sel) => {
		const r = JSON.parse(await ev(`JSON.stringify((() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b || b.hidden || b.disabled) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })())`));
		if (r) await clic(Math.round(r.x), Math.round(r.y));
		return !!r;
	};
	const drapeaux = async () => {
		await ev('window.__peint = []');
		await post({ type: 'repeindre' });
		await attendre(20);
		return JSON.parse(await ev(`JSON.stringify(window.__peint.filter((p) => p.t === 'M1' || p.t === 'M2'))`));
	};

	const GESTES = {
		molette: async () => {
			const x = X(entre(110, toile.w - 20)); const y = Y(entre(30, Math.min(toile.h, 400)));
			const n = 1 + Math.floor(hasard() * 8); const dy = hasard() < 0.5 ? -100 : 100;
			for (let k = 0; k < n; k++) await souris('mouseWheel', x, y, { deltaX: 0, deltaY: dy });
			return `molette ${n}×${dy} à ${x},${y}`;
		},
		glisse: async () => {
			const x0 = X(entre(110, toile.w - 20)); const y0 = Y(entre(50, Math.min(toile.h, 400)));
			const dehors = hasard() < 0.25;
			const x1 = dehors ? parmi([-30, 1300]) : X(entre(0, toile.w)); const y1 = dehors ? y0 : Y(entre(0, toile.h));
			await glisser(x0, y0, x1, y1);
			return `glissé ${x0},${y0} → ${x1},${y1}`;
		},
		marqueur: async () => {
			const d = await drapeaux();
			const m = parmi(d.length ? d : [{ t: '?', x: 20, y: 32 }]);
			const x1 = X(hasard() < 0.15 ? entre(0, 100) : entre(104, toile.w - 12));
			await glisser(X(m.x), Y(32), x1, Y(32), 8);
			return `marqueur ${m.t} ${Math.round(m.x)} → ${x1}`;
		},
		rappel: async () => { const x = X(entre(60, 104)); await clic(x, Y(32)); return `clic bande ${x}`; },
		colonne: async () => {
			const x = X(entre(4, 100)); const y = Y(entre(42, Math.min(toile.h, 450)));
			await clic(x, y);
			const n = await ev(`document.querySelectorAll('.flottant button, .flottant select, .flottant input').length`);
			let suite = '';
			if (n && hasard() < 0.8) {
				const k = Math.floor(hasard() * n);
				suite = await ev(`(() => {
					const e = document.querySelectorAll('.flottant button, .flottant select, .flottant input')[${k}];
					if (e.tagName === 'SELECT') { const o = e.options; e.selectedIndex = Math.floor(${hasard()} * o.length); e.dispatchEvent(new Event('change', { bubbles: true })); return 'select ' + e.value; }
					if (e.tagName === 'INPUT') { if (e.type === 'checkbox') { e.click(); return 'case ' + e.checked; } e.value = e.type === 'number' ? String(Math.floor(${hasard()} * 300000)) : 'x'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 'champ ' + e.value; }
					e.click(); return 'bouton ' + e.textContent.trim().slice(0, 20);
				})()`);
			}
			return `clic colonne ${x},${y} ${n} entrées ${suite}`;
		},
		barre: async () => {
			const sel = parmi(['#gauche', '#droite', '#trame-prec', '#trame-suiv', '#tout', '#suivre', '#reafficher']);
			const fait = await bouton(sel);
			return `barre ${sel}${fait ? '' : ' (indisponible)'}`;
		},
		clavier: async () => {
			const k = parmi([['ArrowLeft', 'ArrowLeft', 37], ['ArrowRight', 'ArrowRight', 39], ['Escape', 'Escape', 27]]);
			await touche(...k);
			return `touche ${k[0]}`;
		},
		exporter: async () => {
			await bouton('#menu-export');
			const e = parmi(['csv', 'copier-svg', 'svg']);
			await bouton(`#menu-export-liste button[data-export="${e}"]`);
			return `export ${e}`;
		},
		horloge: async () => {
			const v = parmi(['0', '1000000000', '1000000', '100000', '1000']);
			await ev(`(() => { const s = document.getElementById('horloge'); s.value = '${v}'; s.dispatchEvent(new Event('change')); })()`);
			return `échantillonnage ${v}`;
		},
	};
	const POIDS = [['molette', 6], ['glisse', 5], ['marqueur', 5], ['rappel', 1], ['colonne', 4], ['barre', 4], ['clavier', 2], ['exporter', 1], ['horloge', 1]];
	const tirer = () => {
		let r = hasard() * POIDS.reduce((s, [, p]) => s + p, 0);
		for (const [n, p] of POIDS) { r -= p; if (r < 0) return n; }
		return 'molette';
	};

	if (process.argv.includes('--profil')) {
		// Où passe le temps d'un rendu dézoomé sur toute la capture ?
		await cdp('Profiler.enable');
		await cdp('Profiler.setSamplingInterval', { interval: 200 });
		await cdp('Profiler.start');
		for (let k = 0; k < 5; k++) {
			await bouton('#tout');
			await ev(`new Promise((r) => { const n = window.__rendus; const t = setInterval(() => { if (window.__rendus > n) { clearInterval(t); r(); } }, 5); })`);
			await souris('mouseWheel', X(toile.w / 2), Y(80), { deltaX: 0, deltaY: -100 });
			await attendre(300);
		}
		const { result } = await cdp('Profiler.stop');
		const p = result.profile;
		const dt = (p.endTime - p.startTime) / p.samples.length / 1000;
		const parNoeud = new Map(p.nodes.map((n) => [n.id, n]));
		const soi = new Map();
		for (const s of p.samples) {
			const n = parNoeud.get(s);
			const cle = `${n.callFrame.functionName || '(anonyme)'}:${n.callFrame.lineNumber}`;
			soi.set(cle, (soi.get(cle) ?? 0) + dt);
		}
		console.log([...soi].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n'));
		const durees = (await ev('window.__durees || []')).slice(-10);
		console.log('derniers rendus :', durees.map((d) => d.toFixed(0)).join(' '));
		proc.kill();
		process.exit(0);
	}
	const journal = [];
	/** La vue répond-elle ? Une molette au centre doit changer la fenêtre peinte. */
	const vivante = async () => {
		const avant = await ev('window.__fen');
		const x = X(toile.w / 2); const y = Y(80);
		await souris('mouseWheel', x, y, { deltaX: 0, deltaY: -100 });
		await attendre(200);
		const apres = await ev('window.__fen');
		await souris('mouseWheel', x, y, { deltaX: 0, deltaY: 100 });
		await attendre(200);
		return { vivante: avant !== apres, avant, apres };
	};
	let probleme = null;
	for (let i = 0; i < NB && !probleme; i++) {
		if (RUN && hasard() < 0.5) {
			const f = signal(tRun, tRun + 15);
			tRun += 15;
			await post({ type: 'fronts', salves: { 3: f } });
			if (hasard() < 0.03) { await post({ type: 'arret' }); journal.push('— arrêt —'); }
			if (hasard() < 0.02) { await post({ type: 'depart' }); tRun = 0; journal.push('— départ —'); }
		}
		const g = tirer();
		journal.push(`${i} ${await GESTES[g]()}`);
		await attendre(40);
		const erreurs = await ev('window.__erreurs.splice(0)');
		const fen = JSON.parse((await ev('window.__fen')) ?? 'null');
		if (erreurs.length) probleme = `exception : ${erreurs[0]}`;
		else if (!fen || !Number.isFinite(fen.t0) || !Number.isFinite(fen.duree) || !(fen.duree > 0)) probleme = `fenêtre invalide : ${JSON.stringify(fen)}`;
		else if (i % 25 === 24) {
			const v = await vivante();
			if (!v.vivante) probleme = `vue figée : molette sans effet (${v.avant})`;
		}
	}
	if (!probleme) {
		const v = await vivante();
		if (!v.vivante) probleme = `vue figée en fin de course (${v.avant})`;
	}
	const durees = (await ev('window.__durees || []')).sort((a, b) => a - b);
	if (durees.length) console.log(`rendus : ${durees.length}, médiane ${durees[durees.length >> 1].toFixed(1)} ms, max ${durees[durees.length - 1].toFixed(1)} ms`);
	const decodes = (await ev('window.__decodes || []')).sort((a, b) => a - b);
	if (decodes.length) console.log(`  dont décodage : médiane ${decodes[decodes.length >> 1].toFixed(1)} ms, max ${decodes[decodes.length - 1].toFixed(1)} ms`);
	console.log(probleme ? `GEL — ${probleme}` : `aucun gel sur ${NB} gestes (graine ${args[0] ?? 1}${RUN ? ', run' : ''})`);
	if (probleme) { console.log(journal.slice(-15).join('\n')); code = 1; }
} catch (e) {
	console.log('diag interrompu :', e?.stack ?? e);
	code = 2;
} finally {
	try { ws?.close(); } catch { /* déjà fermé */ }
	proc.kill();
}
process.exit(code);
