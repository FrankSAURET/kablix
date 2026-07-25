// Intégrité de l'aide LOCALE des composants (v2026.7.180).
//
// Les fiches `docs/<lang>/composants/*.md` sont rendues hors-ligne par Kablix
// (src/markdown.ts → webview de partHelp.ts). Trois façons de casser l'aide sans
// s'en apercevoir : déplacer une image (les réorganisations v171 puis v175 l'ont
// déjà fait deux fois), l'exclure du vsix par une règle .vscodeignore trop
// large, ou écrire dans une fiche une syntaxe que le rendu maison ignore.
// Ce test couvre les trois, plus la couverture du catalogue et la parité FR/EN.
import esbuild from 'esbuild';
import { readdirSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const checks = [];
const ok = (name, cond, detail = '') => { checks.push({ name, ok: !!cond, detail: String(detail) }); };
const rel = (p) => relative(root, p).replace(/\\/g, '/');

const tmp = mkdtempSync(join(tmpdir(), 'kablix-docs-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({ entryPoints: [join(root, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const { renderMarkdown, markdownTitle } = await load('src/markdown.ts', 'markdown.mjs');
const { CATALOG } = await load('src/webview/diagram/catalog.mts', 'catalog.mjs');

// --- Inventaire ---------------------------------------------------------------
const mds = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) mds.push(p);
  }
};
walk(join(root, 'docs'));
const sheetsOf = (lang) => {
  const d = join(root, 'docs', lang, 'composants');
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : [];
};
const fr = sheetsOf('fr');
const en = sheetsOf('en');

// --- 1. Tous les liens relatifs résolvent -------------------------------------
const broken = [];
let links = 0;
for (const md of mds) {
  for (const m of readFileSync(md, 'utf8').matchAll(/\]\((<[^>]+>|[^)\s]+)\)/g)) {
    let target = m[1].replace(/^<|>$/g, '');
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0]);
    if (!target) continue;
    links++;
    if (!existsSync(resolve(dirname(md), target))) broken.push(`${rel(md)} → ${target}`);
  }
}
ok(`docs : les ${links} liens relatifs résolvent (images comprises)`, broken.length === 0, broken.join(' · '));

// --- 2. Rendu maison de CHAQUE fiche ------------------------------------------
// On rejoue exactement ce que fait partHelp.ts : images résolues relativement au
// dossier de la fiche, liens .md transformés en navigation interne.
const renderIssues = [];
const imgIssues = [];
for (const lang of ['fr', 'en']) {
  for (const name of sheetsOf(lang)) {
    const p = join(root, 'docs', lang, 'composants', `${name}.md`);
    const text = readFileSync(p, 'utf8');
    const seen = [];
    const html = renderMarkdown(text, {
      resolveAsset: (r) => { seen.push(resolve(dirname(p), r)); return 'asset:' + r; },
      resolveDocLink: (r) => 'doc:' + r,
    });
    // Aucune syntaxe Markdown ne doit survivre au rendu.
    const leftovers = [
      [/\]\(/, 'lien non rendu'],
      [/\*\*/, 'gras non rendu'],
      [/^\s*#{1,6}\s/m, 'titre non rendu'],
      [/^\s*\|/m, 'tableau non rendu'],
      [/^\s*[-*+]\s/m, 'puce non rendue'],
      [/```/, 'bloc de code non rendu'],
    ].filter(([re]) => re.test(html)).map(([, why]) => why);
    if (leftovers.length) renderIssues.push(`${lang}/${name}: ${leftovers.join(', ')}`);
    if (!markdownTitle(text)) renderIssues.push(`${lang}/${name}: pas de titre H1`);
    // Chaque image rendue doit exister sur le disque (et il en faut au moins une).
    if (!seen.length) imgIssues.push(`${lang}/${name}: aucune image`);
    for (const f of seen) if (!existsSync(f)) imgIssues.push(`${lang}/${name} → ${rel(f)}`);
  }
}
ok(`rendu : les ${fr.length + en.length} fiches passent le rendu maison sans reste de Markdown`,
  renderIssues.length === 0, renderIssues.slice(0, 4).join(' · '));
ok('rendu : chaque fiche affiche au moins une image, toutes présentes',
  imgIssues.length === 0, imgIssues.slice(0, 4).join(' · '));

// --- 3. Parité FR/EN ----------------------------------------------------------
const missingEn = fr.filter((n) => !en.includes(n));
const orphanEn = en.filter((n) => !fr.includes(n));
ok(`fiches : parité FR/EN (${fr.length}/${en.length})`, missingEn.length === 0 && orphanEn.length === 0,
  `EN manquantes: ${missingEn.join(',')} · FR manquantes: ${orphanEn.join(',')}`);

// --- 4. Une fiche par type du catalogue ---------------------------------------
// partHelp.ts ouvre `docs/<lang>/composants/<def.type>.md` : un type sans fiche
// affiche « Pas encore d'aide pour ce composant ».
const types = [...new Set(CATALOG.map((d) => d.type))];
const noSheet = types.filter((t) => !fr.includes(t));
ok(`catalogue : chaque type a sa fiche FR (${types.length} types)`, noSheet.length === 0, noSheet.join(','));
// Le filtre de panel.ts (`/^[a-z0-9-]+$/i`) rejette tout type exotique.
const badType = types.filter((t) => !/^[a-z0-9-]+$/i.test(t));
ok('catalogue : aucun type rejeté par le filtre de panel.ts', badType.length === 0, badType.join(','));

// --- 5. Fiches et images bien EMBARQUÉES dans le vsix -------------------------
// .vscodeignore : motifs glob, `!` = ré-inclusion. On rejoue les règles sur les
// chemins d'aide pour attraper une exclusion trop large (ex. `docs/**`).
const rules = readFileSync(join(root, '.vscodeignore'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => ({ negate: l.startsWith('!'), pat: l.replace(/^!/, '') }));
const toRe = (pat) => {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '*') {
      if (pat[i + 1] === '*') {
        if (pat[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/, '\\$&');
  }
  return new RegExp('^' + re + '(?:/.*)?$');
};
const excluded = (path) => {
  let out = false;
  for (const r of rules) if (toRe(r.pat).test(path)) out = !r.negate;
  return out;
};
const mustShip = [
  ...fr.map((n) => `docs/fr/composants/${n}.md`),
  ...en.map((n) => `docs/en/composants/${n}.md`),
  ...readdirSync(join(root, 'docs', 'img', 'composants')).map((f) => `docs/img/composants/${f}`),
];
const dropped = mustShip.filter(excluded);
ok(`vsix : les ${mustShip.length} fiches + images d'aide sont dans le paquet`, dropped.length === 0,
  dropped.slice(0, 5).join(' · '));
// Garde-fou du matcher : des règles connues doivent bien s'appliquer.
ok('vsix : matcher .vscodeignore cohérent (src/ exclu, dist/webview.js ré-inclus)',
  excluded('src/panel.ts') && excluded('dist/pinout/uno.svg') === false && !excluded('dist/webview.js'),
  `src=${excluded('src/panel.ts')} webview=${excluded('dist/webview.js')}`);

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `docs : ${fail} échec(s).` : `docs : ${checks.length} contrôles OK — aide locale complète, illustrée et embarquée.`);
process.exit(fail ? 1 : 0);
