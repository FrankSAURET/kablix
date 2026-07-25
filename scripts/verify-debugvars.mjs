// Masquage des variables du panneau de débogage (v2026.7.182, refondu en v186) :
// clic sur le 👁 d'une variable → elle quitte le panneau, clic sur le titre
// « 🔍 Variables ▾ » → liste des masquées pour les réafficher, disquette →
// masquages mémorisés par programme (globalState de l'extension).
//
// Ce banc contrôle la COHÉRENCE des fichiers qui doivent bouger ensemble : le
// squelette HTML (webview-html.ts), la feuille de style, le catalogue de
// traductions et le relais côté extension (panel.ts). Un id absent du HTML
// ferait planter sim.mts DÈS SON CHARGEMENT (`getElementById(...) as
// HTMLButtonElement` puis `addEventListener`) : la webview entière resterait
// blanche. Une clé anglaise sans entrée FR passerait inaperçue en développement
// (t() retombe sur la clé). Un message posté sans `case` en face serait ignoré
// en silence : le bouton « mémoriser » ne mémoriserait rien.
//
// Usage : node scripts/verify-debugvars.mjs
import esbuild from 'esbuild';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const html = read('src/webview-html.ts');
const css = read('media/styles.css');
const sim = read('src/webview/sim.mts');
const i18n = read('src/webview/i18n.mts');
const panel = read('src/panel.ts');
const l10nFr = read('l10n/bundle.l10n.fr.json');

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail });

// 1. Les éléments interrogés par sim.mts au chargement existent dans le HTML.
const ids = [...sim.matchAll(/getElementById\('(debug-[a-z-]+)'\)/g)].map((m) => m[1]);
const missing = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));
ok(`panneau : les ${new Set(ids).size} id « debug-* » de sim.mts sont dans le HTML`,
  missing.length === 0, 'absents : ' + missing.join(', '));

// 2. Le bouton de mémorisation existe et porte l'icône disquette fournie.
ok('titre : bouton disquette « mémoriser les variables masquées » présent',
  html.includes('id="debug-save-hidden"') && html.includes("asset('enregistrer.svg')"),
  'bouton ou icône absent de webview-html.ts');

// 3. Classes CSS employées par le code (œil, disquette, menu, sélection, titre).
const classes = [
  '.debug__title', '.debug__titlebar', '.debug__save', '.debug__eye', '.debug__eyecell',
  '.debug__menu', '.debug__menu-empty', '.debug__row--sel',
];
const noCss = classes.filter((c) => !css.includes(c));
ok(`style : les ${classes.length} classes du panneau sont habillées`, noCss.length === 0,
  'manque : ' + noCss.join(', '));

// 4. Traductions webview : toute clé t('…') du bloc de masquage a son entrée française.
const keys = [
  'Show the hidden variables',
  'Click to hide',
  'Remember the hidden variables',
  'Hidden variables remembered',
  'Show this variable again',
  'Show all again',
  'No hidden variable — click the 👁 of a variable to hide it.',
  'All variables are hidden (click “Variables” to show them again).',
];
const untranslated = keys.filter((k) => !i18n.includes(`'${k}'`));
ok(`i18n : les ${keys.length} libellés du masquage sont traduits en français`,
  untranslated.length === 0, 'sans traduction : ' + untranslated.join(' · '));

// 5. Les info-bulles du HTML passent par l10n de l'EXTENSION (autre catalogue).
const l10nKeys = ['Show the hidden variables', 'Remember the hidden variables'];
const noL10n = l10nKeys.filter((k) => !l10nFr.includes(`"${k}"`));
ok('i18n : les info-bulles du titre sont traduites côté extension (bundle.l10n.fr)',
  noL10n.length === 0, 'sans traduction : ' + noL10n.join(' · '));

// 6. Le clic droit ne MASQUE plus (c'est l'œil depuis la v186) : il ne sert
//    qu'à choisir la base d'affichage (v189).
const ctx = sim.match(/row\.addEventListener\('contextmenu',[\s\S]{0,300}?\}\);/);
ok('masquage : le clic droit ne masque plus rien (il ouvre le menu des bases)',
  ctx && /openVarBaseMenu\(v\.name/.test(ctx[0]) && !/hideVar|hiddenVars\.add/.test(ctx[0]),
  'menu du clic droit absent ou remis à masquer');

// 7. L'œil masque bien la variable de SA ligne, sans sélectionner la ligne au passage.
const eye = sim.match(/eye\.addEventListener\('click',[\s\S]{0,200}?\}\);/);
ok('œil : un clic masque la variable de la ligne et n’enclenche pas la sélection',
  eye && /stopPropagation/.test(eye[0]) && /hideVar\(v\.name\)/.test(eye[0]),
  'listener de l’œil absent ou incomplet');

// 8. Une variable masquée reste SUIVIE : son `next.set` doit précéder le `continue`,
//    sinon elle serait vue comme « nouvelle » (donc jamais en rouge) au retour.
const loop = sim.match(/for \(const v of state\.variables\) \{[\s\S]*?\n  \}/);
const body = loop ? loop[0] : '';
ok('rouges : une variable masquée continue d’être suivie (next.set avant le saut)',
  body.indexOf('next.set(v.name') >= 0 && body.indexOf('next.set(v.name') < body.indexOf('hiddenVars.has(v.name)'),
  'l’ordre du corps de boucle a changé');

// 9. Le re-dessin après masquage ne doit pas avancer la référence des rouges.
ok('rouges : le re-dessin après masquage n’avance pas la référence (redraw)',
  /if \(!redraw\) previousVarValues = next;/.test(sim), 'garde `redraw` absente de renderDebugPause');

// 10. La colonne de l'œil décale le nom : les cellules fusionnées et la sélection
//     doivent en tenir compte (colSpan 3, nom en cellule 1).
ok('tableau : la colonne de l’œil est prise en compte (colSpan 3, nom en cellule 1)',
  (sim.match(/colSpan = 3/g) ?? []).length >= 2 && /row\.cells\[1\]/.test(sim),
  'colSpan ou index de cellule non mis à jour');

// 11. Menus refermés quand le panneau est réinitialisé (fin de simulation).
ok('menus : refermés à la réinitialisation du panneau',
  /function resetDebugVars\(\): void \{[\s\S]*?closeVarMenus\(\);/.test(sim), 'closeVarMenus absent de resetDebugVars');

// 12. Mémorisation : la webview poste, l'extension range, et renvoie la liste.
ok('mémorisation : la disquette poste « saveHiddenVars » et l’extension le traite',
  /type: 'saveHiddenVars'/.test(sim) && /case 'saveHiddenVars'/.test(panel),
  'message ou case absent');
ok('mémorisation : rangée par programme dans globalState (clé kablix.hiddenVars)',
  /HIDDEN_VARS_KEY = 'kablix\.hiddenVars'/.test(panel) && /globalState\.update\(HIDDEN_VARS_KEY/.test(panel),
  'persistance absente de panel.ts');
ok('mémorisation : la liste est renvoyée à la webview, qui l’applique',
  /type: 'hiddenVars'/.test(panel) && /case 'hiddenVars'/.test(sim) && /applySavedHiddenVars/.test(sim),
  'aller-retour incomplet');
// Renvoyée à l'ouverture ET à chaque changement de fichier de code (les
// variables appartiennent au programme, pas à la session).
ok('mémorisation : liste renvoyée au démarrage et à chaque changement de code',
  /setCodeFile\(uri: vscode\.Uri \| undefined\): void \{[\s\S]*?postHiddenVars\(\);/.test(panel)
  && (panel.match(/this\.postHiddenVars\(\)/g) ?? []).length >= 2,
  'postHiddenVars absent de setCodeFile ou du cas « ready »');

// 13. L'aide décrit la fonctionnalité À JOUR, dans les deux langues (l'œil et la
//     disquette ; plus de clic droit, qui n'existe plus).
//     La SECTION du masquage seule est examinée (jusqu'au titre suivant) : le
//     clic droit y serait un reste de la v185, alors qu'il est légitime dans la
//     section de la base d'affichage.
/** Contenu (minuscules) d'une section de guide, du titre au titre suivant. */
function guideSection(lang, heading) {
  const low = read(`docs/${lang}/USAGE.md`).toLowerCase();
  const start = low.indexOf(heading.toLowerCase());
  if (start < 0) return '';
  const next = low.indexOf('\n#', start + heading.length);
  return low.slice(start, next < 0 ? undefined : next);
}
for (const [lang, heading, needles, stale] of [
  ['fr', 'masquer des variables', ['👁', 'disquette'], 'clic droit'],
  ['en', 'hiding variables', ['👁', 'floppy'], 'right-click'],
]) {
  const doc = guideSection(lang, heading);
  ok(`aide ${lang.toUpperCase()} : masquage par l’œil et mémorisation documentés`,
    doc && needles.every((n) => doc.includes(n.toLowerCase())) && !doc.includes(stale),
    'section obsolète ou incomplète dans docs/' + lang + '/USAGE.md');
}

// --- v2026.7.189 : base d'affichage d'une variable (menu au clic droit) -------

// 14. Le formatage est vérifié sur de VRAIES valeurs : varbase.mts est un module
//     à part (sim.mts en fait 4,5 Mo de bundle, intestable) et sans dépendance.
const tmp = mkdtempSync(join(tmpdir(), 'kablix-varbase-'));
const outfile = join(tmp, 'varbase.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src', 'webview', 'varbase.mts')],
  outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const V = await import(pathToFileURL(outfile).href);
const NB = String.fromCharCode(0xa0); // séparateur attendu (insécable)
const cases = [
  // [valeur brute, base, affichage attendu]
  ['160', 'bin', `1010${NB}0000₂`],
  ['5', 'bin', '101₂'],
  ['-5', 'bin', '-101₂'],
  ['255', 'hex', 'FF₁₆'],
  ['65535', 'hex', 'FFFF₁₆'],
  ['1048575', 'hex', `F${NB}FFFF₁₆`],
  ['1234567', 'dec', `1${NB}234${NB}567₁₀`],
  ['42', 'dec', '42₁₀'],
  ['65', 'char', "'A'"],
  ['10', 'char', "'\\n'"],
  ['0', 'char', "'\\0'"],
  ['1', 'char', "'\\x01'"],
  // Non entiers : rien à convertir, la valeur reste lisible telle quelle.
  ['3.14', 'bin', '3.14'],
  ['true', 'hex', 'true'],
  ["'abc'", 'dec', "'abc'"],
  ['[1, 2, 3]', 'bin', '[1, 2, 3]'],
  // Grand entier Python : BigInt, aucune perte de précision.
  ['12345678901234567890', 'hex', `AB54${NB}A98C${NB}EB1F${NB}0AD2₁₆`],
];
const bad = cases.filter(([raw, base, want]) => V.formatVarValue(raw, base) !== want)
  .map(([raw, base, want]) => `${raw}/${base} → ${JSON.stringify(V.formatVarValue(raw, base))} ≠ ${JSON.stringify(want)}`);
ok(`base : les ${cases.length} formatages attendus sont exacts (indice + groupes)`,
  bad.length === 0, bad.join(' · '));
ok('base : séparateur INSÉCABLE (un nombre ne se coupe pas en fin de ligne)',
  V.formatVarValue('1234', 'dec').includes(NB) && !V.formatVarValue('1234', 'dec').includes(' '),
  JSON.stringify(V.formatVarValue('1234', 'dec')));

// 15. Le panneau utilise bien ce module (et pas un formatage recopié sur place).
ok('base : sim.mts formate les valeurs via varbase.mjs',
  /import \{ formatVarValue, type VarBase \} from '\.\/varbase\.mjs'/.test(sim)
  && /formatVarValue\(v\.value, base\)/.test(sim), 'import ou appel absent de sim.mts');

// 16. Menu : les 4 bases demandées, dans l'ordre, la courante cochée, et le
//     choix re-dessine le panneau (sinon il faudrait attendre le pas suivant).
const menu = sim.match(/const VAR_BASES[\s\S]{0,500}?\];/);
ok('menu : les 4 bases proposées dans l’ordre binaire, hexa, décimal, caractère',
  menu && /'bin'[\s\S]*'hex'[\s\S]*'dec'[\s\S]*'char'/.test(menu[0])
  && ["t('Binary')", "t('Hexadecimal')", "t('Decimal')", "t('Character')"].every((k) => menu[0].includes(k)),
  'liste des bases absente ou incomplète');
ok('menu : la base courante est cochée (✓)', /base === current \? '✓'/.test(sim));
ok('menu : le choix s’applique tout de suite (re-dessin du panneau)',
  /function setVarBase\([\s\S]{0,300}?refreshDebugVars\(\);/.test(sim), 'refreshDebugVars absent de setVarBase');
ok('menu : « décimal » ne laisse pas d’entrée (c’est l’état par défaut)',
  /if \(base === 'dec'\) varBases\.delete\(name\);/.test(sim));
ok('menu : le flottant est refermé au clic ailleurs / Échap',
  /closeVarMenus\(\): void \{[\s\S]{0,200}?debug__menu--float'\)\?\.remove\(\)/.test(sim),
  'closeVarMenus ne retire pas le menu flottant');

// 17. Style et traductions du menu.
const baseClasses = ['.debug__menu--float', '.debug__menu-head', '.debug__menu-cur'];
const noBaseCss = baseClasses.filter((c) => !css.includes(c));
ok('style : le menu flottant du clic droit est habillé', noBaseCss.length === 0,
  'manque : ' + noBaseCss.join(', '));
const baseKeys = ['Display of “{0}”', 'Right-click to change the display base',
  'Binary', 'Hexadecimal', 'Decimal', 'Character'];
const noBaseFr = baseKeys.filter((k) => !i18n.includes(`'${k}'`));
ok(`i18n : les ${baseKeys.length} libellés de la base sont traduits en français`,
  noBaseFr.length === 0, 'sans traduction : ' + noBaseFr.join(' · '));

// 18. Aide FR + EN : la base d'affichage est documentée (bases et indices).
for (const [lang, heading, needles] of [
  ['fr', "base d'affichage", ['clic droit', 'binaire', 'hexadécimal', 'caractère', '₂']],
  ['en', 'display base', ['right-click', 'binary', 'hexadecimal', 'character', '₂']],
]) {
  const doc = guideSection(lang, heading);
  const absent = needles.filter((n) => !doc.includes(n.toLowerCase()));
  ok(`aide ${lang.toUpperCase()} : base d’affichage documentée (menu, bases, indices)`,
    doc && absent.length === 0, 'manque : ' + absent.join(' · '));
}

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail
  ? `debugvars : ${fail} échec(s).`
  : `debugvars : ${checks.length} contrôles OK — masquage et base d'affichage des variables cohérents (HTML, style, i18n, persistance, formatage, aide).`);
process.exit(fail ? 1 : 0);
