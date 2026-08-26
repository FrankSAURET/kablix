// Que fait le Pico 2 de son réveille-matin ? Pour chaque sorte d'attente, compte
// les rendez-vous posés (registres ALARM du TIMER0), les rendez-vous sonnés, les
// sonneries transmises au cœur (IRQ), les vrais endormissements (WFE) et les
// sauts d'attente active — et met en face la durée que le PROGRAMME a mesurée
// lui-même.
//
// Lecture du verdict, pour une attente donnée :
//   - endormissements ≈ nombre d'attentes → le firmware dort : tout va bien.
//   - 0 rendez-vous posé                  → sa réserve de réveils est vide : il
//                                           ne peut plus dormir, il ne lui reste
//                                           qu'à scruter l'heure.
//   - posés mais 0 sonné                  → notre horloge n'appelle pas.
//   - sonnés mais 0 IRQ                   → la sonnerie n'arrive pas au cœur.
//
//   node scripts/_diag-pico2-alarmes.mjs [rp2350|rp2040]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const famille = process.argv.includes('rp2040') ? 'rp2040' : 'rp2350';
const fw = firmwarePico(famille === 'rp2040' ? 'RPI_PICO-' : 'RPI_PICO2-');
if (!fw) { console.log('SKIP : firmware absent.'); process.exit(0); }

const tmp = mkdtempSync(join(tmpdir(), 'kx-alarm-'));
async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

// Le programme annonce chaque lot par « @nom » AVANT de le lancer, puis rend sa
// mesure. Les compteurs sont relevés à chaque annonce : on obtient donc, par
// sorte d'attente, ce que le firmware a fait de son réveille-matin.
const script = [
	'import time',
	'def mesure(nom, n, f):',
	'    print("@" + nom)',
	'    v = []',
	'    for _ in range(n):',
	'        t0 = time.ticks_us()',
	'        f()',
	'        v.append(time.ticks_diff(time.ticks_us(), t0))',
	'    print("=", sum(v) // n, min(v), max(v))',
	'mesure("un seul sleep_ms(10)", 1, lambda: time.sleep_ms(10))',
	'mesure("sleep_ms(10) x10", 10, lambda: time.sleep_ms(10))',
	'mesure("sleep_ms(1) x20", 20, lambda: time.sleep_ms(1))',
	'mesure("sleep_us(500) x50", 50, lambda: time.sleep_us(500))',
	'mesure("sleep_us(10) x200", 200, lambda: time.sleep_us(10))',
	'print("F" + "IN")',
	'',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script }, famille);
const chip = engine.sim.chip; // `sim` est privé en TypeScript, pas en JS
const puce = chip.mcu;

// --- Mouchards ---------------------------------------------------------------
const c = { poses: 0, sonnes: 0, irq: 0, wfe: 0, sauts: 0, nanosSautes: 0 };
const TIMER0 = famille === 'rp2350' ? 0x400b0 : 0x40054;
const timer = puce.peripherals[TIMER0];
const ecrire = timer.writeUint32.bind(timer);
timer.writeUint32 = (offset, value) => {
	if (offset >= 0x10 && offset <= 0x1c) c.poses++;   // ALARM0..ALARM3
	ecrire(offset, value);
};
const sonner = timer.fireAlarm.bind(timer);
timer.fireAlarm = (i) => { c.sonnes++; sonner(i); };
const irqBase = timer.timer_irq_base ?? 0;
const setIrq = puce.setInterrupt.bind(puce);
puce.setInterrupt = (irq, value) => {
	if (value && irq >= irqBase && irq < irqBase + 4) c.irq++;
	setIrq(irq, value);
};
// Endormissements : `waiting` passe de faux à vrai. Sauts d'attente active :
// `sauter` appelé alors que le cœur 0 n'est PAS endormi.
const core0 = chip.core;
let dormaitAvant = false;
const dortOrig = chip.dort.bind(chip);
const sauterOrig = chip.sauter.bind(chip);
chip.dort = () => {
	const d = dortOrig();
	if (core0.waiting && !dormaitAvant) c.wfe++;
	dormaitAvant = core0.waiting;
	return d;
};
chip.sauter = (n) => {
	const attenteActive = !core0.waiting;
	const avant = chip.clock.nanos;
	sauterOrig(n);
	if (attenteActive) { c.sauts++; c.nanosSautes += chip.clock.nanos - avant; }
};

// --- Déroulé -----------------------------------------------------------------
const lots = [];
let serie = '';
let ligne = '';
engine.onSerial = (ch) => {
	serie += ch;
	for (const car of ch) {
		if (car !== '\n') { if (car !== '\r') ligne += car; continue; }
		if (ligne.startsWith('@')) lots.push({ nom: ligne.slice(1), debut: { ...c } });
		else if (ligne.startsWith('= ') && lots.length) {
			const [moy, mini, maxi] = ligne.slice(2).trim().split(/\s+/).map(Number);
			Object.assign(lots[lots.length - 1], { fin: { ...c }, moy, mini, maxi });
		}
		ligne = '';
	}
};
console.log(`${famille} — attentes vues du côté du réveille-matin`);
engine.start();
const t0 = Date.now();
await new Promise((r) => {
	const t = setInterval(() => {
		if (/^FIN$/m.test(serie) || Date.now() - t0 > 300000) { clearInterval(t); r(); }
	}, 200);
});
engine.dispose();

const col = (v, n) => String(v).padStart(n);
console.log('');
console.log('  attente                    moyenne   min    max | posés sonnés  IRQ  dodos  sauts');
for (const l of lots) {
	if (!l.fin) { console.log(`  ${l.nom.padEnd(24)} — pas de mesure`); continue; }
	const d = (k) => l.fin[k] - l.debut[k];
	console.log(
		`  ${l.nom.padEnd(24)} ${col(l.moy, 7)} ${col(l.mini, 6)} ${col(l.maxi, 6)} |` +
		` ${col(d('poses'), 5)} ${col(d('sonnes'), 6)} ${col(d('irq'), 4)} ${col(d('wfe'), 6)} ${col(d('sauts'), 6)}` +
		` (${Math.round(d('nanosSautes') / 1000)} µs)`,
	);
}
console.log(`\n  temps réel écoulé : ${Date.now() - t0} ms`);
process.exit(0);
