// Mise au point : Chauffage.projix (Bugs/) rouvert avec le LM35 de la
// bibliothèque — le chargement lève-t-il au rendu du lm35a ?
// Usage : node scripts/_diag-chauffage-fils.mjs <chemin du .projix> [kompix]
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-chauffage');
mkdirSync(CACHE, { recursive: true });

const projix = await JSZip.loadAsync(readFileSync(process.argv[2]));
const diagram = JSON.parse(await projix.file('diagram.json').async('string'));

// Composant de bibliothèque, déplié comme kompixLibrary.unpackKompix.
const kz = await JSZip.loadAsync(readFileSync(process.argv[3] ?? join(ROOT, 'kablix_components', 'lm35a.kompix')));
const m = JSON.parse(await kz.file('manifest.json').async('string'));
const svg = await kz.file('schema.svg').async('string');
const vb = (svg.match(/viewBox="([^"]+)"/) ?? [, '0 0 100 100'])[1];
const [, , w, h] = vb.split(/\s+/);
function groupe(id) {
  const open = new RegExp(`<g\\b[^>]*\\bid="${id}"[^>]*?(/?)>`, 'i').exec(svg);
  if (!open) return '';
  const start = open.index + open[0].length;
  const tags = /<g\b[^>]*?(\/?)>|<\/g\s*>/gi;
  tags.lastIndex = start;
  let depth = 1, t;
  while ((t = tags.exec(svg))) {
    if (t[0].startsWith('</')) { if (--depth === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${svg.slice(start, t.index)}</svg>`; }
    else if (t[1] !== '/') depth++;
  }
  return '';
}
const custom = {
  type: m.type, label: m.label, kind: m.kind, svg: groupe(m.type), pins: m.pins, pinRoles: m.pinRoles,
  attrs: m.attrs, innerSvg: groupe(`${m.type}-interne`) || undefined, innerOffset: m.innerOffset,
  extAnchor: m.extAnchor, intAnchor: m.intAnchor, params: m.params, control: m.control,
  minSupply: m.minSupply, category: m.category,
};

const composants = readdirSync(join(ROOT, 'src/webview/composants')).filter((f) => f.endsWith('.mts'));
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { initLocale } from '../../src/webview/i18n.mjs';
${composants.map((f) => `import '../../src/webview/composants/${f.replace(/\.mts$/, '.mjs')}';`).join('\n')}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
window.addEventListener('error', (e) => out.push('window.error: ' + e.message));
async function run() {
  initLocale('fr');
  const ed = new Editor(document.getElementById('canvas'), document.getElementById('palette'),
    document.getElementById('wires'), document.getElementById('inspector'));
  const custom = ${JSON.stringify(custom)};
  const diagram = ${JSON.stringify(diagram)};
  try {
    ed.loadCustomParts([custom]);
    out.push('loadCustomParts OK');
  } catch (e) { out.push('loadCustomParts LEVE : ' + e.message + '\\n' + String(e.stack).slice(0, 1500)); }
  try {
    const r = ed.loadDiagram(JSON.parse(JSON.stringify(diagram)));
    out.push('loadDiagram OK, inconnus=' + JSON.stringify(r));
  } catch (e) { out.push('loadDiagram LEVE : ' + e.message + '\\n' + String(e.stack).slice(0, 1500)); }
  await wait(300);
  out.push('pieces=' + ed.diagram.parts.map((p) => p.id).join(',') + ' fils=' + ed.diagram.wires.length + '/' + diagram.wires.length);
  const pre = document.createElement('pre'); pre.id = 'measures'; pre.textContent = out.join('\\n'); document.body.appendChild(pre);
}
run().catch((e) => { const pre = document.createElement('pre'); pre.id = 'measures'; pre.textContent = out.join('\\n') + '\\nEXC ' + e.stack; document.body.appendChild(pre); });
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const bundle = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, sourcemap: 'inline',
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'error',
});
const css = readFileSync(join(ROOT, 'media/styles.css'), 'utf8');
writeFileSync(join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0"><div class="workshop"><aside id="palette" class="palette"></aside>` +
  `<div id="canvas" class="canvas" style="width:1200px;height:800px"><svg id="wires" class="wires"></svg></div><aside id="inspector" class="inspector"></aside></div>` +
  `<script>${bundle.outputFiles[0].text}</script></body>`);
const chrome = [process.env.CHROME_PATH ?? '', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => p && existsSync(p));
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1400,1000',
  '--virtual-time-budget=10000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const mm = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
console.log(mm ? mm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'mesures introuvables');
