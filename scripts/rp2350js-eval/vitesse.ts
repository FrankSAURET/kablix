// Mesure de vitesse seule (sans les tests fonctionnels qui peuvent désynchroniser
// le REPL). Même charge que le banc Kablix : calcul pur en MicroPython.
// Usage : npx tsx vitesse.ts arm|riscv|rp2040
import { RP2040, RP2350, CoreArch } from './src';
import { USBCDC } from './src/usb/cdc';
import { ConsoleLogger, LogLevel } from './src/utils/logging';

const cible = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'arm';
const IMAGES: Record<string, string> = {
	arm: './demo/RPI_PICO2-20260406-v1.28.0.uf2',
	riscv: './demo/RPI_PICO2-RISCV-20260406-v1.28.0.uf2',
	rp2040: './demo/RPI_PICO-20260406-v1.28.0.uf2',
};
const mcu: any = cible === 'rp2040' ? new RP2040() : new RP2350({ coreArch: cible as CoreArch });
mcu.logger = new ConsoleLogger(LogLevel.Error, true);
mcu.loadFirmware(IMAGES[cible], { initChip: false });
mcu.reset();

const cdc = new USBCDC(mcu.usbCtrl);
let sortie = '';
cdc.onDeviceConnected = () => { cdc.sendSerialByte(13); cdc.sendSerialByte(10); };
cdc.onSerialData = (v: Uint8Array) => { for (const b of v) sortie += String.fromCharCode(b); };

let instructions = 0;
const tourne = (n: number) => { for (let i = 0; i < n; i++) { mcu.step(); instructions++; } };
function tourneJusqua(pred: () => boolean, maxInstr: number) {
	for (let fait = 0; fait < maxInstr; fait += 20_000) {
		if (pred()) return true;
		tourne(20_000);
	}
	return pred();
}
const envoie = (s: string) => { for (const ch of s) cdc.sendSerialByte(ch.charCodeAt(0)); };
function repl(ligne: string, maxInstr = 2_000_000_000) {
	sortie = '';
	envoie(ligne + '\r\n');
	const ok = tourneJusqua(() => sortie.includes('>>> '), maxInstr);
	return ok ? sortie : sortie + '\n[TIMEOUT]';
}
function replBloc(lignes: string[], maxInstr = 2_000_000_000) {
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

if (!tourneJusqua(() => sortie.includes('>>> '), 2_000_000_000)) {
	console.log('[vitesse] pas de REPL');
	process.exit(1);
}
const prelude = replBloc([
	'def bench(n):',
	'    x = 1',
	'    for i in range(n):',
	'        x = (x * 31 + i) % 1000003',
	'    return x',
	"print('PRET')",
]);
if (!prelude.includes('PRET')) {
	console.log('[vitesse] prélude raté : ' + JSON.stringify(prelude.slice(-120)));
	process.exit(1);
}
repl('bench(20000)'); // chauffe
const iAvant = instructions;
const nsAvant = mcu.clock.nanos;
const murAvant = Date.now();
const n = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? 400000);
const res = repl(`bench(${n})`);
const murMs = Date.now() - murAvant;
const dInstr = instructions - iAvant;
const dNs = mcu.clock.nanos - nsAvant;
const cyclesSim = (dNs * mcu.clkSys) / 1e9;
console.log(`[vitesse] ${cible} : résultat ${res.trim().split('\n').slice(-2)[0]}`);
console.log(
	`[vitesse] ${cible} : ${(dInstr / 1e6).toFixed(1)} Minstr en ${murMs} ms → ` +
		`${(dInstr / murMs / 1000).toFixed(2)} Minstr/s · ${(cyclesSim / murMs / 1000).toFixed(2)} Mcycles/s · ` +
		`temps simulé ${(dNs / 1e6).toFixed(1)} ms → régime ×${(dNs / 1e6 / murMs).toFixed(3)}`
);
process.exit(0);
