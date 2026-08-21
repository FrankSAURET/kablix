// Rejoue vitesse.ts en JS COMPILÉ (bundle esbuild, comme notre banc Kablix)
// au lieu de tsx : on soupçonne tsx (keepNames -> __name) de plomber V8.
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';

await esbuild.build({
	entryPoints: ['vitesse.ts'], outfile: './bench-compile.cjs', bundle: true,
	platform: 'node', format: 'cjs', keepNames: false, sourcemap: false, logLevel: 'error',
});
for (const cible of process.argv.slice(2)) {
	const r = spawnSync(process.execPath, ['./bench-compile.cjs', cible, '--n=400000'], { encoding: 'utf8', maxBuffer: 1 << 28 });
	process.stdout.write(r.stdout.split('\n').filter((l) => l.startsWith('[vitesse]')).join('\n') + '\n');
}
