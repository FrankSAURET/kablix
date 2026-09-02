// Repro : le schéma jauneRouge de Frank, D2 haute (LED rouge allumée).
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-repro-'));
const buildTo = async (entry, outfile) => {
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: join(tmp, outfile),
    bundle: true, platform: 'node', format: 'esm',
    loader: { '.svg': 'text', '.webp': 'dataurl' }, logLevel: 'silent',
  });
  return import(pathToFileURL(join(tmp, outfile)).href);
};
const { meterReadings } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');

const src = process.argv[2] ?? 'V:/Temp/claude/c----VS-Code-Extensions-Kablix/13e1c73b-6099-4954-8882-86daf79f3aa7/scratchpad/jr/diagram.json';
const d = JSON.parse(readFileSync(src, 'utf8'));
const diagram = { parts: d.parts, wires: d.wires };

// D2 = LED rouge allumée, D3 = LED jaune éteinte (moitié du clignotement).
const drive = (pin) => (pin === '2' ? 'high' : pin === '3' ? 'low' : 'hiz');
const attendu = { M1: '5 V', M2: '3,4 V', M3: '1,6 V', M4: '10,3 mA' };
for (const m of meterReadings(diagram, 5, drive)) {
  const v = m.value;
  const txt = v === null ? 'RIEN' : m.mode === 'current' ? `${(v * 1000).toFixed(2)} mA` : `${v.toFixed(3)} V`;
  console.log(`${m.partId} (${m.mode}) = ${txt}   [attendu ${attendu[m.partId]}]${m.fault ? ' FAUT:' + m.fault : ''}`);
}
