// Fichiers web (HTML, CSS, JS, images…) que le programme MicroPython lit sur la
// carte : un serveur écrit `open("www/index.html")` ou `open("/style.css")`.
// Ni `collectPythonLibs` (qui ne connaît que les `.py` importés) ni la simulation
// ne les voyaient. Ils sont rassemblés ici, UNE fois, pour les deux usages :
// l'envoi sur la vraie carte (picoUploader.ts) et l'écriture dans le système de
// fichiers du Pico simulé (compiler.ts). Même liste, même arborescence : ce que
// le programme trouve en simulation est ce qu'il trouve sur le matériel.
//
// Deux sources, réunies :
//  1. **Les dossiers `www/` et `static/`** à côté du programme, en entier.
//  2. **Les fichiers nommés dans le code** : toute chaîne `"page.html"`,
//     `'/css/app.css'`… dont le fichier existe à côté du programme.
// Le chemin relatif au dossier du programme est conservé tel quel sur la carte.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** Un fichier web à poser sur la carte. */
export interface WebFile {
  /** Chemin absolu sur le disque. */
  file: string;
  /** Chemin sur la carte, relatif au dossier du programme (`www/css/app.css`). */
  rel: string;
  /** Taille en octets. */
  size: number;
}

/** Dossiers pris en entier. */
export const WEB_DIRS = ['www', 'static'];

/** Extensions reconnues dans une chaîne du code (le dossier, lui, prend tout). */
const WEB_EXT = 'html?|css|js|mjs|json|svg|png|jpe?g|gif|ico|webp|txt|xml|woff2?|map';

/** Une chaîne Python qui se termine par une extension web : `"x.html"`, `'/a/b.css'`. */
const LITERAL_RE = new RegExp(`(["'])([^"'\\r\\n\\\\]+?\\.(?:${WEB_EXT}))\\1`, 'gi');

/** Un fichier système ou de travail qui n'a rien à faire sur la carte. */
function isNoise(name: string): boolean {
  return name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini';
}

/**
 * Fichiers web du programme. `sources` = texte du programme principal et de ses
 * modules importés (là où se trouvent les noms de fichiers).
 */
export function collectWebFiles(scriptPath: string, sources: string[]): WebFile[] {
  const dir = dirname(scriptPath);
  const found = new Map<string, WebFile>(); // rel → fichier (dédoublonne les deux sources)

  const add = (full: string): void => {
    const rel = relative(dir, full).split(sep).join('/');
    if (found.has(rel)) return;
    try {
      found.set(rel, { file: full, rel, size: statSync(full).size });
    } catch {
      /* fichier disparu entre-temps : ignoré */
    }
  };

  // 1) Les dossiers dédiés, en entier et récursivement.
  const walk = (abs: string): void => {
    for (const name of readdirSync(abs).sort()) {
      if (isNoise(name)) continue;
      const full = join(abs, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) add(full);
    }
  };
  for (const name of WEB_DIRS) {
    const abs = join(dir, name);
    try {
      if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs);
    } catch {
      /* dossier illisible : on passe au suivant */
    }
  }

  // 2) Les fichiers nommés dans le code. Un `/` de tête désigne la racine de la
  //    carte, donc le dossier du programme ; `..` ne sort jamais de ce dossier.
  for (const src of sources) {
    for (const m of src.matchAll(LITERAL_RE)) {
      const name = m[2].replace(/^(?:\.?\/)+/, '');
      if (!name || /^[a-z]+:/i.test(name)) continue; // URL (http:, data:…), pas un fichier
      const full = resolve(dir, name);
      if (full !== dir && !full.startsWith(dir + sep)) continue;
      try {
        if (!isNoise(name.split('/').pop() ?? '') && statSync(full).isFile()) add(full);
      } catch {
        /* le fichier n'existe pas : simple chaîne de texte */
      }
    }
  }

  return [...found.values()].sort((a, b) => a.rel.localeCompare(b.rel));
}
