// La navigation du panneau d'aide tient-elle debout ?
//
// Le guide fait 700 lignes en une page : v2026.9.4.79 lui ajoute un sommaire
// latéral collant généré depuis les titres (le sommaire écrit à la main en
// oubliait 8), un champ de recherche, et des sections repliables. Rien de tout
// cela n'est vérifiable en lisant le Markdown : il faut la page rendue, dans un
// vrai navigateur, avec son script.
//
// `guide.ts` importe `vscode` et ne se charge donc pas ici. Le banc en extrait
// les fonctions PURES (elles n'y touchent pas) par découpage du source, comme le
// fait déjà `_preview-guide.mjs` pour le CSS : la page essayée est bien celle que
// VS Code affichera, pas une copie qui dériverait.
import esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
const fails = [];
const check = (label, cond, detail) => {
  if (cond) { ok++; console.log(`✅ ${label}`); }
  else { fails.push(label); console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

// CRLF normalisés : le CSS et les fonctions se cherchent au motif.
const source = readFileSync(join(ROOT, 'src/guide.ts'), 'utf8').replace(/\r\n/g, '\n');

const tmp = mkdtempSync(join(tmpdir(), 'kablix-guide-nav-'));

/**
 * `guide.ts` importe `vscode`, absent hors de l'éditeur. Le banc lui donne un
 * bouchon (seul `l10n.t` sert dans les fonctions essayées) et fait transpiler
 * l'ensemble par esbuild : le code exercé est bien celui du fichier, pas une
 * copie qui dériverait. Les fonctions voulues ne sont pas exportées — un module
 * intermédiaire les réexporte en injectant `export` par réécriture du source.
 */
const PURES = ['stripTocSection', 'foldSections', 'outlineHtml', 'escapeHtml', 'guideScript'];
let expose = source;
for (const n of PURES) expose = expose.replace(new RegExp(`^function ${n}\\(`, 'm'), `export function ${n}(`);
writeFileSync(join(tmp, 'guide-expose.ts'), expose);
writeFileSync(join(tmp, 'vscode.ts'), 'export const l10n = { t: (s) => s };\nexport const Uri = {};\nexport const window = {};\nexport const commands = {};\nexport const workspace = {};\nexport const ViewColumn = { One: 1 };\nexport const env = { language: "fr" };\n');

const out = join(tmp, 'guide.mjs');
await esbuild.build({
  entryPoints: [join(tmp, 'guide-expose.ts')], outfile: out,
  bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  absWorkingDir: ROOT,
  // Le module intermédiaire vit hors du projet : ses `./markdown` et `./partHelp`
  // se résolvent vers `src/`, et `vscode` vers le bouchon ci-dessus.
  plugins: [{
    name: 'chemins-banc',
    setup(b) {
      b.onResolve({ filter: /^vscode$/ }, () => ({ path: join(tmp, 'vscode.ts') }));
      b.onResolve({ filter: /^\.\// }, (a) => (
        a.importer.startsWith(tmp) ? { path: join(ROOT, 'src', a.path.slice(2)) + '.ts' } : undefined
      ));
    },
  }],
});
const boite = await import(pathToFileURL(out).href);

const mdOut = join(tmp, 'markdown.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src/markdown.ts')], outfile: mdOut,
  bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { renderMarkdown, markdownOutline } = await import(pathToFileURL(mdOut).href);

const manquantes = PURES.filter((n) => typeof boite[n] !== 'function');
check('les fonctions pures de guide.ts sont exercées depuis le source',
  manquantes.length === 0, `absentes : ${manquantes.join(', ')}`);
if (manquantes.length) { console.log(`\n${ok} contrôles verts, ${fails.length} rouges`); process.exit(1); }

const mdPath = join(ROOT, 'docs/fr/USAGE.md');
const brut = readFileSync(mdPath, 'utf8');
const base = dirname(mdPath);

// Le sommaire écrit à la main sort du rendu (il reste dans le fichier, pour
// GitHub) : sans cela, deux sommaires se suivraient en tête de page.
const texte = boite.stripTocSection(brut);
check('la section « Sommaire » écrite à la main sort du rendu',
  /^##\s+Sommaire\s*$/m.test(brut) && !/^##\s+Sommaire\s*$/m.test(texte));
check('le fichier docs/fr/USAGE.md n\'est PAS modifié',
  readFileSync(mdPath, 'utf8') === brut);

const outline = markdownOutline(texte);
const h2Rendu = [...texte.matchAll(/^##\s+(.+)$/gm)].length;
check(`le sommaire généré couvre les ${h2Rendu} sections du guide`,
  outline.filter((e) => e.level === 2).length === h2Rendu,
  `${outline.filter((e) => e.level === 2).length} entrées de niveau 2`);
check('le sommaire généré descend aux sous-titres', outline.some((e) => e.level === 3));
// Deux titres de même nom donneraient deux ancres identiques : le clic mènerait
// toujours au premier, et le suivi de position marquerait la mauvaise ligne.
const doublons = outline.map((e) => e.id).filter((id, i, t) => t.indexOf(id) !== i);
check('chaque entrée du sommaire a une ancre unique', doublons.length === 0, JSON.stringify([...new Set(doublons)]));

// Le sommaire manuel en oubliait : c'est la raison d'être de l'option G.
const manuel = brut.slice(brut.search(/^##\s+Sommaire\s*$/m));
const ancresManuelles = new Set([...manuel.slice(0, manuel.indexOf('\n## ', 3)).matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]));
const oubliees = outline.filter((e) => e.level === 2 && !ancresManuelles.has(e.id));
check(`le sommaire généré rattrape les sections oubliées à la main (${oubliees.length})`, oubliees.length > 0,
  'aucune oubliée : le contrôle ne prouve plus rien');

const corps = boite.foldSections(renderMarkdown(texte, {
  resolveAsset: (rel) => { const abs = resolve(base, rel); return existsSync(abs) ? pathToFileURL(abs).href : ''; },
  resolveDocLink: () => '#',
}));
check('chaque section de niveau 2 devient un <details> ouvert',
  (corps.match(/<details class="section" open>/g) || []).length === h2Rendu);
check('le titre garde son ancre dans le <summary>',
  outline.filter((e) => e.level === 2).every((e) => corps.includes(`<summary><h2 id="${e.id}">`)));

const css = source.match(/<style nonce="\$\{nonce\}">([\s\S]*?)<\/style>/)[1];

// Le balisage du sommaire est PRIS DANS LE SOURCE, pas recopié ici : une copie
// dériverait au premier remaniement de la colonne, et le banc essaierait alors
// une page que VS Code n'affiche plus. Les `${…}` du gabarit sont remplacés par
// leur valeur — les libellés par leur texte, le sommaire par sa liste rendue.
const aside = source
  .match(/<aside class="toc-col">[\s\S]*?<\/aside>/)[0]
  .replace(/\$\{outlineHtml\(outline, lToc\)\}/, boite.outlineHtml(outline, 'Sommaire'))
  .replace(/\$\{escapeHtml\(lToc\)\}/g, 'Sommaire')
  .replace(/\$\{escapeHtml\(lSearch\)\}/g, 'Chercher')
  .replace(/\$\{escapeHtml\(lNoHit\)\}/g, 'Rien trouvé')
  .replace(/\$\{escapeHtml\(lFoldAll\)\}/g, 'Tout replier')
  .replace(/\$\{escapeHtml\(lUnfoldAll\)\}/g, 'Tout déplier');
check('le balisage du sommaire vient bien du source (aucun ${…} résiduel)',
  !aside.includes('${'), aside.match(/\$\{[^}]*\}/)?.[0]);

const page = `<!doctype html><meta charset="utf-8"><title>t</title><style>
  :root{--vscode-font-family:system-ui;--vscode-foreground:#e6e6e6;--vscode-editor-background:#1e1e1e;
  --vscode-textLink-foreground:#4daafc;--vscode-panel-border:#3c3c3c;--vscode-textCodeBlock-background:#2a2a2a;
  --vscode-textBlockQuote-background:#252526;--vscode-descriptionForeground:#9d9d9d}
  ${css}</style>
<body>
  <div class="page">
${aside}
    <div class="wrap">${corps}</div>
  </div>
  <script>${boite.guideScript()}</script>
  <script>
// Épreuve : on joue les gestes du lecteur et on rend un verdict par gestes.
const R = {};
const $ = (s) => document.querySelector(s);
const sections = [...document.querySelectorAll('details.section')];
const liens = [...document.querySelectorAll('.toc__item a')];
const visibles = () => sections.filter((s) => !s.classList.contains('hors-filtre'));

R.sommairePlein = liens.length;
R.sectionsOuvertes = sections.filter((s) => s.open).length;

// Le sommaire colle-t-il ? (option A : la propriété calculée, pas le CSS écrit)
R.collant = getComputedStyle($('.toc-col')).position;

// La tête du sommaire (recherche + les deux boutons) reste-t-elle dans la
// fenêtre ? C'est le défaut corrigé en v2026.9.4.83 : la colonne entière
// défilait, et la liste des sections étant plus haute que l'écran, le champ de
// recherche sortait par le haut. On MESURE, on ne lit pas le CSS écrit.
const tete = $('.toc__tete');
const tocCorps = $('.toc__corps');
R.teteExiste = !!tete && !!tocCorps;
// La liste doit vraiment déborder, sinon le contrôle ne prouve rien.
R.corpsDeborde = tocCorps ? tocCorps.scrollHeight > tocCorps.clientHeight + 4 : false;
// On pousse le corps du sommaire à fond, puis la page : dans les deux cas la
// tête doit rester entièrement visible.
if (tocCorps) tocCorps.scrollTop = tocCorps.scrollHeight;
R.corpsDefile = tocCorps ? tocCorps.scrollTop > 10 : false;
window.scrollTo(0, document.body.scrollHeight);
const mesureTete = () => {
  const b = tete.getBoundingClientRect();
  return Math.round(b.top) >= -1 && Math.round(b.bottom) <= window.innerHeight + 1;
};
R.teteEnVueBas = tete ? mesureTete() : false;
R.teteBoite = tete ? JSON.stringify([Math.round(tete.getBoundingClientRect().top), Math.round(tete.getBoundingClientRect().bottom), window.innerHeight]) : '';
R.colBoite = JSON.stringify([Math.round($('.toc-col').getBoundingClientRect().top), Math.round($('.toc-col').getBoundingClientRect().bottom)]);
// Le champ et les deux boutons, eux-mêmes, cliquables au doigt.
const dansLaVue = (el) => {
  const b = el.getBoundingClientRect();
  return b.height > 0 && b.top >= -1 && b.bottom <= window.innerHeight + 1;
};
R.champEnVueBas = dansLaVue($('#recherche'));
R.boutonsEnVueBas = dansLaVue($('#tout-replier')) && dansLaVue($('#tout-deplier'));
// Le corps du sommaire défile SEUL : la page ne doit pas avoir bougé quand on
// le pousse (sinon on aurait juste déplacé le problème).
window.scrollTo(0, 0);
const avant = window.scrollY;
if (tocCorps) tocCorps.scrollTop = tocCorps.scrollHeight;
R.pageImmobile = window.scrollY === avant;
tocCorps && (tocCorps.scrollTop = 0);
window.scrollTo(0, 0);

// Repliage : la section ne fait plus que la hauteur de son titre, et le titre
// reste affiché — une section fermée doit rester repérable et rouvrable.
const s0 = sections[0];
R.deplieHauteur = Math.round(s0.getBoundingClientRect().height);
s0.open = false;
R.replieHauteur = Math.round(s0.getBoundingClientRect().height);
R.replieTitreVisible = s0.querySelector('h2').getClientRects().length > 0;
s0.open = true;

// Tout replier / tout déplier
$('#tout-replier').click();
R.apresReplier = sections.filter((s) => s.open).length;
$('#tout-deplier').click();
R.apresDeplier = sections.filter((s) => s.open).length;

// Position de lecture : on descend jusqu'au 4e titre, le sommaire doit suivre.
const cible = document.querySelectorAll('h2[id]')[3];
cible.scrollIntoView({ block: 'start' });
window.dispatchEvent(new Event('scroll'));
document.dispatchEvent(new Event('scroll'));
R.ancreVisee = cible.id;
R.ancreCourante = document.querySelector('.toc__item--courant a')?.dataset.anchor ?? null;
// Le repère peut légitimement se poser sur un SOUS-titre de la section visée
// (c'est plus précis) : on accepte tout titre de cette section-là.
const sectionVisee = cible.closest('details.section');
R.ancreDansLaSection = !!R.ancreCourante
  && sectionVisee.contains(document.getElementById(R.ancreCourante));
// Une seule ligne à la fois doit être marquée.
R.marquees = document.querySelectorAll('.toc__item--courant').length;

// Le corps du sommaire défilant seul, l'entrée marquée doit être RAMENÉE dans
// sa fenêtre : sur un guide de 14 sections, la dernière est hors vue sans cela.
const bas = document.querySelectorAll('h2[id]');
bas[bas.length - 1].scrollIntoView({ block: 'start' });
document.dispatchEvent(new Event('scroll'));
{
  const li = document.querySelector('.toc__item--courant');
  const b = tocCorps?.getBoundingClientRect();
  const c = li?.getBoundingClientRect();
  R.marqueeEnVue = !!(li && b && c && c.top >= b.top - 1 && c.bottom <= b.bottom + 1);
  R.marqueeDetail = li && b && c ? Math.round(c.top - b.top) + '/' + Math.round(b.bottom - c.bottom) : 'absente';
}

// Remonté tout en haut, le repère doit tomber sur la première section.
window.scrollTo(0, 0);
document.dispatchEvent(new Event('scroll'));
R.ancreEnHaut = document.querySelector('.toc__item--courant a')?.dataset.anchor ?? null;
R.premiereAncre = liens[0].dataset.anchor;

// Clic dans le sommaire sur une section REPLIÉE : elle doit s'ouvrir.
const dernier = liens[liens.length - 1];
const sectionCible = document.getElementById(dernier.dataset.anchor).closest('details.section');
sectionCible.open = false;
dernier.click();
R.clicOuvreSection = sectionCible.open;
for (const s of sections) s.open = true;

// Recherche d'un mot présent dans une seule section.
const champ = $('#recherche');
const lancer = (mot) => new Promise((res) => {
  champ.value = mot;
  champ.dispatchEvent(new Event('input'));
  setTimeout(res, 260);
});

(async () => {
  await lancer('DMX');
  R.dmxSections = visibles().length;
  R.dmxTotal = sections.length;
  R.dmxSurligne = document.querySelectorAll('mark').length;
  R.dmxSommaire = liens.filter((a) => !a.parentElement.classList.contains('hors-filtre')).length;
  R.dmxVide = $('#toc-vide').hidden;

  // Accents et casse : « repere » doit trouver « repère ».
  await lancer('repere');
  R.accentTrouve = visibles().length;

  // Un mot absent : tout disparaît et le message se montre.
  await lancer('zzzintrouvable');
  R.videSections = visibles().length;
  R.videMessage = !$('#toc-vide').hidden;

  // Champ vidé : la page revient intacte, sans <mark> résiduel.
  await lancer('');
  R.retourSections = visibles().length;
  R.retourMarks = document.querySelectorAll('mark').length;
  R.retourLiens = liens.filter((a) => !a.parentElement.classList.contains('hors-filtre')).length;
  R.orphelins = liens.filter((a) => !document.getElementById(a.dataset.anchor)).map((a) => a.dataset.anchor);
  R.scrollY = window.scrollY;
  // Le HTML doit être rendu tel quel : les images et les liens survivent.
  R.retourImages = document.querySelectorAll('.wrap img').length;
  R.retourTableaux = document.querySelectorAll('.wrap table').length;

  document.title = 'R:' + JSON.stringify(R);
})();
  </script>
</body>`;

const fichier = join(tmp, 'guide.html');
writeFileSync(fichier, page);

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((c) => existsSync(c));
if (!chrome) { console.log('❌ aucun navigateur headless trouvé'); process.exit(1); }

const dom = execFileSync(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--virtual-time-budget=8000', '--window-size=1200,900',
  '--dump-dom', `file:///${fichier.replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<title>R:([\s\S]*?)<\/title>/);
if (!m) { console.log('❌ le script de la page n\'a pas rendu de verdict'); process.exit(1); }
const R = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

// --- Verdicts -----------------------------------------------------------------
check('le sommaire latéral est rempli', R.sommairePlein === outline.length, `${R.sommairePlein} liens`);
check('le sommaire est collant (position: sticky)', R.collant === 'sticky', R.collant);

// --- Barre d'outils du sommaire figée (v2026.9.4.83) --------------------------
check('la colonne se découpe en tête figée et corps défilant', R.teteExiste === true);
check('la liste des sections déborde vraiment de sa fenêtre', R.corpsDeborde === true,
  'sans débordement, les contrôles suivants ne prouvent rien');
check('le corps du sommaire défile seul', R.corpsDefile === true);
check('la page poussée en bas, la tête du sommaire reste visible', R.teteEnVueBas === true,
  `tête ${R.teteBoite}, colonne ${R.colBoite}`);
check('le champ de recherche reste atteignable en bas de page', R.champEnVueBas === true);
check('les boutons replier/déplier restent atteignables en bas de page', R.boutonsEnVueBas === true);
check('pousser le sommaire ne fait pas défiler la page', R.pageImmobile === true);
check('l\'entrée marquée est ramenée dans la fenêtre du sommaire', R.marqueeEnVue === true,
  `écarts haut/bas : ${R.marqueeDetail}`);
check('toutes les sections s\'ouvrent au chargement', R.sectionsOuvertes === h2Rendu, `${R.sectionsOuvertes}/${h2Rendu}`);
check('une section repliée cache son corps mais garde son titre',
  R.replieTitreVisible === true && R.replieHauteur < R.deplieHauteur / 3,
  `${R.replieHauteur}px repliée contre ${R.deplieHauteur}px dépliée, titre visible : ${R.replieTitreVisible}`);
check('« tout replier » ferme tout', R.apresReplier === 0, `${R.apresReplier} restées ouvertes`);
check('« tout déplier » rouvre tout', R.apresDeplier === h2Rendu, `${R.apresDeplier}/${h2Rendu}`);
check('le sommaire marque la section lue', R.ancreDansLaSection === true,
  `${R.ancreCourante} est hors de la section ${R.ancreVisee}`);
check('une seule ligne du sommaire est marquée', R.marquees === 1, `${R.marquees} marquées`);
check('remonté en haut, le repère revient à la première section',
  R.ancreEnHaut === R.premiereAncre, `${R.ancreEnHaut} au lieu de ${R.premiereAncre}`);
check('un clic dans le sommaire ouvre la section repliée visée', R.clicOuvreSection === true);

check('la recherche « DMX » ne garde que quelques sections',
  R.dmxSections > 0 && R.dmxSections < R.dmxTotal, `${R.dmxSections}/${R.dmxTotal}`);
check('la recherche surligne les occurrences', R.dmxSurligne > 0, `${R.dmxSurligne} <mark>`);
check('le sommaire se réduit aux sections trouvées',
  R.dmxSommaire > 0 && R.dmxSommaire < R.sommairePlein, `${R.dmxSommaire}/${R.sommairePlein}`);
check('la recherche ignore les accents et la casse', R.accentTrouve > 0, `${R.accentTrouve} section(s)`);
check('un mot absent vide la page', R.videSections === 0, `${R.videSections} restée(s)`);
check('un mot absent affiche « rien trouvé »', R.videMessage === true);
check('champ vidé : toutes les sections reviennent', R.retourSections === R.dmxTotal, `${R.retourSections}/${R.dmxTotal}`);
check('champ vidé : plus aucun surlignage', R.retourMarks === 0, `${R.retourMarks} <mark>`);
check('champ vidé : le sommaire revient entier', R.retourLiens === R.sommairePlein,
  `${R.retourLiens}/${R.sommairePlein} — ancre(s) sans titre : ${JSON.stringify(R.orphelins)}`);
check('la reconstruction préserve les images', R.retourImages > 0, `${R.retourImages} images`);
check('la reconstruction préserve les tableaux', R.retourTableaux > 0, `${R.retourTableaux} tableaux`);

console.log(`\n${ok} contrôles verts, ${fails.length} rouges`);
if (fails.length) { for (const f of fails) console.log(`  · ${f}`); process.exit(1); }
