// Intégrité de l'aide LOCALE des composants (v2026.7.180).
//
// Les fiches `docs/<lang>/composants/*.md` sont rendues hors-ligne par Kablix
// (src/markdown.ts → webview de partHelp.ts). Trois façons de casser l'aide sans
// s'en apercevoir : déplacer une image (les réorganisations v171 puis v175 l'ont
// déjà fait deux fois), l'exclure du vsix par une règle .vscodeignore trop
// large, ou écrire dans une fiche une syntaxe que le rendu maison ignore.
// Ce test couvre les trois, plus la couverture du catalogue et la parité FR/EN.
import esbuild from 'esbuild';
import { readdirSync, readFileSync, existsSync, mkdtempSync, statSync } from 'node:fs';
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

// --- 2 bis. Les GUIDES (aide ❔) ----------------------------------------------
// `src/guide.ts` sert docs/<lang>/USAGE.md avec le même rendu. Les guides ont une
// syntaxe plus riche que les fiches (sommaire à ancres accentuées, <img> bruts,
// captures hors du dossier docs/) : on les contrôle à part.
const guidesOf = (lang) => {
  const d = join(root, 'docs', lang);
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : [];
};
const guidesFr = guidesOf('fr');
const guidesEn = guidesOf('en');
ok(`guides : USAGE.md présent en FR et EN (noms de fichiers en anglais)`,
  guidesFr.includes('USAGE') && guidesEn.includes('USAGE') &&
  [...guidesFr, ...guidesEn].every((n) => /^[A-Za-z0-9_-]+$/.test(n)),
  `fr=${guidesFr.join(',')} en=${guidesEn.join(',')}`);

const guideIssues = [];
const anchorIssues = [];
for (const lang of ['fr', 'en']) {
  for (const name of guidesOf(lang)) {
    const p = join(root, 'docs', lang, `${name}.md`);
    const text = readFileSync(p, 'utf8');
    const ids = new Set();
    const html = renderMarkdown(text, {
      resolveAsset: (r) => 'asset:' + r,
      resolveDocLink: (r) => (/^(composants\/)?[A-Za-z0-9_-]+\.md$/.test(r.split('#')[0]) ? 'doc:' + r : ''),
    });
    for (const m of html.matchAll(/<h[1-6] id="([^"]*)"/g)) ids.add(m[1]);
    // Le sommaire doit tomber sur un titre réel (ancres accentuées re-slugifiées).
    for (const m of html.matchAll(/href="#([^"]*)"/g)) {
      if (!ids.has(m[1])) anchorIssues.push(`${lang}/${name} → #${m[1]}`);
    }
    const leftovers = [
      [/\]\(/, 'lien non rendu'],
      [/\*\*/, 'gras non rendu'],
      [/^\s*#{1,6}\s/m, 'titre non rendu'],
      [/^\s*\|/m, 'tableau non rendu'],
      [/&lt;img/, 'balise <img> échappée'],
      [/```/, 'bloc de code non rendu'],
    ].filter(([re]) => re.test(html)).map(([, why]) => why);
    if (leftovers.length) guideIssues.push(`${lang}/${name}: ${leftovers.join(', ')}`);
  }
}
ok(`guides : les ${guidesFr.length + guidesEn.length} guides passent le rendu maison`,
  guideIssues.length === 0, guideIssues.slice(0, 4).join(' · '));
ok('guides : chaque lien du sommaire tombe sur un titre', anchorIssues.length === 0,
  anchorIssues.slice(0, 5).join(' · '));

// L'ancienne aide HTML figée dans le code ne doit pas revenir.
ok('aide : plus de copie HTML figée (src/help.ts supprimé)', !existsSync(join(root, 'src', 'help.ts')));

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
  ...guidesFr.map((n) => `docs/fr/${n}.md`),
  ...guidesEn.map((n) => `docs/en/${n}.md`),
];
const dropped = mustShip.filter(excluded);
ok(`vsix : les ${mustShip.length} fiches, guides et images d'aide sont dans le paquet`, dropped.length === 0,
  dropped.slice(0, 5).join(' · '));

// Captures des guides : embarquées (lisibles hors-ligne) SAUF les lourdes, que
// `guide.ts` va chercher sur GitHub. Une capture légère exclue = trou hors-ligne.
// Depuis le passage des images en WebP (v2026.7.187) puis des démos en WebM
// (v2026.7.190), plus RIEN de lourd n'est référencé par les guides — les GIF ne
// servent plus qu'au README. Le motif reste pour ne pas piéger un futur GIF.
const HEAVY = /\.gif$/i;
const guideAssets = new Set();
for (const lang of ['fr', 'en']) {
  for (const name of guidesOf(lang)) {
    const p = join(root, 'docs', lang, `${name}.md`);
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/!\[[^\]]*\]\((<[^>]+>|[^)\s]+)\)/g)) {
      guideAssets.add([dirname(p), decodeURIComponent(m[1].replace(/^<|>$/g, '').trim())]);
    }
    // `<img>` (icône dans une phrase) et `<video>` (les démos animées, écrites
    // en HTML pour rester lisibles dans l'aperçu Markdown de VS Code).
    for (const m of text.matchAll(/<(?:img|video|source)\s+[^>]*?\bsrc\s*=\s*"([^"]*)"/gi)) {
      guideAssets.add([dirname(p), decodeURIComponent(m[1])]);
    }
  }
}
const lightMissing = [];
for (const [dir, r] of guideAssets) {
  if (/^https?:/i.test(r)) continue;
  const abs = resolve(dir, r);
  if (!existsSync(abs)) { lightMissing.push(`${rel(abs)} (absente du dépôt)`); continue; }
  if (!HEAVY.test(r) && excluded(rel(abs))) lightMissing.push(`${rel(abs)} (exclue du vsix)`);
}
ok(`vsix : les captures légères des guides (${guideAssets.size} refs) sont embarquées`,
  lightMissing.length === 0, lightMissing.slice(0, 5).join(' · '));
// Toutes les images de l'aide sont en WebP (v2026.7.187) : un PNG rescapé
// pèserait 10 à 50 fois plus lourd pour un rendu identique dans la webview.
const pngRefs = [...guideAssets].map(([, r]) => r).filter((r) => /\.png$/i.test(r));
const pngFiles = readdirSync(join(root, 'docs', 'img', 'composants')).filter((f) => /\.png$/i.test(f));
ok('images : plus aucun PNG dans l’aide (guides et fiches en WebP)',
  pngRefs.length === 0 && pngFiles.length === 0,
  [...pngRefs, ...pngFiles].slice(0, 5).join(' · '));
// Les deux seules images du manifeste restent en PNG : l'icône du marketplace
// (format imposé par la publication) et celle de la barre d'activité (chargée
// par le workbench, pas par une webview).
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
ok('images : les icônes du manifeste restent en PNG (marketplace et barre d’activité)',
  manifest.icon === 'media/icon.png'
  && manifest.contributes.viewsContainers.activitybar[0].icon === 'media/activity-icon.png'
  && existsSync(join(root, 'media', 'icon.png')) && existsSync(join(root, 'media', 'activity-icon.png')),
  'icône du manifeste absente ou convertie');

// --- 6. Démos animées : MP4 H.264 embarqué (v2026.7.193) ---------------------
// 12,2 Mo de GIF servis depuis GitHub = aucune démo hors connexion. Le WebM les
// a remplacés en v190… sans jamais s'afficher : l'Electron de VS Code n'embarque
// PAS le démuxeur Matroska, donc aucun .webm n'y est lisible, quel que soit son
// codec — et `canPlayType` répond quand même « probably », d'où trois versions
// perdues à chercher ailleurs. Le MP4, lui, a son démuxeur, et H.264 passe par
// le décodeur de la plateforme.
const DEMOS = ['demarrer', 'dessiner', 'simuler'];
const guideRefs = [...guideAssets].map(([, r]) => r);
const badRefs = guideRefs.filter((r) => /\.(gif|webm|mkv)$/i.test(r));
const missingDemo = DEMOS.filter((d) => !guideRefs.includes(`../../media/${d}.mp4`));
ok('démos : les guides montrent les 3 MP4, aucun WebM ni GIF (indémuxables ici)',
  badRefs.length === 0 && missingDemo.length === 0,
  [...badRefs, ...missingDemo.map((d) => `${d}.mp4 non référencée`)].join(' · '));

const demoIssues = [];
for (const d of DEMOS) {
  const p = join(root, 'media', `${d}.mp4`);
  if (!existsSync(p)) { demoIssues.push(`${d}.mp4 absente`); continue; }
  const head = readFileSync(p).subarray(0, 4096).toString('latin1');
  // `ftyp` = conteneur ISO-BMFF, `avc1` = piste H.264 : le seul couple dont la
  // lecture est acquise dans une webview de VS Code.
  if (!head.includes('ftyp')) demoIssues.push(`${d}.mp4 : pas un conteneur MP4`);
  if (!head.includes('avc1')) demoIssues.push(`${d}.mp4 : pas du H.264 (avc1)`);
  // `moov` avant `mdat` (faststart) : sinon le lecteur attend tout le fichier.
  const moov = head.indexOf('moov');
  const mdat = head.indexOf('mdat');
  if (moov === -1 || (mdat !== -1 && mdat < moov)) demoIssues.push(`${d}.mp4 : moov pas en tête (faststart)`);
  const mo = statSync(p).size / 1048576;
  if (mo > 1.5) demoIssues.push(`${d}.mp4 : ${mo.toFixed(2)} Mo`);
  if (excluded(`media/${d}.mp4`)) demoIssues.push(`${d}.mp4 exclue du vsix`);
}
ok('démos : 3 MP4 H.264 légers, faststart et embarqués (animées hors-ligne)',
  demoIssues.length === 0, demoIssues.join(' · '));

// Un .webm resté dans media/ serait embarqué pour rien : illisible côté VS Code.
const strays = DEMOS.filter((d) => existsSync(join(root, 'media', `${d}.webm`)));
ok('démos : plus aucun WebM dans media/ (l’Electron de VS Code ne les démuxe pas)',
  strays.length === 0, strays.map((d) => `${d}.webm`).join(' · '));

// Les démos sont écrites en `<video>` HTML dans les guides, PAS en `![…](…)` :
// une image n'affiche pas une vidéo, et l'aperçu Markdown de VS Code — celui dont
// Frank se sert pour relire ses guides — ne rend que la balise vidéo.
const demoTags = [];
for (const lang of ['fr', 'en']) {
  const t = readFileSync(join(root, 'docs', lang, 'USAGE.md'), 'utf8');
  for (const d of DEMOS) {
    const tag = new RegExp(`<video\\s[^>]*src="\\.\\./\\.\\./media/${d}\\.mp4"[^>]*>`, 'i').exec(t)?.[0];
    if (!tag) { demoTags.push(`${lang}/${d} : pas de <video src>`); continue; }
    for (const a of ['controls', 'autoplay', 'loop', 'muted']) {
      if (!new RegExp(`\\b${a}\\b`).test(tag)) demoTags.push(`${lang}/${d} : ${a} manquant`);
    }
  }
  if (/!\[[^\]]*\]\([^)]*\.(?:mp4|webm)\)/i.test(t)) demoTags.push(`${lang} : démo encore écrite en ![…]()`);
}
ok('guides : les 3 démos sont des <video> HTML (lisibles dans l’aperçu Markdown)',
  demoTags.length === 0, demoTags.join(' · '));

// Le rendu maison ne doit ni échapper cette balise ni la laisser sur un `src`
// unique : le `src` est remplacé par une <source> PAR VOIE d'accès, sinon le
// repli ne peut pas jouer. Type MIME déclaré : sans lui le lecteur reste inerte
// quand la réponse n'annonce pas `video/mp4` (constaté en v190).
const demoHtml = renderMarkdown('<video src="../../media/simuler.mp4" controls autoplay loop muted></video>', {
  resolveAsset: (r) => 'asset:' + r,
  resolveDocLink: () => '',
  resolveMedia: (r) => ['webview:' + r, 'data:video/mp4;base64,AAA'],
});
ok('rendu : la démo garde sa <video> et reçoit ses deux sources (repli possible)',
  /<figure><video [^>]*>/.test(demoHtml)
  && /<video(?![^>]*\bsrc=)[^>]*>/.test(demoHtml)
  && /<source src="webview:\.\.\/\.\.\/media\/simuler\.mp4" type="video\/mp4" \/><source src="data:video\/mp4;base64,AAA" type="video\/mp4" \/><\/video>/.test(demoHtml)
  && /\bautoplay\b/.test(demoHtml) && /\bloop\b/.test(demoHtml) && /\bmuted\b/.test(demoHtml)
  && !/&lt;video/.test(demoHtml) && !/<img/.test(demoHtml),
  demoHtml.slice(0, 200));

// La syntaxe Markdown reste admise (une fiche peut encore l'employer).
const demoMd = renderMarkdown('![Démo](../../media/simuler.mp4)', {
  resolveAsset: (r) => 'asset:' + r,
  resolveDocLink: () => '',
});
ok('rendu : une image .mp4 sort quand même en <video>, pas en <img>',
  /<video[^>]*><source src="asset:\.\.\/\.\.\/media\/simuler\.mp4" type="video\/mp4"/.test(demoMd)
  && !/<img/.test(demoMd), demoMd.slice(0, 160));

// Sans `media-src`, `default-src 'none'` bloque la vidéo sans un mot d'erreur.
// Le guide doit en plus accepter `data:` : c'est ainsi qu'il sert ses démos.
const guideSrc = readFileSync(join(root, 'src', 'guide.ts'), 'utf8');
const partSrc = readFileSync(join(root, 'src', 'partHelp.ts'), 'utf8');
ok('webviews : media-src autorisé dans la CSP de l’aide (guides et fiches)',
  /media-src \$\{webview\.cspSource\}[^`]*data:/.test(guideSrc)
  && /media-src \$\{webview\.cspSource\}/.test(partSrc),
  `guide=${/media-src/.test(guideSrc)} fiches=${/media-src/.test(partSrc)}`);

// Deux voies d'accès par démo, la webview d'abord et le `data:` en repli : le
// lecteur essaie les <source> dans l'ordre, donc une voie muette (v190) ne
// suffit plus à faire un lecteur inerte (v2026.7.192).
ok('guide : chaque démo reçoit l’URI de webview PUIS le data: de repli',
  /resolveMedia/.test(guideSrc)
  && /asWebviewUri\(uri\)\.toString\(\), await dataUri\(uri\)/.test(guideSrc)
  && /data:\$\{mime\};base64,/.test(guideSrc)
  && /<\(\?:video\|source\)/.test(guideSrc),
  'resolveMedia absent ou ne fournit pas les deux sources');

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
