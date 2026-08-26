// À quel rythme le firmware relit-il la pendule ? C'est cette mesure qui a fixé
// `ATTENTE_ECART_CYCLES` (rp-chip.mts) : dans sa boucle d'attente le firmware
// relit toutes les trente cycles, entre deux attentes l'interprète laisse mille
// à trois mille cycles — c'est ce trou qui sépare deux attentes.
//
// L'espion n'est PAS dans le code livré (chemin chaud). Pour refaire la mesure,
// ajouter au début de `vuHeure()` dans rp-chip.mts, puis retirer après :
//
//   const espion = (globalThis as any).__ecarts;
//   if (espion) {
//     const d = cycles - this.cyclesDerniereHeure;
//     const t = d < 30 ? '<30' : d < 100 ? '<100' : d < 200 ? '<200'
//       : d < 500 ? '<500' : d < 3000 ? '<3000' : '>=3000';
//     espion[t] = (espion[t] ?? 0) + 1;
//   }
//
//   node scripts/_diag-ecarts.mjs <script> [tours]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-ecarts-'));
const attente = process.argv[2] ?? 'time.sleep_us(20)';
const tours = Number(process.argv[3] ?? 300);

async function load(entry, name) {
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: join(tmp, name), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(join(tmp, name)).href);
}
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const segments = parseUf2(new Uint8Array(readFileSync(firmwarePico('RPI_PICO2-')))).map((s) => ({ addr: s.addr, data: s.data }));

const script = ['import time', "print('PRET')", `for _ in range(${tours}):`, '    ' + attente, "print('FIN')", ''].join('\n');
const engine = new PicoEngine({ kind: 'flash', segments, script }, 'rp2350');
let sortie = '';
engine.onSerial = (c) => {
	sortie += c;
	if (/^PRET\r?\n/m.test(sortie)) globalThis.__ecarts ??= {};
	if (/^FIN\r?\n/m.test(sortie)) {
		const e = globalThis.__ecarts ?? {};
		const total = Object.values(e).reduce((a, b) => a + b, 0);
		console.log(`${attente} × ${tours} — ${total} lectures d'heure`);
		for (const [k, v] of Object.entries(e).sort((a, b) => b[1] - a[1])) {
			console.log(`  ${k.padEnd(9)} ${v} (${(100 * v / total).toFixed(2)} %)`);
		}
		engine.dispose();
		process.exit(0);
	}
};
engine.start();
setTimeout(() => { console.log('délai dépassé : ' + JSON.stringify(sortie.slice(-160))); process.exit(1); }, 300000);
