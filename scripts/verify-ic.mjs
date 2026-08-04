// Vérifie les circuits intégrés logiques (kind 'logic-ic', élément kablix-ic) :
//   1. la bibliothèque : une entrée par référence, brochage et attributs posés ;
//   2. la LOGIQUE : les quatre (ou six) portes de CHAQUE référence, sur toutes
//      les combinaisons d'entrées — y compris l'entrée oubliée, qui ne bloque
//      pas un ET dont l'autre entrée est à 0 ;
//   3. l'ALIMENTATION : la famille fixe la plage (un 74LS00 ne marche pas sous
//      3,3 V, un 74HC00 si). Sous le minimum le boîtier est muet, au-dessus du
//      maximum il est DÉTRUIT — « Tensions d'alimentation incompatibles » dans
//      les deux cas ;
//   4. la PROPAGATION : la sortie d'une porte pilote l'entrée d'une autre, une
//      LED, ou une broche de carte (point fixe de la simulation).
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const tmp = mkdtempSync(join(tmpdir(), 'kx-ic-'));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

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
const ics = await bundle('src/webview/diagram/ics.mts', 'ics.mjs');
const refnames = await bundle('src/webview/diagram/refnames.mts', 'refnames.mjs');

// --- Schémas de test ---------------------------------------------------------
const W = (id, a, b) => ({ id, a, b });
const P = (partId, pin) => ({ partId, pin });
const ALIM = (v) => ({ id: 'psu1', type: 'alim', x: 0, y: 0, attrs: { voltage: String(v), maxcurrent: '1' } });
const IC = (id, ref, family = 'HC') => ({ id, type: ref.toLowerCase(), x: 0, y: 0, attrs: ics.icAttrs(ref, family) });

/**
 * Boîtier alimenté par une alim de laboratoire, avec les entrées demandées
 * câblées au rail haut (1) ou à la masse (0). `inputs` : { A1: 1, B1: 0 }.
 * Une entrée absente reste EN L'AIR — c'est le cas de l'entrée oubliée.
 */
function montage(ref, inputs, volts = 5, family = 'HC') {
  const def = ics.icRef(ref);
  const ic = IC('u1', ref, family);
  const wires = [
    W('wv', P('psu1', 'V+'), P('u1', def.vcc)),
    W('wg', P('u1', def.gnd), P('psu1', 'GND')),
  ];
  let n = 0;
  for (const [pin, level] of Object.entries(inputs)) {
    wires.push(W(`wi${n++}`, P('u1', pin), P('psu1', level ? 'V+' : 'GND')));
  }
  return { parts: [ALIM(volts), ic], wires };
}

const READ_LOW = () => false;
/** État du premier (ou seul) boîtier du schéma. Les sorties sont remises à zéro
 *  avant chaque mesure : `setGateDrives` garde son état d'un appel à l'autre. */
function etat(diagram, vcc = 5) {
  model.setGateDrives([]);
  return model.logicIcStates(diagram, READ_LOW, vcc)[0];
}
/** Niveau de la sortie `pin`, ou 'z' si le boîtier ne la pilote pas. */
const sortie = (st, pin) => st?.outputs.find((o) => o.pin === pin)?.level ?? 'z';

// --- 1. Bibliothèque ---------------------------------------------------------
console.log('Bibliothèque :');
{
  const entrees = catalog.CATALOG.filter((d) => d.kind === 'logic-ic');
  check('onze références dans la bibliothèque', entrees.length === 11, `${entrees.length} entrées`);
  check('toutes en kablix-ic (un seul élément, un seul boîtier)',
    entrees.every((d) => d.tag === 'kablix-ic'));
  check('toutes rangées dans « Integrated circuits »',
    entrees.every((d) => catalog.partCategory(d) === 'Integrated circuits'));
  check('la catégorie est proposée dans l ordre de la palette',
    catalog.CATEGORY_ORDER.includes('Integrated circuits'));
  check('libellé = référence + fonction (on cherche « CD4011 » ou « NAND »)',
    entrees.every((d) => d.label.startsWith(d.attrs.ref) && d.label.length > d.attrs.ref.length),
    entrees[0].label);
  check('nom de repère : IC1, IC2… (kind « logic-ic » → famille « ic »)',
    entrees.every((d) => refnames.refFamily(d.type) === 'ic' && refnames.refPrefix(d.type) === 'IC'),
    refnames.refPrefix(entrees[0].type));

  // Le brochage complet vient de la base : 14 pattes, alim en 14, masse en 7.
  const brochages = ics.IC_REFS.every((r) =>
    r.pins.length === 14 && r.pins[13] === r.vcc && r.pins[6] === r.gnd);
  check('DIL-14 : alimentation patte 14, masse patte 7', brochages);
  check('inscription : le « xx » devient la famille (74xx00 + LS → 74LS00)',
    ics.icMarking('74xx00', 'LS') === '74LS00' && ics.icMarking('CD4011', 'LS') === 'CD4011');
  check('74xx02 : sortie de la porte 1 sur la patte 1 (brochage à part)',
    ics.icRef('74xx02').pins[0] === 'Q1' && ics.icRef('74xx00').pins[0] === 'A1');
  check('attributs posés par la bibliothèque : dessin, pattes, schéma interne',
    entrees.every((d) => d.attrs.pkg === 'ic14' && d.attrs.pinnames.split(',').length === 14 && d.attrs.schema));
}

// --- 2. Logique : toutes les portes de toutes les références ------------------
console.log('Logique (toutes les portes, toutes les combinaisons) :');
{
  /** Ce que doit sortir une porte, calculé indépendamment du modèle. */
  const attendu = (op, a, b) => {
    switch (op) {
      case 'and': return a & b;
      case 'or': return a | b;
      case 'xor': return a ^ b;
      case 'nand': return 1 - (a & b);
      case 'nor': return 1 - (a | b);
      case 'not': return 1 - a;
    }
  };
  for (const ref of ics.IC_REFS) {
    const combos = ref.op === 'not' ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
    const fautes = [];
    for (const gate of ref.gates) {
      for (const combo of combos) {
        const inputs = Object.fromEntries(gate.inputs.map((pin, i) => [pin, combo[i]]));
        const st = etat(montage(ref.ref, inputs));
        const got = sortie(st, gate.output);
        const want = attendu(ref.op, combo[0], combo[1] ?? 0);
        if (got !== want) fautes.push(`${gate.output}(${combo.join(',')})=${got}≠${want}`);
      }
    }
    check(`${ref.ref} : ${ref.gates.length} portes ${ref.op.toUpperCase()} × ${combos.length} combinaisons`,
      fautes.length === 0, fautes.slice(0, 3).join(' '));
  }

  // Entrée en l'air : elle ne compte que lorsqu'elle décide.
  check('ET, une entrée en l air et l autre à 0 : la sortie est 0 quand même',
    sortie(etat(montage('CD4081', { A1: 0 })), 'Q1') === 0);
  check('ET, une entrée en l air et l autre à 1 : sortie indéterminée',
    sortie(etat(montage('CD4081', { A1: 1 })), 'Q1') === 'z');
  check('OU, une entrée en l air et l autre à 1 : la sortie est 1 quand même',
    sortie(etat(montage('CD4071', { A1: 1 })), 'Q1') === 1);
  check('OU EXCLUSIF : aucune entrée ne tranche seule',
    sortie(etat(montage('CD4070', { A1: 1 })), 'Q1') === 'z'
    && sortie(etat(montage('CD4070', { A1: 0 })), 'Q1') === 'z');
  check('les portes inutilisées ne sortent rien (entrées en l air)',
    etat(montage('CD4011', { A1: 1, B1: 1 })).outputs.length === 1);
}

// --- 3. Alimentation : la famille fixe la plage -------------------------------
console.log('Alimentation (plage de la famille) :');
{
  const faute = (ref, volts, family) => etat(montage(ref, { A1: 1, B1: 1 }, volts, family)).fault;
  // Série 4000 : 3 à 18 V, la plus tolérante.
  check('CD4011 sous 3 V : rien ne sort (« tensions incompatibles »)',
    faute('CD4011', 2.5) === 'undervolt');
  check('CD4011 de 3 à 18 V : il fonctionne',
    faute('CD4011', 3) === 'none' && faute('CD4011', 12) === 'none' && faute('CD4011', 18) === 'none');
  check('CD4011 au-delà de 18 V : il explose', faute('CD4011', 19) === 'overvolt');
  // Série 74 : c'est la FAMILLE qui décide, et c'est là que se joue le Pico.
  check('74LS00 sous 3,3 V (Pico) : ne fonctionne pas (4,75 V minimum)',
    faute('74xx00', 3.3, 'LS') === 'undervolt');
  check('74HC00 sous 3,3 V (Pico) : fonctionne (2 à 6 V)',
    faute('74xx00', 3.3, 'HC') === 'none');
  check('74LS00 sous 5 V : fonctionne', faute('74xx00', 5, 'LS') === 'none');
  check('74HC00 sous 12 V : il explose', faute('74xx00', 12, 'HC') === 'overvolt');
  check('74HCT00 sous 3,3 V : ne fonctionne pas (4,5 V minimum)',
    faute('74xx00', 3.3, 'HCT') === 'undervolt');
  check('plage lue dans l état : elle est affichable dans le message',
    JSON.stringify(etat(montage('74xx00', {}, 5, 'LS')).range) === '{"min":4.75,"max":5.25}');
  check('inscription reprise dans l état (pour nommer le fautif)',
    etat(montage('74xx00', {}, 5, 'LS')).marking === '74LS00');

  // Boîtier hors tension : ce n'est pas un défaut, c'est un boîtier pas encore câblé.
  const sansMasse = {
    parts: [ALIM(5), IC('u1', 'CD4011')],
    wires: [W('wv', P('psu1', 'V+'), P('u1', 'VDD'))],
  };
  check('masse non câblée : boîtier inerte, sans message d erreur',
    etat(sansMasse).fault === 'unpowered' && etat(sansMasse).outputs.length === 0);
  check('boîtier détruit (liste `dead`) : plus aucune sortie',
    model.logicIcStates(montage('CD4011', { A1: 1, B1: 1 }), READ_LOW, 5, undefined, undefined,
      new Set(['u1'])).at(0).outputs.length === 0);

  // Alimenté par la carte : 5 V sur une Uno, 3,3 V sur un Pico.
  const surCarte = (board, vccPin) => ({
    parts: [{ id: 'b1', type: board, x: 0, y: 0 }, IC('u1', '74xx00', 'LS')],
    wires: [
      W('wv', P('b1', vccPin), P('u1', 'VCC')),
      W('wg', P('u1', 'GND'), P('b1', board === 'uno' ? 'GND.1' : 'GND.3')),
    ],
  });
  check('74LS00 sur le 5 V d une Uno : fonctionne',
    etat(surCarte('uno', '5V'), 5).fault === 'none');
  check('74LS00 sur le 3V3 d un Pico : « tensions incompatibles »',
    etat(surCarte('pico', '3V3'), 3.3).fault === 'undervolt');
}

// --- 4. Propagation : la sortie pilote le reste du schéma ---------------------
console.log('Propagation (point fixe de la simulation) :');
{
  /** Ce que fait la simulation à chaque frame : quelques tours jusqu'au point fixe. */
  const resoudre = (diagram, vcc = 5) => {
    model.setGateDrives([]);
    let states = [];
    for (let pass = 0; pass < 3; pass++) {
      states = model.logicIcStates(diagram, READ_LOW, vcc);
      model.setGateDrives(model.logicIcDrives(states));
    }
    return states;
  };

  // Deux boîtiers en cascade : NON-ET(1,1) = 0, réinjecté dans un NON-ET monté
  // en inverseur → 1. Sans propagation, la seconde porte resterait en l'air.
  const cascade = {
    parts: [ALIM(5), IC('u1', 'CD4011'), { ...IC('u2', 'CD4011'), id: 'u2' }],
    wires: [
      W('w1', P('psu1', 'V+'), P('u1', 'VDD')), W('w2', P('u1', 'GND'), P('psu1', 'GND')),
      W('w3', P('psu1', 'V+'), P('u2', 'VDD')), W('w4', P('u2', 'GND'), P('psu1', 'GND')),
      W('w5', P('psu1', 'V+'), P('u1', 'A1')), W('w6', P('psu1', 'V+'), P('u1', 'B1')),
      W('w7', P('u1', 'Q1'), P('u2', 'A1')), W('w8', P('u1', 'Q1'), P('u2', 'B1')),
    ],
  };
  const chaine = resoudre(cascade);
  check('cascade : NON-ET(1,1) = 0', sortie(chaine.find((s) => s.partId === 'u1'), 'Q1') === 0);
  check('cascade : le 0 repart dans le second boîtier → 1',
    sortie(chaine.find((s) => s.partId === 'u2'), 'Q1') === 1, 'sans propagation la sortie serait « z »');

  // Sortie renvoyée vers la carte : la simulation doit l'injecter (setInput).
  const versCarte = {
    parts: [ALIM(5), IC('u1', 'CD4011'), { id: 'b1', type: 'uno', x: 0, y: 0 }],
    wires: [
      W('w1', P('psu1', 'V+'), P('u1', 'VDD')), W('w2', P('u1', 'GND'), P('psu1', 'GND')),
      W('w3', P('psu1', 'V+'), P('u1', 'A1')), W('w4', P('psu1', 'V+'), P('u1', 'B1')),
      W('w5', P('u1', 'Q1'), P('b1', '7')),
    ],
  };
  const versMcu = model.logicIcMcuInputs(versCarte, resoudre(versCarte));
  check('sortie câblée sur une broche de carte : le niveau y est injecté',
    versMcu.length === 1 && versMcu[0].mcuPin === '7' && versMcu[0].level === 0,
    JSON.stringify(versMcu));

  // Une LED sur la sortie : elle doit s'allumer POUR DE BON (le net est piloté).
  const surLed = {
    parts: [
      ALIM(5), IC('u1', 'CD4071'),
      { id: 'r1', type: 'resistor', x: 0, y: 0, attrs: { value: '330' } },
      { id: 'd1', type: 'led', x: 0, y: 0, attrs: { color: 'red' } },
    ],
    wires: [
      W('w1', P('psu1', 'V+'), P('u1', 'VDD')), W('w2', P('u1', 'GND'), P('psu1', 'GND')),
      W('w3', P('psu1', 'V+'), P('u1', 'A1')), W('w4', P('psu1', 'GND'), P('u1', 'B1')),
      W('w5', P('u1', 'Q1'), P('r1', '1')), W('w6', P('r1', '2'), P('d1', 'A')),
      W('w7', P('d1', 'C'), P('psu1', 'GND')),
    ],
  };
  resoudre(surLed);
  check('OU(1,0) = 1 : la LED câblée sur la sortie s allume',
    model.ledOn(surLed, 'd1', READ_LOW) === true);
  check('la sortie est une vraie source : la LED a sa résistance série',
    model.ledSeriesOhms(surLed, 'd1') === 330, String(model.ledSeriesOhms(surLed, 'd1')));
  model.setGateDrives([]);
  check('sorties retirées : la LED s éteint (rien ne la pilote plus)',
    model.ledOn(surLed, 'd1', READ_LOW) === false);
}

console.log(failures === 0
  ? '\nCircuits intégrés : tout est conforme.'
  : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
