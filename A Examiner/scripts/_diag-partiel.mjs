// Diagnostic : ce que résout logicProbeVoies sur un schéma PARTIELLEMENT monté
// (le cas du chargement de projet : les composants arrivent avant les fils).
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diagp-'));
const buildTo = async (entry, outfile) => {
	await esbuild.build({
		...(typeof entry === 'string' ? { entryPoints: [join(root, entry)] } : { stdin: { ...entry, loader: 'ts' } }),
		outfile: join(tmp, outfile), bundle: true, platform: 'node', format: 'esm',
		loader: { '.svg': 'text', '.webp': 'dataurl' }, logLevel: 'silent',
	});
	return import(pathToFileURL(join(tmp, outfile)).href);
};
const { logicProbeVoies, partDef, registerCustomPart } = await buildTo(
	{
		resolveDir: join(root, 'src/webview/diagram'),
		contents: [`export * from './model.mjs';`, `export { partDef, partCategory, registerCustomPart } from './catalog.mjs';`].join('\n'),
	}, 'model.mjs');

function unzip(buf) {
	const out = {};
	let e = -1;
	for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
	const n = buf.readUInt16LE(e + 10);
	let off = buf.readUInt32LE(e + 16);
	for (let k = 0; k < n; k++) {
		const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
		const lho = buf.readUInt32LE(off + 42);
		const name = buf.toString('utf8', off + 46, off + 46 + nl);
		const m = buf.readUInt16LE(off + 10), cs = buf.readUInt32LE(off + 20);
		const ds = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
		const d = buf.subarray(ds, ds + cs);
		out[name] = m === 0 ? d : zlib.inflateRawSync(d);
		off += 46 + nl + el + cl;
	}
	return out;
}

const sources = JSON.parse(readFileSync(join(root, 'kablix_components', '_sources.json'), 'utf8'));
const liste = Array.isArray(sources) ? sources : (sources.components ?? Object.values(sources));
for (const c of liste) { if (c?.type) { try { registerCustomPart(c); } catch { /* hors banc */ } } }

const DIR = join(root, 'testkablix');
const resume = (voies) => JSON.stringify(voies.map((v) => `${v.voie}:${v.pin || '-'}${v.probleme ? '/' + v.probleme : ''}`));

for (const f of readdirSync(DIR).filter((x) => x.endsWith('.projix'))) {
	let z;
	try { z = unzip(readFileSync(join(DIR, f))); } catch { continue; }
	const d = JSON.parse(z['diagram.json'].toString('utf8'));
	const ok = (t) => { try { return partDef(t); } catch { return null; } };
	if (!(d.parts || []).some((p) => ok(p.type)?.kind === 'logic-probe')) continue;
	console.log('\n##', f, `(${(d.parts || []).length} composants, ${(d.wires || []).length} fils)`);
	console.log('   complet      :', resume(logicProbeVoies(d)));
	// Sans les fils : l'état du schéma juste après la pose des composants.
	console.log('   sans les fils:', resume(logicProbeVoies({ ...d, wires: [] })));
	// Un seul composant posé (la sonde) : le tout premier onChange.
	const sondesSeules = (d.parts || []).filter((p) => ok(p.type)?.kind === 'logic-probe');
	console.log('   sondes seules:', resume(logicProbeVoies({ parts: sondesSeules, wires: [] })));
}
