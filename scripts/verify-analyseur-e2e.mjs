// L'analyseur logique voit-il VRAIMENT quelque chose ? (v2026.9.4.115)
//
// LE DÉFAUT. Frank, 19/09 : « pour l'instant je ne vois toujours rien du tout
// dans l'onglet analyseur logique », « je ne vois jamais aucune courbe ».
// Tous les bancs de l'analyseur étaient pourtant verts. C'est qu'aucun ne
// faisait TOURNER un programme : `verify-analyseur.mjs` éprouve le modèle
// (quelle broche une pince écoute), `verify-analyseur-rendu.mjs` le dessin à
// partir de fronts FABRIQUÉS À LA MAIN, `verify-sonde-fil.mjs` la couleur de
// la pince. Personne ne vérifiait que le moteur PRODUIT des fronts.
//
// CE BANC PART DU MOTEUR. Vrai firmware MicroPython, vrai programme (celui de
// `testkablix/sonde-logique-pico.py`), vraies pinces déclarées au moteur, puis
// `drainScopeEdges()` : on regarde s'il en tombe des fronts, et s'ils tombent
// à la bonne cadence. Si ce banc est vert et que l'onglet reste vide, le
// défaut est en aval (relais par l'hôte, dessin) ; s'il est rouge, rien de ce
// qui est en aval ne pouvait marcher.
//
// LES DEUX DÉCLARATIONS COMPTENT. Une pince a besoin de `setLogicProbes` (elle
// dit « je veux le journal de cette broche ») ET de `setPulseMonitors` (c'est
// `samplePulses`, qui ne balaie QUE ces broches, qui date les bascules). Une
// seule des deux et le journal reste vide — le banc éprouve donc aussi ce
// couplage, en montrant qu'une broche déclarée à la première seule ne rend
// rien.
//
// Usage : node scripts/verify-analyseur-e2e.mjs
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwareAbsent, firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-e2e-'));
async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({
		entryPoints: [join(root, entry)],
		outfile: out,
		bundle: true,
		platform: 'node',
		format: 'esm',
		logLevel: 'silent',
	});
	return import(pathToFileURL(out).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

/** Les deux broches du schéma de test : GP14 bat vite, GP15 deux fois moins. */
const RAPIDE = 'GP14';
const LENTE = 'GP15';

/**
 * Le programme, décalqué de `testkablix/sonde-logique-pico.py`. Un créneau de
 * 200 µs par demi-période sur GP14, et GP15 qui bascule un tour sur deux — soit
 * exactement deux fois moins de fronts. C'est ce rapport que le banc mesure :
 * il prouve que les fronts datés sont ceux du programme et pas du bruit.
 */
const SCRIPT = [
	'from machine import Pin',
	'import time',
	'',
	'rapide = Pin(14, Pin.OUT)',
	'lente = Pin(15, Pin.OUT)',
	'etat = 0',
	'while True:',
	'    rapide.value(1)',
	'    time.sleep_us(200)',
	'    rapide.value(0)',
	'    time.sleep_us(200)',
	'    etat = 1 - etat',
	'    lente.value(etat)',
	'',
].join('\n');

/** Additionne les fronts par broche au fil des drainages. */
function cumuler(total, salve) {
	for (const [pin, log] of Object.entries(salve)) {
		// Un journal vaut [temps, niveau, temps, niveau, …] : un front = deux nombres.
		total[pin] = (total[pin] ?? 0) + log.length / 2;
	}
}

async function essai(carte) {
	console.log(`\n--- ${carte.nom} / analyseur sur ${RAPIDE} et ${LENTE}`);
	const fw = firmwarePico(carte.prefixe);
	if (!fw) {
		console.log(`  SKIP : ${firmwareAbsent(carte.prefixe)}`);
		return true;
	}
	const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({
		addr: s.addr,
		data: s.data,
	}));

	// --- Cas A : les DEUX déclarations, comme le fait l'atelier ---------------
	const moteur = new PicoEngine({ kind: 'flash', segments, script: SCRIPT }, carte.famille);
	moteur.setLogicProbes([RAPIDE, LENTE]);
	moteur.setPulseMonitors([RAPIDE, LENTE]);

	// --- Cas B : la déclaration de l'analyseur SEULE --------------------------
	// Sans `setPulseMonitors`, `samplePulses` ne balaie pas la broche et aucune
	// bascule n'est datée. Cas éprouvé pour que le couplage des deux appels ne
	// se perde pas dans une réécriture : il est invisible à la lecture.
	const seul = new PicoEngine({ kind: 'flash', segments, script: SCRIPT }, carte.famille);
	seul.setLogicProbes([RAPIDE, LENTE]);

	const totalA = {};
	const totalB = {};
	moteur.start();
	seul.start();

	const depart = Date.now();
	return await new Promise((resolve) => {
		const timer = setInterval(() => {
			cumuler(totalA, moteur.drainScopeEdges?.() ?? {});
			cumuler(totalB, seul.drainScopeEdges?.() ?? {});
			const ecoule = (Date.now() - depart) / 1000;
			// Assez de fronts pour juger du rapport, ou temps écoulé.
			const assez = (totalA[RAPIDE] ?? 0) > 200 && (totalA[LENTE] ?? 0) > 50;
			if (!assez && ecoule <= 120) return;
			clearInterval(timer);
			moteur.dispose();
			seul.dispose();

			const rapide = totalA[RAPIDE] ?? 0;
			const lente = totalA[LENTE] ?? 0;
			// GP15 bascule une fois par tour de boucle, GP14 deux fois : le rapport
			// attendu est 2. Large tolérance — la capture est coupée n'importe où
			// dans un tour et le programme démarre sur un demi-tour.
			const rapport = lente > 0 ? rapide / lente : 0;
			const controles = [
				[`des fronts tombent sur ${RAPIDE}`, rapide > 100],
				[`des fronts tombent sur ${LENTE}`, lente > 20],
				[`${RAPIDE} bat ~2 fois plus vite que ${LENTE} (${rapport.toFixed(2)})`,
					rapport > 1.5 && rapport < 3],
				['sans setPulseMonitors, AUCUN front n\'est daté (couplage)',
					(totalB[RAPIDE] ?? 0) === 0 && (totalB[LENTE] ?? 0) === 0],
			];
			console.log(`\n  --- ${ecoule.toFixed(1)} s · ${rapide} fronts ${RAPIDE}, ${lente} fronts ${LENTE} ---`);
			for (const [nom, bon] of controles) console.log(`  ${bon ? '✓' : '✗'} ${nom}`);
			resolve(controles.every(([, c]) => c));
		}, 500);
	});
}

let echecs = 0;
for (const carte of CARTES_PICO) {
	if (!(await essai(carte))) echecs++;
}
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs} cas)` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
