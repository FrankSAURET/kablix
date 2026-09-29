// La veille AVR s'exécute (v2026.9.7.179).
//
// LE DÉFAUT. avr8js n'exécute pas SLEEP (« not implemented ») : l'instruction ne
// faisait rien et le programme filait. `LowPower.powerDown(SLEEP_8S, …)` durait
// 0 s, et aucune veille ne pouvait être mesurée — or la consommation d'une carte
// (feuille de route, n° 1 et 2) se joue précisément sur le contraste actif/veille.
// Le chien de garde, qui réveille ces programmes, n'était même pas branché.
//
// CE BANC N'A PAS BESOIN D'ARDUINO. Le petit programme ci-dessous (source en
// fin de commentaire, assemblé par llvm-mc) arme le chien de garde en
// interruption (~16 ms), le Timer 0 en débordement (1 ms, comme `millis()`),
// puis boucle : SLEEP, bascule PB5. La vraie AvrEngine le fait tourner.
//
//   power-down + SE : seul le chien de garde réveille → une bascule toutes les
//                     16 ms, le Timer 0 ne tire PAS la puce du sommeil ; le
//                     temps passé est compté en veille (sleepMs) ;
//   idle + SE       : toute interruption réveille → une bascule par ms (Timer 0),
//                     et ce n'est PAS de la veille profonde (sleepMs = 0) ;
//   power-down sans SE : SLEEP ne fait rien, comme sur la puce.
//
// Contre-épreuve : `node scripts/verify-veille-avr.mjs --ancien` compile avr.mts
// dans sa version HEAD — le banc DOIT échouer.
//
// Source (llvm-mc -triple=avr -mcpu=atmega328p --defsym MODE=…, ld.lld -Ttext=0) :
//   .org 0x00 : jmp main ; .org 0x18 : jmp isr_wdt ; .org 0x40 : jmp isr_t0 ; .org 0x68
//   main: SP = 0x08FF ; sbi DDRB,5 ; TCCR0B = 3 ; TIMSK0 = TOIE0 ;
//         WDTCSR = WDCE|WDE puis WDIE ; SMCR = MODE ; sei
//   boucle: sleep ; sbi PINB,5 ; rjmp boucle      isr_wdt: reti   isr_t0: reti
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : avr.mts en version HEAD)');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-veille-avr-'));
const out = join(tmp, 'avr.mjs');
await esbuild.build({
	entryPoints: [join(root, 'src/webview/engines/avr.mts')],
	outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
	plugins: [{
		name: 'version-head',
		setup(b) {
			b.onLoad({ filter: /[\\/]engines[\\/]avr\.mts$/ }, (args) => {
				if (!ANCIEN) return undefined;
				const contents = execFileSync('git', ['show', 'HEAD:src/webview/engines/avr.mts'], { cwd: root, encoding: 'utf8' });
				return { contents, loader: 'ts', resolveDir: dirname(args.path) };
			});
		},
	}],
});
const { AvrEngine } = await import(pathToFileURL(out).href);

let echecs = 0;
const check = (ok, nom, detail = '') => {
	if (!ok) echecs++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${nom}${detail ? ' — ' + detail : ''}`);
};

const PROGRAMME = '0c94340000000000000000000000000000000000000000000c944a000000000000000000000000000000000000000000000000000000000000000000000000000c944b0000000000000000000000000000000000000000000000000000000000000000000000000008e00ebf0fef0dbf259a03e005bd01e000936e0008e10093600000e40093600005e003bf789488951d9afdcf18951895';
/** Le programme, SMCR réglé sur `mode` (l'immédiat du `ldi r16, MODE`). */
const programme = (mode) => {
	const octets = Buffer.from(PROGRAMME.replace('00e40093600005e0', `00e4009360000${mode.toString(16)}e0`), 'hex');
	const mots = new Uint16Array(0x4000);
	for (let i = 0; i + 1 < octets.length; i += 2) mots[i / 2] = octets[i] | (octets[i + 1] << 8);
	return mots;
};
const CLOCK_HZ = 16_000_000;
const DUREE_MS = 250;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fait tourner le programme ~DUREE_MS de temps simulé ; bascules de PB5 et veille. */
async function jouer(mode) {
	const eng = new AvrEngine(programme(mode), null, 'avr328');
	const bascules = [];
	eng.ports.B.addListener(() => bascules.push(eng.cpu.cycles));
	eng.start();
	while ((eng.cpu.cycles / CLOCK_HZ) * 1000 < DUREE_MS) await attendre(20);
	eng.stop();
	const simMs = (eng.cpu.cycles / CLOCK_HZ) * 1000;
	const veilleMs = eng.sleepMs?.() ?? 0;
	eng.dispose?.();
	const ecarts = [];
	for (let i = 1; i < bascules.length; i++) ecarts.push(((bascules[i] - bascules[i - 1]) / CLOCK_HZ) * 1000);
	const median = ecarts.length ? [...ecarts].sort((a, b) => a - b)[Math.floor(ecarts.length / 2)] : NaN;
	return { n: bascules.length, median, simMs, veilleMs };
}

const f = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');

console.log('power-down + SE : seul le chien de garde réveille');
{
	const r = await jouer(0x5);
	check(r.median > 14 && r.median < 18, 'une bascule toutes les ~16 ms (chien de garde), pas à chaque ms', `écart médian ${f(r.median)} ms, ${r.n} bascules`);
	check(r.veilleMs > 0.95 * r.simMs, 'le temps passé est compté en veille', `${f(r.veilleMs)} ms sur ${f(r.simMs)} ms`);
}
console.log('idle + SE : toute interruption réveille');
{
	const r = await jouer(0x1);
	check(r.median > 0.9 && r.median < 1.2, 'une bascule par débordement du Timer 0 (~1,024 ms)', `écart médian ${f(r.median)} ms, ${r.n} bascules`);
	check(r.veilleMs === 0, 'idle n’est pas de la veille profonde', `${f(r.veilleMs)} ms`);
}
console.log('power-down sans SE : SLEEP ne fait rien');
{
	const r = await jouer(0x4);
	check(r.median < 0.01, 'le programme file sans s’arrêter', `écart médian ${f(r.median)} ms`);
	check(r.veilleMs === 0, 'aucune veille comptée', `${f(r.veilleMs)} ms`);
}
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs})` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
