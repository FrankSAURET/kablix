import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const zip = await JSZip.loadAsync(readFileSync(f));
  console.log('=== ' + f + ' ===');
  console.log(Object.keys(zip.files).join(' | '));
  const kj = zip.file('kablix.json');
  if (kj) console.log(await kj.async('string'));
}
