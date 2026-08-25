// Banc : sortie à COLLECTEUR OUVERT d'un composant de bibliothèque (.kompix),
// et pièce mobile du dessin pilotée par le contrôle de simulation.
//
// Le cas concret est la barrière optique infrarouge (`ir-barrier`) :
//  - sa sortie ne sait que tirer à la masse, il lui faut donc un rappel au plus
//    (résistance câblée, ou rappel interne de la carte) — sans lui la sortie ne
//    monte jamais et le montage ne marche pas ;
//  - ses DEUX boîtiers doivent être alimentés : l'émetteur sans courant
//    n'éclaire rien, et le récepteur croirait à un obstacle permanent ;
//  - cocher « Obstacle » fait MONTER la barre du dessin entre les deux boîtiers,
//    sans une ligne de code embarqué (déclaration `control.move` du manifeste).
//
// Deux parties : le câblage (node, sans navigateur) puis le dessin qui bouge
// (Chrome headless, vrai composant, vraie mise en page).
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lireKompix } from './_lire-kompix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(ROOT, 'node_modules', '.cache-opendrain');
mkdirSync(CACHE, { recursive: true });

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const part = await lireKompix('ir-barrier');

// --- 1. Le manifeste porte bien ce qu'il faut ---------------------------------
console.log('Manifeste du paquet :');
check('sortie déclarée à collecteur ouvert', part.openDrain?.out === 'Out', JSON.stringify(part.openDrain));
check('les DEUX boîtiers sont à alimenter', part.openDrain?.supplies?.length === 2,
  JSON.stringify(part.openDrain?.supplies));
check('contrôle de simulation : un interrupteur « Obstacle »',
  part.control?.type === 'switch', JSON.stringify(part.control));
check('le contrôle déplace la pièce « obstacle » vers le HAUT',
  part.control?.move?.group === 'obstacle' && part.control.move.dy < 0, JSON.stringify(part.control?.move));
check('le dessin contient bien cette pièce', part.svg.includes('id="obstacle"'));

// --- 2. Le câblage lu par le moteur (node) -----------------------------------
console.log('Câblage résolu par le moteur :');
{
  const out = join(CACHE, 'diagram.mjs');
  await esbuild.build({
    stdin: {
      contents: "export * as model from './src/webview/diagram/model.mts';\n"
        + "export * as catalog from './src/webview/diagram/catalog.mjs';\n",
      resolveDir: ROOT,
      loader: 'ts',
    },
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  const { model, catalog } = await import(pathToFileURL(out).href);
  catalog.registerCustomPart(part);

  let seq = 0;
  const w = (a, ap, b, bp) => ({ id: `w${++seq}`, a: { partId: a, pin: ap }, b: { partId: b, pin: bp } });
  /** Montage de base : carte Uno, barrière, et les fils demandés en plus. */
  const montage = (extra = [], parts = []) => {
    seq = 0;
    return {
      parts: [
        { id: 'U1', type: 'uno', x: 40, y: 60 },
        { id: 'Capt1', type: 'ir-barrier', x: 600, y: 80 },
        ...parts,
      ],
      wires: [
        w('Capt1', 'Vcc.e', 'U1', '5V'),
        w('Capt1', 'GND.e', 'U1', 'GND.1'),
        w('Capt1', 'Vcc.r', 'U1', '5V'),
        w('Capt1', 'GND.r3', 'U1', 'GND.2'),
        w('Capt1', 'Out', 'U1', '2'),
        ...extra.map((e) => w(...e)),
      ],
    };
  };
  const lire = (d) => model.customOpenDrainBindings(d).find((b) => b.partId === 'Capt1');

  // a) Le montage complet : rappel externe de 10 kΩ vers le 5 V.
  const R = { id: 'R1', type: 'resistor', x: 460, y: 60, attrs: { value: '10000' } };
  let b = lire(montage([['R1', '1', 'Capt1', 'Out'], ['R1', '2', 'U1', '5V']], [R]));
  check('sortie vue sur la broche 2', b?.mcuPin === '2', JSON.stringify(b));
  check('alimenté : les deux boîtiers ont V+ et GND', b?.powered === true, JSON.stringify(b));
  check('rappel externe de 10 kΩ trouvé', b?.pullupOhms === 10000, JSON.stringify(b));

  // b) Sans résistance : aucun chemin vers le rail haut. C'est LE défaut
  //    classique — la sortie reste à 0, le capteur paraît toujours détecter.
  b = lire(montage());
  check('sans résistance : aucun rappel au plus', b?.pullupOhms === null, JSON.stringify(b));
  check('sans résistance : le composant reste alimenté', b?.powered === true, JSON.stringify(b));

  // c) Sortie soudée AU RAIL : 0 Ω, c'est un court-circuit dès qu'elle tire.
  b = lire(montage([['Capt1', 'Out', 'U1', '5V']]));
  check('sortie reliée au 5 V sans résistance : 0 Ω (court-circuit)',
    b?.pullupOhms === 0, JSON.stringify(b));

  // d) Émetteur débranché : le récepteur, lui, est parfaitement câblé — et
  //    pourtant plus rien ne marche. C'est pour ça que `supplies` en liste DEUX.
  const sansEmetteur = montage([['R1', '1', 'Capt1', 'Out'], ['R1', '2', 'U1', '5V']], [R]);
  sansEmetteur.wires = sansEmetteur.wires.filter((x) =>
    x.a.pin !== 'Vcc.e' && x.a.pin !== 'GND.e');
  b = lire(sansEmetteur);
  check('émetteur non alimenté : le composant est déclaré non alimenté',
    b?.powered === false, JSON.stringify(b));

  // e) Récepteur débranché : même sanction, dans l'autre sens.
  const sansRecepteur = montage([['R1', '1', 'Capt1', 'Out'], ['R1', '2', 'U1', '5V']], [R]);
  sansRecepteur.wires = sansRecepteur.wires.filter((x) =>
    x.a.pin !== 'Vcc.r' && x.a.pin !== 'GND.r3');
  b = lire(sansRecepteur);
  check('récepteur non alimenté : idem', b?.powered === false, JSON.stringify(b));

  // f) Un composant ordinaire ne doit RIEN déclencher de tout ça.
  check('un montage sans composant à collecteur ouvert ne rend aucune liaison',
    model.customOpenDrainBindings({
      parts: [{ id: 'U1', type: 'uno', x: 0, y: 0 }], wires: [],
    }).length === 0);
}

// --- 3. La pièce mobile du dessin (Chrome headless) ---------------------------
console.log('Obstacle qui monte (Chrome headless) :');
{
  const entry = `
import '../../src/webview/composants/custom-part.mjs';
import { registerCustomPart } from '../../src/webview/diagram/catalog.mjs';
// Le composant attend la DÉFINITION du catalogue (def.custom), pas le
// CustomPartData brut : c'est registerCustomPart qui fait la conversion, et
// c'est exactement ce que fait la webview à l'ouverture d'un projet.
const DEF = registerCustomPart(${JSON.stringify({ ...part, behaviorScript: undefined })});
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
/** Rectangle écran de la pièce mobile, ou null. */
const boite = (el) => {
  const cible = el.shadowRoot.querySelector('#obstacle');
  return cible ? cible.getBoundingClientRect() : null;
};
async function run() {
  const el = document.createElement('kablix-custom-part');
  document.body.appendChild(el);
  el.definition = DEF;
  await el.updateComplete;
  // Pas de requestAnimationFrame ici : sous --dump-dom il n'est jamais servi et
  // la page resterait muette. Un tour de boucle d'événements suffit.
  await new Promise((r) => setTimeout(r, 50));

  const repos = boite(el);
  ok('la pièce « obstacle » est dans le dessin', !!repos);
  if (!repos) return rendre();

  // Hors simulation, cocher n'a aucun effet : le schéma au repos est celui de
  // la planche, quoi qu'on ait laissé traîner dans l'inspecteur.
  el.switchOn = true;
  await el.updateComplete;
  ok('hors simulation, l’obstacle ne bouge pas',
    Math.abs(boite(el).top - repos.top) < 0.5,
    boite(el).top.toFixed(1) + ' / ' + repos.top.toFixed(1));

  el.toggleAttribute('simulating', true);
  await el.updateComplete;
  const leve = boite(el);
  // L'échelle du dessin : 140 px de viewBox rendus sur la hauteur du SVG.
  const svg = el.shadowRoot.querySelector('svg').getBoundingClientRect();
  const echelle = svg.height / 140;
  const monte = (repos.top - leve.top) / echelle;
  ok('obstacle coché en simulation : la pièce MONTE de 40 px de dessin',
    Math.abs(monte - 40) < 1.5, monte.toFixed(2) + ' px');
  ok('elle ne se déforme pas', Math.abs(leve.height - repos.height) < 0.5,
    leve.height.toFixed(1) + ' / ' + repos.height.toFixed(1));
  ok('elle ne dérive pas latéralement', Math.abs(leve.left - repos.left) < 0.5,
    leve.left.toFixed(1) + ' / ' + repos.left.toFixed(1));
  // Levée, la barre doit couvrir l'axe du faisceau (les deux lentilles, à
  // hauteur y ≈ 33 du dessin) : sans ça la lumière passerait toujours.
  const hautDessin = svg.top;
  const y1 = (leve.top - hautDessin) / echelle;
  const y2 = (leve.bottom - hautDessin) / echelle;
  ok('levée, elle coupe bien l’axe du faisceau (y ≈ 33)', y1 < 33 && y2 > 33,
    'barre de y=' + y1.toFixed(1) + ' à y=' + y2.toFixed(1));

  el.switchOn = false;
  await el.updateComplete;
  ok('décochée, l’obstacle redescend à sa place',
    Math.abs(boite(el).top - repos.top) < 0.5,
    boite(el).top.toFixed(1) + ' / ' + repos.top.toFixed(1));

  el.switchOn = true;
  await el.updateComplete;
  el.toggleAttribute('simulating', false);
  await el.updateComplete;
  ok('fin de simulation : la pièce revient, même case cochée',
    Math.abs(boite(el).top - repos.top) < 0.5,
    boite(el).top.toFixed(1) + ' / ' + repos.top.toFixed(1));
  rendre();
}
function rendre() {
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify(checks);
  document.body.appendChild(out);
}
run().catch((e) => {
  checks.push({ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) });
  rendre();
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
  const chrome = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
  if (!chrome) {
    console.log('  – Chrome introuvable, dessin non vérifié');
  } else {
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--virtual-time-budget=20000', '--dump-dom',
      `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
    if (!m) check('mesures relevées', false, 'aucune mesure dans le DOM');
    else for (const r of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))) {
      check(r.name, r.ok, r.detail);
    }
  }
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
