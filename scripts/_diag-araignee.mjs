// Diagnostic : que rend <kablix-araignee> ? (les pattes n'apparaissent pas sur
// la capture de la fiche d'aide). Dump du shadow DOM + longueur des segments.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
// Sortie des captures : le temporaire du système, sauf KABLIX_OUT.
const TMP = process.env.KABLIX_OUT ?? join(tmpdir(), 'kablix-vues');
mkdirSync(TMP, { recursive: true });

const { build: esbuild } = await import('esbuild');

const entry = join(TMP, 'entry-araignee.mjs');
writeFileSync(entry, `
import { LEG_FEMUR, LEG_TIBIA } from '${ROOT}/src/webview/composants/patte-element.mjs';
import '${ROOT}/src/webview/composants/araignee-element.mjs';
const el = document.createElement('kablix-araignee');
document.body.appendChild(el);
setTimeout(() => {
  const svg = el.shadowRoot && el.shadowRoot.querySelector('svg');
  const pre = document.createElement('pre');
  const box = (n) => { try { const b = n.getBBox(); return [b.x, b.y, b.width, b.height].join(','); } catch (e) { return 'ERR ' + e; } };
  const rect = (n) => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(','); };
  const kids = [...svg.children].map((k) => k.tagName + ' id=' + k.id + ' ns=' + String(k.namespaceURI).slice(-8)
    + ' bbox=' + box(k) + ' rect=' + rect(k));
  pre.textContent = 'FEMUR=' + LEG_FEMUR + ' TIBIA=' + LEG_TIBIA
    + '\\nSVG bbox ' + box(svg) + '\\nSVG rect ' + rect(svg)
    + '\\nENFANTS:\\n' + kids.join('\\n');
  document.body.appendChild(pre);
}, 300);
`);

const bundle = await esbuild({
  entryPoints: [entry], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' },
  absWorkingDir: ROOT,
});
const page = join(TMP, 'araignee.html');
writeFileSync(page, `<!doctype html><html><body><script>${bundle.outputFiles[0].text}</script></body></html>`);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = execFileSync(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=4000', '--dump-dom',
  `file:///${page.replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 20e6 });
console.log(out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
