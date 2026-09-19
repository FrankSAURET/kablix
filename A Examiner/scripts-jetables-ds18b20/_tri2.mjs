// VRAI tri des fichiers testkablix modifies.
// Les .projix sont des ZIP : on compare leur CONTENU decompresse (diagram.json,
// kablix.json...), pas les octets de l'archive (qui changent a chaque ecriture
// ne serait-ce que par l'horodatage).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const root = 'c:/- VS Code/Extensions/Kablix';
const liste = execSync('git diff --name-only -- testkablix/', { cwd: root, encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);

const dec = (b) => {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  return b.toString('utf8');
};
const estZip = (b) => b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b;

/** Contenu d'un .projix : { nom de l'entree -> texte }, trie. */
async function contenuZip(buf) {
  const z = await JSZip.loadAsync(buf);
  const out = {};
  for (const nom of Object.keys(z.files)) {
    const f = z.files[nom];
    if (f.dir) continue;
    out[nom] = await f.async('string');
  }
  return out;
}
/** Compare deux JSON sans tenir compte de l'ordre des cles. */
const stable = (v) => Array.isArray(v) ? v.map(stable)
  : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = stable(v[k]), o), {}) : v;
function memeTexte(a, b) {
  const na = a.replace(/\r\n/g, '\n').trim(), nb = b.replace(/\r\n/g, '\n').trim();
  if (na === nb) return true;
  try { return JSON.stringify(stable(JSON.parse(na))) === JSON.stringify(stable(JSON.parse(nb))); }
  catch { return false; }
}

const identiques = [], reels = [], erreurs = [];
for (const p of liste) {
  let hb, nb;
  try {
    hb = execSync(`git show HEAD:"${p}"`, { cwd: root, encoding: 'buffer', maxBuffer: 64e6 });
    nb = readFileSync(`${root}/${p}`);
  } catch (e) { erreurs.push([p, e.message]); continue; }

  try {
    if (estZip(hb) && estZip(nb)) {
      const ch = await contenuZip(hb), cn = await contenuZip(nb);
      const kh = Object.keys(ch).sort(), kn = Object.keys(cn).sort();
      const diffs = [];
      if (kh.join(',') !== kn.join(',')) {
        diffs.push(`entrees: HEAD [${kh}] vs DISQUE [${kn}]`);
      }
      for (const k of kh) {
        if (!(k in cn)) { diffs.push(`${k} : DISPARUE`); continue; }
        if (!memeTexte(ch[k], cn[k])) {
          diffs.push(`${k} : ${ch[k].length} -> ${cn[k].length} caracteres`);
        }
      }
      for (const k of kn) if (!(k in ch)) diffs.push(`${k} : AJOUTEE`);
      if (diffs.length === 0) identiques.push(p);
      else reels.push({ p, diffs, ch, cn });
    } else {
      if (memeTexte(dec(hb), dec(nb))) identiques.push(p);
      else reels.push({ p, diffs: [`texte : ${dec(hb).length} -> ${dec(nb).length} caracteres`], ch: null, cn: null });
    }
  } catch (e) { erreurs.push([p, e.message]); }
}

console.log(`total examines    : ${liste.length}`);
console.log(`contenu IDENTIQUE : ${identiques.length}   (seule l'archive a ete reecrite)`);
console.log(`contenu DIFFERENT : ${reels.length}`);
if (erreurs.length) console.log(`erreurs           : ${erreurs.length}`);

console.log('\n=== FICHIERS DONT LE CONTENU A CHANGE ===');
for (const r of reels) {
  console.log(`\n--- ${r.p}`);
  for (const d of r.diffs) console.log(`      ${d}`);
}
for (const [p, m] of erreurs) console.log(`  ERREUR ${p} : ${m}`);

writeFileSync(`${root}/_tri-resultat.json`, JSON.stringify({
  identiques, reels: reels.map((r) => ({ p: r.p, diffs: r.diffs })),
  erreurs,
}, null, 2));
console.log('\n(detail dans _tri-resultat.json)');
