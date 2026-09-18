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
    entryPoints: [join(root, entry)],
    outfile: join(tmp, outfile),
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.svg': 'text', '.webp': 'dataurl' },
    logLevel: 'silent',
  });
  return import(pathToFileURL(join(tmp, outfile)).href);
};

const { logicProbeVoies, pulseMonitorPins } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
const { partDef, partCategory } = await buildTo('src/webview/diagram/catalog.mts', 'catalog.mjs');
const { AnalyseurCapture, VOIES_MAX } = await buildTo('src/webview/analyseur-capture.mts', 'capture.mjs');
const { decoder, decoderTous, reglageComplet, rolesDe } = await buildTo('src/webview/analyseur-decodage.mts', 'decodage.mjs');
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
  // Les PISTES de l'onglet viennent normalement du message `voies` que pousse
  // l'atelier. À la réouverture d'un projet sans relancer la simulation, rien ne
  // l'a poussé : l'onglet affichait « aucune sonde » par-dessus des milliers de
  // fronts bien présents. La capture restaurée est autoportante — chaque voie y
  // porte son numéro, sa broche et son nom —, et c'est d'elle que `restaurer()`
  // dresse les pistes tant que rien d'autre ne l'a fait.
  const src = readFileSync(join(root, 'src', 'webview', 'analyseur.mts'), 'utf8');
  const bloc = src.slice(src.indexOf('function restaurer'), src.indexOf('function restaurer') + 1400);
  check('réouverture : restaurer() dresse les pistes quand la liste est vide',
    /diagnostics\.length === 0 && etat\.voies\.length > 0/.test(bloc) &&
      /diagnostics = etat\.voies\.map/.test(bloc));
  check('réouverture : et le sélecteur de déclenchement est regarni avec elles',
    /remplirVoies\(selDeclVoie/.test(bloc));
  // Le message `voies`, quand il arrive, doit reprendre la main sans condition :
  // c'est lui qui porte les DIAGNOSTICS de câblage, que la capture ignore.
  const surVoies = src.slice(src.indexOf("case 'voies'"), src.indexOf("case 'voies'") + 700);
  check('réouverture : le message `voies` de l\'atelier reprend la main',
    /diagnostics = msg\.voies\.map/.test(surVoies) && !/diagnostics\.length === 0/.test(surVoies));

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
  check('I²C : adresse 0x27 en écriture (0x4E sur le fil = adresse décalée + R/W)',
    textes.includes('adr 0x27 W'), textes.join(' | '));
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
  check('DMX : start code 0 accepté', textes.includes('start 0'), textes.join(' | '));
  check('DMX : les deux canaux sont décodés (c1=200, c2=50)',
    textes.includes('c1=200') && textes.includes('c2=50'), textes.join(' | '));
  check('DMX : un seul rôle de voie', rolesDe('dmx').length === 1);
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

  const textes = decoder([voieDe(0, 'DMX', fronts, 1)], { protocole: 'dmx', donnees: 0 })
    .map((a) => a.texte);
  check('DMX : start code non nul → trame ignorée, aucun canal publié',
    textes.some((x) => x.includes('ignoré')) && !textes.some((x) => x.startsWith('c')),
    textes.join(' | '));
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

{
  // « Hi » en 8N1 à 9600 bauds, avec un long silence entre les deux caractères.
  const fronts = serieDe([0x48, 0x69], 9600, 8, 'none', 1, [40, 3]);
  const voies = [voieDe(0, 'TX', fronts, 1)];
  const textes = decoder(voies, { protocole: 'uart', donnees: 0, bauds: 9600 })
    .map((a) => a.texte);
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
  const faux = decoder(voies, { protocole: 'uart', donnees: 0, bauds: 19200 })
    .map((a) => a.texte);
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
  const bons = decoder(voies, {
    protocole: 'uart', donnees: 0, bauds: 9600, bitsDonnees: 7, parite: 'even', bitsArret: 1,
  }).map((a) => a.texte);
  check('UART 7E1 : les deux octets sortent justes, sans erreur de parité',
    bons.length === 2 && bons[0] === "0x43 'C'" && bons[1] === "0x45 'E'", bons.join(' | '));
  const en8n1 = decoder(voies, { protocole: 'uart', donnees: 0, bauds: 9600 })
    .map((a) => a.texte);
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
  // La condition vit dans `startRun`, après le repli de la bibliothèque : on
  // vérifie qu'elle compte les voies de pince ET qu'elle ouvre l'onglet.
  // `startRun` est longue (~170 lignes) : on découpe jusqu'à la fonction
  // suivante plutôt que sur un nombre de caractères deviné.
  const debutRun = sim.indexOf('function startRun');
  const run = sim.slice(debutRun, sim.indexOf('\nfunction ', debutRun + 1));
  check('déclenchement : au lancement, ≥1 pince posée ouvre l\'onglet de l\'analyseur',
    /logicProbeVoies\(editor\.diagram\)\.length\s*>\s*0\s*\)\s*ouvrirAnalyseur\(\)/.test(run));
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
  check('par courbe : une teinte choisie remplace celle de l\'indice de voie',
    appel(teinteVoie, { ...v, couleur: 5 }, false) === couleurVoie(5, false) &&
      appel(teinteVoie, { ...v, couleur: 5 }, true) === couleurVoie(5, true));

  // Interface : les trois volets doivent être ATTEIGNABLES. Un réglage qu'on ne
  // peut pas ouvrir n'existe pas pour l'élève.
  const page = readFileSync(join(root, 'src', 'analyseur-panel.ts'), 'utf8');
  check('par courbe : le sélecteur de protocole UNIQUE a disparu de la page',
    !/id="proto"/.test(page));
  check('par courbe : la page porte la zone des décodages et son bouton d\'ajout',
    /id="decodages"/.test(page) && /id="ajout-decodage"/.test(page));

  const js = readFileSync(join(root, 'src', 'webview', 'analyseur.mts'), 'utf8');
  check('par courbe : la page décode TOUS les réglages, pas un seul',
    /decoderTous\(/.test(js) && !/\bdecoder\(tranche/.test(js));
  check('par courbe : la pastille de la légende ouvre les réglages de la voie',
    /voieReglee/.test(js) && /panneauReglages/.test(js));
  check('par courbe : le panneau porte les quatre réglages d\'affichage et de seuils',
    /r\.nom\s*=/.test(js) && /r\.couleur\s*=/.test(js) && /r\.repos\s*=/.test(js) &&
      /r\.masquee\s*=/.test(js) && /r\.bauds\s*=/.test(js) && /r\.tolerance\s*=/.test(js));
  check('par courbe : une voie masquée quitte la liste dessinée',
    /masquee\)/.test(js) && /voiesVisibles/.test(js));
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
  check('par courbe : le suivi du dernier x occupé est PAR piste, plus global',
    /occupe = new Map/.test(vue) && /occupe\.set\(piste/.test(vue));
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
  const relire = (valeurs, forme) => {
    const us = 0.001; // un µs en ms simulées
    const paires = [];
    let base = 1.0;
    for (const v of valeurs) {
      const bruts = appel(frontsDeTrame, { value: v, ...forme }) ?? [];
      for (let i = 0; i < bruts.length; i += 2) {
        paires.push([base + bruts[i] * us, bruts[i + 1]]);
      }
      base += (appel(dureeTrameUs, { value: v, ...forme }) ?? 0) * us + 0.5;
    }
    return decoder([voieDe(0, 'TX', paires, 1)], {
      protocole: 'uart',
      donnees: 0,
      bauds: forme.baudRate,
      bitsDonnees: forme.dataBits,
      parite: forme.parity,
      bitsArret: forme.stopBits,
    }).map((a) => a.texte);
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
