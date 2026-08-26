// Le premier réveil se pose, le dix-septième échoue. Où le chemin bifurque-t-il ?
//
// On enregistre la suite des adresses exécutées lors du Nième appel à
// `add_alarm_at`, pour deux N différents (un qui réussit, un qui échoue), et on
// affiche les deux traces jusqu'à leur point de divergence.
//   node scripts/_diag-pico2-divergence.mjs [appelA] [appelB] [pas] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-div-'));
const A = Number(process.argv[2] ?? 1);
const B = Number(process.argv[3] ?? 20);
const PAS = Number(process.argv[4] ?? 400);
const duree = Number(process.argv[5] ?? 12) * 1000;
const ADD_ALARM = 0x10033818;

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

let appel = 0, enCours = null;
const traces = new Map();
const orig = puce.stepCores.bind(puce);
puce.stepCores = () => {
	const pc = core0.PC >>> 0;
	if (pc === ADD_ALARM) {
		appel++;
		if (appel === A || appel === B) { enCours = []; traces.set(appel, enCours); }
	}
	if (enCours) {
		const r = core0.regs.r;
		enCours.push(`0x${pc.toString(16)}  r0=${(r[0] >>> 0).toString(16)} r1=${(r[1] >>> 0).toString(16)} r2=${(r[2] >>> 0).toString(16)} r3=${(r[3] >>> 0).toString(16)}`);
		if (enCours.length >= PAS) enCours = null;
	}
	return orig();
};

engine.onRunning = () => console.log('script démarré');
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();

const ta = traces.get(A) ?? [], tb = traces.get(B) ?? [];
console.log(`\nappel ${A} : ${ta.length} pas · appel ${B} : ${tb.length} pas`);
let i = 0;
while (i < ta.length && i < tb.length && ta[i].split(' ')[0] === tb[i].split(' ')[0]) i++;
console.log(`même chemin sur ${i} instructions, puis :`);
for (let k = Math.max(0, i - 12); k < Math.min(ta.length, i + 8); k++) {
	const marque = k === i ? '>>' : '  ';
	console.log(`${marque} A ${ta[k] ?? '—'}`);
	console.log(`${marque} B ${tb[k] ?? '—'}`);
}
process.exit(0);
