// Parseur UF2 (https://github.com/microsoft/uf2) : découpe un fichier .uf2 en
// segments mémoire contigus. Utilisé pour programmer la flash du RP2040 simulé.

export const UF2_MAGIC_START0 = 0x0a324655; // "UF2\n"
export const UF2_MAGIC_START1 = 0x9e5d5157;
export const UF2_MAGIC_END = 0x0ab16f30;
export const UF2_FLAG_NOT_MAIN_FLASH = 0x00000001;
export const UF2_FLAG_FAMILY_ID = 0x00002000;
export const RP2040_FAMILY_ID = 0xe48bff56;

export interface Uf2Segment {
  /** Adresse cible absolue du premier octet. */
  addr: number;
  data: Uint8Array;
}

interface Block {
  addr: number;
  data: Uint8Array;
}

/**
 * Analyse un fichier UF2 complet. Les blocs invalides ou marqués
 * NOT_MAIN_FLASH sont ignorés ; les blocs contigus sont fusionnés en segments.
 * @throws si aucun bloc UF2 valide n'est trouvé.
 */
export function parseUf2(data: Uint8Array): Uf2Segment[] {
  const blocks: Block[] = [];
  for (let off = 0; off + 512 <= data.length; off += 512) {
    const view = new DataView(data.buffer, data.byteOffset + off, 512);
    if (
      view.getUint32(0, true) !== UF2_MAGIC_START0 ||
      view.getUint32(4, true) !== UF2_MAGIC_START1 ||
      view.getUint32(508, true) !== UF2_MAGIC_END
    ) {
      continue;
    }
    const flags = view.getUint32(8, true);
    if (flags & UF2_FLAG_NOT_MAIN_FLASH) continue;
    const addr = view.getUint32(12, true);
    const size = view.getUint32(16, true);
    if (size > 476) continue;
    blocks.push({ addr, data: data.subarray(off + 32, off + 32 + size) });
  }
  if (blocks.length === 0) {
    throw new Error('Fichier UF2 invalide : aucun bloc reconnu.');
  }

  blocks.sort((a, b) => a.addr - b.addr);

  // Fusion des blocs contigus en segments.
  const segments: Uf2Segment[] = [];
  let runStart = 0;
  const flush = (endExclusive: number): void => {
    const run = blocks.slice(runStart, endExclusive);
    const total = run.reduce((n, b) => n + b.data.length, 0);
    const merged = new Uint8Array(total);
    let pos = 0;
    for (const b of run) {
      merged.set(b.data, pos);
      pos += b.data.length;
    }
    segments.push({ addr: run[0].addr, data: merged });
  };
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    if (prev.addr + prev.data.length !== blocks[i].addr) {
      flush(i);
      runStart = i;
    }
  }
  flush(blocks.length);
  return segments;
}
