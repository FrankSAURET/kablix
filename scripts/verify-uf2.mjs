// Vérifie les parseurs d'artefacts : UF2 (synthétique + firmware réel si
// présent dans test-assets/) et ELF32 minimal.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-uf2-'));

async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { parseElf32 } = await load('src/shared/elf.ts', 'elf.mjs');

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
};

// --- UF2 synthétique ----------------------------------------------------------
function uf2Block(addr, payload, { notMainFlash = false } = {}) {
  const block = new Uint8Array(512);
  const view = new DataView(block.buffer);
  view.setUint32(0, 0x0a324655, true);
  view.setUint32(4, 0x9e5d5157, true);
  view.setUint32(8, notMainFlash ? 1 : 0x2000, true);
  view.setUint32(12, addr, true);
  view.setUint32(16, payload.length, true);
  view.setUint32(28, 0xe48bff56, true);
  block.set(payload, 32);
  view.setUint32(508, 0x0ab16f30, true);
  return block;
}

console.log('Parseur UF2 :');
{
  const p1 = Uint8Array.from({ length: 256 }, (_, i) => i & 0xff);
  const p2 = Uint8Array.from({ length: 256 }, (_, i) => (i + 7) & 0xff);
  const p3 = Uint8Array.from({ length: 128 }, () => 0xaa);
  const file = new Uint8Array(512 * 4);
  file.set(uf2Block(0x10000000, p1), 0);
  file.set(uf2Block(0x10000100, p2), 512);          // contigu au premier
  file.set(uf2Block(0x10008000, p3), 1024);          // segment séparé
  file.set(uf2Block(0x20000000, p3, { notMainFlash: true }), 1536); // ignoré

  const segs = parseUf2(file);
  check(`2 segments fusionnés (${segs.length})`, segs.length === 2);
  check('segment 1 : adresse 0x10000000, 512 octets', segs[0].addr === 0x10000000 && segs[0].data.length === 512);
  check('segment 1 : contenu des deux blocs', segs[0].data[0] === 0 && segs[0].data[256] === 7);
  check('segment 2 : adresse 0x10008000, 128 octets', segs[1].addr === 0x10008000 && segs[1].data.length === 128);

  let threw = false;
  try { parseUf2(new Uint8Array(1024)); } catch { threw = true; }
  check('fichier sans bloc valide rejeté', threw);
}

// --- UF2 réel (firmware MicroPython) -------------------------------------------
const fw = join(root, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (existsSync(fw)) {
  console.log('Firmware MicroPython réel :');
  const segs = parseUf2(new Uint8Array(readFileSync(fw)));
  const total = segs.reduce((n, s) => n + s.data.length, 0);
  check(`segments en flash (${segs.length}, ${total} octets)`, segs.length >= 1 && total > 200_000);
  check('premier segment à 0x10000000', segs[0].addr === 0x10000000);
}

// --- ELF32 minimal --------------------------------------------------------------
console.log('Parseur ELF32 :');
{
  // ELF avec un PT_LOAD de 16 octets chargé à 0x10000000.
  const data = new Uint8Array(0x100);
  const view = new DataView(data.buffer);
  data.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0]);
  view.setUint16(16, 2, true);          // e_type EXEC
  view.setUint16(18, 40, true);         // e_machine ARM
  view.setUint32(24, 0x10000001, true); // e_entry
  view.setUint32(28, 52, true);         // e_phoff
  view.setUint16(42, 32, true);         // e_phentsize
  view.setUint16(44, 1, true);          // e_phnum
  view.setUint32(52, 1, true);          // p_type PT_LOAD
  view.setUint32(56, 0x90, true);       // p_offset
  view.setUint32(60, 0x10000000, true); // p_vaddr
  view.setUint32(64, 0x10000000, true); // p_paddr
  view.setUint32(68, 16, true);         // p_filesz
  data.set(Uint8Array.from({ length: 16 }, (_, i) => i + 1), 0x90);

  const image = parseElf32(data);
  check('entry 0x10000001', image.entry === 0x10000001);
  check('1 segment PT_LOAD à 0x10000000', image.segments.length === 1 && image.segments[0].paddr === 0x10000000);
  check('contenu du segment', image.segments[0].data.length === 16 && image.segments[0].data[15] === 16);

  let threw = false;
  try { parseElf32(new Uint8Array(64)); } catch { threw = true; }
  check('fichier non-ELF rejeté', threw);
}

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
