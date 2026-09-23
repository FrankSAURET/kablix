// Reproduction de la page grise de Frank (23/09), avec ses VRAIES données.
//
// Séquence reproduite, celle d'un lancement de simulation sur un projet déjà
// ouvert — pas celle d'un chargement de projet, déjà couverte par
// verify-analyseur-projix :
//   1. l'atelier ouvre l'onglet (openAnalyseur)
//   2. l'atelier pousse ses voies (pousserVoiesLogiques)
//   3. l'atelier annonce le départ (analyseurDepart)
//   4. les salves arrivent, image par image
// Les messages 2-4 partent AVANT que la page ait dit « je suis prête » : ils
// passent donc par la file d'attente de analyseur-panel.ts, qui les délivre
// APRÈS pousserEtat(). C'est cet ordre-là qu'on veut mesurer.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url).href.replace('/V:/Temp/claude/', '/V:/Temp/claude/'));
const PROJET = 'C:/- VS Code/Extensions/Kablix';
const CACHE = join(tmpdir(), 'kablix-repro-gris');
mkdirSync(CACHE, { recursive: true });

// Les voies telles que l'atelier les pousse pour sonde-logique-uno (3 pinces),
// lues dans le journal réel de Frank.
const VOIES_SAINES = [
	{ voie: 0, pin: '8', nom: 'horloge', probleme: null, analogique: false, suivi: false },
	{ voie: 1, pin: '9', nom: '9', probleme: null, analogique: false, suivi: false },
	{ voie: 3, pin: 'A0', nom: 'A0', probleme: null, analogique: true, suivi: false },
];

// Les premières salves du journal réel, converties au format des messages.
const csv = readFileSync('V:/Temp/kablix-analyseur/sonde-logique-uno-a595df9a4cdf.csv', 'utf8');
const parPin = {};
let n = 0;
for (const ligne of csv.split('\n')) {
	if (!ligne || ligne.startsWith('#') || ligne.startsWith('temps_ms')) continue;
	const [t, , pin, , niveau] = ligne.split(',');
	(parPin[pin] ||= []).push(Number(t), Number(niveau));
	if (++n >= 6000) break;
}

const b = await build({
	entryPoints: [join(PROJET, 'src/webview/analyseur.mts')],
	bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: PROJET,
});

const page = `<!doctype html><meta charset=utf8>
<style>
 body { margin:0; padding:0; font:13px sans-serif; }
 .barre { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:6px 10px; border-bottom:1px solid #ccc; }
 #trace { display:block; width:100%; }
 .aide { padding:4px 10px 8px; opacity:.6; }
</style>
<body>
<div class="barre">
 <label>Sampling <select id="horloge"><option value="0">Unlimited</option></select></label>
 <button id="tout" type="button">Whole capture</button>
 <button id="suivre" type="button">Follow live</button>
 <span id="etat"></span>
</div>
<canvas id="trace"></canvas>
<div class="aide">Wheel to zoom, drag to pan.</div>
<script>
 window.acquireVsCodeApi = () => ({ postMessage() {} });
 window.KABLIX_LANG = 'en';
</script>
<script>${b.outputFiles[0].text}</script>
<script>
 const VOIES = ${JSON.stringify(VOIES_SAINES)};
 const SALVES = ${JSON.stringify(parPin)};
 const post = (m) => window.dispatchEvent(new MessageEvent('message', { data: m }));
 const wait = (ms) => new Promise((r) => setTimeout(r, ms));
 (async () => {
  const erreurs = [];
  window.addEventListener('error', (e) => erreurs.push(String(e.message)));
  const cv = document.getElementById('trace');
  const pixels = () => {
   try {
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let k = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) k++;
    return k;
   } catch (e) { return -1; }
  };
  const mesures = {};
  await wait(80);

  // --- SCÉNARIO A : l'ordre que produit la FILE d'attente d'un onglet neuf.
  // pousserEtat() passe en premier (voies du fournisseur d'état, capture nulle),
  // PUIS la file délivre ce que l'atelier avait envoyé entre-temps.
  post({ type: 'voies', voies: VOIES });        // pousserEtat : voies déjà connues de l'hôte
  await wait(60);
  post({ type: 'voies', voies: VOIES });        // file : pousserVoiesLogiques()
  await wait(60);
  post({ type: 'depart' });                     // file : analyseurDepart
  await wait(60);
  for (const [pin, plat] of Object.entries(SALVES)) post({ type: 'fronts', salves: { [pin]: plat } });
  await wait(400);
  post({ type: 'repeindre' });
  await wait(250);
  mesures.A_file_normale = pixels();

  // --- SCÉNARIO B : l'hôte ne connaît PAS encore les voies quand l'onglet
  // s'ouvre. C'est le cas d'un lancement de simulation : openAnalyseur part
  // AVANT pousserVoiesLogiques(), donc analyseurVoies est encore vide côté
  // extension et pousserEtat() envoie une LISTE VIDE.
  post({ type: 'voies', voies: [] });           // pousserEtat avec analyseurVoies vide
  await wait(60);
  post({ type: 'voies', voies: VOIES });        // file : pousserVoiesLogiques()
  await wait(60);
  post({ type: 'depart' });
  await wait(60);
  for (const [pin, plat] of Object.entries(SALVES)) post({ type: 'fronts', salves: { [pin]: plat } });
  await wait(400);
  post({ type: 'repeindre' });
  await wait(250);
  mesures.B_hote_sans_voies = pixels();

  // --- SCÉNARIO C : le DÉPART arrive APRÈS les voies mais la capture est
  // remise à zéro alors que des fronts sont déjà versés (ordre file inversé).
  post({ type: 'voies', voies: VOIES });
  await wait(60);
  for (const [pin, plat] of Object.entries(SALVES)) post({ type: 'fronts', salves: { [pin]: plat } });
  await wait(200);
  post({ type: 'depart' });                     // le départ arrive en retard
  await wait(300);
  post({ type: 'repeindre' });
  await wait(250);
  mesures.C_depart_tardif = pixels();

  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify({ mesures, erreurs: erreurs.join(' | ').slice(0, 400) });
  document.body.appendChild(out);
 })();
</script>
</body>`;
writeFileSync(join(CACHE, 'p.html'), page);

const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => { try { readFileSync(p); return true; } catch { return false; } });
if (!chrome) { console.error('Chrome introuvable'); process.exit(1); }

const html = execFileSync(chrome, [
	'--headless=new', '--disable-gpu', '--no-sandbox',
	'--window-size=1200,800', '--virtual-time-budget=60000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const m = html.match(/<pre id="measures">([\s\S]*?)<\/pre>/);
if (!m) { console.error('aucune mesure rendue'); process.exit(1); }
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
console.log(JSON.stringify(r, null, 2));
