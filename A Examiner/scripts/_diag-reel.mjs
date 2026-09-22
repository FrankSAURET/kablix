// Diagnostic : rejoue les VRAIES captures des .projix de Frank dans l'onglet
// de l'analyseur, dans l'ordre réel des messages de l'hôte (pousserEtat :
// voies PUIS restaure), et mesure les pixels peints PISTE PAR PISTE.
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { build as esbuild } from 'esbuild';

const ROOT = 'C:/- VS Code/Extensions/Kablix';
const CACHE = 'V:/Temp/claude/c----VS-Code-Extensions-Kablix/874b5f3f-d324-4132-b67a-71df4499759c/scratchpad/diag';
mkdirSync(CACHE, { recursive: true });

function unzip(buf) {
	const out = {};
	let e = -1;
	for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
	const n = buf.readUInt16LE(e + 10);
	let off = buf.readUInt32LE(e + 16);
	for (let k = 0; k < n; k++) {
		const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
		const lho = buf.readUInt32LE(off + 42);
		const name = buf.toString('utf8', off + 46, off + 46 + nl);
		const m = buf.readUInt16LE(off + 10), cs = buf.readUInt32LE(off + 20);
		const ds = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
		const d = buf.subarray(ds, ds + cs);
		out[name] = m === 0 ? d : zlib.inflateRawSync(d);
		off += 46 + nl + el + cl;
	}
	return out;
}

// --- Lecture des projets réels ---------------------------------------------
const DIR = join(ROOT, 'testkablix');
const cas = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.projix'))) {
	let z;
	try { z = unzip(readFileSync(join(DIR, f))); } catch { continue; }
	const d = JSON.parse(z['diagram.json'].toString('utf8'));
	const sondes = (d.parts || []).filter((p) => p.type === 'sonde-logique');
	if (!sondes.length) continue;
	const k = JSON.parse(z['kablix.json'].toString('utf8'));
	if (!k.analyseur?.voies?.length) continue;
	// Ce que l'hôte pousse comme `voies` : ce sont celles du SCHÉMA, résolues
	// par l'atelier. On ne peut pas les résoudre ici (pas de netlist), mais la
	// capture porte déjà le couple voie/broche réel : c'est exactement ce que
	// l'atelier aurait poussé pour les sondes accrochées.
	cas.push({
		nom: f,
		voies: k.analyseur.voies.map((v) => ({
			voie: v.voie, pin: v.pin, nom: v.nom ?? v.pin,
			probleme: null, analogique: false, suivi: false,
		})),
		etat: k.analyseur,
	});
}
console.log('Cas réels trouvés :', cas.map((c) => c.nom).join(', '));

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
  // Mesure d'un cas : rend les pixels piste par piste après « repeindre ».
  const mesurer = async (c, scenario, avant) => {
   post({ type: 'repeindre' });
   await wait(250);
   const nb = Math.max(1, c.voies.length);
   const h = Math.floor(cv.height / nb);
   const pistes = [];
   for (let i = 0; i < nb; i++) pistes.push(pixels(110, i * h, cv.width - 130, h));
   resultats.push({
    nom: c.nom, scenario,
    canvas: cv.width + 'x' + cv.height,
    clientH: cv.clientHeight,
    total: pixels(0, 0, cv.width, cv.height),
    colonne: pixels(0, 0, Math.min(110, cv.width), cv.height),
    pistes,
    etatTexte: (document.getElementById('etat') || {}).textContent || '',
    nouvellesErreurs: erreurs.slice(avant).join(' | ').slice(0, 300),
   });
  };
  // Remet la page à neuf entre deux scénarios : sans ça l'état du précédent
  // fausse le suivant (c'est très exactement le défaut du lot .120).
  const remiseANeuf = async () => {
   post({ type: 'depart' });   // vide la capture
   post({ type: 'voies', voies: [] }); // en simulation, une liste vide efface
   post({ type: 'arret' });
   await wait(120);
  };
  await wait(80);
  for (const c of CAS) {
   // A — ordre nominal de pousserEtat() : voies PUIS restaure, page visible.
   let avant = erreurs.length;
   post({ type: 'voies', voies: c.voies });
   await wait(150);
   post({ type: 'restaure', etat: c.etat });
   await wait(300);
   await mesurer(c, 'A-nominal', avant);
   await remiseANeuf();

   // B — l'ordre que produit la FILE D'ATTENTE de l'hôte. Quand la page
   // signale « prête », analyseur-panel.ts fait pousserEtat() PUIS vide la
   // file. Les messages voies mis en attente pendant le chargement partent
   // donc APRÈS le restaure. Et l'atelier, qui n'a encore rien résolu à ce
   // moment-là, y a rangé une liste VIDE.
   avant = erreurs.length;
   post({ type: 'voies', voies: c.voies });
   await wait(100);
   post({ type: 'restaure', etat: c.etat });
   await wait(150);
   post({ type: 'voies', voies: [] });        // la file se vide : voies vides
   await wait(150);
   post({ type: 'voies', voies: c.voies });   // puis l'atelier résout enfin
   await wait(300);
   await mesurer(c, 'B-file-attente', avant);
   await remiseANeuf();

   // C — onglet né DERRIÈRE l'atelier : largeur nulle au moment où tout
   // arrive, puis retour au premier plan.
   avant = erreurs.length;
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
   await mesurer(c, 'C-onglet-cache', avant);
   await remiseANeuf();

   // D — L'ATELIER POUSSE DES VOIES EN DÉFAUT. Au chargement d'un projet, il
   // pousse ses voies sur chaque onChange du schéma, AVANT que la netlist soit
   // construite : une sonde reliée par un FIL n'a alors pas encore de broche,
   // donc elle sort en défaut (nowhere / not-mcu). Ce message arrive APRÈS le
   // restaure, et declarerVoies() ne garde que les voies sans défaut : les
   // autres sont SUPPRIMÉES de la capture, fronts compris.
   avant = erreurs.length;
   post({ type: 'voies', voies: c.voies });
   await wait(100);
   post({ type: 'restaure', etat: c.etat });
   await wait(200);
   post({ type: 'voies', voies: c.voies.map((v) => ({ ...v, pin: '', probleme: 'nowhere' })) });
   await wait(300);
   await mesurer(c, 'D-voies-en-defaut', avant);
   // Et la reprise : l'atelier finit par résoudre ses sondes.
   avant = erreurs.length;
   post({ type: 'voies', voies: c.voies });
   await wait(300);
   await mesurer(c, 'E-apres-reprise', avant);
   await remiseANeuf();

   // F — LA SÉQUENCE RÉELLE DU CHARGEMENT D'UN PROJET, bout à bout.
   // L'hôte envoie restaure à l'ONGLET et loadProject à l'ATELIER : deux
   // canaux, donc aucun ordre garanti entre eux. L'atelier, lui, enchaîne
   // clear() -> notify() -> voies VIDES, puis le montage -> voies résolues.
   // Entre les deux, les sondes reliées par un fil sortent EN DÉFAUT.
   avant = erreurs.length;
   post({ type: 'restaure', etat: c.etat });
   await wait(80);
   post({ type: 'voies', voies: [] });                      // clear()
   await wait(80);
   post({ type: 'voies', voies: c.voies.map((v) => ({ ...v, pin: '', probleme: 'not-mcu' })) }); // montage
   await wait(80);
   post({ type: 'voies', voies: c.voies });                 // résolution finale
   await wait(300);
   await mesurer(c, 'F-chargement-reel', avant);
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
].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(1); }

const dom = execFileSync(chrome, [
	'--headless=new', '--disable-gpu', '--no-sandbox',
	'--window-size=1200,800', '--virtual-time-budget=60000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) {
	console.log('MESURES INTROUVABLES');
	console.log(dom.slice(0, 3000));
	process.exit(1);
}
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
for (const x of r.resultats) {
	console.log(`\n## ${x.nom}  [${x.scenario}]`);
	console.log(`   canvas=${x.canvas} clientH=${x.clientH} total=${x.total} colonne=${x.colonne}`);
	console.log(`   pistes=${JSON.stringify(x.pistes)}`);
	console.log(`   etat="${x.etatTexte}"`);
	if (x.nouvellesErreurs) console.log(`   ERREURS: ${x.nouvellesErreurs}`);
}
if (r.erreurs) console.log('\nERREURS GLOBALES:', r.erreurs);
