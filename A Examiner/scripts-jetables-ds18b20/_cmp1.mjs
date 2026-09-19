// Compare en detail UN fichier testkablix entre HEAD et le disque.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const p = process.argv[2];
const root = 'c:/- VS Code/Extensions/Kablix';
const dec = (b) => {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  return b.toString('utf8');
};
const h = dec(execSync(`git show HEAD:"${p}"`, { cwd: root, encoding: 'buffer', maxBuffer: 64e6 }));
const n = dec(readFileSync(`${root}/${p}`));

console.log(`HEAD : ${h.split('\n').length} lignes, ${h.length} caracteres`);
console.log(`DISQUE: ${n.split('\n').length} lignes, ${n.length} caracteres`);

// Meme objet JSON ?
try {
  const a = JSON.parse(h), b = JSON.parse(n);
  const stable = (v) => Array.isArray(v) ? v.map(stable)
    : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = stable(v[k]), o), {}) : v;
  console.log('MEME CONTENU JSON :', JSON.stringify(stable(a)) === JSON.stringify(stable(b)));
  console.log('cles racine HEAD  :', Object.keys(a).join(', '));
  console.log('cles racine DISQUE:', Object.keys(b).join(', '));
  if (a.parts && b.parts) {
    console.log(`parts HEAD ${a.parts.length} / DISQUE ${b.parts.length}`);
    const pos = (x) => x.parts.map((q) => `${q.id}@${q.x},${q.y}`).join(' | ');
    const ph = pos(a), pn = pos(b);
    console.log('MEMES POSITIONS :', ph === pn);
    if (ph !== pn) { console.log('  HEAD  :', ph); console.log('  DISQUE:', pn); }
  }
  if (a.connections && b.connections) {
    console.log(`connexions HEAD ${a.connections.length} / DISQUE ${b.connections.length}`);
    console.log('MEMES CONNEXIONS :', JSON.stringify(a.connections) === JSON.stringify(b.connections));
  }
} catch (e) {
  console.log('pas du JSON comparable :', e.message);
}
console.log('\n--- HEAD, 400 premiers caracteres ---');
console.log(h.slice(0, 400));
console.log('\n--- DISQUE, 400 premiers caracteres ---');
console.log(n.slice(0, 400));
