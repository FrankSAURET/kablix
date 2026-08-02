// Renomme les composants des tests testkablix avec les repères de schéma
// (R1, C1, L1, U1, Rl1…) au lieu des vieux noms internes (r1, led1, mcu1).
//
// Le fichier de vérité est testkablix/_spec.mjs : on y remplace les `id:` et
// les `partId` des fils. Les .projix sont ensuite régénérés (schémas seuls, les
// .ino/.py retouchés à la main ne sont PAS touchés).
//
//   node scripts/_rename-testkablix.mjs            (analyse seulement)
//   node scripts/_rename-testkablix.mjs --write    (réécrit _spec.mjs)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-rename');
mkdirSync(CACHE, { recursive: true });

// Le catalogue et la table des repères sont en TypeScript : on les empaquette
// pour les exécuter tels quels, comme le font les bancs verify-*.
writeFileSync(join(CACHE, 'api.mjs'), `
export { refPrefix, nextPartId } from '../../src/webview/diagram/refnames.mjs';
export { initLocale } from '../../src/webview/i18n.mjs';
`);
const apiFile = join(CACHE, 'api.bundle.mjs');
await esbuild({
  entryPoints: [join(CACHE, 'api.mjs')],
  outfile: apiFile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const A = await import(pathToFileURL(apiFile).href);
A.initLocale('fr');

const { TESTS } = await import(pathToFileURL(join(ROOT, 'testkablix', '_spec.mjs')).href);

// --- Correspondance ancien id → nouveau repère, test par test -----------------
const global = new Map(); // ancien id → nouveau repère (doit être le même partout)
const conflits = [];
for (const test of TESTS) {
  const taken = [];
  for (const part of test.parts) {
    const ref = A.nextPartId(part.type, taken);
    taken.push(ref);
    const deja = global.get(part.id);
    if (deja && deja !== ref) {
      conflits.push(`${test.name} : ${part.id} → ${ref} (ailleurs ${deja})`);
    }
    global.set(part.id, ref);
  }
}

console.log(`${TESTS.length} tests, ${global.size} identifiants distincts.`);
for (const [vieux, neuf] of [...global].sort()) console.log(`  ${vieux.padEnd(8)} → ${neuf}`);
if (conflits.length) {
  console.log(`\n⚠ ${conflits.length} conflit(s) — un même id ne donne pas le même repère partout :`);
  for (const c of conflits) console.log(`  ${c}`);
}

if (!process.argv.includes('--write')) process.exit(conflits.length ? 1 : 0);
if (conflits.length) {
  console.error('Réécriture refusée : conflits à régler d’abord.');
  process.exit(1);
}

// --- Réécriture de _spec.mjs --------------------------------------------------
// Un identifiant se cite de deux façons : entre quotes ('r1' — déclaration,
// fil, attente) ou en clé d'objet (`on: { q1: 0.15 }`). On ne touche RIEN à
// l'intérieur des gabarits `...` : ce sont les programmes .ino/.py, qui ont
// leurs propres chaînes entre quotes.
const specPath = join(ROOT, 'testkablix', '_spec.mjs');
const src = readFileSync(specPath, 'utf8');

/** Découpe le source en tronçons : code JS d'un côté, gabarits de l'autre. */
function splitTemplates(text) {
  const parts = [];
  let start = 0;
  let inTpl = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] !== '`') continue;
    parts.push({ code: !inTpl, text: text.slice(start, i + (inTpl ? 1 : 0)) });
    start = i + (inTpl ? 1 : 0);
    inTpl = !inTpl;
  }
  parts.push({ code: !inTpl, text: text.slice(start) });
  return parts;
}

const OLD = [...global.keys()].sort((a, b) => b.length - a.length).join('|');
let n = 0;
const out = splitTemplates(src).map((chunk) => {
  if (!chunk.code) return chunk.text;
  return chunk.text
    .replace(new RegExp(`'(${OLD})'`, 'g'), (_, v) => { n++; return `'${global.get(v)}'`; })
    .replace(new RegExp(`\\b(${OLD})(\\s*:)`, 'g'), (_, v, tail) => { n++; return `${global.get(v)}${tail}`; });
}).join('');
writeFileSync(specPath, out, 'utf8');
console.log(`\n_spec.mjs : ${n} identifiants réécrits.`);

// Reste-t-il un vieil identifiant dans le code ? (les gabarits sont hors jeu)
const restes = [];
for (const chunk of splitTemplates(out)) {
  if (!chunk.code) continue;
  const re = new RegExp(`\\b(${OLD})\\b`, 'g');
  for (const m of chunk.text.matchAll(re)) {
    const ligne = out.slice(0, out.indexOf(chunk.text) + m.index).split('\n').length;
    restes.push(`${ligne}: ${m[1]}`);
  }
}
if (restes.length) {
  console.log(`\n⚠ ${restes.length} occurrence(s) restantes :`);
  for (const r of restes.slice(0, 30)) console.log(`  ${r}`);
}

// --- Réécriture des .projix ----------------------------------------------------
// Les schémas sont retouchés à la main (positions, tracés de fils) : on les
// renomme SUR PLACE plutôt que de les régénérer, sinon la mise en page part.
// Chaque fichier est renuméroté pour lui-même, dans l'ordre de ses composants.
const projixFiles = [
  ...readdirSync(join(ROOT, 'testkablix'), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.projix'))
    .map((e) => join(ROOT, 'testkablix', e.name)),
  ...readdirSync(join(ROOT, 'testkablix'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '__pycache__')
    .flatMap((d) => readdirSync(join(ROOT, 'testkablix', d.name))
      .filter((f) => f.endsWith('.projix'))
      .map((f) => join(ROOT, 'testkablix', d.name, f))),
];

let touches = 0;
for (const file of projixFiles) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const diagramEntry = zip.file('diagram.json');
  if (!diagramEntry) { console.log(`  ? ${file} : pas de diagram.json`); continue; }
  const diagram = JSON.parse(await diagramEntry.async('string'));
  const map = new Map();
  const taken = [];
  for (const part of diagram.parts ?? []) {
    let ref;
    try {
      ref = A.nextPartId(part.type, taken);
    } catch {
      ref = part.id; // type inconnu : on n'y touche pas
    }
    taken.push(ref);
    map.set(part.id, ref);
    part.id = ref;
  }
  for (const wire of diagram.wires ?? []) {
    if (wire.a) wire.a.partId = map.get(wire.a.partId) ?? wire.a.partId;
    if (wire.b) wire.b.partId = map.get(wire.b.partId) ?? wire.b.partId;
  }
  const change = [...map].some(([vieux, neuf]) => vieux !== neuf);
  if (!change) continue;
  zip.file('diagram.json', JSON.stringify(diagram, null, 2));
  writeFileSync(file, await zip.generateAsync({
    type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 },
  }));
  touches++;
  console.log(`  ${file.slice(ROOT.length + 1)} : ${[...map].filter(([a, b]) => a !== b).map(([a, b]) => `${a}→${b}`).join(' ')}`);
}
console.log(`\n${touches} .projix renommés sur ${projixFiles.length}.`);
