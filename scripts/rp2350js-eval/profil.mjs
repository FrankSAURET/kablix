// Profil PROPRE du moteur (sans tsx, qui pollue le profil avec ses helpers).
// 1) bundle esbuild sans keepNames  2) node --cpu-prof  3) agrégation self-time.
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';

const cible = process.argv[2] ?? 'arm';
const n = process.argv[3] ?? '40000';
const dir = `./prof-${cible}`;
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir);

await esbuild.build({
	entryPoints: ['vitesse.ts'], outfile: `${dir}/bench.cjs`, bundle: true,
	platform: 'node', format: 'cjs', keepNames: false, sourcemap: false, logLevel: 'error',
});

const r = spawnSync(process.execPath, ['--cpu-prof', '--cpu-prof-dir', dir, `${dir}/bench.cjs`, cible, `--n=${n}`], { encoding: 'utf8' });
process.stdout.write(r.stdout.split('\n').filter((l) => l.startsWith('[vitesse]')).join('\n') + '\n');

const f = readdirSync(dir).find((x) => x.endsWith('.cpuprofile'));
const p = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const self = new Map();
const parId = new Map(p.nodes.map((x) => [x.id, x]));
for (const s of p.samples) {
	const nd = parId.get(s);
	if (!nd) continue;
	const cf = nd.callFrame;
	const cle = `${cf.functionName || '(anon)'} @${(cf.url || '').split(/[\/]/).pop()}:${cf.lineNumber + 1}`;
	self.set(cle, (self.get(cle) ?? 0) + 1);
}
const total = p.samples.length;
console.log(`\n=== self-time (${total} échantillons) ===`);
[...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)
	.forEach(([k, v]) => console.log(`${((v / total) * 100).toFixed(1).padStart(5)} %  ${k}`));
