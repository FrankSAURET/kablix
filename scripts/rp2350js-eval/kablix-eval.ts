// Évaluation rp2350js POUR KABLIX (roadmap pistes 7 et 8).
//
// Question du jour 1 : les manques annoncés du README (« Timer and System
// Interrupts », « Exceptions ») sont-ils rédhibitoires ? Kablix repose sur les
// alarmes, le SysTick, les fronts GPIO et l'USB CDC. On ne lit pas la doc : on
// pilote un vrai MicroPython au REPL et on regarde ce qui répond.
//
// Usage : npx tsx kablix-eval.ts --target=arm|riscv|rp2040 [--image=chemin.uf2]
//
// Tout est synchrone : mcu.step() appelle les callbacks CDC/GPIO dans la foulée,
// donc une simple boucle suffit (pas d'event loop, mesures non polluées).
import { RP2040, RP2350, CoreArch } from './src';
import { USBCDC } from './src/usb/cdc';
import { ConsoleLogger, LogLevel } from './src/utils/logging';
import { GPIOPinState } from './src/gpio-pin';

const args = process.argv.slice(2);
const arg = (nom: string, defaut: string) => {
	const hit = args.find((a) => a.startsWith(`--${nom}=`));
	return hit ? hit.slice(nom.length + 3) : defaut;
};
const target = arg('target', 'arm');
const IMAGES: Record<string, string> = {
	arm: './demo/RPI_PICO2-20260406-v1.28.0.uf2',
	riscv: './demo/RPI_PICO2-RISCV-20260406-v1.28.0.uf2',
	rp2040: './demo/RPI_PICO-20260406-v1.28.0.uf2',
};
const image = arg('image', IMAGES[target]);

const mcu: any =
	target === 'rp2040' ? new RP2040() : new RP2350({ coreArch: target as CoreArch });
mcu.logger = new ConsoleLogger(LogLevel.Error, true); // silence les « Unimplemented »

console.log(`[eval] cible=${target} image=${image}`);
mcu.loadFirmware(image, { initChip: false });
mcu.reset();

const cdc = new USBCDC(mcu.usbCtrl);
let sortie = '';
let connecte = false;
cdc.onDeviceConnected = () => {
	connecte = true;
	cdc.sendSerialByte(13);
	cdc.sendSerialByte(10);
};
cdc.onSerialData = (value: Uint8Array) => {
	for (const b of value) sortie += String.fromCharCode(b);
};

// Compteurs de fronts posés comme Kablix le fait : un écouteur par broche.
const fronts: Record<number, number> = {};
const surveille = (n: number) => {
	fronts[n] = 0;
	mcu.gpio[n].addListener(() => {
		fronts[n]++;
	});
};
[15, 16, 25].forEach(surveille);

let instructions = 0;
function tourne(n: number) {
	for (let i = 0; i < n; i++) {
		mcu.step();
		instructions++;
	}
}

/** Fait tourner la simulation jusqu'à ce que `pred` soit vrai, ou plafond atteint. */
function tourneJusqua(pred: () => boolean, maxInstr = 400_000_000): boolean {
	const lot = 20_000;
	for (let fait = 0; fait < maxInstr; fait += lot) {
		if (pred()) return true;
		tourne(lot);
	}
	return pred();
}

const envoie = (s: string) => {
	for (const ch of s) cdc.sendSerialByte(ch.charCodeAt(0));
};

/** Envoie une ligne au REPL et rend tout ce qui sort jusqu'au prompt suivant. */
function repl(ligne: string, maxInstr = 800_000_000): string {
	sortie = '';
	envoie(ligne + '\r\n');
	const ok = tourneJusqua(() => sortie.includes('>>> ') || sortie.includes('... '), maxInstr);
	if (!ok) return sortie + '\n[TIMEOUT]';
	return sortie;
}

/** Bloc multi-lignes via le mode collage du REPL (Ctrl-E … Ctrl-D). */
function replBloc(lignes: string[], maxInstr = 2_000_000_000): string {
	sortie = '';
	cdc.sendSerialByte(5); // Ctrl-E : paste mode
	tourne(2_000_000);
	sortie = '';
	envoie(lignes.join('\r\n') + '\r\n');
	tourne(2_000_000);
	sortie = '';
	cdc.sendSerialByte(4); // Ctrl-D : exécute
	const ok = tourneJusqua(() => sortie.includes('>>> '), maxInstr);
	return ok ? sortie : sortie + '\n[TIMEOUT]';
}

const t0 = Date.now();
const demarre = tourneJusqua(() => sortie.includes('>>> '), 2_000_000_000);
const msDemarrage = Date.now() - t0;
const instrDemarrage = instructions;
console.log(
	`[eval] démarrage : ${demarre ? 'OK' : 'ÉCHEC'} en ${msDemarrage} ms mur, ` +
		`${(instrDemarrage / 1e6).toFixed(1)} Minstr, temps simulé ${(mcu.clock.nanos / 1e6).toFixed(1)} ms`
);
console.log(`[eval] bannière : ${sortie.split('\n')[0].trim()}`);
if (!demarre) process.exit(1);

const resultats: Record<string, string> = {};
const dit = (nom: string, texte: string) => {
	resultats[nom] = texte;
	console.log(`\n=== ${nom} ===\n${texte.trim()}`);
};

// 1. Identité + fréquence d'horloge vues par le firmware.
dit('identite', repl('import sys, machine; print(sys.implementation, machine.freq())'));

// 2. Sommeil : l'alarme du TIMER doit réveiller le firmware (piste 8).
dit(
	'sommeil',
	replBloc([
		'import time',
		't = time.ticks_ms()',
		'time.sleep_ms(500)',
		"print('DT_MS', time.ticks_diff(time.ticks_ms(), t))",
	])
);

// 3. Fronts GPIO côté JS : le chemin des composants Kablix.
dit(
	'gpio_init',
	replBloc(['from machine import Pin', 'p = Pin(15, Pin.OUT)', "print('PIN_PRET')"])
);
fronts[15] = 0;
dit('gpio_value', replBloc(['for i in range(5):', '    p.value(1)', '    p.value(0)', "print('VALUE_FAIT', p.value())"]));
const frontsValue = fronts[15];
fronts[15] = 0;
dit('gpio_toggle', replBloc(['for i in range(10):', '    p.toggle()', "print('TOGGLE_FAIT', p.value())"]));
console.log(`[eval] fronts JS : value() -> ${frontsValue} (attendu 10), toggle() -> ${fronts[15]} (attendu 10)`);

// 4. Interruption de minuterie MicroPython : le point noir du README.
dit(
	'timer_irq',
	replBloc([
		'from machine import Timer',
		'import time',
		'n = 0',
		'def cb(t):',
		'    global n',
		'    n += 1',
		'tm = Timer()',
		'tm.init(period=100, mode=Timer.PERIODIC, callback=cb)',
		'time.sleep_ms(1050)',
		'tm.deinit()',
		"print('TICKS', n)",
	])
);

// 5. Interruption de broche (IRQ GPIO), utilisée par les boutons.
dit(
	'irq_broche',
	replBloc([
		'from machine import Pin',
		'import time',
		'b = Pin(14, Pin.IN, Pin.PULL_UP)',
		'c = 0',
		'def h(p):',
		'    global c',
		'    c += 1',
		'b.irq(trigger=Pin.IRQ_FALLING, handler=h)',
		'time.sleep_ms(50)',
		"print('IRQ_PRET', c)",
	])
);
{
	// on tire la broche vers le bas depuis le JS, comme le fait un bouton Kablix
	const avant = instructions;
	mcu.gpio[14].setInputValue(false);
	tourne(3_000_000);
	mcu.gpio[14].setInputValue(true);
	tourne(3_000_000);
	dit('irq_broche_compte', repl('print("IRQ_COUNT", c)'));
	console.log(`[eval] (${((instructions - avant) / 1e6).toFixed(1)} Minstr pour l'appui)`);
}

// 6. PWM : Kablix lit le rapport cyclique pour les servos et la luminosité.
fronts[16] = 0;
dit(
	'pwm',
	replBloc([
		'from machine import Pin, PWM',
		'import time',
		'pw = PWM(Pin(16))',
		'pw.freq(1000)',
		'pw.duty_u16(32768)',
		'time.sleep_ms(20)',
		"print('PWM_OK')",
	])
);
console.log(`[eval] fronts JS vus sur GP16 (PWM) : ${fronts[16]}`);

// 7. ADC : capteurs analogiques.
mcu.adc.channelValues[0] = 0x800;
dit('adc', repl('from machine import ADC; print("ADC", ADC(26).read_u16())'));

// 8. PIO via NeoPixel : le WS2812 de Kablix.
dit(
	'neopixel',
	replBloc([
		'import neopixel, machine, time',
		'np = neopixel.NeoPixel(machine.Pin(2), 4)',
		'np[0] = (10, 0, 0)',
		'np.write()',
		'time.sleep_ms(5)',
		"print('NEOPIXEL_OK')",
	])
);

// 9. I2C : scan d'un bus vide (a déjà figé rp2040js par le passé).
dit(
	'i2c',
	replBloc(
		[
			'from machine import I2C, Pin',
			'i2c = I2C(0, scl=Pin(5), sda=Pin(4), freq=100000)',
			"print('I2C', i2c.scan())",
		],
		400_000_000
	)
);

// 10. Vitesse : calcul pur, la charge qui fait ramer la simulation.
{
	const prelude = replBloc([
		'import time',
		'def bench(n):',
		'    x = 1',
		'    for i in range(n):',
		'        x = (x * 31 + i) % 1000003',
		'    return x',
		"print('BENCH_PRET')",
	]);
	if (!prelude.includes('BENCH_PRET')) console.log('[eval] préparation du banc ratée');
	// chauffe
	repl('bench(20000)');
	const iAvant = instructions;
	const nsAvant = mcu.clock.nanos;
	const murAvant = Date.now();
	const res = repl('bench(400000)');
	const murMs = Date.now() - murAvant;
	const dInstr = instructions - iAvant;
	const dNs = mcu.clock.nanos - nsAvant;
	console.log(`\n=== vitesse ===\n${res.trim()}`);
	const cyclesSim = (dNs * mcu.clkSys) / 1e9;
	console.log(
		`[eval] ${(dInstr / 1e6).toFixed(1)} Minstr en ${murMs} ms → ` +
			`${(dInstr / murMs / 1000).toFixed(2)} Minstr/s · ` +
			`${(cyclesSim / murMs / 1000).toFixed(2)} Mcycles/s · ` +
			`temps simulé ${(dNs / 1e6).toFixed(1)} ms → régime ×${(dNs / 1e6 / murMs).toFixed(3)}`
	);
}

console.log('\n[eval] terminé');
process.exit(0);
