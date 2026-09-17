// Vérifie le générateur BF (kablix-gbf, kind 'analog-source') :
//  - la forme d'onde elle-même (gbfWaveform / evalAnalogWave) : sinus, triangle
//    et carré, l'action du rapport cyclique sur le carré ET sur le triangle,
//    l'écrêtage à la plage de l'entrée analogique, le temps SIMULÉ ;
//  - catalogue : rangé dans Appareils de mesure, cinq propriétés bornées ;
//  - netlist : Vs résolu sur l'entrée analogique reliée (analogSourceBindings) ;
//  - rendu réel en Chrome headless : dessin de Frank, quatre boutons rotatifs,
//    afficheurs, curseur de forme à trois crans, inertie hors simulation ;
//  - GESTES À VRAIE SOURIS (CDP) : tourner un bouton et glisser le curseur de
//    forme. Voir le commentaire du bloc, plus bas : c'est le cœur du banc.
import esbuild from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-gbf-'));
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
const { gbfWaveform, evalAnalogWave } = await buildTo('src/webview/engines/analog-waves.mts', 'waves.mjs');
const { partDef, partCategory, CATEGORY_ORDER } = await buildTo('src/webview/diagram/catalog.mts', 'catalog.mjs');
const { analogSourceBindings, meterReadings, scopeGbfSources, scopeProbePins, gbfBoardStress, maxPinVolts } =
  await buildTo('src/webview/diagram/model.mts', 'model.mjs');

let failures = 0;
const check = (label, ok, detail) => {
  // `detail` n'est imprimé qu'en cas d'échec : il porte la valeur MESURÉE, sans
  // quoi un ❌ oblige à rouvrir le banc pour savoir ce qui est sorti.
  console.log(`${ok ? '✅' : '❌'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) <= eps;

// --- Catalogue -----------------------------------------------------------------
const def = partDef('gbf');
check('catalogue : gbf = kablix-gbf, kind analog-source sur Vs',
  def.tag === 'kablix-gbf' && def.kind === 'analog-source' && def.analogPin === 'Vs');
// Un GBF est un APPAREIL de la salle de TP, pas un capteur : son `kind` le
// rangerait avec les photorésistances sans la règle par type de partCategory.
check('catalogue : rangé dans Appareils de mesure (pas avec les capteurs)',
  partCategory(def) === 'Instruments' && CATEGORY_ORDER.includes('Instruments'));
check('catalogue : réglable à la souris en simulation (simControl)', def.simControl === true);
const prop = (attr) => def.props?.find((p) => p.attr === attr);
check('catalogue : fréquence 1 Hz .. 1 MHz au Hz près',
  prop('frequency')?.min === 1 && prop('frequency')?.max === 1_000_000 && prop('frequency')?.step === 1);
check('catalogue : amplitude 0 .. 10 V au dixième',
  prop('amplitude')?.min === 0 && prop('amplitude')?.max === 10 && near(prop('amplitude')?.step, 0.1));
check('catalogue : décalage -5 .. +5 V au dixième',
  prop('offset')?.min === -5 && prop('offset')?.max === 5 && near(prop('offset')?.step, 0.1));
check('catalogue : rapport cyclique 0 .. 100 % au pourcent',
  prop('duty')?.min === 0 && prop('duty')?.max === 100 && prop('duty')?.step === 1);
check('catalogue : trois formes proposées (sinus, triangle, carré)',
  ['sinus', 'triangle', 'carre'].every((f) => prop('waveform')?.options?.includes(f)));
// Défauts d'un VRAI GBF sorti de son carton (Frank, .93) : signal CENTRÉ sur la
// masse et rapport cyclique symétrique. Le décalage valait 2,5 V, ce qui faisait
// tenir le sinus dans la plage d'un ADC Arduino — commode, mais ce n'est pas un
// générateur qu'on trouve sur une paillasse.
check(`catalogue : décalage nul par défaut — ${def.attrs?.offset} V`,
  Number(def.attrs?.offset) === 0);
check(`catalogue : rapport cyclique à 50 % par défaut — ${def.attrs?.duty} %`,
  Number(def.attrs?.duty) === 50);

// --- Aide locale (bouton d'aide de l'inspecteur → docs/fr/composants/gbf.md) ----
const helpMd = join(root, 'docs', 'fr', 'composants', 'gbf.md');
check('aide : fiche docs/fr/composants/gbf.md présente', existsSync(helpMd));
if (existsSync(helpMd)) {
  const md = readFileSync(helpMd, 'utf8');
  const refs = [...md.matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map((m) => decodeURIComponent(m[1]));
  const missing = refs.filter((r) => !existsSync(join(root, 'docs', 'fr', 'composants', r)));
  check(`aide : images et liens relatifs valides (${refs.length} réf.)${missing.length ? ` — manquant : ${missing.join(', ')}` : ''}`,
    refs.length > 0 && missing.length === 0);
  // Ce que la fiche doit dire : les bornes, les quatre plages, la déformation du
  // triangle par le rapport cyclique, et l'écrêtage — le piège n°1 de l'élève.
  check('aide : bornes, plages, déformation du triangle et écrêtage documentés',
    /\*\*Vs\*\*/.test(md) && /\*\*GND\*\*/.test(md) &&
    /1\s*MHz/.test(md) && /10\s*V/.test(md) && /triangle/i.test(md) &&
    /rapport cyclique/i.test(md) && /écrêt/i.test(md));
}

// --- Forme d'onde --------------------------------------------------------------
// Sinus : passages par zéro et extrema aux quarts de période.
check('sinus : 0 à t=0, +1 au quart, 0 à la moitié, -1 aux trois quarts',
  near(gbfWaveform('sinus', 0, 0.5), 0, 1e-9) &&
  near(gbfWaveform('sinus', 0.25, 0.5), 1, 1e-9) &&
  near(gbfWaveform('sinus', 0.5, 0.5), 0, 1e-9) &&
  near(gbfWaveform('sinus', 0.75, 0.5), -1, 1e-9));
// Le sinus IGNORE le rapport cyclique : un sinus déformé n'est plus un sinus, et
// Frank n'a demandé la déformation que pour le carré et le triangle.
check('sinus : insensible au rapport cyclique',
  near(gbfWaveform('sinus', 0.3, 0.1), gbfWaveform('sinus', 0.3, 0.9), 1e-12));

// Carré : haut avant le rapport cyclique, bas après.
check('carré à 50 % : haut sur la 1re moitié, bas sur la 2e',
  gbfWaveform('carre', 0.1, 0.5) === 1 && gbfWaveform('carre', 0.6, 0.5) === -1);
check('carré à 25 % : haut seulement sur le 1er quart',
  gbfWaveform('carre', 0.2, 0.25) === 1 && gbfWaveform('carre', 0.3, 0.25) === -1);
// Les deux butées sont utiles : c'est ainsi qu'on fabrique un niveau continu.
check('carré à 0 % : toujours bas / à 100 % : toujours haut',
  gbfWaveform('carre', 0.5, 0) === -1 && gbfWaveform('carre', 0.5, 1) === 1);

// Triangle : le rapport cyclique règle la durée de la MONTÉE.
check('triangle à 50 % : -1 au départ, +1 au milieu, -1 à la fin',
  near(gbfWaveform('triangle', 0, 0.5), -1, 1e-9) &&
  near(gbfWaveform('triangle', 0.5, 0.5), 1, 1e-9) &&
  near(gbfWaveform('triangle', 0.999, 0.5), -1, 5e-3));
check('triangle à 50 % : pentes symétriques (± la même valeur de part et d\'autre du sommet)',
  near(gbfWaveform('triangle', 0.25, 0.5), 0, 1e-9) &&
  near(gbfWaveform('triangle', 0.75, 0.5), 0, 1e-9));
// C'est l'item explicite de Frank : « Le bouton rapport cyclique déforme aussi
// la courbe triangulaire ». À 25 % le sommet est au quart, pas au milieu.
check('triangle à 25 % : sommet au QUART (le rapport cyclique déforme bien le triangle)',
  near(gbfWaveform('triangle', 0.25, 0.25), 1, 1e-9) &&
  gbfWaveform('triangle', 0.5, 0.25) < 0.5);
// À 90 % la montée occupe neuf dixièmes de la période : le sommet est à 0,9, et
// la descente est neuf fois plus RAIDE que la montée. C'est le rapport des deux
// pentes qui fait la dent de scie, pas la valeur à un instant donné (à
// mi-montée comme à mi-descente le signal vaut 0).
const pente = (d, t) => (gbfWaveform('triangle', t + 0.001, d) - gbfWaveform('triangle', t, d)) / 0.001;
check('triangle à 90 % : dent de scie (sommet à 0,9, descente 9× plus raide que la montée)',
  near(gbfWaveform('triangle', 0.9, 0.9), 1, 1e-9) &&
  near(-pente(0.9, 0.95) / pente(0.9, 0.45), 9, 0.1));
// Pente jamais infinie : aux butées le triangle reste un triangle, pas un carré.
check('triangle à 0 % et 100 % : reste continu (pente bornée, ce n\'est pas un carré)',
  Math.abs(gbfWaveform('triangle', 0.5, 0)) < 1 && Math.abs(gbfWaveform('triangle', 0.5, 1)) < 1);

// --- evalAnalogWave : volts → fraction d'ADC, temps SIMULÉ ---------------------
// `amplitude` est CRÊTE-À-CRÊTE (sens français, lot .97) : 5 ici, c'est ±2,5 V
// autour du décalage — le même signal qu'avant, décrit dans l'unité de Frank.
const onde = (o) => ({
  kind: 'gbf', pin: 'A0', forme: 'sinus', freq: 1000, amplitude: 5, offset: 2.5, duty: 50, vcc: 5, ...o,
});
// 1 kHz : période 1 ms. À t=0,25 ms le sinus est au sommet → 2,5 + 5/2 = 5 V = plein échelle.
check('eval : sinus 5 Vpp sur 2,5 V de décalage, sous 5 V → sommet à 1,0 au quart de période',
  near(evalAnalogWave(onde(), 0.25, 0), 1, 1e-9));
check('eval : et fond de cuve à 0,0 aux trois quarts',
  near(evalAnalogWave(onde(), 0.75, 0), 0, 1e-9));
check('eval : milieu de course (offset seul) à la demi-période', near(evalAnalogWave(onde(), 0.5, 0), 0.5, 1e-9));
// Le GBF suit l'heure SIMULÉE : c'est un signal électrique, il ne ralentit pas
// avec l'affichage (à l'inverse du capteur de pouls, phénomène du monde réel).
check('eval : c\'est le temps SIMULÉ qui cadence (l\'heure du mur est ignorée)',
  near(evalAnalogWave(onde(), 0.25, 0), evalAnalogWave(onde(), 0.25, 123456), 1e-12));
// Écrêtage : une entrée analogique ne lit ni le négatif ni au-delà de sa référence.
check('eval : écrêté à 1,0 au-dessus de la référence (10 Vpp centré, soit +5 V, sur une entrée 5 V)',
  evalAnalogWave(onde({ amplitude: 10, offset: 0 }), 0.25, 0) === 1);
check('eval : écrêté à 0,0 sous la masse (alternance négative)',
  evalAnalogWave(onde({ amplitude: 10, offset: 0 }), 0.75, 0) === 0);
check('eval : plein échelle 3,3 V (Pico) → 1,65 V vaut la moitié',
  near(evalAnalogWave(onde({ amplitude: 0, offset: 1.65, vcc: 3.3 }), 0, 0), 0.5, 1e-9));
// Le contrôle de la DÉFINITION elle-même, et il vaut d'être lu : en français
// « amplitude » désigne la hauteur TOTALE du signal, du creux au sommet. Un GBF
// réglé sur 5 V sort donc sur 5 V de haut — et, sans décalage, de −2,5 V à
// +2,5 V. C'est la demande de Frank (item 3.1), et c'est ce que dit le cadran
// d'un appareil de TP.
//
// Mesuré sur une référence de 10 V AVEC un décalage de 5 V, choisi pour que le
// signal entier tienne dans la plage : `evalAnalogWave` rend la fraction lue par
// une entrée d'ADC, qui écrête à 0 et à vcc. Sans ce décalage, le creux sortirait
// à 0 V quelle que soit l'amplitude et le contrôle mentirait — c'est exactement
// l'erreur commise en écrivant ce banc, rattrapée par la valeur imprimée.
// (Fraction d'ADC → volts : v = f × vcc.)
const volts = (t, o) => evalAnalogWave(onde({ vcc: 10, offset: 5, ...o }), t, 0) * 10;
const sommetCreux = (a) => [volts(0.25, { amplitude: a }), volts(0.75, { amplitude: a })];
{
  const [haut, bas] = sommetCreux(5);
  check('eval : « amplitude » vaut CRÊTE-À-CRÊTE — 5 V réglés donnent 5 V de hauteur',
    near(haut, 7.5, 1e-9) && near(bas, 2.5, 1e-9),
    `sommet ${haut} V, creux ${bas} V (attendu 7,5 et 2,5 autour du décalage de 5 V)`);
  const [h3, b3] = sommetCreux(3);
  check('eval : et la hauteur suit la valeur réglée (3 V → 3 V de haut, pas 6)',
    near(h3 - b3, 3, 1e-9), `${h3 - b3} V de hauteur`);
}
// 1 MHz : période 1 µs. Deux instants distants d'un quart de µs doivent différer
// — c'est tout l'intérêt d'évaluer à l'instant de la conversion et non par image.
check('eval : à 1 MHz, deux instants à 0,25 µs d\'écart donnent deux valeurs',
  Math.abs(
    evalAnalogWave(onde({ freq: 1_000_000 }), 0.00025, 0) -
    evalAnalogWave(onde({ freq: 1_000_000 }), 0.0005, 0),
  ) > 0.4);
check('eval : fréquence bornée à la plage demandée (0 Hz → 1 Hz, 9 MHz → 1 MHz)',
  near(evalAnalogWave(onde({ freq: 0 }), 250, 0), 1, 1e-9) &&
  near(evalAnalogWave(onde({ freq: 9_000_000 }), 0.00025, 0), 1, 1e-9));
// Un temps simulé négatif ne doit pas renvoyer une phase négative (NaN/écrêtage
// silencieux) : le modulo est ramené dans [0,1) avant d'évaluer.
check('eval : phase correcte même à temps négatif', near(evalAnalogWave(onde(), -0.75, 0), 1, 1e-9));

// --- Netlist : Vs résolu sur l'entrée analogique reliée ------------------------
const diagramme = {
  parts: [
    { id: 'uno', type: 'uno', x: 0, y: 0 },
    { id: 'g1', type: 'gbf', x: 0, y: 0, attrs: { frequency: '1000', waveform: 'sinus' } },
  ],
  wires: [
    { id: 'w1', a: { partId: 'g1', pin: 'Vs' }, b: { partId: 'uno', pin: 'A0' } },
    { id: 'w2', a: { partId: 'g1', pin: 'GND' }, b: { partId: 'uno', pin: 'GND.1' } },
  ],
};
const liens = analogSourceBindings(diagramme);
check('netlist : Vs câblé sur A0 → liaison résolue sur A0',
  liens.length === 1 && liens[0].partId === 'g1' && /A0/.test(liens[0].mcuPin));
// Contre-épreuve : sans fil, aucune liaison (le GBF ne pilote alors rien).
check('netlist : GBF non câblé → aucune liaison (contre-épreuve)',
  analogSourceBindings({ parts: diagramme.parts, wires: [] }).length === 0);

// --- Le GBF dans le MODÈLE ÉLECTRIQUE (v2026.9.4.92) --------------------------
//
// Jusqu'au lot .91 le générateur n'existait que pour le moteur, à l'instant de
// la conversion ADC : le montage ne le voyait pas. Un oscilloscope branché sur
// sa sortie lisait `null` — d'où le « si je relie le GBF à l'oscillo rien ne se
// passe » de Frank. Sa sortie est maintenant posée comme SOURCE datée (50 Ω) et
// sa masse compte comme une masse du montage.
{
  const montage = {
    parts: [
      { id: 'G1', type: 'gbf', x: 0, y: 0, attrs: {} },
      { id: 'OSC1', type: 'oscillo', x: 300, y: 0, attrs: {} },
    ],
    wires: [
      { id: 'w1', a: { partId: 'G1', pin: 'Vs' }, b: { partId: 'OSC1', pin: '+' }, path: [] },
      { id: 'w2', a: { partId: 'G1', pin: 'GND' }, b: { partId: 'OSC1', pin: 'GND' }, path: [] },
    ],
  };
  const lire = (volts) =>
    meterReadings(montage, 5, () => 'hiz', null, null, null, () => volts)
      .find((m) => m.partId === 'OSC1');
  const haut = lire(2.5);
  const bas = lire(-2.5);
  check(`modèle : oscilloscope sur la sortie du GBF → il lit la tension — ${haut && haut.value} V`,
    haut && haut.mode === 'voltage' && Math.abs(haut.value - 2.5) < 0.01);
  // L'alternance NÉGATIVE doit passer telle quelle : ce n'est pas une entrée
  // d'ADC, rien ne l'écrête. Un GBF réglé à ±5 V descend sous la masse et
  // l'oscilloscope doit le tracer.
  check(`modèle : l'alternance négative n'est PAS écrêtée — ${bas && bas.value} V`,
    bas && Math.abs(bas.value + 2.5) < 0.01);
  // Sans rappel de tension (hors simulation), rien à lire : la sortie n'est pas
  // un rail, elle n'existe qu'à un instant donné.
  const sans = meterReadings(montage, 5, () => 'hiz').find((m) => m.partId === 'OSC1');
  check('modèle : GBF sans tension datée → rien à lire (contre-épreuve)',
    sans && sans.value === null);

  // --- L'oscilloscope RECONNAÎT le générateur qu'il regarde (v2026.9.4.93) ----
  //
  // Lire la tension ne suffisait pas : l'appareil n'en prenait qu'UN point par
  // image. À 1 kHz, seize périodes s'écoulent entre deux images — la courbe
  // affichée n'avait plus aucun rapport avec le signal (« l'oscilloscope
  // n'affiche pas du tout ce qui est généré par le GBF », Frank). sim.mts
  // rééchantillonne maintenant l'onde, encore faut-il qu'il sache QUEL
  // générateur alimente la prise « + ».
  const vus = scopeGbfSources(montage);
  check('modèle : oscilloscope branché sur Vs → son générateur est reconnu',
    vus.length === 1 && vus[0].partId === 'OSC1' && vus[0].gbfId === 'G1');
  // Prise « + » sur la MASSE du générateur : ce n'est pas sa sortie, il n'y a
  // pas d'onde à rejouer — sans cette garde, l'appareil aurait tracé le signal
  // sur un fil où il n'est pas.
  check('modèle : prise + sur la masse → aucun générateur reconnu (contre-épreuve)',
    scopeGbfSources({
      parts: montage.parts,
      wires: [{ id: 'w1', a: { partId: 'G1', pin: 'GND' }, b: { partId: 'OSC1', pin: '+' }, path: [] }],
    }).length === 0);
  // LE GÉNÉRATEUR PRIME SUR LA BROCHE (corrigé le 17/09). Le lot .93 avait
  // tranché l'inverse : une broche MCU sur le nœud gagne, puisque le moteur la
  // date au cycle près. Vrai quand elle ÉMET son créneau — faux quand elle
  // SUBIT un générateur. Une entrée attaquée par un GBF ne produit aucun front,
  // son journal reste vide, et l'écran devenait NOIR dès qu'on branchait la
  // carte en plus du générateur. C'est le retour de Frank : « si je branche le
  // GBF à l'oscillo je vois les courbes, si je branche aussi la carte pico je
  // ne vois plus rien ». Brancher un appareil de mesure de plus ne doit jamais
  // effacer le signal.
  const surDigitale = {
    parts: [...montage.parts, { id: 'U1', type: 'uno', x: 0, y: 300, attrs: {} }],
    wires: [
      ...montage.wires,
      { id: 'w3', a: { partId: 'G1', pin: 'Vs' }, b: { partId: 'U1', pin: '3' }, path: [] },
    ],
  };
  check('modèle : carte branchée EN PLUS du générateur → la courbe reste tracée',
    scopeProbePins(surDigitale).length === 1 && scopeGbfSources(surDigitale).length === 1,
    `sondes=${scopeProbePins(surDigitale).length} gbf=${scopeGbfSources(surDigitale).length}`);
}

// --- SURTENSION : la carte grille (retour du 17/09) ---------------------------
//
// « Au-delà de 5 V en entrée, les cartes Pico doivent griller » (Frank). Les
// GPIO du RP2040/RP2350 ne sont PAS tolérants 5 V : la carte tourne en 3,3 V et
// l'absolute maximum de ses entrées est 3,6 V. Un capteur 5 V ou un générateur
// câblé droit sur une broche la détruit — c'est la faute de câblage numéro un
// des débutants, et la simulation doit la montrer plutôt que la laisser passer.
// Un Uno, lui, encaisse jusqu'à 5,5 V.
{
  const carte = (id, type, y) => ({ id, type, x: 0, y, attrs: {} });
  const filVers = (id, partId, pin) =>
    ({ id, a: { partId: 'G1', pin: 'Vs' }, b: { partId, pin }, path: [] });
  const gbf = { id: 'G1', type: 'gbf', x: 0, y: 0, attrs: {} };

  check('modèle : une broche de Pico ne tient que 3,6 V', maxPinVolts('pico') === 3.6,
    String(maxPinVolts('pico')));
  check('modèle : une broche d’Uno tient 5,5 V', maxPinVolts('uno') === 5.5,
    String(maxPinVolts('uno')));

  const surPico = { parts: [gbf, carte('P1', 'pico', 300)], wires: [filVers('w1', 'P1', 'GP15')] };
  const st = gbfBoardStress(surPico);
  check('modèle : générateur câblé droit sur un GPIO de Pico → carte sous contrainte',
    st.length === 1 && st[0].boardPartId === 'P1' && st[0].vmax === 3.6,
    JSON.stringify(st));

  const surUno = { parts: [gbf, carte('U1', 'uno', 300)], wires: [filVers('w1', 'U1', '9')] };
  const stUno = gbfBoardStress(surUno);
  check('modèle : le même câblage sur un Uno → seuil de 5,5 V, pas 3,6',
    stUno.length === 1 && stUno[0].vmax === 5.5, JSON.stringify(stUno));

  // Le pont diviseur est LA façon correcte d'attaquer un Pico en 5 V : les deux
  // pattes d'une résistance ne sont pas le même potentiel, la netlist ne doit
  // donc PAS les fusionner (`buildNets(diagram, false)`). Fusionnées, ce montage
  // propre aurait grillé la carte — le contraire de ce qu'on veut enseigner.
  const parPont = {
    parts: [gbf, carte('P1', 'pico', 300), { id: 'R1', type: 'resistor', x: 100, y: 100, attrs: {} }],
    wires: [
      { id: 'w1', a: { partId: 'G1', pin: 'Vs' }, b: { partId: 'R1', pin: '1' }, path: [] },
      { id: 'w2', a: { partId: 'R1', pin: '2' }, b: { partId: 'P1', pin: 'GP15' }, path: [] },
    ],
  };
  check('modèle : derrière une résistance (pont diviseur) → la carte n’est PAS en danger',
    gbfBoardStress(parPont).length === 0, JSON.stringify(gbfBoardStress(parPont)));

  // Une patte d'alim n'est pas un GPIO : VSYS encaisse 5 V par construction.
  const surVsys = { parts: [gbf, carte('P1', 'pico', 300)], wires: [filVers('w1', 'P1', 'VSYS')] };
  check('modèle : câblé sur VSYS (entrée d’alimentation) → rien ne grille',
    gbfBoardStress(surVsys).length === 0, JSON.stringify(gbfBoardStress(surVsys)));

  // Sans générateur, aucune contrainte : la fonction ne doit rien inventer.
  check('modèle : pas de générateur → aucune contrainte (contre-épreuve)',
    gbfBoardStress({ parts: [carte('P1', 'pico', 300)], wires: [] }).length === 0);
}

// --- L'explosion et son explication, côté sim.mts et côté composants ----------
{
  const sim = readFileSync(join(root, 'src', 'webview', 'sim.mts'), 'utf8');
  check('sim : les cartes en danger sont recensées au lancement de la simulation',
    /gbfStress = gbfBoardStress\(editor\.diagram\)/.test(sim));
  check('sim : la surtension est jugée à chaque image',
    /reportBoardOvervoltage\(\)/.test(sim));
  const bloc = sim.slice(sim.indexOf('function reportBoardOvervoltage'),
    sim.indexOf('function reportBoardOvervoltage') + 1200);
  // Le SOMMET de l'onde décide, pas la valeur moyenne : un sinus à 2 V de
  // décalage et 4 V crête-à-crête monte à 4 V et perce un Pico, alors que sa
  // moyenne reste sous 3,6.
  check('sim : c’est le SOMMET de l’onde qui grille la carte, pas sa moyenne',
    /offset \+ amplitude \/ 2/.test(bloc) && /haut > st\.vmax/.test(bloc), bloc.slice(0, 200));
  // Une pointe négative perce aussi : la diode de masse conduit sous -0,6 V.
  check('sim : une pointe NÉGATIVE perce aussi (diode de masse)',
    /bas < -0\.6/.test(bloc));
  check('sim : la carte grillée porte une explication chiffrée',
    /markBurned\([\s\S]{0,160}?BURN_NOTE\.board, st\.vmax/.test(bloc));
  check('sim : la note dit le seuil, le 3,3 V et la parade (pont diviseur)',
    /board: '[^']*\{0\} V[^']*divider/.test(sim));

  // L'éditeur ne fait que hisser le conteneur grillé : c'est l'ÉLÉMENT qui peint
  // le « Boum ». Sans propriété `burned` sur la carte, rien ne s'afficherait —
  // c'était le cas jusqu'ici pour les quatre Pico et pour l'Uno.
  const pico = readFileSync(join(root, 'src', 'webview', 'composants', 'pico-board.mts'), 'utf8');
  check('Pico : la carte sait se peindre grillée',
    /set burned\(/.test(pico) && /boumOverlay\(/.test(pico));
  check('Pico : l’explosion a un conteneur positionné (sinon elle part en haut à gauche)',
    /position = 'relative'/.test(pico) && /boumHost/.test(pico));
  check('Pico : changer de variante ne perd pas l’explosion',
    /this\.boumHost = document\.createElement[\s\S]{0,160}?this\.updateBoum\(\)/.test(pico));
  const uno = readFileSync(join(root, 'src', 'webview', 'composants', 'arduino-uno-element.mts'), 'utf8');
  check('Uno : la carte sait se peindre grillée',
    /burned: \{ type: Boolean \}/.test(uno) && /this\.burned \? boumOverlay\(/.test(uno));
  check('Uno : l’hôte lit est positionné (:host position relative)',
    /:host \{[\s\S]{0,80}?position: relative/.test(uno));
}

// --- La chaîne de rééchantillonnage dans sim.mts (contrôle sur les SOURCES) ----
//
// `salveGbf` vit au cœur de la boucle d'image : le faire tourner demanderait un
// moteur, une carte et une simulation lancée. On vérifie donc que la chaîne est
// bien en place — c'est la même méthode que pour les autres branchements de
// sim.mts (cf. verify-analyseur).
{
  const sim = readFileSync(join(root, 'src', 'webview', 'sim.mts'), 'utf8');
  check('sim : les oscilloscopes branchés sur un GBF sont recensés au lancement',
    /scopeGbfs\s*=\s*scopeGbfSources\(editor\.diagram\)/.test(sim));
  // La salve part au mode PENTE : un sinus versé en retenue serait un escalier.
  check("sim : la salve est versée sans retenue (onde continue, pas de créneau)",
    /scope\.pushMany\(salveG,\s*false\)/.test(sim));
  // Elle ne remplace le point par image que si un générateur est reconnu :
  // ailleurs dans le montage (pont diviseur, condensateur) rien ne change.
  check('sim : sans générateur reconnu, on garde le point par image',
    /if\s*\(salveG\)\s*scope\.pushMany\(salveG,\s*false\);\s*\n\s*else\s+scope\.push\(/.test(sim));

  // --- Carte branchée EN PLUS du générateur (retour du 17/09) ----------------
  // Trois pièces, et il fallait les trois : sans l'une, l'écran restait noir.
  // 1) le modèle reconnaît toujours le générateur (contrôlé plus haut) ;
  // 2) la boucle d'image ne part PAS dans la branche « créneau », qui lirait un
  //    journal de fronts vide — une entrée analogique n'en produit aucun ;
  // 3) le rapport de charge ne se laisse pas calculer sur une lecture ÉCRÊTÉE.
  check('sim : un générateur sur la prise + l’emporte sur la broche MCU du nœud',
    /const gbfIci = scopeGbfs\.some\([\s\S]{0,80}?const sonde = gbfIci \? undefined :/.test(sim));
  // `charge = lu / aVide` avec `lu` écrêté à 0 ramenait TOUTE la salve à zéro :
  // sur un signal à cheval sur la masse, la lecture ADC vaut 0 la moitié du
  // temps. C'est l'écran plat, par un autre chemin que la branche « créneau ».
  check('sim : une lecture écrêtée ne sert PAS à mesurer la chute du montage',
    /const ecrete = lu !== null && \(lu <= [\d.]+ \|\| lu >= vref - [\d.]+\)/.test(sim)
      && /!ecrete && Math\.abs\(aVide\) > /.test(sim));
  // L'écrêtage d'AFFICHAGE demandé par Frank. Il ne vient pas de l'appareil —
  // un oscilloscope voit le négatif — mais des diodes de protection de la carte
  // posée sur le même nœud. Générateur seul : aucune bride.
  check('sim : la carte sur le nœud ÉCRÊTE le signal affiché (diodes de protection)',
    /const bride = scopeProbes\.some\(/.test(sim)
      && /bride \? Math\.max\(bas, Math\.min\(haut, v\)\) : v/.test(sim));
}

// --- Rendu réel (Chrome headless, avec de VRAIS événements de souris) ----------
//
// Pourquoi une vraie souris ici. Régler ce GBF est un GESTE, et pas un geste
// simple : quatre boutons rotatifs se touchent presque sur un appareil de
// 160 px, et le curseur de forme se glisse. Un `new PointerEvent(...)` visé
// à la main sur la zone attendue « réussirait » même si les zones se
// chevauchaient, même si le clic partait au composant (qui se déplacerait) et
// même si le drag ne suivait pas le doigt — ce sont précisément les pannes que
// l'élève rencontrerait. Chrome est donc piloté en CDP brut
// (`Input.dispatchMouseEvent`) : les événements viennent du navigateur, la page
// choisit elle-même sa cible par le point touché.
const CACHE = join(root, 'node_modules', '.cache-gbf');
const PORT = 9414; // port propre à ce banc : la suite enchaîne les bancs CDP
mkdirSync(CACHE, { recursive: true });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const entry = `
import '../../src/webview/composants/gbf-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const el = document.createElement('kablix-gbf');
	el.setAttribute('frequency', '1000');
	el.setAttribute('amplitude', '2.5');
	el.setAttribute('offset', '0');
	el.setAttribute('duty', '50');
	el.setAttribute('waveform', 'sinus');
	el.style.position = 'absolute';
	el.style.left = '0px';
	el.style.top = '0px';
	document.body.appendChild(el);
	window.__el = el;
	await wait(100);
	const sh = el.shadowRoot;
	const svg = sh.querySelector('svg');
	window.__svg = svg;
	const res = {};
	// Les quatre boutons du dessin. Le filtre exclut les groupes de ROTATION,
	// ajoutés au rendu et dont l'id dérive de celui du bouton (suffixe -rot).
	res.drawn = [...sh.querySelectorAll('[id^="bouton-"]')].filter((g) => !g.id.endsWith('-rot')).length === 4;
	const box = svg.getBoundingClientRect();
	res.size = [Math.round(box.width), Math.round(box.height)];
	res.pins = el.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y).join(' ');
	// Afficheurs : ils doivent suivre les attributs de DÉPART, dans l'écriture de
	// l'appareil (unité qui suit la valeur, virgule décimale du dessin de Frank).
	const lire = (id) => {
		const n = sh.querySelector('[id="' + id + '"] tspan') || sh.querySelector('[id="' + id + '"]');
		return n ? n.textContent : null;
	};
	window.__lire = lire;
	res.afficheurs = [lire('valeur-fr__quence'), lire('valeur_amplitude'), lire('valeur_d__calage'), lire('valeur_rapport_cyclique')];
	// Groupes de rotation recréés au rendu : sans eux, un transform CSS écraserait
	// le matrix de PLACEMENT du bouton et celui-ci partirait hors vue.
	res.rotGroupes = ['bouton-d__calage', 'bouton-rapport__cyclique', 'bouton-amplitude', 'bouton-fr__quence']
		.filter((id) => !!sh.querySelector('[id="' + id + '-rot"]')).length;
	// Le matrix de placement du bouton est INTACT sous le groupe de rotation.
	res.matrixIntact = /matrix/.test(sh.querySelector('[id="bouton-amplitude"]').getAttribute('transform') || '');
	const rot = (id) => sh.querySelector('[id="' + id + '-rot"]').style.transform;
	window.__rot = rot;
	// Amplitude 2,5 V sur 10 V = un quart de course = 75° des 300°.
	res.rotAmpl = rot('bouton-amplitude');
	// Décalage 0 V au milieu de -5..+5 = demi-course = 150°.
	res.rotOffset = rot('bouton-d__calage');
	// Fréquence LOGARITHMIQUE : 1 kHz sur 1 Hz..1 MHz = la moitié des six
	// décades = 150°. En linéaire ce serait 0,3° — le banc verrait la différence.
	res.rotFreq = rot('bouton-fr__quence');
	// Curseur de forme : au cran du haut pour un sinus (pas de translation).
	const curseur = sh.querySelector('[id="rect3092"]');
	window.__curseur = curseur;
	res.curseurSinus = curseur.style.transform || '(aucune)';
	// Zones de clic : quatre ronds + le rail, tous marqués hors export (sinon
	// Inkscape rendrait leur fill transparent en NOIR sur le dessin livré).
	const zones = [...svg.querySelectorAll(':scope > circle, :scope > rect')];
	res.zones = zones.length;
	res.zonesHorsExport = zones.every((z) => z.hasAttribute('data-no-export'));
	res.rotHorsExport = [...sh.querySelectorAll('[id$="-rot"]')].every((g) => g.hasAttribute('data-unwrap-export'));
	// Position d'un point du cadran d'un bouton, en coordonnées ÉCRAN : c'est ce
	// que la vraie souris devra viser.
	window.__viser = (cx, cy, deg, r = 14) => {
		const ctm = svg.getScreenCTM();
		const rad = (deg * Math.PI) / 180;
		const p = new DOMPoint(cx + r * Math.cos(rad), cy + r * Math.sin(rad)).matrixTransform(ctm);
		return { x: p.x, y: p.y };
	};
	window.__viserPoint = (x, y) => {
		const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
		return { x: p.x, y: p.y };
	};
	window.__inputs = 0;
	el.addEventListener('input', () => { window.__inputs++; });
	window.__etat = () => ({
		freq: el.freq, amplitude: el.amplitude, offset: el.offset, duty: el.duty, forme: el.forme,
		afficheurs: [lire('valeur-fr__quence'), lire('valeur_amplitude'), lire('valeur_d__calage'), lire('valeur_rapport_cyclique')],
		rotAmpl: rot('bouton-amplitude'), rotFreq: rot('bouton-fr__quence'),
		curseur: curseur.style.transform || '(aucune)',
		inputs: window.__inputs,
	});
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(res);
	document.body.appendChild(out);
	window.__pret = true;
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: root, logLevel: 'silent',
});
const pageHtml = join(CACHE, 'p.html');
writeFileSync(pageHtml, `<!doctype html><meta charset=utf8><body style="margin:0"><script>${b.outputFiles[0].text}</script></body>`);

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);

if (!chrome) {
  console.log('⚠️ Chrome introuvable : rendu et gestes sautés');
} else {
  // Première passe : les mesures statiques, en --dump-dom (rapide, pas de CDP).
  const dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=12000', '--dump-dom',
    `file:///${pageHtml.replace(/\\/g, '/')}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([^<]+)<\/pre>/);
  if (!m) {
    check('rendu headless : mesures produites', false);
  } else {
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    check('rendu : dessin de Frank présent (quatre boutons)', r.drawn === true);
    check('rendu : 160×140 px (1:1 viewBox)', r.size[0] === 160 && r.size[1] === 140);
    check('rendu : bornes Vs@70,120 GND@90,120', r.pins === 'Vs@70,120 GND@90,120');
    check(`rendu : afficheurs suivent les attributs de départ — ${JSON.stringify(r.afficheurs)}`,
      r.afficheurs[0] === '1 kHz' && r.afficheurs[1] === '2,5 V' &&
      r.afficheurs[2] === '0,0 V' && r.afficheurs[3] === '50 %');
    check('rendu : quatre groupes de rotation recréés', r.rotGroupes === 4);
    check('rendu : matrix de PLACEMENT du bouton intact sous le groupe de rotation', r.matrixIntact === true);
    check(`rendu : amplitude 2,5/10 V → quart de course, 75° — ${r.rotAmpl}`, r.rotAmpl === 'rotate(75deg)');
    check(`rendu : décalage 0 V au milieu de -5..+5 → 150° — ${r.rotOffset}`, r.rotOffset === 'rotate(150deg)');
    check(`rendu : fréquence LOGARITHMIQUE, 1 kHz à mi-course → 150° — ${r.rotFreq}`, r.rotFreq === 'rotate(150deg)');
    check(`rendu : curseur de forme au cran du haut pour un sinus — ${r.curseurSinus}`,
      r.curseurSinus === '(aucune)' || /translateY\(0/.test(r.curseurSinus));
    check('rendu : cinq zones de clic (quatre boutons + le rail du curseur)', r.zones === 5);
    check('rendu : zones de clic marquées hors export (pas de ronds noirs sur le dessin livré)',
      r.zonesHorsExport === true);
    check('rendu : groupes de rotation aplatis à l\'export (aucun objet ajouté au dessin)',
      r.rotHorsExport === true);
  }

  // Deuxième passe : les GESTES, avec de vrais événements de souris (CDP).
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=' + join(CACHE, 'profil'),
    `file:///${pageHtml.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    // Attente de l'interface de débogage, puis raccordement au WebSocket de la page.
    let cible = null;
    for (let i = 0; i < 100 && !cible; i++) {
      await attendre(100);
      try {
        const liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        cible = liste.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch { /* Chrome n'écoute pas encore */ }
    }
    if (!cible) throw new Error(`interface CDP muette sur le port ${PORT}`);
    // `WebSocket` est global depuis node 22 : pas de dépendance `ws` dans le projet.
    ws = new WebSocket(cible.webSocketDebuggerUrl);
    let id = 0;
    const attente = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      const w = attente.get(msg.id);
      if (w) { attente.delete(msg.id); w(msg); }
    });
    await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
    const envoyer = (method, params = {}) => new Promise((ok) => {
      const n = ++id;
      attente.set(n, ok);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
    const ev = async (expr) => {
      const r = await envoyer('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result?.result?.value;
    };
    // La page doit être prête (l'élément monté, les aides posées sur `window`).
    for (let i = 0; i < 100 && !(await ev('window.__pret === true')); i++) await attendre(100);

    /** Un vrai clic de souris au point écran donné. */
    const souris = async (type, x, y) => {
      await envoyer('Input.dispatchMouseEvent', {
        type, x, y, button: 'left', buttons: type === 'mouseMoved' ? 0 : 1, clickCount: 1, pointerType: 'mouse',
      });
      await attendre(25);
    };
    /** Presser-glisser-relâcher : la souris passe par chaque point. */
    const glisser = async (points) => {
      await souris('mouseMoved', points[0].x, points[0].y);
      await envoyer('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: points[0].x, y: points[0].y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse',
      });
      await attendre(25);
      for (const p of points.slice(1)) {
        await envoyer('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1, pointerType: 'mouse',
        });
        await attendre(25);
      }
      const fin = points[points.length - 1];
      await envoyer('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: fin.x, y: fin.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse',
      });
      await attendre(50);
    };
    const etat = () => ev('JSON.stringify(window.__etat())').then(JSON.parse);
    /** Point du cadran d'un bouton, à l'angle donné (degrés, 0 = droite). */
    const surCadran = (cx, cy, deg) => ev(`JSON.stringify(window.__viser(${cx}, ${cy}, ${deg}))`).then(JSON.parse);
    const surPoint = (x, y) => ev(`JSON.stringify(window.__viserPoint(${x}, ${y}))`).then(JSON.parse);

    // Centres des quatre boutons, mesurés sur le dessin.
    const BTN = { offset: [32.85, 34.04], duty: [81.99, 34.04], amplitude: [32.85, 84.25], freq: [81.99, 84.25] };

    // 1. HORS simulation, l'appareil est inerte : un vrai clic sur un bouton ne
    //    doit RIEN régler (en édition, le clic sert à déplacer le composant).
    let p = await surCadran(...BTN.amplitude, 60); // 300° de course = le maximum
    await glisser([p]);
    let e = await etat();
    check(`geste : bouton INERTE hors simulation (amplitude reste 2,5 V) — ${e.amplitude} V`,
      e.amplitude === 2.5 && e.inputs === 0);

    await ev(`window.__el.setAttribute('simulating', '')`);
    await attendre(80);

    // 2. En simulation : tourner le bouton d'amplitude au maximum du cadran.
    //    60° écran = 300° de course depuis le zéro à 120° → 10 V.
    p = await surCadran(...BTN.amplitude, 60);
    await glisser([p]);
    e = await etat();
    check(`geste : amplitude tournée au maximum → 10,0 V, afficheur et bouton suivent — ${e.amplitude} V / ${e.afficheurs[1]} / ${e.rotAmpl}`,
      e.amplitude === 10 && e.afficheurs[1] === '10,0 V' && e.rotAmpl === 'rotate(300deg)' && e.inputs > 0);

    // 3. Le bouton VOISIN n'a pas bougé : les quatre cadrans d'un appareil de
    //    160 px se touchent presque, et une zone trop large les confondrait.
    check(`geste : le bouton voisin (décalage) n'a pas bougé — ${e.offset} V`, e.offset === 0);

    // 4. Glissement continu sur le cadran de fréquence : la course est
    //    LOGARITHMIQUE, un quart de tour doit multiplier la fréquence, pas
    //    l'augmenter d'un quart de la plage.
    const trajet = [];
    for (const deg of [120, 150, 180, 210, 240]) trajet.push(await surCadran(...BTN.freq, deg));
    await glisser(trajet);
    e = await etat();
    // 120° écran = zéro du cadran → 1 Hz ; +120° de course sur 300 = 2/5 des six
    // décades = 10^2,4 ≈ 251 Hz.
    check(`geste : glissement sur le cadran de fréquence → ≈251 Hz (course logarithmique) — ${e.freq} Hz / ${e.afficheurs[0]}`,
      e.freq >= 240 && e.freq <= 265 && /Hz$/.test(e.afficheurs[0]));

    // 4 bis. PAS DE RÉGLAGE par plage (demande de Frank, .92) : 1 Hz sous
    //    100 Hz, 10 Hz jusqu'à 10 kHz, 100 Hz au-delà. On balaie le cadran
    //    degré par degré et on vérifie que CHAQUE fréquence atteinte est un
    //    multiple du pas de SA plage. Un balayage grossier ne prouverait rien :
    //    c'est entre deux crans que la valeur non calée apparaîtrait.
    const vues = [];
    for (let deg = 121; deg <= 420; deg += 3) {
      await glisser([await surCadran(...BTN.freq, deg)]);
      vues.push((await etat()).freq);
    }
    const horsPas = vues.filter((hz) => {
      const pas = hz < 100 ? 1 : hz < 10_000 ? 10 : 100;
      return hz % pas !== 0;
    });
    check(`geste : fréquence calée sur le pas de sa plage (1/10/100 Hz) — ${vues.length} positions, ${horsPas.length} hors pas`,
      vues.length > 80 && horsPas.length === 0,
    );
    // Et le balayage doit vraiment TRAVERSER les trois plages, sinon le
    // contrôle ci-dessus ne vérifierait qu'un seul pas.
    check(`geste : le balayage traverse les trois plages — min ${Math.min(...vues)} Hz, max ${Math.max(...vues)} Hz`,
      Math.min(...vues) < 100 && vues.some((hz) => hz >= 100 && hz < 10_000) && Math.max(...vues) >= 10_000);

    // 5. Le curseur de forme se GLISSE : sinus → carré (cran du bas), puis
    //    retour au triangle (cran du milieu). C'est le geste de l'appareil.
    const bas = await surPoint(120.24, 74);   // dernier tiers du rail
    const milieu = await surPoint(120.24, 59); // tiers du milieu
    await glisser([bas]);
    e = await etat();
    check(`geste : curseur glissé en bas → carré, bouton descendu de deux crans — ${e.forme} / ${e.curseur}`,
      e.forme === 'carre' && /translateY\(6\.35px\)/.test(e.curseur));
    await glisser([milieu]);
    e = await etat();
    check(`geste : curseur remonté au milieu → triangle, un seul cran — ${e.forme} / ${e.curseur}`,
      e.forme === 'triangle' && /translateY\(3\.175px\)/.test(e.curseur));

    // 6. Le rapport cyclique se règle, et son afficheur est en pourcent.
    p = await surCadran(...BTN.duty, 300); // 180° de course → 60 %
    await glisser([p]);
    e = await etat();
    check(`geste : rapport cyclique réglé au pourcent — ${e.duty} % / ${e.afficheurs[3]}`,
      e.duty === 60 && e.afficheurs[3] === '60 %');

    // 7. Sortie de simulation : l'appareil reprend ses réglages de DÉPART. Les
    //    boutons tournés pendant la séance ne sont pas la consigne de l'énoncé.
    await ev(`window.__el.removeAttribute('simulating')`);
    await attendre(80);
    e = await etat();
    check(`geste : sortie de simulation → retour aux réglages de départ — ${e.amplitude} V / ${e.freq} Hz / ${e.forme}`,
      e.amplitude === 2.5 && e.freq === 1000 && e.forme === 'sinus' && e.duty === 50);
  } catch (err) {
    check(`gestes à vraie souris : ${err.message}`, false);
  } finally {
    try { ws?.close(); } catch { /* déjà fermé */ }
    try { proc.kill(); } catch { /* déjà mort */ }
  }
}

console.log(failures === 0 ? '\nverify:gbf OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
