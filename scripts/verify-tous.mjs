// Lanceur de la suite complète des bancs, en parallèle (v2026.8.102.3).
//
// `verify:all` enchaînait 93 bancs avec des `&&` : un seul cœur occupé, 14 min
// sur une machine à 12, et un arrêt sec au premier rouge — le reste de la suite
// n'était même pas joué. Ce lanceur garde EXACTEMENT le même périmètre (il lit
// la liste dans `verify:all:serie`, il ne la choisit pas) et change trois choses :
//
//   1. les bancs tournent par paquets de N ;
//   2. ceux qui MESURENT du temps mur tournent seuls, à la fin, pour que la
//      contention processeur ne les fasse pas mentir ;
//   3. un échec n'arrête plus rien : la suite va jusqu'au bout et les sorties
//      des bancs rouges sont regroupées à la fin.
//
// Options : --jobs=N, --serie, --stop (s'arrêter au premier échec, comme avant),
// --filtre=motif, --liste.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const scripts = manifest.scripts ?? {};

const flag = (nom) => process.argv.includes(`--${nom}`);
const opt = (nom, def) => {
  const p = process.argv.find((a) => a.startsWith(`--${nom}=`));
  return p ? p.slice(nom.length + 3) : def;
};

// La liste de référence RESTE `verify:all:serie` : le lanceur ne décide pas du
// périmètre de la suite, il rejoue la même chaîne autrement. Un banc ajouté là
// est automatiquement pris ici, et le repli en série reste jouable tel quel.
const source = scripts['verify:all:serie'];
if (!source) {
  console.error('❌ package.json : script `verify:all:serie` introuvable — c\'est lui qui porte la liste des bancs.');
  process.exit(2);
}
let bancs = [...new Set(
  source.split('&&').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^npm run\s+/, '')),
)];
const inconnus = bancs.filter((n) => !scripts[n]);
if (inconnus.length) {
  console.error(`❌ bancs listés mais absents du manifeste : ${inconnus.join(', ')}`);
  process.exit(2);
}
// Un banc écrit dans package.json mais oublié de la liste ne serait jamais joué :
// on le signale sans faire échouer la suite (certains sont volontairement hors
// suite, le rappel suffit à trancher).
const declares = Object.keys(scripts).filter((n) => /^verify(:|$)/.test(n) && !n.startsWith('verify:all'));
const oublies = declares.filter((n) => !bancs.includes(n));

const filtre = opt('filtre', '');
if (filtre) bancs = bancs.filter((n) => n.includes(filtre));

// Ces bancs comparent du TEMPS MUR à un seuil (cadence de simulation, rattrapage
// temps réel, persistance du multiplexage 7 segments). Sous charge ils passent au
// rouge sans qu'une seule ligne de `src/` ait bougé : ce sont des sentinelles, pas
// des bancs à assouplir. Ils tournent donc seuls, une fois le pool vidé.
const SOLO = new Set(['verify:7seg-mux', 'verify:simspeed', 'verify:realtime']);

if (flag('liste')) {
  for (const n of bancs) console.log(`${SOLO.has(n) ? 'seul    ' : 'parallèle'} ${n}`);
  console.log(`${bancs.length} bancs (${bancs.filter((n) => SOLO.has(n)).length} en solo).`);
  process.exit(0);
}

const serie = flag('serie');
// Chrome headless (une bonne moitié des bancs) et esbuild sont déjà multi-processus :
// laisser deux cœurs de marge évite que la machine passe son temps à arbitrer.
const jobs = serie ? 1 : Math.max(1, Number(opt('jobs', String(Math.max(2, Math.min(8, cpus().length - 2))))) || 1);
const stop = flag('stop');

// `npm run x` coûte 300 à 500 ms de démarrage sous Windows, et l'antivirus inspecte
// chaque lancement : sur 90 bancs c'est une minute perdue avant le premier contrôle.
// On exécute donc directement le `node scripts/…` que le script du manifeste contient.
const etapes = (nom) => scripts[nom].split('&&').map((s) => s.trim()).map((cmd) => {
  const m = /^node\s+(\S+)\s*(.*)$/.exec(cmd);
  if (!m) return { shell: cmd };
  return { args: [m[1], ...(m[2] ? m[2].split(/\s+/) : [])] };
});

const lance = (nom) => new Promise((fini) => {
  const t0 = performance.now();
  const suite = etapes(nom);
  let sortie = '';
  const suivant = (i) => {
    if (i >= suite.length) return fini({ nom, code: 0, ms: performance.now() - t0, sortie });
    const e = suite[i];
    const p = e.shell
      ? spawn(e.shell, { cwd: root, shell: true })
      : spawn(process.execPath, e.args, { cwd: root });
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { sortie += d; });
    p.on('error', (err) => fini({ nom, code: 1, ms: performance.now() - t0, sortie: `${sortie}${err}` }));
    p.on('close', (code) => (code ? fini({ nom, code, ms: performance.now() - t0, sortie }) : suivant(i + 1)));
  };
  suivant(0);
});

// Durées du run précédent : elles servent à démarrer les bancs les plus longs en
// premier (sinon un banc de 3 min lancé en dernier tient le pool à lui tout seul).
const cache = join(root, 'node_modules', '.cache', 'kablix-verify-durees.json');
let durees = {};
try { durees = JSON.parse(readFileSync(cache, 'utf8')); } catch { /* premier run */ }

const secondes = (ms) => `${(ms / 1000).toFixed(1)} s`;
const resume = (txt) => {
  const lignes = txt.split(/\r?\n/).filter((l) => l.trim());
  return (lignes[lignes.length - 1] ?? '').slice(0, 90);
};

const total = bancs.length;
let faits = 0;
const resultats = [];
const trace = (r) => {
  faits++;
  const tete = `${r.code ? '❌' : '✅'} [${String(faits).padStart(2)}/${total}] ${r.nom.padEnd(22)} ${secondes(r.ms).padStart(7)}`;
  console.log(r.code ? tete : `${tete}  ${resume(r.sortie)}`);
};

let arrete = false;
const pool = async (liste, n) => {
  let i = 0;
  const ouvrier = async () => {
    while (i < liste.length && !arrete) {
      const r = await lance(liste[i++]);
      resultats.push(r);
      trace(r);
      if (r.code && stop) arrete = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, ouvrier));
};

const paralleles = bancs.filter((n) => !SOLO.has(n)).sort((a, b) => (durees[b] ?? 0) - (durees[a] ?? 0));
const seuls = bancs.filter((n) => SOLO.has(n));

console.log(`Suite complète : ${total} bancs, ${jobs} en parallèle, ${seuls.length} en solo à la fin.`);
if (oublies.length) console.log(`⚠️  hors suite (déclarés dans package.json, absents de verify:all:serie) : ${oublies.join(', ')}`);

const depart = performance.now();
await pool(paralleles, jobs);
// Les sentinelles ne partent qu'une fois le pool VIDÉ : `pool` n'a rendu la main
// qu'à la mort du dernier enfant, la machine est de nouveau au repos.
if (!arrete) await pool(seuls, 1);
const mur = performance.now() - depart;

try {
  mkdirSync(join(root, 'node_modules', '.cache'), { recursive: true });
  writeFileSync(cache, JSON.stringify(Object.fromEntries(resultats.map((r) => [r.nom, Math.round(r.ms)])), null, 1));
} catch { /* le cache n'est qu'une optimisation d'ordonnancement */ }

const rouges = resultats.filter((r) => r.code);
for (const r of rouges) {
  console.log(`\n${'─'.repeat(78)}\n❌ ${r.nom} (code ${r.code}, ${secondes(r.ms)})\n${'─'.repeat(78)}`);
  console.log(r.sortie.trimEnd());
}

const cumul = resultats.reduce((s, r) => s + r.ms, 0);
console.log(`\n${'═'.repeat(78)}`);
console.log(`${resultats.length}/${total} bancs joués en ${secondes(mur)} (cumul ${secondes(cumul)}, accélération ×${(cumul / mur).toFixed(1)}).`);
console.log(rouges.length
  ? `❌ ${rouges.length} banc(s) en échec : ${rouges.map((r) => r.nom).join(', ')}`
  : '✅ suite complète verte.');
process.exit(rouges.length ? 1 : 0);
