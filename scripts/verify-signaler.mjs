// Banc de « Kablix : Signaler un problème » (v2026.11.2.312).
//
// Fait tourner pour de vrai, sous node, l'anonymisation (src/anonymiser.ts) et
// la fabrication du rapport (src/rapport.ts) : faux dossier de journaux VS Code
// à trois sessions, faux .projix, puis relecture du zip produit. Ce qui compte :
// plus AUCUNE trace des identifiants du poste, et les marqueurs restent neutres
// (ni « élève » ni « prof »).
//
// Utilisation : npm run verify:signaler
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, 'node_modules', '.cache-verify-signaler');

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
await build({
  entryPoints: [join(ROOT, 'src', 'rapport.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['jszip'],
  outfile: join(WORK, 'rapport.mjs'),
  logLevel: 'silent',
});
await build({
  entryPoints: [join(ROOT, 'src', 'anonymiser.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(WORK, 'anonymiser.mjs'),
  logLevel: 'silent',
});
const A = await import(pathToFileURL(join(WORK, 'anonymiser.mjs')).href);
const R = await import(pathToFileURL(join(WORK, 'rapport.mjs')).href);

// Identifiants fictifs du poste.
const COMPTE = 'jdupont';
const MACHINE = 'PC-SALLE12-07';
const NOM = 'Jeanne Dupont';
const secrets = A.preparerSecrets([
  { valeur: COMPTE, marqueur: '<utilisateur>' },
  { valeur: MACHINE, marqueur: '<machine>' },
  { valeur: NOM, marqueur: '<utilisateur>' },
  ...NOM.split(' ').map((v) => ({ valeur: v, marqueur: '<utilisateur>' })),
  ...A.segmentsNominatifs('C:\\Users\\jdupont\\Documents\\TP Moteur Pont\\pont.projix').map((v) => ({ valeur: v, marqueur: '<dossier>' })),
  { valeur: 'ab', marqueur: '<x>' },
]);
const anon = (t) => A.anonymiserTexte(t, secrets);
const INTERDITS = [COMPTE, MACHINE, 'Jeanne', 'Dupont', 'TP Moteur Pont', 'pont'];
const propre = (t, ou) => {
  for (const x of INTERDITS) {
    assert(!new RegExp(x, 'i').test(t), `${ou} : « ${x} » subsiste → ${t.slice(0, 200)}`);
  }
};

console.log('Anonymisation');
await check('secrets : valeur courte écartée, la plus longue d’abord', () => {
  assert(!secrets.some((s) => s.valeur === 'ab'), 'valeur de 2 lettres gardée');
  assert(secrets[0].valeur.length >= secrets[secrets.length - 1].valeur.length, 'ordre');
  assert(!A.segmentsNominatifs('C:\\Users\\x\\Documents\\a.ino').includes('Documents'), 'Documents jugé nominatif');
});
await check('compte Windows dans un chemin', () => {
  const t = anon('Loading C:\\Users\\jdupont\\AppData\\Roaming\\Code\\x.log');
  assert(t.includes('C:\\Users\\<utilisateur>\\AppData\\Roaming\\Code'), t);
});
await check('compte inconnu sous Users/home, même sans secret', () => {
  const t = A.anonymiserTexte('C:\\Users\\mmartin\\a  /home/bob/x  /Users/alice/y', []);
  assert(!/mmartin|bob|alice/.test(t), t);
});
await check('URI encodée file:///c%3A/Users/…', () => {
  const t = anon('file:///c%3A/Users/jdupont/Documents/TP%20Moteur%20Pont/pont.ino');
  propre(t, 'URI');
});
await check('dossier du projet avec espaces + nom du fichier', () => {
  const t = anon('Opened C:\\Users\\jdupont\\Documents\\TP Moteur Pont\\pont.projix');
  propre(t, 'chemin');
  assert(t.endsWith('.projix'), t);
});
await check('sous-dossiers des dossiers personnels sans secret', () => {
  const t = A.anonymiserTexte('D:\\Documents\\Classe Martin\\Groupe 3\\essai.ino', []);
  assert(!/Martin|Groupe 3/.test(t), t);
  assert(t.includes('Documents\\<dossier>\\<dossier>\\essai.ino'), t);
});
await check('OneDrive d’organisation', () => {
  const t = A.anonymiserTexte('C:\\x\\OneDrive - Lycée Jean Moulin\\a.ino', []);
  assert(!/Moulin/.test(t), t);
});
await check('nom de la personne et de la machine dans le texte', () => {
  const t = anon(`git: author Jeanne Dupont on ${MACHINE}`);
  propre(t, 'texte');
});
await check('bornes : « Frankenstein » intact quand « Frank » est secret', () => {
  const s = A.preparerSecrets([{ valeur: 'Frank', marqueur: '<utilisateur>' }]);
  assert(A.anonymiserTexte('Frankenstein Frank', s) === 'Frankenstein <utilisateur>', A.anonymiserTexte('Frankenstein Frank', s));
});
await check('identifiant collé : « JeanneDUPONT », « jdupont42 » avalés en entier', () => {
  const t = anon('Logged JeanneDUPONT x jdupont42 y jdupont_b');
  assert(!/DUPONT|42|_b/.test(t), t);
});
await check('comptes en ligne : forge et « logged in as »', () => {
  const t = A.anonymiserTexte('remote https://github.com/MMartin/robot.git ; git@gitlab.com:mmartin/x ; [info] Logged in as MMartin2', []);
  assert(!/martin/i.test(t), t);
  assert(t.includes('github.com/<compte>/robot.git'), t);
});
await check('organisation Microsoft (tenant) effacée', () => {
  const t = A.anonymiserTexte('https://login.microsoftonline.com/1b2c3d4e-6c67-4c5b-b112-0a1b2c3d4e5f/v2.0 https://sts.windows.net/lycee.onmicrosoft.com/', []);
  assert(!/1b2c3d4e|lycee/.test(t), t);
});
await check('mails, MAC, IPv4, IPv6', () => {
  const t = A.anonymiserTexte('a jeanne.d@lycee.fr b 3c:22:fb:01:aa:9e c 192.168.1.20 d fe80::1a2b:3c4d:5e6f e 2001:0db8:0000:0000:0000:ff00:0042:8329', []);
  assert(!/lycee|3c:22|192\.168|fe80|2001/.test(t), t);
});
await check('pas de faux positifs : versions, boucle locale, heures', () => {
  const s = 'Kablix 2026.11.2.311 127.0.0.1 0.0.0.0 12:34:56.789 std::vector v1.29.0';
  assert(A.anonymiserTexte(s, []) === s, A.anonymiserTexte(s, []));
});
await check('temps linéaire : 1 Mo de lettres et de chiffres hexa en moins de 2 s', () => {
  for (const motif of ['A', 'a1', 'ab:', 'x.', '\\a']) {
    const debut = Date.now();
    anon(motif.repeat(Math.ceil(1_000_000 / motif.length)));
    const ms = Date.now() - debut;
    assert(ms < 2000, `motif « ${motif} » : ${ms} ms`);
  }
});
await check('marqueurs neutres : ni « élève » ni « prof »', () => {
  const src = readFileSync(join(ROOT, 'src', 'anonymiser.ts'), 'utf8') + readFileSync(join(ROOT, 'src', 'signaler.ts'), 'utf8');
  const marqueurs = src.match(/'<[a-z-]+>'/g) ?? [];
  assert(marqueurs.length > 3, 'marqueurs introuvables');
  assert(!marqueurs.some((m) => /[ée]l[èe]ve|prof/i.test(m)), marqueurs.join(' '));
});

console.log('Journaux');
const LOGS = join(WORK, 'logs');
for (const [s, contenu] of [
  ['20261110T080000', 'vieille session'],
  ['20261112T080000', 'session précédente C:\\Users\\jdupont'],
  ['20261113T090000', 'session courante ' + MACHINE],
]) {
  mkdirSync(join(LOGS, s, 'window1', 'exthost', 'electropol-fr.kablix'), { recursive: true });
  writeFileSync(join(LOGS, s, 'main.log'), contenu);
  writeFileSync(join(LOGS, s, 'window1', 'exthost', 'exthost.log'), contenu + '\n'.repeat(3));
  writeFileSync(join(LOGS, s, 'window1', 'vide.log'), '');
  writeFileSync(join(LOGS, s, 'window1', 'image.bin'), 'x');
}
// Sessions vides (un `code` lancé en ligne de commande) : à sauter.
mkdirSync(join(LOGS, '20261112T120000', 'window1'), { recursive: true });
writeFileSync(join(LOGS, '20261112T120000', 'window1', 'vide.log'), '');
mkdirSync(join(LOGS, '20261113T085900'), { recursive: true });
writeFileSync(join(LOGS, '20261113T090000', 'gros.log'), 'A'.repeat(R.MAX_PAR_JOURNAL + 5000) + 'FIN');
const logUri = join(LOGS, '20261113T090000', 'window1', 'exthost', 'electropol-fr.kablix');
const sessions = R.sessionsAJoindre(logUri);
const journaux = R.lireJournaux(sessions);

await check('sessions : la courante et la précédente seulement', () => {
  const noms = sessions.map((p) => p.split(/[\\/]/).pop());
  assert(JSON.stringify(noms) === '["20261112T080000","20261113T090000"]', JSON.stringify(noms));
  assert(R.sessionsAJoindre(join(WORK, 'ailleurs')).length === 0, 'hors dossier de journaux');
});
await check('seuls les .log non vides, fin gardée pour les gros', () => {
  const rel = journaux.map((j) => j.relatif);
  assert(rel.length === 5, rel.join(', '));
  assert(!rel.some((r) => /vide|image|20261110/.test(r)), rel.join(', '));
  const gros = journaux.find((j) => j.relatif.endsWith('gros.log'));
  assert(gros.contenu.endsWith('FIN') && gros.contenu.startsWith('[… début tronqué …]'), 'troncature');
});

console.log('Rapport');
const projSrc = new JSZip();
projSrc.file('kablix.json', JSON.stringify({ codeRef: 'C:\\Users\\jdupont\\Documents\\TP Moteur Pont\\pont.ino' }));
projSrc.file('diagram.json', '{"parts":[]}');
projSrc.file('code/pont.ino', '// Jeanne Dupont\nvoid setup(){}');
projSrc.file('code/image.png', new Uint8Array([137, 80, 78, 71]));
const projix = await R.anonymiserProjix(JSZip, await projSrc.generateAsync({ type: 'uint8array' }), secrets);
const zipOctets = await R.construireRapport(JSZip, {
  fiche: `Kablix\nDescription :\nça plante sur ${MACHINE}`,
  journaux,
  projix,
  programme: { extension: '.ino', texte: '// par Jeanne Dupont\n// C:\\Users\\jdupont\\x' },
  secrets,
});
const zip = await JSZip.loadAsync(zipOctets);
const noms = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

await check('contenu attendu, noms de fichiers sans < >', () => {
  for (const n of ['rapport.txt', 'projet/projet.projix', 'projet/programme.ino']) assert(noms.includes(n), `${n} absent : ${noms.join(', ')}`);
  assert(noms.filter((n) => n.startsWith('journaux/')).length === 5, noms.join(', '));
  assert(!noms.some((n) => /[<>]/.test(n)), noms.join(', '));
});
await check('aucun identifiant dans le zip (textes)', async () => {
  for (const n of noms.filter((n) => !n.endsWith('.projix'))) propre(await zip.file(n).async('string'), n);
});
await check('aucun identifiant dans le .projix (contenus ET noms)', async () => {
  const p = await JSZip.loadAsync(await zip.file('projet/projet.projix').async('uint8array'));
  for (const n of Object.keys(p.files)) {
    propre(n, 'nom dans le projix');
    if (p.files[n].dir) continue;
    if (!n.endsWith('.png')) propre(await p.file(n).async('string'), n);
  }
  const png = await p.file(Object.keys(p.files).find((n) => n.endsWith('.png'))).async('uint8array');
  assert(png[0] === 137 && png.length === 4, 'binaire altéré');
});

rmSync(WORK, { recursive: true, force: true });
console.log(`\n${failed === 0 ? '✅' : '❌'} verify:signaler — ${passed} réussis, ${failed} échoués`);
process.exit(failed === 0 ? 0 : 1);
