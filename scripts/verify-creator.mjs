// Vérifie la détection des marqueurs du créateur de composants (svg-markers.mts)
// dans un vrai Chrome headless : cercles rouges (broches), cercle vert (ancre),
// textes rouges (noms), nettoyage du SVG final, conversion des unités mm
// d'Inkscape et transforms imbriqués.
//
// Usage : node scripts/verify-creator.mjs
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
  entryPoints: [join(ROOT, 'src', 'webview', 'diagram', 'svg-markers.mts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Markers',
}).outputFiles[0].text;

// SVG « externe » façon Inkscape : unités mm, groupe transformé, 3 broches
// rouges (opacité 0,8), ancre verte (0,5) sur la broche VCC, noms en rouge.
const EXT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="30mm" viewBox="0 0 50 30">
  <rect x="2" y="2" width="46" height="26" fill="#3a6ea5"/>
  <g transform="translate(5,0)">
    <circle cx="5" cy="25" r="1.5" style="fill:#ff0000;fill-opacity:0.8"/>
    <circle cx="20" cy="25" r="1.5" fill="#ff0000" fill-opacity="0.8"/>
    <circle cx="35" cy="25" r="1.5" style="fill:#ff0000;fill-opacity:0.8"/>
    <circle cx="5" cy="25" r="3" style="fill:#00ff00;fill-opacity:0.5"/>
    <text x="5" y="21" style="fill:#ff0000;font-size:3px" text-anchor="middle">VCC</text>
    <text x="20" y="21" style="fill:#ff0000;font-size:3px" text-anchor="middle">GND</text>
    <text x="35" y="21" style="fill:#ff0000;font-size:3px" text-anchor="middle">OUT</text>
  </g>
  <text x="25" y="12" style="fill:#ffffff;font-size:4px" text-anchor="middle">MODULE</text>
</svg>`;

// SVG « interne » à la même échelle : ancre verte au même endroit que VCC.
const INT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="30mm" viewBox="0 0 50 30">
  <path d="M10 25 L10 10 L40 10" stroke="#111" fill="none" stroke-width="0.5"/>
  <circle cx="10" cy="25" r="3" fill="#00ff00" opacity="0.5"/>
</svg>`;

// SVG sans marqueur (composant décoratif) : rien ne doit être détecté ni retiré.
const PLAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60">
  <circle cx="40" cy="30" r="20" fill="#ff0000"/><text x="40" y="34" fill="#fff">LED</text>
</svg>`;

const script = `
try {
  const out = {};
  out.ext = Markers.analyzeMarkedSvg(${JSON.stringify(EXT_SVG)});
  out.int = Markers.analyzeMarkedSvg(${JSON.stringify(INT_SVG)});
  out.plain = Markers.analyzeMarkedSvg(${JSON.stringify(PLAIN_SVG)});
  document.getElementById('result').textContent = JSON.stringify(out);
} catch (e) { document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e); }
`;
const htmlPath = join(SCRATCH, 'verify-creator.html');
writeFileSync(
  htmlPath,
  `<!doctype html><meta charset=utf-8><body><pre id="result"></pre><script>${bundle}</script><script>${script}</script></body>`
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
  console.error(raw.slice(0, 2000));
  process.exit(1);
}
const res = JSON.parse(raw);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const MM = 96 / 25.4; // conversion mm → px CSS

// --- Vue externe -------------------------------------------------------------
const ext = res.ext;
check('externe : 3 broches détectées', ext.pins.length === 3, JSON.stringify(ext.pins));
const byName = Object.fromEntries(ext.pins.map((p) => [p.name, p]));
check('externe : noms VCC/GND/OUT associés', !!(byName.VCC && byName.GND && byName.OUT), JSON.stringify(ext.pins));
// Broche VCC : (5+5, 25) mm dans le groupe translaté → px.
check('externe : VCC à (10,25) mm', !!byName.VCC && near(byName.VCC.x, 10 * MM) && near(byName.VCC.y, 25 * MM), JSON.stringify(byName.VCC));
check('externe : OUT à (40,25) mm', !!byName.OUT && near(byName.OUT.x, 40 * MM) && near(byName.OUT.y, 25 * MM), JSON.stringify(byName.OUT));
check('externe : ancre verte sur VCC', !!ext.anchor && near(ext.anchor.x, 10 * MM) && near(ext.anchor.y, 25 * MM), JSON.stringify(ext.anchor));
check('externe : taille normalisée en px', near(ext.width, 50 * MM, 2) && near(ext.height, 30 * MM, 2), `${ext.width}×${ext.height}`);
check('externe : marqueurs retirés', !/ff0000|#f00|(0,\s*255)/i.test(ext.svg.replace(/<rect[^>]*>/, '')), ext.svg.slice(0, 400));
check('externe : dessin conservé', ext.svg.includes('MODULE') && ext.svg.includes('3a6ea5'), ext.svg.slice(0, 400));
check("externe : noms rouges retirés", !ext.svg.includes('VCC'), ext.svg.slice(0, 400));

// --- Vue interne ---------------------------------------------------------------
const int = res.int;
check('interne : ancre verte détectée à (10,25) mm', !!int.anchor && near(int.anchor.x, 10 * MM) && near(int.anchor.y, 25 * MM), JSON.stringify(int.anchor));
check('interne : aucune broche (pas de rouge)', int.pins.length === 0, JSON.stringify(int.pins));
check('interne : tracé conservé', int.svg.includes('M10 25'), int.svg.slice(0, 300));
// Calage : ancres identiques → décalage nul (mêmes échelles).
check('calage externe/interne : décalage ≈ 0', near(ext.anchor.x - int.anchor.x, 0) && near(ext.anchor.y - int.anchor.y, 0));

// --- SVG sans marqueur ---------------------------------------------------------
const plain = res.plain;
check('sans marqueur : 0 broche, pas d’ancre', plain.pins.length === 0 && plain.anchor === null, JSON.stringify(plain.pins));
check('sans marqueur : rouge opaque conservé', plain.svg.includes('#ff0000') || plain.svg.includes('ff0000'), plain.svg.slice(0, 300));

// --- Évaluateur d'expressions (caractéristique des contrôles de simulation) ----
// Module pur (pas de DOM) : bundlé et exécuté directement dans ce process node.
const exprBundle = buildSync({
  entryPoints: [join(ROOT, 'src', 'webview', 'diagram', 'expr.mts')],
  bundle: true,
  write: false,
  format: 'cjs',
}).outputFiles[0].text;
const exprModule = { exports: {} };
new Function('module', 'exports', exprBundle)(exprModule, exprModule.exports);
const { compileExpr } = exprModule.exports;

const evalOk = (src, vars, expected, tol = 1e-9) => {
  try {
    const got = compileExpr(src, Object.keys(vars))(vars);
    return Math.abs(got - expected) <= tol ? true : `= ${got}, attendu ${expected}`;
  } catch (e) {
    return `throw: ${e.message}`;
  }
};
const evalThrows = (src, varNames) => {
  try {
    compileExpr(src, varNames);
    return 'aucune erreur levée';
  } catch {
    return true;
  }
};
const exprCheck = (label, r) => check(label, r === true, typeof r === 'string' ? r : '');
exprCheck('expr : priorités 1+2*3^2', evalOk('1+2*3^2', {}, 19));
exprCheck('expr : puissance associative à droite 2^3^2', evalOk('2^3^2', {}, 512));
exprCheck('expr : moins unaire et parenthèses', evalOk('-(2+3)*-2', {}, 10));
exprCheck('expr : caractéristique LDR 3.3*x/(x+R1lx)', evalOk('3.3*x/(x+R1lx)', { x: 500, R1lx: 1000 }, 1.1));
exprCheck('expr : fonctions clamp/log10/sqrt', evalOk('clamp(log10(x)*sqrt(4), 0, 10)', { x: 1000 }, 6));
exprCheck('expr : constante pi', evalOk('2*pi', {}, 2 * Math.PI));
exprCheck('expr : notation 1e-3 et %', evalOk('1e3 % 7 + .5', {}, 6.5));
exprCheck('expr : variable inconnue refusée à la compilation', evalThrows('x + y', ['x']));
exprCheck('expr : fonction inconnue refusée', evalThrows('foo(x)', ['x']));
exprCheck('expr : syntaxe invalide refusée', evalThrows('2 *', ['x']));

console.log(failures === 0 ? '\nverify-creator : tous les contrôles sont verts.' : `\nverify-creator : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
