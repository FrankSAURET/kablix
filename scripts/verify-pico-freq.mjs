// Régression rp2040js 1.4.0 (v2026.9.5.155) : `machine.freq()` sur Pico 1.
//
// La 1.4.0 simule les PLL : `mcu.clkSys` suit désormais la fréquence que le
// firmware programme (200 MHz après `machine.freq(200_000_000)`), et la PWM
// compte à cette fréquence. Le cœur, lui, avance toujours de 8 ns par cycle.
// pico.mts convertissait ses cycles en microsecondes par clkSys : passé à
// 200 MHz, une impulsion servo de 1,5 ms se lisait 0,94 ms — le bras tournait
// d'un bon quart de tour. Même conversion pour DHT, HC-SR04 et NeoPixel.
//
// Contre-épreuve sans toucher aux sources : `--ancien` compile pico.mts et
// rp-chip.mts dans leur version HEAD. Le banc DOIT échouer.
//
// Usage : node scripts/verify-pico-freq.mjs [--ancien]
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwareAbsent, firmwarePico } from './_firmware.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-freq-'));
const ANCIEN = process.argv.includes('--ancien');

let fail = 0;
let total = 0;
function check(label, ok, detail = '') {
	total++;
	if (!ok) fail++;
	console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// Chien de garde : un firmware muet ne doit pas figer `verify:all`.
setTimeout(() => {
	console.log('❌ banc figé (le programme n\'a jamais écrit FIN)');
	process.exit(1);
}, 180_000).unref();

/** Remplace à la compilation les moteurs Pico par leur version HEAD (`--ancien`). */
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /engines[\\/](pico|rp-chip)\.mts$/ }, (args) => {
			const nom = args.path.replace(/\\/g, '/').split('/').pop();
			const contents = execFileSync('git', ['show', `HEAD:src/webview/engines/${nom}`], { cwd: ROOT, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
if (ANCIEN) console.log('(contre-épreuve : pico.mts et rp-chip.mts en version HEAD)');

async function bundle(contents, name) {
	const out = join(tmp, name);
	await esbuild.build({
		stdin: { contents, resolveDir: ROOT, loader: 'ts' },
		outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
		plugins: ANCIEN ? [versionHead] : [],
	});
	return import(pathToFileURL(out).href);
}

const fw = firmwarePico('RPI_PICO-');
if (!fw) {
	console.log(`${firmwareAbsent('RPI_PICO-')} — banc sauté.`);
	process.exit(0);
}

// Servo à 1,5 ms sur 20 ms (neutre), réglé APRÈS le passage à 200 MHz :
// MicroPython calcule alors son diviseur PWM pour 200 MHz.
const script = `
import machine, time
print('F0', machine.freq())
machine.freq(200_000_000)
print('F1', machine.freq())
p = machine.PWM(machine.Pin(15))
p.freq(50)
p.duty_ns(1_500_000)
t = time.ticks_us()
time.sleep_ms(200)
print('D', time.ticks_diff(time.ticks_us(), t))
print('FIN')
`;

const { parseUf2 } = await bundle("export * from './src/shared/uf2.ts';\n", 'uf2.mjs');
const { PicoEngine } = await bundle("export * from './src/webview/engines/pico.mts';\n", 'pico.mjs');
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script }, 'rp2040');
engine.setPulseMonitors(['GP15']);
let serial = '';
engine.onSerial = (chunk) => { serial += chunk; };
const clkSysVus = new Set();
const suivant = engine.onUpdate;
engine.onUpdate = () => { clkSysVus.add(engine.mcu.clkSys); suivant?.(); };
engine.start();
await new Promise((resolve) => {
	const timer = setInterval(() => {
		if (serial.includes('FIN')) {
			clearInterval(timer);
			resolve();
		}
	}, 100);
});
const largeurUs = engine.readPulseUs('GP15');
const duty = engine.readPwmDuty('GP15');
engine.stop?.();
engine.dispose?.();

const lu = (cle) => Number(new RegExp(`^${cle} (\\d+)`, 'm').exec(serial)?.[1]);
check('machine.freq() part de 125 MHz', lu('F0') === 125_000_000, String(lu('F0')));
check('machine.freq(200 MHz) est accepté', lu('F1') === 200_000_000, String(lu('F1')));
check('rp2040js suit la PLL : clkSys passe à 200 MHz', clkSysVus.has(200_000_000),
	[...clkSysVus].map((f) => `${f / 1e6} MHz`).join(', '));
check('time.sleep_ms(200) dure 200 ms à 200 MHz', Math.abs(lu('D') - 200_000) < 2_000, `${lu('D')} µs`);
check('impulsion servo lue à 1 500 µs (± 2 %)', Math.abs(largeurUs - 1500) < 30, `${largeurUs.toFixed(1)} µs`);
check('rapport cyclique 1,5 / 20 ms (± 2 %)', Math.abs(duty - 0.075) < 0.0015, duty.toFixed(4));

console.log(`\n${total - fail}/${total} contrôles OK`);
process.exit(fail ? 1 : 0);
