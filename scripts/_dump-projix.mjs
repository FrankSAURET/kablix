// Affiche le contenu d'un .projix (composants + fils) : node scripts/_dump-projix.mjs <chemin…>
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const diagram = JSON.parse(await zip.file('diagram.json').async('string'));
  console.log(`=== ${file} ===`);
  for (const p of diagram.parts) {
    console.log(`  part ${p.id} : ${p.type} (${p.x},${p.y}) ${JSON.stringify(p.attrs ?? {})}`);
  }
  for (const w of diagram.wires ?? []) {
    console.log(`  wire ${w.id} : ${w.a.partId}/${w.a.pin} → ${w.b.partId}/${w.b.pin}`);
  }
}
