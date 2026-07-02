// TEMP — compare les pastilles de svg retouche/mega.edit.svg (résolues getCTM, repère
// feuille) aux broches réelles de la carte mega (pinInfo). Détermine l'échelle du
// fichier vs le repère éditeur (pinInfo × pinScale). À supprimer.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });
const PIN_SCALE = 10 / 9.6; // WOKWI_PIN_SCALE (mega)

const megaSvg = readFileSync(join(ROOT, 'svg retouche/mega.edit.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');

const entry = `
import '../../src/webview/composants/arduino-mega-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const el = document.createElement('kablix-arduino-mega');
  document.body.appendChild(el);
  try { if (el.updateComplete) await el.updateComplete; } catch(e){}
  await wait(80);
  const pinInfo = (el.pinInfo || []).map(p => ({ name: p.name, x: p.x, y: p.y }));
  // pastilles retouchées
  const wrap = document.createElement('div');
  wrap.innerHTML = ${JSON.stringify(megaSvg)};
  document.body.appendChild(wrap);
  const svg = wrap.querySelector('svg');
  const dots = [];
  for (const c of svg.querySelectorAll('circle[id^="pin-"],ellipse[id^="pin-"]')) {
    const m = c.getCTM(); if (!m) continue;
    const cx = parseFloat(c.getAttribute('cx')||'0'), cy = parseFloat(c.getAttribute('cy')||'0');
    dots.push({ name: c.id.replace(/^pin-/,''), x: m.a*cx+m.c*cy+m.e, y: m.b*cx+m.d*cy+m.f });
  }
  document.getElementById('result').textContent = JSON.stringify({ vb: svg.getAttribute('viewBox'), pinInfo, dots });
}
run().catch(e=>document.getElementById('result').textContent='ERR:'+(e&&e.stack||e));
`;
const entryPath = join(SCRATCH, 'mg-entry.mjs');
writeFileSync(entryPath, entry);
const bundle = await esbuild({ entryPoints: [entryPath], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' } });
const htmlPath = join(SCRATCH, 'mg.html');
writeFileSync(htmlPath, `<!doctype html><meta charset=utf-8><body><pre id="result"></pre><script>${bundle.outputFiles[0].text}</script></body>`);
const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
const dom = execFileSync(chrome, ['--headless','--disable-gpu','--no-sandbox','--virtual-time-budget=15000','--dump-dom',`file:///${htmlPath.replace(/\\/g,'/')}`], { encoding:'utf8', maxBuffer:64*1024*1024 });
const a0 = dom.indexOf('<pre id="result">') + 17, b0 = dom.indexOf('</pre>', a0);
const raw = dom.slice(a0, b0).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
if (raw.startsWith('ERR')) { console.error(raw.slice(0,1500)); process.exit(1); }
const { vb, pinInfo, dots } = JSON.parse(raw);
console.log(`viewBox feuille: ${vb}   pinInfo=${pinInfo.length}  dots=${dots.length}`);
// Surcharge = point rouge tel quel (repère = coin haut-gauche de la feuille),
// arrondi au px. Aucune marge soustraite.
const r1 = (n) => Math.round(n);
const lines = dots.map((d) => `    '${d.name}': { x: ${r1(d.x)}, y: ${r1(d.y)} },`);
const block = `  'mega': {\n${lines.join('\n')}\n  },`;
writeFileSync(join(SCRATCH, 'mega-override.txt'), block);
console.log(`\nÉcrit node_modules/.cache-retouche/mega-override.txt (${dots.length} broches)`);
console.log(block.split('\n').slice(0, 8).join('\n') + '\n    ...');
