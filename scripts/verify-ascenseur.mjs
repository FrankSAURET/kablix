// Les FLÈCHES de l'ascenseur d'une liste crantée, éprouvées au VRAI clic.
//
// Retour de Frank (deux fois) : « les flèches de la barre de défilement passent
// directement de en haut à en bas et ne permettent en aucun cas de sélectionner
// un transistor ». Le banc verify-transistor simule les flèches en POSANT
// `scrollTop` : il ne voit donc RIEN de ce que fait le navigateur pour de vrai
// — animation du clic de flèche, répétition au maintien, `scrollend`. Or c'est
// exactement là qu'était le défaut : le recalage tombait en pleine animation de
// Chrome, les deux se disputaient la position et la liste sautait au fond.
//
// Ici, Chrome est piloté par CDP et la souris clique VRAIMENT sur la flèche de
// la barre. Le code éprouvé est le VRAI module `liste-crantee.mts`, celui qui
// tourne chez l'utilisateur — pas une copie.
//
// Mesuré (v2026.8.3) : 37 px par clic, soit une entrée. Avant la correction :
// 334 px au premier clic, le FOND au cinquième.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-ascenseur');
const PORT = 9333;

let failures = 0;
let checks = 0;
const ok = (label, cond, detail = '') => {
  checks++;
  if (cond) console.log(`✅ ${label}`);
  else { failures++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

// --- La page : une liste comme celle des modèles de transistor ----------------
// Entrées de hauteur INÉGALE (une sur cinq porte une explication sur deux
// lignes), comme le modèle personnalisé de la vraie liste : un calage qui
// suppose une hauteur constante ne passerait pas.
mkdirSync(CACHE, { recursive: true });
const entry = `
import { installerListeCrantee } from '../../src/webview/diagram/liste-crantee.mjs';
const liste = document.getElementById('liste');
for (let i = 0; i < 40; i++) {
  const d = document.createElement('button');
  d.className = 'r';
  d.innerHTML = '<strong>MODELE ' + i + '</strong><small>' +
    (i % 5 === 0 ? 'explication plus longue, sur deux lignes de description' : 'court') + '</small>';
  liste.appendChild(d);
}
// Position de chaque entrée DANS le contenu défilé : c'est la grille sur
// laquelle le défilement doit retomber.
window.__hauts = () => {
  const base = liste.getBoundingClientRect().top - liste.scrollTop;
  return [...liste.children].map((r) => r.getBoundingClientRect().top - base);
};
if (!location.search.includes('brut')) installerListeCrantee(liste);
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  absWorkingDir: ROOT, logLevel: 'silent',
});
const page = join(CACHE, 'p.html');
writeFileSync(page, `<!doctype html><meta charset=utf8>
<style>
  body { margin: 0; font: 13px sans-serif; }
  #liste { width: 240px; max-height: 208px; overflow-y: auto; display: flex;
           flex-direction: column; gap: 2px; border: 1px solid #888; }
  .r { display: flex; flex-direction: column; align-items: flex-start; font: inherit;
       text-align: left; padding: 4px 6px; background: #eee; border: 1px solid transparent; }
  .r small { font-size: 11px; color: #555; }
</style>
<body><div id="liste"></div><script>${b.outputFiles[0].text}</script></body>`);

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }

// --- Pilotage de Chrome par CDP ----------------------------------------------
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Un port ET un profil par instance : deux Chrome qui partagent un profil se
// rejoignent (le second rend la main au premier) et le port du second reste muet.
let instance = 0;
async function ouvrir(query = '') {
  const port = PORT + instance++;
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=900,700',
    `--remote-debugging-port=${port}`, `--user-data-dir=${join(CACHE, `profil${instance}`)}`,
    `file:///${page.replace(/\\/g, '/')}${query}`,
  ], { stdio: 'ignore' });
  let t;
  for (let i = 0; i < 80 && !t; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      t = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch { /* pas encore prêt */ }
    if (!t) await pause(250);
  }
  if (!t) { proc.kill(); throw new Error('Chrome ne répond pas sur le port CDP'); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const attente = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && attente.has(m.id)) { attente.get(m.id)(m); attente.delete(m.id); }
  };
  const cdp = (method, params = {}) => {
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((res, rej) =>
      attente.set(n, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))));
  };
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  await pause(500);
  return {
    cdp, evalJs,
    fermer: () => { ws.close(); proc.kill(); },
    clic: async (x, y, tenirMs = 30) => {
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
      await pause(tenirMs);
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
      await pause(400); // le recalage attend la fin du geste (scrollend / 90 ms)
    },
  };
}

const GEO = `(() => {
  const l = document.getElementById('liste');
  const r = l.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, barre: l.offsetWidth - l.clientWidth,
           plafond: l.scrollHeight - l.clientHeight };
})()`;
const TOP = 'document.getElementById("liste").scrollTop';

// --- 1. Avec le module : un clic de flèche = une entrée -----------------------
{
  const p = await ouvrir();
  const geo = await p.evalJs(GEO);
  const hauts = await p.evalJs('window.__hauts()');
  if (geo.barre < 2) {
    console.log('SKIP : pas de barre de défilement rendue par ce Chrome.');
    p.fermer();
    process.exit(0);
  }
  ok('la liste déborde de sa fenêtre (il y a de quoi défiler)', geo.plafond > 100, `${geo.plafond} px`);
  const x = geo.x + geo.w - geo.barre / 2;
  const bas = geo.y + geo.h - 6;
  const haut = geo.y + 6;

  const suite = [];
  for (let i = 0; i < 5; i++) { await p.clic(x, bas); suite.push(await p.evalJs(TOP)); }
  ok('cinq clics sur la flèche BAS : cinq entrées, une par clic',
    suite.every((v, i) => Math.abs(v - hauts[i + 1]) < 1.5),
    `${JSON.stringify(suite)} pour ${JSON.stringify(hauts.slice(1, 6))}`);
  ok('la liste ne saute PAS au fond (le défaut signalé par Frank)',
    suite[4] < geo.plafond / 2, `${suite[4]} px sur ${geo.plafond}`);

  const remonte = [];
  for (let i = 0; i < 3; i++) { await p.clic(x, haut); remonte.push(await p.evalJs(TOP)); }
  ok('flèche HAUT : on remonte d’une entrée à la fois, sans en sauter',
    remonte.every((v, i) => Math.abs(v - hauts[4 - i]) < 1.5),
    `${JSON.stringify(remonte)} pour ${JSON.stringify([hauts[4], hauts[3], hauts[2]])}`);

  // Maintien : Chrome répète le défilement toutes les ~50 ms et l'anime. Rien ne
  // doit bouger tant qu'on tient ; au relâchement, on retombe sur une entrée.
  await p.evalJs(`${TOP} = 0`);
  await pause(200);
  await p.clic(x, bas, 800);
  const apres = await p.evalJs(TOP);
  const grille = await p.evalJs('window.__hauts()');
  ok('maintien de la flèche : au relâchement, on retombe pile sur une entrée',
    grille.some((y) => Math.abs(y - apres) < 1.5) || Math.abs(apres - geo.plafond) < 1.5,
    `${apres} px`);
  ok('maintien de la flèche : la liste avance vraiment, sans filer au fond',
    apres > 100 && apres < geo.plafond, `${apres} px sur ${geo.plafond}`);
  p.fermer();
  await pause(300);
}

// --- 2. Sans le module : le navigateur coupe les entrées ----------------------
// Contre-épreuve : c'est bien NOUS qui calons. Chrome défile de son pas (~40 px)
// et retombe entre deux entrées.
{
  const p = await ouvrir('?brut');
  const geo = await p.evalJs(GEO);
  const hauts = await p.evalJs('window.__hauts()');
  const x = geo.x + geo.w - geo.barre / 2;
  const suite = [];
  for (let i = 0; i < 5; i++) { await p.clic(x, geo.y + geo.h - 6); suite.push(await p.evalJs(TOP)); }
  const cale = suite.filter((v) => hauts.some((y) => Math.abs(y - v) < 1.5)).length;
  ok('contre-épreuve : sans le module, le défilement tombe entre deux entrées',
    cale < suite.length, `${JSON.stringify(suite)} — ${cale}/${suite.length} calés`);
  p.fermer();
}

console.log(`\nascenseur : ${checks} contrôles, ${failures} échec(s).`);
console.log(failures === 0 ? 'RESULTAT: OK' : 'RESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
