// Diagnostic : que rend <kablix-araignee> ? (les pattes n'apparaissent pas sur
// la capture de la fiche d'aide). Dump du shadow DOM + longueur des segments.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = 'h:/OneDrive/4 Programation/- VS Code/Extensions/Kablix';
const TMP = 'V:/Temp/claude/h--OneDrive-4-Programation---VS-Code-Extensions-Kablix/12a8c4d6-73cd-444a-baa9-bda5de53da53/scratchpad';

const { build: esbuild } = await import('esbuild');

const entry = join(TMP, 'entry-araignee.mjs');
writeFileSync(entry, `
import { SEGMENT1, SEGMENT2 } from '${ROOT}/src/webview/composants/patte-element.mjs';
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
  pre.textContent = 'SEG1 len=' + SEGMENT1.length + ' SEG2 len=' + SEGMENT2.length
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
