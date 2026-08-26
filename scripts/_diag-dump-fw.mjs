// Lire le firmware à la loupe : les demi-mots du code machine à une adresse.
// Sert à reconnaître une fonction du SDK repérée par la trace d'exécution.
//   node scripts/_diag-dump-fw.mjs <rp2040|rp2350> <adresse hex> [nb demi-mots]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-dump-'));
const out = join(tmp, 'uf2.mjs');
await esbuild.build({ entryPoints: [join(ROOT, 'src/shared/uf2.ts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { parseUf2 } = await import(pathToFileURL(out).href);

const famille = process.argv[2] ?? 'rp2350';
const base = Number(process.argv[3]);
const n = Number(process.argv[4] ?? 64);
const fw = firmwarePico(famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-');
const flash = new Uint8Array(4 * 1024 * 1024);
for (const s of parseUf2(new Uint8Array(readFileSync(fw)))) {
	if (s.addr >= 0x10000000 && s.addr < 0x10400000) flash.set(s.data, s.addr - 0x10000000);
}
const lignes = [];
for (let i = 0; i < n; i++) {
	const a = base + i * 2;
	const off = a - 0x10000000;
	lignes.push(`0x${a.toString(16)} ${(flash[off] | (flash[off + 1] << 8)).toString(16).padStart(4, '0')}`);
}
// Huit demi-mots par ligne : la forme du code se lit d'un coup d'œil.
for (let i = 0; i < lignes.length; i += 8) console.log(lignes.slice(i, i + 8).join('  '));
