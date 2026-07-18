// Test de régression : le dessin d'un composant ne doit PAS bouger quand la
// simulation démarre (apparition du contrôle simControl). Reproduit le banc
// d'applyRotation (editor.mts) : .part__body tourné avec transform-origin
// center — si le contrôle participait au flux, sa hauteur déplaçait le centre
// de rotation et tout composant tourné/retourné se décalait à l'écran
// (constaté sur le capteur de son pivoté, v2026.7.98 ; jusqu'à 115 px sur un
// DHT22 à 180°). Le contrôle est désormais posé HORS FLUX (absolu sous le
// dessin, cf. sim-control-styles.mts) : delta attendu (0,0) partout.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-simshift');

const entry = `
import '../../src/webview/composants/small-sound-sensor-element.mjs';
import '../../src/webview/composants/dht22-element.mjs';
import '../../src/webview/composants/hc-sr04-element.mjs';
import '../../src/webview/composants/heart-beat-sensor-element.mjs';
import '../../src/webview/composants/ntc-temperature-sensor-element.mjs';
import '../../src/webview/composants/flame-sensor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CASES = [
	['kablix-small-sound-sensor', 90],
	['kablix-small-sound-sensor', 0],
	['kablix-dht22', 180],
	['kablix-hc-sr04', 45],
	['kablix-heart-beat-sensor', 90],
	['kablix-ntc-temperature-sensor', 270],
	['kablix-flame-sensor', 90],
];
async function run() {
	const results = [];
	for (const [tag, deg] of CASES) {
		const part = document.createElement('div');
		part.style.cssText = 'position:absolute;left:60px;top:60px';
		const body = document.createElement('div');
		body.style.cssText = 'position:relative;transform-origin:center center;transform:rotate(' + deg + 'deg)';
		const el = document.createElement(tag);
		body.appendChild(el); part.appendChild(body); document.body.appendChild(part);
		try { if (el.updateComplete) await el.updateComplete; } catch (e) {}
		await wait(30);
		const svgOf = () => (el.shadowRoot.querySelector('svg') || el.shadowRoot.querySelector('.frame'));
		const r1 = svgOf().getBoundingClientRect();
		el.setAttribute('simulating', '');
		if (el.simulating !== undefined) el.simulating = true;
		try { if (el.updateComplete) await el.updateComplete; } catch (e) {}
		await wait(30);
		const r2 = svgOf().getBoundingClientRect();
		// v2026.7.109 : le contrôle doit être PAR-DESSUS le dessin (chevauchement
		// vertical), plus en dessous.
		const ctl = el.shadowRoot.querySelector('.sim-control');
		const cr = ctl ? ctl.getBoundingClientRect() : null;
		const overlaps = !!cr && cr.top < r2.bottom && cr.bottom > r2.top &&
			cr.left < r2.right && cr.right > r2.left;
		results.push({ tag, deg, dx: +(r2.left - r1.left).toFixed(3), dy: +(r2.top - r1.top).toFixed(3),
			hasControl: !!ctl, overlaps });
		part.remove();
	}
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(results);
	document.body.appendChild(out);
}
run();
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body style="margin:0"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([^<]+)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1]);
let fail = 0;
for (const r of rows) {
	const ok = Math.abs(r.dx) < 0.01 && Math.abs(r.dy) < 0.01 && r.hasControl && r.overlaps;
	if (!ok) fail++;
	console.log(`${ok ? '✅' : '❌'} ${r.tag} rot ${r.deg}° : delta (${r.dx}, ${r.dy}) px, contrôle ${r.hasControl ? 'affiché' : 'ABSENT'}${r.overlaps ? ' sur le dessin' : ' PAS SUR LE DESSIN'}`);
}
console.log(fail ? `simshift : ${fail} échec(s).` : 'simshift : le dessin ne bouge pas au lancement de la simulation.');
process.exit(fail ? 1 : 0);
