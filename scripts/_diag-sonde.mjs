// Diagnostic : géométrie rendue de la sonde logique (tige/crochet + pastille).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diagsonde');

const entry = `
import { SondeLogiqueElement } from '../../src/webview/composants/sonde-logique-element.mjs';
const el = document.createElement('kablix-sonde-logique');
el.setAttribute('voie', '0');
document.body.appendChild(el);
setTimeout(() => {
	const r = el.shadowRoot;
	const svg = r.querySelector('svg');
	const inner = svg.querySelector('svg') || svg;
	const out = [];
	const tige = r.querySelector('#path944');
	const bb = tige && tige.getBBox();
	const ctm = tige && tige.getCTM();
	out.push(['tige bbox local', bb && JSON.stringify({x:bb.x,y:bb.y,w:bb.width,h:bb.height})]);
	out.push(['tige style', tige && tige.getAttribute('style')]);
	out.push(['tige dernier enfant', tige && (tige.parentNode.lastElementChild === tige)]);
	out.push(['tige parent id', tige && tige.parentNode.id]);
	// Position écran de la tige vs pastille (10,70) du viewBox
	const rr = tige && tige.getBoundingClientRect();
	const sr = inner.getBoundingClientRect();
	out.push(['svg rect', JSON.stringify({l:sr.left,t:sr.top,w:sr.width,h:sr.height})]);
	out.push(['tige rect', rr && JSON.stringify({l:rr.left,t:rr.top,w:rr.width,h:rr.height})]);
	// ordre des enfants du groupe g1001
	const g = r.querySelector('#g1001');
	out.push(['g1001 enfants', g && [...g.children].map(c=>c.id||c.nodeName).join(',')]);
	// Quels éléments recouvrent le point (11,68) du viewBox ?
	const px = sr.width / 80;
	for (const [vx, vy] of [[10,70],[11,69],[12,68],[13,67]]) {
		const cx = sr.left + vx*px, cy = sr.top + vy*px;
		const hits = [];
		for (const e of r.querySelectorAll('path,rect,circle,text')) {
			const b = e.getBoundingClientRect();
			if (cx>=b.left && cx<=b.right && cy>=b.top && cy<=b.bottom) hits.push(e.id||e.nodeName);
		}
		out.push(['couvre ('+vx+','+vy+')', hits.join(',')]);
	}
	const pre = document.createElement('pre'); pre.id='measures';
	pre.textContent = JSON.stringify(out);
	document.body.appendChild(pre);
}, 200);
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT });
writeFileSync(join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><body style="margin:0"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless=new','--disable-gpu','--no-sandbox','--virtual-time-budget=8000','--dump-dom',`file:///${join(CACHE,'p.html').split('\\').join('/')}`], { encoding:'utf8', maxBuffer: 64*1024*1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log(dom.slice(0,2000)); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
for (const [k,v] of rows) console.log(k.padEnd(22), v);
