// A/B entrelacé : deux bundles figés, alternés, meilleure passe de chacun.
import { spawnSync } from 'node:child_process';
const [a, b, na, nb, cible = 'arm'] = process.argv.slice(2);
const best = {};
for (let p = 0; p < 3; p++) {
	for (const [f, nom] of [[a, na], [b, nb]]) {
		const r = spawnSync(process.execPath, [f, cible, '--n=400000'], { encoding: 'utf8', maxBuffer: 1 << 28 });
		const l = (r.stdout || '').split('\n').find((x) => x.includes('Minstr/s'));
		const v = +l.match(/→ ([\d.]+) Minstr/)[1];
		best[nom] = Math.max(best[nom] ?? 0, v);
		console.log(`p${p} ${nom} : ${v} Minstr/s`);
	}
}
console.log(`\n${na} ${best[na]} → ${nb} ${best[nb]} : ×${(best[nb] / best[na]).toFixed(3)}`);
