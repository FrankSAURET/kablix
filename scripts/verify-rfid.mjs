// Banc : LECTEUR DE BADGES de bibliothèque — Grove-RFID.
//
// Ce composant ne vit QUE dans son paquet .kompix. Deux blocs neufs du manifeste
// le décrivent, sans une ligne de code écrite pour lui :
//   - `toggles` : la MÉCANIQUE du dessin — les pièces qu'un clic déplace. Le
//     cavalier glisse de 10 px pour changer de langue, la flèche pousse le badge
//     de 100 px dans la boucle d'antenne et se retourne.
//   - `rfid` : ce que le module ENVOIE — sur quel fil, dans quelle langue, quels
//     numéros de badge, et où les afficher sur le dessin.
//
// Trois parties : le manifeste (node), les trames elles-mêmes RELUES bit à bit
// (node, sans navigateur : on rejoue les fronts et on doit retrouver le numéro
// de départ), puis le lecteur vivant dans le vrai éditeur (Chrome headless).
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lireKompix } from './_lire-kompix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(ROOT, 'node_modules', '.cache-rfid');
mkdirSync(CACHE, { recursive: true });

let failures = 0;
function check(label, ok, detail = '') {
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
	if (!ok) failures++;
}

const part = await lireKompix('grove-rfid');
const tg = part.toggles ?? [];
const rf = part.rfid ?? {};
const uart = (rf.modes ?? []).find((m) => m.proto === 'uart') ?? {};
const wieg = (rf.modes ?? []).find((m) => m.proto === 'wiegand') ?? {};
const aPatte = (n) => part.pins.some((p) => p.name === n);
const auDessin = (id) => Boolean(id) && part.svg.includes(`id="${id}"`);

// --- 1. Le manifeste porte le contrat du lecteur ------------------------------
console.log('Manifeste du paquet :');
check('capteur de la bibliothèque, rangé dans « Capteurs »',
	part.kind === 'passive' && part.category === 'Sensors', `${part.kind} / ${part.category}`);
check('quatre pattes : Tx, Rx, VCC, GND',
	part.pins.length === 4 && ['Tx', 'Rx', 'VCC', 'GND'].every(aPatte),
	part.pins.map((p) => p.name).join(' '));
check('deux bascules de dessin : le cavalier (mode) et le badge (tag)',
	tg.length === 2 && tg[0]?.attr === 'mode' && tg[1]?.attr === 'tag',
	tg.map((t) => t.attr).join(' '));
check('cavalier : UART à gauche, Wiegand 10 px à droite',
	tg[0]?.options?.length === 2 && tg[0].options[0].value === 'uart' &&
	(tg[0].options[0].dx ?? 0) === 0 && tg[0].options[1].value === 'wiegand' &&
	tg[0].options[1].dx === 10,
	JSON.stringify(tg[0]?.options));
check('badge : 100 px vers la boucle, et la flèche se retourne',
	tg[1]?.options?.[1]?.dx === 100 && tg[1].options[1].flip === true &&
	(tg[1].options[0].dx ?? 0) === 0 && !tg[1].options[0].flip,
	JSON.stringify(tg[1]?.options));
check('les pièces citées existent toutes dans le dessin (cavalier, badge, flèche)',
	tg.every((t) => auDessin(t.knob) && (!t.handle || auDessin(t.handle)) && (!t.flip || auDessin(t.flip))),
	tg.map((t) => `${t.knob}/${t.handle ?? '-'}`).join(' '));
check('la flèche garde une zone cliquable de repli (son id vient d’Inkscape)',
	Boolean(tg[1]?.zone && tg[1].zone.w > 0 && tg[1].zone.h > 0), JSON.stringify(tg[1]?.zone));
check('bloc rfid : le badge (tag=in) déclenche l’envoi, le cavalier choisit la langue',
	rf.tagAttr === 'tag' && rf.tagIn === 'in' && rf.modeAttr === 'mode',
	`${rf.tagAttr}/${rf.tagIn}/${rf.modeAttr}`);
check('les deux langues du cavalier sont les deux modes déclarés',
	(rf.modes ?? []).map((m) => m.value).join(',') === (tg[0]?.options ?? []).map((o) => o.value).join(','),
	(rf.modes ?? []).map((m) => m.value).join(','));
check('zone de texte « CodeRFID » présente dans le dessin',
	rf.display === 'CodeRFID' && auDessin(rf.display), String(rf.display));
check('UART : le numéro part sur Tx, à 9600 bauds, et le second fil ne sert pas',
	uart.pin === 'Tx' && aPatte(uart.pin) && uart.baud === 9600 && !uart.pin1,
	`${uart.pin} ${uart.baud} bauds`);
check('Wiegand : DATA0 sur Tx, DATA1 sur Rx, creux de 50 µs espacés de 2 ms',
	wieg.pin === 'Tx' && wieg.pin1 === 'Rx' && aPatte(wieg.pin) && aPatte(wieg.pin1) &&
	wieg.pulseUs === 50 && wieg.gapUs === 2000,
	`${wieg.pin}/${wieg.pin1} ${wieg.pulseUs}µs ${wieg.gapUs}µs`);
check('trois numéros de badge par langue, tous différents',
	(rf.modes ?? []).every((m) => m.codes?.length === 3 && new Set(m.codes).size === 3),
	(rf.modes ?? []).map((m) => (m.codes ?? []).length).join(','));
check('les numéros Wiegand tiennent dans les 26 bits de la trame',
	(wieg.codes ?? []).every((c) => Number.parseInt(c, 16) < 2 ** 26),
	(wieg.codes ?? []).join(' '));
check('le module répète son numéro une fois par seconde tant que le badge est là',
	rf.repeatMs === 1000, String(rf.repeatMs));

// --- 2. Les trames relues bit à bit (node, sans navigateur) --------------------
console.log('Trames émises (relues front par front) :');
await esbuild.build({
	entryPoints: [join(ROOT, 'src', 'webview', 'diagram', 'rfid.mts')],
	bundle: true, format: 'esm', outfile: join(CACHE, 'rfid.mjs'),
	absWorkingDir: ROOT, logLevel: 'silent',
});
const { frontsUart, frontsWiegand, frontsRfid, dureeUs, WIEGAND_BITS } =
	await import(pathToFileURL(join(CACHE, 'rfid.mjs')).href);

/** Fronts (délais relatifs) → instants absolus, comme les verra le moteur. */
function absolus(edges) {
	let t = 0;
	return edges.map((e) => ({ at: (t += e.afterUs), level: e.level }));
}
/** Niveau du fil à l'instant `t`. Avant tout front, l'entrée du moteur est BASSE. */
function niveauA(suite, t) {
	let v = false;
	for (const f of suite) {
		if (f.at > t) break;
		v = f.level;
	}
	return v;
}
/** Décodeur série 8N1 : échantillonne au MILIEU de chaque temps-bit, comme une vraie UART.
 *  `suite` = les fronts À INSTANTS ABSOLUS, qu'ils viennent du module ou d'une
 *  broche vraiment observée dans le moteur. */
function decodeUart(suite, baud) {
	const tBit = 1e6 / baud;
	let texte = '';
	let erreur = '';
	let curseur = -1;
	for (const f of suite) {
		// Le bit de départ du caractère suivant tombe PILE à la fin du précédent :
		// on laisse un quart de temps-bit de marge, sinon un cheveu d'arrondi le
		// ferait manquer — une vraie UART, elle, guette le front, pas l'horloge.
		if (f.level !== false || f.at < curseur - tBit / 4) continue;
		if (niveauA(suite, f.at + tBit / 2) !== false) { erreur = `bit de départ trop court à ${f.at} µs`; break; }
		let v = 0;
		for (let b = 0; b < 8; b++) if (niveauA(suite, f.at + (1.5 + b) * tBit)) v |= 1 << b;
		if (niveauA(suite, f.at + 9.5 * tBit) !== true) { erreur = `bit d’arrêt manquant à ${f.at} µs`; break; }
		texte += String.fromCharCode(v);
		curseur = f.at + 10 * tBit;
	}
	return { texte, erreur };
}
/** Décodeur Wiegand : chaque creux est un bit — sur DATA0 c'est un zéro, sur DATA1 un un. */
function decodeWiegand(suite0, suite1) {
	const creux = [];
	for (const [suite, bit] of [[suite0, 0], [suite1, 1]]) {
		suite.forEach((f, i) => {
			if (f.level !== false) return;
			creux.push({ at: f.at, bit, largeur: suite[i + 1] ? suite[i + 1].at - f.at : -1 });
		});
	}
	creux.sort((a, b) => a.at - b.at);
	const bits = creux.map((c) => c.bit).join('');
	return { creux, bits, valeur: bits ? Number.parseInt(bits, 2) : NaN };
}

{
	const code = uart.codes[0];
	const edges = frontsUart(code, uart.baud);
	const lu = decodeUart(absolus(edges), uart.baud);
	check('série : la ligne est posée HAUTE avant le premier bit de départ',
		edges[0]?.level === true && edges[0].afterUs === 0 && edges[1]?.level === false,
		JSON.stringify(edges.slice(0, 2)));
	check(`série : le numéro relu est bien « ${code} »`, lu.texte === `${code}\r\n`,
		lu.erreur || JSON.stringify(lu.texte));
	check('série : la fin de ligne est là (readStringUntil sait où s’arrêter)',
		lu.texte.endsWith('\r\n'), JSON.stringify(lu.texte.slice(-2)));
	check('série : aucun front inutile (huit bits pareils = un seul front)',
		edges.length < (code.length + 2) * 10, `${edges.length} fronts`);
	const ms = dureeUs(edges) / 1000;
	check('série : la trame passe en 13 ms, bien avant la répétition suivante',
		ms > 10 && ms < rf.repeatMs, `${ms.toFixed(1)} ms`);
	// Contre-preuve : les trois numéros du manifeste se relisent tous.
	const tous = uart.codes.every(
		(c) => decodeUart(absolus(frontsUart(c, uart.baud)), uart.baud).texte === `${c}\r\n`);
	check('série : les trois numéros de badge se relisent sans faute', tous, '');
}
/** Trame Wiegand d'un numéro : les deux fils, en instants absolus. */
function trameAbsolue(code) {
	const f = frontsWiegand(code, { pulseUs: wieg.pulseUs, gapUs: wieg.gapUs });
	return [absolus(f.data), absolus(f.data1)];
}

{
	const code = wieg.codes[0];
	const frame = frontsWiegand(code, { pulseUs: wieg.pulseUs, gapUs: wieg.gapUs });
	const lu = decodeWiegand(...trameAbsolue(code));
	check('Wiegand : les deux fils partent du repos (hauts) au même instant',
		frame.data[0]?.level === true && frame.data[0].afterUs === 0 &&
		frame.data1[0]?.level === true && frame.data1[0].afterUs === 0, '');
	check(`Wiegand : ${WIEGAND_BITS} creux, un par bit`, lu.creux.length === WIEGAND_BITS,
		String(lu.creux.length));
	check('Wiegand : tous les creux durent 50 µs',
		lu.creux.every((c) => Math.abs(c.largeur - wieg.pulseUs) < 0.001),
		lu.creux.map((c) => c.largeur).filter((l) => Math.abs(l - wieg.pulseUs) > 0.001).join(' '));
	check('Wiegand : 2 ms de repos entre deux creux (jamais deux bits collés)',
		lu.creux.every((c, i) => i === 0 || c.at - lu.creux[i - 1].at - wieg.pulseUs >= wieg.gapUs - 0.001),
		'');
	check(`Wiegand : le numéro relu est bien « ${code} »`,
		lu.valeur === Number.parseInt(code, 16),
		`${lu.valeur} attendu ${Number.parseInt(code, 16)} (bits ${lu.bits})`);
	check('Wiegand : bit de poids fort en premier',
		lu.bits === Number.parseInt(code, 16).toString(2).padStart(WIEGAND_BITS, '0'), lu.bits);
	const ms = Math.max(dureeUs(frame.data), dureeUs(frame.data1)) / 1000;
	check('Wiegand : la trame passe en 55 ms, bien avant la répétition suivante',
		ms > 50 && ms < rf.repeatMs, `${ms.toFixed(1)} ms`);
	const tous = wieg.codes.every((c) => decodeWiegand(...trameAbsolue(c)).valeur === Number.parseInt(c, 16));
	check('Wiegand : les trois numéros de badge se relisent sans faute', tous, '');
}
{
	// C'est le MODE du manifeste qui choisit la langue, pas un test écrit ici.
	const u = frontsRfid(uart, uart.codes[0]);
	const w = frontsRfid(wieg, wieg.codes[0]);
	check('le mode du manifeste choisit la langue : UART n’écrit rien sur le second fil',
		u.data1.length === 0 && u.data.length > 0, `${u.data.length}/${u.data1.length}`);
	check('… et Wiegand écrit sur les deux fils',
		w.data.length > 1 && w.data1.length > 1, `${w.data.length}/${w.data1.length}`);
}

// --- 2 bis. Une Pico n'entend pas un lecteur qui parle en serie ---------------
// La liaison serie MATERIELLE de la Pico est emulee a part : elle n'a aucun lien
// avec l'etat des broches. Une trame posee sur le fil n'arrive donc nulle part et
// le programme attend un badge qui ne viendra jamais. Plutot que de laisser
// croire a une panne, la simulation le DIT et montre ou est le cavalier.
console.log('Mise en garde « série muette sur Pico » :');
{
	const simSrc = readFileSync(join(ROOT, 'src', 'webview', 'sim.mts'), 'utf8');
	const d = simSrc.indexOf('Lecteurs de badges');
	const zone = d < 0 ? '' : simSrc.slice(d, simSrc.indexOf('Multimètre', d));
	check('la boucle des lecteurs relit le mode montré par le cavalier',
		/const modeCourant = \(\)/.test(zone) && /modeCourant\(\)\?\.proto === 'uart'/.test(zone));
	check('la mise en garde ne sort que sur une carte Pico',
		/serie && isPicoBoard\(board\)/.test(zone));
	check('elle ne se dit qu’une fois, et se réarme si le cavalier revient',
		/if \(!prevenu\)/.test(zone) && /prevenu = false/.test(zone));
	check('le message est traduisible et nomme le composant',
		/flashStatus\(t\('\{0\}: this board cannot hear a UART reader/.test(zone) &&
		/part\.id\)/.test(zone));
	// La zone de texte du dessin s'écrit par une MÉTHODE de l'élément : rangée dans
	// une variable sans son objet, elle lève dès le premier appel — et comme le
	// câblage se fait AVANT `engine.start()`, plus rien ne démarrait.
	check('la méthode d’écriture est reliée à son élément (.bind)',
		/const ecrire = methodeTexte \? methodeTexte\.bind\(el\) : undefined;/.test(zone));
	check('aucune méthode d’élément n’est appelée détachée dans cette boucle',
		!/const ecrire = el\.setSvgText as/.test(zone));
	// Et le filet : un câblage qui échoue ne doit plus emporter TOUTE la simulation
	// en silence — le lancement continue et l'erreur se dit.
	const lancement = simSrc.slice(simSrc.indexOf('function startRun'), simSrc.indexOf('function stopRun'));
	check('le câblage des entrées est protégé au lancement',
		/try \{\s*rebind\(\);\s*\} catch/.test(lancement) && /engine\.start\(\);/.test(lancement));
	check('un câblage en échec est dit à l’élève (console + barre d’état)',
		/appendSerial\(`\n── \$\{t\('Wiring error'\)\}/.test(lancement) &&
		/flashStatus\(t\('Error: \{0\}', detail\)\)/.test(lancement));
}

// --- 3. Les trames sur le VRAI moteur AVR --------------------------------------
// Jusqu'ici, un composant ne savait que POSER un niveau ou une tension. Celui-ci
// PARLE : `emitPulses` range une suite de fronts dans le temps simulé et le
// moteur les sert un par un. Ce qui suit joue le rôle du programme utilisateur —
// il regarde la broche cycle après cycle, sans rien savoir de ce qui l'écrit, et
// doit retrouver le numéro de badge. Aucun croquis compilé n'est nécessaire.
console.log('Trames vues par le moteur AVR (temps simulé) :');
const avrOut = join(CACHE, 'avr.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src', 'webview', 'engines', 'avr.mts')], outfile: avrOut,
	bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { AvrEngine } = await import(pathToFileURL(avrOut).href);

const CYCLES_US = 16; // ATmega328P : 16 millions de cycles par seconde
const PIND = 0x29; // les pattes 0 à 7 de l'Uno se lisent dans ce registre

/**
 * Avance le moteur de `us` microsecondes SANS exécuter une seule instruction, en
 * servant les fronts programmés comme le fait sa boucle, et note les changements
 * de chaque broche surveillée. Rend une suite de fronts par broche.
 */
function observe(eng, bits, us) {
	const cpu = eng.cpu;
	const suites = bits.map(() => []);
	const dernier = bits.map(() => null);
	const pas = Math.round((us * CYCLES_US) / 2);
	for (let i = 0; i < pas; i++) {
		cpu.cycles += 2;
		eng.fireScheduled();
		for (let k = 0; k < bits.length; k++) {
			const haut = ((cpu.data[PIND] >> bits[k]) & 1) === 1;
			if (haut === dernier[k]) continue;
			dernier[k] = haut;
			suites[k].push({ at: cpu.cycles / CYCLES_US, level: haut });
		}
	}
	return suites;
}

{
	// Le module parle sur la patte 2 (et la patte 3 pour le second fil Wiegand).
	const code = uart.codes[1];
	const eng = new AvrEngine(new Uint16Array(1024), null, 'avr328');
	eng.emitPulses('2', frontsUart(code, uart.baud));
	const [vue] = observe(eng, [2], 15000);
	const lu = decodeUart(vue, uart.baud);
	check('série : le moteur sert bien tous les fronts, un par un',
		vue.length > 20, `${vue.length} fronts vus sur la patte 2`);
	check(`série : le numéro relu SUR LA BROCHE est bien « ${code} »`, lu.texte === `${code}\r\n`,
		lu.erreur || JSON.stringify(lu.texte));
}
{
	const code = wieg.codes[2];
	const eng = new AvrEngine(new Uint16Array(1024), null, 'avr328');
	const frame = frontsWiegand(code, { pulseUs: wieg.pulseUs, gapUs: wieg.gapUs });
	eng.emitPulses('2', frame.data);
	eng.emitPulses('3', frame.data1);
	const [v0, v1] = observe(eng, [2, 3], 60000);
	const lu = decodeWiegand(v0, v1);
	check('Wiegand : le moteur mène les DEUX fils de front',
		v0.length > 2 && v1.length > 2, `${v0.length} et ${v1.length} fronts`);
	check(`Wiegand : ${WIEGAND_BITS} creux vus sur les broches`, lu.creux.length === WIEGAND_BITS,
		String(lu.creux.length));
	check(`Wiegand : le numéro relu SUR LES BROCHES est bien « ${code} »`,
		lu.valeur === Number.parseInt(code, 16),
		`${lu.valeur} attendu ${Number.parseInt(code, 16)}`);
	// Les creux durent 50 µs à un demi-pas d'horloge près (le moteur avance de
	// deux cycles à la fois : il ne peut pas tomber PILE sur la microseconde).
	const larges = lu.creux.filter((c) => Math.abs(c.largeur - wieg.pulseUs) > 0.2);
	check('Wiegand : les creux durent 50 µs dans le temps simulé, pas un de plus',
		larges.length === 0, larges.map((c) => c.largeur.toFixed(3)).join(' '));
}

// --- 4. Le lecteur vivant dans le vrai éditeur --------------------------------
console.log('Lecteur dans l’éditeur (Chrome headless) :');
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { customRfidBindings } from '../../src/webview/diagram/model.mjs';
import { registerCustomPart } from '../../src/webview/diagram/catalog.mjs';
import '../../src/webview/composants/custom-part.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';

// Exactement ce que fait la webview à l'ouverture d'un projet : le paquet lu
// devient une définition du catalogue.
registerCustomPart(${JSON.stringify({ ...part, behaviorScript: undefined })});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const MIROIR = /scale\\(-1,\\s*1\\)/;

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));

	const lecteur = editor.addPart('grove-rfid', 300, 120);
	await wait(150);
	const rr = editor.rendered.get(lecteur.id);
	const el = rr.el;
	const sr = el.shadowRoot;
	const svg = sr && sr.querySelector('svg');
	ok('dessin rendu (viewBox 260×250)', svg && svg.getAttribute('viewBox') === '0 0 260 250',
		svg ? svg.getAttribute('viewBox') : 'pas de svg');
	ok('quatre pastilles cliquables', rr.hotspots.size === 4, rr.hotspots.size);

	// --- Au repos : cavalier sur UART, badge dehors ------------------------------
	ok('défaut : mode=uart et tag=out (première option de chaque bascule)',
		lecteur.attrs && lecteur.attrs.mode === 'uart' && lecteur.attrs.tag === 'out',
		JSON.stringify(lecteur.attrs));
	const piece = (id) => sr.querySelector('[id="' + id + '"]');
	const cavalier = piece('Cavalier'), badge = piece('Tag-RFID'), fleche = piece('Fleche-Tag');
	ok('les trois pièces du dessin sont là (cavalier, badge, flèche)',
		!!cavalier && !!badge && !!fleche, '');
	ok('cavalier et flèche sont cliquables (curseur main)',
		cavalier.style.cursor === 'pointer' && fleche.style.cursor === 'pointer',
		cavalier.style.cursor + '/' + fleche.style.cursor);
	ok('bulles d aide posées sur les deux pièces cliquables',
		!!cavalier.querySelector('title') && !!fleche.querySelector('title'), '');

	// Tout se mesure À L ÉCRAN : seule preuve que la course fait la bonne distance,
	// quelle que soit l échelle Inkscape du groupe qui porte la pièce.
	const echelle = svg.getBoundingClientRect().width / 260;
	const gauche = (p) => p.getBoundingClientRect().left;
	const clic = (p) => p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));

	// --- La flèche pousse le badge dans la boucle --------------------------------
	const x0 = gauche(badge);
	clic(fleche);
	await wait(40);
	ok('clic sur la flèche : attr élément tag=in', el.getAttribute('tag') === 'in', el.getAttribute('tag'));
	ok('clic sur la flèche : PERSISTÉ dans le schéma (part.attrs.tag=in)',
		lecteur.attrs && lecteur.attrs.tag === 'in', JSON.stringify(lecteur.attrs));
	const course = (gauche(badge) - x0) / echelle;
	ok('le badge a glissé de 100 px de dessin vers la boucle',
		Math.abs(course - 100) < 0.6, course.toFixed(2) + ' px');
	ok('la flèche s est retournée (miroir)', MIROIR.test(fleche.getAttribute('transform') || ''),
		fleche.getAttribute('transform') || 'aucun transform');
	// La flèche ne se DÉPLACE pas : elle pivote sur place.
	const fx = gauche(fleche);
	clic(fleche);
	await wait(40);
	ok('nouveau clic : le badge revient à sa place (tag=out)',
		el.getAttribute('tag') === 'out' && Math.abs(gauche(badge) - x0) < 0.6,
		el.getAttribute('tag') + ' ' + ((gauche(badge) - x0) / echelle).toFixed(2) + ' px');
	ok('… et la flèche reprend son sens d origine, sans avoir bougé',
		!MIROIR.test(fleche.getAttribute('transform') || '') && Math.abs(gauche(fleche) - fx) < 0.6,
		fleche.getAttribute('transform') || 'aucun transform');

	// --- Le cavalier change de langue --------------------------------------------
	const c0 = gauche(cavalier);
	clic(cavalier);
	await wait(40);
	ok('clic sur le cavalier : mode=wiegand, persisté dans le schéma',
		el.getAttribute('mode') === 'wiegand' && lecteur.attrs.mode === 'wiegand',
		el.getAttribute('mode') + ' / ' + JSON.stringify(lecteur.attrs));
	const saut = (gauche(cavalier) - c0) / echelle;
	ok('le cavalier a sauté de 10 px vers la droite', Math.abs(saut - 10) < 0.6, saut.toFixed(2) + ' px');
	ok('le clic sur une pièce ne déplace PAS le composant',
		rr.part.x === 300 && rr.part.y === 120, rr.part.x + ',' + rr.part.y);

	// --- La zone de texte du numéro -----------------------------------------------
	const texteDe = (id) => {
		const n = piece(id);
		return n ? (n.querySelector('tspan') || n).textContent : null;
	};
	const repos = texteDe('CodeRFID');
	el.setSvgText('CodeRFID', '0F0034AB12');
	ok('le numéro s écrit dans la zone « CodeRFID »', texteDe('CodeRFID') === '0F0034AB12',
		texteDe('CodeRFID'));
	el.setSvgText('CodeRFID', null);
	ok('badge retiré : la zone retrouve son texte de repos', texteDe('CodeRFID') === repos,
		texteDe('CodeRFID') + ' attendu ' + repos);

	// Ranger cette méthode dans une variable la SÉPARE de son élément : au premier
	// appel elle ne retrouve plus ses affaires et lève. La simulation s'en servait
	// ainsi et mourait AVANT de démarrer (barre d'état figée sur « Arrêté »).
	const detachee = el.setSvgText;
	let aLeve = false;
	try { detachee('CodeRFID', 'X'); } catch (e) { aLeve = true; }
	ok('la méthode détachée de son élément lève (d’où le liage côté simulation)', aLeve);
	const reliee = el.setSvgText.bind(el);
	reliee('CodeRFID', '1A34B12');
	ok('la même méthode RELIÉE à son élément écrit bien', texteDe('CodeRFID') === '1A34B12',
		texteDe('CodeRFID'));
	reliee('CodeRFID', null);

	// --- Sur quelles broches le programme écoute ------------------------------------
	const uno = editor.addPart('uno', 40, 500);
	await wait(120);
	editor.addWire({ partId: lecteur.id, pin: 'Tx' }, { partId: uno.id, pin: '2' });
	editor.addWire({ partId: lecteur.id, pin: 'Rx' }, { partId: uno.id, pin: '3' });
	const lien = () => customRfidBindings(editor.diagram).find((b) => b.partId === lecteur.id);
	ok('Wiegand : les deux fils sont écoutés (D0 sur la patte 2, D1 sur la patte 3)',
		lien() && lien().data === '2' && lien().data1 === '3', JSON.stringify(lien()));
	clic(cavalier);
	await wait(40);
	ok('UART : seul Tx parle, le second fil n est plus une donnée',
		el.getAttribute('mode') === 'uart' && lien().data === '2' && lien().data1 === null,
		JSON.stringify(lien()));
	// Contre-preuve : sans fil, le programme n écoute rien.
	editor.diagram.wires.length = 0;
	ok('lecteur non câblé : aucune broche écoutée', lien().data === null && lien().data1 === null,
		JSON.stringify(lien()));

	// --- EN SIMULATION, les pièces doivent rester saisissables -------------------
	// Le corps d un composant est sourd à la souris (il recouvrirait ses propres
	// pastilles) : seuls ceux qui portent un contrôle de simulation le redeviennent
	// au verrouillage. Un lecteur n a pas de curseur — mais ses bascules EN SONT
	// un : sans ce réveil, la flèche ne poussait plus le badge une fois la
	// simulation lancée, et « rien ne se passait ».
	editor.setLocked(true);
	await wait(60);
	const corps = rr.container.querySelector('.part__body');
	ok('en simulation : le corps du lecteur reçoit la souris',
		getComputedStyle(corps).pointerEvents === 'auto', getComputedStyle(corps).pointerEvents);
	ok('en simulation : le lecteur reste SOUS les fils',
		rr.container.classList.contains('part--sim-under-wires') &&
		!rr.container.classList.contains('part--sim-active'), rr.container.className);
	const avant = el.getAttribute('tag');
	clic(fleche);
	await wait(40);
	ok('clic sur la flèche EN SIMULATION : le badge change de place',
		el.getAttribute('tag') !== avant, avant + ' → ' + el.getAttribute('tag'));
	editor.setLocked(false);

	rendre();
}
function rendre() {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	checks.push({ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 400) });
	rendre();
});
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1400px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`);
const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) {
	console.log('  – Chrome introuvable, lecteur non vérifié dans l’éditeur');
} else {
	const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
		'--virtual-time-budget=20000', '--dump-dom',
		`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
	if (!m) check('mesures relevées', false, 'aucune mesure dans le DOM');
	else for (const r of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))) {
		check(r.name, r.ok, r.detail);
	}
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
