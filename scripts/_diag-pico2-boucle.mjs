// La boucle d'attente du Pico 2, instruction par instruction.
//
// `_diag-pico2-sommeil.mjs` a montré que le cœur ne dort presque jamais et qu'il
// passe son temps à relire le compteur du TIMER (0x400b0024/28 = time_us_64).
// Ici on capture la SUITE des adresses exécutées, une fois la simulation
// stabilisée, et on affiche les demi-mots du firmware en face : de quoi
// reconnaître la boucle et voir si elle appelle quelque chose (BL) ou si elle
// tourne à vide sur le temps.
//   node scripts/_diag-pico2-boucle.mjs [rp2350|rp2040] [nb d'instructions]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-boucle-'));
const famille = process.argv[2] ?? 'rp2350';
const combien = Number(process.argv[3] ?? 300);

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

const trace = [];
let capture = false;
if (famille === 'rp2350') {
	const orig = puce.stepCores.bind(puce);
	puce.stepCores = () => { if (capture && trace.length < combien) trace.push(core0.PC >>> 0); return orig(); };
} else {
	const orig = core0.executeInstruction.bind(core0);
	core0.executeInstruction = () => { if (capture && trace.length < combien) trace.push(core0.PC >>> 0); return orig(); };
}

// Espion sur une adresse précise : `--ipsr=0x100338cc` compte, à chaque passage
// par cette instruction, la valeur d'IPSR (numéro de l'exception en cours, 0
// hors interruption) et les quelques adresses suivies juste après. C'est ainsi
// qu'on voit quelle branche le firmware prend, et pourquoi.
const cible = Number((process.argv.find((a) => a.startsWith('--ipsr=')) ?? '').slice(7)) || 0;
const ipsrVus = new Map();
const suites = new Map();
let restePourSuite = 0, suiteCourante = [];
if (cible) {
	const orig2 = puce.stepCores.bind(puce);
	puce.stepCores = () => {
		const pc = core0.PC >>> 0;
		if (pc === cible) {
			const ipsr = (core0.regs?.xpsr ?? 0) & 0x1ff;
			ipsrVus.set(ipsr, (ipsrVus.get(ipsr) ?? 0) + 1);
			if (suites.size < 6) { restePourSuite = 14; suiteCourante = []; }
		}
		if (restePourSuite > 0) {
			suiteCourante.push(pc);
			if (--restePourSuite === 0) suites.set(suiteCourante.map((a) => a.toString(16)).join(' '), 1);
		}
		return orig2();
	};
}

engine.onRunning = () => setTimeout(() => { capture = true; }, 2000);
engine.start();
await new Promise((r) => setTimeout(r, 40000));
engine.stop();

const flash = puce.flash;
const demiMot = (adr) => {
	const off = (adr >>> 0) - 0x10000000;
	if (off < 0 || off + 1 >= flash.length) return '????';
	return (flash[off] | (flash[off + 1] << 8)).toString(16).padStart(4, '0');
};

console.log(`${trace.length} instructions capturées\n`);
// Suite brute : c'est la forme de la boucle qui parle.
let dernier = null, repetitions = 0;
for (const pc of trace.slice(0, 120)) {
	if (pc === dernier) { repetitions++; continue; }
	if (repetitions) console.log(`      … × ${repetitions}`);
	repetitions = 0;
	dernier = pc;
	console.log(`  0x${pc.toString(16)}  ${demiMot(pc)} ${demiMot(pc + 2)}`);
}
if (cible) {
	console.log(`\nIPSR aux passages par 0x${cible.toString(16)} : ` +
		[...ipsrVus.entries()].sort((a, b) => b[1] - a[1]).map(([v, k]) => `${v} (${k} fois)`).join(' · '));
	for (const suite of suites.keys()) console.log(`  suite : ${suite}`);
}
const uniques = new Set(trace);
console.log(`\n${uniques.size} adresses distinctes sur ${trace.length} pas`);
process.exit(0);
