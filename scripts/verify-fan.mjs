// Vérifie le ventilateur :
//   1. le modèle : plus de tension = plus de vitesse (monotone), et sous 30 %
//      de la tension nominale le moteur ne démarre pas ;
//   2. l'AFFICHAGE de la rotation. Une hélice à 3000 tr/min fait défiler 350
//      pales par seconde : l'œil n'y voit qu'un scintillement, et changer la
//      tension n'y change RIEN de visible. La rotation est donc ralentie à une
//      fréquence de passage de pale LISIBLE (1,5 à 7 pales par seconde), qui
//      croît avec le régime — c'est l'accélération qui doit se voir, pas la
//      vitesse réelle.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const tmp = mkdtempSync(join(tmpdir(), 'kx-fan-'));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function bundle(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const model = await bundle('src/webview/diagram/model.mts', 'model.mjs');

// --- 1. Modèle : la vitesse suit la tension ---------------------------------
console.log('Modèle (fanSpeed) :');
{
  const RATED_V = 5;
  const RATED_A = 0.85;
  // Alim de laboratoire capable de fournir le courant : seule la tension varie.
  const circuit = (volts) => ({ supplyVolts: volts, supplyAmps: 2, ohms: 0, mcuPin: null });
  const volts = [5, 4.5, 4, 3.5, 3, 2.5, 2];
  const speeds = volts.map((v) => model.fanSpeed(circuit(v), RATED_V, RATED_A).speed);
  const decroissant = speeds.every((s, i) => i === 0 || s <= speeds[i - 1]);
  check('baisser la tension baisse la vitesse', decroissant,
    volts.map((v, i) => `${v}V→${(speeds[i] * 100).toFixed(0)}%`).join(' '));
  check('5 V = plein régime', Math.abs(speeds[0] - 1) < 0.01);
  check('1,4 V (28 % de 5 V) : le moteur ne démarre pas',
    model.fanSpeed(circuit(1.4), RATED_V, RATED_A).speed === 0);
  // Commande PWM : le rapport cyclique agit comme la tension.
  const duties = [1, 0.75, 0.5].map((d) => model.fanSpeed(circuit(5), RATED_V, RATED_A, d).speed);
  check('rapport cyclique PWM décroissant : vitesse décroissante',
    duties[0] > duties[1] && duties[1] > duties[2], duties.map((s) => (s * 100).toFixed(0) + '%').join(' '));
}

// --- 2. Rotation affichée (Chrome headless) ---------------------------------
console.log('Rotation affichée (Chrome headless) :');
{
  const CACHE = join(ROOT, 'node_modules', '.cache-fan-spin');
  const entry = `
import '../../src/webview/composants/ventilo-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const SCREEN_HZ = 60;

/** Centre À L'ÉCRAN du plus petit cercle contenant une pièce (point matériel du
 *  dessin : il suit la pièce, où que soit l'origine de rotation). */
function centreEcran(node) {
  const formes = node.matches('path,circle,ellipse,rect,polygon,polyline')
    ? [node] : [...node.querySelectorAll('path,circle,ellipse,rect,polygon,polyline')];
  const pts = [];
  for (const n of formes) {
    const len = n.getTotalLength ? n.getTotalLength() : 0;
    const m = n.getScreenCTM();
    if (!(len > 0) || !m) continue;
    for (let i = 0; i < 1200; i++) {
      const p = n.getPointAtLength((len * i) / 1200);
      pts.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
    }
  }
  let ax = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  let ay = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  for (let i = 0; i < 2000; i++) {
    let best = pts[0], far = -1;
    for (const p of pts) { const d = (p.x-ax)**2 + (p.y-ay)**2; if (d > far) { far = d; best = p; } }
    const k = 1 / (i + 2);
    ax += (best.x - ax) * k; ay += (best.y - ay) * k;
  }
  return { x: ax, y: ay };
}

/** Amplitude du déplacement de ce centre quand la pièce tourne : 0 = l'origine
 *  de rotation EST l'axe. La forme courte « animation » effacerait durée et
 *  état de lecture posés en ligne : on n'agit que sur animation-name. */
function mesureBalourd(wrap, piece, angles) {
  const duree = wrap.style.animationDuration;
  const etatLecture = wrap.style.animationPlayState;
  wrap.style.animationName = 'none';
  const centres = angles.map((deg) => {
    wrap.style.transform = 'rotate(' + deg + 'deg)';
    return centreEcran(piece);
  });
  wrap.style.transform = '';
  wrap.style.animationName = '';
  wrap.style.animationDuration = duree;
  wrap.style.animationPlayState = etatLecture;
  return {
    dx: Math.max(...centres.map((c) => c.x)) - Math.min(...centres.map((c) => c.x)),
    dy: Math.max(...centres.map((c) => c.y)) - Math.min(...centres.map((c) => c.y)),
  };
}

async function run() {
  const el = document.createElement('kablix-ventilo');
  document.body.appendChild(el);
  await el.updateComplete;
  await wait(120);
  const spin = () => el.shadowRoot.querySelector('.spin');
  // État d'affichage pour une vitesse RÉELLE donnée (tours par seconde).
  const etat = async (turns) => {
    el.speed = turns;
    await el.updateComplete;
    await wait(30);
    const st = spin().style;
    const dur = parseFloat(st.animationDuration) || 0;
    return {
      turns,
      shown: dur > 0 ? 1 / dur : 0,          // tours/s réellement animés
      paused: st.animationPlayState === 'paused',
      blur: parseFloat((st.filter.match(/blur\\(([\\d.]+)px\\)/) || [0, 0])[1]) || 0,
    };
  };

  ok('hélice trouvée et emballée dans un groupe neutre', !!spin());
  const pales = el.bladeCount;
  ok('pales comptées dans le dessin : 7', pales === 7, String(pales));

  // L'AXE : l'hélice tourne sur elle-même, elle ne décrit pas un petit cercle.
  // On repère le centre de la pièce À L'ÉCRAN (centre du cercle qui la contient
  // tout juste) à plusieurs angles : c'est un point MATÉRIEL du dessin, il ne
  // bouge que si l'origine de rotation n'est pas l'axe. La boîte englobante ne
  // conviendrait pas : avec 7 pales elle est dissymétrique et tourne autour de
  // l'axe même quand tout est juste.
  {
    const wrap = spin();
    const balourd = mesureBalourd(wrap, el.shadowRoot.querySelector('#ventilo-helices'),
      [0, 13, 26, 51, 90, 180, 270]);
    ok('l’hélice tourne sur elle-même : centre immobile (< 0,1 px)',
      balourd.dx < 0.1 && balourd.dy < 0.1,
      'balourd ' + balourd.dx.toFixed(3) + ' × ' + balourd.dy.toFixed(3) + ' px');
  }

  const arret = await etat(0);
  ok('à l’arrêt : animation en pause', arret.paused && arret.shown === 0);

  // Plage RÉELLEMENT parcourue par la simulation : le modèle décroche sous 30 %
  // de la tension nominale, donc de 15 à 50 tr/s. C'est celle-là qui doit se
  // lire — l'ancienne loi y était plate (rotation figée, seul le flou bougeait).
  const NOMINAL = 50;
  const vitesses = [15, 20, 25, 30, 35, 40, 45, 50];
  const etats = [];
  for (const v of vitesses) etats.push(await etat(v));
  // Ce que l'œil lit : le nombre de pales qui passent par seconde.
  const motif = (e) => e.shown * pales;
  const lisible = etats.map(motif);
  ok('la rotation accélère à CHAQUE cran de tension (aucun palier)',
    etats.every((e, i) => i === 0 || e.shown > etats[i - 1].shown + 1e-6),
    etats.map((e) => e.turns + 'tr/s→' + e.shown.toFixed(2) + 'tr/s').join(' '));
  ok('du décrochage au plein régime, la rotation est au moins triplée',
    lisible[lisible.length - 1] >= lisible[0] * 3,
    \`\${lisible[0].toFixed(1)} → \${lisible[lisible.length - 1].toFixed(1)} pales/s\`);
  ok('jamais plus de 8 pales par seconde : au-delà ça scintille',
    Math.max(...lisible) <= 8, Math.max(...lisible).toFixed(1) + ' pales/s');
  ok('jamais moins de 1 pale par seconde : en dessous ça paraît figé',
    Math.min(...lisible) >= 1, Math.min(...lisible).toFixed(1) + ' pales/s');
  // Le flou ne fait qu'APPUYER la vitesse, il n'est plus le seul indicateur :
  // rien à basse vitesse (on veut suivre la pale), net au plein régime.
  ok('pas de flou à basse vitesse', etats[0].blur === 0, etats[0].blur.toFixed(2));
  ok('le flou croît sur la moitié haute de la plage',
    etats[etats.length - 1].blur > 0 &&
    etats.every((e, i) => i === 0 || e.blur >= etats[i - 1].blur - 1e-6),
    etats.map((e) => e.blur.toFixed(2)).join(' '));
  // Sécurité anti-stroboscope : une image d'écran ne doit jamais avaler plus du
  // quart d'une période de pale, sinon l'hélice paraît reculer.
  const degres = (e) => (e.shown * 360) / SCREEN_HZ;
  const limite = 360 / pales / 4;
  const pire = Math.max(...etats.map(degres), degres(await etat(NOMINAL * 1.5)));
  ok(\`aucune image ne dépasse \${limite.toFixed(1)}° (pire : \${pire.toFixed(1)}°)\`, pire <= limite + 0.01);
  const retour = await etat(0);
  ok('retour à l’arrêt : figé et net', retour.paused && retour.blur === 0);

  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify(checks);
  document.body.appendChild(out);
}
run().catch((e) => {
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
  document.body.appendChild(out);
});
`;
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, 'e.mjs'), entry);
  const b = await esbuild.build({
    entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
    loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
  });
  writeFileSync(join(CACHE, 'p.html'),
    `<!doctype html><meta charset=utf8><body style="margin:0">` +
    `<script>${b.outputFiles[0].text}</script></body>`);
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
  if (!chrome) {
    console.log('  – Chrome introuvable, affichage non vérifié');
  } else {
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom',
      `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
    if (!m) check('mesures relevées', false, 'aucune mesure dans le DOM');
    else for (const r of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))) {
      check(r.name, r.ok, r.detail);
    }
  }
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
