// SONDE (outil d'atelier) — VRAIS clics sur les flèches d'un ascenseur.
//
// Le banc verify-transistor simule les flèches en POSANT `scrollTop` : il ne
// peut donc pas voir ce que fait le navigateur pour de vrai (animation du clic
// de flèche, répétition au maintien, `scrollend`). Frank signale depuis deux
// versions que « les flèches passent directement du haut au bas » — cette
// sonde pilote Chrome par CDP et clique VRAIMENT sur la flèche de la barre.
//
// Usage : node scripts/_probe-fleche-ascenseur.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-fleche');
const PORT = 9333;

// Reprise FIDÈLE du code de editor.mts (bloc « Molette : UN cran = UNE
// entrée » + `recale`), posé sur une liste d'entrées de hauteur inégale comme
// la vraie liste des modèles de transistor.
let CODE = readFileSync(join(ROOT, 'scripts', '_fleche-liste.js'), 'utf8');
// `--v8.2` rejoue le code d'AVANT la correction : le recalage tombait à chaque
// événement `scroll`, donc EN PLEINE animation du clic de flèche. Sert de
// contre-épreuve — la sonde doit voir le saut que Frank décrivait.
if (process.argv.includes('--v8.2')) {
  CODE = CODE.replace(
    /let finDefilement[\s\S]*$/,
    "list.addEventListener('scroll', recale);\n"
  );
}

mkdirSync(CACHE, { recursive: true });
const page = join(CACHE, 'p.html');
writeFileSync(page, `<!doctype html><meta charset=utf8>
<style>
  body { margin: 0; font: 13px sans-serif; }
  #liste { width: 240px; max-height: 208px; overflow-y: auto; display: flex;
           flex-direction: column; gap: 2px; border: 1px solid #888; }
  .r { padding: 4px 6px; background: #eee; }
  .r small { display: block; font-size: 11px; color: #555; }
</style>
<body><div id="liste"></div>
<script>
const liste = document.getElementById('liste');
for (let i = 0; i < 40; i++) {
  const d = document.createElement('div');
  d.className = 'r';
  d.innerHTML = '<b>MODELE ' + i + '</b><small>' + (i % 5 === 0 ? 'ligne longue, deux lignes de description' : 'court') + '</small>';
  liste.appendChild(d);
}
${CODE}
</script></body>`);

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — sonde sautée'); process.exit(0); }

const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=900,700',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(CACHE, 'profil')}`,
  `file:///${page.replace(/\\/g, '/')}`,
], { stdio: 'ignore' });

/** Attend que le port CDP réponde et rend la cible « page ». */
async function cible() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p;
    } catch { /* pas encore là */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome ne répond pas sur le port CDP');
}

const t = await cible();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const attente = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && attente.has(m.id)) { attente.get(m.id)(m); attente.delete(m.id); }
};
function cdp(method, params = {}) {
  const n = ++id;
  ws.send(JSON.stringify({ id: n, method, params }));
  return new Promise((res, rej) => attente.set(n, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))));
}
async function evalJs(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description ?? ''));
  return r.result.value;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

await pause(600);
const geo = await evalJs(`(() => {
  const l = document.getElementById('liste');
  const r = l.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height,
    barre: l.offsetWidth - l.clientWidth,
    plafond: l.scrollHeight - l.clientHeight,
    entrees: l.children.length };
})()`);
console.log('liste :', JSON.stringify(geo));
if (geo.barre < 2) {
  console.log('⚠ pas de barre de défilement rendue en headless : le clic de flèche ne peut pas être sondé.');
  ws.close(); proc.kill(); process.exit(0);
}

/** Clic (appui + relâchement) au point donné. */
async function clic(x, y) {
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await pause(30);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
}

const xBarre = geo.x + geo.w - geo.barre / 2;
const yFlecheBas = geo.y + geo.h - 6;
const yFlecheHaut = geo.y + 6;

console.log('\n— cinq clics sur la flèche BAS (attendu : une entrée à chaque fois)');
for (let i = 1; i <= 5; i++) {
  await clic(xBarre, yFlecheBas);
  await pause(400);
  console.log(`  clic ${i} → ${JSON.stringify(await evalJs('({top: document.getElementById("liste").scrollTop, haut: window.__haut})'))}`);
}
console.log('\n— trois clics sur la flèche HAUT');
for (let i = 1; i <= 3; i++) {
  await clic(xBarre, yFlecheHaut);
  await pause(400);
  console.log(`  clic ${i} → ${JSON.stringify(await evalJs('({top: document.getElementById("liste").scrollTop, haut: window.__haut})'))}`);
}
console.log('\n— maintien de la flèche BAS (800 ms)');
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: xBarre, y: yFlecheBas, button: 'left', clickCount: 1, buttons: 1 });
await pause(800);
await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: xBarre, y: yFlecheBas, button: 'left', clickCount: 1, buttons: 0 });
await pause(500);
console.log(`  après maintien → ${JSON.stringify(await evalJs('({top: document.getElementById("liste").scrollTop, haut: window.__haut, plafond: document.getElementById("liste").scrollHeight - document.getElementById("liste").clientHeight})'))}`);

ws.close();
proc.kill();
