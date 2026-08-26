// D'où le firmware relit-il la pendule pendant une attente ? Réponse mesurée :
// depuis SIX adresses étalées sur onze cents octets. C'est ce chiffre qui a
// fermé la piste « reconnaître la boucle à son adresse » (v2026.8.102.22) :
// l'adresse ne sépare pas la boucle d'attente du reste du programme.
//
// L'espion n'est PAS dans le code livré (chemin chaud). Pour refaire la mesure,
// compter dans `vuHeure()` de rp-chip.mts les `core0.pc` vus quand
// `(globalThis as any).__espion` existe, puis retirer.
//
//   node scripts/_diag-espion-heure.mjs [rp2350|rp2040]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-espion-'));
const neuf = () => ({ pc: {}, saut: {}, serieMax: 0, lectures: 0, ruptures: 0 });
globalThis.__espion = neuf();

async function load(entry, name) {
	const out = join(ROOT, '..', name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: join(tmp, name), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(join(tmp, name)).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const fw = firmwarePico('RPI_PICO2-');
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script: 'import time\nwhile True:\n    time.sleep_ms(10)\n' }, 'rp2350');

engine.onSerial = () => {};
// On attend que le SCRIPT tourne (pas le REPL) avant de remettre les compteurs
// à zéro : le démarrage du firmware lit l'heure de partout.
engine.onRunning = () => {
	globalThis.__espion = neuf();
	setTimeout(fin, 6000);
};
engine.start();

function fin() {
	const e = globalThis.__espion;
	const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
	console.log(`lectures d'heure : ${e.lectures}, ruptures : ${e.ruptures}, série la plus longue : ${e.serieMax}`);
	console.log('PC des lectures : ' + top(e.pc, 12).map(([k, v]) => `0x${Number(k).toString(16)} (${v})`).join(' · '));
	console.log('écarts qui cassent : ' + top(e.saut, 10).map(([k, v]) => `${k} (${v})`).join(' · '));
	engine.dispose();
	process.exit(0);
}
