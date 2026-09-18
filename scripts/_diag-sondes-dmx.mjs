// Diagnostic : ce que l'analyseur logique trouve sur un .projix réel — une
// ligne par sonde, avec sa broche ou sa raison d'être muette.
// Usage : node scripts/_diag-sondes-dmx.mjs [testkablix/dmx-pico.projix]
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-sondes-'));

// Modèle ET catalogue dans UN SEUL paquet : deux constructions séparées
// auraient chacune leur propre Map de composants de bibliothèque, et
// l'enregistrement fait d'un côté ne serait pas vu de l'autre.
const pont = join(tmp, 'pont.mts');
writeFileSync(pont, [
	`export { logicProbeVoies, pulseMonitorPins } from '${join(root, 'src/webview/diagram/model.mts').split('\\').join('/')}';`,
	`export { registerCustomPart } from '${join(root, 'src/webview/diagram/catalog.mts').split('\\').join('/')}';`,
].join('\n'));
await esbuild.build({
	entryPoints: [pont], outfile: join(tmp, 'pont.mjs'),
	bundle: true, platform: 'node', format: 'esm',
	loader: { '.svg': 'text', '.webp': 'dataurl' }, logLevel: 'silent',
});
const { logicProbeVoies, pulseMonitorPins, registerCustomPart } =
	await import(pathToFileURL(join(tmp, 'pont.mjs')).href);

const cible = process.argv[2] ?? 'testkablix/dmx-pico.projix';
const zip = await JSZip.loadAsync(readFileSync(join(root, cible)));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));
// Composants de bibliothèque du schéma (dmx-grove, spot…) : sans eux `partDef`
// jette dès le premier filtre.
for (const c of diagram.customParts ?? []) registerCustomPart(c);

console.log('--', cible);
for (const p of diagram.parts.filter((p) => /sonde/i.test(p.type))) {
	console.log(`  ${p.id.padEnd(5)} accroche="${p.attrs?.accroche ?? ''}" voie=${p.attrs?.voie ?? ''}`);
}
console.log('-- voies rendues par le modèle');
for (const v of logicProbeVoies(diagram)) console.log('  ' + JSON.stringify(v));
console.log('-- broches balayées :', JSON.stringify(pulseMonitorPins(diagram)));
