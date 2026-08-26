// La liste des réveils du firmware, lue directement dans la mémoire du Pico 2.
//
// Le SDK garde les réveils dans un petit tas : un tableau de N cases, une liste
// des cases libres, et une file ordonnée par échéance. Quand la liste des cases
// libres est vide, poser un réveil échoue (-1) et le firmware attend les yeux
// ouverts. On lit donc l'état de ce tas après quelques secondes de simulation.
//   node scripts/_diag-pico2-tas.mjs [secondes] [adresse hex du pool]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-tas-'));
const duree = Number(process.argv[2] ?? 10) * 1000;
const POOL = Number(process.argv[3] ?? 0x20001784);

async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
}
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const segments = parseUf2(new Uint8Array(readFileSync(firmwarePico('RPI_PICO2-')))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new PicoEngine({ kind: 'flash', segments, script: 'import time\nwhile True:\n    time.sleep_ms(10)\n' }, 'rp2350');
const puce = engine.sim.chip.puce;

engine.onRunning = () => console.log('script démarré');
engine.start();
await new Promise((r) => setTimeout(r, duree));
engine.stop();

const mot = (a) => puce.readUint32(a >>> 0) >>> 0;
const octet = (a) => (puce.readUint32((a & ~3) >>> 0) >>> ((a & 3) * 8)) & 0xff;
const hx = (v) => '0x' + (v >>> 0).toString(16).padStart(8, '0');

console.log(`\npool à ${hx(POOL)} :`);
for (let i = 0; i < 32; i += 4) console.log(`  +${i.toString().padStart(2)} : ${hx(mot(POOL + i))}`);

// Le tas : on essaie les pointeurs plausibles trouvés dans le pool.
const candidats = [];
for (let i = 0; i < 32; i += 4) {
	const v = mot(POOL + i);
	if (v >= 0x20000000 && v < 0x20082000) candidats.push({ off: i, adr: v });
}
console.log('\npointeurs vers la mémoire vive :');
for (const c of candidats) {
	console.log(`  +${c.off} → ${hx(c.adr)} : ${[0, 4, 8, 12].map((d) => hx(mot(c.adr + d))).join(' ')}`);
}

// Un pheap ressemble à : nodes*, comparator*, user_data*, max_nodes, root_id, free_head_id.
for (const c of candidats) {
	const nodes = mot(c.adr);
	if (nodes < 0x20000000 || nodes >= 0x20082000) continue;
	const max = octet(c.adr + 12), root = octet(c.adr + 13), libre = octet(c.adr + 14);
	if (max === 0 || max > 64) continue;
	console.log(`\ntas candidat à ${hx(c.adr)} : ${max} cases · racine ${root} · première case libre ${libre}`);
	let n = 0;
	for (let id = libre; id && n < max + 2; n++) id = octet(nodes + (id - 1) * 3);
	console.log(`  cases libres chaînées : ${libre === 0 ? 0 : n}`);
}
process.exit(0);
