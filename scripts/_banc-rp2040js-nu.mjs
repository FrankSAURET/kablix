// MIROIR de kablix-eval.ts, mais sur NOTRE moteur : rp2040js 1.3.3 patché
// (+30 %), MicroPython Pico 1, même charge, même méthode de mesure.
// Sans ce miroir, « 70 M cycles/s » annoncés par rp2350js ne se compare à rien.
//
// Lancer depuis la racine Kablix :
//   node "V:/Temp/.../scratchpad/banc-rp2040js-nu.mjs"
import esbuild from 'esbuild';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RP2040, USBCDC } from 'rp2040js';

const root = process.cwd();
const CYCLE_NANOS = 1e9 / 125_000_000;

function firmware() {
	const dirs = [
		join(root, 'test-assets'),
		join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
	];
	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		const hit = readdirSync(dir).find((n) => /^RPI_PICO-.*\.uf2$/.test(n));
		if (hit) return join(dir, hit);
	}
	return process.env.KABLIX_FW;
}
const fw = firmware();
if (!fw || !existsSync(fw)) {
	console.log('SKIP : firmware Pico introuvable');
	process.exit(0);
}
console.log(`[banc] firmware ${fw}`);

const tmp = mkdtempSync(join(tmpdir(), 'banc-nu-'));
async function charger(entry, nom) {
	const out = join(tmp, nom);
	await esbuild.build({
		entryPoints: [join(root, entry)], outfile: out, bundle: true,
		platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
	});
	return import(pathToFileURL(out).href);
}
const { loadPythonProgram } = await charger('src/compiler.ts', 'compiler.mjs');
const { bootromB1 } = await charger('src/webview/engines/bootrom-b1.mts', 'bootrom.mjs');

// Programme sans script : on veut le REPL nu, comme dans kablix-eval.ts.
const program = loadPythonProgram(fw, '', false);
const FLASH_START = 0x10000000;

const mcu = new RP2040();
mcu.loadBootrom(bootromB1);
for (const s of program.payload.segments) {
	const data = new Uint8Array(Buffer.from(s.b64, 'base64'));
	const offset = s.addr - FLASH_START;
	if (offset < 0 || offset + data.length > mcu.flash.length) continue;
	mcu.flash.set(data, offset);
}
mcu.core.PC = FLASH_START;

const cdc = new USBCDC(mcu.usbCtrl);
let sortie = '';
cdc.onDeviceConnected = () => { cdc.sendSerialByte(13); cdc.sendSerialByte(10); };
cdc.onSerialData = (buf) => { for (const b of buf) sortie += String.fromCharCode(b); };

// Anti-tempête USB de pico.mts : sans lui le régime en sommeil est faussé.
const usb = mcu.usbCtrl;
const cdcEndpointRead = usb.onEndpointRead;
const emptyOut = new Uint8Array(0);
usb.onEndpointRead = (endpoint, byteCount) => {
	if (endpoint === cdc.outEndpoint && cdc.txFIFO.itemCount === 0) {
		usb.endpointReadDone(endpoint, emptyOut, 1000);
	} else {
		cdcEndpointRead?.(endpoint, byteCount);
	}
};

const clock = mcu.clock ?? mcu.core.clock;
let instructions = 0;

// Boucle IDENTIQUE à celle de pico.mts (hors cadencement temps réel) : une
// instruction, les deux PIO avancés, l'horloge tickée par instruction.
function tourne(n) {
	for (let i = 0; i < n; i++) {
		if (mcu.core.waiting) {
			const saut = clock.nanosToNextAlarm;
			if (saut <= 0) break;
			const jumpCycles = saut / CYCLE_NANOS;
			mcu.core.cycles += jumpCycles;
			mcu.pio[0].advance(jumpCycles);
			mcu.pio[1].advance(jumpCycles);
			clock.tick(saut);
			continue;
		}
		const c = mcu.core.executeInstruction();
		mcu.pio[0].advance(c);
		mcu.pio[1].advance(c);
		clock.tick(c * CYCLE_NANOS);
		instructions++;
	}
}

function tourneJusqua(pred, maxInstr = 400_000_000) {
	const lot = 20_000;
	for (let fait = 0; fait < maxInstr; fait += lot) {
		if (pred()) return true;
		tourne(lot);
	}
	return pred();
}
const envoie = (s) => { for (const ch of s) cdc.sendSerialByte(ch.charCodeAt(0)); };
function repl(ligne, maxInstr = 800_000_000) {
	sortie = '';
	envoie(ligne + '\r\n');
	const ok = tourneJusqua(() => sortie.includes('>>> ') || sortie.includes('... '), maxInstr);
	return ok ? sortie : sortie + '\n[TIMEOUT]';
}
function replBloc(lignes, maxInstr = 2_000_000_000) {
	sortie = '';
	cdc.sendSerialByte(5);
	tourne(2_000_000);
	sortie = '';
	envoie(lignes.join('\r\n') + '\r\n');
	tourne(2_000_000);
	sortie = '';
	cdc.sendSerialByte(4);
	const ok = tourneJusqua(() => sortie.includes('>>> '), maxInstr);
	return ok ? sortie : sortie + '\n[TIMEOUT]';
}

const t0 = Date.now();
const demarre = tourneJusqua(() => sortie.includes('>>> '), 2_000_000_000);
const msDem = Date.now() - t0;
console.log(`[banc] démarrage ${demarre ? 'OK' : 'ÉCHEC'} en ${msDem} ms mur, ${(instructions / 1e6).toFixed(1)} Minstr`);
console.log(`[banc] bannière : ${sortie.split('\n')[0].trim()}`);
if (!demarre) process.exit(1);

const dit = (nom, texte) => console.log(`
=== ${nom} ===
${texte.trim()}`);
dit('identite', repl('import sys, machine; print(sys.implementation, machine.freq())'));

// Mêmes tests fonctionnels que kablix-eval.ts, pour un tableau comparable.
dit('sommeil', replBloc(['import time', 't = time.ticks_ms()', 'time.sleep_ms(500)', "print('DT_MS', time.ticks_diff(time.ticks_ms(), t))"]));

const fronts = {};
for (const n of [14, 15, 16]) {
	fronts[n] = 0;
	mcu.gpio[n].addListener(() => { fronts[n]++; });
}
dit('gpio_init', replBloc(['from machine import Pin', 'p = Pin(15, Pin.OUT)', "print('PIN_PRET')"]));
fronts[15] = 0;
dit('gpio_value', replBloc(['for i in range(5):', '    p.value(1)', '    p.value(0)', "print('VALUE_FAIT', p.value())"]));
const frontsValue = fronts[15];
fronts[15] = 0;
dit('gpio_toggle', replBloc(['for i in range(10):', '    p.toggle()', "print('TOGGLE_FAIT', p.value())"]));
console.log(`[banc] fronts JS : value() -> ${frontsValue} (attendu 10), toggle() -> ${fronts[15]} (attendu 10)`);

dit('timer_irq', replBloc(['from machine import Timer', 'import time', 'n = 0', 'def cb(t):', '    global n', '    n += 1', 'tm = Timer()', 'tm.init(period=100, mode=Timer.PERIODIC, callback=cb)', 'time.sleep_ms(1050)', 'tm.deinit()', "print('TICKS', n)"]));

dit('irq_broche', replBloc(['from machine import Pin', 'import time', 'b = Pin(14, Pin.IN, Pin.PULL_UP)', 'c = 0', 'def h(p):', '    global c', '    c += 1', 'b.irq(trigger=Pin.IRQ_FALLING, handler=h)', 'time.sleep_ms(50)', "print('IRQ_PRET', c)"]));
mcu.gpio[14].setInputValue(false);
tourne(3_000_000);
mcu.gpio[14].setInputValue(true);
tourne(3_000_000);
dit('irq_broche_compte', repl('print("IRQ_COUNT", c)'));

fronts[16] = 0;
dit('pwm', replBloc(['from machine import Pin, PWM', 'import time', 'pw = PWM(Pin(16))', 'pw.freq(1000)', 'pw.duty_u16(32768)', 'time.sleep_ms(20)', "print('PWM_OK')"]));
console.log(`[banc] fronts JS vus sur GP16 (PWM) : ${fronts[16]}`);

mcu.adc.channelValues[0] = 0x800;
dit('adc', repl('from machine import ADC; print("ADC", ADC(26).read_u16())'));

dit('neopixel', replBloc(['import neopixel, machine, time', 'np = neopixel.NeoPixel(machine.Pin(2), 4)', 'np[0] = (10, 0, 0)', 'np.write()', 'time.sleep_ms(5)', "print('NEOPIXEL_OK')"]));

dit('i2c', replBloc(['from machine import I2C, Pin', 'i2c = I2C(0, scl=Pin(5), sda=Pin(4), freq=100000)', "print('I2C', i2c.scan())"], 400_000_000));

// Même banc de calcul que kablix-eval.ts, au caractère près.
const prelude = replBloc([
	'import time',
	'def bench(n):',
	'    x = 1',
	'    for i in range(n):',
	'        x = (x * 31 + i) % 1000003',
	'    return x',
	"print('BENCH_PRET')",
]);
if (!prelude.includes('BENCH_PRET')) console.log('[banc] préparation ratée');
repl('bench(20000)'); // chauffe JIT
const iAvant = instructions;
const nsAvant = clock.nanos;
const murAvant = Date.now();
const res = repl('bench(400000)');
const murMs = Date.now() - murAvant;
const dInstr = instructions - iAvant;
const dNs = clock.nanos - nsAvant;
console.log(`[banc] résultat : ${res.trim().split('\n').slice(-2)[0]}`);
const cyclesSim = (dNs * mcu.clkSys) / 1e9;
console.log(
	`[banc] ${(dInstr / 1e6).toFixed(1)} Minstr en ${murMs} ms → ` +
	`${(dInstr / murMs / 1000).toFixed(2)} Minstr/s · ${(cyclesSim / murMs / 1000).toFixed(2)} Mcycles/s · ` +
	`temps simulé ${(dNs / 1e6).toFixed(1)} ms → régime ×${(dNs / 1e6 / murMs).toFixed(3)}`
);
process.exit(0);
