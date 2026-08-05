// Sonde : bouton de vitesse de simulation (barre du canvas).
// Rend la vraie barre avec le vrai CSS en Chrome headless et mesure le bouton
// et l'animal dessus — Frank le voulait carré, l'icône pleine taille à 1 px de
// la bordure.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-vitesse');
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');

const page = `<!doctype html><meta charset=utf8><style>${css}</style>
<body style="margin:0;background:#1e1e1e">
<div class="canvas" style="position:relative;width:900px;height:200px">
  <div class="canvas-controls" role="toolbar">
    <button id="run" class="canvas-controls__btn primary">▶</button>
    <button id="stop" class="canvas-controls__btn">■</button>
    <span class="canvas-controls__speed">
      <span id="speed-face" class="canvas-controls__speed-face">🐇</span>
      <select id="speed" class="canvas-controls__speed-select">
        <option value="1" selected>🐇 100 %</option>
        <option value="0.1">🐢 10 %</option>
        <option value="0.01">🐌 1 %</option>
      </select>
    </span>
    <button id="repl" class="canvas-controls__btn canvas-controls__btn--repl">REPL</button>
  </div>
</div>
<pre id="measures"></pre>
<script>
const r = (el) => { const b = el.getBoundingClientRect();
  return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
const bouton = r(document.querySelector('.canvas-controls__speed'));
const std = r(document.getElementById('stop'));
// Boîte réellement peinte par l'emoji (Range = boîte du texte, pas du span).
const rg = document.createRange();
rg.selectNodeContents(document.getElementById('speed-face'));
const glyphe = (() => { const b = rg.getBoundingClientRect();
  return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; })();
// ENCRE réelle des trois animaux : la boîte du texte est la boîte d'AVANCE
// (blancs latéraux compris), elle ne dit pas ce qui est peint. On les dessine
// dans un canvas et on relève la boîte des pixels effectivement noircis.
function encre(car, px) {
  const c = document.createElement('canvas');
  c.width = 80; c.height = 80;
  const g = c.getContext('2d');
  g.font = px + 'px ' + getComputedStyle(document.getElementById('speed-face')).fontFamily;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(car, 40, 40);
  const d = g.getImageData(0, 0, 80, 80).data;
  let x0 = 80, y0 = 80, x1 = -1, y1 = -1;
  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < 80; x++) {
      if (d[(y * 80 + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const px = parseFloat(getComputedStyle(document.getElementById('speed-face')).fontSize);
const encres = { px, '🐇': encre('🐇', px), '🐢': encre('🐢', px), '🐌': encre('🐌', px) };
document.getElementById('measures').textContent = JSON.stringify({
  bouton, std, glyphe, encres,
  debordeHaut: +(bouton.y + 1 - glyphe.y).toFixed(2),
  debordeBas: +(glyphe.y + glyphe.h - (bouton.y + bouton.h - 1)).toFixed(2),
  debordeGauche: +(bouton.x + 1 - glyphe.x).toFixed(2),
  debordeDroite: +(glyphe.x + glyphe.w - (bouton.x + bouton.w - 1)).toFixed(2),
  barre: r(document.querySelector('.canvas-controls')),
}, null, 1);
</script></body>`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'p.html'), page);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
	'--window-size=1200,400', '--virtual-time-budget=4000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
	{ encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const m = dom.match(/<pre id="measures">([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"') : 'MESURES INTROUVABLES');
