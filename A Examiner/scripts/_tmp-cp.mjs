import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
for (const f of process.argv.slice(2)) {
  const zip = await JSZip.loadAsync(readFileSync(f));
  const d = JSON.parse(await zip.file('diagram.json').async('string'));
  console.log(f, '→ clés diagram:', Object.keys(d).join(' '),
    '| customParts:', Array.isArray(d.customParts) ? d.customParts.map((c) => c.type ?? c.id ?? '?').join(',') : '(aucun)');
}
