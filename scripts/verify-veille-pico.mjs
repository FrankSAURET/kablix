// La veille profonde du Pico se voit (v2026.9.7.179).
//
// `machine.lightsleep()` pose le bit SLEEPDEEP du registre SCR (0xE000ED10)
// autour de son WFI ; un `time.sleep()` attend en WFE sans lui — et la vraie
// puce reste alors éveillée, son courant aussi. Le moteur compte comme veille
// le temps sauté pendant que ce bit est posé (`sleepMs`), la page en tire le
// courant de la carte (feuille de route, n° 1).
//
// rp2040js ignore SCR (il ne le garde pas) : Rp2040Chip le retient au passage.
// rp2350js le tient déjà. Le banc joue, sur les DEUX puces, trois programmes
// de quelques instructions (source en fin de commentaire) qui écrivent SCR puis
// s'endorment en WFI : SLEEPDEEP posé, jamais posé, posé puis retiré.
//
// Contre-épreuve : `node scripts/verify-veille-pico.mjs --ancien` compile
// rp-chip.mts dans sa version HEAD — le banc DOIT échouer.
//
// Source (llvm-mc -triple=thumbv6m-none-eabi, ld.lld -Ttext=0x20000000) :
//   ldr r0, =0xe000ed10 ; movs r1, #MODE ; str r1, [r0] ; movs r1, #FIN ; str r1, [r0]
//   1: wfi ; b 1b
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : rp-chip.mts en version HEAD)');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-veille-pico-'));
const out = join(tmp, 'rp-chip.mjs');
await esbuild.build({
	entryPoints: [join(root, 'src/webview/engines/rp-chip.mts')],
	outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
	plugins: [{
		name: 'version-head',
		setup(b) {
			b.onLoad({ filter: /[\\/]engines[\\/]rp-chip\.mts$/ }, (args) => {
				if (!ANCIEN) return undefined;
				const contents = execFileSync('git', ['show', 'HEAD:src/webview/engines/rp-chip.mts'], { cwd: root, encoding: 'utf8' });
				return { contents, loader: 'ts', resolveDir: dirname(args.path) };
			});
		},
	}],
});
const { creerChip } = await import(pathToFileURL(out).href);

let echecs = 0;
const check = (ok, nom, detail = '') => {
	if (!ok) echecs++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${nom}${detail ? ' — ' + detail : ''}`);
};

const PROGRAMMES = {
	'SLEEPDEEP posé': ['0348042101600421016030bffde7000010ed00e0', true],
	'SLEEPDEEP jamais posé': ['0348002101600021016030bffde7000010ed00e0', false],
	'SLEEPDEEP posé puis retiré': ['0348042101600021016030bffde7000010ed00e0', false],
};

for (const famille of ['rp2040', 'rp2350']) {
	console.log(famille);
	for (const [nom, [hex, attendu]] of Object.entries(PROGRAMMES)) {
		const chip = creerChip(famille, { stopped: false, coupeLot: false });
		const puce = chip.mcu;
		puce.sram.set(Buffer.from(hex, 'hex'), 0);
		if (Array.isArray(puce.core)) {
			puce.core[0].PC = 0x20000000;
			puce.core[1].waiting = true;
		} else {
			puce.core.PC = 0x20000000;
		}
		chip.executerLot(chip.clock.nanos + 1e5);
		const dort = chip.dort();
		const profond = typeof chip.sommeilProfond === 'function' ? chip.sommeilProfond() : undefined;
		check(dort && profond === attendu, `${nom} : endormi en WFI, veille profonde ${attendu ? 'vue' : 'non vue'}`,
			`dort=${dort}, sommeilProfond=${profond}`);
	}
}
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs})` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
