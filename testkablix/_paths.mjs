// Où vivent les fichiers de test. Le dossier a été rangé en août 2026 : les
// sketchs Arduino sont passés sous `Arduino/`, les programmes MicroPython sont
// restés à la racine. Ce module est la SEULE chose à toucher si le rangement
// bouge encore — générateur, vérificateur et scripts `verify-*` passent tous
// par lui.
//
// Principe : la LECTURE ne suppose rien (on cherche le fichier là où il est,
// racine puis chaque banc), l'ÉCRITURE conserve l'emplacement existant et ne
// choisit un banc que pour un test entièrement nouveau.
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));

/** Sous-dossiers de rangement, dans l'ordre de recherche (racine d'abord). */
export const BANCS = ['Arduino', 'PicoPi'];

/** Banc d'accueil d'un test NOUVEAU, d'après son extension de code. */
export function bancOf(ext) {
  return ext === 'ino' ? 'Arduino' : '';
}

/**
 * Chemin absolu d'un fichier de testkablix/, cherché à la racine puis dans
 * chaque banc. Renvoie le chemin racine si rien n'existe — l'appelant obtient
 * alors une erreur « fichier absent » nommant l'emplacement attendu.
 */
export function tk(...parts) {
  const rel = join(...parts);
  const direct = join(HERE, rel);
  if (existsSync(direct)) return direct;
  for (const banc of BANCS) {
    const p = join(HERE, banc, rel);
    if (existsSync(p)) return p;
  }
  return direct;
}

/** Chemin relatif à testkablix/ d'un fichier de test (`Arduino/blink-uno`…). */
function relOf(test) {
  // Sketch Arduino : dossier du même nom que le .ino (exigence arduino-cli).
  return test.ext === 'ino' ? join(test.name, `${test.name}.${test.ext}`) : `${test.name}.${test.ext}`;
}

/** Chemin absolu du fichier de code d'un test (.ino ou .py), où qu'il soit rangé. */
export function testCode(test) {
  const found = tk(relOf(test));
  if (existsSync(found)) return found;
  // Test nouveau : il naît dans son banc.
  const banc = bancOf(test.ext);
  return banc ? join(HERE, banc, relOf(test)) : found;
}

/** Chemin absolu du .projix d'un test : toujours à côté de son code. */
export function testProjix(test) {
  return join(dirname(testCode(test)), `${test.name}.projix`);
}

/** Dossier d'accueil du test (à créer avant écriture). */
export function testDir(test) {
  return dirname(testCode(test));
}

/** Référence `codeFile` du manifeste : chemin réel, relatif à la racine du dépôt. */
export function testCodeRef(test) {
  return relative(join(HERE, '..'), testCode(test)).replace(/\\/g, '/');
}
