// Contre-vérification ENTRELACÉE : Kablix et leur M33 alternés, pour que la
// dérive thermique/charge de la machine frappe les deux également.
import { spawnSync } from 'node:child_process';
const KABLIX = 'c:/- VS Code/Extensions/Kablix';
const t = { kablix: [], m33: [] };
for (let p = 0; p < 3; p++) {
	for (const [cle, argv, opts] of [
		['kablix', [`${KABLIX}/scripts/_banc-rp2040js-nu.mjs`], { cwd: KABLIX }],
		['m33', ['./bench-compile.cjs', 'arm', '--n=400000'], {}],
	]) {
		const r = spawnSync(process.execPath, argv, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
		const l = (r.stdout || '').split('\n').find((x) => x.includes('Minstr/s'));
		const regime = +l.match(/régime ×([\d.]+)/)[1];
		t[cle].push(regime);
		console.log(`p${p} ${cle} : régime ×${regime}`);
	}
}
const max = (a) => Math.max(...a);
console.log(`\nmeilleur régime  Kablix ×${max(t.kablix)}  M33 ×${max(t.m33)}  → M33 = ${(max(t.m33) / max(t.kablix) * 100).toFixed(0)} % du nôtre`);
