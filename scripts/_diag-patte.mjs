// Diagnostic d'atelier : que rend VRAIMENT <kablix-patte> ? Bundle du seul fork,
// rendu dans Chrome headless, dump du shadow DOM (le webp de la fiche d'aide
// sortait blanc alors que l'élément se définissait bien).
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = process.env.KX_TMP
  || join(tmpdir(), 'kablix-vues');

const entry = join(TMP, 'entry-patte.mjs');
writeFileSync(entry, `
import '${join(ROOT, 'src/webview/composants/patte-element.mjs').replace(/\\/g, '/')}';
const el = document.createElement('kablix-patte');
document.body.appendChild(el);
setTimeout(() => {
  const r = el.getBoundingClientRect();
  const svg = el.shadowRoot && el.shadowRoot.querySelector('svg');
  const sb = svg && svg.getBoundingClientRect();
  const pre = document.createElement('pre');
  pre.textContent = 'HOST ' + JSON.stringify(r) + '\\nSVG ' + JSON.stringify(sb)
    + '\\nSHADOW:\\n' + (el.shadowRoot ? el.shadowRoot.innerHTML : '(aucun) ' + el.innerHTML);
  document.body.appendChild(pre);
}, 200);
`);

const bundle = await esbuild({
  entryPoints: [entry], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' },
});
const page = join(TMP, 'patte.html');
writeFileSync(page, `<!doctype html><html><body><script>${bundle.outputFiles[0].text}</script></body></html>`);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = execFileSync(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=4000', '--dump-dom',
  `file:///${page.replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 20e6 });
console.log(out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
