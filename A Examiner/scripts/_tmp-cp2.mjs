import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
const zip = await JSZip.loadAsync(readFileSync(process.argv[2]));
const d = JSON.parse(await zip.file('diagram.json').async('string'));
const c = (d.customParts ?? []).find((x) => (x.type ?? x.id) === 'grove-rfid');
if (!c) { console.log('grove-rfid absent'); process.exit(0); }
console.log('clés:', Object.keys(c).join(' '));
console.log('rfid:', JSON.stringify(c.rfid ?? c.custom?.rfid ?? null).slice(0, 400));
console.log('version:', c.version, '| experimental:', c.experimental);
console.log('toggles:', JSON.stringify(c.toggles ?? c.custom?.toggles ?? null).slice(0, 200));
