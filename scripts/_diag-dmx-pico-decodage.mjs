// Diagnostic (Frank, 25/09) : « avec DmxSimple je vois le décodage des canaux ;
// avec dmx-pico, des pauses et des cadrages ». On fait tourner le VRAI
// dmx-pico.py dans le moteur Pico, on verse les fronts de GP0 dans la VRAIE
// capture, puis le VRAI décodeur DMX lit la capture entière — et, comme l'onglet,
// des fenêtres de quelques centaines de µs.
//   node scripts/_diag-dmx-pico-decodage.mjs [secondes réelles, défaut 25]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-dmxdec-'));
const DUREE = Number(process.argv[2] ?? 25) * 1000;

async function bundle(contents, name) {
	const out = join(tmp, name);
	await esbuild.build({
		stdin: { contents, resolveDir: ROOT, loader: 'ts' },
		outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
		loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' },
	});
	return import(pathToFileURL(out).href);
}

const { parseUf2 } = await bundle("export * from './src/shared/uf2.ts';\n", 'uf2.mjs');
const { PicoEngine } = await bundle("export * from './src/webview/engines/pico.mts';\n", 'pico.mjs');
const { AnalyseurCapture } = await bundle("export * from './src/webview/analyseur-capture.mts';\n", 'cap.mjs');
const { decoder } = await bundle("export * from './src/webview/analyseur-decodage.mts';\n", 'dec.mjs');

const script = readFileSync(join(ROOT, 'testkablix', 'dmx-pico.py'), 'utf8');
// Deuxième argument : rp2350 pour le Pico 2.
const famille = process.argv[3] ?? 'rp2040';
const fw = firmwarePico(famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-');
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script }, famille);
engine.setDmx(['GP0']);
engine.setLogicProbes?.(['GP0']);
// Comme l'atelier : les broches sondées sont aussi suivies en impulsions.
engine.setPulseMonitors?.(['GP0']);

const capture = new AnalyseurCapture();
capture.declarerVoies([{ voie: 0, pin: 'GP0', nom: 'GP0' }]);
const brut = [];
let serial = '';
engine.onSerial = (c) => { serial += c; };
const draine = () => {
	const lots = engine.drainScopeEdges?.() ?? {};
	if (lots.GP0) brut.push(...lots.GP0);
	capture.verser(lots);
};
engine.start();
const t0 = Date.now();
await new Promise((res) => {
	const h = setInterval(() => {
		draine();
		if (Date.now() - t0 > DUREE) { clearInterval(h); res(); }
	}, 20);
});
draine();
// Source de clk_peri choisie par le firmware (AUXSRC, bits 7:5 de CLK_PERI_CTRL).
const horloges = engine.mcu?.peripherals?.[famille === 'rp2350' ? 0x40010 : 0x40008];
if (horloges) {
	const ctrl = horloges.readUint32(0x48);
	console.log('CLK_PERI_CTRL = 0x' + ctrl.toString(16), 'AUXSRC', (ctrl >> 5) & 7, 'clkPeri', engine.mcu.clkPeri, 'débit UART vu', engine.mcu.uart[0].baudRate);
}
engine.dispose();
console.log('série :', JSON.stringify(serial.slice(-200)));
console.log('fronts bruts GP0 :', brut.length / 2);

// Trames : repérées par leur BREAK (bas >= 88 µs) dans les fronts bruts.
const v = capture.listeVoies[0];
console.log('fronts capturés :', v.fronts.length, 'niveau initial', v.niveauInitial);
const breaks = [];
for (let i = 0; i + 1 < v.fronts.length; i++) {
	const f = v.fronts[i];
	if (f.niveau === 0 && v.fronts[i + 1].t - f.t >= 0.088) breaks.push(f.t);
}
console.log('BREAK :', breaks.map((t) => t.toFixed(4)).join(' '));

// Détail des intervalles d'une trame : fronts relatifs au BREAK, en µs.
for (const tb of breaks.slice(0, 3)) {
	const rel = v.fronts.filter((f) => f.t >= tb && f.t < tb + 0.5).map((f) => `${((f.t - tb) * 1000).toFixed(1)}:${f.niveau}`);
	console.log(`trame ${tb.toFixed(4)} :`, rel.join(' '));
}

const r = { protocole: 'dmx', donnees: 0, base: 'dec', bits: true };
const resume = (ann) => ann.filter((a) => !a.bit).map((a) => a.texte).join(' ');
console.log('\n--- capture entière ---');
const tout = decoder([v], r);
console.log(resume(tout).slice(0, 600));
console.log('erreurs :', tout.filter((a) => a.nature === 'erreur').length, '/', tout.length);

// Comme l'onglet : fenêtre visible + 10 % de marge, recul de 30 ms à gauche.
console.log('\n--- fenêtres de l\'onglet (autour de chaque trame) ---');
for (const tb of breaks.slice(0, 4)) {
	for (const [g, d] of [[-0.05, 0.4], [0.02, 0.3], [0.1, 0.25]]) {
		const duree = d - g;
		const a = tb + g - Math.max(duree * 0.1, 30);
		const b = tb + d + duree * 0.1;
		const f = capture.fenetre(0, a, b);
		const ann = decoder([{ ...v, niveauInitial: f.entrant, fronts: f.fronts }], r)
			.filter((x) => x.t1 >= tb + g && x.t0 <= tb + d);
		console.log(`  ${tb.toFixed(3)} [${g}, ${d}] ms : ${resume(ann)}`);
	}
}
