// Pourquoi le WFE du Pico 2 ne dort-il pas ?
//
// WFE ne dort que si le « registre d'événement » du cœur est vide. Quelque
// chose le remplit sans arrêt : on note, pour les premiers remplissages, d'où
// vient l'appel côté émulateur (pile JavaScript) et où en est le firmware.
//   node scripts/_diag-pico2-evenement.mjs [secondes] [combien de piles]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-evt-'));
const duree = Number(process.argv[2] ?? 10) * 1000;
const COMBIEN = Number(process.argv[3] ?? 25);

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

const origines = new Map();
const piles = [];
let arme = 0;
let brut = core0.eventRegistered;
Object.defineProperty(core0, 'eventRegistered', {
	get() { return brut; },
	set(v) {
		if (v && !brut) {
			arme++;
			const pile = (new Error().stack ?? '').split('\n').slice(1, 4).map((l) => l.trim().replace(/ \(.*/, '')).join(' ← ');
			origines.set(pile, (origines.get(pile) ?? 0) + 1);
			if (piles.length < COMBIEN) piles.push(`pc 0x${(core0.PC >>> 0).toString(16)} ipsr ${core0.regs.ipsr} · ${pile}`);
		}
		brut = v;
	},
	configurable: true,
});

engine.onRunning = () => console.log('script démarré');
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();

console.log(`\n${arme} remplissages du registre d'événement`);
console.log("origines (côté émulateur) :");
for (const [k, n] of [...origines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${n} × ${k}`);
console.log('\npremiers remplissages :');
for (const l of piles) console.log('  ' + l);
process.exit(0);
