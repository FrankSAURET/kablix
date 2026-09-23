// Diagnostic : voies de l'analyseur sur le dmx-pico de Frank (23/09, « les
// sondes SD1 et SD2 n'affichent rien »).
//
// Deux passes sur le schéma du .projix :
//   1. avec les composants GRAVÉS dans le projet (la carte DMX du 21/08, sans
//      reflets de sonde) — ce que l'atelier chargeait avant v2026.9.4.131 ;
//   2. avec la carte de la bibliothèque PUBLIÉE (kablix_components), celle que
//      l'ouverture envoie désormais quand elle est installée.
//
// Usage : node scripts/_diag-dmx-reflets.mjs [chemin.projix]
import esbuild from 'esbuild';
import JSZip from 'jszip';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lireKompix } from './_lire-kompix.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-dmx-'));
await esbuild.build({
  stdin: {
    resolveDir: join(root, 'src/webview/diagram'),
    contents: [
      `export { logicProbeVoies } from './model.mjs';`,
      `export { registerCustomPart } from './catalog.mjs';`,
    ].join('\n'),
    loader: 'ts',
  },
  outfile: join(tmp, 'm.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  loader: { '.svg': 'text', '.webp': 'dataurl' },
  logLevel: 'silent',
});
const { logicProbeVoies, registerCustomPart } = await import(pathToFileURL(join(tmp, 'm.mjs')).href);

const projix = process.argv[2] ?? join(root, 'testkablix', 'dmx-pico.projix');
const zip = await JSZip.loadAsync(readFileSync(projix));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

const montre = (titre) => {
  console.log(`\n${titre}`);
  for (const v of logicProbeVoies(diagram)) {
    console.log(`  ${v.partId.padEnd(4)} voie ${v.voie}  sur ${(v.accroche ?? '(fil)').padEnd(12)} → ${v.pin ?? '—'}${v.probleme ? `  [${v.probleme}]` : ''}`);
  }
};

for (const p of diagram.customParts ?? []) registerCustomPart(p);
const grave = (diagram.customParts ?? []).find((p) => p.type === 'dmx-grove');
montre(`1. Carte GRAVÉE dans le projet (reflets : ${JSON.stringify(grave?.probeMirrors ?? null)})`);

const publiee = await lireKompix('dmx-grove');
registerCustomPart(publiee);
montre(`2. Carte PUBLIÉE (reflets : ${JSON.stringify(publiee.probeMirrors ?? null)})`);
