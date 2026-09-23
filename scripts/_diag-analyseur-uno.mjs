// Diagnostic : le VRAI programme sonde-logique-uno (le .hex de testkablix/.build)
// joué par avr.mts, drainé à chaque image comme le fait l'atelier, versé dans
// la vraie AnalyseurCapture. On regarde ce que la vue recevrait à chaque image
// avec la fenêtre par défaut (10 ms, suivi de la fin), échantillonnage 1 kHz et
// déclenchement montant sur D8 — le réglage exact de Frank (23/09).
//
// Usage : node scripts/_diag-analyseur-uno.mjs [hz] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-uno-'));
async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(root, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}
const HZ = Number(process.argv[2] ?? 1000);
const DUREE_S = Number(process.argv[3] ?? 30);

const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');
const { loadArtifact } = await load('src/compiler.ts', 'compiler.mjs');
const { AnalyseurCapture } = await load('src/webview/analyseur-capture.mts', 'capture.mjs');

const artefact = loadArtifact(join(root, 'testkablix', '.build', 'sonde-logique-uno.ino.hex'));
const engine = new AvrEngine(Uint16Array.from(artefact.payload.bytes), null, 'avr328');
engine.setLogicProbes(['8', '9']);
engine.setPulseMonitors(['8', '9']);
engine.setSpeed(Number(process.argv[4] ?? 1));

const capture = new AnalyseurCapture();
capture.declarerVoies([{ voie: 0, pin: '8', nom: 'horloge' }, { voie: 1, pin: '9', nom: '9' }]);
capture.reglerEchantillonnage(HZ);
capture.reglerDeclenchement({ voie: 0, sens: 'rising' });
capture.reinitialiser();

const DUREE_FENETRE = 10;
let image = 0;
let dernierT = -1;
let nonMonotone = 0;
const journal = [];
engine.start();
const debut = Date.now();
await new Promise((fin) => {
	const minuterie = setInterval(() => {
		const salves = engine.drainScopeEdges();
		for (const plat of Object.values(salves)) {
			for (let i = 0; i < plat.length; i += 2) {
				if (plat[i] < dernierT - 1e-9 && false) nonMonotone++;
			}
		}
		capture.verser(salves);
		image++;
		const tFin = capture.tFin;
		const t0 = Math.max(0, tFin - DUREE_FENETRE);
		const ligne = [];
		for (const voie of [0, 1]) {
			const f = capture.fenetre(voie, t0, t0 + DUREE_FENETRE);
			ligne.push({ entrant: f.entrant, n: f.fronts.length, niv: f.fronts.map((x) => x.niveau).join('').slice(0, 30) });
		}
		journal.push({ image, tFin, sim: engine.simulatedMs(), ligne, nb: Object.fromEntries(Object.entries(salves).map(([k, v]) => [k, v.length / 2])) });
		if ((Date.now() - debut) / 1000 > DUREE_S) {
			clearInterval(minuterie);
			engine.stop();
			fin();
		}
	}, 16);
});

// Un résumé par seconde simulée : combien d'images montrent 0 front (trait plat).
let seconde = -1;
let plates = [0, 0];
let total = 0;
let exemples = [];
for (const j of journal) {
	const s = Math.floor(j.tFin / 1000);
	if (s !== seconde) {
		if (seconde >= 0) console.log(`s=${String(seconde).padStart(3)} images=${String(total).padStart(3)} plates v0=${plates[0]} v1=${plates[1]}  ${exemples.slice(0, 3).join(' ; ')}`);
		seconde = s; plates = [0, 0]; total = 0; exemples = [];
	}
	total++;
	for (const v of [0, 1]) if (j.ligne[v].n === 0) plates[v]++;
	if (j.ligne[0].n === 0 || j.ligne[1].n === 0) exemples.push(`#${j.image} tFin=${j.tFin.toFixed(2)} v0=${j.ligne[0].entrant}/${j.ligne[0].n} v1=${j.ligne[1].entrant}/${j.ligne[1].n} salve=${JSON.stringify(j.nb)}`);
}
console.log(`fin : tFin=${capture.tFin.toFixed(0)} ms, sim=${engine.simulatedMs().toFixed(0)} ms, images=${image}, déclenché à ${capture.tTrigger}`);
process.exit(0);
