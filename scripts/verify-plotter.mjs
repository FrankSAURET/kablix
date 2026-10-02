// Vérifie le traceur de courbes (plotter.mts) dans un vrai Chrome headless :
// filtre du flux série (format Teleplot `>nom:valeur`, lignes retenues rendues
// à la console), sondes internes en escalier (valeur tenue dédupliquée),
// légende cliquable, export CSV et rendu effectif sur le canvas.
//
// Usage : node scripts/verify-plotter.mjs
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
      <input id="plotter-window-custom" type="text" hidden />
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

  // --- Grandeur continue (Frank, 02/10 : « linéariser les courbes » de pile) --
  p.probe('bat9: charge', 100, '%', true, 'line');
  p.probe('bat9: charge', 100, '%', true, 'line'); // même valeur : le point est gardé (droite)
  p.probe('bat9: charge', 99.9, '%', true, 'line');

  // --- Durée de vie (Frank, todo : « j h min si >24h, h min si >60min ») ----
  p.probe('bat1: battery life', 0.5, 'h', true);   // 30 min : reste en heures brutes
  p.probe('bat2: battery life', 1.5, 'h', true);   // 1 h 30 : « h min »
  p.probe('bat3: battery life', 30, 'h', true);    // 30 h : « j h min »
  const S0 = [...p.series.values()];
  const dureeParNom = (nom) => S0.find((s) => s.name === nom)?.valueEl.textContent;

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
    out.duree30min = dureeParNom('bat1: battery life');
    out.duree1h30 = dureeParNom('bat2: battery life');
    out.duree30h = dureeParNom('bat3: battery life');

    // --- Horloge simulée et fenêtre saisie en h min s (Frank, 02/10) ----------
    let faux = 1000;
    p.setClock(() => faux);
    p.start();
    out.t0Horloge = p.t0;
    p.probe('x', 1, 'u', true, 'line');
    faux = 1000 + 7200000; // 2 h SIMULÉES plus tard
    p.probe('x', 2, 'u', true, 'line');
    p.windowSelect.value = 'custom';
    p.windowSelect.dispatchEvent(new Event('change'));
    out.saisieVisible = !p.windowInput.hidden;
    p.windowInput.value = '1h30';
    p.windowInput.dispatchEvent(new Event('change'));
    out.fenetre1h30 = p.windowMs();
    out.saisieRelue = p.windowInput.value;
    p.windowInput.value = 'n importe quoi';
    p.windowInput.dispatchEvent(new Event('change'));
    out.fenetreIllisible = p.windowMs();
    out.graduation = p.fmtTemps(1000 + 5400000, 1);
    out.pointsX = [...p.series.values()].find((s) => s.name === 'x').pts.map((q) => q.t - p.t0);
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
check('pile (droite) : mode ligne, 3 points sans marche d\'escalier', by['bat9: charge'] && by['bat9: charge'].mode === 'line' && by['bat9: charge'].n === 3 && by['bat9: charge'].last === 99.9, JSON.stringify(by['bat9: charge']));
check('sonde A0 (escalier) : 3 points (valeur tenue dédupliquée), dernier 2,5', by.A0 && by.A0.mode === 'step' && by.A0.n === 3 && by.A0.last === 2.5, JSON.stringify(by.A0));
check('auto-affichage déclenché une fois', res.firstData === 1, String(res.firstData));
check('message « en attente » masqué après données', res.emptyBefore === true && res.emptyAfter === false, `${res.emptyBefore}/${res.emptyAfter}`);

// --- Légende / CSV / rendu -------------------------------------------------------
check('8 puces de légende (4 + 3 sondes de durée + 1 pile)', res.chips === 8, String(res.chips));
check('clic sur puce : série masquée + estompée', res.chipOff === true, String(res.chipOff));

// --- Durée de vie (j h min) -------------------------------------------------
check('durée 30 min : heures brutes, pas de « h min »', res.duree30min === '0.5 h', res.duree30min);
check('durée 1 h 30 : « h min »', res.duree1h30 === '1 h 30 min', res.duree1h30);
check('durée 30 h : « j h min »', res.duree30h === '1 j 6 h 00 min', res.duree30h);
check('CSV : en-tête + 13 lignes de mesures', res.csvHead === 'time_s,name,value,unit' && res.csvLines === 14, `${res.csvHead} / ${res.csvLines}`);
check('horloge simulée : l\'origine du run est celle de l\'horloge posée', res.t0Horloge === 1000, String(res.t0Horloge));
check('horloge simulée : les points portent le temps simulé (0 puis 2 h)', JSON.stringify(res.pointsX) === '[0,7200000]', JSON.stringify(res.pointsX));
check('fenêtre « Custom » : le champ de saisie apparaît', res.saisieVisible === true);
check('fenêtre saisie « 1h30 » = 5400 s', res.fenetre1h30 === 5400000, String(res.fenetre1h30));
check('fenêtre saisie : le champ se réécrit « 1 h 30 min »', res.saisieRelue === '1 h 30 min', res.saisieRelue);
check('fenêtre saisie illisible : on garde la dernière durée valable', res.fenetreIllisible === 5400000, String(res.fenetreIllisible));
check('graduation à 1 h 30 du départ : « 1 h 30 min »', res.graduation === '1 h 30 min', res.graduation);
check('canvas peint (grille + courbes)', res.painted > 500, `${res.painted} px (${res.canvasSize})`);

// --- Nom des sondes internes : « ADC0 (GP26) », toutes cartes ---------------------
// Le canal du convertisseur d'abord (c'est lui que nomme le programme :
// machine.ADC(0)), la broche sérigraphiée ensuite.
const sim = readFileSync(join(ROOT, 'src', 'webview', 'sim.mts'), 'utf8');
check('sim : la sonde est nommée par probeLabel, pas par la broche brute',
  /plotter\.probe\(probeLabel\(board, pin\)/.test(sim));
check('sim : la forme du nom est « ADC<n> (<broche>) »',
  /return adc === undefined \? pin : `ADC\$\{adc\} \(\$\{pin\}\)`;/.test(sim));

// --- Durées saisies : « 1h30 », « 2 h 15 min 10 s », « 1:30:00 »… ----------------
const dureeFile = join(SCRATCH, 'duree.bundle.mjs');
buildSync({
  entryPoints: [join(ROOT, 'src', 'webview', 'duree.mts')],
  outfile: dureeFile, bundle: true, platform: 'node', format: 'esm', absWorkingDir: ROOT,
});
const { analyserDuree, formaterDuree, pasDeTemps } = await import(pathToFileURL(dureeFile).href);
for (const [texte, attendu] of [
  ['90', 90], ['90 s', 90], ['45min', 2700], ['1h30', 5400], ['1 h 30 min', 5400],
  ['2h15m10s', 8110], ['1:30:00', 5400], ['1:30', 90], ['1,5', 1.5],
  ['', null], ['0', null], ['abc', null], ['30min2h', null],
]) {
  check(`durée saisie « ${texte} » → ${attendu}`, analyserDuree(texte) === attendu, String(analyserDuree(texte)));
}
check('durée écrite : 150 s → « 2 min 30 s »', formaterDuree(150) === '2 min 30 s', formaterDuree(150));
check('durée écrite : 3900 s → « 1 h 05 min »', formaterDuree(3900) === '1 h 05 min', formaterDuree(3900));
check('graduation de temps : 2 h sur 5 cases → pas de 30 min', pasDeTemps(1440) === 1800, String(pasDeTemps(1440)));

const catalogFile = join(SCRATCH, 'catalog.bundle.mjs');
buildSync({
  entryPoints: [join(ROOT, 'src', 'webview', 'diagram', 'catalog.mts')],
  outfile: catalogFile, bundle: true, platform: 'node', format: 'esm',
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const { mcuPinRole } = await import(pathToFileURL(catalogFile).href);
const label = (board, pin) => {
  const adc = mcuPinRole(board, pin).adcChannel;
  return adc === undefined ? pin : `ADC${adc} (${pin})`;
};
check('Uno : A0 → ADC0 (A0), A5 → ADC5 (A5)',
  label('uno', 'A0') === 'ADC0 (A0)' && label('uno', 'A5') === 'ADC5 (A5)',
  label('uno', 'A0') + ' / ' + label('uno', 'A5'));
check('Mega : les 16 entrées analogiques sont numérotées ADC0..ADC15',
  Array.from({ length: 16 }, (_, i) => label('mega', `A${i}`)).every((s, i) => s === `ADC${i} (A${i})`),
  label('mega', 'A15'));
check('Pico : GP26 → ADC0 (GP26), GP28 → ADC2 (GP28)',
  label('pico', 'GP26') === 'ADC0 (GP26)' && label('pico', 'GP28') === 'ADC2 (GP28)',
  label('pico', 'GP26') + ' / ' + label('pico', 'GP28'));
check('une broche SANS convertisseur garde son nom',
  label('pico', 'GP15') === 'GP15' && label('uno', '13') === '13',
  label('pico', 'GP15') + ' / ' + label('uno', '13'));
check('documentation FR et EN à jour (forme du nom de sonde)',
  /ADC0 \(GP26\)/.test(readFileSync(join(ROOT, 'docs', 'fr', 'USAGE.md'), 'utf8')) &&
  /ADC0 \(GP26\)/.test(readFileSync(join(ROOT, 'docs', 'en', 'USAGE.md'), 'utf8')));

console.log(failures ? `\n${failures} échec(s)` : '\nTraceur : tous les contrôles passent.');
process.exit(failures ? 1 : 0);
