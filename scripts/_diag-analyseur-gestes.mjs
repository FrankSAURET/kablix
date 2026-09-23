// Diagnostic : les défauts de l'onglet de l'analyseur signalés par Frank (23/09).
//
// Vrai HTML de l'onglet, vrai analyseur.mts, Chrome headless piloté en CDP brut
// (vraie souris pour les boutons dessinés). La simulation est remplacée par des
// salves de fronts fabriquées au rythme du programme sonde-logique-uno : D8 à
// ~2,4 kHz, D9 deux fois plus lent. On mesure les pixels de chaque piste.
//
// Usage : node scripts/_diag-analyseur-gestes.mjs [scenario]
import esbuild from 'esbuild';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-gestes-'));
const PORT = 9416;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const scenario = process.argv[2] ?? 'tous';

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
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
});
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
html = html
	.replace('</head>', `<script nonce="${nonce}">window.__msgs = []; window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(m); }, setState() {} });</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
const fichierPage = join(tmp, 'onglet.html');
writeFileSync(fichierPage, html);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const profil = join(tmp, 'profil');
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--window-size=1200,700',
	`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
let ws;
try {
	let liste = null;
	for (let i = 0; i < 40 && !liste; i++) {
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
		if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
		return r.result?.result?.value;
	};
	for (let i = 0; i < 40 && !(await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`)); i++) await attendre(250);

	// Outils de page : générateur de fronts, mesure des pistes.
	await ev(`(() => {
		const G = window.__g = { t: 0, niv: { D8: 0, D9: 0 }, prochain: { D8: 0.2, D9: 0.412 } };
		const DEMI = { D8: 0.206, D9: 0.412 };
		G.envoyer = (m) => window.postMessage(m, '*');
		G.tick = () => new Promise((r) => setTimeout(r, 0));
		/** Avance la simulation de ms, par salves de 'image' ms. */
		G.avancer = async (ms, image = 16.7, mesurer = null) => {
			const fin = G.t + ms;
			const traces = [];
			while (G.t < fin) {
				const t1 = Math.min(fin, G.t + image);
				const salves = {};
				for (const p of ['D8', 'D9']) {
					const s = [];
					while (G.prochain[p] <= t1) {
						G.niv[p] ^= 1;
						s.push(G.prochain[p], G.niv[p]);
						// Horloge lente : un front toutes les 100 ms environ.
						G.prochain[p] += DEMI[p] * (G.lent ? 500 : 1);
					}
					if (s.length) salves[p] = s;
				}
				G.t = t1;
				G.envoyer({ type: 'fronts', salves });
				await G.tick();
				if (mesurer) { G.envoyer({ type: 'repeindre' }); await G.tick(); traces.push(G.mesure()); }
			}
			return traces;
		};
		/** Pixels peints sur les rangées haute et basse de chaque piste. */
		G.mesure = () => {
			const c = document.getElementById('trace');
			const ctx = c.getContext('2d');
			const w = c.width;
			const res = [];
			for (let i = 0; i < 2; i++) {
				const haut = 22 + i * 60;
				const compte = (y) => {
					const d = ctx.getImageData(106, y - 1, w - 106 - 14, 3).data;
					let n = 0;
					for (let k = 3; k < d.length; k += 4) if (d[k] > 60) n++;
					return n;
				};
				res.push({ h: compte(haut + 12), b: compte(haut + 34), m: compte(haut + 23) });
			}
			return res;
		};
		G.repeindre = async () => { G.envoyer({ type: 'repeindre' }); await G.tick(); return G.mesure(); };
		G.voies = () => G.envoyer({ type: 'voies', voies: [
			{ voie: 0, nom: 'horloge', pin: 'D8', probleme: null, analogique: false },
			{ voie: 1, nom: '9', pin: 'D9', probleme: null, analogique: false },
		] });
		G.zone = (voie, quoi) => {
			// Relu du rendu : colonne de gauche, rangée de boutons sous le nom.
			const i = voie; const haut = 22 + i * 60; const y = haut + 15 + 8;
			const x = 8 + ({ teinte: 0, declenchement: 1, protocole: 2 })[quoi] * 22;
			const r = document.getElementById('trace').getBoundingClientRect();
			return { x: r.left + x + 9, y: r.top + y + 9 };
		};
	})()`);

	const clic = async (x, y) => {
		const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
		await attendre(120);
	};
	/** Ouvre un bouton de voie et clique l'entrée du menu dont le texte contient `libelle`. */
	const menu = async (voie, quoi, libelle) => {
		const z = await ev(`window.__g.zone(${voie}, '${quoi}')`);
		await clic(z.x, z.y);
		const b = await ev(`(() => {
			const p = document.querySelector('.flottant');
			if (!p) return null;
			const e = [...p.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(libelle)}));
			if (!e) return { entrees: [...p.querySelectorAll('button')].map((x) => x.textContent) };
			const r = e.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		})()`);
		if (!b || b.entrees) { console.log('  menu introuvable', JSON.stringify(b)); return; }
		await clic(b.x, b.y);
	};
	/** Clic dont la souris bouge de `dx` px pendant l'appui : la main d'un humain. */
	const clicTremble = async (x, y, dx) => {
		const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
		await cdp('Input.dispatchMouseEvent', { ...base, x: base.x + dx, type: 'mouseMoved', buttons: 1 });
		await cdp('Input.dispatchMouseEvent', { ...base, x: base.x + dx, type: 'mouseReleased', buttons: 0 });
		await attendre(120);
	};
	const dire = (titre, m) => console.log(`${titre.padEnd(46)} ${m.map((p, i) => `v${i} h=${p.h} b=${p.b} m=${p.m}`).join(' | ')}`);

	await ev(`(async () => { const G = window.__g; G.voies(); G.envoyer({ type: 'depart' }); await G.tick(); await G.avancer(500); })()`);
	dire('run 500 ms, sans réglage', await ev('window.__g.repeindre()'));

	if (scenario === 'tous' || scenario === 'trig') {
		await menu(0, 'declenchement', 'Rising');
		dire('T voie 0 → front montant', await ev('window.__g.repeindre()'));
		await ev('window.__g.avancer(200)');
		dire('  + 200 ms de run', await ev('window.__g.repeindre()'));
		await menu(0, 'declenchement', 'Falling');
		dire('T voie 0 → front descendant', await ev('window.__g.repeindre()'));
		await ev('window.__g.avancer(200)');
		dire('  + 200 ms de run', await ev('window.__g.repeindre()'));
		await menu(0, 'declenchement', 'No trigger');
		dire('T voie 0 → aucun', await ev('window.__g.repeindre()'));
		await ev('window.__g.avancer(200)');
		dire('  + 200 ms de run', await ev('window.__g.repeindre()'));
		console.log('  réglages envoyés :', JSON.stringify(await ev(`window.__msgs.filter((m) => m.type === 'analyseurReglages').map((m) => m.declenchement)`)));
		console.log('  fenêtre/état :', await ev(`document.getElementById('etat').textContent`));
	}
	if (scenario === 'tous' || scenario === 'proto') {
		await menu(0, 'protocole', 'I²C');
		dire('P voie 0 → I²C', await ev('window.__g.repeindre()'));
		await ev('window.__g.avancer(200)');
		dire('  + 200 ms de run', await ev('window.__g.repeindre()'));
	}
	if (scenario === 'tous' || scenario === 'gigue') {
		// Le suivi de la fin doit tenir après un clic qui tremble. Preuve : on
		// ralentit l'horloge 300 ms (un front par ~100 ms). Vue qui suit → les
		// dix dernières ms tiennent un seul niveau ; vue figée → elle montre
		// encore l'horloge rapide d'avant (h ET b largement peints).
		const plat = async (titre, attendu = true) => {
			await ev(`(async () => { const G = window.__g; G.lent = true; await G.avancer(300); })()`);
			const m = await ev('window.__g.repeindre()');
			await ev(`(async () => { const G = window.__g; G.lent = false; await G.avancer(300); })()`);
			const suit = m.every((p) => Math.min(p.h, p.b) < 100);
			console.log(`${suit === attendu ? '✅' : '❌'} ${(suit ? 'suit ' : 'figé ') + titre.padEnd(44)} ${m.map((p, i) => `v${i} h=${p.h} b=${p.b}`).join(' | ')}`);
		};
		await plat('témoin : aucun clic');
		const z = await ev(`window.__g.zone(0, 'protocole')`);
		await clicTremble(z.x, z.y, 6);
		await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
		await plat('bouton P, souris qui tremble de 6 px');
		const r = await ev(`(() => { const r = document.getElementById('trace').getBoundingClientRect(); return { x: r.left + 500, y: r.top + 40 }; })()`);
		await clicTremble(r.x, r.y, 2);
		await plat('clic sur la trace, 2 px de tremblement');
		await clicTremble(r.x, r.y, 40);
		await plat('glissé franc de 40 px (doit figer)', false);
	}
	if (scenario === 'plafond') {
		// La vue reste sur le DÉBUT de la capture (bouton « Toute la capture » à
		// 500 ms, donc suivi coupé) pendant que le run dépasse le plafond.
		await ev(`document.getElementById('tout').click()`);
		dire('Toute la capture à 500 ms', await ev('window.__g.repeindre()'));
		for (let s = 0; s < 30; s += 2) {
			const traces = await ev(`window.__g.avancer(2000, 16.7, true)`);
			// C créneau, H/B trait haut/bas, p pointillé à mi-hauteur (niveau inconnu).
			const sig = (p) => (p.h > 0 && p.b > 0 ? 'C' : p.h > 0 ? 'H' : p.b > 0 ? 'B' : p.m > 0 ? 'p' : '-');
			const v0 = traces.map((m) => sig(m[0])).join('');
			const v1 = traces.map((m) => sig(m[1])).join('');
			console.log(`t=${(await ev('window.__g.t')).toFixed(0).padStart(6)} v0 ${v0.slice(0, 50)}  v1 ${v1.slice(0, 50)}`);
		}
	}
	if (scenario === 'tous' || scenario === 'echant') {
		await ev(`(() => { const s = document.getElementById('horloge'); s.value = '1000'; s.dispatchEvent(new Event('change')); })()`);
		dire('échantillonnage 1 kHz', await ev('window.__g.repeindre()'));
		// Au-delà de 60 000 fronts sur D8 (≈ 12 s) puis sur D9 (≈ 25 s).
		for (let s = 0; s < 32; s += 2) {
			const traces = await ev(`window.__g.avancer(2000, 16.7, true)`);
			const plats = traces.filter((m) => m[0].h === 0 || m[0].b === 0).length;
			const plats9 = traces.filter((m) => m[1].h === 0 || m[1].b === 0).length;
			const sig = new Set(traces.map((m) => `${m[0].h}/${m[0].b}`)).size;
			console.log(`t=${(await ev('window.__g.t')).toFixed(0).padStart(6)} ms  images=${traces.length} plates v0=${plats} v1=${plats9} signatures v0=${sig}  dernière ${JSON.stringify(traces.at(-1))}`);
		}
	}
} catch (e) {
	console.log('ÉCHEC', e?.stack ?? e);
} finally {
	try { ws?.close(); } catch { /* */ }
	proc.kill();
	await attendre(300);
	try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
}
