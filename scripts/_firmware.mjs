// Emplacement du firmware MicroPython des bancs.
//
// Chaque banc portait le nom du fichier en dur — `RPI_PICO-20230426-v1.20.0.uf2`.
// Ce nom contient la DATE de la version : le jour où le dossier est passé à la
// v1.28, onze bancs se sont mis à imprimer « SKIP » puis « RESULTAT: OK », et
// `verify:all` les comptait comme réussis. Un seul chercheur, par préfixe.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

/** Dossiers fouillés, dans l'ordre : le dépôt d'abord, le cache de VS Code ensuite. */
const DOSSIERS = [
  join(RACINE, 'test-assets'),
  join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
];

/**
 * Chemin du premier firmware trouvé pour ce préfixe, ou `undefined`.
 * Préfixes : `RPI_PICO-` (Pico), `RPI_PICO_W-` (Pico W), `RPI_PICO2-` (Pico 2).
 * Le tiret final compte : sans lui, `RPI_PICO` attraperait les trois.
 */
export function firmwarePico(prefixe = 'RPI_PICO-') {
  for (const dir of DOSSIERS) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((n) => n.startsWith(prefixe) && n.endsWith('.uf2'));
    if (hit) return join(dir, hit);
  }
  return undefined;
}

/** Message d'absence, pour que tous les bancs disent la même chose. */
export function firmwareAbsent(prefixe = 'RPI_PICO-') {
  return `firmware MicroPython introuvable (${prefixe}*.uf2 dans test-assets/ ou le cache de l'extension)`;
}
