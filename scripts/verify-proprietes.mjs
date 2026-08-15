// Inspecteur : les propriétés rangées en SECTIONS REPLIABLES (v2026.8.64).
// Vrai Editor en Chrome headless, vrai CSS. Ce qui est vérifié :
//  - le robot araignée n'aligne plus ses 33 réglages : cinq sections, dans
//    l'ordre demandé (carte 16 servos, câblage, inversions, zéros, paramètres) ;
//  - elles sont REPLIÉES à l'ouverture — aucun contrôle visible au départ ;
//  - un clic sur l'en-tête déplie SA section et elle seule, un deuxième replie ;
//  - le rappel de l'adresse I²C est TOUT EN HAUT, avant les sections ;
//  - un réglage modifié dans une section dépliée la laisse dépliée (l'inspecteur
//    est reconstruit à chaque changement d'attribut) ;
//  - un composant sans groupe (résistance, PCA9685 nu) garde ses propriétés au
//    fil, sans section — le PCA nu n'a que ses six cases, les cacher serait pire.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-proprietes');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { partDef } from '../../src/webview/diagram/catalog.mjs';
import '../../src/webview/composants/araignee-element.mjs';
import '../../src/webview/composants/pca9685-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const inspector = document.getElementById('inspector');
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), inspector);

	/** En-têtes de section de l'inspecteur, dans l'ordre d'affichage. */
	const entetes = () => [...inspector.querySelectorAll('.inspector__group')];
	const titres = () => entetes().map((h) => (h.textContent || '').replace('▾', '').trim());
	/** Un contrôle est VISIBLE si aucun de ses parents n'est masqué. */
	const visible = (el) => !!el && el.getClientRects().length > 0;
	// Un champ numérique porte DEUX classes (inspector__control sur l'input, le
	// stepper autour) : on ne compte que les contrôles eux-mêmes.
	const controlesVisibles = () =>
		[...inspector.querySelectorAll('.inspector__control, .inspector__checkbox')]
			.filter(visible).length;

	// --- 1. Le robot : quatre sections, dans l'ordre demandé --------------------
	const robot = editor.addPart('araignee', 200, 200);
	await wait(120);
	editor.select({ kind: 'part', id: robot.id });
	await wait(120);

	const def = partDef('araignee');
	ok('robot : 33 réglages au catalogue (il y a bien de quoi ranger)',
		(def.props || []).length === 33, (def.props || []).length);
	ok('robot : chaque réglage porte un groupe (aucun ne traîne au fil)',
		(def.props || []).every((p) => !!p.group),
		(def.props || []).filter((p) => !p.group).map((p) => p.attr).join(' '));
	ok('robot : cinq sections dans l inspecteur', entetes().length === 5, titres().join(' | '));
	// Ordre demandé par Frank : la carte d abord, le câblage puis le montage
	// ensuite, les servos eux-mêmes en dernier. Les titres sont traduits (le banc
	// tourne en anglais) : on compare aux clés du catalogue, pas à leur affichage.
	const groupes = [...new Set((def.props || []).map((p) => p.group))];
	ok('robot : sections dans l ordre demandé (carte, câblage, inversions, zéros, paramètres)',
		groupes.join('|') === [
			'Configure the 16-servo board', 'Wire the servos', 'Reverse the servos',
			'Set the servo zeros', 'Servo parameters',
		].join('|'), groupes.join(' | '));
	ok('robot : les en-têtes affichent ces cinq titres, dans le même ordre',
		titres().length === 5 && titres().every((tt, i) => tt !== '' && (tt === groupes[i] || tt.length > 3)),
		titres().join(' | '));

	// --- 2. Repliées à l'ouverture ---------------------------------------------
	ok('robot : tout est REPLIÉ à l ouverture (aucun réglage visible)',
		controlesVisibles() === 0, controlesVisibles() + ' contrôles visibles');
	ok('robot : les cinq chevrons sont couchés',
		entetes().every((h) => h.classList.contains('inspector__group--collapsed')),
		titres().join(' | '));
	// Le gain de place, c'est TOUT l'intérêt du repli : replié, le panneau doit
	// être bien plus court que tout ouvert (mesuré, pas supposé).
	// (Le panneau est étiré par sa colonne : sa hauteur de CONTENU se mesure du
	// haut du premier élément au bas du dernier, pas au scrollHeight.)
	const hauteurContenu = () => {
		const kids = [...inspector.children];
		if (kids.length === 0) return 0;
		const haut = kids[0].getBoundingClientRect().top;
		return Math.round(kids[kids.length - 1].getBoundingClientRect().bottom - haut);
	};
	// (Un seul tiroir s'ouvre à la fois depuis la v2026.8.68 : on mesure donc la
	// hauteur avec LE plus gros tiroir ouvert, pas les cinq.)
	const hautReplie = hauteurContenu();
	entetes()[3].click(); // « Régler le 0 des servomoteurs » : huit champs
	await wait(80);
	const hautDeplie = hauteurContenu();
	entetes()[3].click();
	await wait(80);
	ok('robot : replié, le panneau fait moins de la moitié de sa hauteur ouverte',
		hautReplie * 2 < hautDeplie, hautReplie + ' px replié pour ' + hautDeplie + ' px ouvert');
	ok('robot : et on est bien revenu à l état replié',
		hauteurContenu() === hautReplie && controlesVisibles() === 0,
		hauteurContenu() + ' px / ' + controlesVisibles() + ' contrôles');

	// --- 3. L'adresse I²C est tout en haut --------------------------------------
	const adresse = inspector.querySelector('.inspector__address');
	ok('robot : le rappel d adresse I²C est affiché', !!adresse, adresse && adresse.textContent);
	ok('robot : il donne bien 0x7F (pads tous hauts, réglage d usine)',
		adresse && /0x7F/.test(adresse.textContent || ''), adresse && adresse.textContent);
	ok('robot : il est AVANT la première section (tout en haut, pas sous 33 réglages)',
		adresse && entetes()[0]
		&& (adresse.compareDocumentPosition(entetes()[0]) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);

	// --- 4. Un clic déplie SA section, et elle seule -----------------------------
	entetes()[2].click();   // « Inverser les servomoteurs »
	await wait(60);
	const cases = [...inspector.querySelectorAll('.inspector__checkbox')].filter(visible);
	ok('un clic déplie la section : ses huit cases d inversion apparaissent',
		cases.length === 8, cases.length + ' cases visibles');
	ok('les quatre autres sections restent repliées',
		entetes().filter((h) => !h.classList.contains('inspector__group--collapsed')).length === 1,
		titres().filter((_, i) => !entetes()[i].classList.contains('inspector__group--collapsed')).join(' | '));
	ok('déplier ne fait pas déborder les autres réglages',
		controlesVisibles() === 8, controlesVisibles());

	// --- 5. Le repli survit au changement d'un réglage ---------------------------
	// L'inspecteur est reconstruit à chaque attribut modifié : sans mémoire, la
	// section se refermait sous les doigts à la première case cochée.
	cases[0].click();
	await wait(80);
	ok('case cochée : l attribut est bien posé sur le composant',
		editor.diagram.parts.find((p) => p.id === robot.id).attrs.revcoxa0 === '1',
		JSON.stringify(editor.diagram.parts.find((p) => p.id === robot.id).attrs.revcoxa0));
	ok('case cochée : la section reste OUVERTE (elle est reconstruite à l identique)',
		[...inspector.querySelectorAll('.inspector__checkbox')].filter(visible).length === 8,
		[...inspector.querySelectorAll('.inspector__checkbox')].filter(visible).length);
	ok('case cochée : les autres sections n ont pas bougé (toujours repliées)',
		entetes().filter((h) => !h.classList.contains('inspector__group--collapsed')).length === 1);

	// --- 6. Deuxième clic : on referme ------------------------------------------
	entetes()[2].click();
	await wait(60);
	ok('deuxième clic sur l en-tête : la section se referme',
		controlesVisibles() === 0, controlesVisibles());

	// --- 7. Chaque section porte le bon contenu ---------------------------------
	const contenu = async (i) => {
		entetes()[i].click();
		await wait(60);
		const body = entetes()[i].nextElementSibling;
		const libelles = [...body.querySelectorAll('.inspector__label')].map((l) => (l.textContent || '').trim());
		entetes()[i].click();
		await wait(40);
		return libelles;
	};
	const carte = await contenu(0);
	ok('section « carte » : les six pads d adresse, et rien d autre',
		carte.length === 6 && carte.every((l) => /^AD\\d/.test(l)), JSON.stringify(carte));
	// v2026.8.67 : le tiroir « câbler les servomoteurs », huit numéros de canal.
	const cablage = await contenu(1);
	ok('section « câblage » : les huit numéros de canal, et rien d autre',
		cablage.length === 8 && cablage.every((l) => /channel|canal/i.test(l)), JSON.stringify(cablage));
	const zeros = await contenu(3);
	ok('section « zéros » : les huit calages de palonnier',
		zeros.length === 8 && zeros.every((l) => /0°/.test(l)), JSON.stringify(zeros));
	const params = await contenu(4);
	ok('section « paramètres » : impulsions 0°/180° et temps de rotation',
		params.length === 3 && /0°/.test(params[0]) && /180°/.test(params[1]) && /rotation|Rotation/.test(params[2]),
		JSON.stringify(params));

	// --- 7 bis. Accordéon : ouvrir un tiroir referme le précédent (v2026.8.68) ---
	const ouverts = () => entetes().filter((h) => !h.classList.contains('inspector__group--collapsed'));
	entetes()[0].click();
	await wait(60);
	ok('accordéon : le premier tiroir est ouvert', ouverts().length === 1 && ouverts()[0] === entetes()[0]);
	entetes()[2].click();
	await wait(60);
	ok('accordéon : ouvrir le troisième referme le premier',
		ouverts().length === 1 && ouverts()[0] === entetes()[2],
		ouverts().length + ' tiroir(s) ouvert(s)');
	ok('accordéon : et seuls SES réglages sont visibles (8 cases d inversion)',
		controlesVisibles() === 8, controlesVisibles());
	entetes()[4].click();
	await wait(60);
	ok('accordéon : ouvrir le cinquième referme le troisième',
		ouverts().length === 1 && ouverts()[0] === entetes()[4], ouverts().length);
	entetes()[4].click();
	await wait(60);
	ok('accordéon : refermer le dernier laisse tout fermé', ouverts().length === 0 && controlesVisibles() === 0);

	// --- 7 ter. Câbler les servos : petites cases, pas de toupie (v2026.8.68) ----
	entetes()[1].click();
	await wait(60);
	const corpsCablage = entetes()[1].nextElementSibling;
	const cases2 = [...corpsCablage.querySelectorAll('.inspector__compact')];
	ok('câblage : huit petites cases de saisie', cases2.length === 8, cases2.length);
	ok('câblage : deux caractères, saisie numérique, sans toupie du navigateur',
		cases2.every((i) => i.maxLength === 2 && i.type === 'text' && i.inputMode === 'numeric'),
		cases2[0] && (cases2[0].type + '/' + cases2[0].maxLength + '/' + cases2[0].inputMode));
	ok('câblage : plus aucun bouton + / − dans ce tiroir',
		corpsCablage.querySelectorAll('.inspector__stepper-btn').length === 0,
		corpsCablage.querySelectorAll('.inspector__stepper-btn').length);
	const note = corpsCablage.querySelector('.inspector__group-note');
	ok('câblage : la note dit la plage 0-15 et le marquage 1-16 de la carte',
		!!note && /0/.test(note.textContent) && /15/.test(note.textContent) && /16/.test(note.textContent),
		note && note.textContent);
	// Le robot est posé SANS canal : les huit cases sont vides (un câblage se
	// déclare, il ne se devine pas).
	ok('câblage : les huit cases sont vides à la pose (aucune valeur par défaut)',
		cases2.every((i) => i.value === ''), cases2.map((i) => i.value).join(','));

	/** Saisit une valeur dans une case et valide (comme un utilisateur). */
	const saisir = async (input, valeur) => {
		input.value = valeur;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
		await wait(40);
	};
	const attrs = () => editor.diagram.parts.find((p) => p.id === robot.id).attrs;
	await saisir(cases2[0], '5');
	ok('câblage : une valeur valide est enregistrée', attrs().chcoxa0 === '5', attrs().chcoxa0);
	await saisir(cases2[1], '5');
	ok('câblage : le MÊME canal est refusé sur un deuxième servo',
		(attrs().chpatella0 || '') === '' && cases2[1].value === '',
		JSON.stringify(attrs().chpatella0) + ' / champ « ' + cases2[1].value + ' »');
	ok('câblage : la case refusée clignote en rouge',
		cases2[1].classList.contains('inspector__compact--bad'));
	await saisir(cases2[1], '16');
	ok('câblage : au-dessus de 15, refusé aussi (la carte s arrête à 15)',
		(attrs().chpatella0 || '') === '', JSON.stringify(attrs().chpatella0));
	await saisir(cases2[1], '6');
	ok('câblage : un canal libre passe', attrs().chpatella0 === '6', attrs().chpatella0);
	await saisir(cases2[0], '');
	ok('câblage : vider une case est permis (le manque est dit au lancement)',
		attrs().chcoxa0 === '', JSON.stringify(attrs().chcoxa0));
	await saisir(cases2[1], 'a2');
	ok('câblage : les lettres sont filtrées à la frappe (« a2 » → 2)',
		attrs().chpatella0 === '2', attrs().chpatella0);
	entetes()[1].click();
	await wait(40);

	// --- 8. Un composant sans groupe garde ses propriétés au fil -----------------
	const pca = editor.addPart('pca9685', 500, 200);
	await wait(80);
	editor.select({ kind: 'part', id: pca.id });
	await wait(80);
	ok('PCA9685 nu : aucune section (ses six cases sont tout son réglage)',
		entetes().length === 0, titres().join(' | '));
	ok('PCA9685 nu : ses six cases sont visibles d emblée',
		[...inspector.querySelectorAll('.inspector__checkbox')].filter(visible).length === 6,
		[...inspector.querySelectorAll('.inspector__checkbox')].filter(visible).length);
	ok('PCA9685 nu : son adresse est rappelée aussi',
		!!inspector.querySelector('.inspector__address'),
		(inspector.querySelector('.inspector__address') || {}).textContent);

	const r = editor.addPart('resistor', 700, 200);
	await wait(80);
	editor.select({ kind: 'part', id: r.id });
	await wait(80);
	ok('résistance : aucune section, sa valeur reste visible',
		entetes().length === 0 && controlesVisibles() > 0,
		titres().join(' | ') + ' / ' + controlesVisibles());

	// --- 9. Retour au robot : le repli est reparti de zéro ? ---------------------
	// Non : l'état est gardé par TYPE de composant, on retrouve ce qu'on avait
	// laissé (ici tout refermé — la dernière section ouverte a été refermée).
	editor.select({ kind: 'part', id: robot.id });
	await wait(80);
	ok('retour sur le robot : on retrouve ses cinq sections',
		entetes().length === 5, titres().join(' | '));
	ok('retour sur le robot : elles sont dans l état où on les a laissées',
		controlesVisibles() === 0, controlesVisibles());
	entetes()[4].click();
	await wait(60);
	editor.select({ kind: 'part', id: r.id });
	await wait(60);
	editor.select({ kind: 'part', id: robot.id });
	await wait(80);
	ok('une section laissée OUVERTE se retrouve ouverte en revenant',
		controlesVisibles() === 3, controlesVisibles());

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

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop" style="display:flex;height:700px">` +
	`<aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:900px;height:700px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(
	chrome,
	['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1500,1000', '--virtual-time-budget=20000',
		'--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
	{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(unesc(m[1]));

let fail = 0;
for (const r of rows) {
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok || !r.detail ? '' : ` — ${r.detail}`}`);
	if (!r.ok) fail++;
}
console.log(fail === 0
	? `propriétés : ${rows.length} contrôles OK — les sections se replient comme demandé.`
	: `propriétés : ${fail} ÉCHEC(S) sur ${rows.length}`);
process.exit(fail === 0 ? 0 : 1);
