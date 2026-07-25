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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// 6. Plus de clic droit : l'œil a remplacé le menu contextuel (demande v186).
ok('masquage : plus aucun menu contextuel (clic droit) dans le panneau',
  !/contextmenu/.test(sim) && !/openVarContextMenu/.test(sim),
  'reste du clic droit dans sim.mts');

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
for (const [lang, needles, stale] of [
  ['fr', ['👁', 'disquette'], 'clic droit'],
  ['en', ['👁', 'floppy'], 'right-click'],
]) {
  const guide = read(`docs/${lang}/USAGE.md`);
  const low = guide.toLowerCase();
  const section = low.slice(low.indexOf(lang === 'fr' ? 'masquer des variables' : 'hiding variables'));
  const doc = section.slice(0, 2000);
  ok(`aide ${lang.toUpperCase()} : masquage par l’œil et mémorisation documentés`,
    needles.every((n) => doc.includes(n.toLowerCase())) && !doc.includes(stale),
    'section obsolète ou incomplète dans docs/' + lang + '/USAGE.md');
}

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `debugvars : ${fail} échec(s).` : `debugvars : ${checks.length} contrôles OK — masquage des variables cohérent (HTML, style, i18n, persistance, aide).`);
process.exit(fail ? 1 : 0);
