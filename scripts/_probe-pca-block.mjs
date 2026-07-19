// TEMP — remonte les ancêtres de connector11terminal (bloc P11/P12 décalé de
// 2,7 px) : id, transform, boîte rendue — pour trouver le groupe à recaler. À supprimer.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });

const svg = readFileSync(join(ROOT, 'media/parts/16-Channel PWM Driver(PCA9685).svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');

const script = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const wrap = document.createElement('div');
  wrap.innerHTML = ${JSON.stringify(svg)};
  document.body.appendChild(wrap);
  const svg = wrap.querySelector('svg');
  await wait(50);
  const lines = [];
  const box = (el) => {
    try {
      const m = el.getCTM(); const b = el.getBBox();
      const pts = [[b.x,b.y],[b.x+b.width,b.y+b.height]].map(([px,py]) => [m.a*px+m.c*py+m.e, m.b*px+m.d*py+m.f]);
      const x1 = Math.min(pts[0][0],pts[1][0]).toFixed(1), x2 = Math.max(pts[0][0],pts[1][0]).toFixed(1);
      const y1 = Math.min(pts[0][1],pts[1][1]).toFixed(1), y2 = Math.max(pts[0][1],pts[1][1]).toFixed(1);
      return '(' + x1 + ',' + y1 + ')-(' + x2 + ',' + y2 + ')';
    } catch { return '?'; }
  };
  let el = svg.querySelector('#connector11terminal');
  while (el && el !== svg) {
    lines.push((el.id || el.tagName) + '  transform=' + (el.getAttribute('transform') || '-') + '  boite=' + box(el) + '  enfants=' + el.children.length);
    el = el.parentElement;
  }
  // comparaison : ancêtres proches de connector13terminal (bloc P13/P14, bien calé)
  lines.push('--- P13 ---');
  el = svg.querySelector('#connector13terminal');
  for (let k = 0; el && el !== svg && k < 4; k++) {
    lines.push((el.id || el.tagName) + '  transform=' + (el.getAttribute('transform') || '-') + '  boite=' + box(el) + '  enfants=' + el.children.length);
    el = el.parentElement;
  }
  document.getElementById('result').textContent = lines.join('\\n');
}
run().catch(e=>document.getElementById('result').textContent='ERR:'+(e&&e.stack||e));
`;
const htmlPath = join(SCRATCH, 'pcab.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body><pre id="result"></pre><script>${script}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
console.log(dom.slice(a0, b0).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
