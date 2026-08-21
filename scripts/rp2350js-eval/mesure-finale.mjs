// Mesure propre : TOUT en JS compilé (comme la webview Kablix), 3 passes par
// cible, on garde la MEILLEURE (la machine est bruyante : ±45 % constaté).
import { spawnSync } from 'node:child_process';
const KABLIX = 'c:/- VS Code/Extensions/Kablix';
const passes = 3;
const res = [];
function meilleure(tag, argv, opts = {}) {
	let best = null;
	for (let p = 0; p < passes; p++) {
		const r = spawnSync(process.execPath, argv, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
		const l = (r.stdout || '').split('\n').find((x) => x.includes('Minstr/s'));
		if (!l) { console.log(`${tag} p${p} : ÉCHEC ${(r.stderr || '').slice(-200)}`); continue; }
		const ms = +l.match(/en (\d+) ms/)[1];
		if (!best || ms < best.ms) best = { ms, l };
		console.log(`  ${tag} p${p} : ${ms} ms`);
	}
	if (best) { res.push(`${tag.padEnd(22)} ${best.l.replace(/^\[\w+\] /, '')}`); }
}
meilleure('eux/M33 (arm)', ['./bench-compile.cjs', 'arm', '--n=400000']);
meilleure('eux/M0+ (rp2040)', ['./bench-compile.cjs', 'rp2040', '--n=400000']);
meilleure('eux/RISC-V', ['./bench-compile.cjs', 'riscv', '--n=400000']);
meilleure('Kablix/rp2040js', [`${KABLIX}/scripts/_banc-rp2040js-nu.mjs`], { cwd: KABLIX });
console.log('\n=== MEILLEURES PASSES ===');
res.forEach((r) => console.log(r));
