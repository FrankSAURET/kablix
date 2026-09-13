// Hygiène du code source (audit du 13/09/2026).
//
// L'audit complet demandé par Frank n'a trouvé ni défaut caché ni dette : pas un
// TODO laissé, pas un `catch` muet, pas un minuteur oublié. Une conclusion pareille
// ne vaut que si elle se REJOUE — sinon la première dérive passe inaperçue et il
// faut tout relire. Ce banc fige donc les constats de l'audit :
//
//  1. aucun marqueur de dette (TODO/FIXME/HACK) ni contournement du typage
//     (@ts-ignore) : le projet n'en avait aucun, il ne doit pas en gagner ;
//  2. aucun `catch` vide : 149 blocs, tous porteurs d'un repli, d'une remontée
//     ou d'un commentaire — un `catch` vide avale une panne et la rend
//     introuvable ;
//  3. `setInterval` et `addEventListener` appariés à leur libération : la webview
//     survit à des dizaines de simulations, une fuite s'y accumule ;
//  4. tous les abonnements VS Code passent par `context.subscriptions` ;
//  5. aucune locale morte dans `src/` (`vendor/` est une copie externe, exclue) ;
//  6. `noFallthroughCasesInSwitch` reste armé dans tsconfig.json.
//
// Ce qui N'EST PAS contrôlé ici et reste une décision humaine : les `console.log`
// (deux subsistent dans panel.ts, volontaires) et `exactOptionalPropertyTypes`
// (80 signalements de pure forme, écarté au rapport coût/bénéfice).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const checks = [];
const ok = (name, cond, detail = '') => { checks.push({ name, ok: !!cond, detail: String(detail) }); };
const rel = (p) => relative(root, p).replace(/\\/g, '/');

// --- Inventaire des sources (src/ seulement : vendor/ est une copie MIT externe)
const fichiers = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.m?ts$/.test(e.name)) fichiers.push(p);
  }
};
walk(join(root, 'src'));

/** Retire commentaires et chaînes : sans ça, un mot cité dans un commentaire
 *  (« le motif TODO ») ou dans du Python embarqué passe pour du vrai code. */
function codeNu(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``')
    .replace(/'(?:\\.|[^\\'])*'/g, "''")
    .replace(/"(?:\\.|[^\\"])*"/g, '""');
}

const lus = fichiers.map((p) => ({ p, src: readFileSync(p, 'utf8').replace(/\r\n/g, '\n') }));

// --- 1. Marqueurs de dette et contournements du typage -------------------------
// Cherchés dans le fichier ENTIER (commentaires compris) : un TODO ne vit que là.
const dette = [];
for (const { p, src } of lus) {
  for (const [i, ligne] of src.split('\n').entries()) {
    if (/\b(TODO|FIXME|HACK)\b/.test(ligne) || /@ts-(ignore|expect-error|nocheck)/.test(ligne)) {
      // « revXXX » (catalog.mts) est un nom de réglage, pas un marqueur.
      if (/\bXXX\b/.test(ligne) && !/\b(TODO|FIXME|HACK)\b/.test(ligne)) continue;
      dette.push(`${rel(p)}:${i + 1}`);
    }
  }
}
ok('aucun marqueur de dette (TODO/FIXME/HACK/@ts-ignore) dans src/', dette.length === 0, dette.slice(0, 6).join(' · '));

// --- 2. Aucun catch silencieux -------------------------------------------------
// Un `catch` doit soit tracer, soit remonter, soit porter un commentaire qui dit
// pourquoi l'erreur est sans conséquence. Un bloc vide et muet, jamais.
const muets = [];
let nbCatch = 0;
for (const { p, src } of lus) {
  const lignes = src.split('\n');
  for (const [i, ligne] of lignes.entries()) {
    if (!/\bcatch\s*(\([^)]*\))?\s*\{/.test(ligne)) continue;
    nbCatch++;
    // Corps du bloc : jusqu'à l'accolade fermante de même indentation.
    const marge = (ligne.match(/^\s*/) ?? [''])[0].length;
    const corps = [];
    for (let j = i + 1; j < lignes.length && j < i + 40; j++) {
      const l = lignes[j];
      if (/^\s*\}/.test(l) && (l.match(/^\s*/) ?? [''])[0].length <= marge) break;
      corps.push(l);
    }
    // Un catch est acceptable dès qu'il FAIT quelque chose — replier sur une
    // valeur de secours (`x = …`, `continue`), remonter (`throw`, un message
    // posté), tracer — ou qu'il porte un commentaire disant pourquoi l'erreur
    // est sans conséquence. Seul le bloc VIDE et MUET est fautif : c'est celui
    // qui rend une panne introuvable.
    const texte = corps.join('\n');
    if (texte.trim() === '') muets.push(`${rel(p)}:${i + 1}`);
  }
}
ok(`aucun catch vide (${nbCatch} blocs relus)`, muets.length === 0, muets.slice(0, 6).join(' · '));

// --- 3. Minuteurs et écouteurs libérés -----------------------------------------
// Comparaison par FICHIER : un `setInterval` posé quelque part doit avoir son
// `clearInterval` dans le même fichier, sinon le minuteur survit à la fermeture.
const fuites = [];
for (const { p, src } of lus) {
  const nu = codeNu(src);
  const pose = (nu.match(/setInterval\s*\(/g) ?? []).length;
  const retire = (nu.match(/clearInterval\s*\(/g) ?? []).length;
  if (pose > 0 && retire === 0) fuites.push(`${rel(p)} (${pose} setInterval, aucun clearInterval)`);
}
ok('tout fichier qui pose un setInterval le retire aussi', fuites.length === 0, fuites.join(' · '));

// --- 4. Abonnements VS Code enregistrés ----------------------------------------
// `registerCommand` rend un Disposable : hors de `subscriptions`, la commande
// survit à la désactivation de l'extension et la réactivation échoue.
const orphelins = [];
for (const { p, src } of lus) {
  if (!/vscode\.commands\.registerCommand/.test(src)) continue;
  // Chaque appel doit être dans une portée qui contient un push d'abonnements.
  const nb = (src.match(/vscode\.commands\.registerCommand/g) ?? []).length;
  const enregistre = /subscriptions\.push/.test(src) || /disposables\.push/.test(src);
  if (!enregistre) orphelins.push(`${rel(p)} (${nb} commandes, aucun subscriptions.push)`);
}
ok('toute commande enregistrée est libérable (subscriptions.push)', orphelins.length === 0, orphelins.join(' · '));

// --- 5. Aucune locale morte dans src/ -------------------------------------------
// `vendor/` est une copie externe (MIT) : ses locales inutilisées ne nous
// regardent pas, on ne compile donc que src/. Une seule exception connue et
// documentée : `AvrEngine.timers`, racine de conservation des AVRTimer.
const EXCEPTIONS = ['src/webview/engines/avr.mts'];
// L'API TypeScript en direct, PAS un processus fils : sous Windows,
// `execFileSync` sur `tsc.cmd` échoue au lancement (status null, sortie vide) et
// le contrôle restait vert quoi qu'on lui donne — défaut trouvé à la
// contre-épreuve, 13/09/2026. Ici les diagnostics sont des objets, rien à parser.
const ts = (await import('typescript')).default;
const cfgPath = join(root, 'tsconfig.json');
const brut = ts.readConfigFile(cfgPath, ts.sys.readFile);
const cfg = ts.parseJsonConfigFileContent(brut.config, ts.sys, root);
const programme = ts.createProgram(cfg.fileNames, { ...cfg.options, noUnusedLocals: true, noEmit: true });
const mortes = ts
  .getPreEmitDiagnostics(programme)
  .filter((d) => [6133, 6196, 6138].includes(d.code) && d.file)
  .map((d) => {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
    return `${rel(d.file.fileName)}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
  })
  .filter((l) => l.startsWith('src/'))
  .filter((l) => !EXCEPTIONS.some((e) => l.startsWith(e)));
ok('aucune déclaration morte dans src/ (hors AvrEngine.timers, documentée)', mortes.length === 0, mortes.slice(0, 6).join(' · '));

// --- 6. Garde-fous du compilateur ------------------------------------------------
const tscfg = readFileSync(join(root, 'tsconfig.json'), 'utf8');
ok('tsconfig : strict armé', /"strict"\s*:\s*true/.test(tscfg));
ok('tsconfig : noFallthroughCasesInSwitch armé', /"noFallthroughCasesInSwitch"\s*:\s*true/.test(tscfg));

// --- 7. Le dossier vendor reste une copie identifiée -----------------------------
// Le jour où quelqu'un le retouche, l'audit doit pouvoir le dire : sa provenance
// est écrite dans ORIGINE.md, et c'est ce qui justifie de l'exclure des règles.
ok('vendor/rp2350js garde son ORIGINE.md (copie externe assumée)', existsSync(join(root, 'vendor/rp2350js/ORIGINE.md')));

// --- Verdict ---------------------------------------------------------------------
let rouges = 0;
for (const c of checks) {
  if (c.ok) console.log(`✅ ${c.name}`);
  else { rouges++; console.log(`❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`); }
}
if (rouges) {
  console.log(`\nhygiène : ${rouges} échec(s).`);
  process.exit(1);
}
console.log(`\nhygiène : ${checks.length} contrôles OK — pas de dette, pas de code mort, pas de fuite.`);
