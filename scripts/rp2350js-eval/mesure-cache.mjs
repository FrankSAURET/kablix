// Combien rapporte le cache de décodage RISC-V ? On le court-circuite et on
// remesure, en JS compilé, meilleure de 3 passes.
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
await esbuild.build({ entryPoints: ['vitesse.ts'], outfile: './bench-nocache.cjs', bundle: true,
	platform: 'node', format: 'cjs', keepNames: false, sourcemap: false, logLevel: 'error' });
let best = null;
for (let p = 0; p < 3; p++) {
	const r = spawnSync(process.execPath, ['./bench-nocache.cjs', 'riscv', '--n=400000'], { encoding: 'utf8', maxBuffer: 1 << 28 });
	const l = (r.stdout || '').split('\n').find((x) => x.includes('Minstr/s'));
	const ms = +l.match(/en (\d+) ms/)[1];
	console.log(`  sans cache p${p} : ${ms} ms`);
	if (!best || ms < best.ms) best = { ms, l };
}
console.log(`RISC-V SANS cache :: ${best.l}`);
