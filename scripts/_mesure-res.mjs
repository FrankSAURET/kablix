// Diagnostic : encombrement RÉEL du dessin de la résistance, pose couchée ('h')
// et pose debout ('v'). Mesure dans Chrome headless — la boîte déclarée par
// l'élément (svg racine), l'union des tracés (ce qu'on VOIT) et la position des
// broches, le tout ramené au zoom 1. Sort aussi une capture PNG des deux poses
// côte à côte (×4), pour juger de l'écrasement à l'œil.
// Sert à régler le raccourci de la pose debout (v2026.8.71 : 53 px de haut de
// dessin ramenés à 26,5 — « 60 × 30 » devenu « 30 × 30 » sur la grille).
// Usage : node scripts/_mesure-res.mjs [chemin/de/la/capture.png]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-mesure-res');
const PNG = process.argv[2] ? process.argv[2].replace(/\\/g, '/') : join(CACHE, 'res.png');
const ZOOM = 4; // agrandissement de la capture : les mesures le divisent

const entry = `
import { ResistorElement } from '../../src/webview/composants/resistor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ZOOM = ${ZOOM};

async function mesure(orientation, left) {
	const el = document.createElement('kablix-resistor');
	el.setAttribute('value', '220');
	el.setAttribute('orientation', orientation);
	const host = document.createElement('div');
	host.style.cssText = 'position:absolute;top:40px;left:' + left + 'px;transform:scale(' + ZOOM + ');transform-origin:0 0';
	host.appendChild(el);
	document.body.appendChild(host);
	await el.updateComplete;
	await wait(100);
	const root = el.shadowRoot.querySelector('svg');
	const box = root.getBoundingClientRect();
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const n of root.querySelectorAll('path,rect,circle,use,line,polygon,ellipse')) {
		const r = n.getBoundingClientRect();
		if (!r.width && !r.height) continue;
		x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
		x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
	}
	const px = (v) => +(v / ZOOM).toFixed(2);
	return {
		orientation,
		boite: [px(box.width), px(box.height)],
		dessin: [px(x1 - x0), px(y1 - y0)],
		// coin haut-gauche du dessin, relatif au coin de la boîte
		offset: [px(x0 - box.left), px(y0 - box.top)],
		pins: el.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y),
	};
}

async function run() {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.style.cssText = 'position:absolute;left:0;top:340px;font:12px monospace';
	try {
		out.textContent = JSON.stringify([await mesure('h', 40), await mesure('v', 420)]);
	} catch (e) {
		out.textContent = JSON.stringify({ err: String(e && e.stack).slice(0, 600) });
	}
	document.body.appendChild(out);
}
run();
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' }, absWorkingDir: ROOT,
});
writeFileSync(
	join(CACHE, 'p.html'),
	'<!doctype html><meta charset=utf8><body style="margin:0;background:#fff">'
	+ `<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const url = `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`;
const flags = ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=10000'];
const dom = execFileSync(chrome, [...flags, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
execFileSync(chrome, [...flags, '--window-size=800,400', `--screenshot=${PNG}`, url], { stdio: 'ignore' });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log(JSON.stringify(res, null, 1));
console.log('capture :', PNG);
