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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  const volts = [5, 4, 3, 2, 1.4, 0.7];
  const speeds = volts.map((v) => state(direct(v)).speed);
  check('5 V sur un moteur 5 V : plein régime', near(speeds[0], 1),
    volts.map((v, i) => `${v}V→${(speeds[i] * 100).toFixed(0)}%`).join(' '));
  check('baisser la tension baisse la vitesse',
    speeds.every((s, i) => i === 0 || s <= speeds[i - 1]));
  // Seuil de décollage à 15 % de la tension nominale : 1,4 V (28 %) fait encore
  // tourner un moteur de 5 V, 0,7 V (14 %) ne le décolle plus.
  check('1,4 V (28 % de 5 V) : le moteur tourne encore', speeds[4] > 0,
    `${(speeds[4] * 100).toFixed(0)} %`);
  check('0,7 V (14 % de 5 V) : sous le seuil, le moteur reste calé',
    speeds[5] === 0);
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
 *  de rotation EST l'axe. L'animation (Web Animations API) l'emporte sur le
 *  style en ligne : on l'écarte le temps de poser les angles à la main. */
function mesureBalourd(wrap, piece, angles) {
  const anims = wrap.getAnimations();
  for (const a of anims) a.cancel();
  const centres = angles.map((deg) => {
    wrap.style.transform = 'rotate(' + deg + 'deg)';
    return centreEcran(piece);
  });
  wrap.style.transform = '';
  if (Number(wrap.dataset.spin) > 0) for (const a of anims) a.play();
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
    const wrap = spin();
    const anim = wrap.getAnimations()[0];
    return {
      turns,
      shown: Number(wrap.dataset.spin) || 0,   // tours/s réellement animés
      paused: !anim || anim.playState === 'paused',
      blur: parseFloat((wrap.style.filter.match(/blur\\(([\\d.]+)px\\)/) || [0, 0])[1]) || 0,
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

  // LE VA-ET-VIENT DE L'ARBRE. La phase d'une animation CSS vaut
  // (temps écoulé mod durée) / durée : réécrire la durée ne remet pas le
  // chronomètre à zéro, la pièce SAUTE donc d'un coup, et d'autant plus que la
  // simulation dure (mesuré : 3,4° après 2 s pour ±1 % de régime, ~86° après une
  // minute). Le régime étant recalculé à chaque image et fluctuant toujours un
  // peu, l'arbre à méplat — qui n'a aucune symétrie pour le masquer — avançait
  // et reculait sans arrêt. La vitesse passe donc par le TAUX DE LECTURE
  // (updatePlaybackRate), qui préserve la position.
  {
    await etat(60);
    const anim = spin().getAnimations()[0];
    ok('la rotation est portée par une animation, pas par une règle CSS', !!anim);
    const duree = anim && anim.effect.getTiming().duration;
    if (anim) anim.currentTime = 400;          // position quelconque dans le tour
    await etat(90);                            // le régime change, comme en simulation
    const apres = spin().getAnimations()[0];
    ok('un changement de régime ne recrée pas l’animation', apres === anim);
    ok('la durée de l’animation ne bouge JAMAIS (sinon la pièce saute)',
      apres && apres.effect.getTiming().duration === duree, String(duree));
    ok('la position de la pièce est conservée quand le régime change',
      apres && Math.abs(Number(apres.currentTime) - 400) < 20,
      apres ? String(Math.round(Number(apres.currentTime))) + ' ms' : 'aucune animation');
    ok('aucune durée d’animation posée en ligne', !spin().style.animationDuration,
      spin().style.animationDuration || '(aucune)');
  }

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
  ok('moteur grillé : le pignon est figé',
    spin().dataset.spin === '0' && spin().getAnimations()[0].playState === 'paused');
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
  const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
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

// --- 5. La charge EXISTE dans le circuit -----------------------------------
// Le moteur était absent du graphe résistif : vu du voltmètre le circuit était
// OUVERT (5 V à ses bornes, aucun courant), alors que motorStates le voit
// depuis toujours comme R = Unom/Inom. Corrigé au lot .53 : les deux lectures
// viennent maintenant du même modèle.
console.log('Mesure au voltmètre :');
{
  const p = (id, type, attrs) => ({ id, type, x: 0, y: 0, attrs: attrs ?? {} });
  const w = (id, a, b) => ({ id, a, b });
  const pn = (partId, pin) => ({ partId, pin });
  // Charge branchée en direct sur une alim de laboratoire, voltmètre à ses
  // bornes et ampèremètre dans le retour.
  const banc = (attrs) => ({
    parts: [
      p('psu', 'alim', { voltage: '5', maxcurrent: '2' }),
      p('dut', 'moteur-dc', attrs),
      p('mv', 'multimetre', { mode: 'voltage' }),
      p('ma', 'multimetre', { mode: 'current' }),
    ],
    wires: [
      w('w1', pn('psu', 'V+'), pn('dut', '1')),
      w('w2', pn('dut', '2'), pn('ma', '+')),
      w('w3', pn('ma', 'GND'), pn('psu', 'GND')),
      w('w4', pn('dut', '1'), pn('mv', '+')),
      w('w5', pn('dut', '2'), pn('mv', 'GND')),
    ],
  });
  // Le même montage avec une résistance à la place : c'est la référence, la
  // charge doit se mesurer EXACTEMENT comme elle (R = Unom/Inom).
  const bancR = (ohms) => {
    const d = banc({});
    d.parts = d.parts.map((x) => (x.id === 'dut'
      ? { ...x, type: 'resistor', attrs: { value: String(ohms) } } : x));
    d.wires = d.wires.map((x) => ({
      ...x,
      a: x.a.partId === 'dut' ? { ...x.a, pin: x.a.pin === '1' ? '1' : '2' } : x.a,
      b: x.b.partId === 'dut' ? { ...x.b, pin: x.b.pin === '1' ? '1' : '2' } : x.b,
    }));
    return d;
  };
  const lire = (d) => {
    const r = model.meterReadings(d, 5);
    return {
      volts: r.find((x) => x.partId === 'mv')?.value,
      amps: r.find((x) => x.partId === 'ma')?.value,
    };
  };
  const nominal = lire(banc({ voltage: '5', current: '0.2' }));
  const ref = lire(bancR(25));
  check('le voltmètre lit une tension à ses bornes, pas l’alim entière',
    nominal.volts !== null && nominal.volts > 0 && nominal.volts < 5,
    `${nominal.volts?.toFixed(3)} V`);
  check('l’ampèremètre en série mesure enfin un courant',
    nominal.amps !== null && nominal.amps > 0, `${(nominal.amps * 1000).toFixed(1)} mA`);
  check('mesurée comme la résistance équivalente R = Unom/Inom (25 Ω)',
    near(nominal.volts, ref.volts, 1e-3) && near(nominal.amps, ref.amps, 1e-6),
    `${nominal.volts?.toFixed(3)} V / ${ref.volts?.toFixed(3)} V`);
  // Doubler le courant nominal, c'est diviser la résistance par deux : plus de
  // courant appelé et moins de tension à ses bornes (l'alim n'est pas parfaite).
  const gourmande = lire(banc({ voltage: '5', current: '0.4' }));
  check('deux fois plus gourmande : deux fois moins de résistance, donc plus de courant',
    gourmande.amps > nominal.amps && gourmande.volts < nominal.volts,
    `${(gourmande.amps * 1000).toFixed(1)} mA vs ${(nominal.amps * 1000).toFixed(1)} mA`);
  // Une charge débranchée ne mesure rien : le circuit est vraiment ouvert.
  const enLair = banc({ voltage: '5', current: '0.2' });
  enLair.wires = enLair.wires.filter((x) => x.id !== 'w1');
  check('débranchée : rien à mesurer', lire(enLair).amps === null || lire(enLair).amps === 0,
    `${lire(enLair).amps}`);
}

// --- 6. Variateur : le transistor de commande HACHÉ en PWM -------------------
// Le rapport cyclique n'atteignait ni le voltmètre ni le calcul de vitesse dès
// qu'un transistor s'interposait : le moteur recevait la tension PLEINE quelle
// que soit la consigne du programme (le duty n'était consulté que si la broche
// alimentait le moteur EN DIRECT, ce que personne ne fait — une broche ne tient
// pas 200 mA). Corrigé au lot .55 : le pont du transistor porte son rapport
// cyclique, et la mesure est la moyenne temporelle des deux circuits.
console.log('Variateur PWM par transistor :');
{
  const p = (id, type, attrs) => ({ id, type, x: 0, y: 0, attrs: attrs ?? {} });
  const w = (id, a, b) => ({ id, a, b });
  const pn = (partId, pin) => ({ partId, pin });
  // Montage d'école : broche 9 → 1 kΩ → base, moteur entre le 5 V et le
  // collecteur, diode de roue libre en travers.
  const banc = {
    parts: [
      p('uno', 'uno'),
      p('q', 'npn'),
      p('rb', 'resistor', { value: '1000' }),
      p('m1', 'moteur-dc', { voltage: '5', current: '0.2' }),
      p('d1', 'diode'),
      p('mv', 'multimetre', { mode: 'voltage' }),
    ],
    wires: [
      w('w1', pn('uno', '9'), pn('rb', '1')),
      w('w2', pn('rb', '2'), pn('q', '2')),
      w('w3', pn('uno', '5V'), pn('m1', '1')),
      w('w4', pn('m1', '2'), pn('q', '3')),
      w('w5', pn('q', '1'), pn('uno', 'GND.1')),
      w('w6', pn('m1', '1'), pn('d1', 'K')),
      w('w7', pn('m1', '2'), pn('d1', 'A')),
      w('w8', pn('m1', '1'), pn('mv', '+')),
      w('w9', pn('m1', '2'), pn('mv', 'GND')),
    ],
  };
  // La broche 9 hache : elle est vue HAUTE (le transistor conduit pendant la
  // fraction utile) et son rapport cyclique est posé sur le pont.
  const mesure = (duty) => {
    for (let i = 0; i < 3; i++) {
      model.setActiveBridges(
        model.commandedBridges(banc, (n) => n === '9', 5, undefined, undefined,
          (pin) => (pin === '9' ? duty : null))
      );
    }
    const volts = model.meterReadings(banc, 5, (pin) => (pin === '9' ? 'high' : 'hiz'))
      .find((x) => x.partId === 'mv')?.value;
    const st = model.motorStates(banc, 5, () => duty)[0];
    return { volts, speed: st.speed, applied: st.volts };
  };
  const plein = mesure(1);
  const zero = mesure(0);
  const moitie = mesure(0.5);
  const quart = mesure(0.25);
  const troisQuarts = mesure(0.75);
  model.setActiveBridges([]);

  check('rapport cyclique nul : rien aux bornes du moteur',
    near(zero.volts, 0, 1e-3), `${zero.volts?.toFixed(3)} V`);
  check('rapport cyclique plein : le transistor est un interrupteur fermé',
    plein.volts > 4 && plein.volts < 5, `${plein.volts?.toFixed(3)} V`);
  check('50 % : le voltmètre lit la MOITIÉ de la tension pleine',
    near(moitie.volts, plein.volts / 2, 1e-3),
    `${moitie.volts?.toFixed(3)} V pour ${plein.volts?.toFixed(3)} V pleins`);
  check('la tension moyenne est LINÉAIRE en rapport cyclique',
    near(quart.volts, plein.volts * 0.25, 1e-3)
    && near(troisQuarts.volts, plein.volts * 0.75, 1e-3),
    `25 % → ${quart.volts?.toFixed(3)} V, 75 % → ${troisQuarts.volts?.toFixed(3)} V`);
  check('la VITESSE suit le rapport cyclique (variateur)',
    troisQuarts.speed > moitie.speed && moitie.speed > 0 && zero.speed === 0,
    `0 %→${(zero.speed * 100).toFixed(0)} % 50 %→${(moitie.speed * 100).toFixed(0)} % `
    + `75 %→${(troisQuarts.speed * 100).toFixed(0)} %`);
  check('vitesse et voltmètre viennent du MÊME modèle',
    near(moitie.applied, plein.applied * 0.5, 1e-3),
    `${moitie.applied.toFixed(3)} V pour ${plein.applied.toFixed(3)} V pleins`);
  // Sans hachage, rien ne change : le cas courant ne paie pas la moyenne.
  const sansPwm = (() => {
    for (let i = 0; i < 3; i++) {
      model.setActiveBridges(model.commandedBridges(banc, (n) => n === '9', 5));
    }
    const v = model.meterReadings(banc, 5, (pin) => (pin === '9' ? 'high' : 'hiz'))
      .find((x) => x.partId === 'mv')?.value;
    model.setActiveBridges([]);
    return v;
  })();
  check('sans PWM du tout : la mesure est celle d’avant (aucune moyenne)',
    near(sansPwm, plein.volts, 1e-9), `${sansPwm?.toFixed(3)} V`);

  // Le hachage vu au CREUX du cycle (Frank : « M1 n'est pas stable à 1 kHz »).
  // La boucle d'images échantillonne à ~16 ms : sur un signal à 1 kHz, une image
  // sur deux tombe pendant la phase basse. Le niveau instantané décidait alors
  // si le transistor conduisait — la charge sortait du circuit et la lecture
  // sautait entre 0 V et sa valeur. Une broche qui hache n'a pas de niveau
  // instantané exploitable : elle est vue ACTIVE, la fraction du temps étant
  // portée par le `duty` du pont.
  const mesureAuCreux = (duty) => {
    for (let i = 0; i < 3; i++) {
      model.setActiveBridges(
        model.commandedBridges(banc, () => false, 5, undefined, undefined,
          (pin) => (pin === '9' ? duty : null))
      );
    }
    const v = model.meterReadings(banc, 5, () => 'hiz')
      .find((x) => x.partId === 'mv')?.value;
    model.setActiveBridges([]);
    return v;
  };
  for (const duty of [0.25, 0.5, 0.75, 1]) {
    const creux = mesureAuCreux(duty);
    const attendu = plein.volts * duty;
    check(`broche lue BASSE à ${duty * 100} % : même mesure qu’au sommet (pas de saut)`,
      near(creux, attendu, 1e-3), `${creux?.toFixed(3)} V au lieu de ${attendu.toFixed(3)} V`);
  }

  // Le seuil de décollage NE DOIT PAS crier sous une commande hachée : le
  // câblage est bon, seule la consigne est basse. À 10 % de rapport cyclique le
  // moteur ne tourne pas — et c'est normal, il suffit d'ouvrir la consigne.
  const etat = (duty) => {
    for (let i = 0; i < 3; i++) {
      model.setActiveBridges(
        model.commandedBridges(banc, (n) => n === '9', 5, undefined, undefined,
          (pin) => (pin === '9' ? duty : null))
      );
    }
    const st = model.motorStates(banc, 5, () => duty)[0];
    model.setActiveBridges([]);
    return st;
  };
  const bas = etat(0.1);
  const haut = etat(1);
  check('PWM à 10 % : le moteur ne tourne pas, mais AUCUNE erreur n’est dite',
    bas.speed === 0 && bas.fault === 'none', `vitesse ${bas.speed}, fault=${bas.fault}`);
  check('PWM à 100 % : le moteur tourne, toujours sans erreur',
    haut.speed > 0 && haut.fault === 'none', `vitesse ${(haut.speed * 100).toFixed(0)} %`);
}

// --- 5. Le même variateur, mais monté par le HAUT (PNP) ----------------------
// Un PNP conduit base BASSE : la broche hachée doit donc être vue au niveau
// BAS pour lui, et son temps de conduction est le COMPLÉMENT du rapport
// cyclique — `readPwmDuty` rend la fraction haute, qui le bloque. Le lot .57
// laissait ce montage découvert : le raccourci « broche hachée = active »
// forçait le niveau haut, le seul qui bloque un PNP.
console.log('Variateur PWM par transistor PNP (commande par le haut) :');
{
  const p = (id, type, attrs) => ({ id, type, x: 0, y: 0, attrs: attrs ?? {} });
  const w = (id, a, b) => ({ id, a, b });
  const pn = (partId, pin) => ({ partId, pin });
  // 5 V → émetteur, collecteur → moteur → masse. Base attaquée par la broche 9
  // à travers 1 kΩ : elle TIRE la base vers le bas pour faire conduire.
  const banc = {
    parts: [
      p('uno', 'uno'),
      p('q', 'pnp', { symbol: 'pnp' }),
      p('rb', 'resistor', { value: '1000' }),
      p('m1', 'moteur-dc', { voltage: '5', current: '0.2' }),
      p('d1', 'diode'),
      p('mv', 'multimetre', { mode: 'voltage' }),
    ],
    wires: [
      w('w1', pn('uno', '9'), pn('rb', '1')),
      w('w2', pn('rb', '2'), pn('q', '2')),
      w('w3', pn('uno', '5V'), pn('q', '1')),
      w('w4', pn('q', '3'), pn('m1', '1')),
      w('w5', pn('m1', '2'), pn('uno', 'GND.1')),
      w('w6', pn('m1', '1'), pn('d1', 'K')),
      w('w7', pn('m1', '2'), pn('d1', 'A')),
      w('w8', pn('m1', '1'), pn('mv', '+')),
      w('w9', pn('m1', '2'), pn('mv', 'GND')),
    ],
  };
  // `brocheHaute` : ce que le niveau instantané raconterait à cet instant. Le
  // résultat ne doit PAS en dépendre — c'est tout l'objet du correctif.
  const mesure = (duty, brocheHaute) => {
    for (let i = 0; i < 3; i++) {
      model.setActiveBridges(
        model.commandedBridges(banc, () => brocheHaute, 5, undefined, undefined,
          (pin) => (pin === '9' ? duty : null))
      );
    }
    const v = model
      .meterReadings(banc, 5, (pin) => (pin === '9' ? (brocheHaute ? 'high' : 'low') : 'hiz'))
      .find((x) => x.partId === 'mv')?.value;
    model.setActiveBridges([]);
    return v;
  };
  // Sans PWM : base basse = moteur alimenté, base haute = moteur arrêté.
  const statique = (haute) => {
    for (let i = 0; i < 3; i++) model.setActiveBridges(model.commandedBridges(banc, () => haute, 5));
    const v = model.meterReadings(banc, 5, (pin) => (pin === '9' ? (haute ? 'high' : 'low') : 'hiz'))
      .find((x) => x.partId === 'mv')?.value;
    model.setActiveBridges([]);
    return v;
  };
  const baseBasse = statique(false);
  const baseHaute = statique(true);
  check('sans PWM : base BASSE, le PNP conduit', baseBasse > 4 && baseBasse < 5,
    `${baseBasse?.toFixed(3)} V`);
  check('sans PWM : base HAUTE, le PNP est bloqué', near(baseHaute, 0, 1e-3),
    `${baseHaute?.toFixed(3)} V`);
  // Le rapport cyclique est celui de la fraction HAUTE : 25 % haut = 75 % de
  // conduction pour un PNP. La tension moyenne suit donc 1 − duty.
  for (const duty of [0, 0.25, 0.5, 0.75, 1]) {
    const attendu = baseBasse * (1 - duty);
    const haut = mesure(duty, true);
    const bas = mesure(duty, false);
    check(`${duty * 100} % haut : le PNP conduit le COMPLÉMENT du temps`,
      near(haut, attendu, 1e-3), `${haut?.toFixed(3)} V au lieu de ${attendu.toFixed(3)} V`);
    check(`${duty * 100} % haut : même mesure quel que soit le niveau lu (pas de saut)`,
      near(haut, bas, 1e-9), `haut ${haut?.toFixed(3)} V, bas ${bas?.toFixed(3)} V`);
  }
}

// --- 6. Seuil de décollage : 15 % arrête ET le dit, 150 % grille -------------
console.log('Tension trop faible / trop forte :');
{
  // Sans commande hachée, une tension trop basse est une ERREUR de montage :
  // le rotor reste calé et l'enroulement chauffe. Elle est dite à l'élève.
  const sous = state(direct(0.7)); // 14 % de 5 V
  const juste = state(direct(0.8)); // 16 %
  check('14 % de la tension nominale : arrêté ET signalé',
    sous.speed === 0 && sous.fault === 'weak', `fault=${sous.fault}`);
  check('16 % : juste au-dessus du seuil, il décolle sans rien signaler',
    juste.speed > 0 && juste.fault === 'none',
    `${(juste.speed * 100).toFixed(0)} %, fault=${juste.fault}`);
  // Le seuil est bien à 15 % et pas à 30 % : 2 V sur un moteur de 5 V (40 %)
  // tournait déjà, 1 V (20 %) ne tournait pas — il tourne maintenant.
  const vingt = state(direct(1));
  check('20 % de la tension nominale : le moteur tourne (seuil abaissé à 15 %)',
    vingt.speed > 0 && vingt.fault === 'none', `${(vingt.speed * 100).toFixed(0)} %`);
  // L'autre bout de la règle, inchangé : au-delà de 150 % le moteur GRILLE.
  const brule = state(direct(8)); // 160 %
  const limite = state(direct(7)); // 140 %
  check('160 % de la tension nominale : le moteur grille',
    brule.fault === 'overvolt' && brule.speed === 0, `fault=${brule.fault}`);
  check('140 % : survolté mais vivant, il tourne plus vite que le nominal',
    limite.fault === 'none' && limite.speed > 1,
    `${(limite.speed * 100).toFixed(0)} %, fault=${limite.fault}`);
}

// --- 7. Qui BRIDE le courant : l'alimentation, ou le transistor ? ------------
// Un moteur qui demande plus que le circuit ne donne, ce sont DEUX pannes très
// différentes, et jusqu'ici elles portaient le même message (« l'alimentation
// ne fournit pas le courant ») :
//   - la SOURCE s'effondre : une broche de carte sur un moteur, rien à en tirer ;
//   - le TRANSISTOR de commande sature : il ne transmet que Gain × Ib. Il reste
//     passant, le moteur tourne au ralenti sur ce courant plafonné.
// Le banc mesure-pico de Frank est exactement le second cas : PN2222A de gain
// 35, Ib = 2,6 mA → 91 mA au collecteur, pour un moteur qui en veut 96. Cinq
// pour cent de trop, et le moteur s'arrêtait en accusant une alimentation qui
// avait 2 A à revendre.
console.log('Bridage du courant : source affamée ou transistor saturé :');
{
  // Alim de labo largement dimensionnée + PN2222A : c'est LUI qui plafonne.
  const parTransistor = (baseOhms, motorAmps) => ({
    parts: [
      { id: 'uno', type: 'uno', x: 0, y: 0, attrs: {} },
      ALIM('5', '2'),
      { id: 'q', type: 'pn2222a', x: 0, y: 0, attrs: {} },
      { id: 'rb', type: 'resistor', x: 0, y: 0, attrs: { value: String(baseOhms) } },
      M({ current: String(motorAmps) }),
      { id: 'd1', type: 'diode', x: 0, y: 0, attrs: {} },
    ],
    wires: [
      W('w1', P('uno', '9'), P('rb', '1')),
      W('w2', P('rb', '2'), P('q', 'B')),
      W('w3', P('psu1', 'V+'), P('m1', '1')),
      W('w4', P('m1', '2'), P('q', 'C')),
      W('w5', P('q', 'E'), P('psu1', 'GND')),
      W('w6', P('m1', '1'), P('d1', 'K')),
      W('w7', P('m1', '2'), P('d1', 'A')),
    ],
  });
  const etat = (banc) => {
    for (let i = 0; i < 3; i++) {
      model.setActiveBridges(model.commandedBridges(banc, (n) => n === '9', 5));
    }
    const st = model.motorStates(banc, 5, () => 1)[0];
    model.setActiveBridges([]);
    return st;
  };
  // Le cas de Frank, à quelques pour cent près : le transistor transmet un peu
  // moins que ce que le moteur demande. Il bride, mais le moteur tourne encore.
  // Base de 2,2 kΩ sous 5 V → Ib ≈ 1,95 mA, soit 68 mA transmis par le gain 35,
  // pour un moteur 5 V / 0,08 A qui en veut 80.
  const frottement = etat(parTransistor(2200, 0.08));
  const plafond = frottement.amps;
  check('transistor bridant de quelques % : le moteur TOURNE (plus aucune erreur)',
    frottement.fault === 'none' && frottement.speed > 0.5,
    `${(frottement.speed * 100).toFixed(0)} %, ${(plafond * 1000).toFixed(1)} mA, fault=${frottement.fault}`);
  check('le courant est PLAFONNÉ à ce que le transistor transmet (Gain × Ib)',
    plafond < 0.08 && plafond > 0.06,
    `${(plafond * 1000).toFixed(1)} mA au lieu des 80 mA demandés`);

  // Bridage SÉVÈRE : base très résistive, le transistor ne passe presque rien.
  // Là le moteur cale vraiment — et c'est le TRANSISTOR qu'on accuse, pas
  // l'alimentation qui n'y est pour rien.
  const cale = etat(parTransistor(100000, 0.2));
  check('transistor bridant à fond : le moteur cale et c’est SATURATED',
    cale.fault === 'saturated' && cale.speed === 0, `fault=${cale.fault}`);
  check('le cadre rouge va sur le TRANSISTOR, pas sur le moteur',
    cale.faultPartId === 'q', `faultPartId=${cale.faultPartId}`);

  // L'autre panne reste dite comme avant : une BROCHE de carte (40 mA) sur un
  // moteur qui en veut 200. Là c'est bien la source, et rien ne la sauve.
  const surBroche = {
    parts: [{ id: 'uno', type: 'uno', x: 0, y: 0, attrs: {} }, M()],
    wires: [W('w1', P('uno', '9'), P('m1', '1')), W('w2', P('m1', '2'), P('uno', 'GND.1'))],
  };
  const affame = model.motorStates(surBroche, 5, () => 1)[0];
  check('broche de carte sur un moteur : toujours STARVED (la source, elle, s’effondre)',
    affame.fault === 'starved' && affame.speed === 0, `fault=${affame.fault}`);
  check('rien n’accuse un transistor quand il n’y en a pas',
    affame.faultPartId === undefined, `faultPartId=${affame.faultPartId}`);
}

// --- 8. PWM par la broche elle-même, sans transistor sur la maille -----------
// Le garde-fou « une commande hachée ne signale pas de défaut » ne regardait que
// le hachage porté par un TRANSISTOR (`chopped`). Un petit moteur alimenté en
// direct par une broche et haché par elle passait à côté : à 10 % de consigne il
// criait « tension trop faible » alors qu'à 100 % il tourne — le montage est
// bon, c'est la consigne qui est basse.
console.log('PWM par la broche, sans transistor :');
{
  // 5 V / 20 mA : dans ce que donne une broche (40 mA), donc pas affamé.
  const surBroche = {
    parts: [
      { id: 'uno', type: 'uno', x: 0, y: 0, attrs: {} },
      M({ current: '0.02' }),
    ],
    wires: [W('w1', P('uno', '9'), P('m1', '1')), W('w2', P('m1', '2'), P('uno', 'GND.1'))],
  };
  const a = (duty) => model.motorStates(surBroche, 5, () => duty)[0];
  const bas = a(0.1);
  const haut = a(1);
  check('10 % de consigne : arrêté, mais AUCUNE erreur (le montage est bon)',
    bas.speed === 0 && bas.fault === 'none', `vitesse ${bas.speed}, fault=${bas.fault}`);
  check('100 % : il tourne — la preuve que le câblage n’avait rien',
    haut.speed > 0.9 && haut.fault === 'none', `${(haut.speed * 100).toFixed(0)} %`);
  // Et le vrai défaut de tension, lui, se dit toujours : sans hachage, une
  // alimentation trop faible reste une erreur de montage.
  const vraiDefaut = state(direct(0.7));
  check('sans hachage, une tension trop faible reste signalée (weak)',
    vraiDefaut.fault === 'weak', `fault=${vraiDefaut.fault}`);
}

// --- 6. Le défaut PART quand il est corrigé ---------------------------------
// Le modèle rend bien `none` dès que le moteur retrouve sa tension ; encore
// faut-il que l'AFFICHAGE suive. `reportMotorFaults` ne retirait le cadre rouge
// que s'il était posé sur un AUTRE composant (`previous !== st.partId`) : un
// défaut porté par le moteur lui-même — `weak`, `starved` — restait affiché à
// vie, alors que le moteur tournait de nouveau. C'est le « en permanence » que
// voyait Frank sur mesure-pico.
console.log('\nLe défaut s’efface quand il est corrigé :');
{
  const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
  const bloc = sim.slice(sim.indexOf('function reportMotorFaults'));
  const fin = bloc.indexOf('\nfunction ');
  const corps = fin > 0 ? bloc.slice(0, fin) : bloc;
  check('le cadre du moteur est retiré dès que le défaut change',
    /const previous = motorFaultMarks\.get\(st\.partId\);\s*if \(previous !== undefined\) \{/s.test(corps),
    'la condition previous !== st.partId gardait le cadre à vie');
  check('un moteur GRILLÉ garde le sien (markBurned, pas le défaut de frame)',
    /burnedMotors\.has\(previous\)/.test(corps) && /blownDrivers\.has\(previous\)/.test(corps));
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
