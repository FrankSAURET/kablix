// Le badge « Ralentie » de la barre de titre sort-il vraiment quand la carte
// prend du retard ? On rejoue ICI la logique exacte de `updateSpeedBadge()`
// (sim.mts) sur un vrai moteur, fenêtre par fenêtre.
//
// Ce qu'il attrape : un ratio NaN — ce que rendait `simulatedMs()` sur RP2350
// avant v2026.8.102.15 — passe le test `ratio < seuil` sans jamais l'allumer.
// Le badge se taisait donc sur les cartes les plus lentes, exactement celles
// qu'il devait dénoncer, et aucun test ne le disait.
//
// Ce qu'il ne mesure PAS : la cadence d'appel. Dans la page, `updateSpeedBadge`
// est appelée par `requestAnimationFrame` ; ici on l'appelle après chaque
// tranche de `KablixSimulator.execute()`, qui dure le même budget de 16 ms.
// Un `setInterval` ne conviendrait pas : sous Node, le `MessagePort` qui
// enchaîne les tranches affame les timers (fenêtres mesurées à 20 s au lieu
// d'une), ce qui n'arrive pas dans un navigateur.
//   node scripts/_diag-badge-lent.mjs [rp2040|rp2350] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-badge-'));
const famille = process.argv[2] ?? 'rp2350';
const duree = Number(process.argv[3] ?? 20) * 1000;

async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const fw = firmwarePico(famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-');
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script: 'import time\nwhile True:\n    time.sleep_ms(10)\n' }, famille);

// Constantes de sim.mts, recopiées telles quelles : si elles bougent là-bas,
// c'est ce diagnostic qui doit être remis d'accord, pas l'inverse.
const SPEED_WINDOW_MS = 1000;
const SPEED_WARN = 0.8;
const SPEED_WARMUP_WINDOWS = 1;
const SPEED_SLOW_STREAK = 2;

let arme = false;
let mur0 = 0, sim0 = 0, fenetres = 0, serie = 0, affiche = false, premiere = 0;
let dansStart = false;
engine.onRunning = () => {
	// La page arme la mesure sur ce signal PUIS écrit `speedArmed` : émis pendant
	// `start()`, il serait effacé aussitôt et la mesure ne partirait jamais.
	arme = true;
	mur0 = 0;
	fenetres = 0;
	serie = 0;
	console.log(`  onRunning à ${((performance.now() - t0) / 1000).toFixed(1)} s${dansStart ? '  >>> PENDANT start(), la page l\'effacerait <<<' : ''}`);
};

function tick() {
	if (!arme) return;
	const now = performance.now();
	const sim = engine.simulatedMs();
	if (!mur0) { mur0 = now; sim0 = sim; return; }
	const mur = now - mur0;
	if (mur < SPEED_WINDOW_MS) return;
	const ratio = (sim - sim0) / mur;
	mur0 = now;
	sim0 = sim;
	const lent = ratio < SPEED_WARN * 1;
	fenetres++;
	if (fenetres > SPEED_WARMUP_WINDOWS) serie = lent ? serie + 1 : 0;
	const veut = lent && serie >= SPEED_SLOW_STREAK;
	console.log(`  fenêtre ${fenetres} : ${mur.toFixed(0)} ms réelles, ratio ${Number.isFinite(ratio) ? ratio.toFixed(3) : `>>> ${ratio} <<<`}, série ${serie}${veut ? ' → BADGE' : ''}`);
	if (veut && !affiche) premiere = now - t0;
	affiche = veut;
}

// Une tranche de moteur = une occasion d'afficher, comme une frame dans la page.
const sim = engine.sim;
const execute = sim.execute.bind(sim);
sim.execute = () => { execute(); tick(); };

console.log(`${famille} — ${duree / 1000} s`);
const t0 = performance.now();
dansStart = true;
engine.start();
dansStart = false;
await new Promise((r) => setTimeout(r, duree));
engine.stop();
console.log(`\nbadge ${affiche ? `AFFICHÉ (première fois à ${(premiere / 1000).toFixed(1)} s)` : 'ÉTEINT'} — ${arme ? 'mesure armée' : 'JAMAIS ARMÉE (onRunning muet)'}`);
process.exit(0);
