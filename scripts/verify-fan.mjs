// Vérifie le ventilateur :
//   1. le modèle : plus de tension = plus de vitesse (monotone), et sous 30 %
//      de la tension nominale le moteur ne démarre pas ;
//   2. l'AFFICHAGE de la rotation. Un écran ne montre qu'une image tous les
//      1/60 s : au-delà d'une demi-période de pale par image (25,7° pour une
//      hélice à 7 pales), l'hélice paraît RALENTIR puis tourner à l'envers
//      (roue de charrette). C'est ce que voyait Frank : baisser la tension
//      accélérait la rotation apparente. L'élément plafonne donc la rotation
//      affichée au quart de la période de pale et rend la vitesse au-delà par
//      un flou de bougé — l'indication reste monotone de 0 au plein régime.
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
      fade: st.opacity === '' ? 1 : parseFloat(st.opacity),
    };
  };

  ok('hélice trouvée et emballée dans un groupe neutre', !!spin());
  const pales = el.bladeCount;
  ok('pales comptées dans le dessin : 7', pales === 7, String(pales));
  // Angle qu'une image d'écran a le droit d'avaler : un quart de la période de
  // pale. À la moitié l'image est ambiguë, au-delà elle recule.
  const limite = 360 / pales / 4;

  const arret = await etat(0);
  ok('à l’arrêt : animation en pause', arret.paused && arret.shown === 0);

  const vitesses = [0.5, 1, 2, 3, 5, 10, 25, 50];
  const etats = [];
  for (const v of vitesses) etats.push(await etat(v));
  const degres = (e) => (e.shown * 360) / SCREEN_HZ;
  const pire = Math.max(...etats.map(degres));
  ok(\`aucune image ne dépasse \${limite.toFixed(1)}° (pire : \${pire.toFixed(1)}°)\`, pire <= limite + 0.01,
    etats.map((e) => e.turns + 'tr/s→' + degres(e).toFixed(1) + '°').join(' '));
  // Lentement, la rotation affichée EST la vitesse réelle : rien n'est faussé
  // tant que l'écran suit.
  const lents = etats.filter((e) => e.turns <= SCREEN_HZ / pales / 4);
  ok('sous le plafond, la rotation affichée est la vraie vitesse',
    lents.every((e) => Math.abs(e.shown - e.turns) < 0.05), lents.map((e) => e.shown.toFixed(2)).join(' '));
  // Indication monotone : la rotation ne décroît jamais, et au-delà du plafond
  // c'est le flou qui continue de croître (sinon 25 et 50 tr/s se ressemblent).
  ok('rotation affichée jamais décroissante',
    etats.every((e, i) => i === 0 || e.shown >= etats[i - 1].shown - 1e-6),
    etats.map((e) => e.shown.toFixed(2)).join(' '));
  const rapides = etats.filter((e) => e.blur > 0);
  ok('au-delà du plafond, le flou croît avec la vitesse',
    rapides.length >= 3 && rapides.every((e, i) => i === 0 || e.blur > rapides[i - 1].blur),
    rapides.map((e) => e.turns + 'tr/s→' + e.blur.toFixed(2) + 'px').join(' '));
  ok('les pales s’effacent à plein régime', etats[etats.length - 1].fade < 0.8,
    etats[etats.length - 1].fade.toFixed(2));
  const retour = await etat(0);
  ok('retour à l’arrêt : ni flou ni transparence', retour.blur === 0 && retour.fade === 1);

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
