// Banc : l'onglet de l'analyseur doit dessiner les VRAIES captures des .projix
// de test, y compris pendant la séquence de chargement d'un projet.
//
// POURQUOI CE BANC EN PLUS de verify-analyseur-rendu.mjs : celui-là se sert
// d'une capture jouet (2 voies, 5 fronts) qu'il fabrique lui-même. Il ne peut
// donc pas voir un défaut qui détruit les fronts d'une capture RÉELLE lors d'un
// enchaînement de messages réel. Trois lots (.118, .119, .120) sont passés
// verts pendant que les 6 fichiers de Frank restaient gris.
//
// CE QU'IL MESURE : les pixels peints, PISTE PAR PISTE, dans quatre
// enchaînements de messages, et exige qu'ils soient identiques à l'ordre
// nominal. Un scénario qui perd des pixels = une capture amputée.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { build as esbuild } from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(tmpdir(), 'kablix-verif-analyseur-projix');
mkdirSync(CACHE, { recursive: true });

// D'OÙ VIENNENT LES CAPTURES (changé au lot .124). Elles étaient lues dans les
// .projix de test. Ce lot les en a sorties : une mesure vit maintenant dans un
// journal CSV de session, et un .projix réenregistré n'en porte plus. La source
// a donc été FIGÉE dans un échantillon versionné, extrait de ces mêmes fichiers
// — ce sont toujours de vraies mesures, issues de vraies simulations, ce qui
// fait tout l'intérêt de ce banc face à la capture jouet de verify-analyseur-rendu.
const ECHANTILLON = join(ROOT, 'testkablix/captures/analyseur-reelles.json');
const cas = [];
for (const ech of JSON.parse(readFileSync(ECHANTILLON, 'utf8')).cas) {
	const k = ech;
	const voies = k.analyseur?.voies ?? [];
	if (!voies.some((v) => (v.fronts || []).length > 0)) continue;
	cas.push({
		nom: ech.nom,
		// Ce que l'atelier pousse quand le schéma est complet : le couple
		// voie/broche que porte déjà la capture.
		voies: voies.map((v) => ({
			voie: v.voie, pin: v.pin, nom: v.nom ?? v.pin,
			probleme: null, analogique: false, suivi: false,
		})),
		etat: k.analyseur,
	});
}
if (cas.length === 0) {
	console.log(`✗ l’échantillon ne porte aucune capture — banc sans objet (${ECHANTILLON})`);
	process.exit(1);
}

const b = await esbuild({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
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
 <label>Sampling <select id="horloge"><option value="0">Unlimited</option><option value="1000000">1 MHz</option></select></label>
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
 const CAS = ${JSON.stringify(cas)};
 const post = (m) => window.dispatchEvent(new MessageEvent('message', { data: m }));
 const wait = (ms) => new Promise((r) => setTimeout(r, ms));
 (async () => {
  const erreurs = [];
  window.addEventListener('error', (e) => erreurs.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => erreurs.push('rejet: ' + (e.reason && e.reason.message)));
  const cv = document.getElementById('trace');
  const pixels = (x, y, w, h) => {
   try {
    const g = cv.getContext('2d');
    const d = g.getImageData(x, y, Math.max(1, w), Math.max(1, h)).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
    return n;
   } catch (e) { return -1; }
  };
  const resultats = [];
  const mesurer = async (c, scenario) => {
   post({ type: 'repeindre' });
   await wait(250);
   const nb = Math.max(1, c.voies.length);
   const h = Math.floor(cv.height / nb);
   const pistes = [];
   for (let i = 0; i < nb; i++) pistes.push(pixels(110, i * h, cv.width - 130, h));
   resultats.push({ nom: c.nom, scenario, total: pixels(0, 0, cv.width, cv.height), pistes });
  };
  // Page à neuf entre deux scénarios : sinon l'état du précédent fausse le
  // suivant (c'était très exactement le défaut du lot .120).
  const remiseANeuf = async () => {
   post({ type: 'depart' });
   post({ type: 'voies', voies: [] }); // EN simulation, une liste vide efface bien
   post({ type: 'arret' });
   await wait(120);
  };
  const enDefaut = (voies, pb) => voies.map((v) => ({ ...v, pin: '', probleme: pb }));
  await wait(80);
  for (const c of CAS) {
   // A — référence : ordre nominal de pousserEtat() (voies puis restaure).
   post({ type: 'voies', voies: c.voies });
   await wait(150);
   post({ type: 'restaure', etat: c.etat });
   await wait(300);
   await mesurer(c, 'nominal');
   await remiseANeuf();

   // B — l'ordre que produit la FILE D'ATTENTE de l'hôte : au signal « prête »,
   // analyseur-panel.ts pousse l'état PUIS vide la file, donc les messages
   // de voies mis en attente pendant le chargement arrivent APRÈS le restaure.
   post({ type: 'voies', voies: c.voies });
   await wait(100);
   post({ type: 'restaure', etat: c.etat });
   await wait(150);
   post({ type: 'voies', voies: [] });
   await wait(150);
   post({ type: 'voies', voies: c.voies });
   await wait(300);
   await mesurer(c, 'file-attente');
   await remiseANeuf();

   // C — onglet né DERRIÈRE l'atelier : largeur nulle quand tout arrive.
   document.body.style.width = '0';
   document.body.style.overflow = 'hidden';
   await wait(80);
   post({ type: 'voies', voies: c.voies });
   await wait(100);
   post({ type: 'restaure', etat: c.etat });
   await wait(200);
   document.body.style.width = '';
   document.body.style.overflow = '';
   await wait(200);
   await mesurer(c, 'onglet-cache');
   await remiseANeuf();

   // D — LA SÉQUENCE RÉELLE DU CHARGEMENT D'UN PROJET. L'hôte envoie le
   // restaure à l'ONGLET et le loadProject à l'ATELIER : deux canaux, sans ordre
   // entre eux. L'atelier enchaîne clear() -> voies vides, puis le montage, les
   // composants AVANT les fils : une sonde reliée par un fil sort alors EN
   // DÉFAUT. Hors simulation, aucun de ces messages ne doit toucher la capture.
   post({ type: 'restaure', etat: c.etat });
   await wait(80);
   post({ type: 'voies', voies: [] });
   await wait(80);
   post({ type: 'voies', voies: enDefaut(c.voies, 'not-mcu') });
   await wait(80);
   post({ type: 'voies', voies: enDefaut(c.voies, 'nowhere') });
   await wait(80);
   post({ type: 'voies', voies: c.voies });
   await wait(300);
   await mesurer(c, 'chargement-reel');
   await remiseANeuf();
  }
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify({ resultats, erreurs: erreurs.join(' | ').slice(0, 600) });
  document.body.appendChild(out);
 })();
</script>
</body>`;
writeFileSync(join(CACHE, 'p.html'), page);

const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'/usr/bin/google-chrome',
].find(existsSync);
if (!chrome) { console.log('⚠ Chrome introuvable — banc ignoré'); process.exit(0); }

const dom = execFileSync(chrome, [
	'--headless=new', '--disable-gpu', '--no-sandbox',
	'--window-size=1200,800', '--virtual-time-budget=60000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) {
	console.log('✗ mesures introuvables — la page n\'a pas fini son parcours');
	console.log(dom.slice(0, 2000));
	process.exit(1);
}
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

let echecs = 0;
for (const c of cas) {
	const mesures = r.resultats.filter((x) => x.nom === c.nom);
	const ref = mesures.find((x) => x.scenario === 'nominal');
	if (!ref) { console.log(`✗ ${c.nom} : pas de mesure de référence`); echecs++; continue; }
	// Une capture réelle peint largement plus que le seul quadrillage : sous ce
	// seuil, la piste est vide (c'est la « page grise »).
	let mauvais = 0;
	const creuses = ref.pistes.filter((p) => p < 500).length;
	if (creuses === ref.pistes.length) {
		console.log(`✗ ${c.nom} [nominal] : aucune piste dessinée (${JSON.stringify(ref.pistes)})`);
		mauvais++;
	}
	for (const x of mesures) {
		if (x.scenario === 'nominal') continue;
		// Tolérance nulle : ces scénarios ne changent QUE l'ordre des messages,
		// jamais les données. Le dessin doit être rigoureusement le même.
		const pareil = x.pistes.length === ref.pistes.length
			&& x.pistes.every((p, i) => p === ref.pistes[i]);
		if (!pareil) {
			console.log(`✗ ${c.nom} [${x.scenario}] : pistes ${JSON.stringify(x.pistes)} ≠ nominal ${JSON.stringify(ref.pistes)}`);
			mauvais++;
		}
	}
	echecs += mauvais;
	if (!mauvais) console.log(`✓ ${c.nom} : ${ref.pistes.length} piste(s), ${ref.total} px, stable sur les 4 enchaînements`);
}
if (r.erreurs) { console.log('✗ erreurs JS :', r.erreurs); echecs++; }

if (echecs) { console.log(`\n✗ ${echecs} échec(s)`); process.exit(1); }
console.log(`\n✓ ${cas.length} projet(s) réel(s) : capture dessinée dans les 4 enchaînements`);
