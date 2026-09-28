// Les créneaux 1-Wire d'un Pico 2 gardent-ils leur durée ? (v2026.9.6.170)
//
// LE DÉFAUT. Lot 165 : sur Pico 2, la capture du DS18B20 montrait des « 1 » du
// maître de 22 à 50 µs au lieu de 10, par paquets. Le capteur les lit « 0 » :
// commandes fausses, plus de réponse. Le Pico 1 était juste.
//
// LA CAUSE. Le moteur du RP2350 saute les attentes actives (`Rp2350Chip`,
// rp-chip.mts) : une boucle qui ne fait que relire TIMER0 voit le temps avancer
// par bonds d'un seizième de ce qu'elle a déjà attendu. Toute lecture de broche
// ou écriture de périphérique casse la série… sauf les écritures GPIO du SIO,
// hors de la table des périphériques. Un maître 1-Wire qui ÉCRIT un octet ne
// lit jamais la broche : ses huit créneaux passaient pour une seule attente de
// 560 µs, et le bond (≈ 35 µs) tombait en plein creux.
//
// CE BANC N'A PAS BESOIN DE FIRMWARE. Le petit programme ci-dessous fait ce que
// fait `onewire_bus_writebit` de MicroPython (extmod/modonewire.c) : broche
// basse par OE_SET du SIO, 10 µs, relâchée si le bit vaut 1, 50 µs, relâchée,
// 10 µs — les attentes en relisant TIMERAWL, comme `mp_hal_delay_us_fast`. Un
// rendez-vous lointain est armé (MicroPython en a toujours un) : sans lui, le
// moteur ne saute jamais. La vraie `Rp2350Chip` le fait tourner, pilotée par
// la même boucle que pico.mts (`dort` → `sauter`, sinon `executerLot`).
//
// Il contrôle : chaque creux d'un « 1 » dure 10 µs (± 1), chaque « 0 » de 60 à
// 65 µs, les bits lus dans les creux sont ceux du motif, et le saut d'attente
// reste en service (sinon le Pico 2 retomberait à 60 % de son régime).
//
// Contre-épreuve : `node scripts/verify-pico2-onewire.mjs --ancien` compile
// rp-chip.mts dans sa version HEAD.
//
// Source du programme (clang --target=thumbv8m.main-none-eabi -mcpu=cortex-m33,
// ld.lld -Ttext=0x20000000, llvm-objcopy -O binary) :
//
//       ldr r0, =0x20040000 ; mov sp, r0
//       ldr r0, =0x40028074 ; movs r1, #5    ; str r1, [r0]   @ GPIO14 → SIO
//       ldr r0, =0x4003803c ; movs r1, #0x56 ; str r1, [r0]   @ pad sans isolation
//       ldr r4, =0xd0000000 ; ldr r5, =(1 << 14)
//       str r5, [r4, #0x20] ; str r5, [r4, #0x40]            @ OUT_CLR, OE_CLR
//       ldr r6, =0x400b0000                                    @ TIMER0
//       ldr r0, [r6, #0x28] ; ldr r1, =1000000 ; adds r0, r0, r1
//       str r0, [r6, #0x10]                                    @ ALARM0 = +1 s
//       movs r0, #200 ; bl wait
//       ldr r7, =0x55CC33BE ; movs r0, #0 ; mov r8, r0
//   loop: mov r0, r7 ; mov r1, r8 ; movs r2, #31 ; ands r1, r2 ; lsrs r0, r1
//       movs r2, #1 ; ands r0, r2 ; mov r9, r0
//       str r5, [r4, #0x38]                                    @ OE_SET : bas
//       movs r0, #10 ; bl wait
//       mov r0, r9 ; cmp r0, #0 ; beq zero
//       str r5, [r4, #0x40]                                    @ bit 1 : relâchée
//   zero: movs r0, #50 ; bl wait
//       str r5, [r4, #0x40] ; movs r0, #10 ; bl wait
//       mov r1, r8 ; adds r1, #1 ; mov r8, r1 ; b loop
//   wait: ldr r3, [r6, #0x28]
//   1:  ldr r2, [r6, #0x28] ; subs r2, r2, r3 ; cmp r2, r0 ; blo 1b ; bx lr
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : rp-chip.mts en version HEAD)');
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /[\\/]engines[\\/]rp-chip\.mts$/ }, (args) => {
			if (!ANCIEN) return undefined;
			const contents = execFileSync('git', ['show', 'HEAD:src/webview/engines/rp-chip.mts'], { cwd: root, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
const tmp = mkdtempSync(join(tmpdir(), 'kablix-pico2-onewire-'));
const out = join(tmp, 'rp-chip.mjs');
await esbuild.build({
	entryPoints: [join(root, 'src/webview/engines/rp-chip.mts')],
	outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error', plugins: [versionHead],
});
const { creerChip } = await import(pathToFileURL(out).href);

let echecs = 0;
const check = (ok, nom, detail = '') => {
	if (!ok) echecs++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${nom}${detail ? ' — ' + detail : ''}`);
};

const PROGRAMME = Buffer.from(
	'1c4885461c48052101601c48562101604ff050444ff4804525622564184eb06a184940183061c82000f01ef8164f00208046384641461f221140c840012210408146a5630a2000f00ff84846002800d02564322000f008f825640a2000f004f84146491c8846e4e7b36ab26ad21a8242fbd3704700000420748002403c80034000000b4040420f00be33cc55',
	'hex',
);
const MOTIF = 0x55cc33be;
const BROCHE = 14;
const DUREE_NANOS = 20e6;

const arret = { stopped: false, coupeLot: false };
const chip = creerChip('rp2350', arret);
const puce = chip.mcu;
puce.sram.set(PROGRAMME, 0);
puce.core[0].PC = 0x20000000;
puce.core[1].waiting = true; // le cœur 1 dort, comme sous MicroPython

const fronts = [];
puce.gpio[BROCHE].addListener((etat) => fronts.push({ t: chip.clock.nanos, etat }));

// La boucle du moteur (pico.mts, `execute`), sans le calage sur le temps réel.
let sauts = 0;
while (chip.clock.nanos < DUREE_NANOS) {
	if (chip.dort()) {
		const n = chip.clock.nanosToNextAlarm;
		if (n <= 0) break;
		chip.sauter(n);
		sauts++;
	} else {
		chip.executerLot(Math.min(chip.clock.nanos + 1e6, DUREE_NANOS));
	}
}

// Creux : d'une descente à la remontée suivante.
const creux = [];
for (let i = 0; i + 1 < fronts.length; i++) {
	if (fronts[i].etat === 0 && fronts[i + 1].etat !== 0) creux.push((fronts[i + 1].t - fronts[i].t) / 1000);
}
const uns = creux.filter((d) => d < 30);
const zeros = creux.filter((d) => d >= 30);
const etendue = (a) => (a.length ? `${Math.min(...a).toFixed(2)} à ${Math.max(...a).toFixed(2)} µs` : 'aucun');

console.log(`${creux.length} créneaux en ${DUREE_NANOS / 1e6} ms simulées, ${sauts} saut(s) d'attente`);
// 20 ms / 70 µs par créneau ≈ 285 créneaux : moins de 250, c'est que le temps a filé.
check(creux.length >= 250, 'le maître écrit à son rythme (≥ 250 créneaux en 20 ms)', `${creux.length} créneaux`);
check(uns.length > 0 && uns.every((d) => Math.abs(d - 10) <= 1), 'chaque « 1 » : creux de 10 µs (± 1)', `${uns.length} creux, ${etendue(uns)}`);
check(zeros.length > 0 && zeros.every((d) => d >= 60 && d <= 65), 'chaque « 0 » : creux de 60 à 65 µs', `${zeros.length} creux, ${etendue(zeros)}`);
const lus = creux.map((d) => (d < 30 ? 1 : 0));
const attendus = lus.map((_, i) => (MOTIF >>> (i % 32)) & 1);
const premier = lus.findIndex((b, i) => b !== attendus[i]);
check(lus.length > 0 && premier === -1, `les bits lus sont ceux du motif 0x${MOTIF.toString(16).toUpperCase()}`,
	premier === -1 ? `${lus.length} bits` : `bit ${premier} lu ${lus[premier]}, attendu ${attendus[premier]}`);
check(sauts > 0, 'témoin : le saut d\'attente active reste en service', `${sauts} saut(s)`);

console.log(echecs ? `\nRESULTAT: ECHEC (${echecs})` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
