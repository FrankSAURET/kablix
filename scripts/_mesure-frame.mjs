// Mesure jetable : coût MODÈLE d'une frame de refreshVisuals (tous les helpers
// appelés composant par composant) sur les vrais schémas de test, sans et avec
// le cache de frame.
import esbuild from 'esbuild';
import JSZip from 'jszip';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-frame-'));
const out = join(tmp, 'model.mjs');
const outCat = join(tmp, 'catalog.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/model.mts')],
  outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/catalog.mts')],
  outfile: outCat, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const m = await import(pathToFileURL(out).href);
const { partDef } = await import(pathToFileURL(outCat).href);
const read = () => false;

// Reproduit les appels modèle de refreshVisuals pour un schéma donné.
const frameModele = (d) => {
  m.servoBindings(d);
  for (const p of d.parts) {
    const kind = partDef(p.type).kind;
    switch (kind) {
      case 'led':
        m.ledOn(d, p.id, read);
        m.ledMcuPin(d, p.id);
        m.ledPowerCircuit(d, p.id);
        break;
      case 'rgb-led': {
        m.rgbLedState(d, p.id, read);
        for (const c of ['R', 'G', 'B']) m.rgbSeriesOhms(d, p.id, c);
        break;
      }
      case 'seven-segment':
        m.sevenSegmentState(d, p.id, read);
        break;
      case 'led-bar':
        m.ledBarState(d, p.id, read);
        break;
      case 'buzzer':
        m.buzzerOn(d, p.id, read);
        break;
      case 'psu':
        m.psuLoadAmps(d, p.id, 5);
        break;
      default:
        break;
    }
  }
};

for (const f of readdirSync(join(root, 'testkablix')).filter((x) => x.endsWith('.projix'))) {
  const zip = await JSZip.loadAsync(readFileSync(join(root, 'testkablix', f)));
  const d = JSON.parse(await zip.files['diagram.json'].async('string'));
  const run = (cache) => {
    if (cache) m.beginModelFrame(d);
    frameModele(d);
    if (cache) m.endModelFrame();
  };
  const mesure = (cache) => {
    for (let i = 0; i < 20; i++) run(cache);
    const N = 100;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) run(cache);
    return (performance.now() - t0) / N;
  };
  const a = mesure(false);
  const b = mesure(true);
  console.log(
    `${f} (${d.parts.length} comp., ${d.wires.length} fils) : ` +
    `${a.toFixed(2)} ms → ${b.toFixed(2)} ms (${(a / b).toFixed(1)}×)`
  );
}
