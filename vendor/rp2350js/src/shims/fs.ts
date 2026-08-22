// Bouchon Kablix : voir ORIGINE.md. Le vendor ne lit jamais le disque —
// la webview n'en a pas, et les firmwares arrivent déjà décodés.
// Les deux surcharges reproduisent celles de node:fs (binaire sans encodage,
// texte avec) : sans elles, les appelants ne compilent pas.
export function readFileSync(chemin: string): Uint8Array;
export function readFileSync(chemin: string, encodage: string): string;
export function readFileSync(chemin: string, encodage?: string): Uint8Array | string {
	throw new Error(`rp2350js vendorisé : lecture disque interdite dans la webview (${chemin}, ${encodage ?? 'binaire'})`);
}
