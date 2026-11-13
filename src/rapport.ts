// Fabrication du rapport « Signaler un problème » : journaux de VS Code,
// projet .projix et programme, tous ANONYMISÉS, rangés dans un zip.
//
// Module sans `vscode` : le banc verify:signaler le fait tourner sous node sur
// un faux dossier de journaux. JSZip est passé en paramètre (côté extension il
// se charge à la demande, cf. src/zip.ts).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import type JSZipType from 'jszip';
import { anonymiserTexte, type Secret } from './anonymiser';

type JSZipCtor = typeof JSZipType;

/** Plafond par journal : on garde la FIN (le problème vient d'arriver). */
export const MAX_PAR_JOURNAL = 1024 * 1024;
/** Plafond de l'ensemble des journaux, avant compression. */
export const MAX_JOURNAUX = 12 * 1024 * 1024;

/** Un dossier de session VS Code s'appelle `20261113T090512`. */
const SESSION = /^\d{8}T\d{6}$/;

/**
 * Dossiers de session à joindre : celle en cours et la précédente (le problème
 * a souvent provoqué un redémarrage). `logPath` est n'importe quel chemin situé
 * DANS la session courante (le `logUri` de l'extension).
 */
export function sessionsAJoindre(logPath: string): string[] {
  let d = logPath;
  while (d && !SESSION.test(basename(d))) {
    const parent = dirname(d);
    if (parent === d) return [];
    d = parent;
  }
  if (!d) return [];
  const racine = dirname(d);
  let toutes: string[];
  try {
    toutes = readdirSync(racine).filter((n) => SESSION.test(n)).sort();
  } catch {
    return [d];
  }
  // Précédente = la dernière qui contient au moins un journal : chaque `code`
  // lancé en ligne de commande ouvre un dossier de session, souvent vide.
  const i = toutes.indexOf(basename(d));
  for (let j = i - 1; j >= 0; j--) {
    const p = join(racine, toutes[j]);
    if (contientUnJournal(p)) return [p, d];
  }
  return [d];
}

/** Vrai si le dossier contient (à n'importe quelle profondeur) un `.log` non vide. */
function contientUnJournal(d: string): boolean {
  let noms: string[];
  try {
    noms = readdirSync(d);
  } catch {
    return false;
  }
  for (const n of noms) {
    const p = join(d, n);
    try {
      const st = statSync(p);
      if (st.isDirectory() ? contientUnJournal(p) : /\.log$/i.test(n) && st.size > 0) return true;
    } catch {
      /* entrée disparue */
    }
  }
  return false;
}

/** Journal lu, déjà tronqué. `relatif` : chemin dans le zip. */
export interface Journal {
  relatif: string;
  contenu: string;
}

/** Lit les `.log` des sessions, la plus récente d'abord pour le budget. */
export function lireJournaux(sessions: string[]): Journal[] {
  const sortie: Journal[] = [];
  let budget = MAX_JOURNAUX;
  for (const session of [...sessions].reverse()) {
    const racine = dirname(session);
    const fichiers: string[] = [];
    const parcourir = (d: string): void => {
      let noms: string[];
      try {
        noms = readdirSync(d);
      } catch {
        return;
      }
      for (const n of noms) {
        const p = join(d, n);
        let st;
        try {
          st = statSync(p);
        } catch {
          continue;
        }
        if (st.isDirectory()) parcourir(p);
        else if (/\.log$/i.test(n) && st.size > 0) fichiers.push(p);
      }
    };
    parcourir(session);
    for (const f of fichiers) {
      if (budget <= 0) break;
      let texte: string;
      try {
        texte = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      const max = Math.min(MAX_PAR_JOURNAL, budget);
      if (texte.length > max) texte = '[… début tronqué …]\n' + texte.slice(texte.length - max);
      budget -= texte.length;
      sortie.push({ relatif: relative(racine, f).replace(/\\/g, '/'), contenu: texte });
    }
  }
  return sortie;
}

/** Chemin dans un zip, anonymisé : `<` et `>` des marqueurs sont interdits
 *  dans un nom de fichier Windows, d'où `_utilisateur_`. */
export function nomDeFichier(chemin: string, secrets: Secret[]): string {
  return anonymiserTexte(chemin, secrets).replace(/[<>]/g, '_');
}

/** Fichiers texte d'un .projix, à passer à l'anonymisation. */
const TEXTE = /\.(json|ino|pde|py|c|cpp|h|hpp|txt|md|csv|yaml|yml)$/i;

/**
 * Anonymise un .projix : chaque fichier texte (schéma, manifeste, code) est
 * réécrit, les noms de fichiers du dossier `code/` aussi. Les fichiers binaires
 * passent tels quels.
 */
export async function anonymiserProjix(
  JSZip: JSZipCtor,
  octets: Uint8Array,
  secrets: Secret[]
): Promise<Uint8Array> {
  const source = await JSZip.loadAsync(octets);
  const cible = new JSZip();
  for (const [chemin, entree] of Object.entries(source.files)) {
    if (entree.dir) continue;
    const nom = nomDeFichier(chemin, secrets);
    if (TEXTE.test(chemin)) cible.file(nom, anonymiserTexte(await entree.async('string'), secrets));
    else cible.file(nom, await entree.async('uint8array'));
  }
  return cible.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Contenu du rapport. */
export interface Contenu {
  /** Fiche lisible : description, versions, système. Anonymisée ici aussi. */
  fiche: string;
  journaux: Journal[];
  /** .projix DÉJÀ anonymisé. */
  projix?: Uint8Array;
  programme?: { extension: string; texte: string };
  secrets: Secret[];
}

/** Assemble le zip du rapport. Noms de fichiers neutres : rien de nominatif. */
export async function construireRapport(JSZip: JSZipCtor, c: Contenu): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('rapport.txt', anonymiserTexte(c.fiche, c.secrets));
  for (const j of c.journaux) {
    zip.file(`journaux/${nomDeFichier(j.relatif, c.secrets)}`, anonymiserTexte(j.contenu, c.secrets));
  }
  if (c.projix) zip.file('projet/projet.projix', c.projix);
  if (c.programme) {
    zip.file(`projet/programme${c.programme.extension}`, anonymiserTexte(c.programme.texte, c.secrets));
  }
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}
