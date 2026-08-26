// Où le firmware s'endort-il — et où ne le fait-il PAS ?
//
// Le cœur ne dort que sur l'instruction WFE (« attends un événement »). On
// repère d'abord, dans le firmware, TOUTES les adresses qui portent WFE / WFI /
// SEV, puis on compte combien de fois chacune est réellement exécutée pendant
// une simulation. Comparer RP2040 et RP2350 montre laquelle manque à l'appel.
//   node scripts/_diag-pico2-wfe.mjs [rp2350|rp2040] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-wfe-'));
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
const chip = engine.sim.chip;
const puce = chip.puce;
const core0 = famille === 'rp2350' ? puce.core[0] : puce.core;

// Balayage du firmware : chaque demi-mot égal à un des trois codes machine.
const NOMS = new Map([[0xbf20, 'WFE'], [0xbf30, 'WFI'], [0xbf40, 'SEV']]);
const flash = puce.flash;
const interessantes = new Map();
for (let off = 0; off + 1 < flash.length; off += 2) {
	const mot = flash[off] | (flash[off + 1] << 8);
	if (NOMS.has(mot)) interessantes.set((0x10000000 + off) >>> 0, NOMS.get(mot));
}
console.log(`${interessantes.size} adresses WFE/WFI/SEV dans le firmware`);

const compte = new Map();
let pas = 0;
const noter = () => {
	const pc = core0.PC >>> 0;
	pas++;
	if (interessantes.has(pc)) compte.set(pc, (compte.get(pc) ?? 0) + 1);
};
if (famille === 'rp2350') {
	const orig = puce.stepCores.bind(puce);
	puce.stepCores = () => { noter(); return orig(); };
} else {
	const orig = core0.executeInstruction.bind(core0);
	core0.executeInstruction = () => { noter(); return orig(); };
}

let demarre = false;
engine.onRunning = () => { demarre = true; console.log('script démarré'); };
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();

const demiMot = (adr) => {
	const off = (adr >>> 0) - 0x10000000;
	if (off < 0 || off + 1 >= flash.length) return '????';
	return (flash[off] | (flash[off + 1] << 8)).toString(16).padStart(4, '0');
};

console.log(`\ndémarré : ${demarre} · ${pas} instructions tracées`);
console.log('adresses de sommeil réellement exécutées :');
for (const [pc, n] of [...compte.entries()].sort((a, b) => b[1] - a[1])) {
	const avant = [-8, -6, -4, -2].map((d) => demiMot(pc + d)).join(' ');
	console.log(`  0x${pc.toString(16)} ${interessantes.get(pc)} × ${n}   avant: ${avant}  après: ${demiMot(pc + 2)} ${demiMot(pc + 4)}`);
}
if (!compte.size) console.log('  (aucune)');
process.exit(0);
