// Mesure le M33 après modification : bundle esbuild + 3 passes, meilleure retenue.
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
const nom = process.argv[2] ?? 'variante';
await esbuild.build({ entryPoints: ['vitesse.ts'], outfile: './bench-arm.cjs', bundle: true,
	platform: 'node', format: 'cjs', keepNames: false, sourcemap: false, logLevel: 'error' });
let best = null;
for (let p = 0; p < 3; p++) {
	const r = spawnSync(process.execPath, ['./bench-arm.cjs', 'arm', '--n=400000'], { encoding: 'utf8', maxBuffer: 1 << 28 });
	const l = (r.stdout || '').split('\n').find((x) => x.includes('Minstr/s'));
	if (!l) { console.log('ÉCHEC', (r.stderr || '').slice(-400)); continue; }
	const ms = +l.match(/en (\d+) ms/)[1];
	if (!best || ms < best.ms) best = { ms, l };
	console.log(`  p${p} : ${ms} ms`);
}
console.log(`${nom} :: ${best.l}`);
