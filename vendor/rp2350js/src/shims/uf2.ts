// Bouchon Kablix : voir ORIGINE.md. Kablix décode l'UF2 côté extension
// (src/firmware.ts) et pousse des FlashSegment — decodeBlock ne sert jamais.
export function decodeBlock(data: Uint8Array): { flashAddress: number; payload: Uint8Array } {
	throw new Error(`rp2350js vendorisé : decodeBlock inutilisé (${data.length} octets)`);
}
