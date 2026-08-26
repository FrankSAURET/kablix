// Journal des échanges avec le réveille-matin (TIMER0) du Pico 2, pendant que
// le programme enchaîne des `sleep_ms(10)`.
//
// Question posée : le firmware ne s'endort que SEIZE fois, puis attend les yeux
// ouverts pour toujours. Seize, c'est le nombre de cases de la liste de réveils
// du SDK — d'où le soupçon d'une case jamais rendue. Ce journal montre chaque
// armement, chaque désarmement, chaque sonnerie et chaque acquittement.
//
//   node scripts/_diag-pico2-alarme-trace.mjs [rp2350|rp2040]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-trace-'));
const famille = process.argv[2] ?? 'rp2350';

async function load(entry, name) {
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: join(tmp, name), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(join(tmp, name)).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const fw = firmwarePico(famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-');
if (!fw) { console.log('firmware absent'); process.exit(1); }
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script: 'import time\nwhile True:\n    time.sleep_ms(10)\n' }, famille);

const chip = engine.sim.chip;            // champ privé TS, bien réel à l'exécution
const puce = chip.puce;
const core0 = famille === 'rp2350' ? puce.core[0] : puce.core;
const CLE = famille === 'rp2350' ? 0x400b0 : 0x40054;
const timer = puce.peripherals[CLE];

// Noms des registres, pour lire le journal sans compter les offsets à la main.
const NOMS = famille === 'rp2350'
	? { 0x10: 'ALARM0', 0x14: 'ALARM1', 0x18: 'ALARM2', 0x1c: 'ALARM3', 0x20: 'ARMED', 0x34: 'LOCKED', 0x38: 'SOURCE', 0x3c: 'INTR', 0x40: 'INTE', 0x44: 'INTF', 0x48: 'INTS' }
	: { 0x10: 'ALARM0', 0x14: 'ALARM1', 0x18: 'ALARM2', 0x1c: 'ALARM3', 0x20: 'ARMED', 0x34: 'INTR', 0x38: 'INTE', 0x3c: 'INTF', 0x40: 'INTS' };
const TYPES = ['', ' (ou-exclusif)', ' (mise à 1)', ' (mise à 0)'];

let journal = [];
let mesure = false;
const DEBUT = Number(process.argv[3] ?? 0);   // ms simulees a partir desquelles on note
const ligne = (t) => { if (mesure && puce.clock.nanos / 1e6 >= DEBUT && journal.length < 120) journal.push(t); };
const ms = () => (puce.clock.nanos / 1e6).toFixed(3);

const ecrireOrig = timer.writeUint32Atomic.bind(timer);
timer.writeUint32Atomic = (offset, valeur, type) => {
	ligne(`${ms()}  écrit ${NOMS[offset] ?? '0x' + offset.toString(16)} = 0x${(valeur >>> 0).toString(16)}${TYPES[type] ?? ''}`);
	return ecrireOrig(offset, valeur, type);
};
const sonneOrig = timer.fireAlarm.bind(timer);
timer.fireAlarm = (i) => { ligne(`${ms()}  ALARME ${i} SONNE`); return sonneOrig(i); };
const excOrig = core0.exceptionEntry.bind(core0);
core0.exceptionEntry = (n) => { if (n >= 16) ligne(`${ms()}  interruption n°${n}`); return excOrig(n); };
let dort = core0.waiting;
Object.defineProperty(core0, 'waiting', {
	get: () => dort,
	set: (v) => { if (v && !dort) ligne(`${ms()}  DORT`); dort = v; },
});

engine.onSerial = () => {};
engine.onRunning = () => { mesure = true; setTimeout(fin, 30000); };
engine.start();

function fin() {
	console.log(`${famille} — journal du réveille-matin (${journal.length} événements)\n`);
	for (const l of journal) console.log('  ' + l);
	engine.dispose();
	process.exit(0);
}
