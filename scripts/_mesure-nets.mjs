// Mesure jetable : coût d'un buildNets sur les vrais schémas de test, et nombre
// d'appels que déclenche UNE frame de rendu (refreshVisuals rappelle les
// bindings/états composant par composant, chacun rebâtissant la netlist).
import esbuild from 'esbuild';
import JSZip from 'jszip';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.KABLIX_ROOT ?? 'h:/OneDrive/4 Programation/- VS Code/Extensions/Kablix';
const tmp = mkdtempSync(join(tmpdir(), 'kablix-nets-'));
const out = join(tmp, 'model.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src/webview/diagram/model.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const model = await import(pathToFileURL(out).href);

const fichiers = [
  'Neopixel-ring-pico.projix',
  'keypad-pico.projix',
  'Horloge.projix',
  '16 servo + alim.projix',
];

for (const f of fichiers) {
  const zip = await JSZip.loadAsync(readFileSync(join(ROOT, 'testkablix', f)));
  const diagram = JSON.parse(await zip.files['diagram.json'].async('string'));
  const parts = diagram.parts?.length ?? 0;
  const wires = diagram.wires?.length ?? 0;
  // Chauffe puis mesure.
  for (let i = 0; i < 50; i++) model.buildNets(diagram);
  const t0 = performance.now();
  const N = 500;
  for (let i = 0; i < N; i++) model.buildNets(diagram);
  const ms = (performance.now() - t0) / N;
  console.log(`${f} : ${parts} composants, ${wires} fils — buildNets ${ms.toFixed(3)} ms`);
}
