// Vérifie l'ANALYSEUR LOGIQUE (sonde-logique + capture + décodage).
//
// Ce que le banc couvre :
//  - catalogue : la sonde est rangée dans les Instruments, elle ne porte aucun
//    `signals` (une sonde qui chargerait la broche qu'elle écoute serait un
//    défaut, pas un instrument) ;
//  - modèle (`logicProbeVoies`) : résolution de l'accroche par SUPERPOSITION de
//    pastilles — délibérément SANS passer par les nœuds, pour qu'un mauvais
//    câblage reste visible — et les trois diagnostics (`nowhere`, `not-mcu`,
//    `power`) plus le drapeau `analogique` des broches A0…/GP26… ;
//  - `pulseMonitorPins` : les broches sondées y entrent, sinon `samplePulses`
//    ne les balaierait pas et la capture serait vide (le défaut le plus
//    silencieux de toute la chaîne) ;
//  - capture (`AnalyseurCapture`) : niveau initial déduit du premier front,
//    niveau INCONNU tant qu'aucun front n'est venu, déclenchement qui ne bouge
//    plus après le premier front qualifiant, conservation des voies inchangées
//    quand une seule sonde est replacée ;
//  - décodage depuis les CRÉNEAUX : I²C (adresse + R/W, ACK/NACK, start répété,
//    stop), SPI (les quatre modes, cadrage par CS), DMX512 (BREAK, start code,
//    canaux, start code non nul ignoré) — un décodeur nourri de fronts
//    FABRIQUÉS à la main, pour que le banc prouve le décodage et non le moteur.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-'));
const buildTo = async (entry, outfile) => {
  await esbuild.build({
    // `entry` est soit un chemin de source, soit un petit module écrit ici même
    // (`{ contents, resolveDir }`) qui réunit plusieurs sources en un paquet.
    ...(typeof entry === 'string'
      ? { entryPoints: [join(root, entry)] }
      : { stdin: { ...entry, loader: 'ts' } }),
    outfile: join(tmp, outfile),
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.svg': 'text', '.webp': 'dataurl' },
    logLevel: 'silent',
  });
  return import(pathToFileURL(join(tmp, outfile)).href);
};

// Un SEUL paquet pour le modèle et le catalogue : chaque `buildTo` embarque sa
// propre copie des modules, donc un composant enregistré dans un paquet resterait
// inconnu de l'autre. Le module ci-dessous les réunit.
const { logicProbeVoies, pulseMonitorPins, partDef, partCategory, registerCustomPart } =
  await buildTo(
    {
      resolveDir: join(root, 'src/webview/diagram'),
      contents: [
        `export * from './model.mjs';`,
        // Nommé, pas `export *` : le modèle importe DÉJÀ le catalogue, et deux
        // étoiles sur des modules ainsi chaînés font pendre la résolution.
        `export { partDef, partCategory, registerCustomPart } from './catalog.mjs';`,
      ].join('\n'),
    },
    'model.mjs',
  );
const { AnalyseurCapture, VOIES_MAX, FRONTS_MAX_PAR_VOIE, RESERVE_AVANT } = await buildTo('src/webview/analyseur-capture.mts', 'capture.mjs');
// Le décodeur parle la langue de la webview (`t()`, v2026.9.4.133) : son paquet
// embarque SON i18n, qu'il faut régler dans CE paquet. Le banc lit en français,
// puis refait un tour en anglais (langue de base) plus bas.
const { decoder, decoderTous, reglageComplet, rolesDe, reculNecessaireMs, lignesSousVoie, initLocale } = await buildTo(
  {
    resolveDir: join(root, 'src/webview'),
    contents: [
      `export * from './analyseur-decodage.mjs';`,
      `export { initLocale } from './i18n.mjs';`,
    ].join('\n'),
  },
  'decodage.mjs',
);
initLocale('fr');
/**
 * Rend ce que `fn` produit avec le décodeur en ANGLAIS (langue de base du code),
 * puis revient au français. Les contrôles anglais relisent le MÊME signal que
 * leurs voisins français : seule la langue change, donc seule elle est prouvée.
 */
const enAnglais = (fn) => {
  initLocale('en');
  try {
    return fn();
  } finally {
    initLocale('fr');
  }
};
const { PALETTE_LIGHT, PALETTE_DARK, couleurVoie } = await buildTo('src/webview/voies-couleurs.mts', 'couleurs.mjs');
// La vue touche au DOM à l'exécution, mais `nomVoie`/`teinteVoie` sont pures :
// les importer ici prouve les réglages d'affichage sans rendu.
const { nomVoie, teinteVoie } = await buildTo('src/webview/analyseur-vue.mts', 'vue.mjs');

/**
 * Appelle une fonction que le code SOUS TEST est censé exporter, sans faire
 * mourir le banc si elle manque. Sans ce garde-fou, la contre-épreuve au
 * `git stash` s'arrête sur une exception au premier contrôle et n'affiche AUCUN
 * échec — un banc muet passerait alors pour un banc vert.
 */
const appel = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// --- Catalogue -----------------------------------------------------------------
const def = partDef('sonde-logique');
check(
  'catalogue : sonde-logique = kablix-sonde-logique, kind logic-probe, catégorie Instruments',
  def.tag === 'kablix-sonde-logique' && def.kind === 'logic-probe' && partCategory(def) === 'Instruments',
  `${def.tag} / ${def.kind} / ${partCategory(def)}`
);
check(
  'catalogue : les trois attributs de la sonde (voie, accroche, etiquette)',
  'voie' in def.attrs && 'accroche' in def.attrs && 'etiquette' in def.attrs
);

// --- Palette de voies ----------------------------------------------------------
check('palette : 8 teintes claires et 8 sombres (une par voie, jamais recyclées)',
  PALETTE_LIGHT.length === 8 && PALETTE_DARK.length === 8 && VOIES_MAX === 8);
check('palette : la voie 0 a bien deux teintes distinctes selon le thème',
  couleurVoie(0, false) === PALETTE_LIGHT[0] && couleurVoie(0, true) === PALETTE_DARK[0]);
check('palette : au-delà de 8 voies, teinte de débordement grise (jamais un doublon)',
  couleurVoie(8, false) === '#888888' && couleurVoie(-1, false) === '#888888');

// --- Modèle : résolution de l'accroche -----------------------------------------
/** Schéma minimal : une carte, une résistance, et les sondes qu'on lui donne.
 *  `fils` permet de CÂBLER la résistance pour éprouver le suivi de fil. */
const schema = (sondes, fils = []) => ({
  parts: [
    { id: 'uno1', type: 'uno', x: 0, y: 0, attrs: {} },
    { id: 'r1', type: 'resistor', x: 300, y: 0, attrs: { value: '220' } },
    ...sondes,
  ],
  wires: fils,
});
/** La patte 1 de la résistance reliée à la broche 8 de la carte. */
const filR1vers8 = [{ id: 'w1', a: { partId: 'uno1', pin: '8' }, b: { partId: 'r1', pin: '1' }, path: [] }];
const sonde = (id, voie, accroche, etiquette = '') => ({
  id,
  type: 'sonde-logique',
  x: 10,
  y: 10,
  attrs: { voie: String(voie), accroche, etiquette },
});

{
  const v = logicProbeVoies(schema([sonde('s1', 0, 'uno1/8', 'horloge')]));
  check('modèle : sonde sur la broche 8 → voie traçable, broche 8, étiquette reprise',
    v.length === 1 && v[0].pin === '8' && v[0].etiquette === 'horloge' && !v[0].probleme,
    JSON.stringify(v[0]));
}
{
  const v = logicProbeVoies(schema([sonde('s1', 0, '')]));
  check('modèle : pastille sur rien → diagnostic `nowhere`, aucune broche',
    v[0].probleme === 'nowhere' && v[0].pin === undefined, JSON.stringify(v[0]));
}
{
  // BRANCHEMENT PAR FIL. Frank (17/09) : « On doit pouvoir brancher la sonde en
  // la posant directement sur un composant ET en la reliant par un fil. » Les
  // deux gestes existent sur une paillasse : on pose la pince sur une patte, ou
  // on relie son crochet au point à écouter par un cordon. Ici rien SOUS la
  // pince (`accroche` vide) mais un fil part de son crochet `G`.
  const filCrochet = [{ id: 'w2', a: { partId: 's1', pin: 'G' }, b: { partId: 'uno1', pin: '9' }, path: [] }];
  const v = logicProbeVoies(schema([sonde('s1', 0, '')], filCrochet));
  check('modèle : crochet RELIÉ par un fil à la broche 9 → voie traçable, pas `nowhere`',
    !v[0].probleme && v[0].pin === '9' && v[0].suivi === true, JSON.stringify(v[0]));
  // Le fil ne doit pas primer sur la pose : posée sur la 8 ET reliée à la 9,
  // c'est la pince qui gagne — elle est le contact réel.
  const w = logicProbeVoies(schema([sonde('s1', 0, 'uno1/8')], filCrochet));
  check('modèle : posée ET reliée → la POSE gagne, le fil du crochet est ignoré',
    w[0].pin === '8' && !w[0].suivi, JSON.stringify(w[0]));
  // Un fil du crochet vers une patte EN L'AIR ne branche rien : pas de voie
  // fantôme, le diagnostic reste `nowhere`.
  const filMort = [{ id: 'w3', a: { partId: 's1', pin: 'G' }, b: { partId: 'r1', pin: '2' }, path: [] }];
  const m = logicProbeVoies(schema([sonde('s1', 0, '')], filMort));
  check('modèle : crochet relié à une patte en l’air → toujours `nowhere`',
    m[0].probleme === 'nowhere' && m[0].pin === undefined, JSON.stringify(m[0]));
}
{
  // Patte CÂBLÉE à la broche 8 : la pince SUIT LE FIL (décision de Frank, .92).
  // Une vraie pince crocodile mesure le potentiel du point où on l'accroche, et
  // ce point est électriquement la broche qui le pilote. C'est le cas ordinaire
  // d'un montage à modules : on pince la borne du module qu'on observe.
  const v = logicProbeVoies(schema([sonde('s1', 0, 'r1/1')], filR1vers8));
  check('modèle : pastille sur une patte câblée à la broche 8 → suit le fil, broche 8',
    !v[0].probleme && v[0].pin === '8' && v[0].suivi === true, JSON.stringify(v[0]));
}
{
  // L'AUTRE patte : ce n'est pas le même potentiel. Suivre le fil jusque-là
  // afficherait un signal que le point pincé n'a pas — la netlist du suivi ne
  // fusionne donc PAS les résistances.
  const v = logicProbeVoies(schema([sonde('s1', 0, 'r1/2')], filR1vers8));
  check('modèle : pastille sur l’AUTRE patte → muette (une résistance n’est pas un fil)',
    v[0].probleme === 'not-mcu' && v[0].pin === undefined, JSON.stringify(v[0]));
}
{
  // Patte non câblée : rien au bout du fil, la voie reste muette avec sa raison.
  const v = logicProbeVoies(schema([sonde('s1', 0, 'r1/1')]));
  check('modèle : pastille sur une patte en l’air → `not-mcu`, aucune broche',
    v[0].probleme === 'not-mcu' && v[0].pin === undefined, JSON.stringify(v[0]));
}
{
  // Posée DIRECTEMENT sur la broche : pas de remontée, et surtout pas de
  // drapeau `suivi` — la pince est bien là où le nom l'indique.
  const v = logicProbeVoies(schema([sonde('s1', 0, 'uno1/8')], filR1vers8));
  check('modèle : pastille sur la broche même → broche 8 sans drapeau `suivi`',
    v[0].pin === '8' && v[0].suivi === undefined, JSON.stringify(v[0]));
}
{
  const v = logicProbeVoies(schema([sonde('s1', 0, 'uno1/GND.1')]));
  check('modèle : pastille sur une masse → `power` (un niveau constant, aucun front)',
    v[0].probleme === 'power', JSON.stringify(v[0]));
}
{
  // A0 est numériquement lisible (digitalRead(A0) est du code légitime) : on la
  // trace, avec un drapeau qui sert à AVERTIR, pas à refuser.
  const v = logicProbeVoies(schema([sonde('s1', 0, 'uno1/A0')]));
  check('modèle : pastille sur A0 → voie traçable ET marquée analogique',
    !v[0].probleme && v[0].pin === 'A0' && v[0].analogique === true, JSON.stringify(v[0]));
}
{
  const v = logicProbeVoies(schema([sonde('s1', 0, 'uno1/AREF')]));
  check('modèle : pastille sur AREF → `not-mcu` (broche de carte, mais que le firmware ne pilote pas)',
    v[0].probleme === 'not-mcu', JSON.stringify(v[0]));
}
{
  // Même règle côté Pico : GP26 = ADC0, numériquement lisible donc tracée.
  const pico = {
    parts: [
      { id: 'pico1', type: 'pico', x: 0, y: 0, attrs: {} },
      sonde('s1', 0, 'pico1/GP26'),
      sonde('s2', 1, 'pico1/GP15'),
      sonde('s3', 2, 'pico1/3V3'),
    ],
    wires: [],
  };
  const v = logicProbeVoies(pico);
  check('modèle Pico : GP26 tracée et marquée analogique, GP15 propre, 3V3 → `power`',
    v[0].analogique === true && !v[0].probleme && !v[1].probleme && v[1].analogique === false
    && v[2].probleme === 'power',
    JSON.stringify(v));
}
{
  const v = logicProbeVoies(schema([sonde('s2', 3, 'uno1/9'), sonde('s1', 1, 'uno1/8')]));
  check('modèle : les voies sortent dans l\'ordre des couleurs, pas de création',
    v.map((x) => x.voie).join(',') === '1,3', v.map((x) => x.voie).join(','));
}
// --- Reflets de sonde : la sortie d'une carte d'interface ----------------------
//
// Frank, 19/09 : « pour le DMX j'ai bien le signal en sortie de la carte pico
// mais rien en sortie de la carte DMX ». Cause trouvée : la carte Grove DMX512
// porte un SP3485, qui prend un signal TTL asymétrique sur `SIG` et en sort une
// paire différentielle sur `+` / `-`. Ces pattes ne sont sur AUCUN nœud commun
// — et c'est juste : les relier dans la netlist court-circuiterait la sortie sur
// son entrée. Une sonde posée sur `+` ne trouvait donc aucune broche de carte.
//
// Le motif, lui, traverse : ce qui sort est ce qui est entré. Le manifeste le
// déclare (`probeMirrors`), et SEUL l'analyseur le lit.
{
  // Une carte d'interface minimale, à l'image de la Grove DMX512 : une entrée
  // TTL, deux sorties de ligne, et rien qui les relie électriquement.
  registerCustomPart({
    type: 'carte-ligne',
    label: 'Carte de ligne',
    kind: 'passive',
    svg: '<svg viewBox="0 0 100 100"></svg>',
    pins: [
      { name: 'SIG', x: 10, y: 50 },
      { name: '+', x: 90, y: 40 },
      { name: '-', x: 90, y: 60 },
    ],
    probeMirrors: { '+': 'SIG', '-': 'SIG' },
  });
  const avecCarte = (sondes, fils = []) => ({
    parts: [
      { id: 'uno1', type: 'uno', x: 0, y: 0, attrs: {} },
      { id: 'k1', type: 'carte-ligne', x: 300, y: 0, attrs: {} },
      ...sondes,
    ],
    wires: fils,
  });
  // La broche 1 de la carte (TX) pilote l'entrée de la carte de ligne.
  const filTx = [{ id: 'w1', a: { partId: 'uno1', pin: '1' }, b: { partId: 'k1', pin: 'SIG' }, path: [] }];

  const e = logicProbeVoies(avecCarte([sonde('s1', 0, 'k1/SIG')], filTx));
  check('reflet : sur l\'ENTRÉE de la carte, la sonde voit la broche qui la pilote',
    !e[0].probleme && e[0].pin === '1', JSON.stringify(e[0]));

  const plus = logicProbeVoies(avecCarte([sonde('s1', 0, 'k1/+')], filTx));
  check('reflet : sur la SORTIE « + », la sonde voit le même signal (c\'était le défaut DMX)',
    !plus[0].probleme && plus[0].pin === '1', JSON.stringify(plus[0]));

  const moins = logicProbeVoies(avecCarte([sonde('s1', 0, 'k1/-')], filTx));
  check('reflet : et pareil sur la SORTIE « - » de la paire',
    !moins[0].probleme && moins[0].pin === '1', JSON.stringify(moins[0]));

  // Le reflet ne doit PAS inventer de signal : sans fil à l'entrée, la sortie
  // reste muette. Sinon une carte posée sur la paillasse mais reliée à rien
  // montrerait des créneaux venus de nulle part.
  const nu = logicProbeVoies(avecCarte([sonde('s1', 0, 'k1/+')]));
  check('reflet : carte non reliée, la sortie reste muette (pas de signal inventé)',
    nu[0].probleme === 'not-mcu', JSON.stringify(nu[0]));

  // Frank, 23/09, dmx-pico : « les sondes SD1 et SD2 n'affichent rien ». SD2
  // est posée sur le `-` du SPOT, relié par un fil au `-` de la carte. Le
  // reflet n'était appliqué qu'au point PINCÉ : sur le spot, qui n'en déclare
  // aucun, la sonde ne remontait jamais jusqu'à `SIG`. Il faut le suivre sur
  // tout le NŒUD — le fil ne change pas le potentiel du point pincé.
  registerCustomPart({
    type: 'recepteur-ligne',
    label: 'Récepteur de ligne',
    kind: 'passive',
    svg: '<svg viewBox="0 0 100 100"></svg>',
    pins: [
      { name: '+', x: 10, y: 40 },
      { name: '-', x: 10, y: 60 },
    ],
  });
  const avecSpot = (sondes, fils) => ({
    parts: [
      { id: 'uno1', type: 'uno', x: 0, y: 0, attrs: {} },
      { id: 'k1', type: 'carte-ligne', x: 300, y: 0, attrs: {} },
      { id: 'r1', type: 'recepteur-ligne', x: 600, y: 0, attrs: {} },
      ...sondes,
    ],
    wires: fils,
  });
  // Câblage du dmx-pico de Frank : la paire de la carte file vers le spot.
  const filsPaire = [
    { id: 'w5', a: { partId: 'k1', pin: '+' }, b: { partId: 'r1', pin: '+' }, path: [] },
    { id: 'w6', a: { partId: 'r1', pin: '-' }, b: { partId: 'k1', pin: '-' }, path: [] },
  ];
  const spotMoins = logicProbeVoies(avecSpot([sonde('s1', 0, 'r1/-')], [...filTx, ...filsPaire]));
  check('reflet : sur le « - » du SPOT relié à la carte, la sonde voit le signal (SD2 de Frank)',
    !spotMoins[0].probleme && spotMoins[0].pin === '1', JSON.stringify(spotMoins[0]));
  const spotPlus = logicProbeVoies(avecSpot([sonde('s1', 0, 'r1/+')], [...filTx, ...filsPaire]));
  check('reflet : et sur son « + »',
    !spotPlus[0].probleme && spotPlus[0].pin === '1', JSON.stringify(spotPlus[0]));
  // Une pince reliée par un CORDON au spot suit le même chemin.
  const cordon = logicProbeVoies(avecSpot([sonde('s1', 0, '')], [
    ...filTx, ...filsPaire,
    { id: 'w7', a: { partId: 's1', pin: 'G' }, b: { partId: 'r1', pin: '-' }, path: [] },
  ]));
  check('reflet : une pince reliée au spot par un cordon voit aussi le signal',
    !cordon[0].probleme && cordon[0].pin === '1', JSON.stringify(cordon[0]));
  // Contre-épreuve : entrée de la carte non câblée, le spot reste muet.
  const spotNu = logicProbeVoies(avecSpot([sonde('s1', 0, 'r1/-')], filsPaire));
  check('reflet : carte non pilotée, le spot reste muet (pas de signal inventé)',
    spotNu[0].probleme === 'not-mcu', JSON.stringify(spotNu[0]));
  // Et un spot qui n'est PAS relié à la carte n'hérite de rien.
  const spotSeul = logicProbeVoies(avecSpot([sonde('s1', 0, 'r1/-')], filTx));
  check('reflet : spot non relié à la carte, rien ne lui parvient',
    spotSeul[0].probleme === 'not-mcu', JSON.stringify(spotSeul[0]));

  // Et le reflet est bien déclaré dans le PAQUET publié, pas seulement dans le
  // banc : sans cela, rien ne marcherait pour l'élève.
  const paquet = readFileSync(join(root, 'kablix_components', '_sources.json'), 'utf8');
  const dmx = JSON.parse(paquet).components.find((c) => c.type === 'dmx-grove');
  check('reflet : la carte Grove DMX512 publiée déclare ses deux reflets',
    dmx?.probeMirrors?.['+'] === 'SIG' && dmx?.probeMirrors?.['-'] === 'SIG',
    JSON.stringify(dmx?.probeMirrors));
}

{
  // Sans cette ligne, `samplePulses` ne balaierait pas la broche et l'analyseur
  // resterait vide sans rien signaler : c'est LE défaut silencieux de la chaîne.
  const pins = pulseMonitorPins(schema([sonde('s1', 0, 'uno1/8')]), 5);
  check('pulseMonitorPins : la broche sondée y entre (sinon rien n\'est capturé)',
    pins.includes('8'), pins.join(','));
  const sansSonde = pulseMonitorPins(schema([]), 5);
  check('pulseMonitorPins : contre-épreuve, sans sonde la broche 8 n\'y est pas',
    !sansSonde.includes('8'), sansSonde.join(','));
}

// --- Capture --------------------------------------------------------------------
{
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }]);
  check('capture : broches à demander au moteur', c.pins.join(',') === '8');
  check('capture : niveau INCONNU (null) tant qu\'aucun front n\'est venu',
    c.niveauA(0, 0) === null && !c.aDesDonnees);
  // Premier front montant : la broche était donc basse avant. C'est la seule
  // information fiable sur un passé qu'on n'a pas observé.
  c.verser({ 8: [1.0, 1, 2.0, 0, 3.0, 1] });
  check('capture : niveau initial déduit du premier front (montée → était bas)',
    c.niveauA(0, 0.5) === 0, String(c.niveauA(0, 0.5)));
  check('capture : niveau relu entre deux fronts',
    c.niveauA(0, 1.5) === 1 && c.niveauA(0, 2.5) === 0 && c.niveauA(0, 9) === 1);
  check('capture : borne droite = dernier front', c.tFin === 3.0, String(c.tFin));
  // Le journal du moteur est commun à l'oscilloscope : les broches qu'on ne
  // regarde pas doivent être ignorées en silence, pas créer une voie fantôme.
  c.verser({ 13: [4.0, 1] });
  check('capture : broche inconnue ignorée (journal partagé avec l\'oscilloscope)',
    c.listeVoies.length === 1 && c.tFin === 3.0);
}
{
  // RÉOUVERTURE D'UN PROJET ENREGISTRÉ. Une capture ne commence pas à zéro : dès
  // qu'une liaison série est sondée, le programme démarre, ouvre son port, et le
  // premier octet ne part qu'après des dizaines de secondes. Sur le dmx-pico de
  // Frank, la capture va de 89,3 s à 92,3 s. Cadrée depuis 0, elle tiendrait
  // dans 3 % de l'écran — une page grise pour l'élève (retour du 17/09).
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 3, pin: 'GP0', nom: 'DMX' }]);
  check('réouverture : sans aucun front, la borne gauche vaut 0 (pas Infinity)',
    c.tDebut === 0, String(c.tDebut));
  c.verser({ GP0: [89251.3, 1, 89252.0, 0, 92265.1, 1] });
  check('réouverture : borne GAUCHE = premier front, pas zéro',
    c.tDebut === 89251.3, String(c.tDebut));
  // Le rapport entre les deux cadrages, c'est tout l'écart entre une page grise
  // et une capture lisible : 3 s sur 92 s tiennent dans 3 % de la largeur.
  const partDepuisZero = ((c.tFin - c.tDebut) / c.tFin) * 100;
  check('réouverture : cadrer depuis zéro écraserait la capture sous 5 % de l\'écran',
    partDepuisZero < 5, `${partDepuisZero.toFixed(1)} %`);
}
{
  // LA BROCHE FAIT FOI, PAS LE NUMÉRO DE VOIE. Une capture enregistrée et le
  // schéma désignent la même sonde de deux façons : la capture par la BROCHE
  // mesurée, le schéma par le NUMÉRO de la pince. Le numéro n'est qu'une teinte
  // et bouge dès qu'on renumérote une pince ; la broche est l'identité du
  // signal. Cas réel de sonde-logique-pico : schéma sur les voies 0/2/3/4,
  // capture sur les voies 0 et 1 — les fronts de GP15 étaient rangés en voie 1,
  // qui n'a aucune piste, pendant que la piste 2 (la pince POSÉE sur GP15)
  // restait plate. Trois pistes muettes sur quatre.
  // `check` d'ici n'accepte qu'un booléen : une méthode absente le ferait MOURIR
  // au lieu d'échouer, et la contre-épreuve au `git stash` rendrait un banc muet
  // — donc vert en apparence. C'est le piège payé aux lots .100 et .101. On
  // enveloppe donc chaque appel : une exception vaut faux, pas la fin du banc.
  const sans = (f, defaut = null) => { try { return f(); } catch { return defaut; } };
  const c = new AnalyseurCapture();
  c.declarerVoies([
    { voie: 0, pin: 'GP14', nom: 'horloge' },
    { voie: 1, pin: 'GP15', nom: 'GP15' },
  ]);
  c.verser({ GP14: [1, 1, 2, 0], GP15: [1.5, 1, 2.5, 0] });
  sans(() => c.renumeroter(new Map([['GP14', 0], ['GP15', 2]])));
  const parVoie = new Map(c.listeVoies.map((v) => [v.voie, v]));
  check('renumérotage : la voie suit sa BROCHE jusqu\'au numéro du schéma',
    parVoie.get(2)?.pin === 'GP15', JSON.stringify(c.listeVoies.map((v) => [v.voie, v.pin])));
  check('renumérotage : et ses fronts la suivent, sans en perdre un',
    parVoie.get(2)?.fronts.length === 2, String(parVoie.get(2)?.fronts.length));
  check('renumérotage : la voie déjà bien numérotée ne bouge pas',
    parVoie.get(0)?.pin === 'GP14' && parVoie.get(0)?.fronts.length === 2);
  check('renumérotage : l\'ancien numéro est libéré',
    !parVoie.has(1), JSON.stringify([...parVoie.keys()]));
  // Une broche que le schéma ne sonde plus garde son numéro : ses fronts
  // restent là si un message `voies` la ramène.
  const d = new AnalyseurCapture();
  d.declarerVoies([{ voie: 5, pin: 'GP7', nom: 'GP7' }]);
  d.verser({ GP7: [1, 1] });
  sans(() => d.renumeroter(new Map([['GP2', 0]])));
  check('renumérotage : une broche absente du schéma garde sa place et ses fronts',
    d.listeVoies.length === 1 && d.listeVoies[0].voie === 5 && d.listeVoies[0].fronts.length === 1);
  // Une table vide ne doit RIEN toucher : c'est le cas du tout premier message
  // `voies`, avant que l'atelier ait résolu la moindre sonde.
  const e = new AnalyseurCapture();
  e.declarerVoies([{ voie: 3, pin: 'GP9', nom: 'GP9' }]);
  e.verser({ GP9: [1, 1] });
  sans(() => e.renumeroter(new Map()));
  check('renumérotage : une table vide laisse la capture intacte',
    e.listeVoies.length === 1 && e.listeVoies[0].voie === 3 && e.listeVoies[0].fronts.length === 1);
}
{
  // Les PISTES de l'onglet viennent normalement du message `voies` que pousse
  // l'atelier. À la réouverture d'un projet sans relancer la simulation, rien ne
  // l'a poussé : l'onglet affichait « aucune sonde » par-dessus des milliers de
  // fronts bien présents. La capture restaurée est autoportante — chaque voie y
  // porte son numéro, sa broche et son nom —, et c'est d'elle que `restaurer()`
  // dresse les pistes tant que rien d'autre ne l'a fait.
  const src = readFileSync(join(root, 'src', 'webview', 'analyseur.mts'), 'utf8');
  const bloc = src.slice(src.indexOf('function restaurer'), src.indexOf('function restaurer') + 5600);
  // Le critère n'est PAS « aucune piste » mais « aucune piste POUR LES BROCHES
  // DE CETTE CAPTURE » : un atelier où l'on ouvre un SECOND projet garde les
  // voies du premier, l'hôte n'envoie alors que la restauration, et la capture
  // du second n'avait nulle part où se dessiner (22/09). Le contrôle de bout en
  // bout est dans verify-analyseur-rendu.
  check('réouverture : restaurer() dresse les pistes quand aucune ne porte ses broches',
    /const brochesCapturees = new Set\(etat\.voies\.map/.test(bloc) &&
      /diagnostics\.some\(\(d\) => d\.pin && brochesCapturees\.has\(d\.pin\)\)/.test(bloc) &&
      /!aUnePisteUtile && etat\.voies\.length > 0/.test(bloc) &&
      /diagnostics = etat\.voies\.map/.test(bloc));
  check('réouverture : et le déclenchement enregistré est rendu à la capture',
    /capture\.reglerDeclenchement\(etat\.declenchement/.test(bloc));
  check('réouverture : le déclenchement est recherché dans la capture rechargée',
    /capture\.chercherDeclenchement\(\)/.test(bloc));
  check('réouverture : la fréquence d\'échantillonnage est reprise elle aussi',
    /echantillonnage = etat\.echantillonnage/.test(bloc));
  // Défauts de Frank du 23/09 sur le déclenchement (le geste lui-même est
  // prouvé à la vraie souris par _diag-analyseur-gestes.mjs gigue).
  check('déclenchement : « No trigger » ne retire que celui de SA voie',
    /if \(sur !== null\) choisirDeclenchement\(null\)/.test(src));
  check('déclenchement : quand il tombe, la vue saute dessus et y reste',
    /attendait && capture\.tTrigger !== null\) allerAuDeclenchement\(\)/.test(src) &&
      /function allerAuDeclenchement[\s\S]{0,200}suivi = false/.test(src));
  check('déclenchement : sur une capture arrêtée, le poser le cherche dans l\'existant',
    /capture\.chercherDeclenchement\(\) !== null\) \{\s*allerAuDeclenchement\(\)/.test(src));
  check('glissé : un clic qui tremble de moins de 3 px ne décale pas la vue',
    /const SEUIL_GLISSE = 3/.test(src) && /Math\.abs\(ev\.clientX - glisse\.x\) < SEUIL_GLISSE\) return/.test(src));
  check('capture pleine : l\'état le dit, et dit comment relancer',
    /capture\.pleine\s*\?\s*t\('Capture full/.test(src));
  // Le message `voies` reprend la main dès qu'il porte QUELQUE CHOSE : c'est lui
  // qui apporte les DIAGNOSTICS de câblage, que la capture ignore. Il ne la
  // reprend pas quand il est VIDE sur une capture déjà là, hors simulation —
  // l'atelier en pousse un à chaque changement du schéma, les changements
  // « neutres » d'après chargement compris, avant d'avoir résolu la moindre
  // sonde. Ce message-là écrasait la capture restaurée et rendait l'onglet
  // gris (20/09) ; le contrôle de bout en bout est dans verify-analyseur-rendu.
  const surVoies = src.slice(src.indexOf("case 'voies'"), src.indexOf("case 'voies'") + 3600);
  check('réouverture : le message `voies` de l\'atelier reprend la main',
    /diagnostics = msg\.voies\.map/.test(surVoies) && !/diagnostics\.length === 0/.test(surVoies));
  check('réouverture : mais une liste VIDE ne jette pas une capture déjà affichée',
    /!enCours && capture\.aDesDonnees/.test(surVoies)
    && /\n\s*if \(msg\.voies\.length === 0\) return;/.test(surVoies));
  // Le garde a été ÉLARGI le 22/09 : il ne suffit pas d'écarter la liste vide.
  // L'atelier pousse aussi, pendant le montage d'un projet, une liste PLEINE de
  // voies EN DÉFAUT (composants posés avant les fils : une sonde reliée par un
  // fil n'a pas encore de broche). Elle passait l'ancien garde et détruisait les
  // fronts. Le critère reste ÉTROIT — « toutes les voies en défaut » et non
  // « aucune piste utile » : un vrai changement de schéma (second projet, pince
  // déplacée) n'apporte pas non plus de piste utile, et là la capture DOIT
  // céder la place. Bout à bout : verify-analyseur-projix.mjs, scénario du
  // chargement réel, sur les VRAIES captures des .projix de test.
  check('réouverture : une liste dont TOUTES les voies sont en défaut ne jette pas la capture',
    /\n\s*if \(msg\.voies\.every\(\(v\) => v\.probleme \|\| !v\.pin\)\) return;/.test(surVoies));
  // Les deux sens du recalage par broche : à la restauration (la capture arrive
  // sur un schéma déjà connu) et à la réception des voies (le schéma arrive sur
  // une capture déjà restaurée — l'atelier résout ses sondes en retard).
  check('réouverture : restaurer() range la capture sur les voies du SCHÉMA, par broche',
    /parPin\.get\(v\.pin\) \?\? v\.voie/.test(bloc) && /capture\.declarerVoies\(\s*(etat\.voies\.length > 0\s*\?\s*)?etat\.voies\.map/.test(bloc));
  // Réglages SEULS (v2026.9.5.149 : run qui démarre, aucune mesure à rendre) :
  // la capture garde les voies du schéma. Bout à bout : verify-analyseur-recharge.mjs.
  check('réouverture : des réglages seuls ne vident pas les voies de la capture',
    /etat\.voies\.length > 0[\s\S]{0,400}: [\s\S]{0,600}diagnostics\.filter\(\(d\) => !d\.probleme && d\.pin\)/.test(bloc));
  check('réouverture : et un message `voies` tardif renumérote la capture au lieu de la jeter',
    /capture\.renumeroter\(/.test(surVoies));

  // CÔTÉ ATELIER (22/09) : tarir la source plutôt que filtrer à l'arrivée.
  // `pousserVoiesLogiques()` était hors du garde `loadingProject`, donc appelé à
  // chaque étape du montage d'un projet — clear() sur schéma vide, puis les
  // composants AVANT les fils. Il doit maintenant être sous le garde, et poussé
  // explicitement une fois le schéma complet (sinon plus aucune voie n'arrive,
  // le notify() final de loadDiagram tombant lui aussi pendant le chargement).
  const atelier = readFileSync(join(root, 'src', 'webview', 'sim.mts'), 'utf8');
  check('chargement : l\'atelier ne pousse pas ses voies sur un schéma à moitié monté',
    /if \(!loadingProject\) pousserVoiesLogiques\(\);/.test(atelier));
  check('chargement : mais il les pousse une fois le schéma complet',
    (atelier.match(/loadingProject = false;\s*(?:\/\/[^\n]*\n\s*)*pousserVoiesLogiques\(\);/g) ?? []).length >= 2);

  // L'ONGLET AU SECOND PLAN NE REÇOIT AUCUNE IMAGE (v2026.9.4.98). Frank, 18/09 :
  // « je ne vois toujours rien dans l'analyseur, que le programme tourne, soit
  // en pause ou arrêté ». Mesuré au banc : l'état arrivait bien dans la page —
  // la liste de déclenchement se remplissait — mais **zéro** `requestAnimationFrame`
  // servi en 500 ms. Un onglet de webview VS Code ouvert avec `preserveFocus`
  // naît au second plan, et le navigateur y gèle le rAF ; `retainContextWhenHidden`
  // n'y change rien, il garde le contexte, il ne rend pas d'image.
  //
  // Le verrou `if (raf) return` aggravait tout : armé au premier appel, il
  // avalait en silence toutes les demandes suivantes pendant le gel. D'où un
  // onglet définitivement blanc — même une fois ramené au premier plan.
  const dess = src.slice(src.indexOf('function dessiner'), src.indexOf('function dessiner') + 700);
  check('rendu : une minuterie de secours double le rAF (onglet au second plan)',
    /setTimeout/.test(dess) && /cancelAnimationFrame/.test(dess),
    dess.slice(0, 120));
  check('rendu : le verrou laisse passer quand le rAF est gelé',
    /if \(raf \|\| filet\) return/.test(dess));
  check('rendu : un retour au premier plan repeint',
    /visibilitychange/.test(src) && /document\.hidden/.test(src));
}
{
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }, { voie: 1, pin: '9', nom: 'DATA' }]);
  c.verser({ 8: [1, 1, 2, 0], 9: [1.5, 1] });
  // Replacer UNE sonde ne doit pas effacer la capture des autres : sinon
  // rebrancher une pince pendant un run coûterait la mesure entière.
  c.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }, { voie: 1, pin: '10', nom: 'DATA' }]);
  const v0 = c.listeVoies.find((v) => v.voie === 0);
  const v1 = c.listeVoies.find((v) => v.voie === 1);
  check('capture : sonde déplacée → sa voie repart de zéro, les autres sont gardées',
    v0.fronts.length === 2 && v1.fronts.length === 0,
    `${v0.fronts.length} / ${v1.fronts.length}`);
}
{
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }]);
  c.reglerDeclenchement({ voie: 0, sens: 'rising' });
  check('déclenchement : armé, en attente', c.enAttente && c.tTrigger === null);
  c.verser({ 8: [1.0, 0, 2.0, 1, 3.0, 0, 4.0, 1] });
  // Seul le PREMIER front qualifiant compte : un déclenchement qui se
  // redéplacerait à chaque front ferait glisser l'écran sans arrêt — exactement
  // le défaut qu'un déclenchement est censé corriger.
  check('déclenchement : figé sur le PREMIER front montant (2,0 ms), pas le dernier',
    c.tTrigger === 2.0 && !c.enAttente, String(c.tTrigger));
  c.reglerDeclenchement({ voie: 0, sens: 'falling' });
  check('déclenchement : changer le réglage réarme', c.tTrigger === null && c.enAttente);
  c.verser({ 8: [5.0, 0] });
  check('déclenchement : descendant pris sur le front descendant', c.tTrigger === 5.0);
}
{
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }]);
  c.verser({ 8: [1, 1, 5, 0, 9, 1] });
  // Le niveau qui ENTRE par le bord gauche : sans lui, un créneau commencé avant
  // la fenêtre serait dessiné à partir du vide.
  const f = c.fenetre(0, 6, 12);
  check('fenêtre : rend le niveau entrant (bas à 6 ms) et les fronts de la plage',
    f.entrant === 0 && f.fronts.length === 1 && f.fronts[0].t === 9,
    `${f.entrant} / ${f.fronts.length}`);
}
{
  // Capture arrêtée : poser un déclenchement après coup le trouve dans ce qui
  // est déjà là (sinon aucun front nouveau ne viendrait jamais le marquer).
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }]);
  c.verser({ 8: [1, 1, 2, 0, 3, 1] });
  c.reglerDeclenchement({ voie: 0, sens: 'falling' });
  check('déclenchement : sur une capture arrêtée, trouvé dans les fronts déjà là',
    c.chercherDeclenchement() === 2 && c.tTrigger === 2, String(c.tTrigger));
}
{
  // Le plafond de fronts, sonde-logique-uno de Frank (23/09) : horloge sur D8
  // (un front par ms), une seule montée sur D9 qui sert de déclenchement.
  const horloge = (a, b) => {
    const s = [];
    for (let t = a; t <= b; t++) s.push(t, t % 2);
    return s;
  };
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }, { voie: 1, pin: '9', nom: 'TRIG' }]);
  c.reglerDeclenchement({ voie: 1, sens: 'rising' });
  const T_DECL = 70_000.5;
  const jusqua = (fin, depuis) => {
    for (let a = depuis; a <= fin; a += 1000) {
      const b = Math.min(fin, a + 999);
      const s = { 8: horloge(a, b) };
      if (T_DECL >= a && T_DECL < b + 1) s[9] = [T_DECL, 1];
      c.verser(s);
    }
  };
  jusqua(65_000, 1);
  const v0 = () => c.listeVoies[0];
  // Sans déclenchement survenu, les plus vieux fronts partent, mais ce départ
  // laisse une trace : avant elle le niveau est INCONNU, pas recalculé.
  check('plafond : la voie garde ses 60 000 derniers fronts',
    v0().fronts.length === FRONTS_MAX_PAR_VOIE && v0().fronts[0].t === 5001,
    `${v0().fronts.length} dès ${v0().fronts[0]?.t}`);
  check('plafond : la perte est datée au dernier front jeté',
    v0().perte === 5000, String(v0().perte));
  check('plafond : avant la perte le niveau est inconnu, après il est connu',
    c.niveauA(0, 4000) === null && c.niveauA(0, 5000.5) === 0,
    `${c.niveauA(0, 4000)} / ${c.niveauA(0, 5000.5)}`);
  const f = c.fenetre(0, 4000, 6000);
  check('plafond : la fenêtre à cheval dit d\'où le niveau est connu',
    f.connuDepuis === 5000 && f.entrant === 0 && f.fronts.length === 1000,
    `${f.connuDepuis} / ${f.entrant} / ${f.fronts.length}`);
  // Le trait qui basculait haut/bas : la même fenêtre, relue après une salve de
  // plus, doit rendre le MÊME niveau inconnu (avant : niveau initial recalculé).
  const avant = c.fenetre(0, 1000, 2000);
  jusqua(65_001, 65_001);
  const apres = c.fenetre(0, 1000, 2000);
  check('plafond : une fenêtre sur la partie jetée reste inconnue d\'une salve à l\'autre',
    avant.entrant === null && apres.entrant === null && avant.fronts.length === 0 && apres.fronts.length === 0,
    `${avant.entrant} → ${apres.entrant}`);

  jusqua(150_000, 65_002);
  const tFronts = v0().fronts.map((x) => x.t);
  const avantDecl = tFronts.filter((t) => t < T_DECL).length;
  check('déclenchement : la zone qui le précède est réduite à la réserve, pas mangée',
    c.tTrigger === T_DECL && avantDecl === RESERVE_AVANT, `${c.tTrigger} / ${avantDecl}`);
  check('déclenchement : la capture est pleine et s\'arrête à 60 000 fronts',
    c.pleine && v0().fronts.length === FRONTS_MAX_PAR_VOIE && c.tFin === tFronts.at(-1),
    `${c.pleine} / ${v0().fronts.length} / ${c.tFin}`);
  const autour = c.fenetre(0, T_DECL - 5, T_DECL + 5);
  check('déclenchement : les fronts autour du déclenchement sont toujours là',
    autour.fronts.length === 10 && autour.connuDepuis === null, String(autour.fronts.length));
  check('déclenchement : la voie du déclenchement n\'a rien perdu',
    c.listeVoies[1].fronts.length === 1 && c.listeVoies[1].perte === undefined);

  // Régler de nouveau : nouvelle acquisition, qui repart du niveau courant.
  c.reglerDeclenchement({ voie: 1, sens: 'rising' });
  jusqua(151_000, 150_001);
  check('pleine : régler le déclenchement relance une acquisition',
    !c.pleine && c.enAttente && v0().fronts[0].t === 150_001 && v0().fronts.length === 1000,
    `${c.pleine} / ${v0().fronts[0]?.t} / ${v0().fronts.length}`);
  check('pleine : la nouvelle acquisition connaît le niveau de départ, pas l\'histoire',
    c.niveauA(0, 150_000.5) === 0 && c.niveauA(0, 149_000) === null,
    `${c.niveauA(0, 150_000.5)} / ${c.niveauA(0, 149_000)}`);
}

// --- Déclenchement sur START code DMX (v2026.9.5.141) ----------------------------
{
  // Frank, 24/09 : « déclenchement sur start code (premier 0x00) ». Deux trames :
  // la première ouverte par un start code NON nul (0xCC, RDM) dont un canal vaut
  // 0x00, la seconde par le START code 0x00 d'éclairage. Seul ce dernier doit
  // déclencher, sur son start bit.
  const trameDmx = (bauds) => {
    const BIT = 1000 / bauds;
    return (depart, codes) => {
      const plat = [];
      let t = depart;
      let niveau = 1;
      const palier = (n, nb) => {
        if (n !== niveau) { plat.push(t, n); niveau = n; }
        t += nb * BIT;
      };
      const debuts = [];
      palier(0, 25); // BREAK (100 µs à 250 kbauds)
      palier(1, 3); // MAB
      for (const o of codes) {
        debuts.push(t);
        palier(0, 1);
        for (let i = 0; i < 8; i++) palier((o >> i) & 1, 1);
        palier(1, 2);
      }
      palier(1, 30);
      return { plat, debuts, fin: t };
    };
  };
  const a250 = trameDmx(250_000);
  const t1 = a250(1.0, [0xcc, 0x00, 0x10]);
  const t2 = a250(t1.fin, [0x00, 0x80, 0x00]);
  const T_START = t2.debuts[0];
  const DMX = { 0: [...t1.plat, ...t2.plat] };
  const nouvelle = () => {
    const c = new AnalyseurCapture();
    c.declarerVoies([{ voie: 0, pin: '0', nom: 'DMX' }]);
    return c;
  };

  const c = nouvelle();
  c.reglerDeclenchement({ voie: 0, sens: 'dmxStart' });
  c.verser(DMX);
  check('déclenchement DMX : posé sur le start bit du START code 0x00',
    c.tTrigger !== null && Math.abs(c.tTrigger - T_START) < 1e-9, `${c.tTrigger} / ${T_START}`);
  check('déclenchement DMX : ni un start code non nul, ni un canal à 0x00',
    c.tTrigger === null || c.tTrigger > t1.fin, String(c.tTrigger));

  // En plein run, les fronts arrivent par petites salves : la trame se coupe
  // n'importe où, BREAK d'un côté et START code de l'autre.
  const plat = DMX[0];
  for (const pas of [2, 4, 6, 10]) {
    const s = nouvelle();
    s.reglerDeclenchement({ voie: 0, sens: 'dmxStart' });
    for (let i = 0; i < plat.length; i += pas) s.verser({ 0: plat.slice(i, i + pas) });
    check(`déclenchement DMX : trouvé aussi en salves de ${pas / 2} front(s)`,
      s.tTrigger !== null && Math.abs(s.tTrigger - T_START) < 1e-9, String(s.tTrigger));
  }

  // Capture arrêtée : poser le déclenchement après coup le trouve.
  const a = nouvelle();
  a.verser(DMX);
  a.reglerDeclenchement({ voie: 0, sens: 'dmxStart' });
  check('déclenchement DMX : trouvé après coup sur une capture arrêtée',
    a.chercherDeclenchement() !== null && Math.abs(a.tTrigger - T_START) < 1e-9, String(a.tTrigger));

  // Ligne lue à l'envers (sonde sur la patte « - » d'un RS-485) : on déclenche
  // sur ce qu'on VOIT, donc une fois la voie remise à l'endroit.
  const envers = { 0: DMX[0].map((x, i) => (i % 2 ? 1 - x : x)) };
  const inv = nouvelle();
  inv.reglerDeclenchement({ voie: 0, sens: 'dmxStart' });
  inv.verser(envers);
  const avantInversion = inv.tTrigger;
  inv.reglerInversion([0]);
  check('déclenchement DMX : ligne inversée → trouvé une fois la voie inversée, pas avant',
    avantInversion === null && inv.tTrigger !== null && Math.abs(inv.tTrigger - T_START) < 1e-9,
    `${avantInversion} → ${inv.tTrigger}`);

  // Vitesse réglée sur la voie : une trame à 125 kbauds ne répond qu'une fois
  // la voie réglée à 125 kbauds.
  const a125 = trameDmx(125_000)(1.0, [0x00, 0x42]);
  const lent = nouvelle();
  lent.reglerDeclenchement({ voie: 0, sens: 'dmxStart' });
  lent.verser({ 0: a125.plat });
  const a250Lu = lent.tTrigger;
  lent.reglerVitesses(new Map([[0, 125_000]]));
  check('déclenchement DMX : suit la vitesse de la voie (125 kbauds)',
    a250Lu === null && lent.tTrigger !== null && Math.abs(lent.tTrigger - a125.debuts[0]) < 1e-9,
    `${a250Lu} → ${lent.tTrigger}`);

  // Échantillonnée à 1 MHz (un bit = 4 échantillons) : trouvé au tic qui suit
  // le start bit, là où la courbe le dessine.
  const ech = nouvelle();
  ech.reglerEchantillonnage(1_000_000);
  ech.reglerDeclenchement({ voie: 0, sens: 'dmxStart' });
  ech.verser(DMX);
  check('déclenchement DMX : échantillonné à 1 MHz, posé au tic du start bit',
    ech.tTrigger !== null && ech.tTrigger >= T_START - 1e-9 && ech.tTrigger <= T_START + 0.001 + 1e-9,
    `${ech.tTrigger} / ${T_START}`);

  // L'interface : l'entrée n'apparaît que sur une voie décodée en DMX, le
  // bouton dit « SC », la vitesse de voie descend dans la capture avant le
  // déclenchement, et la fiche l'explique.
  const js = readFileSync(join(root, 'src', 'webview', 'analyseur.mts'), 'utf8');
  check('déclenchement DMX : entrée « START code 0x00 » réservée aux voies décodées en DMX',
    /decodageDe\(z\.voie\)\?\.protocole === 'dmx' \|\| sur === 'dmxStart'/.test(js) &&
      /'START code 0x00'/.test(js) && /sens: 'dmxStart'/.test(js));
  check('déclenchement DMX : vitesse de voie répercutée au réglage et à la restauration',
    /majInversions\(\);\s*majVitesses\(\);\s*dessiner\(\);/.test(js) &&
      /majInversions\(\);\s*majVitesses\(\);\s*capture\.reglerDeclenchement\(/.test(js));
  const vueSrc = readFileSync(join(root, 'src', 'webview', 'analyseur-vue.mts'), 'utf8');
  check('déclenchement DMX : le bouton « T » armé montre « SC »',
    /decl === 'dmxStart'/.test(vueSrc) && /fillText\('SC'/.test(vueSrc));
  const ficheDecl = readFileSync(join(root, 'docs', 'fr', 'composants', 'sonde-logique.md'), 'utf8');
  check('déclenchement DMX : la fiche d\'aide l\'explique',
    /## Le déclenchement[\s\S]*START code 0x00[\s\S]*## Le décodage/.test(ficheDecl));
}

// --- Décodage : outils de fabrication de créneaux --------------------------------
/** Construit une voie de capture à partir d'une liste [t, niveau]. */
const voieDe = (voie, pin, paires, niveauInitial) => ({
  voie,
  pin,
  nom: pin,
  niveauInitial,
  fronts: paires.map(([t, niveau]) => ({ t, niveau })),
});

// --- I²C -------------------------------------------------------------------------
{
  // Trame fabriquée à la main : START, adresse 0x27 en écriture (0x4E sur le
  // fil), ACK, octet 0x55, ACK, STOP. Les temps sont en ms simulées, un bit
  // d'horloge dure 10 µs (100 kHz).
  const T = 0.01; // demi-période d'horloge, en ms
  const sclF = [];
  const sdaF = [];
  let t = 1.0;
  // START : SDA descend pendant que SCL est haut (les deux lignes sont au repos
  // à 1 — pas de front redondant, une pince ne voit que des CHANGEMENTS).
  // Une pince ne voit que les CHANGEMENTS : deux bits identiques de suite ne
  // produisent aucun front. Le banc doit fabriquer un signal réaliste, sinon il
  // prouve un décodeur nourri de données qu'il ne recevra jamais.
  let sda = 1;
  t += T;
  sdaF.push([t, 0]); // START (SCL haut depuis le repos)
  sda = 0;
  t += T;
  /** Pousse un bit : SDA posé horloge basse, lu sur le front montant. */
  const bit = (b) => {
    sclF.push([t, 0]);
    t += T / 2;
    if (b !== sda) {
      sdaF.push([t, b]);
      sda = b;
    }
    t += T / 2;
    sclF.push([t, 1]);
    t += T;
  };
  const octet = (o, ack) => {
    for (let i = 7; i >= 0; i--) bit((o >> i) & 1);
    bit(ack ? 0 : 1);
  };
  octet(0x4e, true); // adresse 0x27, bit R/W à 0 → écriture
  octet(0x55, true);
  // STOP : après le dernier ACK, SCL est resté HAUT (`bit` le laisse en haut) et
  // SDA bas. Le maître relâche SDA horloge haute : c'est le STOP, et il n'y a
  // AUCUNE impulsion d'horloge de plus — en ajouter une ferait compter un 9e bit.
  t += T;
  sdaF.push([t, 1]); // STOP

  const voies = [voieDe(0, 'SCL', sclF, 1), voieDe(1, 'SDA', sdaF, 1)];
  const ann = decoder(voies, { protocole: 'i2c', horloge: 0, donnees: 1 });
  const textes = ann.map((a) => a.texte);
  check('I²C : START et STOP repérés (SDA bougeant horloge HAUTE)',
    textes[0] === 'START' && textes[textes.length - 1] === 'STOP', textes.join(' | '));
  // Start vert, stop rouge, pour tous les protocoles (Frank, 24/09) : il leur
  // faut une DURÉE à colorer, pas un trait.
  const debut = ann[0];
  const fin = ann[ann.length - 1];
  check('I²C : le START dure jusqu\'au premier front descendant de SCL (nature start)',
    debut.nature === 'start' && Math.abs(debut.t0 - 1.01) < 1e-9 && Math.abs(debut.t1 - 1.02) < 1e-9,
    `${debut.nature} ${debut.t0}→${debut.t1}`);
  check('I²C : le STOP part du dernier front montant de SCL (nature stop)',
    fin.nature === 'stop' && fin.t1 > fin.t0 && Math.abs(fin.t0 - sclF[sclF.length - 1][0]) < 1e-9,
    `${fin.nature} ${fin.t0}→${fin.t1}`);
  check('I²C : adresse 0x27 en écriture (0x4E sur le fil = adresse décalée + R/W)',
    textes.includes('adr 0x27 W'), textes.join(' | '));
  const enEn = enAnglais(() => decoder(voies, { protocole: 'i2c', horloge: 0, donnees: 1 }).map((a) => a.texte));
  check('I²C en anglais : « addr 0x27 W », START/ACK/STOP inchangés',
    enEn.includes('addr 0x27 W') && enEn[0] === 'START' && enEn.includes('ACK') && enEn.includes('STOP'),
    enEn.join(' | '));
  check('I²C : l\'octet de données est décodé', textes.includes('0x55'), textes.join(' | '));
  check('I²C : les deux acquittements sont lus',
    textes.filter((x) => x === 'ACK').length === 2, textes.join(' | '));
  check('I²C : rien de décodé sans les deux voies',
    decoder(voies, { protocole: 'i2c', horloge: 0 }).length === 0);
}

// --- SPI --------------------------------------------------------------------------
/**
 * Fabrique un échange SPI mode 0 (horloge au repos basse, donnée posée avant le
 * front montant). `avecCs` encadre l'octet par une sélection active basse.
 * Ne pousse que les VRAIS fronts : sans ça le banc nourrirait le décodeur de
 * doublons qu'aucune pince ne produit.
 */
const spiMode0 = (octets, avecCs) => {
  const T = 0.001;
  const sck = [];
  const mosi = [];
  const miso = [];
  const cs = [];
  let t = 1.0;
  let nMosi = 0;
  let nMiso = 0;
  if (avecCs) {
    cs.push([t, 0]);
    t += T;
  }
  for (const { out, in: ent } of octets) {
    for (let i = 7; i >= 0; i--) {
      const bo = (out >> i) & 1;
      const bi = (ent >> i) & 1;
      if (bo !== nMosi) { mosi.push([t, bo]); nMosi = bo; }
      if (bi !== nMiso) { miso.push([t, bi]); nMiso = bi; }
      t += T / 2;
      sck.push([t, 1]); // front montant : les deux côtés échantillonnent
      t += T / 2;
      sck.push([t, 0]);
      t += T / 2;
    }
  }
  if (avecCs) cs.push([t, 1]);
  return { sck, mosi, miso, cs };
};

{
  const { sck, mosi, miso, cs } = spiMode0([{ out: 0xa5, in: 0x3c }], true);
  const voies = [
    voieDe(0, 'SCK', sck, 0),
    voieDe(1, 'MOSI', mosi, 0),
    voieDe(2, 'MISO', miso, 0),
    voieDe(3, 'CS', cs, 1),
  ];
  const base = { protocole: 'spi', horloge: 0, donnees: 1, donnees2: 2, selection: 3 };
  const textes = decoder(voies, { ...base, mode: 0 }).map((a) => a.texte);
  check('SPI mode 0 : les deux sens décodés (MOSI 0xA5 · MISO 0x3C)',
    textes.some((x) => x === 'MOSI 0xA5 · MISO 0x3C'), textes.join(' | '));
  check('SPI : les bascules de CS sont annoncées',
    textes.includes('CS ↓') && textes.includes('CS ↑'), textes.join(' | '));
  const csAnn = decoder(voies, { ...base, mode: 0 }).filter((a) => a.texte.startsWith('CS'));
  const sel = csAnn.find((a) => a.texte === 'CS ↓');
  const rel = csAnn.find((a) => a.texte === 'CS ↑');
  check('SPI : CS ↓ en start (jusqu\'au 1er coup d\'horloge), CS ↑ en stop (depuis le dernier)',
    sel?.nature === 'start' && Math.abs(sel.t1 - sck[0][0]) < 1e-9 &&
      rel?.nature === 'stop' && Math.abs(rel.t0 - sck[sck.length - 1][0]) < 1e-9,
    JSON.stringify(csAnn.map((a) => [a.texte, a.nature, a.t0, a.t1])));
  // Mode 3 échantillonne aussi sur le front montant : même résultat que mode 0.
  const mode3 = decoder(voies, { ...base, mode: 3 }).map((a) => a.texte);
  check('SPI : mode 3 échantillonne comme le mode 0 (même front actif)',
    mode3.some((x) => x === 'MOSI 0xA5 · MISO 0x3C'), mode3.join(' | '));
}
{
  // Contre-épreuve du réglage de mode. Vrai signal mode 1 : la donnée est posée
  // SUR le front montant et lue sur le descendant. Le décodeur réglé en mode 1
  // doit retrouver l'octet ; réglé en mode 0, il échantillonne au moment même du
  // changement et ne doit PAS tomber dessus. Sans cette épreuve, le sélecteur de
  // mode pourrait être purement décoratif.
  const T = 0.001;
  const sck = [];
  const mosi = [];
  let t = 1.0;
  let n = 0;
  const OCTET = 0x6b; // motif alterné : tout décalage se voit
  for (let i = 7; i >= 0; i--) {
    const b = (OCTET >> i) & 1;
    sck.push([t, 1]); // montant
    // La donnée sort juste APRÈS le montant (temps de propagation du maître) :
    // un lecteur réglé en mode 0 échantillonne donc le bit PRÉCÉDENT.
    if (b !== n) { mosi.push([t + T / 20, b]); n = b; }
    t += T / 2;
    sck.push([t, 0]); // descendant : l'esclave lit
    t += T / 2;
  }
  const voies = [voieDe(0, 'SCK', sck, 0), voieDe(1, 'MOSI', mosi, 0)];
  const m1 = decoder(voies, { protocole: 'spi', horloge: 0, donnees: 1, mode: 1 }).map((a) => a.texte);
  const m0 = decoder(voies, { protocole: 'spi', horloge: 0, donnees: 1, mode: 0 }).map((a) => a.texte);
  check('SPI mode 1 : signal posé sur le montant, lu sur le descendant → 0x6B',
    m1.some((x) => x === 'MOSI 0x6B'), m1.join(' | '));
  check('SPI : le réglage de mode compte vraiment (mode 0 ne lit pas 0x6B ici)',
    !m0.some((x) => x === 'MOSI 0x6B'), m0.join(' | '));
}
{
  // Sans CS : deux octets d'affilée, le décodeur compte simplement de 8 en 8.
  const { sck, mosi } = spiMode0([{ out: 0x01, in: 0 }, { out: 0xff, in: 0 }], false);
  const textes = decoder(
    [voieDe(0, 'SCK', sck, 0), voieDe(1, 'MOSI', mosi, 0)],
    { protocole: 'spi', horloge: 0, donnees: 1, mode: 0 }
  ).map((a) => a.texte);
  check('SPI sans CS : deux octets décodés bout à bout (0x01 puis 0xFF)',
    textes.join(' | ') === 'MOSI 0x01 | MOSI 0xFF', textes.join(' | '));
}
{
  // Octet incomplet : 5 coups d'horloge puis plus rien. Se taire ici masquerait
  // le cas le plus courant — une pince posée sur la mauvaise broche d'horloge.
  const { sck, mosi } = spiMode0([{ out: 0xa5, in: 0 }], false);
  const textes = decoder(
    [voieDe(0, 'SCK', sck.slice(0, 10), 0), voieDe(1, 'MOSI', mosi, 0)],
    { protocole: 'spi', horloge: 0, donnees: 1, mode: 0 }
  ).map((a) => a.texte);
  check('SPI : octet tronqué signalé au lieu d\'être tu', textes.includes('5 bits'), textes.join(' | '));
}
check('SPI : réglage incomplet détecté (aucune ligne de donnée)',
  !reglageComplet({ protocole: 'spi', horloge: 0 }) &&
  reglageComplet({ protocole: 'spi', horloge: 0, donnees: 1 }));
check('SPI : quatre rôles proposés (SCK, MOSI, MISO, CS)',
  rolesDe('spi').map((r) => r.nom).join(',') === 'SCK,MOSI,MISO,CS');

// --- DMX512 -----------------------------------------------------------------------
{
  // 250 kbauds : un bit dure 4 µs = 0,004 ms. Trame = BREAK (≥ 88 µs bas),
  // MAB (haut), puis des octets 8N2 (start 0, 8 bits LSB d'abord, 2 stop à 1).
  const BIT = 0.004;
  const fronts = [];
  let t = 1.0;
  let niveau = 1;
  const palier = (n, bits) => {
    if (n !== niveau) {
      fronts.push([t, n]);
      niveau = n;
    }
    t += bits * BIT;
  };
  palier(1, 10); // repos
  palier(0, 25); // BREAK (100 µs)
  palier(1, 3); // MAB
  const octet = (o) => {
    palier(0, 1); // start bit
    for (let i = 0; i < 8; i++) palier((o >> i) & 1, 1); // LSB d'abord
    palier(1, 2); // deux stop bits
  };
  octet(0x00); // start code « éclairage »
  octet(200); // canal 1
  octet(50); // canal 2
  palier(1, 20); // repos final (ferme les stop bits)

  const voies = [voieDe(0, 'DMX', fronts, 1)];
  const ann = decoder(voies, { protocole: 'dmx', donnees: 0 });
  const textes = ann.map((a) => a.texte);
  check('DMX : le BREAK est repéré (palier bas ≥ 88 µs)', textes.includes('BREAK'), textes.join(' | '));
  check('DMX : le START code ouvre la trame (START code 0x00)', textes.includes('START code 0x00'), textes.join(' | '));
  check('DMX : les deux canaux sont décodés, valeur en hexadécimal (c1=0xC8, c2=0x32)',
    textes.includes('c1=0xC8') && textes.includes('c2=0x32'), textes.join(' | '));
  check('DMX : l\'ordre de la norme — BREAK, MAB, Start, START code, STOP, Start, c1…',
    textes.slice(0, 8).join(' ') === 'BREAK MAB Start START code 0x00 STOP Start c1=0xC8 STOP',
    textes.join(' | '));
  const starts = ann.filter((a) => a.texte === 'Start');
  const stops = ann.filter((a) => a.texte === 'STOP');
  check('DMX : un Start vert d\'UN bit par créneau',
    starts.length === 3 && starts.every((a) => a.nature === 'start' && Math.abs(a.t1 - a.t0 - BIT) < 1e-9),
    starts.map((a) => `${a.nature} ${((a.t1 - a.t0) / BIT).toFixed(2)}`).join(' | '));
  check('DMX : un STOP rouge de DEUX bits par créneau',
    stops.length === 3 && stops.every((a) => a.nature === 'stop' && Math.abs(a.t1 - a.t0 - 2 * BIT) < 1e-9),
    stops.map((a) => `${a.nature} ${((a.t1 - a.t0) / BIT).toFixed(2)}`).join(' | '));
  const mab = ann.find((a) => a.texte === 'MAB');
  check('DMX : le MAB couvre les 3 bits hauts entre BREAK et premier start bit',
    mab?.nature === 'cadre' && Math.abs(mab.t1 - mab.t0 - 3 * BIT) < 1e-9,
    mab ? `${mab.t0}→${mab.t1}` : 'absent');
  check('DMX : aucune erreur sur une trame propre', !ann.some((a) => a.nature === 'erreur'),
    textes.join(' | '));
  check('DMX : pas de PAUSE entre créneaux collés', !textes.includes('PAUSE'), textes.join(' | '));
  check('DMX : un seul rôle de voie', rolesDe('dmx').length === 1);
  const enEn = enAnglais(() => decoder(voies, { protocole: 'dmx', donnees: 0 }).map((a) => a.texte));
  check('DMX : les termes de la norme ne se traduisent pas (Frank, 24/09)',
    enEn.join('|') === textes.join('|'), enEn.join(' | '));
  check('DMX : le décodeur remonte assez loin pour voir le BREAK d\'un univers entier (≥ 23 ms)',
    reculNecessaireMs('dmx') >= 23, String(reculNecessaireMs('dmx')));
}
{
  // PAUSE entre deux créneaux, MBB avant le BREAK suivant, et la numérotation
  // qui repart de c1 dans la nouvelle trame.
  const BIT = 0.004;
  const fronts = [];
  let t = 1.0;
  let niveau = 1;
  const palier = (n, bits) => {
    if (n !== niveau) {
      fronts.push([t, n]);
      niveau = n;
    }
    t += bits * BIT;
  };
  const octet = (o) => {
    palier(0, 1);
    for (let i = 0; i < 8; i++) palier((o >> i) & 1, 1);
    palier(1, 2);
  };
  palier(1, 10);
  palier(0, 25); // BREAK
  palier(1, 3); // MAB
  octet(0x00);
  octet(0x10); // c1
  palier(1, 5); // PAUSE de 5 bits
  octet(0x20); // c2
  palier(1, 7); // MBB
  palier(0, 25); // BREAK suivant
  palier(1, 3);
  octet(0x00);
  octet(0x30); // c1 de la nouvelle trame
  palier(1, 20);

  const ann = decoder([voieDe(0, 'DMX', fronts, 1)], { protocole: 'dmx', donnees: 0 });
  const textes = ann.map((a) => a.texte);
  const pause = ann.find((a) => a.texte === 'PAUSE');
  const mbb = ann.find((a) => a.texte === 'MBB');
  check('DMX : la PAUSE entre deux créneaux est posée sur ses 5 bits',
    pause?.nature === 'cadre' && Math.abs(pause.t1 - pause.t0 - 5 * BIT) < 1e-9,
    pause ? `${((pause.t1 - pause.t0) / BIT).toFixed(2)} bits` : textes.join(' | '));
  check('DMX : le MBB couvre le repos entre le dernier STOP et le BREAK suivant',
    mbb?.nature === 'cadre' && Math.abs(mbb.t1 - mbb.t0 - 7 * BIT) < 1e-9 &&
      textes[textes.indexOf('MBB') + 1] === 'BREAK',
    mbb ? `${((mbb.t1 - mbb.t0) / BIT).toFixed(2)} bits` : textes.join(' | '));
  check('DMX : la numérotation repart de c1 après chaque BREAK',
    textes.includes('c2=0x20') && textes.includes('c1=0x30') && !textes.includes('c3=0x30'),
    textes.join(' | '));
}
{
  // Start code non nul (RDM, test…) : la trame ne porte pas de niveaux de
  // projecteur et ne doit PAS être lue comme un univers.
  const BIT = 0.004;
  const fronts = [];
  let t = 1.0;
  let niveau = 1;
  const palier = (n, bits) => {
    if (n !== niveau) {
      fronts.push([t, n]);
      niveau = n;
    }
    t += bits * BIT;
  };
  palier(1, 10);
  palier(0, 25); // BREAK
  palier(1, 3); // MAB
  const octet = (o) => {
    palier(0, 1);
    for (let i = 0; i < 8; i++) palier((o >> i) & 1, 1);
    palier(1, 2);
  };
  octet(0xcc); // start code RDM
  octet(200); // ne doit PAS ressortir comme un canal
  palier(1, 20);

  const ann = decoder([voieDe(0, 'DMX', fronts, 1)], { protocole: 'dmx', donnees: 0 });
  const textes = ann.map((a) => a.texte);
  check('DMX : start code non nul → annoncé tel quel, aucun canal numéroté',
    ann.some((a) => a.texte === 'START code 0xCC' && a.nature === 'controle') &&
      !textes.some((x) => x.startsWith('c')) && textes.includes('0xC8'),
    textes.join(' | '));
  const enEn = enAnglais(() => decoder([voieDe(0, 'DMX', fronts, 1)], { protocole: 'dmx', donnees: 0 })
    .map((a) => a.texte));
  check('DMX en anglais : « START code 0xCC », BREAK inchangé',
    enEn.includes('START code 0xCC') && enEn.includes('BREAK'), enEn.join(' | '));
}

// --- UART ------------------------------------------------------------------------
/**
 * Fabrique les fronts d'une ligne série. `format` suit la notation Arduino
 * (8N1, 7E1…). Les silences entre caractères sont VOLONTAIREMENT irréguliers :
 * c'est ce qui distingue une ligne série d'un flux DMX, et c'est là que se
 * cassait un décodeur qui compterait les paliers sans se recaler sur le start.
 */
const serieDe = (octets, bauds, bits, parite, stop, silences) => {
  const BIT = 1000 / bauds;
  const fronts = [];
  let t = 1.0;
  let niveau = 1;
  const palier = (n, nb) => {
    if (n !== niveau) {
      fronts.push([t, n]);
      niveau = n;
    }
    t += nb * BIT;
  };
  palier(1, 4); // repos avant le premier caractère
  octets.forEach((o, i) => {
    palier(0, 1); // start bit
    let uns = 0;
    for (let k = 0; k < bits; k++) {
      const b = (o >> k) & 1; // LSB d'abord
      if (b) uns += 1;
      palier(b, 1);
    }
    if (parite !== 'none') {
      const p = parite === 'even' ? uns % 2 : 1 - (uns % 2);
      palier(p, 1);
    }
    palier(1, stop);
    palier(1, silences ? silences[i] ?? 3 : 3); // silence entre caractères
  });
  palier(1, 20);
  return fronts;
};

/**
 * Textes d'un décodage série SANS les Start et STOP qui encadrent chaque
 * caractère (v2026.9.5.140) : les contrôles de valeur restent lisibles.
 */
const valeurs = (ann) => ann.filter((a) => a.nature !== 'start' && a.nature !== 'stop').map((a) => a.texte);

{
  // « Hi » en 8N1 à 9600 bauds, avec un long silence entre les deux caractères.
  const fronts = serieDe([0x48, 0x69], 9600, 8, 'none', 1, [40, 3]);
  const voies = [voieDe(0, 'TX', fronts, 1)];
  const ann = decoder(voies, { protocole: 'uart', donnees: 0, bauds: 9600 });
  const textes = valeurs(ann);
  const B = 1000 / 9600;
  check('UART : chaque caractère = Start vert (1 bit), valeur sur ses 8 bits, STOP rouge (1 bit)',
    ann.map((a) => a.texte).join(' ') === "Start 0x48 'H' STOP Start 0x69 'i' STOP" &&
      ann.filter((a) => a.texte === 'Start').every((a) => a.nature === 'start' && Math.abs(a.t1 - a.t0 - B) < 1e-9) &&
      ann.filter((a) => a.texte === 'STOP').every((a) => a.nature === 'stop' && Math.abs(a.t1 - a.t0 - B) < 1e-9) &&
      Math.abs(ann[1].t1 - ann[1].t0 - 8 * B) < 1e-9,
    ann.map((a) => `${a.texte}/${a.nature}/${((a.t1 - a.t0) / B).toFixed(2)}`).join(' | '));
  check('UART : repli court sur la valeur seule quand le caractère ne tient pas',
    ann[1].court === '0x48', String(ann[1].court));
  check('UART : les deux octets sont décodés malgré un long silence entre eux',
    textes.length === 2 && textes[0].startsWith('0x48') && textes[1].startsWith('0x69'),
    textes.join(' | '));
  check("UART : le caractère imprimable s'affiche à côté de la valeur",
    textes[0] === "0x48 'H'" && textes[1] === "0x69 'i'", textes.join(' | '));
  check('UART : LSB en premier (0x48 lu à l\'envers donnerait 0x12)',
    !textes.some((x) => x.startsWith('0x12')), textes.join(' | '));
  check('UART : un seul rôle de voie, obligatoire',
    rolesDe('uart').length === 1 && rolesDe('uart')[0].obligatoire === true);
  check('UART : sans voie de données le réglage est incomplet',
    !reglageComplet({ protocole: 'uart' }) &&
    reglageComplet({ protocole: 'uart', donnees: 0 }));
}
{
  // La vitesse ne se devine PAS : la même ligne lue à 19200 doit rendre autre
  // chose que les octets attendus. C'est la contre-épreuve du réglage de bauds —
  // sans elle, un décodeur qui ignorerait `bauds` passerait le contrôle ci-dessus.
  const fronts = serieDe([0x48, 0x69], 9600, 8, 'none', 1);
  const voies = [voieDe(0, 'TX', fronts, 1)];
  const faux = valeurs(decoder(voies, { protocole: 'uart', donnees: 0, bauds: 19200 }));
  check('UART : lue au double de sa vitesse, la trame ne rend PAS les bons octets',
    !(faux[0] === "0x48 'H'" && faux[1] === "0x69 'i'"), faux.join(' | '));
}
{
  // 7E1 : sept bits de données et une parité paire. Le même signal lu en 8N1
  // décale tout — le format est un réglage, pas une déduction.
  //
  // C et E sont choisis à dessein : leur parité PAIRE vaut 1. Lus en 8N1 ce bit
  // devient leur bit 7 et les change en 0xC3 / 0xC5. Avec A et B (parité 0) le
  // contrôle passait des deux façons et ne prouvait rien.
  const fronts = serieDe([0x43, 0x45], 9600, 7, 'even', 1);
  const voies = [voieDe(0, 'TX', fronts, 1)];
  const bons = valeurs(decoder(voies, {
    protocole: 'uart', donnees: 0, bauds: 9600, bitsDonnees: 7, parite: 'even', bitsArret: 1,
  }));
  check('UART 7E1 : les deux octets sortent justes, sans erreur de parité',
    bons.length === 2 && bons[0] === "0x43 'C'" && bons[1] === "0x45 'E'", bons.join(' | '));
  const en8n1 = valeurs(decoder(voies, { protocole: 'uart', donnees: 0, bauds: 9600 }));
  check('UART : la même trame lue en 8N1 rend 0xC3/0xC5 (le bit de parité passe en bit 7)',
    en8n1[0] === '0xC3' && en8n1[1] === '0xC5', en8n1.join(' | '));
}
{
  // Parité fausse : on fabrique du 8E1 en posant la parité à l'envers. Le
  // décodeur doit LE DIRE, pas taire l'anomalie ni jeter l'octet.
  const fronts = serieDe([0x41], 9600, 8, 'odd', 1);
  const voies = [voieDe(0, 'TX', fronts, 1)];
  const textes = decoder(voies, {
    protocole: 'uart', donnees: 0, bauds: 9600, bitsDonnees: 8, parite: 'even', bitsArret: 1,
  }).map((a) => a.texte);
  check('UART : une parité fausse est signalée, et l\'octet reste affiché',
    textes.includes('parité') && textes.some((x) => x.startsWith('0x41')),
    textes.join(' | '));
  const enEn = enAnglais(() => decoder(voies, {
    protocole: 'uart', donnees: 0, bauds: 9600, bitsDonnees: 8, parite: 'even', bitsArret: 1,
  }).map((a) => a.texte));
  check('UART en anglais : la parité fausse se dit « parity »',
    enEn.includes('parity') && !enEn.includes('parité'), enEn.join(' | '));
  const B = 1000 / 9600;
  const par = decoder(voies, {
    protocole: 'uart', donnees: 0, bauds: 9600, bitsDonnees: 8, parite: 'even', bitsArret: 1,
  }).find((a) => a.texte === 'parité');
  check('UART : l\'erreur de parité est posée sur le SEUL bit de parité',
    par !== undefined && Math.abs(par.t1 - par.t0 - B) < 1e-9 && Math.abs(par.t0 - (fronts[0][0] + 9 * B)) < 1e-9,
    par ? `${par.t0}→${par.t1}` : 'absente');
}
{
  // Bit d'arrêt à 0 : 0x41 envoyé en 8N1 mais sans rien après (ligne qui
  // retombe aussitôt). Le cadrage prend la place du STOP, l'octet reste lu.
  const B = 1000 / 9600;
  const fronts = [[1.0, 0], [1.0 + B, 1], [1.0 + 2 * B, 0], [1.0 + 7 * B, 1], [1.0 + 8 * B, 0], [1.0 + 12 * B, 1]];
  const ann = decoder([voieDe(0, 'TX', fronts, 1)], { protocole: 'uart', donnees: 0, bauds: 9600 });
  const cadrage = ann.find((a) => a.texte === 'cadrage');
  check('UART : un bit d\'arrêt à 0 → « cadrage » sur le bit d\'arrêt, la valeur reste affichée',
    cadrage?.nature === 'erreur' && Math.abs(cadrage.t0 - (1.0 + 9 * B)) < 1e-9 &&
      ann.some((a) => a.texte === "0x41 'A'") && !ann.some((a) => a.texte === 'STOP'),
    ann.map((a) => `${a.texte}/${a.nature}`).join(' | '));
}

// --- 1-Wire ----------------------------------------------------------------------
/**
 * Fabrique les fronts d'un bus 1-Wire. Tout le monde ne fait que tirer la ligne
 * à la masse : un creux court est un 1, un creux long un 0, un creux de 480 µs
 * un RESET. Les durées sont celles de la fiche du DS18B20.
 */
const oneWireDe = (sequence) => {
  const US = 0.001; // un µs en ms simulées
  const fronts = [];
  let t = 1.0;
  const creux = (dureeUs, reposUs) => {
    fronts.push([t, 0]);
    t += dureeUs * US;
    fronts.push([t, 1]);
    t += reposUs * US;
  };
  t += 50 * US;
  for (const e of sequence) {
    if (e === 'reset') {
      creux(480, 480); // impulsion de reset + fenêtre de présence
      continue;
    }
    for (let k = 0; k < 8; k++) {
      const b = (e >> k) & 1; // LSB d'abord
      if (b) creux(6, 64); // slot « 1 » : creux bref
      else creux(60, 10); // slot « 0 » : creux long
    }
  }
  t += 300 * US;
  return fronts;
};

{
  // La séquence de tout démarrage de DS18B20 : RESET, SKIP ROM (0xCC),
  // CONVERT T (0x44).
  const fronts = oneWireDe(['reset', 0xcc, 0x44]);
  const voies = [voieDe(0, 'DQ', fronts, 1)];
  const textes = decoder(voies, { protocole: 'onewire', donnees: 0 }).map((a) => a.texte);
  check('1-Wire : le RESET est repéré (creux ≥ 480 µs)',
    textes.includes('RESET'), textes.join(' | '));
  check('1-Wire : la commande qui suit le RESET est nommée en clair',
    textes.some((x) => x.includes('SKIP ROM')), textes.join(' | '));
  check('1-Wire : les octets suivants sortent en hexadécimal',
    textes.some((x) => x.startsWith('0x44')), textes.join(' | '));
  check('1-Wire : LSB en premier (0xCC relu à l\'envers donnerait 0x33)',
    !textes.some((x) => x.startsWith('0x33')), textes.join(' | '));
  check('1-Wire : un seul rôle de voie, obligatoire',
    rolesDe('onewire').length === 1 && rolesDe('onewire')[0].obligatoire === true);
  check('1-Wire : sans voie de données le réglage est incomplet',
    !reglageComplet({ protocole: 'onewire' }) &&
    reglageComplet({ protocole: 'onewire', donnees: 0 }));
}
{
  // Un octet resté à moitié envoyé (transaction interrompue) doit être SIGNALÉ,
  // pas fondu dans l'octet suivant : c'est exactement ce qu'on voit quand une
  // pince est posée sur la mauvaise broche.
  const US = 0.001;
  const fronts = [];
  let t = 1.0;
  const creux = (dureeUs, reposUs) => {
    fronts.push([t, 0]);
    t += dureeUs * US;
    fronts.push([t, 1]);
    t += reposUs * US;
  };
  t += 50 * US;
  creux(480, 480); // RESET
  for (let k = 0; k < 3; k++) creux(6, 64); // trois bits seulement
  t += 400 * US; // long silence : la transaction s'arrête là
  const textes = decoder([voieDe(0, 'DQ', fronts, 1)], { protocole: 'onewire', donnees: 0 })
    .map((a) => a.texte);
  check('1-Wire : un octet laissé incomplet est signalé, pas recollé au suivant',
    textes.includes('3 bits'), textes.join(' | '));
}
{
  // Deux décodages sur la même capture, dont un des nouveaux protocoles : c'est
  // le cas d'un montage qui parle en série ET porte une sonde 1-Wire.
  const uart = serieDe([0x4f], 9600, 8, 'none', 1);
  const ow = oneWireDe(['reset', 0xcc]);
  const voies = [voieDe(0, 'TX', uart, 1), voieDe(1, 'DQ', ow, 1)];
  const ann = decoderTous(voies, [
    { protocole: 'uart', donnees: 0, bauds: 9600 },
    { protocole: 'onewire', donnees: 1 },
  ]);
  check('Multi : UART et 1-Wire décodés ensemble, chacun sous SA voie',
    ann.some((a) => a.texte.startsWith('0x4F') && a.voie === 0) &&
    ann.some((a) => a.texte === 'RESET' && a.voie === 1),
    ann.map((a) => `${a.texte}@${a.voie}`).join(' | '));
}

// --- Octets en hexadécimal ou en décimal (v2026.9.5.142) -------------------------
{
  // La séance DS18B20 : RESET, SKIP ROM (0xCC = 204), CONVERT T (0x44 = 68).
  const voies = [voieDe(0, 'DQ', oneWireDe(['reset', 0xcc, 0x44]), 1)];
  const enHex = decoder(voies, { protocole: 'onewire', donnees: 0 }).map((a) => a.texte);
  const enHexExplicite = decoder(voies, { protocole: 'onewire', donnees: 0, base: 'hex' }).map((a) => a.texte);
  const enDec = decoder(voies, { protocole: 'onewire', donnees: 0, base: 'dec' }).map((a) => a.texte);
  check('Base : l\'hexadécimal reste le défaut (réglage absent = « hex »)',
    enHex.join('|') === enHexExplicite.join('|') && enHex.includes('0xCC SKIP ROM'), enHex.join(' | '));
  check('Base : en décimal, 1-Wire écrit 204 SKIP ROM puis 68, sans « 0x »',
    enDec.includes('204 SKIP ROM') && enDec.includes('68') && !enDec.some((x) => x.includes('0x')),
    enDec.join(' | '));
  check('Base : le repère RESET ne change pas avec la base',
    enDec.includes('RESET'), enDec.join(' | '));

  const tx = [voieDe(0, 'TX', serieDe([0x48, 0x07], 9600, 8, 'none', 1), 1)];
  const uartDec = decoder(tx, { protocole: 'uart', donnees: 0, bauds: 9600, base: 'dec' });
  check('Base : en décimal, UART écrit 72 \'H\' et garde le caractère, repli court sur 72',
    valeurs(uartDec)[0] === "72 'H'" && uartDec.find((a) => a.texte === "72 'H'")?.court === '72',
    valeurs(uartDec).join(' | '));
  check('Base : un octet non imprimable en décimal reste un nombre seul (7)',
    valeurs(uartDec)[1] === '7', valeurs(uartDec).join(' | '));

  // Deux décodages de la même capture, chacun avec SA base.
  const deux = decoderTous([voieDe(0, 'TX', serieDe([0x4f], 9600, 8, 'none', 1), 1), voieDe(1, 'DQ', oneWireDe(['reset', 0xcc]), 1)], [
    { protocole: 'uart', donnees: 0, bauds: 9600 },
    { protocole: 'onewire', donnees: 1, base: 'dec' },
  ]);
  check('Base : chaque décodage garde sa propre base (UART en hex, 1-Wire en décimal)',
    deux.some((a) => a.texte === "0x4F 'O'" && a.voie === 0) &&
      deux.some((a) => a.texte === '204 SKIP ROM' && a.voie === 1),
    deux.map((a) => `${a.texte}@${a.voie}`).join(' | '));

  const dec = readFileSync(join(root, 'src', 'webview', 'analyseur-decodage.mts'), 'utf8');
  check('Base : aucun décodeur n\'écrit plus un octet sans passer par la base du réglage',
    (dec.match(/hex2\(/g) ?? []).length === 2, `${(dec.match(/hex2\(/g) ?? []).length} appels de hex2`);
  const js = readFileSync(join(root, 'src', 'webview', 'analyseur.mts'), 'utf8');
  check('Base : le panneau de décodage propose Hexadécimal / Décimal, pour tous les protocoles',
    /labBase\.textContent = t\('Values'\)/.test(js) && /\['dec', t\('Decimal'\)\]/.test(js) &&
      !/if \(d\.protocole === '[a-z0-9]+'\) \{[^}]*labBase/.test(js));
  check('Base : changer de protocole garde la base choisie',
    /const \{ id, base \} = d;[\s\S]{0,200}if \(base\) d\.base = base;/.test(js));
  const fiche = readFileSync(join(root, 'docs', 'fr', 'composants', 'sonde-logique.md'), 'utf8');
  check('Base : la fiche d\'aide explique le choix hexadécimal / décimal',
    /\*\*Valeurs\*\*[^\n]*hexadécimal[^\n]*décimal/i.test(fiche));
}

// --- DHT11 / DHT22 ---------------------------------------------------------------
// LE BANC NE FABRIQUE PAS LE SIGNAL À LA MAIN. Il appelle `buildDht22Schedule`,
// la fonction du MOTEUR qui pilote réellement la broche en simulation : c'est un
// aller-retour moteur → décodeur, le seul contrôle qui ne puisse pas rester vert
// sur deux conventions contraires. Une trame écrite à la main dans le banc
// prouverait que je sais recopier une fiche technique, rien de plus — et le lot
// .99 a montré qu'un contrôle qui ne discrimine pas passe sans qu'on le voie.
const { buildDht22Schedule, dht22Bytes } =
  await buildTo('src/webview/engines/dht22.mts', 'dht22.mjs');

/**
 * Décode et rend les TEXTES, sans faire mourir le banc quand le protocole est
 * inconnu du code sous test. Indispensable à la contre-épreuve : `decoder` avec
 * un protocole absent du `switch` rend `undefined`, et le `.map()` qui suit
 * lève — le banc s'arrêtait alors AVANT d'afficher le moindre échec, et un
 * `grep ❌` comptait zéro. Un banc muet n'est pas un banc vert.
 */
const textesDht = (voies, reglage) => {
  try {
    const ann = decoder(voies, reglage);
    return Array.isArray(ann) ? ann.map((a) => a.texte) : [];
  } catch (e) {
    return [];
  }
};

/**
 * Fronts d'une trame DHT complète : creux de départ du maître, puis la réponse
 * du capteur telle que le moteur la produit. Le moteur horodate en CYCLES ; ici
 * on prend 1 cycle = 1 µs (`cyclesPerUs = 1`) et on convertit en ms simulées.
 */
const dhtDe = (tempC, humidity, model) => {
  const US = 0.001; // un µs en ms simulées
  const fronts = [];
  let t = 1.0;
  // Signal de départ du maître : il tire bas ~1 ms puis relâche.
  fronts.push([t, 0]);
  t += 1000 * US;
  fronts.push([t, 1]);
  t += 30 * US; // le capteur laisse passer un court instant avant de répondre
  const depart = t;
  for (const ev of buildDht22Schedule(tempC, humidity, 0, 1, model)) {
    fronts.push([depart + ev.cycle * US, ev.value ? 1 : 0]);
  }
  t = fronts[fronts.length - 1][0] + 500 * US; // retour au repos
  return fronts;
};

{
  const fronts = dhtDe(23.4, 56.7, 'dht22');
  const textes = textesDht([voieDe(0, 'DATA', fronts, 1)], { protocole: 'dht', donnees: 0 });
  check('DHT : le signal de départ du maître est repéré',
    textes.includes('DÉPART'), textes.join(' | '));
  check('DHT : l\'accusé de réception du capteur est repéré',
    textes.includes('PRÉSENT'), textes.join(' | '));
  // Les cinq octets attendus viennent de l'encodeur du moteur, pas d'une
  // constante recopiée : si l'encodage change, le contrôle suit.
  const attendus = dht22Bytes(23.4, 56.7, 'dht22')
    .map((b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`).join(' ');
  // Les octets sont répartis dans les trois champs (humidité, température,
  // somme) : on les relit dans l'ordre du temps, tous champs confondus.
  const octetsLus = (textes.join(' ').match(/0x[0-9A-F]{2}/g) ?? []).join(' ');
  check('DHT : les cinq octets relus sont EXACTEMENT ceux que le moteur a émis',
    octetsLus === attendus, `attendu ${attendus} · lu ${textes.join(' | ')}`);
  check('DHT : la mesure est rendue en clair (humidité et température)',
    textes.some((x) => x.includes('56,7 %HR') && x.includes('23,4 °C')), textes.join(' | '));
  check('DHT : la somme de contrôle est vérifiée et annoncée bonne',
    textes.some((x) => x.includes('somme ✓')) && !textes.some((x) => x.includes('SOMME ✗')),
    textes.join(' | '));
  check('DHT : le palier de 80 µs de l\'accusé n\'est PAS compté comme un bit',
    // S'il l'était, la trame serait décalée d'un bit : les octets seraient faux
    // et la somme avec. Le contrôle exige donc une trame COMPLÈTE ET juste, pas
    // seulement l'absence d'un message d'erreur — une liste vide passerait.
    octetsLus === attendus && !textes.some((x) => x.includes('/40 bits')),
    textes.join(' | '));

  // Frank (23/09) : « je ne vois pas les valeurs s'afficher ». Les octets et la
  // mesure occupaient le MÊME intervalle, et la vue n'écrit qu'un texte par
  // intervalle : la mesure, venue en second, n'était jamais écrite. Deux
  // annotations détaillées d'une MÊME LIGNE ne doivent donc jamais se
  // chevaucher (v2026.9.5.143 : les octets en ligne 0, les valeurs en ligne 1).
  const ann = decoder([voieDe(0, 'DATA', fronts, 1)], { protocole: 'dht', donnees: 0 });
  const details = ann.filter((a) => !a.resume).sort((a, b) => a.t0 - b.t0);
  const ligneDe = (a) => a.ligne ?? 0;
  const chevauche = details.some((a, i) => details.slice(i + 1).some((b) =>
    ligneDe(a) === ligneDe(b) && b.t0 < a.t1 - 1e-9 && a.t0 < b.t1 - 1e-9));
  check('DHT : aucune annotation détaillée n\'en recouvre une autre sur sa ligne (sinon la seconde n\'est jamais écrite)',
    details.length >= 5 && !chevauche,
    details.map((a) => `L${ligneDe(a)} [${a.t0.toFixed(3)}-${a.t1.toFixed(3)}] ${a.texte}`).join(' | '));

  // Frank (24/09) : « matérialise chaque octet par un trait séparateur vertical
  // et sa valeur en hexa dedans ». Une case PAR OCTET, bord à bord : le bord
  // gauche de chaque case est le séparateur.
  const hexa = (b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`;
  const octetsDht = details.filter((a) => ligneDe(a) === 0 && /^0x[0-9A-F]{2}$/.test(a.texte));
  const octetsMoteur = dht22Bytes(23.4, 56.7, 'dht22');
  check('DHT : cinq cases d\'octet sur la première ligne, une valeur hexadécimale chacune',
    octetsDht.length === 5 && octetsDht.every((a, k) => a.texte === hexa(octetsMoteur[k])),
    octetsDht.map((a) => a.texte).join(' | '));
  check('DHT : les cases d\'octet se touchent (chaque bord est le trait qui sépare deux octets)',
    octetsDht.length === 5 && octetsDht.every((a, k) => k === 0 || Math.abs(octetsDht[k - 1].t1 - a.t0) < 1e-9),
    octetsDht.map((a) => `[${a.t0.toFixed(3)}-${a.t1.toFixed(3)}]`).join(' '));
  // Chaque case commence au creux du premier de ses huit bits.
  const creuxBits = [];
  for (let i = 0; i + 1 < fronts.length; i++) {
    if (fronts[i][1] === 0 && fronts[i + 1][1] === 1) creuxBits.push(fronts[i][0]);
  }
  const debutsBits = creuxBits.slice(2); // départ du maître et accusé écartés
  check('DHT : chaque case d\'octet commence au creux de son 1er bit (bits 0, 8, 16, 24, 32)',
    octetsDht.length === 5 && debutsBits.length >= 40 &&
    octetsDht.every((a, k) => Math.abs(a.t0 - debutsBits[k * 8]) < 1e-9),
    octetsDht.map((a) => a.t0.toFixed(4)).join(' ') + ' ≠ ' + [0, 8, 16, 24, 32].map((k) => debutsBits[k]?.toFixed(4)).join(' '));

  // « Sur une deuxième ligne tu mets la valeur (50 % HR et 22,0 °C et somme
  // avec la coche) » : trois champs sous les octets qu'ils lisent.
  const valeurs = details.filter((a) => ligneDe(a) === 1);
  check('DHT : la deuxième ligne donne humidité, température et somme cochée',
    valeurs.length === 3 &&
    valeurs[0].texte === '56,7 %HR' && valeurs[1].texte === '23,4 °C' &&
    valeurs[2].texte === 'somme ✓' && valeurs[2].court === '✓',
    valeurs.map((a) => `${a.texte} (${a.court ?? ''})`).join(' | '));
  check('DHT : chaque valeur est sous SES octets (humidité 0-1, température 2-3, somme 4)',
    valeurs.length === 3 && octetsDht.length === 5 &&
    Math.abs(valeurs[0].t0 - octetsDht[0].t0) < 1e-9 && Math.abs(valeurs[0].t1 - octetsDht[1].t1) < 1e-9 &&
    Math.abs(valeurs[1].t0 - octetsDht[2].t0) < 1e-9 && Math.abs(valeurs[1].t1 - octetsDht[3].t1) < 1e-9 &&
    Math.abs(valeurs[2].t0 - octetsDht[4].t0) < 1e-9 && Math.abs(valeurs[2].t1 - octetsDht[4].t1) < 1e-9,
    valeurs.map((a) => `[${a.t0.toFixed(3)}-${a.t1.toFixed(3)}] ${a.texte}`).join(' | '));
  check('DHT : la case de somme a la couleur du verdict, les autres celle des données',
    octetsDht.length === 5 && valeurs.length === 3 &&
    octetsDht.slice(0, 4).every((a) => a.nature === 'donnee') &&
    octetsDht[4].nature === 'controle' && valeurs[2].nature === 'controle',
    [...octetsDht, ...valeurs].map((a) => `${a.texte}:${a.nature}`).join(' | '));
  const resumes = ann.filter((a) => a.resume);
  check('DHT : un résumé sur la ligne des valeurs couvre la trame entière et dit la mesure et la somme',
    resumes.length === 1 && octetsDht.length === 5 && ligneDe(resumes[0]) === 1 &&
    Math.abs(resumes[0].t0 - octetsDht[0].t0) < 1e-9 && Math.abs(resumes[0].t1 - octetsDht[4].t1) < 1e-9 &&
    resumes[0].texte === '56,7 %HR · 23,4 °C · somme ✓' && resumes[0].court === '56,7 %HR · 23,4 °C',
    JSON.stringify(resumes));
  // La piste d'une voie décodée en DHT réserve deux lignes ; les autres, une.
  // (try : sur l'ancien code la fonction n'existe pas, le banc doit dire ❌, pas mourir.)
  let lignes = '';
  try {
    lignes = [
      lignesSousVoie([{ protocole: 'dht', donnees: 2 }], 2),
      lignesSousVoie([{ protocole: 'dht', donnees: 2 }], 1),
      lignesSousVoie([{ protocole: 'dht' }], 0),
      lignesSousVoie([{ protocole: 'uart', donnees: 2 }], 2),
    ].join(',');
  } catch (e) { lignes = String(e); }
  check('DHT : deux lignes de décodage sous SA voie, une ailleurs, une si le réglage est incomplet ou un autre protocole',
    lignes === '2,1,1,1', lignes);
  // En anglais : les mêmes champs, point décimal et termes anglais. Le français
  // ne doit pas fuir — c'était le cas quand ces textes étaient écrits en dur.
  const annEn = enAnglais(() => decoder([voieDe(0, 'DATA', fronts, 1)], { protocole: 'dht', donnees: 0 }));
  const textesEn = annEn.map((a) => a.texte);
  const resumeEn = annEn.find((a) => a.resume);
  check('DHT en anglais : départ « REQUEST », accusé « PRESENCE »',
    textesEn.includes('REQUEST') && textesEn.includes('PRESENCE'), textesEn.join(' | '));
  check('DHT en anglais : « 56.7 %RH · 23.4 °C · checksum ✓ », point décimal',
    resumeEn?.texte === '56.7 %RH · 23.4 °C · checksum ✓' && resumeEn?.court === '56.7 %RH · 23.4 °C',
    JSON.stringify(resumeEn));
  check('DHT en anglais : aucun mot français ne reste',
    !textesEn.some((x) => /%HR|somme|SOMME|DÉPART|PRÉSENT|\d,\d/.test(x)), textesEn.join(' | '));
  // L'humidité tient 16 bits, la température 16, la somme 8 : la frontière
  // entre deux champs tombe au début du creux de leur premier bit.
  check('DHT : le champ humidité s\'arrête là où commence le 17e bit',
    valeurs.length === 3 && fronts.some(([t, n]) => n === 0 && Math.abs(t - valeurs[1].t0) < 1e-9) &&
    Math.abs(valeurs[0].t1 - debutsBits[16]) < 1e-9,
    valeurs.length === 3 ? `frontière ${valeurs[1].t0}` : '');
}
{
  // Une température NÉGATIVE : le DHT22 code un bit de signe et une valeur
  // absolue, pas un complément à deux. Le lire en signé donnerait +3276,7 °C —
  // un défaut invisible tant qu'on ne teste que des températures positives.
  const fronts = dhtDe(-12.5, 40.0, 'dht22');
  const textes = textesDht([voieDe(0, 'DATA', fronts, 1)], { protocole: 'dht', donnees: 0 });
  check('DHT22 : une température négative est lue comme telle (bit de signe, pas complément à deux)',
    textes.some((x) => x.includes('-12,5 °C')), textes.join(' | '));
}
{
  // Même trame, même durées, LE MÊME SIGNAL : seul le réglage change. C'est tout
  // l'intérêt de l'avoir sorti en option — rien sur le fil ne distingue les deux
  // capteurs.
  const fronts = dhtDe(22, 55, 'dht11');
  const voies = [voieDe(0, 'DATA', fronts, 1)];
  const enDht11 = textesDht(voies, { protocole: 'dht', donnees: 0, modele: 'dht11' });
  const enDht22 = textesDht(voies, { protocole: 'dht', donnees: 0, modele: 'dht22' });
  // L'humidité reste entière ; la température s'écrit au dixième comme au
  // DHT22 — « 22,0 °C », l'exemple de Frank (24/09).
  check('DHT11 : lu tel quel, humidité entière et température au dixième (55 %HR, 22,0 °C)',
    enDht11.includes('55 %HR') && enDht11.includes('22,0 °C') &&
    enDht11.some((x) => x.includes('55 %HR · 22,0 °C')), enDht11.join(' | '));
  // Exigence des DEUX côtés : le même signal doit rendre une mesure en dht22
  // ET une mesure DIFFÉRENTE. Sans le premier membre, deux listes vides
  // passeraient le contrôle — c'est exactement ce que rend un décodeur absent.
  check('DHT : le réglage du modèle change VRAIMENT la lecture du même signal',
    enDht22.some((x) => x.includes('%HR')) && !enDht22.some((x) => x.includes('55 %HR · 22,0 °C')),
    `dht22 ➜ ${enDht22.join(' | ')}`);
  // Les modèles récents de DHT11 donnent un dixième et un signe (bit 7 de
  // l'octet 3). Trame fabriquée ici : le moteur simulé envoie toujours 0.
  const dht11Brut = (octets) => {
    const US = 0.001;
    const f = [[1.0, 0], [2.0, 1]];
    let t = 2.0 + 30 * US;
    const bas = (d) => { f.push([t, 0]); t += d * US; };
    const haut = (d) => { f.push([t, 1]); t += d * US; };
    bas(80); haut(80);
    for (const o of octets) for (let b = 7; b >= 0; b--) { bas(50); haut(o & (1 << b) ? 70 : 26); }
    bas(50); f.push([t, 1]);
    return f;
  };
  const somme = (o) => (o[0] + o[1] + o[2] + o[3]) & 0xff;
  const avecSomme = (o) => [...o, somme(o)];
  const dixieme = textesDht([voieDe(0, 'DATA', dht11Brut(avecSomme([40, 0, 21, 7])), 1)],
    { protocole: 'dht', donnees: 0, modele: 'dht11' });
  const negatif = textesDht([voieDe(0, 'DATA', dht11Brut(avecSomme([40, 0, 3, 0x85])), 1)],
    { protocole: 'dht', donnees: 0, modele: 'dht11' });
  check('DHT11 : le dixième de l\'octet 3 est lu (21,7 °C) et son bit 7 signe la valeur (-3,5 °C)',
    dixieme.includes('21,7 °C') && negatif.includes('-3,5 °C'),
    `${dixieme.join(' | ')} ⁄ ${negatif.join(' | ')}`);
}
{
  // Une trame coupée en route (câble arraché, pince déplacée) doit être
  // SIGNALÉE, pas rendue avec des octets inventés.
  const complet = dhtDe(20, 50, 'dht22');
  // On garde le départ, l'accusé et une quinzaine de bits, puis plus rien.
  const tronque = complet.slice(0, 40);
  const textes = textesDht([voieDe(0, 'DATA', tronque, 1)], { protocole: 'dht', donnees: 0 });
  check('DHT : une trame coupée en route est signalée, pas complétée au hasard',
    textes.some((x) => /\/40 bits$/.test(x)) && !textes.some((x) => x.includes('%HR')),
    textes.join(' | '));
}
{
  // Une somme de contrôle fausse = une liaison douteuse. C'est CE message qui
  // apprend quelque chose à l'élève, « 0x3F » ne lui dirait rien.
  const fronts = dhtDe(25.0, 60.0, 'dht22');
  // Le dernier octet est la somme : on retourne son bit de poids fort en
  // allongeant le palier HAUT qui le porte. Bit 33 de la trame (0-indexé) —
  // deux fronts par bit, l'accusé en tête.
  const voies = [voieDe(0, 'DATA', fronts, 1)];
  const bon = textesDht(voies, { protocole: 'dht', donnees: 0 });
  check('DHT : point de départ sain avant l\'épreuve de la somme fausse',
    bon.some((x) => x.includes('somme ✓')), bon.join(' | '));
  // Corruption : on allonge le palier du tout dernier bit (il passe de 0 à 1).
  const abimes = fronts.map((p) => [...p]);
  const dernierMontant = abimes.map((p, i) => [p, i]).filter(([p]) => p[1] === 1).slice(-2)[0];
  if (dernierMontant) {
    const i = dernierMontant[1];
    // On repousse le front descendant qui suit, pour rallonger ce palier HAUT.
    for (let k = i + 1; k < abimes.length; k++) {
      if (abimes[k][1] === 0) { abimes[k][0] += 0.05; break; }
    }
  }
  const casse = textesDht([voieDe(0, 'DATA', abimes, 1)], { protocole: 'dht', donnees: 0 });
  check('DHT : une somme de contrôle fausse est dénoncée',
    casse.some((x) => x.includes('SOMME ✗')), casse.join(' | '));
  const casseEn = enAnglais(() => textesDht([voieDe(0, 'DATA', abimes, 1)], { protocole: 'dht', donnees: 0 }));
  check('DHT en anglais : la somme fausse se dit « CHECKSUM ✗ »',
    casseEn.some((x) => x.includes('CHECKSUM ✗')), casseEn.join(' | '));
}
{
  check('DHT : un seul rôle de voie, obligatoire',
    rolesDe('dht').length === 1 && rolesDe('dht')[0].obligatoire === true);
  check('DHT : sans voie de données le réglage est incomplet',
    !reglageComplet({ protocole: 'dht' }) &&
    reglageComplet({ protocole: 'dht', donnees: 0 }));
}
{
  // Le DHT n'est PAS du 1-Wire malgré le fil unique : le bit y est dans le
  // palier HAUT, pas dans le creux. Décoder l'un avec l'autre ne doit pas
  // rendre une mesure par accident — sinon un élève croirait avoir branché le
  // bon décodeur.
  const fronts = dhtDe(23.4, 56.7, 'dht22');
  const enOneWire = decoder([voieDe(0, 'DATA', fronts, 1)], { protocole: 'onewire', donnees: 0 })
    .map((a) => a.texte);
  // Et la réciproque, qui prouve d'où vient le bit : dans une trame DHT TOUS les
  // creux durent 50 µs, seuls les paliers HAUTS varient (28 ou 70 µs). Un
  // décodeur qui lirait le creux ne pourrait rendre que des bits identiques —
  // donc jamais les octets du moteur. Les avoir relus exactement EST la preuve.
  const creux = [];
  for (let i = 0; i + 1 < fronts.length; i++) {
    if (fronts[i][1] === 0 && fronts[i + 1][1] === 1) creux.push(fronts[i + 1][0] - fronts[i][0]);
  }
  const bits = creux.slice(2); // on saute le départ du maître et l'accusé
  check('DHT : le bit est dans le palier HAUT — tous les creux de la trame sont identiques',
    bits.length >= 40 && bits.every((d) => Math.abs(d - bits[0]) < 1e-9),
    `${bits.length} creux, min ${Math.min(...bits)} max ${Math.max(...bits)}`);
  check('DHT lu en 1-Wire : aucune mesure n\'en sort (ce sont deux protocoles différents)',
    !enOneWire.some((x) => x.includes('%HR')), enOneWire.join(' | '));
}

// --- Rendu : géométrie et graduations -------------------------------------------
// Le tracé lui-même se vérifie à l'œil (et par les gestes dans verify:souris) ;
// ici on prouve les CONVERSIONS, parce qu'un réticule décalé de 100 px vient
// toujours d'une marge oubliée dans l'une des deux formules.
{
  const { AnalyseurVue, formatTemps, pasRond, DISPOSITION } =
    await buildTo('src/webview/analyseur-vue.mts', 'vue.mjs');
  const vue = new AnalyseurVue({}); // le canvas ne sert qu'au dessin

  check('temps : unité choisie d\'après l\'ordre de grandeur (s / ms / µs / ns)',
    formatTemps(2500).endsWith(' s') && formatTemps(12).endsWith(' ms')
    && formatTemps(0.004).endsWith(' µs') && formatTemps(0.0000005).endsWith(' ns'),
    [formatTemps(2500), formatTemps(12), formatTemps(0.004), formatTemps(0.0000005)].join(' / '));
  check('temps : un bit DMX (4 µs) s\'affiche en microsecondes, pas en 0,004 ms',
    formatTemps(0.004, 'en') === '4 µs', formatTemps(0.004, 'en'));

  check('graduation : pas arrondi en 1-2-5 × 10ⁿ',
    pasRond(0.0037) === 0.005 && pasRond(0.11) === 0.2 && pasRond(7) === 10 && pasRond(1) === 1,
    [pasRond(0.0037), pasRond(0.11), pasRond(7), pasRond(1)].join(','));
  check('graduation : une durée nulle ou négative ne casse pas le pas',
    pasRond(0) === 1 && pasRond(-3) === 1);

  const L = 800;
  const f = { t0: 10, duree: 5 };
  const plot = L - DISPOSITION.MARGE_G - DISPOSITION.MARGE_D;
  check('géométrie : le bord gauche du tracé est à MARGE_G, le droit à L − MARGE_D',
    vue.xDe(10, f, L) === DISPOSITION.MARGE_G && Math.abs(vue.xDe(15, f, L) - (L - DISPOSITION.MARGE_D)) < 1e-9,
    `${vue.xDe(10, f, L)} / ${vue.xDe(15, f, L)}`);
  check('géométrie : xDe et tDe sont réciproques (réticule posé au bon temps)',
    Math.abs(vue.tDe(vue.xDe(12.345, f, L), f, L) - 12.345) < 1e-9);
  check('géométrie : un temps hors fenêtre sort hors de la zone de tracé',
    vue.xDe(5, f, L) < DISPOSITION.MARGE_G && vue.xDe(20, f, L) > L - DISPOSITION.MARGE_D);
  check('géométrie : largeur de tracé cohérente avec les deux marges', plot === 800 - 104 - 12);

  check('hauteur : une voie de plus = une piste et sa bande d\'annotations de plus',
    vue.hauteurPour(3) - vue.hauteurPour(2) === DISPOSITION.PISTE_H + DISPOSITION.ANNOT_H);
  check('hauteur : zéro voie garde la place d\'une piste (pour y écrire le message)',
    vue.hauteurPour(0) === vue.hauteurPour(1));

  check('pistes : l\'ordonnée retombe sur la bonne voie, -1 au-dessus et en dessous',
    vue.pisteA(DISPOSITION.REGLE_H + 5, 3) === 0
    && vue.pisteA(DISPOSITION.REGLE_H + DISPOSITION.PISTE_H + DISPOSITION.ANNOT_H + 5, 3) === 1
    && vue.pisteA(0, 3) === -1
    && vue.pisteA(10000, 3) === -1);

  // v2026.9.5.143 : une voie décodée en DHT réserve DEUX lignes sous sa courbe.
  // Les pistes n'ont donc plus toutes la même hauteur : la hauteur totale et la
  // piste sous la souris se calculent sur les voies réelles.
  const { PISTE_H, ANNOT_H, REGLE_H } = DISPOSITION;
  const voiesMixtes = [{ voie: 0 }, { voie: 1, lignesDecodage: 2 }, { voie: 2 }];
  let hMixte = NaN, pistesMixtes = '';
  try {
    hMixte = vue.hauteurPour(voiesMixtes);
    const y1 = REGLE_H + PISTE_H + ANNOT_H; // haut de la piste 1
    const y2 = y1 + PISTE_H + 2 * ANNOT_H;  // haut de la piste 2
    pistesMixtes = [y1 - 1, y1 + PISTE_H + ANNOT_H + 5, y2 - 1, y2 + 1]
      .map((y) => vue.pisteA(y, voiesMixtes)).join(',');
  } catch (e) { pistesMixtes = String(e); }
  check('hauteur : une voie DHT ajoute une ligne de décodage (18 px) à sa piste, et à elle seule',
    hMixte === vue.hauteurPour(3) + ANNOT_H, `${hMixte} au lieu de ${vue.hauteurPour(3) + ANNOT_H}`);
  check('pistes : sous une piste à deux lignes, la seconde ligne appartient encore à SA voie, la suivante commence après',
    pistesMixtes === '0,1,1,2', pistesMixtes);
  check('hauteur : des voies sans décodage à deux lignes gardent l\'ancienne hauteur',
    vue.hauteurPour([{ voie: 0 }, { voie: 1 }]) === vue.hauteurPour(2));
}

// --- Déclenchement : c'est la SONDE, pas un bouton (Frank, v2026.9.4.90) ------
// L'analyseur n'a plus de bouton de barre. Poser au moins une pince et lancer la
// simulation ouvre son onglet ; sans pince, rien ne s'ouvre — un onglet vide ne
// dirait rien. On le contrôle sur les SOURCES : l'ancien bouton ne doit plus
// exister nulle part, et `startRun` doit porter la condition « au moins une
// pince ». Un contrôle de rendu ne verrait pas la disparition du bouton.
{
  const html = readFileSync(join(root, 'src', 'webview-html.ts'), 'utf8');
  check('déclenchement : plus aucun bouton `open-analyseur` dans la barre',
    !/open-analyseur/.test(html));

  const sim = readFileSync(join(root, 'src', 'webview', 'sim.mts'), 'utf8');
  check('déclenchement : plus aucun écouteur du bouton `open-analyseur`',
    !/open-analyseur/.test(sim));
  // Broche Arduino nommée par son seul numéro : la voie s'appelle « Pin 9 »
  // (Frank, 23/09). Les broches nommées (A0, GP14) gardent leur nom.
  const nomVoieSim = sim.slice(sim.indexOf('function nomVoie('), sim.indexOf('\n}', sim.indexOf('function nomVoie(')));
  check('nom de voie : une broche Arduino à numéro seul devient « Pin 9 »',
    /if \(v\.pin && \/\^\\d\+\$\/\.test\(v\.pin\)\) return t\('Pin \{0\}', v\.pin\);/.test(nomVoieSim) &&
      nomVoieSim.indexOf('etiquette') < nomVoieSim.indexOf("'Pin {0}'"));
  // La condition vit dans `startRun`, après le repli de la bibliothèque : on
  // vérifie qu'elle compte les voies de pince ET qu'elle ouvre l'onglet.
  // `startRun` est longue (~170 lignes) : on découpe jusqu'à la fonction
  // suivante plutôt que sur un nombre de caractères deviné.
  const debutRun = sim.indexOf('function startRun');
  const run = sim.slice(debutRun, sim.indexOf('\nfunction ', debutRun + 1));
  check('déclenchement : au lancement, ≥1 pince posée ouvre l\'onglet de l\'analyseur',
    /logicProbeVoies\(editor\.diagram\)\.length\s*>\s*0\s*\)\s*\{?\s*ouvrirAnalyseur\(\)/.test(run));
  // Même lancement : le panneau Variables se replie (la place va aux courbes),
  // mais seulement s'il était ouvert, et il est rouvert à l'arrêt (Frank, 24/09).
  check('lancement : l\'analyseur ouvert replie aussi le panneau Variables',
    /ouvrirAnalyseur\(\);[\s\S]{0,400}?if \(foldLibraryOnRun && !inspectorFolded\) \{\s*inspectorFoldedByRun = true;\s*setInspectorFolded\(true, false\);/.test(run));
  check('arrêt : le panneau Variables replié par le lancement est rouvert',
    /if \(inspectorFoldedByRun\) \{\s*inspectorFoldedByRun = false;/.test(sim));
  check('déclenchement : la fonction d\'ouverture déclare aussi les voies à l\'hôte',
    /function ouvrirAnalyseur[\s\S]{0,400}?'openAnalyseur'[\s\S]{0,200}?pousserVoiesLogiques\(\)/.test(sim));
  // Contre-épreuve par le modèle : sans pince, `logicProbeVoies` rend une liste
  // vide, donc la condition ci-dessus est fausse et aucun onglet ne s'ouvre.
  check('déclenchement : aucune pince → aucune voie, donc aucun onglet',
    logicProbeVoies(schema([])).length === 0);
  check('déclenchement : une pince accrochée → une voie, donc l\'onglet s\'ouvre',
    logicProbeVoies(schema([sonde('s1', 0, 'uno1/8')])).length === 1);

  // Branchement par fil : la teinte se déduit du CÂBLAGE, là où les voies
  // viennent d'être résolues. L'attribut `relie` est posé sur l'élément vivant
  // et jamais écrit dans le schéma — un .projix dont on retire le fil doit
  // rouvrir sur une pince grise.
  check('fil au crochet : la résolution des voies repeint aussi les pinces câblées',
    /function pousserVoiesLogiques[\s\S]{0,400}?colorerSondesReliees\(\)/.test(sim));
  const colorer = sim.slice(sim.indexOf('function colorerSondesReliees'),
    sim.indexOf('function colorerSondesReliees') + 900);
  check('fil au crochet : une voie SANS accroche mais AVEC broche = branchée par un fil',
    /!!v\.pin && !v\.accroche/.test(colorer));
  check('fil au crochet : l\'attribut est retiré dès que le fil disparaît',
    /removeAttribute\('relie'\)/.test(colorer));
  check('fil au crochet : `relie` ne part jamais dans le schéma enregistré',
    !/relie/.test(JSON.stringify(partDef('sonde-logique').attrs)));

  // L'aide utilisateur doit dire ce nouveau geste, sinon l'élève cherche un
  // bouton qui n'existe plus.
  const usage = readFileSync(join(root, 'docs', 'fr', 'USAGE.md'), 'utf8');
  check('aide : USAGE.md explique qu\'il n\'y a aucun bouton et que la sonde déclenche',
    /aucun bouton pour l'analyseur logique/i.test(usage) && /sonde/i.test(usage));
  const fiche = readFileSync(join(root, 'docs', 'fr', 'composants', 'sonde-logique.md'), 'utf8');
  check('aide : la fiche de la sonde dit qu\'il n\'y a rien à cliquer',
    /rien à cliquer/i.test(fiche) && /onglet/i.test(fiche));
}

// --- Paramètres PAR COURBE (v2026.9.4.94) --------------------------------------
//
// Trois volets, demandés ensemble : plusieurs décodages de front, les réglages
// d'AFFICHAGE d'une voie (nom, teinte, masquage) et ses SEUILS (sens au repos,
// vitesse, tolérance). Le banc les prend là où ils se prouvent : le décodage et
// la capture pour le fond, les sources pour l'interface.
{
  // Deux bus décodés en même temps : chaque annotation doit porter SA voie de
  // données, sinon la vue les empile toutes sous la dernière piste et les
  // trames des deux bus se mélangent sans rien pour les distinguer.
  const BIT = 0.004;
  const trameDmx = (depart, voie) => {
    const fronts = [];
    let t = depart;
    let niveau = 1;
    const palier = (n, bits) => {
      if (n !== niveau) {
        fronts.push([t, n]);
        niveau = n;
      }
      t += bits * BIT;
    };
    palier(1, 10);
    palier(0, 25); // BREAK
    palier(1, 3); // MAB
    const octet = (o) => {
      palier(0, 1);
      for (let i = 0; i < 8; i++) palier((o >> i) & 1, 1);
      palier(1, 2);
    };
    octet(0); // start code
    octet(200);
    palier(1, 20);
    return {
      voie,
      pin: 'P' + voie,
      nom: 'V' + voie,
      niveauInitial: 1,
      fronts: fronts.map(([tt, n]) => ({ t: tt, niveau: n })),
    };
  };

  const voies = [trameDmx(1.0, 0), trameDmx(1.0, 1)];
  const a0 = decoder(voies, { protocole: 'dmx', donnees: 0 });
  const a1 = decoder(voies, { protocole: 'dmx', donnees: 1 });
  check('par courbe : une annotation porte la voie de DONNÉES de son décodage',
    a0.length > 0 && a0.every((a) => a.voie === 0) && a1.every((a) => a.voie === 1),
    JSON.stringify([a0[0]?.voie, a1[0]?.voie]));

  const tous = appel(decoderTous, voies, [
    { protocole: 'dmx', donnees: 0 },
    { protocole: 'dmx', donnees: 1 },
  ]) ?? [];
  check('par courbe : deux décodages de front rendent les annotations des DEUX voies',
    tous.some((a) => a.voie === 0) && tous.some((a) => a.voie === 1));
  check('par courbe : les annotations de deux décodages sortent triées par le temps',
    tous.every((a, i) => i === 0 || tous[i - 1].t0 <= a.t0));
  check('par courbe : un décodage incomplet est sauté, il ne casse pas les autres',
    (appel(decoderTous, voies, [{ protocole: 'dmx' }, { protocole: 'dmx', donnees: 1 }]) ?? [])
      .every((a) => a.voie === 1));
  check('par courbe : aucun décodage = aucune annotation',
    (appel(decoderTous, voies, []) ?? [-1]).length === 0);

  // Tolérance : à vitesse deux fois trop basse, les paliers ne tombent plus sur
  // un nombre entier de bits. Le décodeur doit le DIRE au lieu d'arrondir en
  // silence — c'est tout l'intérêt d'un seuil réglable par voie.
  const justes = decoder(voies, { protocole: 'dmx', donnees: 0 });
  const faux = decoder(voies, { protocole: 'dmx', donnees: 0, bauds: 166_666 });
  check('par courbe : une vitesse fausse fait apparaître des erreurs de cadrage',
    faux.filter((a) => a.nature === 'erreur').length >
      justes.filter((a) => a.nature === 'erreur').length,
    justes.filter((a) => a.nature === 'erreur').length + ' → ' +
      faux.filter((a) => a.nature === 'erreur').length);
  const fauxEn = enAnglais(() => decoder(voies, { protocole: 'dmx', donnees: 0, bauds: 166_666 })
    .map((a) => a.texte));
  check('par courbe : l\'erreur de cadrage se lit « cadrage » en français, « framing » en anglais',
    faux.some((a) => a.texte === 'cadrage') && fauxEn.includes('framing') && !fauxEn.includes('cadrage'),
    fauxEn.filter((x) => !/^c\d/.test(x)).join(' | '));
  check('par courbe : une tolérance large ravale les mêmes écarts de cadrage',
    decoder(voies, { protocole: 'dmx', donnees: 0, bauds: 166_666, tolerance: 0.9 })
      .filter((a) => a.nature === 'erreur').length <
      faux.filter((a) => a.nature === 'erreur').length);

  // Inversion : elle vit dans la CAPTURE, pas dans les décodeurs — c'est la
  // seule place qui garantit que ce que la vue dessine est ce que le décodeur
  // a lu. On le prouve sur les deux sorties que la vue consomme.
  const cap = new AnalyseurCapture();
  cap.declarerVoies([{ voie: 0, pin: 'GP0', nom: 'SIG' }]);
  cap.verser({ GP0: [1.0, 1, 2.0, 0, 3.0, 1] });
  const avant = cap.niveauA(0, 2.5);
  appel(cap.reglerInversion?.bind(cap), [0]);
  const apres = cap.niveauA(0, 2.5);
  check('par courbe : le niveau au repos inverse ce que rend niveauA',
    avant === 0 && apres === 1, avant + ' → ' + apres);
  const fen = cap.fenetre(0, 0, 4);
  check('par courbe : les fronts de fenetre sortent inversés eux aussi',
    fen.fronts.length === 3 && fen.fronts[1].niveau === 1,
    JSON.stringify(fen.fronts.map((f) => f.niveau)));
  check('par courbe : le niveau qui ENTRE par le bord gauche est inversé de même',
    cap.fenetre(0, 2.5, 4).entrant === 1);
  appel(cap.reglerInversion?.bind(cap), []);
  check('par courbe : remise à l\'endroit, la capture retrouve ses vrais fronts',
    cap.niveauA(0, 2.5) === 0 && appel(cap.estInversee?.bind(cap), 0) !== true);

  // Affichage : nom et teinte effectifs. Vider le nom REVIENT à l'automatique,
  // qui suit la pince quand on la déplace — sans quoi un nom tapé une fois
  // resterait collé à une voie qui n'écoute plus la même broche.
  const v = { voie: 2, nom: 'GP4', pin: 'GP4', probleme: null, analogique: false };
  check('par courbe : sans réglage, la voie garde son nom et sa teinte d\'origine',
    appel(nomVoie, v) === 'GP4' && appel(teinteVoie, v, false) === couleurVoie(2, false));
  check('par courbe : un nom choisi remplace le nom automatique',
    appel(nomVoie, { ...v, nomChoisi: 'SCL' }) === 'SCL');
  check('par courbe : un nom vidé revient au nom automatique',
    appel(nomVoie, { ...v, nomChoisi: '  ' }) === 'GP4');
  // Le choix de la couleur est sorti en .130 (Frank, 23/09 : « ne sert à
  // rien ») : la teinte suit l'indice de voie, même si un vieux .projix porte
  // encore un champ `couleur`.
  check('par courbe : la teinte suit TOUJOURS l\'indice de voie, un ancien choix est ignoré',
    appel(teinteVoie, { ...v, couleur: 5 }, false) === couleurVoie(2, false) &&
      appel(teinteVoie, { ...v, couleur: 5 }, true) === couleurVoie(2, true));

  // Interface : les trois volets doivent être ATTEIGNABLES. Un réglage qu'on ne
  // peut pas ouvrir n'existe pas pour l'élève.
  const page = readFileSync(join(root, 'src', 'analyseur-panel.ts'), 'utf8');
  check('par courbe : le sélecteur de protocole UNIQUE a disparu de la page',
    !/id="proto"/.test(page));
  // Déclenchement et décodage sont passés SUR la piste (boutons « T » et « P »
  // sous le nom de la voie, demande de Frank du 19/09) : plus de ligne de
  // légende ni de barre de décodage en haut. La barre ne garde que ce qui vaut
  // pour TOUTE la capture — la fréquence d'échantillonnage et le cadrage.
  check('par courbe : la barre du haut n\'a plus ni légende ni décodages',
    !/id="decodages"/.test(page) && !/id="ajout-decodage"/.test(page) &&
      !/id="legende"/.test(page));
  check('par courbe : ni sélecteur de déclenchement dans la barre',
    !/id="decl-voie"/.test(page) && !/id="decl-sens"/.test(page));
  check('par courbe : mais la barre porte le choix de la fréquence d\'échantillonnage',
    /id="horloge"/.test(page));

  const js = readFileSync(join(root, 'src', 'webview', 'analyseur.mts'), 'utf8');
  check('par courbe : la page décode TOUS les réglages, pas un seul',
    /decoderTous\(/.test(js) && !/\bdecoder\(tranche/.test(js));
  check('par courbe : les boutons dessinés sur la piste ouvrent les trois menus',
    /vue\.boutonA\(/.test(js) && /menuVoie\(z\)/.test(js) &&
      /menuDeclenchement\(z\)/.test(js) && /menuProtocole\(z\)/.test(js));
  check('par courbe : le panneau porte les cinq réglages d\'affichage et de seuils',
    /r\.nom\s*=/.test(js) && /r\.repos\s*=/.test(js) &&
      /r\.masquee\s*=/.test(js) && /r\.bauds\s*=/.test(js) && /r\.tolerance\s*=/.test(js));
  check('par courbe : plus de choix de couleur dans le panneau de voie (.130)',
    !/r\.couleur\s*=/.test(js) && !/t\('Color'\)/.test(js) && !/\.teintes/.test(page));
  check('par courbe : une voie masquée quitte la liste dessinée',
    /masquee\)/.test(js) && /voiesVisibles/.test(js));
  // Une voie masquée emporte sa piste, donc le bouton qui ouvrait son menu :
  // le retour passe par la barre (Frank, 23/09).
  check('par courbe : la barre porte le bouton de réaffichage des voies masquées',
    /id="reafficher"[^>]*hidden/.test(page) &&
      /Show hidden channels \(\{0\}\)/.test(js) && /r\.masquee = false/.test(js));
  check('par courbe : le bouton de réaffichage se met à jour à chaque rendu',
    /majEtat\(\);\s*majMasquees\(\);/.test(js));
  // Flèches ◀ ▶ et touches ← → : une demi-fenêtre, zoom intact (Frank, 23/09).
  check('par courbe : la barre porte les flèches ◀ ▶',
    /id="gauche"/.test(page) && /id="droite"/.test(page) &&
      /'gauche'\)\?\.addEventListener\('click', \(\) => defiler\(-1\)\)/.test(js) &&
      /'droite'\)\?\.addEventListener\('click', \(\) => defiler\(1\)\)/.test(js));
  check('par courbe : les touches ← → défilent, sauf dans un champ',
    /ArrowLeft/.test(js) && /ArrowRight/.test(js) &&
      /closest\?\.\('input, select, textarea'\)/.test(js));
  check('par courbe : défiler avance d\'une DEMI-fenêtre et coupe le suivi',
    /function defiler\(sens: -1 \| 1\): void \{\s*fenetre = \{ t0: fenetre\.t0 \+ sens \* fenetre\.duree \* 0\.5, duree: fenetre\.duree \};\s*suivi = false;/.test(js));
  check('par courbe : les réglages partent à l\'hôte pour être gravés dans le .projix',
    /decodages,/.test(js) && /voiesReglages: reglagesVoies/.test(js));

  // Compatibilité : un .projix d'avant ce lot porte `decodage` (un seul). Il
  // doit rouvrir avec son réglage, sinon on perd le travail de l'élève.
  check('par courbe : un ancien .projix à décodage unique est relevé en liste',
    /etat\.decodages \?\? \(etat\.decodage \? \[etat\.decodage\] : \[\]\)/.test(js));
  const hote = readFileSync(join(root, 'src', 'panel.ts'), 'utf8');
  check('par courbe : l\'hôte aussi relève l\'ancien champ unique',
    /Array\.isArray\(a\.decodages\)/.test(hote) && /a\.decodage != null/.test(hote));

  const vue = readFileSync(join(root, 'src', 'webview', 'analyseur-vue.mts'), 'utf8');
  check('par courbe : la vue ancre chaque annotation sous la piste de sa voie',
    /a\.voie !== undefined \? rang\.get\(a\.voie\)/.test(vue));
  // Par piste (v2026.9.x), puis par RANGÉE = piste + ligne depuis le DHT
  // (v2026.9.5.143) : les valeurs de la ligne 1 ne sont pas bloquées par les
  // octets de la ligne 0.
  check('par courbe : le suivi du dernier x occupé est PAR rangée (piste et ligne), plus global',
    /occupe = new Map/.test(vue) && /occupe\.set\(cle/.test(vue) &&
    /const cle = rangee\(piste, ligne\)/.test(vue));

  check('par courbe : les boutons de voie sont DESSINÉS, pas posés en HTML',
    /boutonA\(/.test(vue) && /zoneDe\(/.test(vue) && /zones: ZoneBouton\[\]/.test(vue));
}

// --- Fréquence d'échantillonnage ---------------------------------------------
//
// Kablix date ses fronts au CYCLE du processeur : il sait exactement quand
// chaque broche a basculé, là où un vrai analyseur ne regarde ses entrées qu'à
// intervalle fixe. Le réglage de la barre du haut reproduit cette limite — deux
// fronts trop rapprochés se confondent, une impulsion plus brève qu'un
// échantillon disparaît. C'est ainsi que l'élève découvre pourquoi son
// analyseur du commerce doit échantillonner bien plus vite que le signal.
{
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 0, pin: 'GP0', nom: 'SIG' }]);
  // Une impulsion de 100 ns (0,0001 ms) : brève, mais bien réelle.
  c.verser({ GP0: [1.0, 1, 1.0001, 0, 2.0, 1] });

  check('échantillonnage : illimité, la capture rend TOUS ses fronts',
    c.fenetre(0, 0, 3).fronts.length === 3,
    String(c.fenetre(0, 0, 3).fronts.length));

  // 1 MHz = un échantillon par microseconde (0,001 ms). L'impulsion de 100 ns
  // tombe entre deux tics : l'instrument ne la voit jamais.
  c.reglerEchantillonnage(1_000_000);
  const a1 = c.fenetre(0, 0, 3).fronts;
  check('échantillonnage : à 1 MHz, l\'impulsion de 100 ns disparaît',
    a1.length === 1 && a1[0].niveau === 1,
    JSON.stringify(a1));

  // 100 MHz = un échantillon toutes les 10 ns : l'impulsion est dix fois plus
  // longue qu'un échantillon, l'instrument la voit.
  c.reglerEchantillonnage(100_000_000);
  check('échantillonnage : à 100 MHz, la même impulsion est bien vue',
    c.fenetre(0, 0, 3).fronts.length === 3,
    String(c.fenetre(0, 0, 3).fronts.length));

  // Le réglage s'applique EN SORTIE : la capture garde tous ses fronts, et
  // revenir en illimité les retrouve sans rien recapturer.
  c.reglerEchantillonnage(0);
  check('échantillonnage : revenir en illimité retrouve les fronts d\'origine',
    c.fenetre(0, 0, 3).fronts.length === 3);

  // Un front est rendu à l'instant du TIC qui le lit, pas à son instant vrai :
  // c'est ce décalage qui fait la « gigue » d'un analyseur réel.
  const d = new AnalyseurCapture();
  d.declarerVoies([{ voie: 0, pin: 'GP0', nom: 'SIG' }]);
  d.verser({ GP0: [1.0004, 1] });
  d.reglerEchantillonnage(1_000_000);
  const cale = d.fenetre(0, 0, 3).fronts;
  check('échantillonnage : le front est daté au tic qui le lit, pas avant',
    cale.length === 1 && Math.abs(cale[0].t - 1.001) < 1e-9,
    JSON.stringify(cale));
}
{
  // Le déclenchement se pose sur la courbe ÉCHANTILLONNÉE, pas sur les fronts
  // bruts : sonde-logique-uno (enregistrée à 1 kHz, Frank 24/09) montrait son
  // premier front descendant 2 ms après le trait rouge. À 1 kHz : la brève
  // impulsion 0,3 → 0,5 ms disparaît, la montée 1,7 est lue au tic 2, la
  // descente 2,2 au tic 3. Le déclenchement « descendant » doit tomber à 3.
  const brut = [0.3, 1, 0.5, 0, 1.7, 1, 2.2, 0, 3.6, 1];
  const c = new AnalyseurCapture();
  c.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }, { voie: 1, pin: '9', nom: 'AUX' }]);
  c.reglerEchantillonnage(1000);
  c.reglerDeclenchement({ voie: 0, sens: 'falling' });
  c.verser({ 8: brut });
  const vus = c.fenetre(0, 0, 5).fronts.map((f) => f.t);
  check('déclenchement échantillonné : posé sur un front AFFICHÉ (tic 3), pas le brut (0,5)',
    c.tTrigger === 3 && vus.includes(3), `${c.tTrigger} / ${JSON.stringify(vus)}`);
  // Changer la lecture recale l'origine : revenir en illimité la ramène au brut.
  c.reglerEchantillonnage(0);
  check('déclenchement échantillonné : repasser en illimité le recale sur le front brut',
    c.tTrigger === 0.5, String(c.tTrigger));
  // Inverser la voie du déclenchement : le « descendant » affiché est l'ancienne montée.
  c.reglerInversion([0]);
  check('déclenchement : inverser sa voie le recale sur la descente AFFICHÉE',
    c.tTrigger === 0.3, String(c.tTrigger));

  // Voie de déclenchement qui ne bouge qu'une fois : sa lecture tombe au tic
  // suivant, quand le temps n'avance plus QUE sur les autres voies.
  const e = new AnalyseurCapture();
  e.declarerVoies([{ voie: 0, pin: '8', nom: 'CLK' }, { voie: 1, pin: '9', nom: 'TRIG' }]);
  e.reglerEchantillonnage(1000);
  e.reglerDeclenchement({ voie: 1, sens: 'rising' });
  e.verser({ 9: [4.5, 1] });
  e.verser({ 8: [5.2, 1, 6.2, 0] });
  check('déclenchement échantillonné : une voie à front unique est relue quand le temps avance',
    e.tTrigger === 5, String(e.tTrigger));
}


// --- La ligne série porte enfin des fronts ------------------------------------
//
// Le défaut : dans les DEUX émulateurs, l'UART matériel ne pilote pas sa broche
// TX. L'octet écrit dans le registre de données part droit au consommateur
// (moniteur série, décodeur DMX) et le port ne bouge pas d'un cheveu. Or les
// fronts de l'analyseur naissent dans `samplePulses`, appelé UNIQUEMENT par les
// écouteurs de changement de broche : pas de mouvement, pas d'écouteur, pas un
// seul front. Sur `dmx-pico`, le projecteur changeait sagement de couleur
// pendant que la sonde posée sur GP0 montrait une ligne parfaitement plate.
{
  // Module ABSENT = échec nommé, jamais une exception. Sans ce filet, la
  // contre-épreuve au `git stash` (qui emporte le fichier, non suivi avant ce
  // lot) faisait mourir esbuild et le banc n'imprimait pas un seul ❌ : un banc
  // muet serait alors passé pour un banc vert.
  let fronts_ = {};
  try {
    fronts_ = await buildTo('src/webview/engines/uart-fronts.mts', 'uart-fronts.mjs');
  } catch (e) {
    check('série : le calcul des fronts de la ligne série existe', false, String(e).split('\n')[0]);
  }
  const { frontsDeTrame, dureeTrameUs, frontsDeBreak } = fronts_;

  // Un octet à 250 kbauds, 8N2 : 4 µs le temps-bit. 0x55 = 01010101, poids
  // faible d'abord, donc la ligne bascule à CHAQUE bit — le cas le plus bavard.
  const t55 = { value: 0x55, baudRate: 250_000, dataBits: 8, stopBits: 2, parity: 'none' };
  const f55 = appel(frontsDeTrame, t55) ?? [];
  check('série : la trame démarre par un front DESCENDANT à t=0 (bit de départ)',
    f55[0] === 0 && f55[1] === 0, JSON.stringify(f55.slice(0, 4)));
  check('série : 0x55 à 250 kbauds fait basculer la ligne à chaque temps-bit',
    f55.length === 20 && f55[2] === 4 && f55[3] === 1 && f55[4] === 8 && f55[5] === 0,
    JSON.stringify(f55));
  check('série : la trame se termine au REPOS, ligne haute',
    f55[f55.length - 1] === 1, JSON.stringify(f55.slice(-4)));
  check('série : 8N2 à 250 kbauds dure 11 temps-bit, soit 44 µs',
    appel(dureeTrameUs, t55) === 44, String(appel(dureeTrameUs, t55)));

  // 0x00 : huit bits bas collés au bit de départ. Un analyseur ne voit alors
  // qu'UN front descendant puis UN remontant — pas dix.
  const f00 = appel(frontsDeTrame, { ...t55, value: 0x00 }) ?? [];
  check('série : des bits identiques ne font qu\'un seul front (0x00 = 2 fronts)',
    f00.length === 4 && f00[0] === 0 && f00[1] === 0 && f00[2] === 36 && f00[3] === 1,
    JSON.stringify(f00));
  // 0xFF : les huit bits sont hauts, seul le bit de départ se voit.
  const fff = appel(frontsDeTrame, { ...t55, value: 0xff }) ?? [];
  check('série : 0xFF ne creuse que son bit de départ',
    fff.length === 4 && fff[2] === 4 && fff[3] === 1, JSON.stringify(fff));

  // Parité : 0x03 porte deux uns. En parité PAIRE le bit vaut 0, en IMPAIRE 1.
  const paire = appel(frontsDeTrame, { value: 0x03, baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'even' }) ?? [];
  const impaire = appel(frontsDeTrame, { value: 0x03, baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'odd' }) ?? [];
  // Comparaison en TEMPS-BIT et non en microsecondes : 1 000 000 / 9600 ne
  // tombe pas juste en binaire, une égalité stricte sur des µs mentirait.
  const bits9600 = (t) => appel(dureeTrameUs, t) / (1_000_000 / 9600);
  const sansParite = { value: 0, baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' };
  check('série : la parité ajoute un temps-bit à la trame',
    Math.round(bits9600(sansParite)) === 10 &&
      Math.round(bits9600({ ...sansParite, parity: 'even' })) === 11,
    `${bits9600(sansParite)} puis ${bits9600({ ...sansParite, parity: 'even' })}`);
  check('série : parité paire et impaire ne donnent PAS les mêmes fronts',
    JSON.stringify(paire) !== JSON.stringify(impaire),
    `${JSON.stringify(paire)} vs ${JSON.stringify(impaire)}`);

  // BREAK : la ligne est tenue basse plus longtemps qu'une trame entière. C'est
  // le début de trame du DMX512, qui impose au moins 88 µs de bas.
  const brk = appel(frontsDeBreak, 250_000) ?? {};
  check('série : le BREAK descend à t=0 et remonte après au moins 88 µs',
    brk.fronts?.[0] === 0 && brk.fronts?.[1] === 0 && brk.fronts?.[2] >= 88 && brk.fronts?.[3] === 1,
    JSON.stringify(brk));
  check('série : le BREAK réserve la marque qui le suit (au moins 8 µs)',
    brk.dureeUs >= brk.fronts?.[2] + 8, JSON.stringify(brk));

  // Le moteur Pico : les deux rappels branchés, la table des broches TX, et le
  // chaînage. Sans chaînage, les 513 octets d'une trame DMX — tous écrits dans
  // le registre en quelques cycles simulés — se superposeraient au même instant.
  const pico = readFileSync(join(root, 'src', 'webview', 'engines', 'pico.mts'), 'utf8');
  check('série (Pico) : les deux rappels de l\'UART sont branchés sur les deux UART',
    /onTxFrame = /.test(pico) && /onTxBreak = /.test(pico) && /for \(const uart of \[0, 1\]\)/.test(pico));
  check('série (Pico) : la table des broches TX couvre les six sorties possibles',
    /GP0: 0/.test(pico) && /GP12: 0/.test(pico) && /GP16: 0/.test(pico) &&
      /GP4: 1/.test(pico) && /GP8: 1/.test(pico) && /GP20: 1/.test(pico));
  check('série (Pico) : poser une sonde sur une broche TX arme la synthèse',
    /uartTxSondee\[uart\] \?\?= \[\]/.test(pico) && /setLogicProbes/.test(pico));
  check('série (Pico) : chaque trame est datée à la SUITE de la précédente',
    /Math\.max\(maintenant, this\.uartFinTrameUs\.get\(pin\)/.test(pico));

  // Le moteur AVR : même synthèse, greffée sur `onByteTransmit` (avr8js expose
  // déjà baudRate/bitsPerChar/stopBits/parity — aucun correctif npm requis).
  const avr = readFileSync(join(root, 'src', 'webview', 'engines', 'avr.mts'), 'utf8');
  check('série (AVR) : Serial verse sa trame avant de router l\'octet',
    /this\.verserTrameSerie\(0, this\.usart, b\)/.test(avr));
  check('série (AVR) : Serial1\/2\/3 du Mega la versent aussi',
    /this\.verserTrameSerie\(i \+ 1, u, b\)/.test(avr));
  check('série (AVR) : la trame reprend la forme déclarée par le périphérique',
    /baudRate: u\.baudRate/.test(avr) && /dataBits: u\.bitsPerChar/.test(avr) &&
      /stopBits: u\.stopBits/.test(avr) && /u\.parityEnabled/.test(avr));
  check('série (AVR) : la table des broches TX est partagée avec le DMX',
    /brochesTx\(\)/.test(avr) && /const TX = this\.brochesTx\(\)/.test(avr));
  check('série (AVR) : le chaînage évite l\'empilement au même instant',
    /Math\.max\(maintenant, this\.uartFinTrameUs\.get\(pin\)/.test(avr));

  // ALLER-RETOUR : ce que le MOTEUR synthétise, le DÉCODEUR doit le relire.
  // Les deux morceaux vivent dans deux fichiers sans rien en commun, et rien
  // n'obligeait le décodeur UART à retenir la même convention de bits que la
  // synthèse (LSB d'abord, parité paire = 0 sur un nombre pair de uns). Chacun
  // testé isolément resterait vert sur deux conventions contraires ; c'est ce
  // contrôle-ci qui les met d'accord, sur du 8N1 ET sur du 8E1.
  const relire = (octets, forme) => {
    const us = 0.001; // un µs en ms simulées
    const paires = [];
    let base = 1.0;
    for (const v of octets) {
      const bruts = appel(frontsDeTrame, { value: v, ...forme }) ?? [];
      for (let i = 0; i < bruts.length; i += 2) {
        paires.push([base + bruts[i] * us, bruts[i + 1]]);
      }
      base += (appel(dureeTrameUs, { value: v, ...forme }) ?? 0) * us + 0.5;
    }
    return valeurs(decoder([voieDe(0, 'TX', paires, 1)], {
      protocole: 'uart',
      donnees: 0,
      bauds: forme.baudRate,
      bitsDonnees: forme.dataBits,
      parite: forme.parity,
      bitsArret: forme.stopBits,
    }));
  };
  const ar8n1 = relire([0x4b, 0x6f], { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
  check('aller-retour : les trames synthétisées par le moteur se relisent en 8N1',
    ar8n1.length === 2 && ar8n1[0] === "0x4B 'K'" && ar8n1[1] === "0x6F 'o'",
    ar8n1.join(' | '));
  const ar8e1 = relire([0x4b, 0x6f], { baudRate: 19_200, dataBits: 8, stopBits: 1, parity: 'even' });
  check('aller-retour : idem en 8E1 à 19200, sans erreur de parité',
    ar8e1.length === 2 && ar8e1[0] === "0x4B 'K'" && ar8e1[1] === "0x6F 'o'",
    ar8e1.join(' | '));
}

console.log(failures === 0 ? '\nTout est vert.' : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
