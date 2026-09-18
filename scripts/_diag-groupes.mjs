// Diagnostic : des propriétés d'un MÊME groupe sont-elles non contiguës dans le
// catalogue ? propHost ne mémorise que le DERNIER groupe ouvert : un groupe qui
// revient plus bas recrée un deuxième en-tête et un deuxième corps — donc des
// propriétés qui semblent en double (ou en triple).
import { build as esbuild } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'C:/- VS Code/Extensions/Kablix';
const CACHE = join(ROOT, 'node_modules', '.cache-diag-groupes');
mkdirSync(CACHE, { recursive: true });

const b = await esbuild({
	stdin: {
		contents: `
			import { CATALOG } from '../../src/webview/diagram/catalog.mjs';
			export { CATALOG };
		`,
		resolveDir: CACHE,
		loader: 'js',
	},
	bundle: true, format: 'esm', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
writeFileSync(join(CACHE, 'cat.mjs'), b.outputFiles[0].text);
const { CATALOG } = await import('file:///' + join(CACHE, 'cat.mjs').replace(/\\/g, '/'));

let n = 0;
for (const def of CATALOG) {
	const props = def.props ?? [];
	const vus = new Set();
	let prec = null;
	const brises = [];
	for (const p of props) {
		const g = p.group ?? '';
		if (g !== prec && vus.has(g)) brises.push(g);
		vus.add(g);
		prec = g;
	}
	// Attribut présent deux fois dans le même catalogue : doublon franc.
	const attrs = props.map((p) => p.attr);
	const dbl = attrs.filter((a, i) => attrs.indexOf(a) !== i);
	if (brises.length || dbl.length) {
		n++;
		console.log(`${def.type} : groupes repris=[${[...new Set(brises)].join(', ')}] attrs en double=[${[...new Set(dbl)].join(', ')}]`);
	}
}
console.log(n === 0 ? 'aucun groupe non contigu, aucun attribut en double' : `${n} entrée(s) de catalogue concernée(s)`);
