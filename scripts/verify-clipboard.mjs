// Copier/coller d'un schéma d'un atelier Kablix à un AUTRE (v2026.7.196).
//
// Le presse-papier ne transporte qu'UN texte : la copie reste donc le SVG de la
// sélection (comportement conservé — Inkscape, éditeur de texte…) et le schéma
// voyage DEDANS, dans une balise <metadata> que tout afficheur SVG ignore.
// Deux ateliers = deux webviews, chacune avec son presse-papier interne : seul
// le presse-papier du SYSTÈME leur est commun, d'où l'aller-retour avec l'hôte
// VS Code quand `navigator.clipboard` est refusé à la webview.
//
// Ce banc éprouve :
//  1. le codec (clipboard.mts) sur de VRAIES données, en Node : aller-retour,
//     échappement XML, textes étrangers refusés, fils orphelins écartés ;
//  2. le câblage des trois fichiers qui doivent bouger ensemble (editor.mts,
//     sim.mts, panel.ts) — un message posté sans `case` en face serait ignoré
//     en silence, et le collage retomberait sans bruit sur le presse-papier
//     interne (donc « ça ne colle rien d'un projet à l'autre ») ;
//  3. le parcours complet en Chrome headless sur DEUX vrais éditeurs : copie
//     dans A → collage dans B, par l'API du navigateur PUIS par l'hôte.
//
// Usage : node scripts/verify-clipboard.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-clipboard');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Le codec, en Node, sur de vraies données
// ---------------------------------------------------------------------------
const codecFile = join(CACHE, 'clipboard.mjs');
await esbuild({
  entryPoints: [join(ROOT, 'src', 'webview', 'diagram', 'clipboard.mts')],
  outfile: codecFile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const C = await import(pathToFileURL(codecFile).href);

const payload = {
  parts: [
    { id: 'led-1', type: 'led', x: 100, y: 200, attrs: { color: 'red' }, rotation: 90, flipH: true },
    { id: 'r-1', type: 'resistor', x: 300, y: 200, attrs: { value: '220' } },
  ],
  wires: [
    { id: 'w-1', a: { partId: 'led-1', pin: 'A' }, b: { partId: 'r-1', pin: '1' },
      points: [{ x: 150, y: 150 }], color: 'green' },
    // Fil implicite d'enfichage : il DOIT voyager avec la copie, sinon une carte
    // copiée avec son socle arriverait électriquement morte dans l'autre projet.
    { id: 'w-2', a: { partId: 'led-1', pin: 'C' }, b: { partId: 'r-1', pin: '2' }, auto: true },
  ],
};
const encoded = C.encodeClipboard(payload);
const back = C.extractClipboard(`${C.CLIPBOARD_TAG}:${encoded}`);
ok('codec : aller-retour fidèle (composants, attributs, rotation, miroir)',
  JSON.stringify(back?.parts) === JSON.stringify(payload.parts),
  JSON.stringify(back?.parts));
ok('codec : les fils suivent, points et couleur compris',
  JSON.stringify(back?.wires?.[0]) === JSON.stringify(payload.wires[0]),
  JSON.stringify(back?.wires?.[0]));
ok('codec : le fil implicite d’enfichage (auto) est conservé',
  back?.wires?.[1]?.auto === true && back.wires.length === 2, JSON.stringify(back?.wires?.[1]));

// Échappement : un attribut contenant <, > ou & ne doit JAMAIS ressortir tel
// quel dans le SVG (il casserait le document), mais revenir intact au collage.
const hostile = {
  parts: [{ id: 'p1', type: 'led', x: 0, y: 0, attrs: { label: '<a & b> "c"' } }],
  wires: [],
};
const hostileEnc = C.encodeClipboard(hostile);
ok('codec : <, > et & échappés dans le texte encodé (SVG non cassé)',
  !/[<>&]/.test(hostileEnc), hostileEnc);
ok('codec : la valeur d’origine revient intacte après relecture',
  C.extractClipboard(`${C.CLIPBOARD_TAG}:${hostileEnc}`)?.parts[0].attrs.label === '<a & b> "c"');

// Un texte quelconque ne colle RIEN (le collage retombe sur le presse-papier interne).
ok('codec : texte quelconque refusé', C.extractClipboard('bonjour tout le monde') === null);
ok('codec : SVG sans métadonnées Kablix refusé',
  C.extractClipboard('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>') === null);
ok('codec : charge utile tronquée refusée (pas d’exception)',
  C.extractClipboard(`${C.CLIPBOARD_TAG}:{"kablix":"${C.CLIPBOARD_TAG}","parts":[{"id"`) === null);
ok('codec : entrée vide / non texte refusée',
  C.extractClipboard('') === null && C.extractClipboard(undefined) === null);
// Fil dont une extrémité n'est pas dans la copie : écarté (sinon fil fantôme).
const orphan = C.extractClipboard(`${C.CLIPBOARD_TAG}:` + C.encodeClipboard({
  parts: [{ id: 'p1', type: 'led', x: 0, y: 0 }],
  wires: [{ id: 'w', a: { partId: 'p1', pin: 'A' }, b: { partId: 'absent', pin: 'X' } }],
}));
ok('codec : fil dont une extrémité manque écarté', orphan?.wires.length === 0, JSON.stringify(orphan));

// Insertion dans le SVG : la balise entre DANS la racine (après <svg …>), le
// document reste entier et l'en-tête XML intact.
const svgSample = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">\n<rect/>\n</svg>';
const svgWith = C.embedClipboardInSvg(svgSample, encoded);
ok('SVG : la balise <metadata> est posée DANS la racine (après <svg …>)',
  svgWith.indexOf('<metadata') > svgWith.indexOf('<svg ') &&
  svgWith.indexOf('<metadata') < svgWith.indexOf('</svg>'));
ok('SVG : en-tête XML et contenu d’origine préservés',
  svgWith.startsWith('<?xml version="1.0"') && svgWith.includes('<rect/>') && svgWith.trimEnd().endsWith('</svg>'));
ok('SVG : le schéma se relit depuis le SVG complet',
  JSON.stringify(C.extractClipboard(svgWith)?.parts) === JSON.stringify(payload.parts));

// ---------------------------------------------------------------------------
// 2. Câblage des fichiers (un maillon manquant = collage muet)
// ---------------------------------------------------------------------------
const editor = read('src/webview/diagram/editor.mts');
const sim = read('src/webview/sim.mts');
const panel = read('src/panel.ts');
const i18n = read('src/webview/i18n.mts');

ok('editor : Ctrl+V passe par le presse-papier SYSTÈME (pas seulement l’interne)',
  /k === 'v'[\s\S]{0,400}pasteFromSystem\(\)/.test(editor));
ok('editor : la copie embarque le schéma dans le SVG',
  /copyAsVectorImage\(\s*embedClipboardInSvg\(/.test(editor));
ok('editor : les fils auto entrent dans la copie (plus de filtre !w.auto)',
  /const wires = this\.diagram\.wires\.filter\(\(w\) => ids\.has\(w\.a\.partId\) && ids\.has\(w\.b\.partId\)\)/.test(editor));
ok('editor : un fil auto collé n’est pas tracé',
  /if \(!nw\.auto\) this\.drawWire\(nw\)/.test(editor.slice(editor.indexOf('private insertPayload'))));
ok('editor : décalage de collage aligné sur la grille',
  /const PASTE_OFFSET = 2 \* GRID;/.test(editor));
ok('editor : type de composant inconnu ignoré, pas d’exception',
  /knownPartType/.test(editor) && /catch \{\s*return false;/.test(editor));
ok('editor : les deux crochets de presse-papier hôte sont déclarés',
  /onClipboardWrite: \(\(text: string\) => void\)/.test(editor) &&
  /onClipboardRead: \(\(\) => Promise<string \| null>\)/.test(editor));
ok('sim : les deux crochets sont branchés sur l’hôte',
  /editor\.onClipboardWrite = /.test(sim) && /editor\.onClipboardRead = /.test(sim));
ok('sim : demande de lecture postée avec un identifiant',
  /postMessage\(\{ type: 'clipboardRead', id \}\)/.test(sim));
ok('sim : réponse clipboardText traitée (sinon la promesse reste en suspens)',
  /case 'clipboardText'/.test(sim));
ok('sim : garde-fou anti-blocage si l’hôte ne répond pas',
  /setTimeout\([\s\S]{0,200}resolve\(null\)/.test(sim));
ok('panel : lecture du presse-papier système par l’extension',
  /case 'clipboardRead'[\s\S]{0,300}vscode\.env\.clipboard\.readText\(\)/.test(panel) &&
  /type: 'clipboardText'/.test(panel));
ok('panel : écriture de repli du presse-papier système',
  /case 'clipboardWrite'[\s\S]{0,200}vscode\.env\.clipboard\.writeText\(msg\.text\)/.test(panel));
ok('i18n : l’astuce des raccourcis annonce le collage entre projets (FR)',
  /copy \/ paste, from one project to another too[\s\S]{0,120}d’un projet à l’autre/.test(i18n));

// ---------------------------------------------------------------------------
// 3. Deux VRAIS éditeurs en Chrome headless : copie dans A, collage dans B
// ---------------------------------------------------------------------------
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

// Presse-papier système simulé : c'est ce que partagent deux webviews. La
// dernière écriture est gardée dans system.done — sous --virtual-time-budget,
// les minuteries sautent en avant alors que la lecture d'un Blob, elle, prend
// du temps réel : attendre « un peu » ne prouverait rien.
const system = { text: '', done: Promise.resolve() };
Object.defineProperty(Navigator.prototype, 'clipboard', {
	configurable: true,
	value: {
		write: (items) => {
			system.done = (async () => {
				for (const it of items) {
					if (it.types.includes('text/plain')) system.text = await (await it.getType('text/plain')).text();
				}
			})();
			return system.done;
		},
		writeText: (t) => {
			system.text = t;
			return Promise.resolve();
		},
		readText: async () => system.text,
	},
});

function makeEditor(suffix) {
	return new Editor(
		document.getElementById('canvas' + suffix),
		document.getElementById('palette' + suffix),
		document.getElementById('wires' + suffix),
		document.getElementById('inspector' + suffix)
	);
}
const key = (k, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));

async function run() {
	// --- Atelier A : deux composants, un fil visible, un fil d'enfichage -------
	const a = makeEditor('A');
	const led = a.addPart('led', 100, 100);
	const res = a.addPart('resistor', 300, 100);
	await wait(80);
	a.addWire({ partId: led.id, pin: 'A' }, { partId: res.id, pin: '1' }, { points: [{ x: 200, y: 60 }], color: 'green' });
	a.diagram.wires.push({ id: 'w-auto', a: { partId: led.id, pin: 'C' }, b: { partId: res.id, pin: '2' }, auto: true });
	a.redrawWires();
	await wait(40);

	// Ctrl+A puis Ctrl+C : les VRAIS raccourcis de l'éditeur.
	key('a', { ctrlKey: true });
	key('c', { ctrlKey: true });
	await system.done;
	await wait(40);
	ok('copie : le presse-papier système reçoit un SVG', /^<\\?xml|<svg/.test(system.text.trim()), system.text.slice(0, 40));
	ok('copie : le SVG est bien formé (analysé sans erreur)',
		!new DOMParser().parseFromString(system.text, 'image/svg+xml').querySelector('parsererror'),
		(new DOMParser().parseFromString(system.text, 'image/svg+xml').querySelector('parsererror')?.textContent || '').slice(0, 120));
	const meta = new DOMParser().parseFromString(system.text, 'image/svg+xml').querySelector('metadata#kablix-clipboard');
	ok('copie : le schéma est caché dans <metadata id="kablix-clipboard">', !!meta, meta ? 'présent' : 'absent');
	ok('copie : le dessin est toujours là (le SVG reste collable ailleurs)',
		system.text.includes('</svg>') && system.text.length > 500, system.text.length + ' caractères');

	// Ctrl+V est bien câblé sur le collage système (espion sur la méthode).
	let called = 0;
	const real = a.pasteFromSystem.bind(a);
	a.pasteFromSystem = async () => { called++; };
	key('v', { ctrlKey: true });
	await wait(20);
	a.pasteFromSystem = real;
	ok('raccourci : Ctrl+V déclenche le collage depuis le presse-papier système', called === 1, 'appels=' + called);

	// --- Atelier B : autre éditeur, autre presse-papier interne ---------------
	const b = makeEditor('B');
	await wait(40);
	ok('atelier B : vide au départ', b.diagram.parts.length === 0);
	await b.pasteFromSystem();
	await wait(120);
	ok('collage : les 2 composants copiés dans A arrivent dans B',
		b.diagram.parts.length === 2, b.diagram.parts.length + ' composant(s)');
	ok('collage : les types sont conservés',
		b.diagram.parts.map((p) => p.type).sort().join(',') === 'led,resistor',
		b.diagram.parts.map((p) => p.type).join(','));
	ok('collage : les attributs voyagent (valeur de la résistance)',
		!!b.diagram.parts.find((p) => p.type === 'resistor')?.attrs?.value,
		JSON.stringify(b.diagram.parts.find((p) => p.type === 'resistor')?.attrs));
	ok('collage : identifiants NEUFS (aucun conflit avec l’atelier d’origine)',
		b.diagram.parts.every((p) => p.id !== led.id && p.id !== res.id));
	const bLed = b.diagram.parts.find((p) => p.type === 'led');
	ok('collage : décalé d’un cran de grille (20 px), broches toujours enfichables',
		bLed.x === led.x + 20 && bLed.y === led.y + 20 && bLed.x % 10 === 0,
		bLed.x + ',' + bLed.y);
	ok('collage : les 2 fils suivent, rattachés aux COPIES',
		b.diagram.wires.length === 2 &&
		b.diagram.wires.every((w) => b.diagram.parts.some((p) => p.id === w.a.partId) &&
			b.diagram.parts.some((p) => p.id === w.b.partId)),
		b.diagram.wires.length + ' fil(s)');
	ok('collage : le fil d’enfichage reste implicite (non tracé)',
		b.diagram.wires.filter((w) => w.auto).length === 1 &&
		document.getElementById('wiresB').querySelectorAll('path.wire').length === 1,
		document.getElementById('wiresB').querySelectorAll('path.wire').length + ' tracé(s)');
	ok('collage : l’atelier d’origine n’a pas bougé', a.diagram.parts.length === 2);

	// --- Deuxième collage de la même copie : décalage cumulé (pas d'empilement)
	await b.pasteFromSystem();
	await wait(80);
	const stacked = b.diagram.parts.filter((p) => p.type === 'led');
	ok('collage : un 2e Ctrl+V ne repose pas la copie au MÊME endroit',
		stacked.length === 2 && stacked[0].x !== stacked[1].x, stacked.map((p) => p.x).join(' / '));

	// --- Repli par l'hôte VS Code : navigator.clipboard refusé ----------------
	const c = makeEditor('C');
	c.onClipboardRead = async () => system.text;
	Object.defineProperty(Navigator.prototype, 'clipboard', {
		configurable: true,
		value: { readText: async () => { throw new Error('NotAllowedError'); } },
	});
	await c.pasteFromSystem();
	await wait(120);
	ok('repli hôte : collage possible même si la webview n’a pas le droit de lire',
		c.diagram.parts.length === 2, c.diagram.parts.length + ' composant(s)');

	// --- Texte étranger : on ne colle rien (et rien ne casse) -----------------
	const before = c.diagram.parts.length;
	const svgOfA = system.text; // la copie valide, gardée pour le test suivant
	c.onClipboardRead = async () => 'un texte copié ailleurs';
	await c.pasteFromSystem();
	await wait(40);
	ok('texte étranger : rien n’est collé', c.diagram.parts.length === before, c.diagram.parts.length);

	// --- Simulation en cours : le collage est verrouillé ----------------------
	c.setLocked(true);
	c.onClipboardRead = async () => svgOfA; // copie valide, mais édition interdite
	await c.pasteFromSystem();
	await wait(40);
	ok('simulation : aucun collage pendant la simulation (édition verrouillée)',
		c.diagram.parts.length === before, c.diagram.parts.length);
	c.setLocked(false);

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
	document.body.appendChild(out);
});
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const bundle = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text' }, absWorkingDir: ROOT,
});
const css = read('media/styles.css');
const zone = (s) =>
  `<div class="workshop"><aside id="palette${s}" class="palette"></aside>` +
  `<div id="canvas${s}" class="canvas" style="width:700px;height:400px"><svg id="wires${s}" class="wires"></svg></div>` +
  `<aside id="inspector${s}" class="inspector"></aside></div>`;
writeFileSync(
  join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
  zone('A') + zone('B') + zone('C') +
  `<script>${bundle.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
  console.log('Chrome introuvable — partie navigateur sautée');
} else {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--window-size=1400,1400', '--virtual-time-budget=15000', '--dump-dom',
    `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) {
    ok('navigateur : mesures introuvables (page en échec)', false);
  } else {
    const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    for (const r of rows) checks.push(r);
  }
}

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail
  ? `clipboard : ${fail} échec(s).`
  : `clipboard : ${checks.length} contrôles OK — copier/coller d'un schéma à l'autre.`);
process.exit(fail ? 1 : 0);
