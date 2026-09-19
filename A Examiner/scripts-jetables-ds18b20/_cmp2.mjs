// Que perd-on exactement dans un .projix regenere ?
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const p = process.argv[2];
const root = 'c:/- VS Code/Extensions/Kablix';
const lire = async (buf) => {
  const z = await JSZip.loadAsync(buf);
  const o = {};
  for (const n of Object.keys(z.files)) if (!z.files[n].dir) o[n] = await z.files[n].async('string');
  return o;
};
const ch = await lire(execSync(`git show HEAD:"${p}"`, { cwd: root, encoding: 'buffer', maxBuffer: 64e6 }));
const cn = await lire(readFileSync(`${root}/${p}`));

for (const k of Object.keys(ch)) {
  console.log(`\n=========== ${k} ===========`);
  let a, b;
  try { a = JSON.parse(ch[k]); b = JSON.parse(cn[k] ?? '{}'); }
  catch { console.log('  (pas du JSON)'); continue; }
  const ka = Object.keys(a), kb = Object.keys(b);
  console.log('  cles HEAD  :', ka.join(', '));
  console.log('  cles DISQUE:', kb.join(', '));
  for (const c of ka) {
    if (!(c in b)) { console.log(`  >>> CLE PERDUE : ${c}`); continue; }
    const sa = JSON.stringify(a[c]), sb = JSON.stringify(b[c]);
    if (sa !== sb) {
      console.log(`  ~ ${c} : ${sa.length} -> ${sb.length} caracteres`);
      if (Array.isArray(a[c]) && Array.isArray(b[c])) {
        console.log(`      elements : ${a[c].length} -> ${b[c].length}`);
        if (c === 'parts') {
          const idA = a[c].map((x) => x.id), idB = b[c].map((x) => x.id);
          const perdus = idA.filter((i) => !idB.includes(i));
          const ajoutes = idB.filter((i) => !idA.includes(i));
          if (perdus.length) console.log('      composants PERDUS :', perdus.join(', '));
          if (ajoutes.length) console.log('      composants AJOUTES:', ajoutes.join(', '));
          // positions des communs
          const bouge = [];
          for (const x of a[c]) {
            const y = b[c].find((q) => q.id === x.id);
            if (y && (x.x !== y.x || x.y !== y.y)) bouge.push(`${x.id} ${x.x},${x.y} -> ${y.x},${y.y}`);
          }
          if (bouge.length) console.log('      DEPLACES :', bouge.join(' | '));
          else console.log('      positions des communs : inchangees');
        }
      }
    }
  }
  for (const c of kb) if (!(c in a)) console.log(`  +++ CLE AJOUTEE : ${c}`);
}
