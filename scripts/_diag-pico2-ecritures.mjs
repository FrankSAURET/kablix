// Qui touche la liste des réveils du firmware ?
//
// On surveille les écritures dans la petite zone mémoire du « pool » d'alarmes
// du SDK et on note l'adresse d'où vient chaque écriture. Les dernières
// écritures avant que la liste ne se fige racontent ce qui s'est passé.
//   node scripts/_diag-pico2-ecritures.mjs [secondes] [début hex] [fin hex]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-ecr-'));
const duree = Number(process.argv[2] ?? 10) * 1000;
const DEBUT = Number(process.argv[3] ?? 0x20001780);
const FIN = Number(process.argv[4] ?? 0x20001a00);

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

const journal = [];
const debut = [];
const parPc = new Map();
const espion = (nom, methode) => {
	const orig = puce[methode].bind(puce);
	puce[methode] = (adr, val) => {
		if (adr >= DEBUT && adr < FIN) {
			const pc = core0.PC >>> 0;
			parPc.set(`${nom} depuis 0x${pc.toString(16)}`, (parPc.get(`${nom} depuis 0x${pc.toString(16)}`) ?? 0) + 1);
			const us = (puce.clock.nanos / 1000).toFixed(1);
			const ligne = `t=${us}µs ${nom} 0x${adr.toString(16)} = 0x${(val >>> 0).toString(16)} (depuis 0x${pc.toString(16)}, ipsr ${core0.regs.ipsr})`;
			if (debut.length < 90) debut.push(ligne);
			journal.push(ligne);
			if (journal.length > 400) journal.shift();
		}
		return orig(adr, val);
	};
};
espion('mot', 'writeUint32');
espion('octet', 'writeUint8');
espion('demi', 'writeUint16');

engine.onRunning = () => console.log('script démarré');
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();

console.log(`\nécritures par origine (${[...parPc.values()].reduce((a, b) => a + b, 0)} au total) :`);
for (const [k, n] of [...parPc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${k} → ${n}`);
console.log('\n90 premières écritures :');
for (const l of debut) console.log('  ' + l);
console.log('\n40 dernières écritures :');
for (const l of journal.slice(-40)) console.log('  ' + l);
process.exit(0);
