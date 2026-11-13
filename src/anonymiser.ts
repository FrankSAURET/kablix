// Anonymisation des pièces d'un rapport « Signaler un problème ».
//
// Module PUR (aucun import de `vscode`) : le banc verify:signaler le bundle et
// le fait tourner sous node. Les marqueurs de remplacement sont NEUTRES
// (`<utilisateur>`, `<machine>`…) : le rôle de la personne est lui-même une
// information, il ne doit pas apparaître (consigne de Frank, 13/11/2026).
//
// Deux filets superposés :
//  1. les IDENTIFIANTS CONNUS de ce poste (compte Windows, nom de la machine,
//     domaine, nom git, dossiers du projet ouvert…), remplacés partout, même au
//     milieu d'un chemin qui contient des espaces ;
//  2. des MOTIFS génériques : dossier sous `Users`/`home`, mails, adresses IP
//     et MAC, dossiers personnels (Documents, Bureau…) dans un chemin.

/** Un identifiant sensible et son marqueur. */
export interface Secret {
  valeur: string;
  marqueur: string;
}

/** Dossiers techniques gardés tels quels quand ils apparaissent dans un chemin
 *  de projet : ils servent au diagnostic et ne désignent personne. */
const DOSSIERS_TECHNIQUES = new Set(
  [
    'users', 'home', 'documents', 'desktop', 'bureau', 'downloads', 'téléchargements',
    'telechargements', 'onedrive', 'appdata', 'local', 'roaming', 'temp', 'tmp',
    'program files', 'program files (x86)', 'programdata', 'windows', 'code', 'vscode',
    '.vscode', 'extensions', 'arduino', 'arduino15', 'libraries', 'src', 'lib', 'build',
    'projets', 'projects', 'public', 'microsoft vs code', 'logs', 'python',
  ]
);

/** Dossiers personnels après lesquels tout sous-dossier est réputé nominatif. */
const RACINES_PERSONNELLES =
  'Documents|Desktop|Bureau|Downloads|T[ée]l[ée]chargements|Pictures|Images|Music|Musique|Videos|Vid[ée]os|<dossier>';

function echapperRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Découpe un chemin en dossiers « nominatifs » : ceux qui ne sont ni
 * techniques, ni une lettre de lecteur. Le dernier élément (nom de fichier)
 * donne aussi son nom sans extension.
 */
export function segmentsNominatifs(chemin: string): string[] {
  const morceaux = chemin.split(/[\\/]+/).filter(Boolean);
  const sortie: string[] = [];
  morceaux.forEach((m, i) => {
    if (/^[a-z]:$/i.test(m)) return;
    const nom = i === morceaux.length - 1 ? m.replace(/\.[^.]+$/, '') : m;
    if (nom.length < 3) return;
    if (DOSSIERS_TECHNIQUES.has(nom.toLowerCase())) return;
    sortie.push(nom);
  });
  return sortie;
}

/**
 * Prépare la liste des secrets : sans doublon, sans valeur trop courte (une
 * valeur de deux lettres raserait la moitié du texte), la plus longue d'abord
 * pour qu'un nom complet passe avant ses morceaux.
 */
export function preparerSecrets(secrets: Secret[]): Secret[] {
  const vus = new Map<string, Secret>();
  for (const s of secrets) {
    const v = s.valeur.trim();
    if (v.length < 3) continue;
    const cle = v.toLowerCase();
    if (!vus.has(cle)) vus.set(cle, { valeur: v, marqueur: s.marqueur });
  }
  return [...vus.values()].sort((a, b) => b.valeur.length - a.valeur.length);
}

/** Remplace une valeur partout, insensible à la casse, sous ses formes brute et
 *  encodée en URI (`%20` dans les `file:///`). */
function remplacerPartout(texte: string, valeur: string, marqueur: string): string {
  const formes = new Set([valeur, encodeURIComponent(valeur), valeur.replace(/ /g, '%20')]);
  for (const f of formes) {
    // Bornes : rien de collé à gauche ; à droite, un mot qui continue en
    // minuscules est un AUTRE mot (« Frankenstein » n'est pas « Frank »), mais
    // une suite en majuscule, chiffre ou « _ » est le même identifiant
    // (« FrankSAURET », « frank4466 ») : avalé en entier.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${echapperRegex(f)}([\\p{L}\\p{N}_]*)`, 'giu');
    texte = texte.replace(re, (tout, suite: string) =>
      !suite || /^[\p{Lu}\p{N}_]/u.test(suite) ? marqueur : tout
    );
  }
  return texte;
}

/** Adresses IPv4 non identifiantes (boucle locale, joker) : gardées. */
function ipv4Banale(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '0.0.0.0' || ip === '255.255.255.255';
}

/** Anonymise un texte (journal, programme, schéma). */
export function anonymiserTexte(texte: string, secrets: Secret[]): string {
  let t = texte;

  // 1. Identifiants connus du poste.
  for (const s of secrets) t = remplacerPartout(t, s.valeur, s.marqueur);

  // 2a. Compte dans un chemin : C:\Users\x, /home/x, /Users/x, file:///c%3A/Users/x.
  t = t.replace(/((?:^|[\\/])(?:Users|home)[\\/]+)(?!<)[^\\/\r\n"'<>|:*?]+/gim, '$1<utilisateur>');
  // 2b. Dossier OneDrive d'une organisation : « OneDrive - Nom de l'établissement ».
  t = t.replace(/OneDrive\s*-\s*[^\\/\r\n"'<>|:*?]+/gi, 'OneDrive - <organisation>');
  // 2c. Sous-dossiers des dossiers personnels (Documents\Mon projet\…) : tout
  //     dossier INTERMÉDIAIRE devient <dossier> ; répété jusqu'à stabilité.
  const sousDossier = new RegExp(
    `((?:^|[\\\\/])(?:${RACINES_PERSONNELLES})[\\\\/]+)(?!<)[^\\\\/\\r\\n"'<>|:*?]+(?=[\\\\/])`,
    'gim'
  );
  for (let i = 0; i < 20; i++) {
    const avant = t;
    t = t.replace(sousDossier, '$1<dossier>');
    if (t === avant) break;
  }
  // 2d. Comptes en ligne : propriétaire d'un dépôt sur une forge
  //     (github.com/Nom/…, git@gitlab.com:Nom/…), compte connecté
  //     (« Logged in as Nom »). Avant les mails : « git@gitlab.com » en est un.
  t = t.replace(/\b(github\.com|gitlab\.com|bitbucket\.org)([/:])(?!<)[A-Za-z0-9_.-]{1,100}/gi, '$1$2<compte>');
  t = t.replace(/\b((?:logged|signed) in as|connecté en tant que)\s+["']?(?!<)[^\s"',;)]{1,100}/gi, '$1 <compte>');
  //     Organisation Microsoft (identifiant d'établissement) dans les adresses
  //     de connexion.
  t = t.replace(/\b(login\.microsoftonline\.com|sts\.windows\.net|login\.windows\.net)\/(?!<)[0-9a-z.-]{3,100}/gi, '$1/<organisation>');
  // 2d bis. Mails.
  //     Départ en début de mot et longueur bornée : sans ça, une longue suite
  //     de lettres sans « @ » (journal tronqué) coûte un temps quadratique.
  t = t.replace(/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g, '<mail>');
  // 2e. Adresses MAC (avant l'IPv6, qui leur ressemble).
  t = t.replace(/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, '<mac>');
  // 2f. IPv4 (chaque octet ≤ 255 : « 2026.11.2.311 » n'en est pas une).
  t = t.replace(
    /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g,
    (ip) => (ipv4Banale(ip) ? ip : '<ip>')
  );
  // 2g. IPv6 : forme complète (8 groupes) ou compressée avec « :: » et au moins
  //     un groupe de 3 chiffres hexa — une heure « 12:34:56 » ne doit pas y passer.
  t = t.replace(/\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi, '<ip>');
  t = t.replace(
    /(?<![\w:])(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4}(?![\w:])/gi,
    (ip) => (/[0-9a-f]{3}/i.test(ip) ? '<ip>' : ip)
  );

  return t;
}
