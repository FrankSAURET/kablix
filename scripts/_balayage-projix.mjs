// Balayage de non-régression : autoroute CHAQUE .projix de testkablix et compte
// les fils qui survolent une broche étrangère ou traversent un corps tiers.
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
// Les schémas Pico sont à plat, les schémas Arduino dans un dossier chacun.
const fichiers = [
	...readdirSync(ROOT + '/testkablix').filter((f) => f.endsWith('.projix')),
	...readdirSync(ROOT + '/testkablix/Arduino', { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => `Arduino/${d.name}/${d.name}.projix`)
		.filter((f) => existsSync(ROOT + '/testkablix/' + f)),
];
const bilan = [];
for (const f of fichiers) {
	let txt = '';
	try {
		txt = execFileSync('node', ['scripts/_mesure-projix.mjs', 'testkablix/' + f], {
			cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
		});
	} catch (e) {
		bilan.push([f, 'ERREUR', String(e.message).slice(0, 120)]);
		continue;
	}
	const i = txt.indexOf('{\n');
	if (i < 0) { bilan.push([f, 'ERREUR', 'pas de mesure']); continue; }
	let j;
	try { j = JSON.parse(txt.slice(i)); } catch { bilan.push([f, 'ERREUR', 'json']); continue; }
	if (j.err) { bilan.push([f, 'ERREUR', j.err.slice(0, 120)]); continue; }
	const surv = j.rows.filter((r) => r.surPins.length);
	const perc = j.rows.filter((r) => r.pierce.length);
	bilan.push([f, `${surv.length} survol / ${perc.length} traversée / ${j.rows.length} fils`,
		surv.map((r) => r.w + ' → ' + r.surPins.join(',')).join(' ; ')]);
}
for (const [f, etat, det] of bilan) console.log(etat.padEnd(34), f, det ? '| ' + det : '');
