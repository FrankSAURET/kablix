// Repro : BP3 câblé en pull-down externe (5V → bouton → D3 → 10k → GND).
// Le .projix est une archive ZIP (kablix.json + diagram.json).
import esbuild from 'esbuild';
import JSZip from 'jszip';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-bp3-'));
const buildTo = async (entry, outfile) => {
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: join(tmp, outfile),
    bundle: true, platform: 'node', format: 'esm',
    loader: { '.svg': 'text', '.webp': 'dataurl' }, logLevel: 'silent',
  });
  return import(pathToFileURL(join(tmp, outfile)).href);
};
const { buttonBindings, buildNets } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
const zip = await JSZip.loadAsync(readFileSync(process.argv[2]));
const d = JSON.parse(await zip.file('diagram.json').async('string'));
const diagram = { parts: d.parts, wires: d.wires };
const nets = buildNets(diagram);
for (const p of diagram.parts.filter((p) => p.type.startsWith('button'))) {
  const pins = ['1.l', '1.r', '2.l', '2.r'];
  console.log(p.id, p.type, pins.map((x) => `${x}=${nets.netOf({ partId: p.id, pin: x })}`).join(' '));
}
console.log('bindings:', JSON.stringify(buttonBindings(diagram)));
