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

/**
 * Banc d'accueil d'un test NOUVEAU, d'après son extension de code. Les bancs
 * Pico 2 ont eu leur propre dossier le temps du lot qui les a créés : Frank les
 * a remis à la racine, à côté de leur aîné (v2026.8.102.15).
 */
export function bancOf(ext, _board) {
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

/**
 * Chemin absolu du fichier de code que le test PORTE (celui qui vit dans son
 * dossier). C'est lui qui fixe l'emplacement du test — même quand le programme
 * exécuté est celui d'un autre test (`codeFrom`).
 */
function ownCode(test) {
  const found = tk(relOf(test));
  if (existsSync(found)) return found;
  // Test nouveau : il naît dans son banc.
  const banc = bancOf(test.ext, test.board);
  return banc ? join(HERE, banc, relOf(test)) : found;
}

/**
 * Chemin absolu du programme d'un test (.ino ou .py), où qu'il soit rangé.
 * `codeFrom` = le test rejoue le programme d'un autre (les bancs Pico 2 rejouent
 * ceux de leur aîné Pico) : c'est le MÊME fichier, pas une copie — une copie
 * finirait par diverger au premier correctif apporté à l'un des deux.
 */
export function testCode(test) {
  return ownCode(test.codeFrom ? { ...test, name: test.codeFrom, codeFrom: undefined } : test);
}

/** Chemin absolu du .projix d'un test : dans SON dossier. */
export function testProjix(test) {
  return join(dirname(ownCode(test)), `${test.name}.projix`);
}

/** Dossier d'accueil du test (à créer avant écriture). */
export function testDir(test) {
  return dirname(ownCode(test));
}

/** Référence `codeFile` du manifeste : chemin réel, relatif à la racine du dépôt. */
export function testCodeRef(test) {
  return relative(join(HERE, '..'), testCode(test)).replace(/\\/g, '/');
}
