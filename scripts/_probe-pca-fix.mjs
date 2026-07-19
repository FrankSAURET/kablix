// TEMP — essaie des deltas de translate sur g659 (bloc P11/P12 décalé de
// +2,7 px) et mesure la position de connector11terminal. À supprimer.
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
  const g = svg.querySelector('#g659');
  const t11 = svg.querySelector('#connector11terminal');
  const center = () => {
    const m = t11.getCTM(); const b = t11.getBBox();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    return [(m.a*cx+m.c*cy+m.e).toFixed(3), (m.b*cx+m.d*cy+m.f).toFixed(3)];
  };
  const lines = ['base: ' + center()];
  for (const dt of [714.375, -714.375]) {
    g.setAttribute('transform', 'translate(' + (44.464346 + dt) + ',-4577.9215)');
    lines.push('dt=' + dt + ' -> ' + center());
  }
  // affine autour du meilleur : cible x=100.0
  document.getElementById('result').textContent = lines.join('\\n');
}
run().catch(e=>document.getElementById('result').textContent='ERR:'+(e&&e.stack||e));
`;
const htmlPath = join(SCRATCH, 'pcaf.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body><pre id="result"></pre><script>${script}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
console.log(dom.slice(a0, b0).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
