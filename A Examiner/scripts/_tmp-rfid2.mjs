import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { lireKompix } from './_lire-kompix.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kx-'));
const out = join(tmp, 'model.mjs');
await esbuild.build({ entryPoints: [join(root, 'src/webview/diagram/model.mts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', loader: { '.svg': 'text', '.webp': 'dataurl' } });
const model = await import(pathToFileURL(out).href);
const cat = await import(pathToFileURL(out).href);
const zip = await JSZip.loadAsync(readFileSync(join(root, 'testkablix/grove-rfid-pico2.projix')));
const d = JSON.parse(await zip.file('diagram.json').async('string'));
for (const c of d.customParts ?? []) { try { model.registerCustomPart?.(c); } catch {} }
console.log('parts:', d.parts.map((p) => p.id + ':' + p.type).join(' '));
try { console.log('bindings:', JSON.stringify(model.customRfidBindings(d))); }
catch (e) { console.log('EXCEPTION', e.message); }
