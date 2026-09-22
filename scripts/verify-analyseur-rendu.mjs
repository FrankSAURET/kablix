// Vérifie que l'ONGLET de l'analyseur PEINT — dans les conditions où Frank le
// voit gris, pas dans celles où tout va bien.
//
// POURQUOI UN BANC À PART. `verify-analyseur.mjs` tourne en Node pur : il
// prouve le modèle, la capture et les décodeurs, jamais un pixel. Or le défaut
// signalé (« je ne vois qu'un onglet gris ») n'est pas un défaut de données —
// le lot .98 a montré que la capture arrive entière. C'est le RENDU qui
// n'a pas lieu, et cela ne se mesure que dans un vrai navigateur.
//
// LE CAS QUI FAIT LE GRIS. `vue.dessiner()` commence par `if (w === 0 || h === 0)
// return`. Un onglet de webview VS Code ouvert en second plan (`preserveFocus`)
// a un canvas de largeur NULLE au moment précis où l'hôte pousse ses voies et
// sa capture : le rendu sort donc sans rien peindre. Rien ne le redemande
// ensuite — il n'y a pas de `ResizeObserver` sur le canvas — et quand l'onglet
// revient au premier plan, il garde sa page grise.
//
// `visibilitychange` ne rattrape pas ce cas : un webview VS Code caché derrière
// un autre onglet du MÊME groupe laisse `document.hidden` à faux tant que la
// fenêtre a le focus. La page est alors « visible » pour le navigateur et large
// de zéro pixel pour la mise en page.
//
// LE SECOND CAS QUI FAIT LE GRIS (20/09). Une fois la capture bien peinte,
// l'atelier pousse une liste de voies VIDE : il le fait à chaque `onChange` du
// schéma, or les onChange « neutres » qui suivent le chargement d'un projet
// arrivent avant qu'aucune sonde ne soit résolue. Ce message écrasait tout —
// `diagnostics` remis à zéro ET `capture.declarerVoies([])`, qui jette les
// fronts. Mesuré sur la capture réelle de sonde-logique-pico : 23 897 pixels de
// courbes tombant aux 936 du message « aucune sonde ». Le repli de
// `restaurer()` ne rattrape rien, il ne joue qu'AU MOMENT du `restaure`.
//
// Usage : node scripts/verify-analyseur-rendu.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-verify-analyseur-rendu');

let failures = 0;
/**
 * `cond` accepte une FONCTION : une exception vaut échec NOMMÉ, pas mort du
 * banc. Sans cela la contre-épreuve au `git stash` s'arrête au premier contrôle
 * et n'affiche aucun échec — un banc muet passerait pour un banc vert (piège
 * payé deux fois, lots .100 et .101).
 */
const check = (nom, cond, detail = '') => {
	let ok = false;
	let boum = '';
	try {
		ok = typeof cond === 'function' ? !!cond() : !!cond;
	} catch (e) {
		boum = ` [exception: ${e && e.message}]`;
	}
	if (ok) console.log(`  ✅ ${nom}`);
	else {
		failures++;
		console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}${boum}`);
	}
};

mkdirSync(CACHE, { recursive: true });
const b = await esbuild({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});

// Capture minuscule mais VRAIE : deux voies, quelques fronts. Fabriquer ici la
// capture plutôt que de lire un .projix garde le banc indépendant des fichiers
// de test, qui bougent à chaque retouche de planche.
const ETAT = {
	voies: [
		{ voie: 0, pin: 'GP0', nom: 'GP0', fronts: [1, 1, 2, 0, 3, 1, 4, 0, 5, 1] },
		{ voie: 1, pin: 'GP1', nom: 'GP1', fronts: [1.5, 1, 2.5, 0, 3.5, 1] },
	],
};

const page = `<!doctype html><meta charset=utf8>
<style>
 body { margin:0; padding:0; font:13px sans-serif; }
 .barre { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:6px 10px; border-bottom:1px solid #ccc; }
 #trace { display:block; width:100%; }
 .aide { padding:4px 10px 8px; opacity:.6; }
 /* Reproduit l'onglet en SECOND PLAN : VS Code ne cache pas le document, il
    donne zéro pixel de large à la page. C'est la condition du gris.
    Le masquage passe par un STYLE EN LIGNE, jamais par une classe du body :
    l'onglet observe l'attribut de classe du body pour suivre le thème VS
    Code, et poser puis retirer une classe déclencherait CET observateur —
    le banc serait vert grâce à son propre échafaudage. */
</style>
<body style="width:0;overflow:hidden">
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
 const ETAT = ${JSON.stringify(ETAT)};
 const post = (m) => window.dispatchEvent(new MessageEvent('message', { data: m }));
 const wait = (ms) => new Promise((r) => setTimeout(r, ms));
 (async () => {
  const erreurs = [];
  window.addEventListener('error', (e) => erreurs.push(String(e.message)));
  const cv = document.getElementById('trace');
  const peints = () => {
   try {
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, Math.max(1, cv.width), Math.max(1, cv.height)).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
    return n;
   } catch (e) { return -1; }
  };
  const mesures = {};
  // PAS de ResizeObserver de diagnostic sur le canvas ici : en poser un
  // deuxième change ce que le moteur de rendu calcule et peut faire passer le
  // banc pour une raison qui n'est pas le code testé.
  await wait(60);
  // L'hôte pousse voies + capture PENDANT que l'onglet est en second plan :
  // c'est l'ordre réel (l'onglet naît caché et signale « prêt » aussitôt).
  post({ type: 'voies', voies: ETAT.voies.map((v) => ({ voie: v.voie, pin: v.pin, nom: v.nom, probleme: null, analogique: false, suivi: false })) });
  post({ type: 'restaure', etat: ETAT });
  await wait(300);
  mesures.cacheLargeur = cv.clientWidth;
  mesures.cacheHauteur = cv.clientHeight;
  mesures.cacheStyleH = cv.style.height;
  mesures.cachePeints = peints();
  // L'élève clique sur l'onglet : la page reprend sa largeur. AUCUN
  // visibilitychange n'est émis — le document n'a jamais été « hidden ».
  document.body.style.width = '';
  document.body.style.overflow = '';
  // Premier relevé : ce que le ResizeObserver de la page rattrape TOUT SEUL.
  // Il n'est servi qu'avec une image, et --dump-dom n'en donne pas un nombre
  // constant : ce relevé est donc INFORMATIF, jamais un contrôle. Un banc qui
  // en ferait une exigence serait vert ou rouge sur le même code.
  await wait(600);
  mesures.roPeints = peints();
  // Second relevé : le message que l'HÔTE envoie en voyant l'onglet repasser
  // devant (onDidChangeViewState). Celui-là ne dépend d'aucune image, c'est
  // lui qui doit garantir la peinture — c'est donc lui qu'on exige.
  post({ type: 'repeindre' });
  await wait(200);
  mesures.viveLargeur = cv.clientWidth;
  mesures.vivePeints = peints();
  mesures.viveHauteur = cv.clientHeight;
  mesures.attrW = cv.width;
  mesures.attrH = cv.height;
  // Les noms de voie ne sont plus du texte HTML : ils sont PEINTS dans la
  // colonne de gauche du canvas, avec leurs boutons (« T » et « P »). On
  // compte donc les pixels peints dans cette colonne — deux pistes nommées
  // en noircissent forcément quelques centaines, une colonne vide aucun.
  mesures.colonne = (() => {
   const g = cv.getContext('2d');
   const d = g.getImageData(0, 0, Math.min(100, cv.width), cv.height).data;
   let n = 0;
   for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
   return n;
  })();
  // L'ATELIER POUSSE UNE LISTE DE VOIES VIDE. Il le fait à chaque changement
  // du schéma, y compris les changements « neutres » qui suivent le chargement
  // d'un projet — et à cet instant il n'a encore résolu aucune sonde. Ce
  // message-là arrive donc APRÈS le restaure de l'hôte, sur une capture déjà
  // peinte. Il ne doit rien effacer : une capture enregistrée n'appartient plus
  // au schéma, et retirer ses pinces n'efface pas une mesure faite.
  post({ type: 'voies', voies: [] });
  await wait(250);
  post({ type: 'repeindre' });
  await wait(200);
  mesures.apresVoiesVides = peints();
  mesures.hauteurApresVoiesVides = cv.clientHeight;
  // LE SCHÉMA ET LA CAPTURE NE SONT PAS D'ACCORD SUR LES NUMÉROS. Cas réel de
  // sonde-logique-pico : les pinces du schéma sont sur les voies 0 et 2, la
  // capture enregistrée porte les voies 0 et 1. La broche, elle, est la même
  // des deux côtés — c'est la seule identité fiable, le numéro n'étant qu'une
  // teinte qui bouge dès qu'on renumérote une pince.
  // On compte les pixels PISTE PAR PISTE : une piste sans courbe garde son
  // trait de repos et son étiquette, donc un total NON nul — un comptage global
  // ne verrait rien. La piste du bas (voie 2, GP1) doit porter sa courbe.
  post({ type: 'voies', voies: [
   { voie: 0, pin: 'GP0', nom: 'GP0', probleme: null, analogique: false, suivi: false },
   { voie: 2, pin: 'GP1', nom: 'GP1', probleme: null, analogique: false, suivi: false },
  ] });
  await wait(250);
  post({ type: 'restaure', etat: ETAT });
  await wait(250);
  post({ type: 'repeindre' });
  await wait(200);
  mesures.pistesDesaccordees = (() => {
   const g = cv.getContext('2d');
   const h = Math.floor(cv.height / 2);
   const out = [];
   for (let i = 0; i < 2; i++) {
    const d = g.getImageData(110, i * h, cv.width - 130, h).data;
    let n = 0;
    for (let j = 3; j < d.length; j += 4) if (d[j] > 0) n++;
    out.push(n);
   }
   return out;
  })();
  // UN SECOND PROJET OUVERT DANS LE MÊME ATELIER. L'hôte n'envoie alors que
  // le message restaure (chargerAnalyseur dans panel.ts) : jamais de voies.
  // Les pistes du PREMIER projet restent donc en place, et la capture du second
  // n'a nulle part où se dessiner. Mesuré sur le cas de Frank (pince sur GP21, puis
  // ouverture de sonde-logique-pico2) : l'onglet gardait UNE piste de 90 px et
  // 1 290 pixels de trait plat par-dessus 16 000 fronts. C'est la page grise.
  post({ type: 'voies', voies: [
   { voie: 5, pin: 'GP21', nom: 'vieille', probleme: null, analogique: false, suivi: false },
  ] });
  await wait(250);
  post({ type: 'repeindre' });
  await wait(200);
  mesures.hauteurProjet1 = cv.clientHeight;
  post({ type: 'restaure', etat: ETAT });
  await wait(250);
  post({ type: 'repeindre' });
  await wait(200);
  mesures.hauteurProjet2 = cv.clientHeight;
  mesures.pistesProjet2 = (() => {
   const g = cv.getContext('2d');
   const h = Math.floor(cv.height / 2);
   const out = [];
   for (let i = 0; i < 2; i++) {
    const d = g.getImageData(110, i * h, cv.width - 130, h).data;
    let n = 0;
    for (let j = 3; j < d.length; j += 4) if (d[j] > 0) n++;
    out.push(n);
   }
   return out;
  })();
  mesures.erreurs = erreurs.join(' | ').slice(0, 300);
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify(mesures);
  document.body.appendChild(out);
 })();
</script>
</body>`;
writeFileSync(join(CACHE, 'p.html'), page);

const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) {
	console.log('Chrome introuvable — banc ignoré.');
	process.exit(0);
}
const dom = execFileSync(chrome, [
	'--headless=new', '--disable-gpu', '--no-sandbox',
	'--window-size=900,700', '--virtual-time-budget=25000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) {
	console.log('❌ mesures introuvables — la page n\'a pas fini son script.');
	console.log(dom.slice(0, 1500));
	process.exit(1);
}
const r = JSON.parse(
	m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
);

console.log('Analyseur — rendu de l\'onglet');
console.log(` (mesuré : caché ${r.cacheLargeur}x${r.cacheHauteur} style=${r.cacheStyleH}, ${r.cachePeints} px peints`
	+ ` · de retour ${r.viveLargeur}px, ${r.roPeints} px par le ResizeObserver seul`
	+ ` puis ${r.vivePeints} après « repeindre » · canvas ${r.attrW}x${r.attrH}`
	+ ` · numéros désaccordés : pistes ${JSON.stringify(r.pistesDesaccordees)}`
	+ ` · second projet : ${r.hauteurProjet1}px → ${r.hauteurProjet2}px, pistes ${JSON.stringify(r.pistesProjet2)})`);
check('la page ne lève aucune erreur', r.erreurs === '', r.erreurs);
check('caché, le canvas est bien de largeur nulle (la condition du défaut est reproduite)',
	r.cacheLargeur === 0, `largeur ${r.cacheLargeur}`);
check('caché, le canvas ne peint rien — c\'est bien la page grise qu\'on reproduit',
	r.cachePeints === 0, `${r.cachePeints} pixels peints`);
check('revenu au premier plan, le canvas retrouve une largeur',
	r.viveLargeur > 100, `largeur ${r.viveLargeur}`);
check('le message « repeindre » de l\'hôte peint le canvas, sans dépendre d\'une image du navigateur',
	r.vivePeints > 500, `${r.vivePeints} pixels peints`);
// Comparé à la LARGEUR MESURÉE, pas à un seuil : un canvas jamais redimensionné
// garde ses 300 px par défaut, et « attrW > 100 » l'aurait accepté — un contrôle
// vert avant comme après la correction, donc un contrôle qui ne prouve rien.
check('le canvas est redimensionné à la largeur retrouvée, pas laissé à ses 300 px par défaut',
	r.attrW === r.viveLargeur, `attribut width ${r.attrW} pour ${r.viveLargeur} px de large`);
// Ce contrôle-ci reste vert SANS la correction, et c'est volontaire : il dit
// que les données sont bien arrivées (deux pistes = 150 px, une seule en
// donnerait 90). C'est la moitié du diagnostic — les données sont là, la
// peinture manque — et l'écrire sépare les deux causes possibles du gris.
check('la hauteur porte les DEUX voies reçues pendant que l\'onglet était caché',
	r.viveHauteur === 150, `hauteur ${r.viveHauteur}`);
check('les noms de voie sont PEINTS dans la colonne de gauche du canvas',
	r.colonne > 200, `${r.colonne} px peints dans les 100 px de gauche`);
// LA PAGE GRISE DU 20/09. Un message `voies` VIDE arrivant après le `restaure`
// remettait `diagnostics` à zéro ET appelait `capture.declarerVoies([])`, qui
// jette les fronts : la capture entière disparaissait au profit du message
// « aucune sonde ». Mesuré sur la capture réelle de sonde-logique-pico :
// 23 897 pixels de courbes tombant à 936. On exige donc que le dessin SURVIVE,
// à l'identique — un seuil lâche laisserait passer le message d'accueil.
check('une liste de voies VIDE reçue après coup n\'efface pas la capture affichée',
	r.apresVoiesVides === r.vivePeints,
	`${r.apresVoiesVides} px après la liste vide, contre ${r.vivePeints} avant`);
check('la liste vide ne rabat pas non plus la hauteur sur une piste unique',
	r.hauteurApresVoiesVides === 150, `hauteur ${r.hauteurApresVoiesVides}`);
// LES DEUX PISTES TRACENT MÊME QUAND LES NUMÉROS NE COÏNCIDENT PAS. La capture
// est rangée par BROCHE sur les voies du schéma : GP1 capturé en voie 1 doit
// aller se dessiner dans la piste de la voie 2, celle de la pince posée dessus.
// Mesuré sur le cas réel avant correction : la piste qui tombait juste peignait
// 31 348 px, les autres 2 508 — leur seul trait de repos, sans une courbe.
// Le seuil se prend sur la PREMIÈRE piste, jamais en valeur absolue : les deux
// voies du banc portent un nombre de fronts comparable, donc une piste qui
// trace ressemble à l'autre (3 542 contre 4 025 ici), tandis qu'une piste
// réduite à son trait de repos et à son étiquette décroche nettement (2 264).
// Un seuil lâche passerait avant COMME après la correction — mesuré, et c'est
// ce qui a failli faire livrer ce lot sur un contrôle qui ne prouvait rien.
check('la piste dont le NUMÉRO diffère de la capture trace quand même sa courbe',
	r.pistesDesaccordees[1] > r.pistesDesaccordees[0] * 0.75,
	`pistes ${JSON.stringify(r.pistesDesaccordees)} — la seconde n'a que son trait de repos`);
check('et la piste accordée n\'a rien perdu au passage',
	r.pistesDesaccordees[0] > 500, `${r.pistesDesaccordees[0]} px sur la première piste`);
// UN SECOND PROJET DANS LE MÊME ATELIER (22/09). L'hôte n'envoie que `restaure`,
// donc les pistes du premier projet tiennent la place. Le repli de `restaurer()`
// ne jouait que sur une liste de pistes VIDE : avec un projet déjà ouvert elle
// ne l'est pas, et la capture du second n'avait nulle part où se dessiner.
// Mesuré avant correction : 90 px de haut, UNE piste, 1 290 px de trait plat
// par-dessus 16 000 fronts. Après : 150 px, deux pistes, 7 507 et 15 421 px.
// On exige la HAUTEUR (deux pistes dressées) ET les DEUX courbes : la hauteur
// seule laisserait passer deux pistes vides.
check('la hauteur du premier projet est bien celle d\'une piste unique (la condition est reproduite)',
	r.hauteurProjet1 === 90, `hauteur ${r.hauteurProjet1}`);
check('ouvrir un SECOND projet dresse les pistes de SA capture, pas celles du premier',
	r.hauteurProjet2 === 150, `hauteur ${r.hauteurProjet2} — les pistes du projet précédent tiennent encore`);
check('et les deux voies du second projet tracent pour de bon',
	r.pistesProjet2[0] > 2000 && r.pistesProjet2[1] > 2000,
	`pistes ${JSON.stringify(r.pistesProjet2)} — du trait de repos, pas des courbes`);

console.log(failures === 0 ? '\nTout est vert.' : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
