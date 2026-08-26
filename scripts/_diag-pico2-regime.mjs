// Combien de temps réel pour une seconde simulée ? Mesure NUE : rien n'est
// habillé dans la puce, c'est le programme MicroPython lui-même qui annonce ses
// tours. Les autres diagnostics posent des accesseurs sur la boucle chaude et
// ralentissent ce qu'ils mesurent — ici, le chiffre est celui que l'utilisateur
// verra dans le badge.
//
//   node scripts/_diag-pico2-regime.mjs [rp2350|rp2040] [tours] [--script=…]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-regime-'));
const famille = process.argv[2] ?? 'rp2350';
const tours = Number(process.argv[3] ?? 100);

async function load(entry, name) {
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: join(tmp, name), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(join(tmp, name)).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const fw = firmwarePico(famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-');
if (!fw) { console.log('firmware absent'); process.exit(1); }
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

// Le programme dit « PRET », attend, puis annonce le temps qu'il croit avoir
// vécu : on compare ce temps-là au temps de la vraie horloge murale.
const ATTENTES = {
	sleep10: 'time.sleep_ms(10)',
	sleep1: 'time.sleep_ms(1)',
	sleep100: 'time.sleep_ms(100)',
	us500: 'time.sleep_us(500)',
	us100: 'time.sleep_us(100)',
	us50: 'time.sleep_us(50)',
	us20: 'time.sleep_us(20)',
	us5: 'time.sleep_us(5)',
	rien: 'pass',
};
const nom = (process.argv.find((a) => a.startsWith('--script=')) ?? '--script=sleep10').slice(9);
const script = [
	'import time',
	"print('PRET')",
	't0 = time.ticks_us()',
	`for _ in range(${tours}):`,
	'    ' + (ATTENTES[nom] ?? ATTENTES.sleep10),
	"print('FIN', time.ticks_diff(time.ticks_us(), t0) // 1000)",
	'',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script }, famille);
let sortie = '';
let tPret = 0;
engine.onSerial = (c) => {
	sortie += c;
	if (tPret === 0 && /^PRET$/m.test(sortie)) tPret = performance.now();
	// La ligne doit être ENTIÈRE : le flux série arrive par bouts, et « FIN 9 »
	// est le début de « FIN 999 » — sans le saut de ligne on lit un nombre coupé.
	const m = sortie.match(/^FIN (\d+)\r?\n/m);
	if (m) {
		const mur = performance.now() - tPret;
		const simule = Number(m[1]);
		console.log(`${famille} · ${nom} × ${tours}`);
		console.log(`  ${simule} ms simulées en ${mur.toFixed(0)} ms réelles → ${(simule / mur).toFixed(3)}×`);
		engine.dispose();
		process.exit(0);
	}
};
engine.start();
setTimeout(() => { console.log('délai dépassé — sortie : ' + JSON.stringify(sortie.slice(-200))); process.exit(1); }, 300000);
