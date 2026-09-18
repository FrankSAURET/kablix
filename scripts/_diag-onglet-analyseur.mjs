// Diagnostic : ce que l'ONGLET de l'analyseur peint pour de vrai, dans un
// Chrome headless, quand on lui envoie EXACTEMENT les deux messages que lui
// envoie l'hôte à l'ouverture d'un .projix (voies, puis restaure).
//
// Motif : Frank ne voit RIEN dans l'onglet (logic-analiser.png) alors que la
// capture est dans le fichier et que le modèle résout les voies. Un canvas
// intégralement blanc, sans même le message « aucune sonde », n'est pas un
// défaut de données : c'est le rendu qui n'a pas eu lieu, ou qui a eu lieu
// sur un canvas de taille nulle.
//
// Usage : node scripts/_diag-onglet-analyseur.mjs [testkablix/sonde-logique-pico.projix]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-onglet');
const cible = process.argv[2] ?? 'testkablix/sonde-logique-pico.projix';

const zip = await JSZip.loadAsync(readFileSync(join(ROOT, cible)));
const manifest = JSON.parse(await zip.file('kablix.json').async('string'));
const capture = manifest.analyseur ?? null;

mkdirSync(CACHE, { recursive: true });
const b = await esbuild({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});

// L'onglet tourne DANS un webview VS Code : on reproduit sa page (même feuille
// de style que analyseur-panel.ts, dont la règle #trace sans hauteur).
const page = `<!doctype html><meta charset=utf8>
<style>
 body { margin:0; padding:0; font:13px sans-serif; }
 .barre { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:6px 10px; border-bottom:1px solid #ccc; }
 #legende { display:flex; flex-wrap:wrap; gap:4px 12px; padding:5px 10px 0; }
 #trace { display:block; width:100%; }
 .aide { padding:4px 10px 8px; opacity:.6; }
</style>
<body>
<div class="barre">
 <label>Trigger <select id="decl-voie"></select>
  <select id="decl-sens"><option value="rising">rising</option><option value="falling">falling</option></select></label>
 <div id="decodages"></div>
 <button id="ajout-decodage" type="button">+ Decode</button>
 <button id="tout" type="button">Whole capture</button>
 <button id="suivre" type="button">Follow live</button>
 <span id="etat"></span>
</div>
<div id="legende"></div>
<canvas id="trace"></canvas>
<div class="aide">Wheel to zoom, drag to pan.</div>
<script>
 // Faux pont VS Code : l'onglet poste ses réglages, personne ne les lit ici.
 window.acquireVsCodeApi = () => ({ postMessage() {} });
 window.KABLIX_LANG = 'en';
</script>
<script>${b.outputFiles[0].text}</script>
<script>
 const ETAT = ${JSON.stringify(capture)};
 const VOIES = ${JSON.stringify(process.argv[3] === '--voies' ? [] : [])};
 const post = (m) => window.dispatchEvent(new MessageEvent('message', { data: m }));
 const wait = (ms) => new Promise((r) => setTimeout(r, ms));
 (async () => {
  const lignes = [];
  const cv = document.getElementById('trace');
  const mesure = (quand) => {
   const r = cv.getBoundingClientRect();
   // Un canvas peint laisse des pixels non transparents : on compte.
   let peints = 0;
   try {
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, Math.max(1, cv.width), Math.max(1, cv.height)).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) peints++;
   } catch (e) { peints = -1; }
   lignes.push({ quand, styleH: cv.style.height, clientW: cv.clientWidth, clientH: cv.clientHeight,
    attrW: cv.width, attrH: cv.height, rectW: +r.width.toFixed(1), rectH: +r.height.toFixed(1), peints,
    declVoie: document.getElementById('decl-voie').options.length,
    legende: document.getElementById('legende').textContent.trim().slice(0, 120) });
  };
  const erreurs = [];
  window.addEventListener('error', (e) => erreurs.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => erreurs.push('rejet: ' + String(e.reason && e.reason.message)));
  await wait(100);
  mesure('au chargement');
  // Ce que l'hôte envoie à l'ouverture d'un .projix : la liste des voies de
  // l'ATELIER (vide tant que la simulation n'a pas tourné), puis la capture.
  post({ type: 'voies', voies: VOIES });
  await wait(100);
  mesure('apres voies=[]');
  if (ETAT) post({ type: 'restaure', etat: ETAT });
  await wait(300);
  mesure('apres restaure');
  // Combien de rAF le navigateur a-t-il servi depuis le chargement ? Si rAF
  // est gelé, tout appel de dessin reste en attente et l'onglet ne repeint jamais.
  let servis = 0;
  const tic = () => { servis++; requestAnimationFrame(tic); };
  requestAnimationFrame(tic);
  await wait(500);
  lignes.push({ quand: 'rAF servis en 500 ms', peints: servis });
  mesure('apres 500 ms de plus');
  lignes.push({ quand: 'erreurs', legende: erreurs.join(' | ').slice(0, 400) });
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify(lignes);
  document.body.appendChild(out);
 })();
</script>
</body>`;
writeFileSync(join(CACHE, 'p.html'), page);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=900,700', '--virtual-time-budget=25000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); console.log(dom.slice(0, 2000)); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log('--', cible, '— capture dans le fichier :', capture ? (capture.voies?.length ?? 0) + ' voie(s)' : 'AUCUNE');
for (const r of rows) console.log(' ', JSON.stringify(r));
