// Aperçu hors VS Code du guide rendu par markdown.ts : écrit un HTML avec les
// mêmes styles que guide.ts, images résolues en file://, puis capture Chrome.
import esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = process.argv[2] ?? 'fr';
const name = process.argv[3] ?? 'USAGE';

const tmp = mkdtempSync(join(tmpdir(), 'kablix-guide-'));
const out = join(tmp, 'markdown.mjs');
await esbuild.build({ entryPoints: [join(root, 'src/markdown.ts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { renderMarkdown } = await import(pathToFileURL(out).href);

const mdPath = join(root, 'docs', lang, `${name}.md`);
const base = dirname(mdPath);
const missing = [];
const body = renderMarkdown(readFileSync(mdPath, 'utf8'), {
  resolveAsset: (rel) => {
    const abs = resolve(base, rel);
    if (!existsSync(abs)) { missing.push(rel); return ''; }
    return pathToFileURL(abs).href;
  },
  resolveDocLink: () => '#',
});
if (missing.length) console.warn('  ⚠ images introuvables :', missing.join(', '));

const css = readFileSync(join(root, 'src/guide.ts'), 'utf8').match(/<style nonce="\$\{nonce\}">([\s\S]*?)<\/style>/)[1];
const html = `<!doctype html><meta charset="utf-8"><style>
  :root{--vscode-font-family:system-ui;--vscode-foreground:#e6e6e6;--vscode-editor-background:#1e1e1e;
  --vscode-textLink-foreground:#4daafc;--vscode-panel-border:#3c3c3c;--vscode-textCodeBlock-background:#2a2a2a;
  --vscode-textBlockQuote-background:#252526;--vscode-descriptionForeground:#9d9d9d}
  ${css}</style><body><div class="wrap">${body}</div></body>`;
const page = join(tmp, 'guide.html');
writeFileSync(page, html);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((c) => existsSync(c));
const shot = join(root, `preview-guide-${lang}.png`);
execFileSync(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--virtual-time-budget=6000',
  `--screenshot=${shot}`, '--window-size=900,2400', `file:///${page.replace(/\\/g, '/')}`,
], { stdio: 'ignore' });
console.log(`  ✓ ${shot}`);
