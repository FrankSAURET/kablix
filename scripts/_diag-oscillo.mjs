// Repérage du dessin de l'oscilloscope : où sont l'écran, les deux boutons,
// leur aiguille et les pastilles, en pixels du viewBox (220 × 270).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'node_modules', '.cache-diag');
mkdirSync(OUT, { recursive: true });
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((c) => existsSync(c));

const svg = readFileSync(join(ROOT, 'src/webview/composants/externe/oscillo.svg'), 'utf8');
const cibles = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['oscillo-ecran', 'Ecran-4', 'oscillo-bouton-tension', 'oscillo-bouton-s_div', 'g533', 'g3', 'g48'];

const page = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}
#box{position:relative;width:220px;height:270px}svg{width:220px;height:270px;display:block}</style>
<body><div id="box">${svg}</div><pre id="res" style="position:absolute;left:-9999px"></pre>
<script>
const box = document.getElementById('box').getBoundingClientRect();
const R = (el) => { const b = el.getBoundingClientRect();
  return [+(b.x-box.x).toFixed(2), +(b.y-box.y).toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)]; };
const out = {};
for (const id of ${JSON.stringify(cibles)}) {
  const el = document.getElementById(id);
  out[id] = el ? { boite: R(el), enfants: [...el.children].map((c) => ({ tag: c.tagName, id: c.id, boite: R(c) })) } : 'ABSENT';
}
// Tous les textes du dessin, pour retrouver les graduations.
out.textes = [...document.querySelectorAll('text')].map((t) => ({ id: t.id, txt: t.textContent.trim(), boite: R(t) }));
document.getElementById('res').textContent = JSON.stringify(out, null, 1);
</script></body>`;
const p = join(OUT, 'oscillo.html');
writeFileSync(p, page);
const dom = execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(p).href],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="res"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'PAS DE RESULTAT');
