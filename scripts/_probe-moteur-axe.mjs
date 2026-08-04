// Mesure jetable : le pignon du moteur reste-t-il centré quand il tourne ?
// Frank : « l'axe n'est pas le bon, l'engrenage bouge ». On fige la rotation à
// plusieurs angles et on relève le centre du pignon À L'ÉCRAN : s'il se
// déplace, l'origine de rotation est fausse.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-moteur-axe');
mkdirSync(CACHE, { recursive: true });

const entry = `
import '../../src/webview/composants/moteur-dc-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const el = document.createElement('kablix-moteur-dc');
  el.speed = 30;
  document.body.appendChild(el);
  await el.updateComplete;
  await wait(80);
  const wrap = el.shadowRoot.querySelector('.spin');
  const pignon = el.shadowRoot.querySelector('#path222-7');
  const L = [];
  L.push('bladeCount = ' + el.bladeCount);
  L.push('transform-origin posé = ' + wrap.style.transformOrigin);
  L.push('durée = ' + wrap.style.animationDuration + ' filtre = ' + (wrap.style.filter || '(aucun)'));

  // Rotation figée : on remplace l'animation par un transform explicite.
  wrap.style.animation = 'none';
  const releve = (deg) => {
    wrap.style.transform = 'rotate(' + deg + 'deg)';
    const r = pignon.getBoundingClientRect();
    return { deg, cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
  };
  const mesures = [0, 9, 18, 45, 90, 180, 270].map(releve);
  for (const m of mesures)
    L.push('  ' + String(m.deg).padStart(3) + '° : centre ' + m.cx.toFixed(2) + ', ' + m.cy.toFixed(2)
      + '  (boîte ' + m.w.toFixed(2) + ' × ' + m.h.toFixed(2) + ')');
  const cx = mesures.map((m) => m.cx), cy = mesures.map((m) => m.cy);
  L.push('AMPLITUDE du centre : dx=' + (Math.max(...cx) - Math.min(...cx)).toFixed(3)
    + ' px  dy=' + (Math.max(...cy) - Math.min(...cy)).toFixed(3) + ' px');

  // Même relevé avec le filtre de flou retiré (le flou élargit la boîte écran).
  wrap.style.filter = '';
  const sans = [0, 9, 18, 45, 90, 180, 270].map(releve);
  const sx = sans.map((m) => m.cx), sy = sans.map((m) => m.cy);
  L.push('sans flou : dx=' + (Math.max(...sx) - Math.min(...sx)).toFixed(3)
    + ' px  dy=' + (Math.max(...sy) - Math.min(...sy)).toFixed(3) + ' px');

  // Vitesse affichée sur toute la plage utile (tours/s animés).
  wrap.style.animation = '';
  for (const v of [0, 30, 40, 60, 80, 100, 150]) {
    el.speed = v;
    el.requestUpdate();
    await el.updateComplete;
    const d = parseFloat(wrap.style.animationDuration) || 0;
    L.push('speed=' + String(v).padStart(3) + ' tr/s  →  ' + (d ? (1/d).toFixed(3) : '0') + ' tour/s affiché'
      + (d ? '  (' + (10/d).toFixed(2) + ' dents/s, ' + (360/d/4).toFixed(0) + '°/quart de seconde)' : ''));
  }

  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = L.join('\\n');
  document.body.appendChild(out);
}
run().catch((e) => {
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = 'exception ' + e.message + '\\n' + e.stack;
  document.body.appendChild(out);
});
`;
writeFileSync(join(CACHE, 'axe.mjs'), entry);
const b = await esbuild.build({
  entryPoints: [join(CACHE, 'axe.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
writeFileSync(join(CACHE, 'axe.html'),
  `<!doctype html><meta charset=utf8><body style="margin:0"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=15000', '--dump-dom',
  `file:///${join(CACHE, 'axe.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'aucune mesure');
