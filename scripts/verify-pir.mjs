// Bulles d'aide du capteur PIR (kablix-pir-motion-sensor) en Chrome headless.
//
// Demande de Frank (v2026.7.200) : la bulle doit apparaître JUSTE EN DESSOUS du
// pointeur (5 px) et CENTRÉE (gauche/droite) dessus. Avant, elle était collée
// au-dessus-à-droite (`translate(8px, -100%)`), donc elle masquait ce que la
// souris survolait et partait en biais.
//
// On mesure la position RÉELLE de la bulle (getBoundingClientRect) face aux
// coordonnées du pointeur, pas le CSS écrit dans la source.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-pir');
mkdirSync(CACHE, { recursive: true });
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');

const entry = `
import '${SRC}/composants/pir-motion-sensor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const pir = document.createElement('kablix-pir-motion-sensor');
  document.body.style.margin = '0';
  document.body.appendChild(pir);
  await pir.updateComplete;
  await wait(30);

  const wrap = () => pir.renderRoot.querySelector('.wrap');
  const bubble = () => pir.renderRoot.querySelector('.bubble');
  const move = (x, y) => wrap().dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  /** Position de la bulle RELATIVE au pointeur : écart du bord haut et du centre. */
  const at = (x, y) => {
    const r = bubble().getBoundingClientRect();
    return { top: r.top - y, centerDx: r.left + r.width / 2 - x, width: r.width, text: bubble().textContent.trim() };
  };

  // 1) Hors simulation : aucune bulle, quoi qu'il arrive.
  move(30, 30);
  await pir.updateComplete;
  const idle = { bubble: !!bubble(), motion: pir.motion };

  // 2) En simulation : survol en mouvement → bulle sous le curseur.
  pir.simulating = true;
  await pir.updateComplete;
  move(30, 30);
  move(40, 45); // deux positions : un vrai mouvement (le 1er move sert de repère)
  await pir.updateComplete;
  const hover = at(40, 45);
  const motionOn = pir.motion;

  // 3) La bulle SUIT le curseur (autre point, loin du premier).
  move(70, 20);
  await pir.updateComplete;
  const moved = at(70, 20);

  // 4) Ctrl+clic : mouvement permanent, autre texte, même placement.
  wrap().dispatchEvent(new PointerEvent('pointerdown', { clientX: 70, clientY: 20, ctrlKey: true, bubbles: true }));
  await pir.updateComplete;
  const stickyAt = at(70, 20);
  const stickyMotion = pir.motion;

  // 5) Souris partie mais mouvement permanent : bulle toujours là, CENTRÉE sur
  //    le composant et en dessous (plus de bulle plaquée au-dessus du dessin).
  wrap().dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
  await pir.updateComplete;
  const host = pir.getBoundingClientRect();
  const b = bubble().getBoundingClientRect();
  const away = {
    below: b.top - host.bottom,
    centerDx: b.left + b.width / 2 - (host.left + host.width / 2),
    motion: pir.motion,
  };

  // 6) Ctrl+clic à nouveau : plus de mouvement permanent, plus de bulle.
  wrap().dispatchEvent(new PointerEvent('pointerdown', { clientX: 70, clientY: 20, ctrlKey: true, bubbles: true }));
  await pir.updateComplete;
  const off = { bubble: !!bubble(), motion: pir.motion };

  const res = { idle, hover, motionOn, moved, stickyAt, stickyMotion, away, off };
  const pre = document.createElement('pre'); pre.id = 'm'; pre.textContent = JSON.stringify(res); document.body.appendChild(pre);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text' }, absWorkingDir: join(ROOT, 'scripts'), logLevel: 'silent',
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
/** Tolérance d'un pixel : arrondis de rendu (translate en %). */
const near = (v, target) => Math.abs(v - target) <= 1;

if (!chrome) {
  console.log('(Chrome introuvable : banc PIR sauté)');
} else {
  const url = 'file:///' + join(CACHE, 'p.html').replace(/\\/g, '/');
  const dom = execFileSync(chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="m"[^>]*>([^<]+)<\/pre>/);
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
  check('mesures relevées dans le rendu', !!r);
  if (r) {
    check('hors simulation : aucune bulle et OUT à 0', !r.idle.bubble && r.idle.motion === false);
    check('survol : la bulle est 5 px SOUS le pointeur', near(r.hover.top, 5), `top=${r.hover.top}`);
    check('survol : la bulle est CENTRÉE sur le pointeur', near(r.hover.centerDx, 0), `Δcentre=${r.hover.centerDx}`);
    check('survol : bulle non vide (texte d’aide)', r.hover.width > 20 && /souris/i.test(r.hover.text), r.hover.text);
    check('survol en mouvement : OUT à 1', r.motionOn === true);
    check('la bulle SUIT le curseur (5 px dessous, centrée)',
      near(r.moved.top, 5) && near(r.moved.centerDx, 0), `top=${r.moved.top} Δcentre=${r.moved.centerDx}`);
    check('Ctrl+clic : mouvement permanent annoncé', /permanent/i.test(r.stickyAt.text) && r.stickyMotion === true, r.stickyAt.text);
    check('Ctrl+clic : même placement (5 px sous le curseur, centré)',
      near(r.stickyAt.top, 5) && near(r.stickyAt.centerDx, 0), `top=${r.stickyAt.top} Δcentre=${r.stickyAt.centerDx}`);
    check('souris partie + permanent : bulle 5 px SOUS le composant', near(r.away.below, 5), `écart=${r.away.below}`);
    check('souris partie + permanent : bulle centrée sur le composant', near(r.away.centerDx, 0), `Δcentre=${r.away.centerDx}`);
    check('souris partie + permanent : OUT reste à 1', r.away.motion === true);
    check('Ctrl+clic à nouveau : plus de bulle, OUT à 0', !r.off.bubble && r.off.motion === false);
  }
}

// Garde-fou statique : le placement vient bien du CSS de la bulle (et non d'un
// style en ligne qui reviendrait à l'ancien coin haut-droit).
const src = readFileSync(join(ROOT, 'src/webview/composants/pir-motion-sensor-element.mts'), 'utf8');
check('pir : bulle centrée et 5 px dessous (translate(-50%, 5px))', /transform:\s*translate\(-50%,\s*5px\)/.test(src));
check('pir : plus de placement au-dessus-à-droite', !/translate\(8px,\s*-100%\)/.test(src) && !/translate\(-50%,-100%\)/.test(src));

// Fiches d'aide FR + EN : elles décrivaient encore une propriété d'inspecteur
// disparue (le mouvement se fait à la souris depuis les contrôles de simulation).
for (const [lang, path] of [['FR', 'docs/fr/composants/pir.md'], ['EN', 'docs/en/composants/pir.md']]) {
  const doc = readFileSync(join(ROOT, path), 'utf8');
  check(`aide ${lang} : la bulle est décrite sous le pointeur (5 px)`, /5 px/.test(doc));
  check(`aide ${lang} : Ctrl+clic (mouvement permanent) documenté`, /Ctrl\+clic|Ctrl\+click/.test(doc));
  check(`aide ${lang} : plus de propriété « state » à régler dans l'inspecteur`, !/`state`/.test(doc));
}

console.log(failures ? `PIR : ${failures} échec(s).` : 'PIR : tous les contrôles passent — bulles 5 px sous la souris et centrées.');
process.exit(failures ? 1 : 0);
