// Pourquoi la Pico 2 rame-t-elle ? Mesure du SOMMEIL du cœur.
//
// Le moteur ne saute à la prochaine alarme que quand la puce dort (`chip.dort()`).
// Sur RP2040 c'est le cas ~1000 fois par seconde ; sur RP2350 on n'en comptait
// que 19 (v2026.8.102.15), donc presque aucun saut : chaque microseconde
// simulée coûte des instructions émulées. Ce diagnostic dit QUI empêche le
// sommeil — le cœur 0 (le programme) ou le cœur 1 (celui que RP2350 a en plus,
// et que rp2040js n'avait pas) — et où tourne le fautif.
//
//   node scripts/_diag-pico2-sommeil.mjs [rp2040|rp2350] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-sommeil-'));
const famille = process.argv[2] ?? 'rp2350';
const duree = Number(process.argv[3] ?? 8) * 1000;

async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const fw = firmwarePico(famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-');
if (!fw) { console.log('firmware absent'); process.exit(1); }
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
// Le script d'essai se choisit : la durée du sommeil demandé change tout —
// un rendez-vous déjà passé ne s'arme pas, et le firmware attend alors les
// yeux ouverts. `--script=repos` laisse le REPL au repos, sans programme.
const SCRIPTS = {
	sleep10: 'import time\nwhile True:\n    time.sleep_ms(10)\n',
	sleep1: 'import time\nwhile True:\n    time.sleep_ms(1)\n',
	sleep1s: 'import time\nwhile True:\n    time.sleep(1)\n',
	boucle: 'while True:\n    pass\n',
	i2c: 'from machine import Pin, I2C\ni2c = I2C(0, sda=Pin(4), scl=Pin(5))\nprint(\'I2C\', i2c.scan())\nprint(\'FINI\')\n',
	repos: '',
};
const nomScript = (process.argv.find((a) => a.startsWith('--script=')) ?? '--script=sleep10').slice(9);
console.log(`script d'essai : ${nomScript}`);
const engine = new PicoEngine({ kind: 'flash', segments, script: SCRIPTS[nomScript] ?? SCRIPTS.sleep10 }, famille);

const chip = engine.sim.chip;
const puce = chip.puce;              // champ privé TS, bien réel à l'exécution
const core0 = famille === 'rp2350' ? puce.core[0] : puce.core;
const core1 = famille === 'rp2350' ? puce.core[1] : null;

let mesure = false;
// Deuxième question, une fois le coupable connu : le cœur exécute-t-il des WFE
// qui ne dorment PAS ? Sur ARM, une exception « arme » le registre d'événement,
// et le WFE suivant se contente de le désarmer — il repart sans dormir. Une
// pluie d'interruptions rend donc tous les WFE inutiles. On compte les entrées
// d'exception par numéro, et les WFE qui dorment vraiment.
const irq = new Map();
const evt = { armes: 0, consommes: 0, dodos: 0 };
if (core1) {
	const entryOrig = core0.exceptionEntry.bind(core0);
	core0.exceptionEntry = (n) => { if (mesure) irq.set(n, (irq.get(n) ?? 0) + 1); entryOrig(n); };
	let ev = core0.eventRegistered, wait = core0.waiting;
	Object.defineProperty(core0, 'eventRegistered', {
		get: () => ev,
		set: (v) => { if (mesure && v !== ev) { if (v) evt.armes++; else evt.consommes++; } ev = v; },
	});
	Object.defineProperty(core0, 'waiting', {
		get: () => wait,
		set: (v) => { if (mesure && v && !wait) evt.dodos++; wait = v; },
	});
}
const c = { dort: 0, dortVrai: 0, c0: 0, c1: 0, sauts: 0, nanosSautes: 0, lots: 0 };
const ipsrVus = new Map();
const modeVus = new Map();
const pc1 = new Map();               // où tourne le cœur 1 quand il ne dort pas
const pc0 = new Map();               // et le cœur 0, même question

const dortOrig = chip.dort.bind(chip);
chip.dort = () => {
	const r = dortOrig();
	if (mesure) {
		c.dort++;
		if (r) c.dortVrai++;
		if (core0.waiting) c.c0++; else {
			pc0.set(core0.PC, (pc0.get(core0.PC) ?? 0) + 1);
			// IPSR : le numéro de l'exception en cours, 0 quand le programme tourne
			// normalement. Le SDK s'en sert (`__get_current_exception`) pour choisir
			// entre s'endormir et attendre les yeux ouverts : cru DANS une
			// interruption, il attend les yeux ouverts. C'est vite fait de vérifier.
			const ipsr = (core0.regs?.xpsr ?? 0) & 0x1ff;
			ipsrVus.set(ipsr, (ipsrVus.get(ipsr) ?? 0) + 1);
			modeVus.set(String(core0.currentMode), (modeVus.get(String(core0.currentMode)) ?? 0) + 1);
		}
		if (core1) { if (core1.waiting) c.c1++; else pc1.set(core1.PC, (pc1.get(core1.PC) ?? 0) + 1); }
	}
	return r;
};
const sauterOrig = chip.sauter.bind(chip);
chip.sauter = (n) => { if (mesure) { c.sauts++; c.nanosSautes += n; } sauterOrig(n); };
const lotOrig = chip.executerLot.bind(chip);
chip.executerLot = (fin) => { if (mesure) c.lots++; lotOrig(fin); };

const top = (m, n = 4) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
	.map(([pc, k]) => `0x${pc.toString(16).padStart(8, '0')} (${k})`).join(' · ') || '—';

// Troisième question : SUR QUOI le cœur tourne-t-il en rond ? Un `time.sleep()`
// qui n'endort pas la puce lit forcément quelque chose en boucle — le compteur
// du TIMER, un registre d'état… L'adresse la plus lue nomme le coupable.
const lectures = new Map();
if (process.argv.includes('--lectures')) {
	const lireOrig = puce.readUint32.bind(puce);
	puce.readUint32 = (adr) => {
		if (mesure && adr >= 0x40000000) lectures.set(adr, (lectures.get(adr) ?? 0) + 1);
		return lireOrig(adr);
	};
}

// Quatrième question : le firmware ESSAIE-T-IL d'armer une alarme ? S'endormir
// suppose de dire au TIMER quand réveiller ; sans ce rendez-vous, il ne reste
// qu'à attendre les yeux ouverts. On compte les écritures vers le TIMER0.
const ecritures = new Map();
{
	const ecrireOrig = puce.writeUint32.bind(puce);
	puce.writeUint32 = (adr, v) => {
		if (mesure && (adr & 0xfffff000) === (famille === 'rp2350' ? 0x400b0000 : 0x40054000)) {
			ecritures.set(adr, (ecritures.get(adr) ?? 0) + 1);
		}
		return ecrireOrig(adr, v);
	};
}

let t0 = 0, sim0 = 0;
engine.onRunning = () => {
	mesure = true;
	t0 = performance.now();
	sim0 = engine.simulatedMs();
	console.log('  script démarré, mesure en cours…');
};

console.log(`${famille} — ${duree / 1000} s de mesure après le démarrage du script`);
engine.start();
await new Promise((r) => setTimeout(r, duree + 20000));
const mur = performance.now() - t0;
const simule = engine.simulatedMs() - sim0;
engine.stop();

console.log(`\n${simule.toFixed(0)} ms simulées en ${mur.toFixed(0)} ms réelles → ${(simule / mur).toFixed(3)}×`);
console.log(`consultations de dort() : ${c.dort} (${(c.dort / (mur / 1000)).toFixed(0)}/s), VRAI ${c.dortVrai} (${(100 * c.dortVrai / (c.dort || 1)).toFixed(1)} %)`);
console.log(`  cœur 0 endormi : ${(100 * c.c0 / (c.dort || 1)).toFixed(1)} %${core1 ? `   cœur 1 endormi : ${(100 * c.c1 / (c.dort || 1)).toFixed(1)} %` : ''}`);
console.log(`sauts d'alarme : ${c.sauts} (${(c.sauts / (mur / 1000)).toFixed(0)}/s), ${(c.nanosSautes / 1e6).toFixed(1)} ms simulées sautées (${(100 * c.nanosSautes / 1e6 / (simule || 1)).toFixed(1)} % du temps simulé)`);
console.log(`lots d'instructions : ${c.lots}`);
console.log(`PC du cœur 0 quand il ne dort pas : ${top(pc0)}`);
if (core1) console.log(`PC du cœur 1 quand il ne dort pas : ${top(pc1)}`);
if (core1) {
	console.log(`WFE qui dorment vraiment : ${evt.dodos} (${(evt.dodos / (mur / 1000)).toFixed(0)}/s)`);
	console.log(`registre d'événement : ${evt.armes} armements (${(evt.armes / (mur / 1000)).toFixed(0)}/s), ${evt.consommes} désarmements`);
	const tot = [...irq.values()].reduce((a, b) => a + b, 0);
	console.log(`exceptions prises par le cœur 0 : ${tot} (${(tot / (mur / 1000)).toFixed(0)}/s) — ` +
		([...irq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
			.map(([n, k]) => `n°${n}: ${k}`).join(' · ') || '—'));
}
console.log(`IPSR du cœur 0 hors sommeil : ` + [...ipsrVus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
	.map(([v, k]) => `${v} (${k})`).join(' · '));
console.log(`mode d'exécution : ` + [...modeVus.entries()].map(([v, k]) => `${v} (${k})`).join(' · '));
console.log(`écritures vers le TIMER : ` + ([...ecritures.entries()].sort((a, b) => b[1] - a[1])
	.map(([a, k]) => `0x${a.toString(16)} (${k})`).join(' · ') || 'AUCUNE'));
if (lectures.size) {
	const tot = [...lectures.values()].reduce((a, b) => a + b, 0);
	console.log(`lectures de périphérique : ${tot} — ` + [...lectures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
		.map(([a, k]) => `0x${a.toString(16)} (${(100 * k / tot).toFixed(0)} %)`).join(' · '));
	const parBloc = new Map();
	for (const [a, k] of lectures) {
		const base = a & 0xffff0000;
		parBloc.set(base, (parBloc.get(base) ?? 0) + k);
	}
	console.log(`  par bloc : ` + [...parBloc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
		.map(([a, k]) => `0x${a.toString(16)} (${(100 * k / tot).toFixed(1)} %)`).join(' · '));
}
process.exit(0);
