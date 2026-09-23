// Diagnostic : le VRAI programme dht11-pico (testkablix) joué par pico.mts,
// une pince sur GP22, les fronts drainés comme le fait l'atelier, versés dans la
// vraie AnalyseurCapture, puis décodés en DHT. Frank (23/09) : « je ne vois pas
// les valeurs s'afficher, juste départ ».
//
// Usage : node scripts/_diag-analyseur-dht.mjs [dht11|dht22] [secondes simulées]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-dht-'));
async function load(entry, name) {
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: join(tmp, name), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(join(tmp, name)).href);
}
const MODELE = process.argv[2] ?? 'dht11';
const SECONDES = Number(process.argv[3] ?? 4);

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const { AnalyseurCapture } = await load('src/webview/analyseur-capture.mts', 'capture.mjs');
const { decoderTous } = await load('src/webview/analyseur-decodage.mts', 'decodage.mjs');

const fw = firmwarePico('RPI_PICO-');
if (!fw) { console.log('firmware absent'); process.exit(1); }
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
const script = readFileSync(join(ROOT, 'testkablix', `${MODELE}-pico.py`), 'utf8');
const GP = MODELE === 'dht11' ? 'GP22' : (script.match(/Pin\((\d+)\)/)?.[1] ? `GP${script.match(/Pin\((\d+)\)/)[1]}` : 'GP14');

const engine = new PicoEngine({ kind: 'flash', segments, script }, 'rp2040');
engine.setDht22([{ pin: GP, temperatureC: 22, humidity: 50, model: MODELE }]);
engine.setLogicProbes([GP]);
engine.setPulseMonitors([GP]);
let sortie = '';
engine.onSerial = (s) => { sortie += s; };

const capture = new AnalyseurCapture();
capture.declarerVoies([{ voie: 4, pin: GP, nom: GP }]);
capture.reinitialiser();

engine.start();
const debut = Date.now();
await new Promise((fin) => {
	const minuterie = setInterval(() => {
		capture.verser(engine.drainScopeEdges());
		if (engine.simulatedMs() > SECONDES * 1000 || Date.now() - debut > 120_000) {
			clearInterval(minuterie);
			engine.stop();
			fin();
		}
	}, 16);
});
capture.verser(engine.drainScopeEdges());

console.log('sortie série :', JSON.stringify(sortie.slice(-300)));
const f = capture.fenetre(4, 0, capture.tFin + 1);
console.log(`fronts sur ${GP} : ${f.fronts.length}, entrant ${f.entrant}, tFin ${capture.tFin.toFixed(1)} ms`);
// Les 100 premiers fronts avec la durée du palier qui les précède.
let prec = null;
const lignes = [];
for (const x of f.fronts.slice(0, 100)) {
	lignes.push(`${x.t.toFixed(4)} ms → ${x.niveau}${prec ? `  (palier ${((x.t - prec.t) * 1000).toFixed(1)} µs)` : ''}`);
	prec = x;
}
console.log(lignes.join('\n'));
const voies = capture.listeVoies.map((v) => {
	const w = capture.fenetre(v.voie, 0, capture.tFin + 1);
	return { ...v, niveauInitial: w.entrant, fronts: w.fronts };
});
const annos = decoderTous(voies, [{ protocole: 'dht', id: 'd1', donnees: 4, modele: MODELE }]);
console.log('annotations :', annos.map((a) => a.texte).join(' | '));
process.exit(0);
