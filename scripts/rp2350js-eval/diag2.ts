// Diagnostic ciblé RISC-V : quel bloc MicroPython fige, et sur quoi.
// Usage : npx tsx diag2.ts i2c|neopixel|vitesse
import { RP2350, CoreArch } from './src';
import { USBCDC } from './src/usb/cdc';
import { Logger } from './src/utils/logging';

const compte = new Map<string, number>();
const note = (cle: string) => compte.set(cle, (compte.get(cle) ?? 0) + 1);
class Compteur implements Logger {
	debug() {}
	warn(c: string, m: string) { note(`${c} ${m}`); }
	error(c: string, m: string) { console.error(`[${c}] ${m}`); }
	info(c: string, m: string) {
		const hit = /Unknown CSR (get|set): (0x[0-9a-f]+)/.exec(m);
		note(hit ? `CSR ${hit[1]} ${hit[2]}` : `${c} ${m}`);
	}
}

const quoi = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'i2c';
const BLOCS: Record<string, string[]> = {
	neopixel: [
		'import neopixel, machine, time',
		'np = neopixel.NeoPixel(machine.Pin(2), 4)',
		'np[0] = (10, 0, 0)',
		'np.write()',
		"print('NEOPIXEL_OK')",
	],
	i2c: [
		'from machine import I2C, Pin',
		'i2c = I2C(0, scl=Pin(5), sda=Pin(4), freq=100000)',
		"print('I2C', i2c.scan())",
	],
	i2c_init: [
		'from machine import I2C, Pin',
		'i2c = I2C(0, scl=Pin(5), sda=Pin(4), freq=100000)',
		"print('I2C_PRET')",
	],
};

const mcu: any = new RP2350({ coreArch: 'riscv' as CoreArch });
mcu.logger = new Compteur();
mcu.loadFirmware('./demo/RPI_PICO2-RISCV-20260406-v1.28.0.uf2', { initChip: false });
mcu.reset();

const cdc = new USBCDC(mcu.usbCtrl);
let sortie = '';
cdc.onDeviceConnected = () => { cdc.sendSerialByte(13); cdc.sendSerialByte(10); };
cdc.onSerialData = (v: Uint8Array) => { for (const b of v) sortie += String.fromCharCode(b); };

const tourne = (n: number) => { for (let i = 0; i < n; i++) mcu.step(); };
function tourneJusqua(pred: () => boolean, maxInstr: number) {
	for (let fait = 0; fait < maxInstr; fait += 20_000) {
		if (pred()) return true;
		tourne(20_000);
	}
	return pred();
}
const envoie = (s: string) => { for (const ch of s) cdc.sendSerialByte(ch.charCodeAt(0)); };

if (!tourneJusqua(() => sortie.includes('>>> '), 200_000_000)) {
	console.log('[diag] pas de REPL');
	process.exit(1);
}
console.log('[diag] REPL prêt');
compte.clear();

sortie = '';
cdc.sendSerialByte(5);
tourne(2_000_000);
sortie = '';
envoie(BLOCS[quoi].join('\r\n') + '\r\n');
tourne(2_000_000);
sortie = '';
cdc.sendSerialByte(4);
const ok = tourneJusqua(() => sortie.includes('>>> '), 200_000_000);
console.log(`[diag] ${quoi} ${ok ? 'OK' : 'FIGÉ'} — sortie : ${JSON.stringify(sortie.slice(-160))}`);

if (!ok) {
	const pcs = new Map<number, number>();
	for (let i = 0; i < 400_000; i++) {
		mcu.step();
		if ((i & 0x3f) === 0) {
			const pc = mcu.core[0].pc >>> 0;
			pcs.set(pc, (pcs.get(pc) ?? 0) + 1);
		}
	}
	const c = mcu.core[0]; // `core` est un TABLEAU de cœurs : core.pc n'existe pas
	const hex = (v: number) => '0x' + (v >>> 0).toString(16);
	console.log(
		`[diag] mcause=${hex(c.csrs[0x342])} mepc=${hex(c.csrs[0x341])} mtval=${hex(c.csrs[0x343])} mtvec=${hex(c.csrs[0x305])}`
	);
	console.log('[diag] PC les plus vus :');
	for (const [pc, n] of [...pcs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
		console.log(`   0x${pc.toString(16)} ×${n}`);
	}
}
console.log('[diag] messages émulateur les plus vus :');
for (const [cle, n] of [...compte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
	console.log(`   ${cle} ×${n}`);
}
process.exit(0);
