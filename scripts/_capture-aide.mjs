// Capture d'écran du panneau d'aide complet (sommaire + sections repliables),
// pour un contrôle à l'œil. Reprend le montage du banc verify-guide-nav.
import esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = 'C:/- VS Code/Extensions/Kablix';
const source = readFileSync(join(ROOT, 'src/guide.ts'), 'utf8').replace(/\r\n/g, '\n');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-capture-aide-'));

const PURES = ['stripTocSection', 'foldSections', 'outlineHtml', 'escapeHtml', 'guideScript'];
let expose = source;
for (const n of PURES) expose = expose.replace(new RegExp(`^function ${n}\\(`, 'm'), `export function ${n}(`);
writeFileSync(join(tmp, 'guide-expose.ts'), expose);
writeFileSync(join(tmp, 'vscode.ts'), 'export const l10n = { t: (s) => s };\nexport const Uri = {};\nexport const window = {};\nexport const commands = {};\nexport const workspace = {};\nexport const ViewColumn = { One: 1 };\nexport const env = { language: "fr" };\n');

const out = join(tmp, 'guide.mjs');
await esbuild.build({
  entryPoints: [join(tmp, 'guide-expose.ts')], outfile: out,
  bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', absWorkingDir: ROOT,
  plugins: [{
    name: 'chemins', setup(b) {
      b.onResolve({ filter: /^vscode$/ }, () => ({ path: join(tmp, 'vscode.ts') }));
      b.onResolve({ filter: /^\.\// }, (a) => (a.importer.startsWith(tmp) ? { path: join(ROOT, 'src', a.path.slice(2)) + '.ts' } : undefined));
    },
  }],
});
const boite = await import(pathToFileURL(out).href);

const mdOut = join(tmp, 'markdown.mjs');
await esbuild.build({ entryPoints: [join(ROOT, 'src/markdown.ts')], outfile: mdOut, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { renderMarkdown, markdownOutline } = await import(pathToFileURL(mdOut).href);

const mdPath = join(ROOT, 'docs/fr/USAGE.md');
const base = dirname(mdPath);
const texte = boite.stripTocSection(readFileSync(mdPath, 'utf8'));
const outline = markdownOutline(texte);
const corps = boite.foldSections(renderMarkdown(texte, {
  resolveAsset: (rel) => { const abs = resolve(base, rel); return existsSync(abs) ? pathToFileURL(abs).href : ''; },
  resolveDocLink: () => '#',
}));
const css = source.match(/<style nonce="\$\{nonce\}">([\s\S]*?)<\/style>/)[1];

const mode = process.argv[2] ?? 'plein'; // plein | replie | recherche
const post = {
  plein: '',
  replie: `document.getElementById('tout-replier').click();`,
  recherche: `const c=document.getElementById('recherche');c.value='DMX';c.dispatchEvent(new Event('input'));`,
}[mode];

const page = `<!doctype html><meta charset="utf-8"><title>aide</title><style>
 :root{--vscode-font-family:system-ui;--vscode-foreground:#cccccc;--vscode-editor-background:#1f1f1f;
 --vscode-textLink-foreground:#4daafc;--vscode-textLink-activeForeground:#6fbcff;--vscode-panel-border:#3c3c3c;
 --vscode-textCodeBlock-background:#2a2a2a;--vscode-textBlockQuote-background:#252526;
 --vscode-input-background:#313131;--vscode-input-foreground:#cccccc;--vscode-input-border:#3c3c3c;
 --vscode-focusBorder:#0078d4;--vscode-list-hoverBackground:#2a2d2e;--vscode-list-inactiveSelectionBackground:#37373d;
 --vscode-button-secondaryBackground:#313131;--vscode-button-secondaryForeground:#cccccc;
 --vscode-button-secondaryHoverBackground:#3c3c3c;--vscode-editor-findMatchHighlightBackground:#9e6a03}
 ${css}</style>
<body>
 <div class="page">
  <aside class="toc-col"><p class="toc__titre">Sommaire</p>
   <input class="recherche" type="search" id="recherche" placeholder="Rechercher dans le guide" />
   <div class="toc__outils"><button type="button" id="tout-replier">Tout replier</button><button type="button" id="tout-deplier">Tout déplier</button></div>
   ${boite.outlineHtml(outline, 'Sommaire')}
   <p class="toc__vide" id="toc-vide" hidden>Rien trouvé</p></aside>
  <div class="wrap">${corps}</div>
 </div>
 <script>${boite.guideScript()}</script>
 <script>setTimeout(()=>{${post}},50);</script>
</body>`;
const f = join(tmp, 'aide.html');
writeFileSync(f, page);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const shot = `V:/Temp/claude/c----VS-Code-Extensions-Kablix/e81daf68-8045-4365-bba1-2b6a8c779ccb/scratchpad/aide-${mode}.png`;
execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--virtual-time-budget=6000',
  `--screenshot=${shot}`, '--window-size=1200,1000', `file:///${f.replace(/\\/g, '/')}`], { stdio: 'ignore' });
console.log(shot);
