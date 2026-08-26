// Le rendez-vous du TIMER est-il posé à la bonne heure ?
//
// On note chaque écriture dans les registres du TIMER0 (dont ALARM3, le
// rendez-vous que le firmware pose avant de s'endormir) et chaque
// déclenchement d'alarme, avec l'heure simulée. Si le déclenchement arrive
// une microseconde après la pose alors que le rendez-vous est dans 10 ms,
// c'est le compte à rebours qui est faux.
//   node scripts/_diag-pico2-timer.mjs [rp2350|rp2040] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-tmr-'));
const famille = process.argv[2] === 'rp2040' ? 'rp2040' : 'rp2350';
const duree = Number(process.argv[3] ?? 6) * 1000;

async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const prefixe = famille === 'rp2040' ? 'RPI_PICO-' : 'RPI_PICO2-';
const segments = parseUf2(new Uint8Array(readFileSync(firmwarePico(prefixe)))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script: 'import time\nwhile True:\n    time.sleep_ms(10)\n' }, famille);
const puce = engine.sim.chip.puce;
const timer = puce.peripherals[famille === 'rp2040' ? 0x40054 : 0x400b0];
const core0 = puce.core?.[0] ?? puce.core;
const journal = [];
const base = famille === 'rp2040' ? 0x34 : 0x3c;
const NOMS = { 0x10: 'ALARM0', 0x14: 'ALARM1', 0x18: 'ALARM2', 0x1c: 'ALARM3', 0x20: 'ARMED',
	[base]: 'INTR', [base + 4]: 'INTE', [base + 8]: 'INTF', [base + 12]: 'INTS' };
const note = (l) => { journal.push(l); if (journal.length > 120) journal.shift(); };
const nanos = () => (puce.clock.getNanos ? puce.clock.getNanos() : puce.clock.nanos);
const us = () => (nanos() / 1000).toFixed(1);

const origWrite = timer.writeUint32.bind(timer);
timer.writeUint32 = (offset, value) => {
	const nom = NOMS[offset];
	if (nom) note(`t=${us()}µs écrit ${nom} = ${value >>> 0} (0x${(value >>> 0).toString(16)}) [pc=0x${(core0.PC >>> 0).toString(16)}, ipsr ${core0.regs.ipsr}]`);
	if (offset >= 0x10 && offset <= 0x1c) {
		const delta = (value - nanos() / 1000) >>> 0;
		note(`      → compte à rebours calculé : ${delta} µs`);
	}
	return origWrite(offset, value);
};
// Les lectures aussi : c'est en lisant l'heure que le gestionnaire décide si
// le rendez-vous est arrivé. Une heure lue de travers et il croit avoir tout
// raté.
const LUS = { 0x08: 'TIMEHR', 0x0c: 'TIMELR', 0x24: 'TIMERAWH', 0x28: 'TIMERAWL', 0x20: 'ARMED' };
const origRead = timer.readUint32.bind(timer);
timer.readUint32 = (offset) => {
	const v = origRead(offset);
	const nom = LUS[offset] ?? (offset === base + 12 ? 'INTS' : null);
	// Hors interruption, ces lectures sont l'attente active : des milliers par
	// milliseconde, illisibles. Seul le gestionnaire (ipsr non nul) nous parle.
	if (nom && core0.regs.ipsr) note(`t=${us()}µs lit ${nom} = ${v >>> 0} (0x${(v >>> 0).toString(16)}) [pc=0x${(core0.PC >>> 0).toString(16)}, ipsr ${core0.regs.ipsr}]`);
	return v;
};
const origFire = timer.fireAlarm.bind(timer);
timer.fireAlarm = (index) => {
	note(`t=${us()}µs DÉCLENCHE alarme ${index}`);
	return origFire(index);
};

engine.onRunning = () => console.log('script démarré');
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();
console.log(`\ntimer trouvé : ${timer?.constructor?.name}`);
console.log('60 derniers événements du TIMER0 :');
for (const l of journal) console.log('  ' + l);
process.exit(0);
