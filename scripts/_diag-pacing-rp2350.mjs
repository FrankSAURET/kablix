// Pourquoi le RP2350 prend-il de l'avance sur le temps réel ? On instrumente la
// puce elle-même : chaque `sauter()` et chaque `executerLot()` est mesuré (ce
// qu'on lui demande, ce que l'horloge avance vraiment), et le plus gros bond est
// gardé. Un saut d'alarme mal borné suffit à faire courir la simulation.
//   node scripts/_diag-pacing-rp2350.mjs [rp2040|rp2350]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-pacing-'));
const famille = process.argv[2] ?? 'rp2350';

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

const chip = engine.sim.chip;
const stat = { sauts: 0, sautNanos: 0, sautMax: 0, demandeMax: 0, lots: 0, lotNanos: 0, lotMax: 0, alarmeMax: 0 };
// Qui empêche de dormir ? `dort()` exige les DEUX cœurs en attente : on compte
// séparément, sinon impossible de savoir si c'est le cœur 1 (jamais démarré par
// le programme) qui tient la simulation éveillée.
const veille = { total: 0, c0: 0, c1: 0, aucun: 0 };
const dort = chip.dort.bind(chip);
// `private` de TypeScript n'existe plus à l'exécution : on lit les deux cœurs
// tels quels, sans ajouter d'accès de diagnostic au code du produit.
const coeurs = () => (famille === 'rp2350' ? [chip.puce.core[0].waiting, chip.puce.core[1].waiting] : [chip.puce.core.waiting, true]);
chip.dort = () => {
	const r = dort();
	if (!r) {
		veille.total++;
		const [w0, w1] = coeurs();
		if (w0 && !w1) veille.c1++;
		else if (!w0 && w1) veille.c0++;
		else veille.aucun++;
	}
	return r;
};
const sauter = chip.sauter.bind(chip);
chip.sauter = (n) => {
	const avant = chip.clock.nanos;
	sauter(n);
	const fait = chip.clock.nanos - avant;
	stat.sauts++;
	stat.sautNanos += fait;
	if (fait > stat.sautMax) stat.sautMax = fait;
	if (n > stat.demandeMax) stat.demandeMax = n;
	if (chip.clock.nanosToNextAlarm > stat.alarmeMax) stat.alarmeMax = chip.clock.nanosToNextAlarm;
};
const executerLot = chip.executerLot.bind(chip);
chip.executerLot = (fin) => {
	const avant = chip.clock.nanos;
	executerLot(fin);
	const fait = chip.clock.nanos - avant;
	const depassement = chip.clock.nanos - fin;
	stat.lots++;
	stat.lotNanos += fait;
	if (depassement > stat.lotMax) stat.lotMax = depassement;
};

// Qui réveille le cœur 0 ? On piège la propriété `waiting` : chaque passage à
// true (WFE/WFI du firmware) et chaque retour à false est compté, avec la pile
// d'appel du réveil — c'est elle qui nomme le coupable.
const core0 = famille === 'rp2350' ? chip.puce.core[0] : chip.puce.core;
let dodo = 0, reveils = 0;
const reveilleurs = new Map();
let _waiting = core0.waiting;
Object.defineProperty(core0, 'waiting', {
	get: () => _waiting,
	set: (v) => {
		if (v && !_waiting) dodo++;
		if (!v && _waiting) {
			reveils++;
			const pile = (new Error().stack ?? '').split(String.fromCharCode(10))[2]?.trim() ?? '?';
			reveilleurs.set(pile, (reveilleurs.get(pile) ?? 0) + 1);
		}
		_waiting = v;
	},
	configurable: true,
});

// WFE ne dort QUE si aucun événement n'est armé. Un `eventRegistered` remis à
// true en permanence (entrée/sortie d'exception, SEV de l'autre cœur) suffit
// donc à transformer `time.sleep()` en boucle chaude, sans qu'aucun réveil
// n'apparaisse. On compte les armements, par origine.
let _event = core0.eventRegistered;
let armes = 0;
const armeurs = new Map();
Object.defineProperty(core0, 'eventRegistered', {
	get: () => _event,
	set: (v) => {
		if (v && !_event) {
			armes++;
			const pile = (new Error().stack ?? '').split(String.fromCharCode(10))[2]?.trim() ?? '?';
			armeurs.set(pile, (armeurs.get(pile) ?? 0) + 1);
		}
		_event = v;
	},
	configurable: true,
});

const t0 = Date.now();
engine.start();
await new Promise((r) => setTimeout(r, 1000));
engine.stop();
const reel = Date.now() - t0;
const ms = (n) => (n / 1e6).toFixed(3);

console.log(`${famille} — ${reel} ms réelles, ${ms(chip.clock.nanos)} ms simulées (×${(chip.clock.nanos / 1e6 / reel).toFixed(2)})`);
console.log(`  sauts d'alarme : ${stat.sauts}, total ${ms(stat.sautNanos)} ms, plus gros ${ms(stat.sautMax)} ms`);
console.log(`  plus grosse durée DEMANDÉE à sauter : ${ms(stat.demandeMax)} ms`);
console.log(`  nanosToNextAlarm max vu : ${ms(stat.alarmeMax)} ms`);
console.log(`  lots : ${stat.lots}, total ${ms(stat.lotNanos)} ms, plus gros dépassement de borne ${ms(stat.lotMax)} ms`);
console.log(`  éveils : ${veille.total} — cœur 1 seul éveillé ${veille.c1}, cœur 0 seul ${veille.c0}, les deux ${veille.aucun}`);
console.log(`  endormissements : ${dodo}, réveils : ${reveils}`);
for (const [qui, n] of [...reveilleurs].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`    ${n} × ${qui}`);
console.log(`  événements armés (WFE ne dort pas) : ${armes}`);
for (const [qui, n] of [...armeurs].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`    ${n} × ${qui}`);
process.exit(0);
