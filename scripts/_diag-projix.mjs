// Rejoue un projet de testkablix/ dans le moteur Pico, hors éditeur, et montre
// ce que le programme dit sur la console série. Sert à voir POURQUOI un projet
// « ne marche pas » : erreur Python, blocage, ou simple lenteur.
//
//   node scripts/_diag-projix.mjs <nom-du-test> [secondes] [--trace] [--irq]
//   node scripts/_diag-projix.mjs condo-pico2 20
//
// Le programme, les modules importés et les préambules sont préparés par
// `loadPythonProgram()` — la MÊME fonction que l'extension : ce qui tourne ici
// est ce qui tourne dans l'éditeur, aux composants près (rien n'est branché sur
// les broches, un capteur ne répondra donc pas ; ce que l'on cherche d'abord,
// c'est le message d'erreur et le fait que ça avance).
//
// Sortie : le régime (temps simulé / temps réel), la console série, et le
// verdict — programme fini, encore en cours, ou arrêté sur une erreur.
import esbuild from 'esbuild';
import JSZip from 'jszip';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const TRACE = args.includes('--trace');
const IRQ = args.includes('--irq');
const positionnels = args.filter((a) => !a.startsWith('--'));
const NOM = positionnels[0];
const SECONDES = Number(positionnels[1] ?? 15);
if (!NOM) {
	console.error('usage : node scripts/_diag-projix.mjs <nom-du-test> [secondes] [--trace]');
	process.exit(2);
}

const projix = tk(`${NOM}.projix`);
if (!existsSync(projix)) {
	console.error(`projet introuvable : ${NOM}.projix`);
	process.exit(2);
}

const zip = await JSZip.loadAsync(readFileSync(projix));
const manifest = JSON.parse(await zip.file('kablix.json').async('string'));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));
const board = manifest.board ?? 'pico';

// Le manifeste désigne le programme soit par un chemin relatif à la racine du
// dépôt, soit par un chemin absolu (`codeFileAbs`, écrit par l'éditeur).
const candidats = [
	manifest.codeFileAbs,
	manifest.codeFile && (isAbsolute(manifest.codeFile) ? manifest.codeFile : join(ROOT, manifest.codeFile)),
	manifest.codeFile && tk(manifest.codeFile.replace(/^testkablix\//, '')),
].filter(Boolean);
const codePath = candidats.find((p) => existsSync(p));
if (!codePath) {
	console.error(`programme introuvable (codeFile « ${manifest.codeFile} »)`);
	process.exit(2);
}

const PREFIXE = { pico: 'RPI_PICO-', picow: 'RPI_PICO_W-', pico2: 'RPI_PICO2-', pico2w: 'RPI_PICO2_W-' }[board] ?? 'RPI_PICO-';
const fw = firmwarePico(PREFIXE);
if (!fw) {
	console.log(`SKIP : firmware ${PREFIXE}*.uf2 absent.`);
	process.exit(0);
}
const famille = board === 'pico2' || board === 'pico2w' ? 'rp2350' : 'rp2040';
const wifi = board === 'picow' || board === 'pico2w';

const tmp = mkdtempSync(join(tmpdir(), 'kx-diag-projix-'));
async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}
const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const source = readFileSync(codePath, 'utf8');
const res = loadPythonProgram(fw, source, wifi, codePath);
const segments = res.payload.segments.map((s) => ({ addr: s.addr, data: Buffer.from(s.b64, 'base64') }));

console.log(`${NOM} — carte ${board} (${famille}), ${res.log}`);
console.log(`programme : ${codePath.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/'), '')} (${source.split('\n').length} lignes)`);
console.log(`schéma : ${diagram.parts?.length ?? 0} composants, ${diagram.wires?.length ?? 0} fils`);
console.log(`— ${SECONDES} s de montre —`);

const engine = new PicoEngine({ kind: 'flash', segments, script: res.payload.script }, famille);
let serie = '';
engine.onSerial = (chunk) => {
	serie += chunk;
	process.stdout.write(chunk);
};
if (TRACE) engine.onUpdate = () => {};

// --irq : qui réveille le cœur ? Un projet qui avance au ralenti sans rien
// imprimer tourne généralement en rond dans un gestionnaire d'interruption.
const irqs = new Map();
if (IRQ) {
	const origine = engine.mcu.setInterrupt.bind(engine.mcu);
	engine.mcu.setInterrupt = (numero, actif) => {
		if (actif) irqs.set(numero, (irqs.get(numero) ?? 0) + 1);
		return origine(numero, actif);
	};
}

const t0 = Date.now();
engine.start();
await new Promise((r) => setTimeout(r, SECONDES * 1000));
const reel = (Date.now() - t0) / 1000;
const simule = (engine.simulatedMs?.() ?? 0) / 1000;
engine.dispose();

console.log(`\n— fin —`);
console.log(`régime : ${simule.toFixed(2)} s simulées pour ${reel.toFixed(2)} s de montre (${(simule / reel).toFixed(3)}×)`);
if (IRQ) {
	console.log('interruptions levées :');
	for (const [numero, n] of [...irqs].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
		console.log(`${String(n).padStart(10)}  IRQ ${numero}`);
	}
	if (!irqs.size) console.log('         0  (aucune)');
}
const traceback = /Traceback \(most recent call last\)[\s\S]*/.exec(serie);
if (traceback) console.log(`ERREUR PYTHON :\n${traceback[0].trim().split('\n').slice(0, 12).join('\n')}`);
else if (serie.trim() === '') console.log('AUCUNE SORTIE — le programme n\'a rien imprimé.');
else console.log(`${serie.split('\n').length} lignes imprimées.`);
// Sortie FORCÉE : le moteur garde un canal de messages ouvert, et node refuse de
// s'arrêter tant qu'il existe — le script tournait alors sans fin après avoir
// tout affiché, et un enchaînement de projets restait bloqué sur le premier.
process.exit(0);
