// Consommation de la carte (feuille de route n° 1, v2026.9.7.179).
//
// Il contrôle le calcul (consommation.mts) puis la chaîne complète avec la
// VRAIE AvrEngine : un programme qui dort en power-down, réveillé toutes les
// 16 ms par le chien de garde (même binaire que verify-veille-avr), doit
// afficher le courant de VEILLE de la carte ; le même programme sans le bit SE
// (SLEEP ne fait rien) celui de la carte ÉVEILLÉE.
//
// Contre-épreuve : `node scripts/verify-consommation.mjs --ancien` compile
// avr.mts dans sa version HEAD — le volet moteur DOIT échouer (SLEEP ignoré :
// jamais de veille).
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// `--ancien` : sources de HEAD ; `--ancien=<réf>` : d'une autre version (ex. HEAD~1).
const ANCIEN_ARG = process.argv.find((a) => a.startsWith('--ancien'));
const ANCIEN = !!ANCIEN_ARG;
const REF = ANCIEN_ARG?.includes('=') ? ANCIEN_ARG.split('=')[1] : 'HEAD';
if (ANCIEN) console.log(`(contre-épreuve : avr.mts en version ${REF})`);
const tmp = mkdtempSync(join(tmpdir(), 'kablix-conso-'));
const charger = async (entree, nom) => {
	const out = join(tmp, nom);
	await esbuild.build({
		entryPoints: [join(root, entree)], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
		plugins: [{
			name: 'version-head',
			setup(b) {
				b.onLoad({ filter: /[\\/]engines[\\/]avr\.mts$/ }, (args) => {
					if (!ANCIEN) return undefined;
					const contents = execFileSync('git', ['show', `${REF}:src/webview/engines/avr.mts`], { cwd: root, encoding: 'utf8' });
					return { contents, loader: 'ts', resolveDir: dirname(args.path) };
				});
			},
		}],
	});
	return import(pathToFileURL(out).href);
};
const { CompteurConsommation, COURANT_CARTE } = await charger('src/webview/consommation.mts', 'conso.mjs');
const { AvrEngine } = await charger('src/webview/engines/avr.mts', 'avr.mjs');

let echecs = 0;
const check = (ok, nom, detail = '') => {
	if (!ok) echecs++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const proche = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

console.log('Calcul');
{
	const c = new CompteurConsommation();
	const uno = COURANT_CARTE.uno;
	let m = c.pas('uno', 1000, 0, 0);
	check(proche(m.courantA, uno.eveilleeA) && proche(m.chargeAh, uno.eveilleeA / 3600),
		'Uno éveillée 1 s : courant de la carte, charge = I × t', `${(m.courantA * 1000).toFixed(1)} mA, ${(m.chargeAh * 1000).toFixed(4)} mAh`);
	m = c.pas('uno', 2000, 500, 0);
	check(proche(m.courantA, (uno.eveilleeA + uno.veilleA) / 2) && proche(m.partVeille, 0.5),
		'moitié de la tranche en veille : moyenne pondérée des deux états', `${(m.courantA * 1000).toFixed(1)} mA`);
	m = c.pas('uno', 3000, 500, 0.012);
	check(proche(m.courantA, uno.eveilleeA + 0.012), 'une LED de 12 mA sur une broche s’ajoute au courant de la carte');
	const avant = m.chargeAh;
	m = c.pas('uno', 3000, 500, 0.5);
	check(m.chargeAh === avant && proche(m.courantA, uno.eveilleeA + 0.012), 'tranche vide (pause) : rien d’ajouté, dernière mesure rendue');
	m = c.pas('pico', 4000, 1500, 0);
	check(proche(m.courantA, COURANT_CARTE.pico.veilleA), 'Pico entièrement en lightsleep : courant de veille de la carte',
		`${(m.courantA * 1000).toFixed(2)} mA`);
	c.reinitialiser();
	m = c.pas('uno', 100, 0, 0);
	check(proche(m.chargeAh, uno.eveilleeA * 0.1 / 3600), 'nouveau run : la charge repart de zéro');
	check(COURANT_CARTE.uno.veilleA > 0.02 && COURANT_CARTE.pico.veilleA < 0.002,
		'carte réelle : une Uno garde plus de 20 mA en veille, une Pico descend sous 2 mA');
}

console.log('Moteur AVR réel');
const PROGRAMME = '0c94340000000000000000000000000000000000000000000c944a000000000000000000000000000000000000000000000000000000000000000000000000000c944b0000000000000000000000000000000000000000000000000000000000000000000000000008e00ebf0fef0dbf259a03e005bd01e000936e0008e10093600000e40093600005e003bf789488951d9afdcf18951895';
const programme = (mode) => {
	const octets = Buffer.from(PROGRAMME.replace('00e40093600005e0', `00e4009360000${mode.toString(16)}e0`), 'hex');
	const mots = new Uint16Array(0x4000);
	for (let i = 0; i + 1 < octets.length; i += 2) mots[i / 2] = octets[i] | (octets[i + 1] << 8);
	return mots;
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function mesurer(mode) {
	const eng = new AvrEngine(programme(mode), null, 'avr328');
	const c = new CompteurConsommation();
	eng.start();
	let m = null;
	while (eng.simulatedMs() < 300) {
		await attendre(16);
		m = c.pas('uno', eng.simulatedMs(), eng.sleepMs?.() ?? 0, 0);
	}
	eng.stop();
	eng.dispose?.();
	return { m, simMs: eng.simulatedMs() };
}
{
	const { m, simMs } = await mesurer(0x5);
	const moyenne = (m.chargeAh * 3_600_000) / simMs;
	check(Math.abs(moyenne - COURANT_CARTE.uno.veilleA) < 0.0005,
		'power-down + chien de garde : courant moyen = veille de la Uno', `${(moyenne * 1000).toFixed(2)} mA sur ${simMs.toFixed(0)} ms`);
}
{
	const { m, simMs } = await mesurer(0x4);
	const moyenne = (m.chargeAh * 3_600_000) / simMs;
	check(Math.abs(moyenne - COURANT_CARTE.uno.eveilleeA) < 0.0005,
		'sans SE, SLEEP ne fait rien : courant de la Uno éveillée', `${(moyenne * 1000).toFixed(2)} mA`);
}
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs})` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
