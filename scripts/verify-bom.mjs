// Nomenclature : la liste des composants exportée en CSV (v2026.7.240).
//
// Ce que le banc surveille :
//  1. le FORMAT : séparateur point-virgule, marque UTF-8 (sinon Excel affiche
//     « RÃ©sistance »), fins de ligne CRLF, cellules échappées — un « ; » dans
//     une valeur décalerait toutes les colonnes suivantes ;
//  2. le CONTENU : un composant par ligne, trié par repère (R2 avant R10), avec
//     ses caractéristiques lisibles et traduites ;
//  3. le CÂBLAGE hôte ↔ webview : menu → commande → demande → réponse →
//     enregistrement. Un maillon manquant = une entrée de menu sans effet.
//
// Usage : node scripts/verify-bom.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-bom');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Le CSV, en Node, sur un vrai schéma
// ---------------------------------------------------------------------------
writeFileSync(join(CACHE, 'api.mjs'), `
export { partsCsv, bomRows, partSpecs } from '../../src/webview/diagram/bom.mjs';
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

const parts = [
  { id: 'R10', type: 'resistor', x: 0, y: 0, attrs: { value: '10000' } },
  { id: 'R2', type: 'resistor', x: 0, y: 0, attrs: { value: '220' } },
  { id: 'L1', type: 'led', x: 0, y: 0, attrs: { color: 'red' } },
  { id: 'U1', type: 'uno', x: 0, y: 0 },
  { id: 'BP1', type: 'button', x: 0, y: 0 },
  { id: 'T1', type: 'npn', x: 0, y: 0, attrs: { text: 'BC547\nNXP', gain: '200' } },
];
const csv = A.partsCsv(parts);
const lines = csv.split('\r\n').filter((l) => l !== '');

ok('format : le fichier commence par la marque UTF-8 (Excel lit les accents)',
  csv.charCodeAt(0) === 0xfeff, 'U+' + csv.charCodeAt(0).toString(16));
ok('format : séparateur POINT-VIRGULE, 4 colonnes',
  lines.every((l) => l.split(';').length === 4), lines[0]);
ok('format : fins de ligne CRLF, dernière ligne terminée',
  csv.endsWith('\r\n') && !/[^\r]\n/.test(csv));
ok('format : en-tête traduite (Repère ; Composant ; Type ; Caractéristiques)',
  lines[0].replace('﻿', '') === 'Repère;Composant;Type;Caractéristiques', lines[0]);
ok('contenu : une ligne par composant (6 posés → 6 lignes + en-tête)',
  lines.length === 7, lines.length + ' ligne(s)');
ok('tri : par famille puis par NUMÉRO (R2 avant R10)',
  lines.slice(1).map((l) => l.split(';')[0]).join(',') === 'BP1,L1,R2,R10,T1,U1',
  lines.slice(1).map((l) => l.split(';')[0]).join(','));
ok('contenu : le libellé du composant est traduit',
  /;Résistance;resistor;/.test(lines.find((l) => l.startsWith('R2;'))),
  lines.find((l) => l.startsWith('R2;')));
ok('contenu : les caractéristiques sont lisibles (libellé : valeur)',
  /Valeur \(Ω\) : 220/.test(lines.find((l) => l.startsWith('R2;'))),
  lines.find((l) => l.startsWith('R2;')));
ok('contenu : une valeur de liste sort avec son libellé traduit, pas son code',
  /Rouge/.test(lines.find((l) => l.startsWith('L1;'))),
  lines.find((l) => l.startsWith('L1;')));
ok('contenu : une inscription multiligne tient sur UNE cellule',
  !/BC547\r?\n/.test(csv) && /BC547 NXP/.test(csv),
  lines.find((l) => l.startsWith('T1;')));
ok('contenu : la carte à µc figure dans la liste',
  lines.some((l) => l.startsWith('U1;Arduino Uno;uno;')),
  lines.find((l) => l.startsWith('U1;')));

// Échappement : un « ; » ou un guillemet dans une valeur ne doit pas décaler
// les colonnes.
const hostile = A.partsCsv([
  { id: 'T1', type: 'npn', x: 0, y: 0, attrs: { text: 'a;b', gain: '' } },
  { id: 'T2', type: 'npn', x: 0, y: 0, attrs: { text: 'dit "oui"' } },
]);
ok('échappement : une cellule contenant « ; » est mise entre guillemets',
  /"[^"]*a;b[^"]*"/.test(hostile), hostile.split('\r\n')[1]);
ok('échappement : les guillemets sont doublés',
  /""oui""/.test(hostile), hostile.split('\r\n')[2]);
ok('robustesse : schéma vide → en-tête seule, aucune exception',
  A.partsCsv([]).split('\r\n').filter((l) => l).length === 1);
ok('robustesse : type inconnu (projet plus récent) → ligne conservée',
  /^X1;futur;futur;$/m.test(A.partsCsv([{ id: 'X1', type: 'futur', x: 0, y: 0 }])),
  A.partsCsv([{ id: 'X1', type: 'futur', x: 0, y: 0 }]).split('\r\n')[1]);

// Les propriétés masquées par une condition ne polluent pas la ligne : sur un
// transistor de référence, les réglages génériques (gain, Vce…) sont cachés.
const rows = A.bomRows(parts);
ok('caractéristiques : les propriétés conditionnelles masquées sont sautées',
  !/Symbole interne/.test(A.partSpecs({ id: 'T9', type: 'pn2222a', x: 0, y: 0 })),
  A.partSpecs({ id: 'T9', type: 'pn2222a', x: 0, y: 0 }));
ok('bomRows : repère, libellé, type et caractéristiques sont séparés',
  rows[0].ref === 'BP1' && rows[0].type === 'button' && typeof rows[0].specs === 'string',
  JSON.stringify(rows[0]));

A.initLocale('en');
ok('anglais : l’en-tête sort en anglais',
  A.partsCsv([]).replace('﻿', '').startsWith('Ref.;Part;Type;Characteristics'),
  A.partsCsv([]).replace('﻿', '').split('\r\n')[0]);
A.initLocale('fr');

// ---------------------------------------------------------------------------
// 2. Le câblage : menu → commande → webview → hôte → fichier
// ---------------------------------------------------------------------------
const html = read('src/webview-html.ts');
const ext = read('src/extension.ts');
const panel = read('src/panel.ts');
const sim = read('src/webview/sim.mts');
const pkg = JSON.parse(read('package.json'));

ok('menu hamburger : l’entrée « liste des composants » est là',
  /data-cmd="kablix\.exportPartsCsv">\$\{l10n\.t\('Export the part list \(CSV\)'\)\}/.test(html));
// Un séparateur la suit : les exports (Wokwi, nomenclature) d'un côté, les
// mises à jour de l'autre.
ok('menu hamburger : un séparateur suit la liste des composants',
  /data-cmd="kablix\.exportPartsCsv">[^\n]*\n\s*<li class="more-menu__sep" role="separator"><\/li>/.test(html));
ok('extension : la commande kablix.exportPartsCsv est enregistrée',
  /registerCommand\('kablix\.exportPartsCsv'[\s\S]{0,120}requestPartsCsv\(\)/.test(ext));
ok('package.json : la commande est déclarée (palette de commandes)',
  pkg.contributes.commands.some((c) => c.command === 'kablix.exportPartsCsv' &&
    c.title === '%kablix.cmd.exportPartsCsv%'));
ok('panel : la commande du menu est dans la liste blanche',
  /'kablix\.exportPartsCsv',/.test(panel));
ok('panel : la demande part vers la webview',
  /requestPartsCsv\(\): void \{\s*this\.post\(\{ type: 'requestPartsCsv' \}\);/.test(panel));
ok('webview : la nomenclature est dressée et renvoyée',
  /case 'requestPartsCsv'[\s\S]{0,200}type: 'partsCsv', csv: partsCsv\(editor\.diagram\.parts\)/.test(sim));
ok('panel : la réponse est enregistrée dans un fichier',
  /case 'partsCsv'[\s\S]{0,140}this\.savePartsCsv\(msg\.csv\)/.test(panel));
ok('panel : le fichier proposé porte le NOM DU PROJET',
  /const name = `\$\{this\.projectDisplayName\(\) \?\? l10n\.t\('parts'\)\}\.csv`;/.test(panel));
ok('panel : il est proposé À CÔTÉ du .projix ouvert',
  /this\.projectUri[\s\S]{0,160}vscode\.Uri\.joinPath\(this\.projectUri, '\.\.'\)/.test(panel));

// Traductions : rien ne doit sortir en anglais côté hôte.
const fr = JSON.parse(read('l10n/bundle.l10n.fr.json'));
for (const k of ['Export the part list (CSV)', 'Part list', 'parts', 'Kablix: part list exported to {0}']) {
  ok(`traduction FR (hôte) : « ${k} »`, typeof fr[k] === 'string' && fr[k].length > 0);
}
ok('traduction FR : titre de la commande dans le paquet',
  JSON.parse(read('package.nls.fr.json'))['kablix.cmd.exportPartsCsv']?.includes('composants') &&
  !!JSON.parse(read('package.nls.json'))['kablix.cmd.exportPartsCsv']);

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail
  ? `bom : ${fail} échec(s).`
  : `bom : ${checks.length} contrôles OK — liste des composants exportée en CSV.`);
process.exit(fail ? 1 : 0);
