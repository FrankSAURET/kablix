// Masquage des variables du panneau de débogage (v2026.7.182, refondu en v186) :
// clic sur le 👁 d'une variable → elle quitte le panneau, clic sur le titre
// « 🔍 Variables ▾ » → liste des masquées pour les réafficher. Depuis la
// v2026.7.194, masquages ET bases d'affichage sont mémorisés DANS LE PROJET
// (manifeste du .projix) : plus de disquette, plus de globalState.
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

// 2. Plus de disquette (v194) : la mémorisation suit l'enregistrement du projet.
//    Le bouton et son écouteur doivent avoir disparu ENSEMBLE, sinon sim.mts
//    planterait au chargement sur un getElementById nul.
ok('titre : plus de bouton disquette (mémorisation dans le .projix)',
  !html.includes('id="debug-save-hidden"') && !sim.includes('debugSaveHiddenBtn'),
  'reste de la disquette dans webview-html.ts ou sim.mts');

// 3. Classes CSS employées par le code (œil, cellules, menu, sélection, titre).
const classes = [
  '.debug__title', '.debug__titlebar', '.debug__eye', '.debug__eyecell',
  '.debug__namecell', '.debug__valcell',
  '.debug__menu', '.debug__menu-empty', '.debug__row--sel',
];
const noCss = classes.filter((c) => !css.includes(c));
ok(`style : les ${classes.length} classes du panneau sont habillées`, noCss.length === 0,
  'manque : ' + noCss.join(', '));

// 4. Traductions webview : toute clé t('…') du bloc de masquage a son entrée française.
const keys = [
  'Show the hidden variables',
  'Click to hide',
  'Show this variable again',
  'Show all again',
  'No hidden variable — click the 👁 of a variable to hide it.',
  'All variables are hidden (click “Variables” to show them again).',
];
const untranslated = keys.filter((k) => !i18n.includes(`'${k}'`));
ok(`i18n : les ${keys.length} libellés du masquage sont traduits en français`,
  untranslated.length === 0, 'sans traduction : ' + untranslated.join(' · '));

// 5. Les info-bulles du HTML passent par l10n de l'EXTENSION (autre catalogue).
const l10nKeys = ['Show the hidden variables'];
const noL10n = l10nKeys.filter((k) => !l10nFr.includes(`"${k}"`));
ok('i18n : les info-bulles du titre sont traduites côté extension (bundle.l10n.fr)',
  noL10n.length === 0, 'sans traduction : ' + noL10n.join(' · '));

// 6. Ni le clic gauche ni le clic droit ne MASQUENT (c'est l'œil depuis la v186) :
//    les deux ouvrent le menu des bases (clic gauche = geste principal, v194).
const openMenu = sim.match(/const openMenu = \(ev: MouseEvent\) => \{[\s\S]{0,300}?\};/);
ok('clic : le menu des bases s’ouvre sans rien masquer',
  openMenu && /openVarBaseMenu\(v\.name/.test(openMenu[0])
  && /selectVar\(v\.name\)/.test(openMenu[0]) && !/hideVar|hiddenVars\.add/.test(openMenu[0]),
  'ouverture du menu absente ou remise à masquer');
ok('clic : le clic GAUCHE ouvre le menu (et le clic droit reste accepté)',
  /row\.addEventListener\('click', openMenu\)/.test(sim)
  && /row\.addEventListener\('contextmenu', openMenu\)/.test(sim),
  'écouteur click ou contextmenu absent de la ligne');

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

// 12. Mémorisation DANS LE PROJET (v194) : la webview pousse masquages + bases à
//     chaque changement, l'extension les grave dans le manifeste du .projix et
//     les renvoie à l'ouverture. Un maillon absent = réglages perdus en silence.
const projix = read('src/projix.ts');
ok('mémorisation : le manifeste .projix porte les réglages (ProjixDebugVars)',
  /export interface ProjixDebugVars/.test(projix) && /debugVars\?: ProjixDebugVars;/.test(projix),
  'champ absent du manifeste (src/projix.ts)');
ok('mémorisation : la webview pousse « debugVars » (masquages + bases) et l’extension le traite',
  /type: 'debugVars',[\s\S]{0,120}?hidden: \[\.\.\.hiddenVars\][\s\S]{0,120}?bases: Object\.fromEntries\(varBases\)/.test(sim)
  && /case 'debugVars'/.test(panel) && /setDebugVars\(msg\.hidden, msg\.bases\)/.test(panel),
  'message ou case absent');
// Poussé à CHAQUE geste : masquer, réafficher (une ou toutes), changer de base.
const pushes = (sim.match(/postDebugVars\(\);/g) ?? []).length;
ok('mémorisation : les 4 gestes poussent l’état (masquer, réafficher, tout réafficher, base)',
  pushes >= 4, `${pushes} appel(s) à postDebugVars()`);
ok('mémorisation : les réglages sont écrits dans le manifeste à l’enregistrement',
  /manifest\.debugVars = debugVars;/.test(panel)
  && /emptyDebugVars\(debugVars\)/.test(panel), 'écriture absente de buildProjixBytes');
ok('mémorisation : rien d’écrit quand aucun réglage n’est posé (pas d’entrée vide)',
  /emptyDebugVars\(d: ProjixDebugVars\): boolean \{[\s\S]{0,200}?!d\.hidden\?\.length && Object\.keys\(d\.bases \?\? \{\}\)\.length === 0/.test(panel),
  'garde emptyDebugVars absente');
ok('mémorisation : relus à l’ouverture du .projix et appliqués par la webview',
  /setDebugVars\(project\.manifest\.debugVars\?\.hidden, project\.manifest\.debugVars\?\.bases\)/.test(panel)
  && /type: 'debugVars'/.test(panel) && /case 'debugVars'/.test(sim) && /applySavedDebugVars/.test(sim),
  'aller-retour incomplet');
// Le repli hérité (≤ v193, globalState par programme) est LU, jamais réécrit :
// une mise à jour ne doit pas faire réapparaître des variables masquées.
ok('mémorisation : masquages hérités (globalState) encore lus, plus jamais écrits',
  /HIDDEN_VARS_KEY = 'kablix\.hiddenVars'/.test(panel)
  && /globalState\.get<Record<string, string\[\]>>\(HIDDEN_VARS_KEY/.test(panel)
  && !/globalState\.update\(HIDDEN_VARS_KEY/.test(panel),
  'repli absent, ou écriture dans globalState toujours présente');
// Renvoyés à l'ouverture ET à chaque changement de fichier de code (le repli
// hérité est rangé par programme).
ok('mémorisation : réglages renvoyés au démarrage et à chaque changement de code',
  /setCodeFile\(uri: vscode\.Uri \| undefined\): void \{[\s\S]*?postDebugVars\(\);/.test(panel)
  && (panel.match(/this\.postDebugVars\(\)/g) ?? []).length >= 3,
  'postDebugVars absent de setCodeFile, du cas « ready » ou de l’ouverture de projet');
// v203 : ces réglages font partie du FICHIER, donc un geste de l'utilisateur le
// marque « à enregistrer » (point ● natif) — sinon le réglage part en fumée à la
// fermeture de l'onglet sans que rien ne l'annonce.
ok('modifié : un geste (masquer, changer de base) marque le projet à enregistrer',
  /function postDebugVars\(dirty = true\)/.test(sim) && /dirty,/.test(sim)
  && /case 'debugVars':[\s\S]{0,700}?if \(msg\.dirty === true\) this\.markProjectDirty\(\);/.test(panel),
  'drapeau dirty absent du message ou non traité par panel.ts');
ok('modifié : le point ● natif est bien posé (edit empilé dans le CustomEditor)',
  /private markProjectDirty\(\): void \{[\s\S]{0,300}?this\.panel\.onDocEdit\?\.\(\);/.test(panel),
  'markProjectDirty n’empile pas d’edit');
// …mais les réglages RELUS à l'ouverture n'en salissent aucun : ils ne repassent
// pas par postDebugVars (sinon un projet propre s'ouvrirait déjà « modifié »).
const applied = sim.match(/function applySavedDebugVars\([\s\S]*?\n\}/);
ok('modifié : les réglages relus à l’ouverture ne salissent pas le projet',
  applied && !/postDebugVars/.test(applied[0]), 'applySavedDebugVars reposte les réglages');

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
  ['fr', 'masquer des variables', ['👁', '.projix'], 'disquette'],
  ['en', 'hiding variables', ['👁', '.projix'], 'floppy'],
]) {
  const doc = guideSection(lang, heading);
  ok(`aide ${lang.toUpperCase()} : masquage par l’œil et mémorisation dans le projet documentés`,
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
const NB = String.fromCharCode(0x202f); // séparateur attendu : espace FINE insécable (v203)
const cases = [
  // [valeur brute, base, affichage attendu] — préfixes 0b/0x, rien en décimal (v194),
  // fine entre le préfixe et les chiffres comme entre les groupes (v203).
  ['160', 'bin', `0b${NB}1010${NB}0000`],
  ['5', 'bin', `0b${NB}101`],
  ['-5', 'bin', `-0b${NB}101`],
  ['255', 'hex', `0x${NB}FF`],
  ['65535', 'hex', `0x${NB}FFFF`],
  ['1048575', 'hex', `0x${NB}F${NB}FFFF`],
  ['1234567', 'dec', `1${NB}234${NB}567`],
  ['42', 'dec', '42'],
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
  ['12345678901234567890', 'hex', `0x${NB}AB54${NB}A98C${NB}EB1F${NB}0AD2`],
];
const bad = cases.filter(([raw, base, want]) => V.formatVarValue(raw, base) !== want)
  .map(([raw, base, want]) => `${raw}/${base} → ${JSON.stringify(V.formatVarValue(raw, base))} ≠ ${JSON.stringify(want)}`);
ok(`base : les ${cases.length} formatages attendus sont exacts (préfixe + groupes)`,
  bad.length === 0, bad.join(' · '));
// Les indices de la v189 (₂ ₁₆ ₁₀) ne doivent PLUS sortir : ils ne se retapent
// pas dans un programme, contrairement aux préfixes 0b / 0x.
const subs = ['bin', 'hex', 'dec', 'char'].filter((b) => /[₂₆₀₁]/.test(V.formatVarValue('160', b)));
ok('base : plus aucun indice de base (₂ ₁₆ ₁₀) — préfixes seuls', subs.length === 0,
  'indice encore produit en : ' + subs.join(', '));
ok('base : séparateur INSÉCABLE (un nombre ne se coupe pas en fin de ligne)',
  V.formatVarValue('1234', 'dec').includes(NB) && !V.formatVarValue('1234', 'dec').includes(' '),
  JSON.stringify(V.formatVarValue('1234', 'dec')));
// v203 : la fine (U+202F) remplace l'insécable normale (U+00A0), trop large entre
// deux groupes de chiffres — et elle détache aussi le préfixe de la valeur.
const wide = ['bin', 'hex', 'dec'].filter((b) => V.formatVarValue('1234567', b).includes(String.fromCharCode(0xa0)));
ok('base : séparateur FINE (U+202F), plus l’insécable large (U+00A0)', wide.length === 0,
  'insécable large encore produite en : ' + wide.join(', '));
const gap = ['bin', 'hex'].filter((b) => !new RegExp(`^0[bx]${NB}`).test(V.formatVarValue('255', b)));
ok('base : une fine sépare le préfixe 0b / 0x des chiffres', gap.length === 0,
  'préfixe encore collé en : ' + gap.join(', '));
ok('base : le décimal n’a ni préfixe ni fine en tête',
  /^1/.test(V.formatVarValue('1234', 'dec')), JSON.stringify(V.formatVarValue('1234', 'dec')));

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
ok('style : le menu flottant du clic est habillé', noBaseCss.length === 0,
  'manque : ' + noBaseCss.join(', '));
const baseKeys = ['Display of “{0}”', 'Click to change the display base',
  'Binary', 'Hexadecimal', 'Decimal', 'Character'];
const noBaseFr = baseKeys.filter((k) => !i18n.includes(`'${k}'`));
ok(`i18n : les ${baseKeys.length} libellés de la base sont traduits en français`,
  noBaseFr.length === 0, 'sans traduction : ' + noBaseFr.join(' · '));

// 18. Aide FR + EN : la base d'affichage est documentée (bases, préfixes, clic).
//     Les indices de la v189 (₂) ne doivent plus y figurer.
for (const [lang, heading, needles] of [
  ['fr', "base d'affichage", ['0b 1010', '0x a0', 'binaire', 'hexadécimal', 'caractère', 'projet',
    'espace fine', 'à enregistrer']],
  ['en', 'display base', ['0b 1010', '0x a0', 'binary', 'hexadecimal', 'character', 'project',
    'no-break space', 'to be saved']],
]) {
  const doc = guideSection(lang, heading);
  const absent = needles.filter((n) => !doc.includes(n.toLowerCase()));
  ok(`aide ${lang.toUpperCase()} : base d’affichage documentée (clic, préfixes, mémorisation)`,
    doc && absent.length === 0 && !doc.includes('₂'),
    absent.length ? 'manque : ' + absent.join(' · ') : 'indice ₂ encore présent');
}

// --- v2026.7.194 : colonnes du tableau et cellules cliquables ----------------

// 19. Colonne du NOM au plus juste et sur une seule ligne, valeur à gauche : sans
//     `width: 1%` la colonne prend la moitié du panneau et la valeur part au loin.
const nameCss = css.match(/\.debug__vars td\.debug__namecell \{[^}]*\}/);
ok('tableau : colonne du nom au plus juste, sur une seule ligne',
  nameCss && /width:\s*1%/.test(nameCss[0]) && /white-space:\s*nowrap/.test(nameCss[0]),
  'width: 1% ou white-space: nowrap absent de .debug__namecell');
const valCss = css.match(/\.debug__vars td\.debug__valcell \{[^}]*\}/);
ok('tableau : colonne de la valeur alignée à gauche',
  valCss && /text-align:\s*left/.test(valCss[0]), 'text-align: left absent de .debug__valcell');
ok('tableau : nom et valeur portent leur classe (cellules 1 et 2)',
  /nameCell\.className = 'debug__namecell'/.test(sim)
  && /valueCell\.className = 'debug__valcell'/.test(sim), 'classe absente de renderDebugPause');

// 20. Curseur en main sur le nom ET la valeur : c'est ce qui montre que la ligne
//     est cliquable (le menu des bases s'y ouvre).
ok('curseur : main au survol du nom et de la valeur (cliquables)',
  nameCss && /cursor:\s*pointer/.test(nameCss[0]) && valCss && /cursor:\s*pointer/.test(valCss[0]),
  'cursor: pointer absent d’une des deux cellules');
ok('bulle : l’invitation au clic est sur le nom ET sur la valeur',
  /nameCell\.title = valueCell\.textContent === v\.value \? hint/.test(sim)
  && /valueCell\.title = nameCell\.title;/.test(sim), 'bulle absente d’une des deux cellules');

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail
  ? `debugvars : ${fail} échec(s).`
  : `debugvars : ${checks.length} contrôles OK — masquage et base d'affichage des variables cohérents (HTML, style, i18n, persistance, formatage, aide).`);
process.exit(fail ? 1 : 0);
