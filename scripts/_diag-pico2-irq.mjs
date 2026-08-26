// L'état du contrôleur d'interruptions pendant que le Pico 2 rame.
//
// La liste des réveils du firmware se remplit et ne se vide plus. Or elle ne se
// vide que dans l'interruption du TIMER. On regarde donc, par sondages
// réguliers : le masque global d'interruptions (PRIMASK), l'interruption
// TIMER0_IRQ_3 (autorisée ? en attente ? en cours ?) et l'alarme matérielle.
//   node scripts/_diag-pico2-irq.mjs [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-irq-'));
const duree = Number(process.argv[2] ?? 12) * 1000;

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

const compte = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
const masques = new Map(), etatIrq3 = new Map();
let sondages = 0, pas = 0;
const orig = puce.stepCores.bind(puce);
puce.stepCores = () => {
	if ((++pas % 50000) === 0) {
		sondages++;
		const r = core0.regs;
		compte(masques, `primask ${r.primask} · basepri ${r.basepri} · faultmask ${r.faultmask} · ipsr ${r.ipsr}`);
		const st = core0.ppb();
		const bit = 1 << 3;
		compte(etatIrq3, `autorisée ${!!(st.nvicEnabled[0] & bit)} · en attente ${!!(st.nvicPending[0] & bit)} · en cours ${!!(st.nvicActive[0] & bit)} · priorité ${st.nvicPriority[3]}`);
	}
	return orig();
};

engine.onRunning = () => console.log('script démarré');
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();

console.log(`\n${sondages} sondages sur ${pas} instructions`);
console.log('masques du cœur 0 :');
for (const [k, n] of [...masques.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${k} → ${n}`);
console.log('interruption TIMER0_IRQ_3 :');
for (const [k, n] of [...etatIrq3.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${k} → ${n}`);

// L'alarme matérielle elle-même : armée ? pour quand ?
const timer = puce.peripherals?.[0x400b0] ?? null;
if (timer) {
	const a = timer.alarms?.map((al, i) => `alarme ${i} : ${al.armed ? 'armée' : 'au repos'} pour ${al.targetMicros} µs`);
	console.log('TIMER0 :\n  ' + (a ?? ['(inaccessible)']).join('\n  '));
	console.log(`  intRaw ${timer.intRaw} · intEnable ${timer.intEnable}`);
}
process.exit(0);
