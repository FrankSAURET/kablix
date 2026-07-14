// Vérifie le traceur de courbes (plotter.mts) dans un vrai Chrome headless :
// filtre du flux série (format Teleplot `>nom:valeur`, lignes retenues rendues
// à la console), sondes internes en escalier (valeur tenue dédupliquée),
// légende cliquable, export CSV et rendu effectif sur le canvas.
//
// Usage : node scripts/verify-plotter.mjs
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });

// Bundle du module réel (pas de copie) exposé en global pour la page de test.
const bundle = buildSync({
  entryPoints: [join(ROOT, 'src', 'webview', 'plotter.mts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'PlotterMod',
}).outputFiles[0].text;

// Squelette DOM identique à celui généré par panel.ts (sans `hidden` : le
// rendu doit avoir lieu). Tailles inline : pas de feuille de style ici.
const SKELETON = `
<section class="plotter" id="plotter-section">
  <div class="serial__head">
    <span>📈 Plotter</span>
    <span class="serial__head-actions">
      <select id="plotter-window"></select>
      <button id="plotter-pause"></button>
      <button id="plotter-csv">CSV</button>
      <button id="clear-plotter">Clear</button>
      <button id="close-plotter">✕</button>
    </span>
  </div>
  <div id="plotter-legend" class="plotter__legend" hidden></div>
  <div class="plotter__wrap" style="position:relative;width:640px;height:200px">
    <canvas id="plotter-canvas" style="display:block;width:640px;height:200px"></canvas>
    <div id="plotter-tooltip" hidden></div>
    <div id="plotter-empty">En attente de données…</div>
  </div>
</section>`;

const script = `
try {
  const out = {};
  const p = new PlotterMod.Plotter();
  let csvText = null;
  let firstData = 0;
  let holdFlushed = '';
  p.onExportCsv = (c) => { csvText = c; };
  p.onFirstData = () => { firstData++; };
  p.onHoldFlush = (t) => { holdFlushed += t; };
  p.start();
  out.emptyBefore = !document.getElementById('plotter-empty').hidden;

  // --- Filtre série (format Teleplot) --------------------------------------
  out.f1 = p.filterSerial('Hello\\n');            // texte normal : intact
  out.f2 = p.filterSerial('>temp:23.5\\n');       // télémétrie : absorbée
  out.f3 = p.filterSerial('>te');                 // ligne coupée en deux morceaux
  out.f4 = p.filterSerial('mp:24,5\\n');          // virgule décimale acceptée
  out.f5 = p.filterSerial('>>> ');                // invite REPL : rendue telle quelle
  out.f6 = p.filterSerial('\\n>bad:abc\\n');      // valeur non numérique : rendue
  out.f7 = p.filterSerial('>u:3§V|g\\n');         // unité + drapeau Teleplot
  out.f8 = p.filterSerial('>ts:1627551892437:7\\n'); // horodatage ignoré

  // --- Sondes internes (escalier, valeur tenue) -----------------------------
  p.probe('A0', 1.25);
  p.probe('A0', 1.25); // valeur inchangée : aucun point ajouté
  p.probe('A0', 2.5);  // changement : marche d'escalier (2 points)

  out.firstData = firstData;
  out.emptyAfter = !document.getElementById('plotter-empty').hidden;
  const S = [...p.series.values()];
  out.series = S.map((s) => ({ name: s.name, unit: s.unit, mode: s.mode, n: s.pts.length, last: s.pts[s.pts.length - 1].v }));
  out.chips = document.querySelectorAll('.plotter__chip').length;

  // Clic sur une puce de légende : série masquée + puce estompée.
  S[0].chip.click();
  out.chipOff = S[0].visible === false && S[0].chip.classList.contains('plotter__chip--off');

  // --- Export CSV ------------------------------------------------------------
  document.getElementById('plotter-csv').click();
  out.csvHead = csvText ? csvText.split('\\n')[0] : null;
  out.csvLines = csvText ? csvText.trim().split('\\n').length : 0;

  // --- Ligne candidate jamais terminée : rendue à la console après le délai --
  p.filterSerial('>abc');

  setTimeout(() => {
    out.holdFlushed = holdFlushed;
    // Rendu effectif : pixels non transparents sur le canvas (grille + courbes).
    // Appel direct de draw() : requestAnimationFrame ne tourne pas dans ce mode
    // headless (--dump-dom), alors qu'il tourne dans la vraie webview.
    p.draw();
    const cv = document.getElementById('plotter-canvas');
    const ctx = cv.getContext('2d');
    let painted = 0;
    const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 0) painted++;
    out.painted = painted;
    out.canvasSize = cv.width + 'x' + cv.height;
    document.getElementById('result').textContent = JSON.stringify(out);
  }, 800);
} catch (e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;

const htmlPath = join(SCRATCH, 'verify-plotter.html');
writeFileSync(
  htmlPath,
  `<!doctype html><meta charset=utf-8><body><pre id="result"></pre>${SKELETON}<script>${bundle}</script><script>${script}</script></body>`
);

const cand = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
if (!chrome) {
  console.error('Chrome/Edge introuvable (définir CHROME_PATH)');
  process.exit(1);
}
const dom = execFileSync(
  chrome,
  ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`],
  { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }
);
const a0 = dom.indexOf('<pre id="result">') + 17;
const b0 = dom.indexOf('</pre>', a0);
const raw = dom
  .slice(a0, b0)
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');
if (raw.startsWith('ERR')) {
  console.error(raw.slice(0, 3000));
  process.exit(1);
}
const res = JSON.parse(raw);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// --- Filtre série --------------------------------------------------------------
check('texte normal intact', res.f1 === 'Hello\n', JSON.stringify(res.f1));
check('ligne télémétrie absorbée', res.f2 === '', JSON.stringify(res.f2));
check('ligne coupée en deux morceaux absorbée', res.f3 === '' && res.f4 === '', JSON.stringify([res.f3, res.f4]));
check('invite REPL « >>> » rendue telle quelle', res.f5 === '>>> ', JSON.stringify(res.f5));
check('valeur non numérique rendue à la console', res.f6 === '\n>bad:abc\n', JSON.stringify(res.f6));
check('unité §V et drapeau |g acceptés', res.f7 === '' && res.f8 === '', JSON.stringify([res.f7, res.f8]));
check('ligne jamais terminée rendue après délai', res.holdFlushed === '>abc', JSON.stringify(res.holdFlushed));

// --- Séries --------------------------------------------------------------------
const by = Object.fromEntries((res.series ?? []).map((s) => [s.name, s]));
check('série temp (ligne) : 2 points, dernier 24,5', by.temp && by.temp.mode === 'line' && by.temp.n === 2 && by.temp.last === 24.5, JSON.stringify(by.temp));
check('série u : unité V, valeur 3', by.u && by.u.unit === 'V' && by.u.last === 3, JSON.stringify(by.u));
check('série ts : horodatage ignoré, valeur 7', by.ts && by.ts.last === 7, JSON.stringify(by.ts));
check('sonde A0 (escalier) : 3 points (valeur tenue dédupliquée), dernier 2,5', by.A0 && by.A0.mode === 'step' && by.A0.n === 3 && by.A0.last === 2.5, JSON.stringify(by.A0));
check('auto-affichage déclenché une fois', res.firstData === 1, String(res.firstData));
check('message « en attente » masqué après données', res.emptyBefore === true && res.emptyAfter === false, `${res.emptyBefore}/${res.emptyAfter}`);

// --- Légende / CSV / rendu -------------------------------------------------------
check('4 puces de légende', res.chips === 4, String(res.chips));
check('clic sur puce : série masquée + estompée', res.chipOff === true, String(res.chipOff));
check('CSV : en-tête + 7 lignes de mesures', res.csvHead === 'time_s,name,value,unit' && res.csvLines === 8, `${res.csvHead} / ${res.csvLines}`);
check('canvas peint (grille + courbes)', res.painted > 500, `${res.painted} px (${res.canvasSize})`);

console.log(failures ? `\n${failures} échec(s)` : '\nTraceur : tous les contrôles passent.');
process.exit(failures ? 1 : 0);
