// Vérifie le moteur à courant continu (kablix-moteur-dc, kind 'motor') :
//   1. le modèle (motorStates) : la vitesse suit la TENSION, le moteur ne
//      démarre pas sous 30 % de sa tension nominale ni si la source ne fournit
//      pas son courant, il GRILLE au-delà de 1,5 fois sa tension nominale, et
//      ses deux fils sont interchangeables (il n'est pas polarisé) ;
//   2. la ROUE LIBRE : commandé par un transistor, un moteur sans diode détruit
//      ce transistor ; une diode à l'envers ne protège rien ; un MOSFET dont le
//      schéma interne porte sa diode de structure (nmos-d) est dispensé ;
//   3. catalogue, nom de repère et fiches d'aide FR/EN ;
//   4. l'AFFICHAGE de la rotation, comme pour le ventilateur : un pignon à
//      6000 tr/min n'est qu'une bouillie, la rotation est donc ralentie à une
//      fréquence de passage de dent LISIBLE (1 à 3,5 dents par seconde) qui
//      croît avec la tension — l'accélération doit se voir, pas le vrai régime.
import esbuild from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const tmp = mkdtempSync(join(tmpdir(), 'kx-motor-'));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const near = (a, b, eps = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= eps;

async function bundle(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    loader: { '.svg': 'text', '.webp': 'dataurl' },
  });
  return import(pathToFileURL(out).href);
}

const model = await bundle('src/webview/diagram/model.mts', 'model.mjs');
const catalog = await bundle('src/webview/diagram/catalog.mts', 'catalog.mjs');
const refnames = await bundle('src/webview/diagram/refnames.mts', 'refnames.mjs');

// --- Schémas de test ---------------------------------------------------------
// Moteur par défaut : 5 V / 0,2 A → 25 Ω vus par la source.
const M = (attrs = {}) => ({ id: 'm1', type: 'moteur-dc', x: 0, y: 0, attrs: { voltage: '5', current: '0.2', ...attrs } });
const ALIM = (v = '5', i = '1') => ({ id: 'psu1', type: 'alim', x: 0, y: 0, attrs: { voltage: v, maxcurrent: i } });
const W = (id, a, b) => ({ id, a, b });
const P = (partId, pin) => ({ partId, pin });

/** Moteur branché en direct sur l'alim de laboratoire (aucun transistor). */
const direct = (volts, swap = false) => ({
  parts: [ALIM(String(volts)), M()],
  wires: [
    W('w1', P('psu1', 'V+'), P('m1', swap ? '2' : '1')),
    W('w2', P('m1', swap ? '1' : '2'), P('psu1', 'GND')),
  ],
});

const state = (diagram, duty) => model.motorStates(diagram, 5, duty)[0];

// --- 1. Modèle : la vitesse suit la tension ----------------------------------
console.log('Modèle (motorStates) :');
{
  const volts = [5, 4, 3, 2, 1.4];
  const speeds = volts.map((v) => state(direct(v)).speed);
  check('5 V sur un moteur 5 V : plein régime', near(speeds[0], 1),
    volts.map((v, i) => `${v}V→${(speeds[i] * 100).toFixed(0)}%`).join(' '));
  check('baisser la tension baisse la vitesse',
    speeds.every((s, i) => i === 0 || s <= speeds[i - 1]));
  check('1,4 V (28 % de 5 V) : le moteur ne démarre pas', speeds[4] === 0);
  const st5 = state(direct(5));
  check('courant appelé = U/R (5 V / 25 Ω = 0,2 A)', near(st5.amps, 0.2), `${st5.amps.toFixed(3)} A`);
  check('branché en direct : aucun défaut, aucune diode réclamée', st5.fault === 'none');

  // Un moteur à courant continu n'est pas polarisé : inverser ses deux fils ne
  // change rien (il tournerait à l'envers, ce que le dessin ne montre pas).
  const inverse = state(direct(5, true));
  check('fils inversés : même vitesse (le moteur n’est pas polarisé)',
    near(inverse.speed, st5.speed) && inverse.fault === 'none', `${(inverse.speed * 100).toFixed(0)}%`);

  // Rapport cyclique PWM : agit comme la tension.
  const demi = state(direct(5), () => 0.5);
  check('PWM à 50 % : demi-régime', near(demi.speed, 0.5), `${(demi.speed * 100).toFixed(0)}%`);
  check('PWM à 0 % : arrêté mais alimenté', state(direct(5), () => 0).speed === 0);

  // Surtension : au-delà de 1,5 fois la tension nominale, les bobinages lâchent.
  const limite = state(direct(7.4));
  const grille = state(direct(8));
  check('7,4 V sur un moteur 5 V : encore vivant (1,48 ×)', limite.fault === 'none' && limite.speed > 1,
    `${limite.speed.toFixed(2)} × régime`);
  check('8 V sur un moteur 5 V : surtension, il grille',
    grille.fault === 'overvolt' && grille.speed === 0, `${grille.volts.toFixed(1)} V`);

  // Source trop faible : une broche de carte ne donne que 40 mA.
  const surBroche = {
    parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, M()],
    wires: [W('w1', P('uno', '9'), P('m1', '1')), W('w2', P('m1', '2'), P('uno', 'GND.1'))],
  };
  const faible = state(surBroche);
  check('sur une broche de carte (40 mA) : le moteur ne démarre pas',
    faible.fault === 'starved' && faible.speed === 0, `${(faible.amps * 1000).toFixed(0)} mA demandés`);
  check('motorMcuPin : la broche de commande est retrouvée (PWM)',
    model.motorMcuPin(surBroche, 'm1', 5) === '9', String(model.motorMcuPin(surBroche, 'm1', 5)));

  // Circuit ouvert : un seul fil branché.
  const ouvert = { parts: [ALIM(), M()], wires: [W('w1', P('psu1', 'V+'), P('m1', '1'))] };
  check('un seul fil branché : moteur non alimenté', state(ouvert).powered === false);
}

// --- 2. Roue libre : le moteur est une bobine --------------------------------
console.log('Roue libre (diode obligatoire derrière un transistor) :');
{
  // Alim → moteur → transistor → masse. Le transistor est SATURÉ : son pont
  // collecteur→émetteur est posé comme le fait la simulation avant chaque frame.
  // Le transistor de la palette porte TOUJOURS `named` : ses pattes s'appellent
  // E/B/C (ou G/D/S sur un MOSFET), pas 1/2/3.
  const monte = ({ diode = 'none', schema = '', symbol = 'npn', hi = 'C', lo = 'E' } = {}) => {
    const parts = [ALIM(), M(), { id: 'q1', type: 'transistor', x: 0, y: 0, attrs: { symbol, schema } }];
    const wires = [
      W('w1', P('psu1', 'V+'), P('m1', '1')),
      W('w2', P('m1', '2'), P('q1', hi)),
      W('w3', P('q1', lo), P('psu1', 'GND')),
    ];
    if (diode !== 'none') {
      parts.push({ id: 'd1', type: 'diode', x: 0, y: 0, attrs: { vf: '0.6' } });
      // Correcte : cathode au + (elle ne conduit qu'à la coupure). À l'envers :
      // anode au +, elle court-circuite l'alimentation dès la mise sous tension.
      const [k, a] = diode === 'ok' ? ['1', '2'] : ['2', '1'];
      wires.push(W('w4', P('d1', 'K'), P('m1', k)), W('w5', P('d1', 'A'), P('m1', a)));
    }
    const diagram = { parts, wires };
    model.setActiveBridges([{ partId: 'q1', a: hi, b: lo, drop: 0.2, limitAmps: 2, oneWay: true }]);
    const st = model.motorStates(diagram, 5)[0];
    model.setActiveBridges([]);
    return st;
  };

  const sansDiode = monte();
  check('aucune diode : défaut « no-diode »', sansDiode.fault === 'no-diode', sansDiode.fault);
  check('aucune diode : c’est le TRANSISTOR qui est détruit',
    sansDiode.blownTransistorId === 'q1' && sansDiode.faultPartId === 'q1',
    `${sansDiode.blownTransistorId} / ${sansDiode.faultPartId}`);
  check('aucune diode : le moteur ne tourne pas', sansDiode.speed === 0);

  const envers = monte({ diode: 'rev' });
  check('diode à l’envers : défaut « reversed-diode » sur la diode',
    envers.fault === 'reversed-diode' && envers.faultPartId === 'd1',
    `${envers.fault} / ${envers.faultPartId}`);
  check('diode à l’envers : le transistor n’est pas mis en cause',
    envers.blownTransistorId === undefined);

  const bonne = monte({ diode: 'ok' });
  check('diode de roue libre correcte : plus de défaut, le moteur tourne',
    bonne.fault === 'none' && bonne.speed > 0.9, `${(bonne.speed * 100).toFixed(0)}%`);
  check('transistor saturé : sa chute (0,2 V) est retirée',
    near(bonne.volts, 4.8, 0.05), `${bonne.volts.toFixed(2)} V`);

  // MOSFET : le nmos « nu » réclame sa diode, celui dont le schéma interne la
  // porte (nmos-d : BS170, IRF530) en est dispensé.
  const mosNu = monte({ symbol: 'nmos', schema: 'nmos', hi: 'D', lo: 'S' });
  const mosDiode = monte({ symbol: 'nmos', schema: 'nmos-d', hi: 'D', lo: 'S' });
  check('MOSFET sans diode de structure : la roue libre reste exigée',
    mosNu.fault === 'no-diode', mosNu.fault);
  check('MOSFET à diode intégrée (nmos-d) : dispensé, le moteur tourne',
    mosDiode.fault === 'none' && mosDiode.speed > 0.9, `${mosDiode.fault} ${(mosDiode.speed * 100).toFixed(0)}%`);
}

// --- 3. Catalogue, repère et aide --------------------------------------------
console.log('Catalogue et aide :');
{
  const def = catalog.partDef('moteur-dc');
  check('catalogue : moteur-dc = kablix-moteur-dc, kind motor',
    def.tag === 'kablix-moteur-dc' && def.kind === 'motor', `${def.tag} / ${def.kind}`);
  check('catalogue : rangé dans les actionneurs (avec le ventilateur)',
    catalog.partCategory(def) === catalog.partCategory(catalog.partDef('ventilo')),
    catalog.partCategory(def));
  check('catalogue : propriétés tension nominale et courant à vide',
    def.props?.some((p) => p.attr === 'voltage') && def.props?.some((p) => p.attr === 'current'));
  check('catalogue : 5 V / 0,2 A par défaut',
    def.attrs?.voltage === '5' && def.attrs?.current === '0.2', JSON.stringify(def.attrs));
  // Repère : un moteur est un actionneur, comme le ventilateur (Act1, Act2…).
  check('repère : famille « actionneur », comme le ventilateur',
    refnames.refFamily('moteur-dc') === 'actuator'
    && refnames.refPrefix('moteur-dc') === refnames.refPrefix('ventilo'),
    `${refnames.refFamily('moteur-dc')} / ${refnames.refPrefix('moteur-dc')}`);

  for (const lang of ['fr', 'en']) {
    check(`aide : fiche docs/${lang}/composants/moteur-dc.md présente`,
      existsSync(join(ROOT, 'docs', lang, 'composants', 'moteur-dc.md')));
  }
  check('aide : illustration docs/img/composants/moteur-dc.webp présente',
    existsSync(join(ROOT, 'docs', 'img', 'composants', 'moteur-dc.webp')));
}

// --- 4. Rotation affichée (Chrome headless) ----------------------------------
console.log('Rotation affichée (Chrome headless) :');
{
  const CACHE = join(ROOT, 'node_modules', '.cache-motor-spin');
  const entry = `
import '../../src/webview/composants/moteur-dc-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const SCREEN_HZ = 60;

/** Centre À L'ÉCRAN du plus petit cercle contenant une pièce (point matériel du
 *  dessin : il suit la pièce, où que soit l'origine de rotation). */
function centreEcran(node) {
  const formes = node.matches('path,circle,ellipse,rect,polygon,polyline')
    ? [node] : [...node.querySelectorAll('path,circle,ellipse,rect,polygon,polyline')];
  const pts = [];
  for (const n of formes) {
    const len = n.getTotalLength ? n.getTotalLength() : 0;
    const m = n.getScreenCTM();
    if (!(len > 0) || !m) continue;
    for (let i = 0; i < 1200; i++) {
      const p = n.getPointAtLength((len * i) / 1200);
      pts.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
    }
  }
  let ax = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  let ay = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  for (let i = 0; i < 2000; i++) {
    let best = pts[0], far = -1;
    for (const p of pts) { const d = (p.x-ax)**2 + (p.y-ay)**2; if (d > far) { far = d; best = p; } }
    const k = 1 / (i + 2);
    ax += (best.x - ax) * k; ay += (best.y - ay) * k;
  }
  return { x: ax, y: ay };
}

/** Amplitude du déplacement de ce centre quand la pièce tourne : 0 = l'origine
 *  de rotation EST l'axe. La forme courte « animation » effacerait durée et
 *  état de lecture posés en ligne : on n'agit que sur animation-name. */
function mesureBalourd(wrap, piece, angles) {
  const duree = wrap.style.animationDuration;
  const etatLecture = wrap.style.animationPlayState;
  wrap.style.animationName = 'none';
  const centres = angles.map((deg) => {
    wrap.style.transform = 'rotate(' + deg + 'deg)';
    return centreEcran(piece);
  });
  wrap.style.transform = '';
  wrap.style.animationName = '';
  wrap.style.animationDuration = duree;
  wrap.style.animationPlayState = etatLecture;
  return {
    dx: Math.max(...centres.map((c) => c.x)) - Math.min(...centres.map((c) => c.x)),
    dy: Math.max(...centres.map((c) => c.y)) - Math.min(...centres.map((c) => c.y)),
  };
}

async function run() {
  const el = document.createElement('kablix-moteur-dc');
  document.body.appendChild(el);
  await el.updateComplete;
  await wait(120);
  const spin = () => el.shadowRoot.querySelector('.spin');
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
    };
  };

  ok('pignon trouvé et emballé dans un groupe neutre', !!spin());
  // Le groupe du pignon garde SON transform (mise à l'échelle Inkscape) : c'est
  // l'enveloppe qui tourne, sinon le pignon saute et change de taille.
  const shaft = el.shadowRoot.querySelector('#moteurDC-axe-rotatif');
  ok('le pignon reste dans l’enveloppe, son transform intact',
    shaft && shaft.parentNode === spin(), shaft ? shaft.getAttribute('transform') || '(aucun)' : 'absent');
  const dents = el.bladeCount;
  // La denture n'occupe que le dernier dixième du pignon : sondée trop près du
  // centre, elle passait inaperçue (3 dents relevées pour une vingtaine, la
  // rotation affichée était alors sept fois trop rapide — d'où le clignotement).
  ok('dents comptées dans le dessin (≥ 8)', dents >= 8, String(dents));

  // L'AXE : le pignon doit tourner sur lui-même, pas décrire un petit cercle.
  // L'échantillonnage du contour était si grossier (12 points pour dix dents)
  // qu'aucun bout de dent n'était touché : l'axe tombait à 0,2 unité du vrai
  // centre et le pignon se déplaçait de 1,7 px à l'écran en tournant.
  {
    // Le PIGNON seul (le jaune) : c'est SON centre qui est l'axe, pas celui de
    // l'arbre à méplat, dissymétrique par construction (remarque de Frank).
    const balourd = mesureBalourd(spin(), el.shadowRoot.querySelector('#path222-7'),
      [0, 9, 18, 45, 90, 180, 270]);
    ok('le pignon tourne sur lui-même : centre immobile (< 0,1 px)',
      balourd.dx < 0.1 && balourd.dy < 0.1,
      'balourd ' + balourd.dx.toFixed(3) + ' × ' + balourd.dy.toFixed(3) + ' px');
  }

  const arret = await etat(0);
  ok('à l’arrêt : animation en pause', arret.paused && arret.shown === 0);

  // Plage RÉELLEMENT parcourue : le moteur décroche sous 30 % de sa tension
  // nominale et grille au-dessus de 1,5 fois — soit 30 à 150 tr/s.
  const NOMINAL = 100;
  const vitesses = [30, 45, 60, 75, 90, 100];
  const etats = [];
  for (const v of vitesses) etats.push(await etat(v));
  const motif = (e) => e.shown * dents;
  const lisible = etats.map(motif);
  ok('la rotation accélère à CHAQUE cran de tension (aucun palier)',
    etats.every((e, i) => i === 0 || e.shown > etats[i - 1].shown + 1e-6),
    etats.map((e) => e.turns + 'tr/s→' + e.shown.toFixed(2) + 'tr/s').join(' '));
  ok('du décrochage au plein régime, la rotation est au moins triplée',
    lisible[lisible.length - 1] >= lisible[0] * 3,
    \`\${lisible[0].toFixed(1)} → \${lisible[lisible.length - 1].toFixed(1)} dents/s\`);
  // Une dent d'engrenage est plus fine et plus rapprochée qu'une pale : la
  // plage du pignon est la MOITIÉ de celle de l'hélice (1 à 3,5 dents/s).
  ok('jamais plus de 3,5 dents par seconde : au-delà la denture scintille',
    Math.max(...lisible) <= 3.51, Math.max(...lisible).toFixed(2) + ' dents/s');
  ok('jamais moins de 1 dent par seconde : en dessous ça paraît figé',
    Math.min(...lisible) >= 1, Math.min(...lisible).toFixed(1) + ' dents/s');
  ok('pas de flou à basse vitesse', etats[0].blur === 0, etats[0].blur.toFixed(2));
  ok('le flou croît sur la moitié haute de la plage',
    etats[etats.length - 1].blur > 0 &&
    etats.every((e, i) => i === 0 || e.blur >= etats[i - 1].blur - 1e-6),
    etats.map((e) => e.blur.toFixed(2)).join(' '));
  // Sécurité anti-stroboscope, surtension comprise (le moteur tourne jusqu'à
  // 1,5 fois son régime avant de griller).
  const degres = (e) => (e.shown * 360) / SCREEN_HZ;
  const limite = 360 / dents / 4;
  const pire = Math.max(...etats.map(degres), degres(await etat(NOMINAL * 1.5)));
  ok(\`aucune image ne dépasse \${limite.toFixed(1)}° (pire : \${pire.toFixed(1)}°)\`, pire <= limite + 0.01);

  // Moteur GRILLÉ : explosion, et plus aucune rotation quoi que dise la sim.
  el.burned = true;
  el.speed = 20;
  await el.updateComplete;
  await wait(30);
  ok('moteur grillé : explosion affichée',
    !!el.shadowRoot.querySelector('span[class^="boum-"]'));
  ok('moteur grillé : le pignon est figé', spin().style.animationPlayState === 'paused');
  el.burned = false;
  const retour = await etat(0);
  ok('retour à l’arrêt : figé et net', retour.paused && retour.blur === 0);

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
