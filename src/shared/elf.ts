// Parseur ELF32 minimal (petit-boutiste) : extrait les segments PT_LOAD d'un
// exécutable ARM (RP2040). Suffisant pour charger un .elf produit par
// arm-none-eabi-gcc ou par le pico-sdk sans dépendance externe.

export interface ElfSegment {
  /** Adresse physique de chargement (LMA). */
  paddr: number;
  data: Uint8Array;
}

export interface ElfImage {
  entry: number;
  segments: ElfSegment[];
}

const PT_LOAD = 1;

/** @throws si le fichier n'est pas un ELF32 little-endian valide. */
export function parseElf32(data: Uint8Array): ElfImage {
  if (data.length < 52 || data[0] !== 0x7f || data[1] !== 0x45 || data[2] !== 0x4c || data[3] !== 0x46) {
    throw new Error('Fichier ELF invalide (magic).');
  }
  if (data[4] !== 1 || data[5] !== 1) {
    throw new Error('Seuls les ELF 32 bits little-endian sont pris en charge.');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entry = view.getUint32(24, true);
  const phoff = view.getUint32(28, true);
  const phentsize = view.getUint16(42, true);
  const phnum = view.getUint16(44, true);

  const segments: ElfSegment[] = [];
  for (let i = 0; i < phnum; i++) {
    const base = phoff + i * phentsize;
    if (base + 32 > data.length) break;
    const type = view.getUint32(base, true);
    if (type !== PT_LOAD) continue;
    const offset = view.getUint32(base + 4, true);
    const paddr = view.getUint32(base + 12, true);
    const filesz = view.getUint32(base + 16, true);
    if (filesz === 0) continue;
    segments.push({ paddr, data: data.subarray(offset, offset + filesz) });
  }
  if (segments.length === 0) {
    throw new Error('ELF sans segment chargeable (PT_LOAD).');
  }
  return { entry, segments };
}
