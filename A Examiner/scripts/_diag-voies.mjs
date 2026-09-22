// Diagnostic : ce que l'ATELIER résout réellement comme voies, pour chaque
// .projix de Frank, comparé à ce que la CAPTURE enregistrée contient.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-'));
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

// Composants de bibliothèque : sans eux, partDef() lève sur dmx-grove & co.
const sources = JSON.parse(readFileSync(join(root, 'kablix_components', '_sources.json'), 'utf8'));
const liste = Array.isArray(sources) ? sources : (sources.components ?? Object.values(sources));
let charges = 0;
for (const c of liste) {
	if (!c || typeof c !== 'object' || !c.type) continue;
	try { registerCustomPart(c); charges++; } catch { /* composant que le banc n'a pas à connaître */ }
}
console.log(`(${charges} composants de bibliothèque chargés)`);

const DIR = join(root, 'testkablix');
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.projix'))) {
	let z;
	try { z = unzip(readFileSync(join(DIR, f))); } catch { continue; }
	const d = JSON.parse(z['diagram.json'].toString('utf8'));
	const typeOk = (t) => { try { return partDef(t); } catch { return null; } };
	const inconnus = (d.parts || []).filter((p) => !typeOk(p.type)).map((p) => p.type);
	const sondes = (d.parts || []).filter((p) => typeOk(p.type)?.kind === 'logic-probe');
	if (!sondes.length) continue;
	const k = JSON.parse(z['kablix.json'].toString('utf8'));
	console.log('\n##', f);
	if (inconnus.length) console.log('   ⚠ types inconnus du banc :', [...new Set(inconnus)].join(', '));
	let voies;
	try { voies = logicProbeVoies(d); } catch (e) { console.log('   logicProbeVoies BOUM:', e.message); continue; }
	console.log('   ATELIER pousse :', JSON.stringify(voies.map((v) => ({ voie: v.voie, pin: v.pin ?? '', pb: v.probleme ?? null, suivi: !!v.suivi }))));
	const cap = k.analyseur?.voies ?? [];
	console.log('   CAPTURE porte  :', JSON.stringify(cap.map((v) => ({ voie: v.voie, pin: v.pin, fronts: (v.fronts || []).length / 2 }))));
	// Le point qui décide du dessin : une piste porte-t-elle la broche mesurée ?
	const pinsAtelier = new Set(voies.filter((v) => v.pin).map((v) => v.pin));
	const orphelines = cap.filter((c) => !pinsAtelier.has(c.pin));
	if (orphelines.length) console.log('   ⚠ capture SANS piste correspondante :', orphelines.map((c) => `${c.pin}(voie ${c.voie}, ${(c.fronts || []).length / 2} fronts)`).join(', '));
	const muettes = voies.filter((v) => v.pin && !cap.some((c) => c.pin === v.pin));
	if (muettes.length) console.log('   ⚠ piste SANS capture :', muettes.map((v) => `${v.pin}(voie ${v.voie})`).join(', '));
	const pb = voies.filter((v) => v.probleme);
	if (pb.length) console.log('   ⚠ sondes en défaut :', pb.map((v) => `voie ${v.voie}: ${v.probleme}`).join(', '));
}
