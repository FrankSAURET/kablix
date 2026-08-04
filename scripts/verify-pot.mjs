// Vérifie la LECTURE des potentiomètres : « Position : 66 % (6,6 kΩ|3,4 kΩ) »
// affiché juste au-dessus du dessin PENDANT LA SIMULATION (demande de Frank).
// Le pourcentage seul ne dit pas ce que voit le montage : les DEUX bras de la
// piste sont donnés, curseur→bas puis curseur→haut, et leur somme fait la
// valeur nominale. Le commentaire de nomenclature dit exactement la même chose
// — et la dit PAREIL (même formatage, cf. quantity.mts).
//
// Deux composants portent la même étiquette : le potentiomètre rotatif et la
// glissière. Le banc les mesure tous les deux dans un vrai navigateur.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(ROOT, 'node_modules', '.cache-pot');
mkdirSync(CACHE, { recursive: true });

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// --- 1. Le texte, sans navigateur ------------------------------------------
console.log('Texte de la lecture :');
{
  // UN SEUL paquet pour les trois modules : bundlés séparément, chacun
  // emporterait sa propre copie de i18n et initLocale ne toucherait que l'une
  // d'elles (la lecture serait restée en anglais).
  writeFileSync(join(CACHE, 'api.mjs'), `
export { potReadoutText } from '../../src/webview/composants/utils/pot-readout.mjs';
export { potTracksText } from '../../src/webview/quantity.mjs';
export { partComment } from '../../src/webview/diagram/bom.mjs';
export { initLocale } from '../../src/webview/i18n.mjs';
`);
  const apiFile = join(CACHE, 'api.bundle.mjs');
  await esbuild.build({
    entryPoints: [join(CACHE, 'api.mjs')],
    outfile: apiFile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
  });
  const A = await import(pathToFileURL(apiFile).href);

  A.initLocale('fr');
  check('exactement le texte demandé par Frank',
    A.potReadoutText(66, 10_000) === 'Position : 66 % (6,6 kΩ|3,4 kΩ)',
    A.potReadoutText(66, 10_000));
  check('les deux bras de la piste, dans l’ordre curseur→bas puis curseur→haut',
    A.potReadoutText(25, 4700) === 'Position : 25 % (1,175 kΩ|3,525 kΩ)',
    A.potReadoutText(25, 4700));
  // La somme des deux bras fait toujours la valeur nominale : c'est LA
  // propriété que Frank veut lire d'un coup d'œil sur un pont diviseur.
  check('la somme des deux bras fait la valeur nominale',
    A.potTracksText(66, 10_000) === '6,6 kΩ|3,4 kΩ' &&
    A.potTracksText(80, 4700) === '3,76 kΩ|940 Ω',
    A.potTracksText(80, 4700));
  // Le même préfixe SI que la nomenclature : c'est le seul et même formateur.
  check('les ohms suivent le préfixe : Ω, kΩ, MΩ',
    A.potReadoutText(50, 500).endsWith('(250 Ω|250 Ω)') &&
    A.potReadoutText(50, 10_000).endsWith('(5 kΩ|5 kΩ)') &&
    A.potReadoutText(50, 2_000_000).endsWith('(1 MΩ|1 MΩ)'),
    [500, 10_000, 2_000_000].map((o) => A.potReadoutText(50, o)).join(' / '));
  check('curseur en butée : 0 Ω d’un côté, tout de l’autre',
    A.potReadoutText(0, 10_000) === 'Position : 0 % (0 Ω|10 kΩ)' &&
    A.potReadoutText(100, 10_000) === 'Position : 100 % (10 kΩ|0 Ω)',
    A.potReadoutText(0, 10_000) + ' / ' + A.potReadoutText(100, 10_000));
  // Le fork rotatif déclare `value: {}` sans type : au premier rendu la
  // position arrive en TEXTE. La lecture ne doit pas se vider pour autant.
  check('position ou valeur nominale reçue en texte : lue quand même',
    A.potTracksText('25', '4700') === '1,175 kΩ|3,525 kΩ',
    A.potTracksText('25', '4700'));
  check('sans valeur nominale exploitable, le pourcentage reste seul',
    A.potReadoutText(30, 0) === 'Position : 30 %' &&
    A.potReadoutText(30, NaN) === 'Position : 30 %',
    A.potReadoutText(30, 0));
  // L'écran et le CSV ne doivent JAMAIS diverger : le commentaire de
  // nomenclature d'un pot à 4,7 kΩ réglé au quart porte le même texte.
  const comment = A.partComment({ id: 'Pot1', type: 'pot', x: 0, y: 0, attrs: { ohms: '4700', value: '25' } });
  check('même texte que le commentaire de nomenclature',
    comment.includes(A.potReadoutText(25, 4700)), comment);

  A.initLocale('en');
  check('en anglais : point décimal',
    A.potReadoutText(25, 4700) === 'Position : 25 % (1.175 kΩ|3.525 kΩ)',
    A.potReadoutText(25, 4700));
  A.initLocale('fr');
}

// --- 2. L'étiquette à l'écran (Chrome headless) -----------------------------
console.log('Étiquette affichée (Chrome headless) :');
{
  const entry = `
import { initLocale } from '../../src/webview/i18n.mjs';
import '../../src/webview/composants/potentiometer-element.mjs';
import '../../src/webview/composants/slide-potentiometer-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
async function run() {
  initLocale('fr');
  for (const [tag, nom] of [['kablix-potentiometer', 'rotatif'], ['kablix-slide-potentiometer', 'glissière']]) {
    const el = document.createElement(tag);
    // Réglages du catalogue : position en %, résistance totale en ohms.
    el.setAttribute('min', '0');
    el.setAttribute('max', '100');
    el.setAttribute('value', '50');
    el.setAttribute('ohms', '10000');
    document.body.appendChild(el);
    await el.updateComplete;
    const lire = () => el.shadowRoot.querySelector('.pot-readout');

    ok(nom + ' : rien d’affiché en ÉDITION', !lire());

    el.toggleAttribute('simulating', true);
    await el.updateComplete;
    ok(nom + ' : la lecture apparaît au lancement de la simulation',
      !!lire() && lire().textContent.trim() === 'Position : 50 % (5 kΩ|5 kΩ)',
      lire() ? lire().textContent.trim() : 'absente');

    // Tourner le bouton = ce que fait la souris en simulation. Les deux bras
    // bougent en sens inverse : c'est ce qui rend le pont diviseur lisible.
    el.value = 25;
    await el.updateComplete;
    ok(nom + ' : la lecture SUIT le curseur, les deux bras compris',
      lire().textContent.trim() === 'Position : 25 % (2,5 kΩ|7,5 kΩ)', lire().textContent.trim());

    // Changer la valeur nominale dans l'inspecteur recalcule les ohms.
    el.setAttribute('ohms', '4700');
    await el.updateComplete;
    ok(nom + ' : changer la valeur nominale recalcule les ohms',
      lire().textContent.trim() === 'Position : 25 % (1,175 kΩ|3,525 kΩ)', lire().textContent.trim());

    // « Juste au-dessus du composant, au plus près » : l'étiquette est hors du
    // dessin, au-dessus, et à moins de 4 px de son bord haut.
    const svg = el.shadowRoot.querySelector('svg').getBoundingClientRect();
    const lab = lire().getBoundingClientRect();
    ok(nom + ' : posée AU-DESSUS du dessin', lab.bottom <= svg.top + 0.5,
      'bas étiquette ' + lab.bottom.toFixed(1) + ' / haut dessin ' + svg.top.toFixed(1));
    ok(nom + ' : collée au composant (moins de 4 px)', svg.top - lab.bottom < 4,
      (svg.top - lab.bottom).toFixed(1) + ' px');
    ok(nom + ' : centrée sur le dessin',
      Math.abs((lab.left + lab.right) / 2 - (svg.left + svg.right) / 2) < 1,
      ((lab.left + lab.right) / 2).toFixed(1) + ' / ' + ((svg.left + svg.right) / 2).toFixed(1));
    ok(nom + ' : ne vole aucun clic (le bouton reste saisissable)',
      getComputedStyle(lire()).pointerEvents === 'none');

    // Hors flux : l'apparition de la lecture ne doit PAS grandir le composant,
    // sinon le centre de rotation se déplace et un composant tourné se décale.
    const avecLecture = el.getBoundingClientRect();
    el.toggleAttribute('simulating', false);
    await el.updateComplete;
    const sansLecture = el.getBoundingClientRect();
    ok(nom + ' : la lecture ne change pas la taille du composant',
      Math.abs(avecLecture.height - sansLecture.height) < 0.5 &&
      Math.abs(avecLecture.width - sansLecture.width) < 0.5,
      avecLecture.width.toFixed(1) + '×' + avecLecture.height.toFixed(1) + ' vs ' +
      sansLecture.width.toFixed(1) + '×' + sansLecture.height.toFixed(1));
    ok(nom + ' : la lecture disparaît à l’arrêt', !lire());
  }
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
  writeFileSync(join(CACHE, 'e.mjs'), entry);
  const b = await esbuild.build({
    entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
    loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
  });
  writeFileSync(join(CACHE, 'p.html'),
    `<!doctype html><meta charset=utf8><body style="margin:0;padding:60px">` +
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
