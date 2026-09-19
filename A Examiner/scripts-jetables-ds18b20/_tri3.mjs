// Bilan chiffre des degats sur testkablix : qu'a-t-on perdu, fichier par fichier ?
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const root = 'c:/- VS Code/Extensions/Kablix';
const liste = execSync('git diff --name-only -- testkablix/', { cwd: root, encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);

const estZip = (b) => b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b;
const dec = (b) => {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  return b.toString('utf8');
};
const lire = async (buf) => {
  const z = await JSZip.loadAsync(buf);
  const o = {};
  for (const n of Object.keys(z.files)) if (!z.files[n].dir) o[n] = await z.files[n].async('string');
  return o;
};

const R = { customPartsVides: [], deplaces: [], cameraPerdue: [], autres: [], textes: [], intacts: [], erreurs: [] };

for (const p of liste) {
  let hb, nb;
  try {
    hb = execSync(`git show HEAD:"${p}"`, { cwd: root, encoding: 'buffer', maxBuffer: 64e6 });
    nb = readFileSync(`${root}/${p}`);
  } catch (e) { R.erreurs.push([p, e.message]); continue; }

  if (!estZip(hb) || !estZip(nb)) {
    const a = dec(hb).replace(/\r\n/g, '\n').trim(), b = dec(nb).replace(/\r\n/g, '\n').trim();
    if (a === b) R.intacts.push(p);
    else R.textes.push({ p, da: a.length, db: b.length });
    continue;
  }
  try {
    const ch = await lire(hb), cn = await lire(nb);
    const da = JSON.parse(ch['diagram.json'] ?? '{}'), db = JSON.parse(cn['diagram.json'] ?? '{}');
    const nCpA = (da.customParts ?? []).length, nCpB = (db.customParts ?? []).length;
    if (nCpA > 0 && nCpB === 0) R.customPartsVides.push({ p, n: nCpA });
    if (da.camera && !db.camera) R.cameraPerdue.push(p);
    const bouge = [];
    for (const x of da.parts ?? []) {
      const y = (db.parts ?? []).find((q) => q.id === x.id);
      if (y && (Math.abs((x.x ?? 0) - (y.x ?? 0)) > 0.5 || Math.abs((x.y ?? 0) - (y.y ?? 0)) > 0.5)) bouge.push(x.id);
    }
    if (bouge.length) R.deplaces.push({ p, n: bouge.length, tot: (da.parts ?? []).length });
    const idA = (da.parts ?? []).map((x) => x.id), idB = (db.parts ?? []).map((x) => x.id);
    const perdus = idA.filter((i) => !idB.includes(i));
    if (perdus.length) R.autres.push({ p, quoi: `composants perdus : ${perdus.join(', ')}` });
    if (!nCpA && !bouge.length && !perdus.length && !(da.camera && !db.camera)) R.intacts.push(p);
  } catch (e) { R.erreurs.push([p, e.message]); }
}

console.log(`=== BILAN sur ${liste.length} fichiers modifies ===\n`);
console.log(`customParts VIDES     : ${R.customPartsVides.length} fichiers`);
for (const x of R.customPartsVides) console.log(`    ${x.p}  (${x.n} composants perso perdus)`);
console.log(`\ncamera perdue         : ${R.cameraPerdue.length} fichiers`);
console.log(`composants DEPLACES   : ${R.deplaces.length} fichiers`);
console.log(`composants DISPARUS   : ${R.autres.length} fichiers`);
for (const x of R.autres) console.log(`    ${x.p} : ${x.quoi}`);
console.log(`\nfichiers texte changes: ${R.textes.length}`);
for (const x of R.textes) console.log(`    ${x.p}  ${x.da} -> ${x.db} car.`);
console.log(`\nsans perte detectee   : ${R.intacts.length}`);
if (R.erreurs.length) { console.log(`\nerreurs : ${R.erreurs.length}`); for (const [p, m] of R.erreurs) console.log(`    ${p} : ${m}`); }

writeFileSync(`${root}/_tri-resultat.json`, JSON.stringify(R, null, 2));
console.log('\n(detail complet dans _tri-resultat.json)');
