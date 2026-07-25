// Masquage des variables du panneau de débogage (v2026.7.182) : clic droit sur
// une variable → « Masquer », clic sur le titre « 🔍 Variables ▾ » → liste des
// masquées pour les réafficher.
//
// Ce banc contrôle la COHÉRENCE des trois fichiers qui doivent bouger ensemble :
// le squelette HTML (webview-html.ts), la feuille de style et le catalogue de
// traductions. Un id absent du HTML ferait planter sim.mts DÈS SON CHARGEMENT
// (`getElementById(...) as HTMLButtonElement` puis `addEventListener`) : la
// webview entière resterait blanche. Une clé anglaise sans entrée FR passerait
// inaperçue en développement (t() retombe sur la clé).
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

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail });

// 1. Les éléments interrogés par sim.mts au chargement existent dans le HTML.
const ids = [...sim.matchAll(/getElementById\('(debug-[a-z-]+)'\)/g)].map((m) => m[1]);
const missing = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));
ok(`panneau : les ${new Set(ids).size} id « debug-* » de sim.mts sont dans le HTML`,
  missing.length === 0, 'absents : ' + missing.join(', '));

// 2. Classes CSS employées par le code (menus, sélection, titre cliquable).
const classes = ['.debug__title', '.debug__menu', '.debug__menu--float', '.debug__menu-empty', '.debug__row--sel'];
const noCss = classes.filter((c) => !css.includes(c));
ok('style : menus, titre et ligne sélectionnée sont habillés', noCss.length === 0, 'manque : ' + noCss.join(', '));

// 3. Traductions : toute clé t('…') du bloc de masquage a son entrée française.
const keys = [
  'Show the hidden variables',
  'Hide “{0}”',
  'Show this variable again',
  'Show all again',
  'No hidden variable — right-click a variable to hide it.',
  'All variables are hidden (click “Variables” to show them again).',
];
const untranslated = keys.filter((k) => !i18n.includes(`'${k}'`));
ok(`i18n : les ${keys.length} libellés du masquage sont traduits en français`,
  untranslated.length === 0, 'sans traduction : ' + untranslated.join(' · '));

// 4. Une variable masquée reste SUIVIE : son `next.set` doit précéder le `continue`,
//    sinon elle serait vue comme « nouvelle » (donc jamais en rouge) au retour.
const loop = sim.match(/for \(const v of state\.variables\) \{[\s\S]*?\n  \}/);
const body = loop ? loop[0] : '';
ok('rouges : une variable masquée continue d’être suivie (next.set avant le saut)',
  body.indexOf('next.set(v.name') >= 0 && body.indexOf('next.set(v.name') < body.indexOf('hiddenVars.has(v.name)'),
  'l’ordre du corps de boucle a changé');

// 5. Le re-dessin après masquage ne doit pas avancer la référence des rouges.
ok('rouges : le re-dessin après masquage n’avance pas la référence (redraw)',
  /if \(!redraw\) previousVarValues = next;/.test(sim), 'garde `redraw` absente de renderDebugPause');

// 6. Menus refermés quand le panneau est réinitialisé (fin de simulation).
ok('menus : refermés à la réinitialisation du panneau',
  /function resetDebugVars\(\): void \{[\s\S]*?closeVarMenus\(\);/.test(sim), 'closeVarMenus absent de resetDebugVars');

// 7. L'aide décrit la fonctionnalité, dans les deux langues.
for (const [lang, needle] of [['fr', 'clic droit'], ['en', 'right-click']]) {
  const guide = read(`docs/${lang}/USAGE.md`).toLowerCase();
  ok(`aide ${lang.toUpperCase()} : le masquage des variables est documenté`,
    guide.includes(needle) && /masqu|hidden/.test(guide), 'section absente de docs/' + lang + '/USAGE.md');
}

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `debugvars : ${fail} échec(s).` : `debugvars : ${checks.length} contrôles OK — masquage des variables cohérent (HTML, style, i18n, aide).`);
process.exit(fail ? 1 : 0);
