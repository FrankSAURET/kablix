// Lancement SANS fichier de code (Frank, 02/10 : « si pas de carte ou pas de
// code : pas de simulation. Change ça »).
//
// Volet A — les programmes vides tournent vraiment : l'AVR (Uno) et le Pico
// avancent dans le temps simulé sans rien écrire sur leurs broches.
// Volet B — l'hôte et la page : sans fichier choisi ni éditeur actif, l'hôte
// demande « runBlank » (au lieu d'un avertissement) et la page lance le montage
// sur le programme vide ; un fichier de projet INTROUVABLE garde son erreur.
//
// Contre-épreuve : `git stash` puis relancer — le banc DOIT échouer.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const check = (ok, nom, detail = '') => {
	if (!ok) echecs++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-sans-programme-'));
const out = join(tmp, 'moteurs.mjs');
await esbuild.build({
	stdin: {
		contents: `export { AvrEngine } from './src/webview/engines/avr.mts';
export { PicoEngine } from './src/webview/engines/pico.mts';
export { AVR_VIDE, PICO_VIDE } from './src/webview/programs/vide.mts';`,
		resolveDir: root, loader: 'ts',
	},
	outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
});
const { AvrEngine, PicoEngine, AVR_VIDE, PICO_VIDE } = await import(pathToFileURL(out).href);

console.log('A — programmes vides');
{
	const eng = new AvrEngine(AVR_VIDE, null, 'avr328');
	let bascules = 0;
	eng.ports.B.addListener(() => bascules++);
	eng.ports.D.addListener(() => bascules++);
	eng.start();
	await attendre(200);
	eng.stop();
	check(eng.cpu.cycles > 100_000, 'Uno : le processeur avance', `${eng.cpu.cycles} cycles`);
	check(bascules === 0, 'Uno : aucune broche ne bouge');
	eng.dispose?.();
}
for (const famille of ['rp2040', 'rp2350']) {
	const eng = new PicoEngine({ kind: 'ram', image: PICO_VIDE }, famille);
	let bascules = 0;
	for (const g of eng.mcu.gpio) g.addListener(() => bascules++);
	eng.start();
	await attendre(300);
	const ms = eng.simulatedMs?.() ?? 0;
	eng.stop();
	check(ms > 1, `${famille} : le temps simulé avance`, `${ms} ms`);
	check(bascules === 0, `${famille} : aucune broche ne bouge`);
	eng.dispose?.();
}

console.log('B — la page et l’hôte');
const sim = readFileSync(join(root, 'src/webview/sim.mts'), 'utf8');
const panel = readFileSync(join(root, 'src/panel.ts'), 'utf8');
const lancer = sim.match(/function lancerSansProgramme\(\)[\s\S]*?\r?\n}\r?\n/)?.[0] ?? '';
check(/AVR_VIDE/.test(lancer) && /PICO_VIDE/.test(lancer) && /startRun\(\)/.test(lancer),
	'la page lance un programme vide sur Uno/Mega comme sur Pico');
check(/case 'runBlank':[\s\S]*?lancerSansProgramme\(\)/.test(sim), 'la page répond au message « runBlank » de l’hôte');
const compile = panel.match(/public async compileActiveFile[\s\S]*?await doc\.save\(\);/)?.[0] ?? '';
check(/if \(!doc\) \{[\s\S]*?type: 'runBlank'/.test(compile) && !/no active file to compile/.test(compile),
	'l’hôte, sans fichier ni éditeur actif, demande un lancement à vide au lieu d’un avertissement');
check(/missingCodeFileRef\) \{[\s\S]*?return;/.test(compile.slice(0, compile.indexOf("type: 'runBlank'"))),
	'un fichier de projet INTROUVABLE garde son message d’erreur (pas de lancement à vide silencieux)');
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs})` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
