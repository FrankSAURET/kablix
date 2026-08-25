// Diagnostic de l'oscilloscope : la trace tombe-t-elle sur la grille dessinée ?
// le texte de calibre déborde-t-il de l'écran ? les aiguilles tournent-elles ?
// Rendu du VRAI élément en Chrome headless, mesures dans le DOM + capture.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-diag');
mkdirSync(SCRATCH, { recursive: true });

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((c) => existsSync(c));

const entry = `
import '../../src/webview/composants/oscillo-element.mjs';

// Quatre appareils : carré 0/5 V, sinus 1 V, rampe, et un écran vierge.
const CAS = [
  { volts: '1', sdiv: '1', signal: (s) => (Math.floor(s) % 2 ? 5 : 0) },
  { volts: '1', sdiv: '1', signal: (s) => Math.sin(s * Math.PI * 2 / 4) },
  { volts: '2', sdiv: '0.5', signal: (s) => (s % 2) * 2.5 },
  { volts: '0.1', sdiv: '1000', signal: null },
];

const out = [];
for (const cas of CAS) {
  const el = document.createElement('kablix-oscillo');
  el.setAttribute('voltsdiv', cas.volts);
  el.setAttribute('sdiv', cas.sdiv);
  el.setAttribute('simulating', '');
  el.style.display = 'inline-block';
  document.body.appendChild(el);
  if (cas.signal) {
    // 10 s de signal à 60 images/s, exactement comme la simulation.
    for (let i = 0; i <= 600; i++) el.push(i * 1000 / 60, cas.signal(i / 60));
  }
  out.push({ el, cas });
}

// Deuxième rangée : les deux boutons vus de près, un par cran du Volts/Div —
// l'aiguille doit tomber pile sur la graduation dessinée.
const zooms = document.createElement('div');
zooms.style.cssText = 'white-space:nowrap';
document.body.appendChild(zooms);
for (const v of ['0.1', '0.5', '1', '2', '5']) {
  const box = document.createElement('div');
  box.style.cssText = 'width:170px;height:110px;overflow:hidden;display:inline-block;border:1px solid #555';
  const el = document.createElement('kablix-oscillo');
  el.setAttribute('voltsdiv', v);
  el.setAttribute('sdiv', '1');
  el.style.cssText = 'display:block;transform:scale(3);transform-origin:0 0;margin-left:-345px;margin-top:-660px';
  box.appendChild(el);
  zooms.appendChild(box);
}

setTimeout(() => {
  const res = out.map(({ el, cas }) => {
    const r = el.shadowRoot;
    const trace = r.querySelector('#oscillo-trace');
    const cal = r.querySelector('#oscillo-calibre');
    const ecran = r.querySelector('#Ecran-4');
    const host = el.getBoundingClientRect();
    const rel = (n) => {
      const b = n.getBoundingClientRect();
      return [+(b.x - host.x).toFixed(2), +(b.y - host.y).toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)];
    };
    const cb = rel(cal), eb = rel(ecran);
    return {
      cas: cas.volts + ' V/div, ' + cas.sdiv + ' s/div',
      calibre: cal.textContent,
      trace: trace.getAttribute('d') ? rel(trace) : 'vide',
      dDebut: (trace.getAttribute('d') || '').slice(0, 80),
      calBoite: cb,
      ecran: eb,
      deborde: cb[0] < eb[0] || cb[0] + cb[2] > eb[0] + eb[2] || cb[1] + cb[3] > eb[1] + eb[3],
      aiguilleVolts: r.querySelector('#oscillo-aiguille-volts')?.getAttribute('transform') ?? 'ABSENT',
      aiguilleTemps: r.querySelector('#oscillo-aiguille-time')?.getAttribute('transform') ?? 'ABSENT',
    };
  });
  document.getElementById('res').textContent = JSON.stringify(res, null, 1);
}, 200);
`;

const entryPath = join(SCRATCH, 'entry-osc.mjs');
writeFileSync(entryPath, entry);
const bundle = await esbuild({
  entryPoints: [entryPath], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' },
});
const htmlPath = join(SCRATCH, 'oscillo.html');
writeFileSync(htmlPath,
  `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222}kablix-oscillo{display:inline-block}</style>` +
  `<body><pre id="res" style="position:absolute;left:-9999px"></pre><script>${bundle.outputFiles[0].text}</script></body>`);

const url = `file:///${htmlPath.replace(/\\/g, '/')}`;
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="res"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'PAS DE RESULTAT');

const shot = join(SCRATCH, 'oscillo.png');
execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--virtual-time-budget=8000', `--screenshot=${shot}`, '--window-size=920,420', url,
], { stdio: 'ignore' });
console.log('capture:', shot);
