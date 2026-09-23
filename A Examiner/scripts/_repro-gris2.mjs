// SCÉNARIO EXACT DE FRANK (23/09) : l'onglet est déjà ouvert sur le projet,
// puis on lance la simulation.
//
// Depuis le lot .124 le .projix ne porte PLUS de capture. Mais il porte encore
// des RÉGLAGES (déclenchement, décodages). ouvrirAnalyseur() prend alors cette
// branche de panel.ts :
//     : this.analyseurReglages ? { voies: [], ...reglages } : null
// donc pousserEtat() envoie un `restaure` dont etat.voies est VIDE.
// Côté onglet, restaurer() appelle capture.declarerVoies([]) — ce qui vide
// parPin — et le repli qui reconstruirait les voies est gardé par
// `etat.voies.length > 0`, donc il ne se déclenche pas.
// Toute salve ultérieure est jetée en silence : page grise, sans nom de voie.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PROJET = 'C:/- VS Code/Extensions/Kablix';
const CACHE = join(tmpdir(), 'kablix-repro-gris2');
mkdirSync(CACHE, { recursive: true });

const VOIES = [
	{ voie: 0, pin: '8', nom: 'horloge', probleme: null, analogique: false, suivi: false },
	{ voie: 1, pin: '9', nom: '9', probleme: null, analogique: false, suivi: false },
	{ voie: 3, pin: 'A0', nom: 'A0', probleme: null, analogique: true, suivi: false },
];

// Les vraies données de Frank, relues dans son journal de session.
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

const REGLAGES = { voies: [], declenchement: null, decodages: [], voiesReglages: {}, echantillonnage: 0 };

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
 const VOIES = ${JSON.stringify(VOIES)};
 const SALVES = ${JSON.stringify(parPin)};
 const REGLAGES = ${JSON.stringify(REGLAGES)};
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
  const salves = async () => {
   for (const pin of Object.keys(SALVES)) post({ type: 'fronts', salves: { [pin]: SALVES[pin] } });
   await wait(400);
   post({ type: 'repeindre' });
   await wait(250);
  };
  const mesures = {};
  await wait(80);

  // A — référence : projet SANS réglage d'analyseur, donc aucun restaure.
  post({ type: 'voies', voies: VOIES });
  await wait(80);
  post({ type: 'depart' });
  await wait(60);
  post({ type: 'voies', voies: VOIES });
  await wait(60);
  await salves();
  mesures.A_sans_restaure = pixels();

  // B — LE CAS DE FRANK : le projet porte des réglages, donc l'hôte pousse un
  // restaure à capture VIDE, AVANT que l'atelier n'annonce le départ.
  post({ type: 'arret' }); post({ type: 'voies', voies: [] }); await wait(100);
  post({ type: 'voies', voies: VOIES });
  await wait(80);
  post({ type: 'restaure', etat: REGLAGES });
  await wait(80);
  post({ type: 'depart' });
  await wait(60);
  post({ type: 'voies', voies: VOIES });
  await wait(60);
  await salves();
  mesures.B_restaure_vide = pixels();

  // C — même chose, mais le restaure vide arrive APRÈS le départ.
  post({ type: 'arret' }); post({ type: 'voies', voies: [] }); await wait(100);
  post({ type: 'voies', voies: VOIES });
  await wait(80);
  post({ type: 'depart' });
  await wait(60);
  post({ type: 'restaure', etat: REGLAGES });
  await wait(80);
  await salves();
  mesures.C_restaure_vide_apres_depart = pixels();

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
].find(existsSync);
if (!chrome) { console.error('Chrome introuvable'); process.exit(1); }

const dom = execFileSync(chrome, [
	'--headless=new', '--disable-gpu', '--no-sandbox',
	'--window-size=1200,800', '--virtual-time-budget=60000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const m = dom.match(/<pre id="measures">([\s\S]*?)<\/pre>/);
if (!m) { console.error('aucune mesure'); process.exit(1); }
console.log(JSON.stringify(JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')), null, 2));
