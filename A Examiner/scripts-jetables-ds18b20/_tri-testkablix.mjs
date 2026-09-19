// Trie les fichiers testkablix modifies : difference REELLE de contenu, ou
// simple reencodage (BOM, fins de ligne, ordre des cles JSON) ?
// Ne modifie RIEN : il lit et il classe.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'c:/- VS Code/Extensions/Kablix';
const liste = execSync('git diff --name-only -- testkablix/', { cwd: root, encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);

/** Contenu enregistre (HEAD) d'un fichier, en texte. */
function versionHead(p) {
  const buf = execSync(`git show HEAD:"${p}"`, { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return decoder(buf);
}
/** Decode UTF-16LE/BE avec BOM, sinon UTF-8. */
function decoder(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2);
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const s = Buffer.from(buf.subarray(2));
    s.swap16();
    return s.toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8', 3);
  return buf.toString('utf8');
}
/** Normalise : fins de ligne et espaces de fin, pour isoler le vrai contenu. */
const norm = (t) => t.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();

/** Pour un JSON, compare la STRUCTURE (ordre des cles indifferent). */
function memeJson(a, b) {
  try {
    const stable = (v) => {
      if (Array.isArray(v)) return v.map(stable);
      if (v && typeof v === 'object') {
        return Object.keys(v).sort().reduce((o, k) => { o[k] = stable(v[k]); return o; }, {});
      }
      return v;
    };
    return JSON.stringify(stable(JSON.parse(a))) === JSON.stringify(stable(JSON.parse(b)));
  } catch { return null; }
}

const identiques = [], reencodes = [], reels = [], erreurs = [];
for (const p of liste) {
  let head, now;
  try {
    head = versionHead(p);
    now = decoder(readFileSync(join(root, p)));
  } catch (e) { erreurs.push([p, e.message]); continue; }

  if (head === now) { identiques.push(p); continue; }
  const nh = norm(head), nn = norm(now);
  if (nh === nn) { reencodes.push(p); continue; }
  const j = memeJson(nh, nn);
  if (j === true) { reencodes.push(p); continue; }
  // Vraie difference : on chiffre l'ampleur.
  const lh = nh.split('\n'), ln = nn.split('\n');
  reels.push({ p, dl: ln.length - lh.length, head: nh, now: nn });
}

console.log(`total examines      : ${liste.length}`);
console.log(`octet pour octet    : ${identiques.length}`);
console.log(`reencodage seul     : ${reencodes.length}  (BOM / fins de ligne / ordre des cles)`);
console.log(`DIFFERENCE REELLE   : ${reels.length}`);
if (erreurs.length) console.log(`erreurs             : ${erreurs.length}`);

console.log('\n=== FICHIERS A REGARDER ===');
for (const r of reels.sort((a, b) => Math.abs(b.dl) - Math.abs(a.dl))) {
  console.log(`\n--- ${r.p}  (${r.dl >= 0 ? '+' : ''}${r.dl} lignes)`);
}
for (const [p, m] of erreurs) console.log(`  ERREUR ${p} : ${m}`);

// On garde le detail pour l'etape suivante.
import { writeFileSync } from 'node:fs';
writeFileSync(join(root, '_tri-resultat.json'),
  JSON.stringify({ identiques, reencodes, reels: reels.map((r) => r.p) }, null, 2));
