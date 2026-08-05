// Boutons poussoirs : le maintien Ctrl+clic TIENT quand la souris s'en va.
//
// Retour de Frank : « button-6mm-uno ne verrouille l'état instable que tant que
// la souris est sur le composant, déverrouille quand le survol cesse. » Le
// bouton 6 mm branchait `pointerleave` directement sur son relâchement : à cet
// instant Ctrl n'est plus tenu, le verrou sautait donc dès que le curseur
// quittait le dessin — le maintien ne servait à rien.
//
// Le banc joue les VRAIS événements sur les VRAIS composants et écoute
// `button-press` / `button-release`, exactement ce que `sim.mts` branche sur la
// broche : c'est ce que voit la simulation.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-button-latch');
mkdirSync(CACHE, { recursive: true });
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');

const entry = `
import '${SRC}/composants/pushbutton-element.mjs';
import '${SRC}/composants/pushbutton-6mm-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function mesure(tag) {
  const b = document.createElement(tag);
  document.body.appendChild(b);
  await b.updateComplete;
  await wait(20);
  const log = [];
  b.addEventListener('button-press', () => log.push('press'));
  b.addEventListener('button-release', () => log.push('release'));
  const since = (n) => log.slice(n).join(',');
  const btn = b.renderRoot.querySelector('button');
  const souris = (type, ctrl) =>
    btn.dispatchEvent(new MouseEvent(type, { ctrlKey: !!ctrl, bubbles: true, cancelable: true }));
  const quitte = (ctrl) =>
    btn.dispatchEvent(new PointerEvent('pointerleave', { ctrlKey: !!ctrl, bubbles: false, cancelable: true }));
  /** Le capuchon enfoncé est-il dessiné ? (le retour VISUEL de l'appui) */
  const enfonce = () => {
    const c = b.renderRoot.querySelector('.button-active-circle');
    return !!c && c.style.display !== 'none';
  };

  const r = {};
  // 1) Clic simple.
  let n = log.length;
  souris('mousedown', false);
  await b.updateComplete;
  r.appui = { pressed: b.pressed, dessin: enfonce() };
  souris('mouseup', false);
  await b.updateComplete;
  r.simple = { events: since(n), pressed: b.pressed, dessin: enfonce() };

  // 2) Ctrl+clic : l'appui reste verrouillé.
  n = log.length;
  souris('mousedown', true);
  souris('mouseup', true);
  await b.updateComplete;
  r.verrou = { events: since(n), pressed: b.pressed, dessin: enfonce() };

  // 3) LE CAS DE FRANK : la souris s'en va, Ctrl RELÂCHÉ. L'appui doit tenir.
  n = log.length;
  quitte(false);
  await b.updateComplete;
  r.quitteVerrou = { events: since(n), pressed: b.pressed, dessin: enfonce() };

  // 4) Clic simple suivant : il libère, sans press parasite.
  n = log.length;
  souris('mousedown', false);
  souris('mouseup', false);
  await b.updateComplete;
  r.libere = { events: since(n), pressed: b.pressed };

  // 5) Appui NON verrouillé + sortie : relâche (sinon la broche resterait basse).
  n = log.length;
  souris('mousedown', false);
  quitte(false);
  await b.updateComplete;
  r.quitteSimple = { events: since(n), pressed: b.pressed };

  // 6) Survol qui cesse sans appui : rien du tout.
  n = log.length;
  quitte(false);
  r.repos = { events: since(n), pressed: b.pressed };

  // 7) Clavier : Espace relâché avec Ctrl verrouille aussi.
  const touche = (type, ctrl) =>
    btn.dispatchEvent(new KeyboardEvent(type, { key: ' ', ctrlKey: !!ctrl, bubbles: true }));
  n = log.length;
  touche('keydown', false);
  touche('keyup', true);
  await b.updateComplete;
  r.clavierVerrou = { events: since(n), pressed: b.pressed };
  n = log.length;
  quitte(false);
  await b.updateComplete;
  r.clavierQuitte = { events: since(n), pressed: b.pressed };
  n = log.length;
  touche('keydown', false);
  touche('keyup', false);
  await b.updateComplete;
  r.clavierLibere = { events: since(n), pressed: b.pressed };
  return r;
}

async function run() {
  document.body.style.margin = '0';
  const res = {
    'kablix-pushbutton': await mesure('kablix-pushbutton'),
    'kablix-pushbutton-6mm': await mesure('kablix-pushbutton-6mm'),
  };
  const pre = document.createElement('pre'); pre.id = 'm';
  pre.textContent = JSON.stringify(res); document.body.appendChild(pre);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: join(ROOT, 'scripts'), logLevel: 'silent',
});
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body><script>${b.outputFiles[0].text}</script>`);

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
let failures = 0;
let ok = 0;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
  if (cond) ok++; else failures++;
};

if (!chrome) {
  console.log('(Chrome introuvable : banc des boutons sauté)');
} else {
  const url = 'file:///' + join(CACHE, 'p.html').replace(/\\/g, '/');
  const dom = execFileSync(chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="m"[^>]*>([^<]+)<\/pre>/);
  const tout = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
  check('mesures relevées dans le rendu', !!tout);
  for (const [tag, nom] of [['kablix-pushbutton', 'poussoir'], ['kablix-pushbutton-6mm', 'bouton 6 mm']]) {
    const r = tout?.[tag];
    if (!r) { check(`${nom} : mesures présentes`, false, tag); continue; }
    check(`${nom} : appui — le bouton s'enfonce, dessin compris`,
      r.appui.pressed === true && r.appui.dessin === true, JSON.stringify(r.appui));
    check(`${nom} : clic simple — press puis release`, r.simple.events === 'press,release', r.simple.events);
    check(`${nom} : clic simple — le bouton remonte`,
      r.simple.pressed === false && r.simple.dessin === false, JSON.stringify(r.simple));
    check(`${nom} : Ctrl+clic — aucun release, l'appui est VERROUILLÉ`,
      r.verrou.events === 'press' && r.verrou.pressed === true, r.verrou.events);
    check(`${nom} : Ctrl+clic — le capuchon reste enfoncé`, r.verrou.dessin === true);
    check(`${nom} : LE CAS DE FRANK — la souris s'en va, l'appui TIENT`,
      r.quitteVerrou.events === '' && r.quitteVerrou.pressed === true,
      `${r.quitteVerrou.events || 'aucun événement'} / pressed=${r.quitteVerrou.pressed}`);
    check(`${nom} : verrouillé hors survol — le capuchon reste enfoncé`, r.quitteVerrou.dessin === true);
    check(`${nom} : clic suivant — il libère, sans press parasite`,
      r.libere.events === 'release' && r.libere.pressed === false, r.libere.events);
    check(`${nom} : appui simple + sortie — le bouton est relâché`,
      r.quitteSimple.events === 'press,release' && r.quitteSimple.pressed === false, r.quitteSimple.events);
    check(`${nom} : survol qui cesse au repos — aucun événement`, r.repos.events === '', r.repos.events);
    check(`${nom} : clavier — Espace relâché avec Ctrl verrouille aussi`,
      r.clavierVerrou.events === 'press' && r.clavierVerrou.pressed === true, r.clavierVerrou.events);
    check(`${nom} : clavier — le verrou survit lui aussi à la sortie de survol`,
      r.clavierQuitte.events === '' && r.clavierQuitte.pressed === true, r.clavierQuitte.events);
    check(`${nom} : clavier — Espace seul relâche`,
      r.clavierLibere.events === 'release' && r.clavierLibere.pressed === false, r.clavierLibere.events);
  }
}

// ------------------------------------------------------------- sources ----
for (const [f, nom] of [
  ['pushbutton-element.mts', 'poussoir'],
  ['pushbutton-6mm-element.mts', 'bouton 6 mm'],
]) {
  const src = readFileSync(join(ROOT, 'src/webview/composants', f), 'utf8');
  check(`${nom} : la sortie de survol passe par leave(), pas par up()`,
    /@pointerleave=\$\{this\.leave\}/.test(src), 'brancher up() sur pointerleave casse le verrou');
  check(`${nom} : leave() respecte le verrou`,
    /private leave\(e: MouseEvent\) \{[\s\S]{0,160}if \(!this\.sticky\)/.test(src));
  check(`${nom} : le verrou est un ÉTAT, pas la touche Ctrl relue trop tard`,
    /private sticky = false;/.test(src) && /this\.sticky = true;/.test(src));
}

if (failures) {
  console.log(`\nbutton-latch : ${failures} ÉCHEC(S) sur ${ok + failures} contrôles.`);
  process.exit(1);
}
console.log(`\nbutton-latch : ${ok} contrôles OK — Ctrl+clic maintient les deux poussoirs, même quand la souris s'en va.`);
