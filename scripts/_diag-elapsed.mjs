// Traque le « NaN » du compteur de temps écoulé : interroge `simulatedMs()` des
// deux moteurs AVANT démarrage, juste après, et une fois lancés — c'est la seule
// façon de savoir lequel des trois instants rend un nombre invalide, puisque
// `formatElapsed()` transforme n'importe quel NaN en « NaN:NaN:NaN ».
//   node scripts/_diag-elapsed.mjs
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-elapsed-'));

async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dit = (quoi, v) => console.log(`  ${quoi.padEnd(22)} ${Number.isFinite(v) ? v.toFixed(3) : `>>> ${v} <<<`}`);

for (const famille of ['rp2040', 'rp2350']) {
	const prefixe = famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-';
	const fw = firmwarePico(prefixe);
	const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
	console.log(`\n${famille} (${fw.split(/[\\/]/).pop()})`);
	const engine = new PicoEngine({ kind: 'flash', segments, script: 'import time\nwhile True:\n    time.sleep_ms(10)\n' }, famille);
	dit('avant start', engine.simulatedMs());
	engine.start();
	dit('juste après start', engine.simulatedMs());
	await sleep(400);
	dit('après 400 ms', engine.simulatedMs());
	engine.stop();
	dit('après stop', engine.simulatedMs());
	// Deux façons de dire l'heure simulée : le compteur de cycles du cœur 0 et
	// l'horloge de la puce (celle des alarmes). Elles doivent concorder — sinon
	// le compteur affiché ment, et tout ce qui se date en cycles avec lui.
	const chip = engine.sim.chip;
	dit('horloge (ms)', chip.clock.nanos / 1e6);
	dit('cycles cœur 0', chip.core.cycles);
	dit('cycles attendus', (chip.clock.nanos / 1e9) * (famille === 'rp2350' ? 150e6 : 125e6));
}

// AVR : programme vide, on ne mesure que la validité du compteur.
console.log('\navr328');
const avr = new AvrEngine(new Uint16Array(1024), null, 'avr328');
dit('avant start', avr.simulatedMs());
avr.start();
await sleep(200);
dit('après 200 ms', avr.simulatedMs());
avr.stop();
dit('après stop', avr.simulatedMs());
process.exit(0);
