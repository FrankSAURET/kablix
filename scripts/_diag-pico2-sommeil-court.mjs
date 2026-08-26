// Contrôle des sommeils COURTS après le saut d'attente active (v2026.8.102.21).
//
// Le saut avance l'horloge d'un bloc d'une milliseconde quand le cœur ne fait
// que regarder la pendule. Un `time.sleep_us(10)` est justement une boucle qui
// regarde la pendule : s'il se faisait sauter, il durerait mille fois trop
// longtemps, et tout ce qui compte les microsecondes (capteur DHT, télémètre à
// ultrasons, bus bit-bangé) mesurerait n'importe quoi.
//
// Ce banc fait mesurer au PROGRAMME lui-même la durée de ses propres sommeils,
// avec sa propre horloge. Aucune fausse note possible : c'est exactement ce que
// verrait un pilote de capteur.
//
//   node scripts/_diag-pico2-sommeil-court.mjs [rp2350|rp2040]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const famille = process.argv[2] === 'rp2040' ? 'rp2040' : 'rp2350';
const fw = firmwarePico(famille === 'rp2040' ? 'RPI_PICO-' : 'RPI_PICO2-');
if (!fw) { console.log('SKIP : firmware absent.'); process.exit(0); }

const tmp = mkdtempSync(join(tmpdir(), 'kx-court-'));
async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

// Chaque mesure : N sommeils d'affilée, chronométrés par le programme. La
// moyenne attendue est la durée demandée, à la poignée de microsecondes que
// coûtent l'appel et la boucle. `time_pulse_us` est le cas du télémètre : une
// attente de front sur une broche EN L'AIR, qui doit rendre la main au bout de
// son délai et pas mille fois plus tard.
const lignes = [
	'import time',
	'from machine import Pin',
	'def mesure(nom, n, f):',
	'    v = []',
	'    for _ in range(n):',
	'        t0 = time.ticks_us()',
	'        f()',
	'        v.append(time.ticks_diff(time.ticks_us(), t0))',
	'    print(nom, sum(v) // n, "min", min(v), "max", max(v))',
	'mesure("sleep_us(5)", 200, lambda: time.sleep_us(5))',
	'mesure("sleep_us(10)", 200, lambda: time.sleep_us(10))',
	'mesure("sleep_us(50)", 100, lambda: time.sleep_us(50))',
	'mesure("sleep_us(500)", 50, lambda: time.sleep_us(500))',
	'mesure("sleep_ms(1)", 20, lambda: time.sleep_ms(1))',
	'mesure("sleep_ms(10)", 10, lambda: time.sleep_ms(10))',
	'p = Pin(14, Pin.IN)',
	'mesure("time_pulse_us(1ms)", 5, lambda: time.sleep_us(0) or machine_pulse(p))',
	'print("FINI")',
	'',
].join('\n');
// `machine_pulse` défini avant usage (le lambda ne l'évalue qu'à l'appel).
const script = 'from machine import time_pulse_us\ndef machine_pulse(p):\n    time_pulse_us(p, 1, 1000)\n' + lignes;

const engine = new PicoEngine({ kind: 'flash', segments, script }, famille);
let serie = '';
engine.onSerial = (c) => { serie += c; process.stdout.write(c); };
console.log(`sommeils courts sur ${famille} — durée MESURÉE par le programme, en µs`);
engine.start();
const t0 = Date.now();
await new Promise((r) => {
	const t = setInterval(() => {
		if (serie.includes('FINI') || Date.now() - t0 > 300000) { clearInterval(t); r(); }
	}, 200);
});
engine.dispose();

// Verdict : chaque mesure doit rester dans le même ordre de grandeur que la
// durée demandée. Un facteur 10 signe un saut qui a mangé le sommeil.
const ATTENDU = { 'sleep_us(5)': 5, 'sleep_us(10)': 10, 'sleep_us(50)': 50, 'sleep_us(500)': 500, 'sleep_ms(1)': 1000, 'sleep_ms(10)': 10000, 'time_pulse_us(1ms)': 1000 };
let mauvais = 0;
for (const [nom, cible] of Object.entries(ATTENDU)) {
	const m = new RegExp(`^${nom.replace(/[()]/g, '\\$&')} (\\d+)`, 'm').exec(serie);
	if (!m) { console.log(`  ? ${nom} : pas de mesure`); mauvais++; continue; }
	const vu = Number(m[1]);
	const ok = vu <= Math.max(cible * 3, cible + 60);
	if (!ok) mauvais++;
	console.log(`  ${ok ? '✓' : '✗'} ${nom} : ${vu} µs mesurés (demandé ${cible})`);
}
console.log(mauvais === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${mauvais})`);
process.exit(mauvais === 0 ? 0 : 1);
