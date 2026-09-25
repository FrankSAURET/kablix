// Diagnostic : les défauts de l'onglet de l'analyseur signalés par Frank (23/09).
//
// Vrai HTML de l'onglet, vrai analyseur.mts, Chrome headless piloté en CDP brut
// (vraie souris pour les boutons dessinés). La simulation est remplacée par des
// salves de fronts fabriquées au rythme du programme sonde-logique-uno : D8 à
// ~2,4 kHz, D9 deux fois plus lent. On mesure les pixels de chaque piste.
//
// Usage : node scripts/_diag-analyseur-gestes.mjs [tous|trig|proto|gigue|plafond|echant|fleches]
// (« fleches » : ◀ ▶, touches ← → et réaffichage des voies masquées, v2026.9.4.130.)
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
						// Horloge lente : un front toutes les 100 ms environ. G.facteur
						// ralentit moins : quelques fronts par fenêtre de 10 ms.
						G.prochain[p] += DEMI[p] * (G.lent ? 500 : G.facteur ?? 1);
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
				const haut = 42 + i * 64;
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
		/** Abscisses des fronts de la piste i : colonnes peintes à mi-hauteur, regroupées. */
		G.fronts = async (i) => {
			G.envoyer({ type: 'repeindre' }); await G.tick();
			const c = document.getElementById('trace');
			const d = c.getContext('2d').getImageData(106, 42 + i * 64 + 23, c.width - 106 - 14, 1).data;
			const xs = [];
			for (let x = 0; x < d.length / 4; x++) {
				if (d[x * 4 + 3] <= 60) continue;
				if (xs.length && x - xs.at(-1).fin <= 1) xs.at(-1).fin = x;
				else xs.push({ debut: x, fin: x });
			}
			return xs.map((s) => 106 + (s.debut + s.fin) / 2);
		};
		G.voies = () => G.envoyer({ type: 'voies', voies: [
			{ voie: 0, nom: 'horloge', pin: 'D8', probleme: null, analogique: false },
			{ voie: 1, nom: '9', pin: 'D9', probleme: null, analogique: false },
		] });
		G.zone = (voie, quoi) => {
			// Relu du rendu : colonne de gauche, rangée de boutons sous le nom.
			const i = voie; const haut = 42 + i * 64; const y = haut + 15 + 8;
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
	if (scenario === 'fleches') {
		// Flèches ◀ ▶, touches ← → et réaffichage des voies masquées (Frank,
		// 23/09), à la vraie souris et au vrai clavier. Horloge ralentie 20× :
		// deux ou trois fronts par fenêtre de 10 ms, qu'on repère à l'abscisse.
		const bilan = (ok, titre, detail = '') => console.log(`${ok ? '✅' : '❌'} ${titre}${detail ? '  ' + detail : ''}`);
		const touche = async (key, code, vk) => {
			await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
			await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
			await attendre(120);
		};
		const centre = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		const pareil = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 1.5);
		const plot = await ev(`document.getElementById('trace').clientWidth - 116`);
		await ev(`(async () => { const G = window.__g; G.facteur = 20; await G.avancer(200); })()`);
		const e0 = await ev('window.__g.fronts(0)');
		bilan(e0.length >= 2, 'témoin : des fronts visibles sur la voie 0', JSON.stringify(e0));

		const g = await centre('#gauche');
		bilan(g !== null, 'la barre porte ◀');
		if (g) await clic(g.x, g.y);
		const e1 = await ev('window.__g.fronts(0)');
		// Recul d'une demi-fenêtre : chaque front de la moitié gauche passe à
		// droite de plot/2 pixels.
		const attendus = e0.filter((x) => x + plot / 2 < 106 + plot - 2).map((x) => x + plot / 2);
		bilan(attendus.length > 0 && attendus.every((x) => e1.some((y) => Math.abs(y - x) <= 2)) && !pareil(e0, e1),
			'◀ recule d\'une demi-fenêtre', `avant ${JSON.stringify(e0)} après ${JSON.stringify(e1)} (plot ${plot})`);
		await ev('window.__g.avancer(60)');
		const e1b = await ev('window.__g.fronts(0)');
		bilan(pareil(e1, e1b), '◀ coupe le suivi : 60 ms de run ne ramènent pas la vue', JSON.stringify(e1b));

		// Chaque geste doit CHANGER la vue : sans cela, un défilement mort
		// laisserait « revenir au départ » en restant sur place.
		await touche('ArrowRight', 'ArrowRight', 39);
		const e2 = await ev('window.__g.fronts(0)');
		bilan(!pareil(e1, e2) && pareil(e0, e2), 'touche → revient à la fenêtre de départ', JSON.stringify(e2));
		const d = await centre('#droite');
		if (d) await clic(d.x, d.y);
		const eD = await ev('window.__g.fronts(0)');
		// Avance d'une demi-fenêtre : les fronts de la moitié droite passent à gauche.
		const attendusD = e0.filter((x) => x - plot / 2 > 106 + 2).map((x) => x - plot / 2);
		bilan(d !== null && attendusD.length > 0 && attendusD.every((x) => eD.some((y) => Math.abs(y - x) <= 2)) && !pareil(e0, eD),
			'▶ avance d\'une demi-fenêtre', JSON.stringify(eD));
		await touche('ArrowLeft', 'ArrowLeft', 37);
		const e3 = await ev('window.__g.fronts(0)');
		bilan(!pareil(eD, e3) && pareil(e0, e3), 'touche ← : retour exact après ▶', JSON.stringify(e3));

		// Frappe dans un champ : la flèche déplace le curseur, pas la vue.
		const z = await ev(`window.__g.zone(0, 'teinte')`);
		await clic(z.x, z.y);
		const champ = await centre('.flottant input[type=text], .flottant input:not([type])');
		if (champ) await clic(champ.x, champ.y);
		await touche('ArrowLeft', 'ArrowLeft', 37);
		const e4 = await ev('window.__g.fronts(0)');
		bilan(champ !== null && pareil(e0, e4), 'touche ← dans le champ du nom : la vue ne bouge pas', JSON.stringify(e4));
		await touche('Escape', 'Escape', 27);

		// Masquer la voie 1, puis la ramener par la barre.
		const h0 = await ev(`document.getElementById('trace').clientHeight`);
		const cache0 = await centre('#reafficher');
		bilan(cache0 === null, 'sans voie masquée, pas de bouton de réaffichage');
		const z1 = await ev(`window.__g.zone(1, 'teinte')`);
		await clic(z1.x, z1.y);
		const caseHide = await ev(`(() => { const l = [...document.querySelectorAll('.flottant label')].find((x) => x.textContent.includes('Hide')); const e = l?.querySelector('input'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		if (caseHide) await clic(caseHide.x, caseHide.y);
		await ev('window.__g.repeindre()');
		const h1 = await ev(`document.getElementById('trace').clientHeight`);
		const texte = await ev(`document.getElementById('reafficher').hidden ? null : document.getElementById('reafficher').textContent`);
		bilan(caseHide !== null && h1 < h0 && texte === 'Show hidden channels (1)', 'Hide : la piste part, le bouton paraît avec le compte', `hauteur ${h0} → ${h1}, bouton « ${texte} »`);
		const r = await centre('#reafficher');
		if (r) await clic(r.x, r.y);
		await ev('window.__g.repeindre()');
		const h2 = await ev(`document.getElementById('trace').clientHeight`);
		const cache2 = await centre('#reafficher');
		const envoi = await ev(`(() => { const m = window.__msgs.filter((x) => x.type === 'analyseurReglages').at(-1); return m?.voiesReglages?.[1]?.masquee; })()`);
		bilan(r !== null && h2 === h0 && cache2 === null && envoi === false, 'clic sur le bouton : la voie revient, le bouton s\'efface, l\'hôte le sait', `hauteur ${h2}, masquee envoyé ${envoi}`);
	}
} catch (e) {
	console.log('ÉCHEC', e?.stack ?? e);
} finally {
	try { ws?.close(); } catch { /* */ }
	proc.kill();
	await attendre(300);
	try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
}
