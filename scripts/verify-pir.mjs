// Bulles d'aide du capteur PIR (kablix-pir-motion-sensor) en Chrome headless.
//
// Demande de Frank (v2026.7.200) : la bulle doit apparaître JUSTE EN DESSOUS du
// pointeur et CENTRÉE (gauche/droite) dessus. Avant, elle était collée
// au-dessus-à-droite (`translate(8px, -100%)`), donc elle masquait ce que la
// souris survolait et partait en biais.
//
// v2026.7.215 : distance portée à 25 px, et cette distance comme la TAILLE de la
// bulle sont mesurées à l'ÉCRAN — donc constantes quel que soit le zoom de
// l'atelier (le monde est mis à l'échelle, la bulle se contre-met à l'échelle).
// La bulle reste aussi affichée tant que la souris survole, même immobile.
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
  // Le composant vit dans le « monde » de l'éditeur : un conteneur mis à
  // l'échelle par le zoom, qui publie ce facteur dans --kablix-zoom.
  const monde = document.createElement('div');
  monde.style.transformOrigin = '0 0';
  const setZoom = (z) => {
    monde.style.transform = 'scale(' + z + ')';
    monde.style.setProperty('--kablix-zoom', String(z));
  };
  setZoom(1);
  const pir = document.createElement('kablix-pir-motion-sensor');
  document.body.style.margin = '0';
  monde.appendChild(pir);
  document.body.appendChild(monde);
  await pir.updateComplete;
  await wait(30);

  const wrap = () => pir.renderRoot.querySelector('.wrap');
  const bubble = () => pir.renderRoot.querySelector('.bubble');
  const move = (x, y) => wrap().dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  /** Position de la bulle RELATIVE au pointeur : écart du bord haut et du centre. */
  const at = (x, y) => {
    const r = bubble().getBoundingClientRect();
    return { top: r.top - y, centerDx: r.left + r.width / 2 - x, width: r.width, height: r.height,
      text: bubble().textContent.trim() };
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

  // 7) Survol SANS mouvement : la bulle d'aide tient (elle n'est pas le témoin de
  //    la sortie — OUT, lui, retombe dès que la souris s'arrête).
  wrap().dispatchEvent(new PointerEvent('pointerenter', { clientX: 30, clientY: 30, bubbles: true }));
  move(30, 30);
  await pir.updateComplete;
  await wait(600); // au-delà du délai de grâce (400 ms) : OUT est retombé
  await pir.updateComplete;
  const immobile = { bubble: !!bubble(), motion: pir.motion, text: bubble() ? bubble().textContent.trim() : '' };

  // 8) ZOOM : le monde est agrandi ×2, la bulle doit garder sa taille et sa
  //    distance À L'ÉCRAN (elle se contre-met à l'échelle).
  move(30, 30);
  move(40, 45);
  await pir.updateComplete;
  const z1 = at(40, 45);
  setZoom(2);
  await wait(30);
  // Le pointeur est au même endroit du composant, mais deux fois plus loin à l'écran.
  move(60, 60);
  move(80, 90);
  await pir.updateComplete;
  const z2 = at(80, 90);

  const res = { idle, hover, motionOn, moved, stickyAt, stickyMotion, away, off, immobile, z1, z2 };
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
    check('survol : la bulle est 25 px SOUS le pointeur', near(r.hover.top, 25), `top=${r.hover.top}`);
    check('survol : la bulle est CENTRÉE sur le pointeur', near(r.hover.centerDx, 0), `Δcentre=${r.hover.centerDx}`);
    check('survol : bulle non vide (texte d’aide)', r.hover.width > 20 && /souris/i.test(r.hover.text), r.hover.text);
    check('survol en mouvement : OUT à 1', r.motionOn === true);
    check('la bulle SUIT le curseur (25 px dessous, centrée)',
      near(r.moved.top, 25) && near(r.moved.centerDx, 0), `top=${r.moved.top} Δcentre=${r.moved.centerDx}`);
    check('Ctrl+clic : mouvement permanent annoncé', /permanent/i.test(r.stickyAt.text) && r.stickyMotion === true, r.stickyAt.text);
    check('Ctrl+clic : même placement (25 px sous le curseur, centré)',
      near(r.stickyAt.top, 25) && near(r.stickyAt.centerDx, 0), `top=${r.stickyAt.top} Δcentre=${r.stickyAt.centerDx}`);
    check('souris partie + permanent : bulle 25 px SOUS le composant', near(r.away.below, 25), `écart=${r.away.below}`);
    check('souris partie + permanent : bulle centrée sur le composant', near(r.away.centerDx, 0), `Δcentre=${r.away.centerDx}`);
    check('souris partie + permanent : OUT reste à 1', r.away.motion === true);
    check('Ctrl+clic à nouveau : plus de bulle, OUT à 0', !r.off.bubble && r.off.motion === false);
    // Bulle d'aide PERMANENTE au survol (item v2026.7.200) : elle ne suit pas OUT.
    check('survol immobile : la bulle d’aide RESTE affichée', r.immobile.bubble === true, r.immobile.text);
    check('survol immobile : OUT est bien retombé (la bulle n’est pas le témoin de la sortie)',
      r.immobile.motion === false, `motion=${r.immobile.motion}`);
    // Zoom ×2 : la bulle se contre-mesure, taille et distance identiques à l'écran.
    check('zoom ×2 : la bulle reste 25 px sous le pointeur',
      near(r.z2.top, 25), `top=${r.z2.top} (zoom 1 : ${r.z1.top})`);
    check('zoom ×2 : la bulle reste CENTRÉE sur le pointeur', near(r.z2.centerDx, 0), `Δcentre=${r.z2.centerDx}`);
    check('zoom ×2 : la bulle garde sa TAILLE écran (100 %)',
      near(r.z2.width, r.z1.width) && near(r.z2.height, r.z1.height),
      `${r.z2.width}×${r.z2.height} contre ${r.z1.width}×${r.z1.height} à 100 %`);
  }
}

// Garde-fou statique : le placement vient bien du CSS de la bulle (et non d'un
// style en ligne qui reviendrait à l'ancien coin haut-droit).
const src = readFileSync(join(ROOT, 'src/webview/composants/pir-motion-sensor-element.mts'), 'utf8');
check('pir : bulle centrée et 25 px dessous, contre-mise à l’échelle du zoom',
  /transform:\s*scale\(calc\(1 \/ var\(--kablix-zoom, 1\)\)\) translate\(-50%,\s*25px\)/.test(src));
check('pir : plus de placement au-dessus-à-droite', !/translate\(8px,\s*-100%\)/.test(src) && !/translate\(-50%,-100%\)/.test(src));
check('pir : la bulle suit le SURVOL (over), pas l’état de la sortie', /this\.over && this\.simulating/.test(src));

// L'éditeur doit publier le facteur de zoom, sinon la contre-échelle vaut 1.
const ed = readFileSync(join(ROOT, 'src/webview/diagram/editor.mts'), 'utf8');
check('éditeur : le zoom est publié dans --kablix-zoom',
  /setProperty\('--kablix-zoom', String\(this\.zoom\)\)/.test(ed));

// Fiches d'aide FR + EN : elles décrivaient encore une propriété d'inspecteur
// disparue (le mouvement se fait à la souris depuis les contrôles de simulation).
for (const [lang, path] of [['FR', 'docs/fr/composants/pir.md'], ['EN', 'docs/en/composants/pir.md']]) {
  const doc = readFileSync(join(ROOT, path), 'utf8');
  check(`aide ${lang} : la bulle est décrite sous le pointeur (25 px)`, /25 px/.test(doc));
  check(`aide ${lang} : Ctrl+clic (mouvement permanent) documenté`, /Ctrl\+clic|Ctrl\+click/.test(doc));
  check(`aide ${lang} : plus de propriété « state » à régler dans l'inspecteur`, !/`state`/.test(doc));
}

console.log(failures ? `PIR : ${failures} échec(s).` : 'PIR : tous les contrôles passent — bulles 25 px sous la souris, centrées et insensibles au zoom.');
process.exit(failures ? 1 : 0);
