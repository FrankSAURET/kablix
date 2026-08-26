// Pourquoi le Pico 2 ne pose-t-il jamais son réveil ?
//
// Le firmware appelle `alarm_pool_add_alarm_at(pool, échéance, …)`. Quand
// l'échéance est DÉJÀ passée, le SDK renvoie 0 sans rien armer et le cœur
// repart attendre les yeux ouverts. On espionne donc l'appel : échéance
// demandée moins heure courante, en microsecondes. Un écart négatif à chaque
// appel = le firmware demande un réveil dans le passé.
//   node scripts/_diag-pico2-alarme.mjs [secondes] [adresse hex de add_alarm_at]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-alarme-'));
const duree = Number(process.argv[2] ?? 15) * 1000;
const ADD_ALARM = Number(process.argv[3] ?? 0x10033818);

async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const segments = parseUf2(new Uint8Array(readFileSync(firmwarePico('RPI_PICO2-')))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script: 'import time\nwhile True:\n    time.sleep_ms(10)\n' }, 'rp2350');
const puce = engine.sim.chip.puce;
const core0 = puce.core[0];
const horloge = puce.clock;

// Classement des écarts : combien d'appels demandent le passé, et de combien.
const paniers = new Map();
const panier = (us) => {
	if (us < -10000) return 'passé de plus de 10 ms';
	if (us < -1000) return 'passé de 1 à 10 ms';
	if (us < -100) return 'passé de 0,1 à 1 ms';
	if (us < 0) return 'passé de moins de 0,1 ms';
	if (us === 0) return 'maintenant (0 µs)';
	if (us < 100) return 'futur de moins de 0,1 ms';
	if (us < 1000) return 'futur de 0,1 à 1 ms';
	if (us < 10000) return 'futur de 1 à 10 ms';
	return 'futur de plus de 10 ms';
};
// Second espion : la valeur rendue par add_alarm_at, lue au retour de l'appel.
// 0 = « échéance déjà passée », négatif = « plus de place dans la liste des
// réveils », positif = un vrai réveil posé.
const RETOUR = Number(process.argv[4] ?? 0x10033924);
const retours = new Map();
let appels = 0;
const exemples = [];
const orig = puce.stepCores.bind(puce);
puce.stepCores = () => {
	if ((core0.PC >>> 0) === ADD_ALARM) {
		const r = core0.regs.r;
		const cible = (r[3] >>> 0) * 2 ** 32 + (r[2] >>> 0);
		const maintenant = Math.floor(horloge.getNanos() / 1000);
		const ecart = cible - maintenant;
		const cle = panier(ecart);
		paniers.set(cle, (paniers.get(cle) ?? 0) + 1);
		appels++;
		if (exemples.length < 12) exemples.push({ cible, maintenant, ecart });
	}
	if ((core0.PC >>> 0) === RETOUR) {
		const v = core0.regs.r[0] | 0;
		const cle = v > 0 ? 'réveil posé' : v === 0 ? '0 = échéance déjà passée' : `${v} = liste pleine`;
		retours.set(cle, (retours.get(cle) ?? 0) + 1);
	}
	return orig();
};

engine.onRunning = () => console.log('script démarré');
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();

console.log(`\n${appels} appels à add_alarm_at (0x${ADD_ALARM.toString(16)})`);
for (const [cle, n] of [...paniers.entries()].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${cle} : ${n} (${(100 * n / appels).toFixed(1)} %)`);
}
console.log('\nvaleurs rendues par add_alarm_at :');
for (const [cle, n] of [...retours.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${cle} : ${n}`);
console.log('\npremiers appels (µs) :');
for (const e of exemples) console.log(`  échéance ${e.cible} · heure ${e.maintenant} · écart ${e.ecart}`);
process.exit(0);
