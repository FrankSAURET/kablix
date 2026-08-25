// Valeurs attendues des deux bancs testkablix du multimètre, calculées par le
// VRAI modèle (rails et sortie du microcontrôleur compris).
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kx-diag-multi-'));
const out = join(tmp, 'diagram.mjs');
await esbuild.build({
  stdin: {
    contents: "export * as model from './src/webview/diagram/model.mts';\n",
    resolveDir: ROOT, sourcefile: 'diag.mts', loader: 'ts',
  },
  outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { model } = await import(pathToFileURL(out).href);

const w = (n, a, ap, b, bp) => ({ id: `w${n}`, a: { partId: a, pin: ap }, b: { partId: b, pin: bp } });

const bancs = [
  {
    nom: 'uno', vcc: 5, drive: { 13: 'high' },
    diagram: {
      parts: [
        { id: 'U1', type: 'uno', x: 40, y: 60 },
        { id: 'R1', type: 'resistor', x: 620, y: 90, attrs: { value: '1000' } },
        { id: 'R2', type: 'resistor', x: 620, y: 200, attrs: { value: '1000' } },
        { id: 'M1', type: 'multimetre', x: 560, y: 300, attrs: { mode: 'voltage' } },
        { id: 'R3', type: 'resistor', x: 620, y: 440, attrs: { value: '1000' } },
        { id: 'M2', type: 'multimetre', x: 560, y: 540, attrs: { mode: 'current' } },
      ],
      wires: [
        w(1, 'R1', '1', 'U1', '13'), w(2, 'R1', '2', 'R2', '1'),
        w(3, 'R2', '2', 'U1', 'GND.1'),
        w(4, 'M1', '+', 'R2', '1'), w(5, 'M1', 'GND', 'U1', 'GND.2'),
        w(6, 'R3', '1', 'U1', '5V'), w(7, 'R3', '2', 'M2', '+'),
        w(8, 'M2', 'GND', 'U1', 'GND.3'),
      ],
    },
  },
  {
    nom: 'pico', vcc: 3.3, drive: { GP15: 'high' },
    diagram: {
      parts: [
        { id: 'U1', type: 'pico', x: 40, y: 60 },
        { id: 'R1', type: 'resistor', x: 680, y: 90, attrs: { value: '1000' } },
        { id: 'R2', type: 'resistor', x: 680, y: 200, attrs: { value: '1000' } },
        { id: 'M1', type: 'multimetre', x: 620, y: 300, attrs: { mode: 'voltage' } },
        { id: 'R3', type: 'resistor', x: 680, y: 440, attrs: { value: '1000' } },
        { id: 'M2', type: 'multimetre', x: 620, y: 540, attrs: { mode: 'current' } },
      ],
      wires: [
        w(1, 'R1', '1', 'U1', 'GP15'), w(2, 'R1', '2', 'R2', '1'),
        w(3, 'R2', '2', 'U1', 'GND.7'),
        w(4, 'M1', '+', 'R2', '1'), w(5, 'M1', 'GND', 'U1', 'GND.8'),
        w(6, 'R3', '1', 'U1', '3V3'), w(7, 'R3', '2', 'M2', '+'),
        w(8, 'M2', 'GND', 'U1', 'GND.3'),
      ],
    },
  },
];

for (const b of bancs) {
  for (const etat of ['high', 'low']) {
    const d = (p) => (b.drive[p] ? etat : 'hiz');
    const lus = model.meterReadings(b.diagram, b.vcc, d);
    console.log(b.nom, 'D=' + etat, JSON.stringify(lus));
  }
}
