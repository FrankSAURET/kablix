// Joystick analogique (kablix-analog-joystick) en Chrome headless.
//
// Retour de Frank : « l'état du bouton appuyé ne se verrouille pas sur CTRL +
// clic ». Le bouton SEL relâchait toujours l'appui, alors que le bouton poussoir
// le verrouille depuis longtemps (`sticky`) — impossible de tester un maintien
// sans garder le doigt sur la souris.
//
// Le banc joue les VRAIS événements sur le VRAI composant et écoute les
// événements `button-press` / `button-release` — ceux que `sim.mts` branche sur
// la broche SEL : c'est exactement ce que voit la simulation.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-joystick');
mkdirSync(CACHE, { recursive: true });
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');

const entry = `
import '${SRC}/composants/analog-joystick-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const js = document.createElement('kablix-analog-joystick');
  document.body.style.margin = '0';
  document.body.appendChild(js);
  await js.updateComplete;
  await wait(30);

  // Journal des événements vus par la simulation (sim.mts branche exactement
  // ceux-là sur setInput de la broche SEL).
  const log = [];
  js.addEventListener('button-press', () => log.push('press'));
  js.addEventListener('button-release', () => log.push('release'));
  const since = (n) => log.slice(n).join(',');

  // Zone de clic SEL : le petit cercle du groupe transparent superposé au dessin.
  const sel = js.renderRoot.querySelector('g[style*="pointer-events"] circle');
  const send = (type, ctrl) =>
    sel.dispatchEvent(new MouseEvent(type, { ctrlKey: !!ctrl, bubbles: true, cancelable: true }));
  /** Couleur de l'indicateur SEL du dessin (#circle46) : le retour VISUEL. */
  const selColor = () => js.renderRoot.querySelector('#circle46')?.style.fill || '';

  const res = {};
  res.selFound = !!sel;

  // 1) Clic simple : appui puis relâchement.
  let n = log.length;
  send('mousedown', false);
  await js.updateComplete;
  res.downPressed = js.pressed;
  res.downColor = selColor();
  send('mouseup', false);
  await js.updateComplete;
  res.simple = { events: since(n), pressed: js.pressed, color: selColor() };

  // 2) Ctrl+clic : l'appui reste VERROUILLÉ après le relâchement.
  n = log.length;
  send('mousedown', true);
  send('mouseup', true);
  await js.updateComplete;
  res.sticky = { events: since(n), pressed: js.pressed, color: selColor() };

  // 3) Verrouillé : la souris quitte la zone, l'appui TIENT.
  n = log.length;
  send('mouseleave', false);
  await js.updateComplete;
  res.stickyLeave = { events: since(n), pressed: js.pressed };

  // 4) Clic simple suivant : il LIBÈRE (et ne ré-émet pas un press parasite).
  n = log.length;
  send('mousedown', false);
  send('mouseup', false);
  await js.updateComplete;
  res.unstick = { events: since(n), pressed: js.pressed, color: selColor() };

  // 5) Sortie de zone en cours d'appui NON verrouillé : relâche (sinon la broche
  //    resterait basse pour toujours après un clic-glissé hors du cercle).
  n = log.length;
  send('mousedown', false);
  send('mouseleave', false);
  await js.updateComplete;
  res.leave = { events: since(n), pressed: js.pressed };

  // 6) Survol sans appui : aucun événement.
  n = log.length;
  send('mouseleave', false);
  res.idleLeave = { events: since(n), pressed: js.pressed };

  // 7) Clavier : espace appuie, espace relâché avec Ctrl verrouille.
  const knob = js.renderRoot.querySelector('#knob');
  const key = (type, ctrl) =>
    knob.dispatchEvent(new KeyboardEvent(type, { key: ' ', ctrlKey: !!ctrl, bubbles: true }));
  n = log.length;
  key('keydown', false);
  key('keyup', true);
  await js.updateComplete;
  res.keySticky = { events: since(n), pressed: js.pressed };
  n = log.length;
  key('keydown', false);
  key('keyup', false);
  await js.updateComplete;
  res.keyRelease = { events: since(n), pressed: js.pressed };

  // 8) Manche : Ctrl au relâchement garde la déflexion (comportement d'origine,
  //    on vérifie qu'il n'a pas régressé).
  const down = (x, y) => knob.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: x, clientY: y, bubbles: true }));
  const moveTo = (x, y) => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  const upAt = (ctrl) => window.dispatchEvent(new PointerEvent('pointerup', { ctrlKey: !!ctrl, bubbles: true }));
  const kr = knob.getBoundingClientRect();
  const cx = kr.left + kr.width / 2;
  const cy = kr.top + kr.height / 2;
  down(cx, cy); moveTo(cx + 12, cy); upAt(true);
  await js.updateComplete;
  res.knobLocked = { x: js.xValue, y: js.yValue };
  down(cx, cy); moveTo(cx + 12, cy); upAt(false);
  await js.updateComplete;
  res.knobSpring = { x: js.xValue, y: js.yValue };

  const pre = document.createElement('pre'); pre.id = 'm'; pre.textContent = JSON.stringify(res); document.body.appendChild(pre);
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
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

if (!chrome) {
  console.log('(Chrome introuvable : banc joystick sauté)');
} else {
  const url = 'file:///' + join(CACHE, 'p.html').replace(/\\/g, '/');
  const dom = execFileSync(chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="m"[^>]*>([^<]+)<\/pre>/);
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
  check('mesures relevées dans le rendu', !!r);
  if (r) {
    check('la zone de clic SEL existe', r.selFound);
    check('mousedown : le bouton est enfoncé', r.downPressed === true);
    check('mousedown : l’indicateur SEL s’allume (blanc)', /#fff|rgb\(255/.test(r.downColor), r.downColor);
    check('clic simple : press puis release', r.simple.events === 'press,release', r.simple.events);
    check('clic simple : le bouton est relâché', r.simple.pressed === false);
    check('clic simple : l’indicateur SEL s’éteint', !/#fff|rgb\(255,\s*255,\s*255\)/.test(r.simple.color), r.simple.color);

    check('Ctrl+clic : AUCUN release émis (appui verrouillé)', r.sticky.events === 'press', r.sticky.events);
    check('Ctrl+clic : le bouton reste enfoncé', r.sticky.pressed === true);
    check('Ctrl+clic : l’indicateur SEL reste allumé', /#fff|rgb\(255/.test(r.sticky.color), r.sticky.color);
    check('verrouillé : la souris peut quitter la zone sans relâcher',
      r.stickyLeave.events === '' && r.stickyLeave.pressed === true, r.stickyLeave.events);
    check('clic simple suivant : il LIBÈRE le bouton', r.unstick.pressed === false);
    check('clic simple suivant : un seul release, aucun press parasite',
      r.unstick.events === 'release', r.unstick.events);

    check('appui non verrouillé + sortie de zone : le bouton est relâché',
      r.leave.events === 'press,release' && r.leave.pressed === false, r.leave.events);
    check('survol sans appui : aucun événement', r.idleLeave.events === '', r.idleLeave.events);

    check('clavier : Espace relâché avec Ctrl verrouille aussi',
      r.keySticky.events === 'press' && r.keySticky.pressed === true, r.keySticky.events);
    check('clavier : Espace seul relâche', r.keyRelease.events === 'release' && r.keyRelease.pressed === false,
      r.keyRelease.events);

    check('manche : Ctrl au relâchement garde la déflexion',
      Math.abs(r.knobLocked.x) > 0.1, `x=${r.knobLocked.x}`);
    check('manche : sans Ctrl il revient au centre',
      r.knobSpring.x === 0 && r.knobSpring.y === 0, `x=${r.knobSpring.x} y=${r.knobSpring.y}`);
  }
}

// ------------------------------------------------------------- sources ----
const src = readFileSync(join(ROOT, 'src/webview/composants/analog-joystick-element.mts'), 'utf8');
check('joystick : le verrou utilise le même helper que le bouton poussoir',
  /import \{ ctrlCmdPressed, SPACE_KEYS \}/.test(src));
check('joystick : release() reçoit l’événement (sinon Ctrl est invisible)',
  /private release\(e\?: KeyboardEvent \| MouseEvent\)/.test(src));
check('joystick : un appui déjà verrouillé ne ré-émet pas button-press',
  /private press\([\s\S]{0,300}if \(!this\.pressed\) \{\s*this\.pressed = true;/.test(src));
check('joystick : la sortie de zone est branchée', /@mouseleave=\$\{/.test(src));

const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
check('sim : SEL est bien piloté par button-press / button-release',
  /button-press', press\)[\s\S]{0,120}button-release', release\)/.test(sim));

for (const [lang, path, mot] of [
  ['FR', 'docs/fr/composants/joystick.md', /Ctrl\+clic/],
  ['EN', 'docs/en/composants/joystick.md', /Ctrl\+click/],
]) {
  const doc = readFileSync(join(ROOT, path), 'utf8');
  check(`aide ${lang} : le verrou Ctrl+clic du bouton SEL est documenté`, mot.test(doc));
}

console.log(failures ? `\nJoystick : ${failures} échec(s).` : '\nJoystick : tous les contrôles passent — le bouton SEL se verrouille en Ctrl+clic.');
process.exit(failures ? 1 : 0);
