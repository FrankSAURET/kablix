// Extrait l'icône « grille » de la planche media/icones.svg vers media/grille.svg,
// sur le modèle des autres icônes de la barre (aide.svg, recentrer.svg…).
// Le groupe id="grille" est nommé par Frank dans la planche ; on le sort avec
// les <defs> qu'il référence (dégradés), puis on recadre le viewBox sur son
// contenu et on purge les résidus Inkscape (l'icône part dans une url() CSS).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'media', 'icones.svg'), 'utf8');

// Découpe + recadrage faits par le DOM de Chrome : la planche est un document
// Inkscape (groupes imbriqués, <g/> auto-fermants), qu'un découpage à la main
// par indexOf('</g>') ne sait pas équilibrer correctement.
const probe = join(ROOT, 'node_modules', '.cache-icon.html');
writeFileSync(probe,
	`<!doctype html><meta charset=utf8><body style="margin:0">` +
	// visibility:hidden et non display:none — getBBox() d'un sous-arbre non
	// rendu renvoie une boîte NULLE, le recadrage serait faux.
	`<div id="src" style="position:absolute;visibility:hidden">${src.replace(/<\?xml[^>]*\?>/, '')}</div>` +
	`<pre id="out"></pre><script>
	const doc = document.getElementById('src');
	const g = doc.querySelector('#grille');
	const bb = g.getBBox();
	// <defs> réellement référencées par l'icône (dégradés des traits), en
	// suivant les chaînes d'héritage xlink:href entre dégradés.
	const want = new Set();
	const scan = (el) => {
		for (const a of el.attributes || []) {
			const m = /url\\(#([^)"'\\s]+)\\)/.exec(a.value || '');
			if (m) want.add(m[1]);
		}
		for (const c of el.children) scan(c);
	};
	scan(g);
	const defs = [];
	const seen = new Set();
	for (let pass = 0; pass < 6; pass++) {
		for (const id of [...want]) {
			if (seen.has(id)) continue;
			const d = doc.querySelector('[id="' + id + '"]');
			if (!d) continue;
			seen.add(id);
			defs.push(d.outerHTML);
			const href = d.getAttribute('xlink:href') || d.getAttribute('href');
			if (href && href.startsWith('#')) want.add(href.slice(1));
		}
	}
	document.getElementById('out').textContent = JSON.stringify({
		bbox: [bb.x, bb.y, bb.width, bb.height],
		group: g.outerHTML,
		defs,
	});
	</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
	.find((p) => { try { readFileSync(p); return true; } catch { return false; } });
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', `file:///${probe.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const raw = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!raw || !raw[1].trim()) throw new Error('extraction non mesurée (voir .cache-icon.html)');
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const data = JSON.parse(dec(raw[1]));

// Purge des résidus Inkscape : l'icône part dans une url() CSS, elle doit être
// du SVG autonome et bien formé (préfixes sodipodi:/inkscape: non déclarés).
const strip = (s) =>
	s.replace(/\s(?:sodipodi|inkscape):[\w-]+="[^"]*"/g, '')
	 .replace(/<(?:sodipodi|inkscape):[^>]*\/>/g, '')
	 .replace(/<(?:sodipodi|inkscape):[\s\S]*?<\/(?:sodipodi|inkscape):[^>]*>/g, '');

const body = (data.defs.length ? `<defs>${strip(data.defs.join(''))}</defs>` : '') + strip(data.group);
const [bx, by, bw, bh] = data.bbox;
const PAD = 1;
const vb = [bx - PAD, by - PAD, bw + 2 * PAD, bh + 2 * PAD].map((v) => Math.round(v * 100) / 100);

const out =
	`<?xml version="1.0" encoding="UTF-8"?>\n` +
	`<!-- Icône « grille » extraite de media/icones.svg (dessin de Frank). -->\n` +
	`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"\n` +
	`     width="16" height="16" viewBox="${vb.join(' ')}">\n${body}\n</svg>\n`;
writeFileSync(join(ROOT, 'media', 'grille.svg'), out);
console.log('media/grille.svg écrit — viewBox', vb.join(' '), '| defs', data.defs.length);
