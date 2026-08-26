// Quels matériels le firmware touche-t-il pendant qu'il attend ?
//   node scripts/_diag-pico2-perif.mjs [script] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-per-'));
const nom = process.argv[2] ?? 'sleep10';
const duree = Number(process.argv[3] ?? 6) * 1000;

async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const SCRIPTS = {
	sleep10: 'import time\nwhile True:\n    time.sleep_ms(10)\n',
	i2c: 'from machine import Pin, I2C\ni2c = I2C(0, sda=Pin(4), scl=Pin(5))\nprint(\'I2C\', i2c.scan())\nprint(\'FINI\')\n',
};
const segments = parseUf2(new Uint8Array(readFileSync(firmwarePico('RPI_PICO2-')))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script: SCRIPTS[nom] ?? SCRIPTS.sleep10 }, 'rp2350');
const puce = engine.sim.chip.puce;

const compte = new Map();
const ajoute = (k) => compte.set(k, (compte.get(k) ?? 0) + 1);
for (const cle of Object.keys(puce.peripherals)) {
	const perif = puce.peripherals[Number(cle)];
	const etiquette = `0x${Number(cle).toString(16)} ${perif?.constructor?.name ?? '?'}`;
	const lire = perif.readUint32.bind(perif);
	const ecrire = perif.writeUint32.bind(perif);
	perif.readUint32 = (offset) => { ajoute(`lit  ${etiquette} +0x${offset.toString(16)}`); return lire(offset); };
	perif.writeUint32 = (offset, value) => { ajoute(`écrit ${etiquette} +0x${offset.toString(16)}`); return ecrire(offset, value); };
}
const origGpio = puce.gpioValues.bind(puce);
puce.gpioValues = (start) => { ajoute('lit  SIO GPIO_IN'); return origGpio(start); };

engine.onRunning = () => console.log(`script ${nom} démarré`);
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();
console.log('\naccès matériel, du plus fréquent au moins fréquent :');
for (const [k, n] of [...compte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`  ${n.toString().padStart(9)}  ${k}`);
process.exit(0);
