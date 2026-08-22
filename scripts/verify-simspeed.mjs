// Vitesse réelle de la simulation. Deux choses sont vérifiées ici :
//
// 1. `simulatedMs()` — temps SIMULÉ écoulé, exposé par les deux moteurs. C'est la
//    seule mesure qui distingue « le programme est lent » de « la page ne suit
//    plus » : comparé au temps réel, il donne la vitesse effective, affichée dans
//    la barre d'état dès qu'elle décroche (retour Frank : « c'est devenu très
//    lent », sans moyen de chiffrer quoi que ce soit).
// 2. Le rendu ne tourne plus DEUX fois par image : pendant la simulation, la
//    boucle continue (`renderTick`) redessine déjà à chaque frame ; `queueRefresh`
//    y ajoutait un second rAF, donc deux `refreshVisuals` complets par image.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-spd-'));

async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');
const { UNO_DEMO } = await load('src/webview/programs/uno-demo.mjs', 'uno-demo.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Occupe le thread pendant `ms`, comme une repeinture de la page. */
const bloque = (ms) => {
  const fin = performance.now() + ms;
  while (performance.now() < fin) {
    /* vol de thread */
  }
};

// ------------------------------------------------------ mesure du moteur ----

{
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  check('le moteur AVR expose simulatedMs()', typeof eng.simulatedMs === 'function');
  const zero = eng.simulatedMs();
  eng.start();
  await sleep(150);
  const t0 = performance.now();
  const s0 = eng.simulatedMs();
  await sleep(500);
  const ratio = (eng.simulatedMs() - s0) / (performance.now() - t0);
  eng.stop();
  eng.dispose();
  check('au démarrage, le temps simulé part de 0', zero === 0, `${zero} ms`);
  check(
    `thread libre : la mesure vaut ${ratio.toFixed(2)}× le temps réel`,
    ratio > 0.85 && ratio < 1.15,
    'la mesure ne reflète pas la vitesse réelle',
  );
}

{
  // Page franchement bloquée : 700 ms volés d'un coup, bien au-delà de la dette
  // rattrapable (MAX_DEBT_MS = 250 ms). Le moteur ré-ancre et SAUTE le temps
  // perdu — la mesure doit le voir, sinon le badge ne se déclencherait jamais.
  // (Une charge plus légère est RATTRAPÉE : c'est le comportement voulu depuis
  // la v2026.7.207, et `verify:realtime` le vérifie déjà — inutile d'en faire un
  // décrochage ici, la mesure dépendrait de la vitesse de la machine.)
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  eng.start();
  await sleep(150);
  const t0 = performance.now();
  const s0 = eng.simulatedMs();
  bloque(700);
  await sleep(300);
  const ratio = (eng.simulatedMs() - s0) / (performance.now() - t0);
  eng.stop();
  eng.dispose();
  check(
    `page bloquée 700 ms : mesure ${ratio.toFixed(2)}× — le décrochage est visible`,
    ratio < 0.85,
    'la mesure reste à 1 alors que la page a été bloquée plus longtemps que la dette',
  );
}

{
  // Ralenti volontaire (menu 🐢) : la mesure doit suivre le réglage, sinon le
  // badge s'allumerait à tort à chaque fois qu'on ralentit exprès.
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  eng.setSpeed(0.1);
  eng.start();
  await sleep(200);
  const t0 = performance.now();
  const s0 = eng.simulatedMs();
  await sleep(600);
  const ratio = (eng.simulatedMs() - s0) / (performance.now() - t0);
  eng.stop();
  eng.dispose();
  check(`ralenti 10 % : mesure ${ratio.toFixed(2)}×`, ratio > 0.05 && ratio < 0.2);
}

{
  // Occupation CPU du moteur (busyMs) : c'est elle qui dit si le retard vient du
  // moteur (saturé) ou du reste de la page. Elle doit rester dans [0, temps réel]
  // et être NON NULLE dès que la simulation avance — sinon l'infobulle du badge
  // désignerait le mauvais coupable.
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  check('le moteur AVR expose busyMs()', typeof eng.busyMs === 'function');
  eng.start();
  await sleep(150);
  const t0 = performance.now();
  const b0 = eng.busyMs();
  await sleep(500);
  const wall = performance.now() - t0;
  const busy = eng.busyMs() - b0;
  eng.stop();
  eng.dispose();
  const part = busy / wall;
  check(
    `occupation CPU du moteur mesurée : ${(part * 100).toFixed(0)} % du temps réel`,
    part > 0.05 && part <= 1.05,
    `${busy.toFixed(0)} ms pour ${wall.toFixed(0)} ms réelles — mesure incohérente`,
  );
}

{
  // En pause, le temps simulé ne bouge plus : le badge ne doit rien en conclure.
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  eng.start();
  await sleep(150);
  eng.pause();
  const s0 = eng.simulatedMs();
  await sleep(200);
  const fige = eng.simulatedMs() === s0;
  eng.stop();
  eng.dispose();
  check('en pause, le temps simulé est figé', fige);
}

// ------------------------------- le DÉMARRAGE n'est pas un ralenti (v2026.8.3) --
// Retour de Frank : « us sensor 0,01 · ili9341-pico 0,01 · l'horloge pico 0,35 ».
// Mesuré dans la vraie page (Chrome, schémas et scripts réels), us-sensor et
// ili9341 tournent à 1,00× — mais leur DÉMARRAGE, lui, rampe : boot du firmware
// MicroPython puis injection du script par le raw REPL (tempête d'interruptions
// USB), 0,15 à 0,7× pendant 1 à 7 secondes selon la taille des bibliothèques.
// Le badge, armé dès le clic ▶, accusait donc la simulation d'un ralenti qui
// n'existait pas. Il ne se mesure plus qu'à partir de `onRunning`.
{
  // Le seuil est celui de la production : si Frank le change, le banc suit.
  const SPEED_WARN = Number(
    /const SPEED_WARN = ([\d.]+)/.exec(readFileSync(join(root, 'src/webview/sim.mts'), 'utf8'))?.[1] ?? 0.8,
  );
  const fw = ['RPI_PICO-20230426-v1.20.0.uf2']
    .map((n) => join(root, 'test-assets', n))
    .find(existsSync);
  if (!fw) {
    console.log('  (firmware absent : mesure du démarrage sautée)');
  } else {
    const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
    const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
    const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
    const script = ['import time', 'n = 0', 'while True:', '    n += 1', '    time.sleep_ms(200)', ''].join('\n');
    const eng = new PicoEngine({ kind: 'flash', segments, script });
    eng.onSerial = () => {};
    let demarrage = null;
    const t0 = performance.now();
    eng.onRunning = () => {
      if (!demarrage) demarrage = { wall: performance.now() - t0, sim: eng.simulatedMs() };
    };
    eng.start();
    const limite = Date.now() + 120000;
    while (!demarrage && Date.now() < limite) await sleep(50);
    if (!demarrage) {
      check('le script MicroPython démarre', false, 'onRunning jamais émis');
    } else {
      const boot = demarrage.sim / demarrage.wall;
      // Fenêtre de régime établi, celle que le badge doit juger.
      const w0 = performance.now();
      const s0 = eng.simulatedMs();
      await sleep(1500);
      const apres = (eng.simulatedMs() - s0) / (performance.now() - w0);
      // Le RALENTI sur Pico (v2026.8.3) : `setSpeed` ne faisait rien du tout sur
      // rp2040js — le menu 🐢 était sans effet côté Pico. Mesuré ici en vrai.
      eng.setSpeed(0.1);
      await sleep(300); // l'ancre repart : on laisse passer la tranche en cours
      const w1 = performance.now();
      const s1 = eng.simulatedMs();
      await sleep(1200);
      const ralenti = (eng.simulatedMs() - s1) / (performance.now() - w1);
      eng.setSpeed(1);
      await sleep(300);
      const w2 = performance.now();
      const s2 = eng.simulatedMs();
      await sleep(800);
      const revenu = (eng.simulatedMs() - s2) / (performance.now() - w2);
      eng.stop?.();
      check(
        `le ralenti 10 % agit AUSSI sur le Pico : ${ralenti.toFixed(2)}×`,
        ralenti > 0.05 && ralenti < 0.25,
        'setSpeed ne faisait rien sur rp2040js : le menu 🐢 restait décoratif',
      );
      check(
        `revenu à 100 %, le Pico repart à l'heure : ${revenu.toFixed(2)}×`,
        revenu > SPEED_WARN,
        'le ralenti ne se lève plus, ou la dette accumulée est rattrapée en trombe',
      );
      check(
        `le démarrage MicroPython est lent par nature : ${boot.toFixed(2)}× sur ${(demarrage.wall / 1000).toFixed(1)} s`,
        boot < SPEED_WARN,
        'le démarrage ne décroche plus : ce banc ne prouve plus rien',
      );
      check(
        `le script, lui, tourne à l'heure : ${apres.toFixed(2)}×`,
        apres > SPEED_WARN,
        'même en régime établi le moteur ne suit pas — le ralenti serait réel',
      );
    }
  }
}

// ------------------------------------------------------------- sources ----

const pico = readFileSync(join(root, 'src/webview/engines/pico.mts'), 'utf8');
const avr = readFileSync(join(root, 'src/webview/engines/avr.mts'), 'utf8');
check(
  'le moteur Pico expose lui aussi simulatedMs()',
  /simulatedMs\(\): number \{[\s\S]{0,200}core\.cycles/.test(pico),
);

check(
  'le moteur Pico expose lui aussi busyMs()',
  /busyMs\(\): number \{[\s\S]{0,120}sim\.busyAccum/.test(pico)
    && /this\.busyAccum \+= performance\.now\(\) - busyStart;/.test(pico),
);

const types = readFileSync(join(root, 'src/webview/engines/types.mts'), 'utf8');
check('simulatedMs est au contrat SimEngine', /simulatedMs\?\(\): number;/.test(types));
check('busyMs est au contrat SimEngine', /busyMs\?\(\): number;/.test(types));

const sim = readFileSync(join(root, 'src/webview/sim.mts'), 'utf8');
check(
  'plus de second rAF de rendu pendant la simulation',
  /function queueRefresh\(\): void \{[\s\S]{0,400}if \(renderRaf\) return;/.test(sim),
  'queueRefresh replanifie un refreshVisuals alors que renderTick le fait déjà',
);
// Lu dans le CORPS de renderTick, pas par adjacence des deux appels : d'autres
// relevés de fin de frame viennent s'intercaler (formes d'onde analogiques…).
const renderTickBody = sim.slice(sim.indexOf('function renderTick'), sim.indexOf('function renderTick') + 500);
check(
  'la boucle de rendu met à jour la vitesse affichée',
  /refreshVisuals\(\);/.test(renderTickBody) && /updateSpeedBadge\(\);/.test(renderTickBody),
);
check(
  'le badge compare au ralenti VOLONTAIRE (menu 🐢), pas à 1×',
  /const wanted = Math\.min\(Number\(speedSelect\.value\) \|\| 1, 1\);/.test(sim)
    && /ratio < SPEED_WARN \* wanted/.test(sim),
);
check(
  'le badge disparaît à l\'arrêt de la simulation',
  /stopRenderLoop\(\);[\s\S]{0,120}resetSpeedBadge\(\);/.test(sim),
);
check('la fenêtre de mesure repart à chaque lancement', /engine\.start\(\);\s*resetSpeedBadge\(\);/.test(sim));

// --- La mesure ne s'arme qu'une fois le script DÉMARRÉ (v2026.8.3) ------------
check(
  'la mesure de vitesse est désarmée tant que le script MicroPython démarre',
  /speedArmed = !\(\s*isPicoBoard\(board\) && picoProgram\.kind === 'flash' && !!picoProgram\.script/.test(sim),
  'le badge remesurerait le boot du firmware et l\'injection du script',
);
check(
  'désarmée, la mesure ne conclut rien',
  /function updateSpeedBadge\(\): void \{\s*if \(!speedArmed\) return;/.test(sim),
);
check(
  'le signal onRunning arme la mesure (et remet la fenêtre à zéro)',
  /engine\.onRunning = \(\) => \{[\s\S]{0,200}armSpeedBadge\(\);/.test(sim)
    && /function armSpeedBadge\(\): void \{[\s\S]{0,200}speedArmed = true;[\s\S]{0,80}resetSpeedBadge\(\);/.test(sim),
);
check(
  'sketch AVR et REPL interactif n\'attendent rien : la mesure reste armée',
  /let speedArmed = true;/.test(sim),
  'sans valeur initiale vraie, un sketch Arduino ne serait jamais mesuré',
);

const html = readFileSync(join(root, 'src/webview-html.ts'), 'utf8');
check('le badge existe dans la barre d\'état', /id="sim-speed"[^>]*hidden/.test(html));

const css = readFileSync(join(root, 'media/styles.css'), 'utf8');
check('le badge a son style (et reste masqué par défaut)', /\.sim-speed \{/.test(css) && /\.sim-speed\[hidden\]/.test(css));

// --- Le RÉGLAGE de vitesse : un bouton carré, l'animal seul (demande de Frank :
// « le bouton est trop large »). Le <select> natif étalerait « 🐇 100 % » plus sa
// flèche : il est posé transparent par-dessus, sa liste garde les pourcentages.
{
  const bouton = /\.canvas-controls__speed \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const face = /\.canvas-controls__speed-face \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const liste = /\.canvas-controls__speed-select \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const std = /\.canvas-controls__btn \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const taille = (bloc, prop) => (new RegExp(`${prop}:\\s*([\\d.]+)px`).exec(bloc) ?? [])[1];
  check('le réglage de vitesse est un bouton CARRÉ, à la taille des autres',
    taille(bouton, 'width') === taille(std, 'width')
    && taille(bouton, 'height') === taille(std, 'height')
    && taille(bouton, 'width') === taille(bouton, 'height'),
    `${taille(bouton, 'width')}×${taille(bouton, 'height')} pour ${taille(std, 'width')}×${taille(std, 'height')}`);
  check('le bouton ne s\'élargit pas au contenu (flex: none)', /flex:\s*none/.test(bouton));
  check('le bouton se mesure bordures comprises, comme les <button> voisins',
    /box-sizing:\s*border-box/.test(bouton), 'sinon 30 px au lieu de 28 et la rangée déborde');
  // L'animal remplit le bouton à 1 px de la bordure : 28 px de bouton, moins les
  // deux bordures d'1 px, moins 1 px de jeu de chaque côté = 24 px de dessin.
  const px = Number(taille(face, 'width'));
  const vise = Number(taille(std, 'height')) - 4;
  check('l\'animal occupe le bouton en pleine taille (1 px de la bordure)',
    px === vise && Number(taille(face, 'height')) === vise,
    `${px}×${taille(face, 'height')} px de dessin pour ${vise} px visés`);
  check('les cinq dessins gardent leurs proportions dans le bouton',
    /object-fit:\s*contain/.test(face),
    'le guépard est long et l\'aigle haut : sans ça, ils seraient étirés au carré');
  check('rien ne sort du cadre arrondi', /overflow:\s*hidden/.test(bouton));
  check('la liste native est transparente et étalée sur tout le bouton',
    /position:\s*absolute/.test(liste) && /inset:\s*0/.test(liste) && /opacity:\s*0/.test(liste));
  check('les pourcentages restent dans la liste déroulante',
    /<option value="1"[^>]*>[^<]*100 %/.test(html) && /<option value="0.1"[^>]*>[^<]*10 %/.test(html)
    && /<option value="0.01"[^>]*>[^<]*1 %/.test(html));
  // --- Accéléré 200 % / 500 % (v2026.8.3) -----------------------------------
  check('la liste propose aussi 200 % et 500 %, avec leur animal',
    /<option value="2"[^>]*>🐆 200 %/.test(html) && /<option value="5"[^>]*>🦅 500 %/.test(html),
    'demande de Frank : « rajoute un 200 % et 500 % (icônes guépard et aigle) »');
  check('les vitesses vont du plus rapide au plus lent',
    ['5', '2', '1', '0.1', '0.01'].join()
      === [...html.matchAll(/<option value="([\d.]+)"/g)].map((m) => m[1]).join(),
    'l\'ordre de la liste doit suivre l\'échelle, sinon la molette saute au hasard');
  check('le moteur AVR accepte l\'accéléré (plus de plafond à 1×)',
    !/this\.speed = Math\.max\(0\.001, Math\.min\(1,/.test(avr),
    'Math.min(1, …) ramenait 200 % et 500 % à 100 % sans rien dire');
  check('le moteur Pico applique VRAIMENT la vitesse (setSpeed n\'est plus vide)',
    /setSpeed\(fraction: number\): void \{[\s\S]{0,400}this\.sim\.speed = /.test(pico)
    && /const aheadMs = \(clock\.nanos - this\.paceSim\) \/ 1e6 - \(now - this\.paceWall\) \* this\.speed;/.test(pico),
    'le menu de vitesse était décoratif sur Pico');
  check('la sieste du Pico est convertie en temps RÉEL (÷ speed)',
    /napMs = Math\.min\(\(aheadMs - 4\) \/ this\.speed, 40\)/.test(pico),
    'sinon un ralenti fort dort dix fois trop peu et brûle le processeur pour rien');
  // --- Le bandeau annonce la vitesse (v2026.8.3) -----------------------------
  check('le bandeau « Simulation en cours » annonce la vitesse si elle n\'est pas 100 %',
    /function simBannerText\(\): string \{[\s\S]{0,500}if \(vitesse === 1\) return t\('⚠ Simulation running: editing is disabled\.'\)/.test(sim)
    && /t\('⚠ Simulation running \(speed \{0\} %\): editing is disabled\.'/.test(sim),
    'rien à l\'écran ne rappelait qu\'on tourne au ralenti');
  check('changer de vitesse en pleine simulation réécrit le bandeau',
    /speedSelect\.addEventListener\('change'[\s\S]{0,320}simBanner\.textContent = simBannerText\(\)/.test(sim));
  check('changer de vitesse repart d\'une fenêtre de mesure neuve',
    /speedSelect\.addEventListener\('change'[\s\S]{0,400}resetSpeedBadge\(\)/.test(sim),
    'sinon la fenêtre à cheval sur deux régimes ferait clignoter le badge');
  check('le badge reste la sentinelle du TEMPS RÉEL (accéléré plafonné à 1×)',
    /const wanted = Math\.min\(Number\(speedSelect\.value\) \|\| 1, 1\);/.test(sim),
    'à 500 % demandés, le badge « ralentie » resterait allumé en permanence');
  check('la face du bouton reprend l\'animal de l\'option choisie',
    /id="speed-face"/.test(html) && /function updateSpeedFace\(\)/.test(sim)
    && /speedSelect\.addEventListener\('change'[\s\S]{0,160}updateSpeedFace\(\)/.test(sim));
  // --- Les animaux sont les DESSINS de Frank, pas des emoji (v2026.8.3) ------
  // Frank les a ajoutés à sa planche media/icones.svg : le bouton doit les
  // porter, l'emoji ne servant plus qu'à la liste native (qui ne sait afficher
  // que du texte).
  const ANIMAUX = [['escargot', '0.01'], ['tortue', '0.1'], ['lapin', '1'], ['guepard', '2'], ['aigle', '5']];
  const planche = readFileSync(join(root, 'media/icones.svg'), 'utf8');
  for (const [nom, valeur] of ANIMAUX) {
    check(`${nom} : dessin de Frank présent dans la planche et extrait`,
      new RegExp(`id="${nom}"`).test(planche) && existsSync(join(root, 'media', `${nom}.svg`)),
      `groupe « ${nom} » d'icones.svg → media/${nom}.svg (node scripts/_extract-icon.mjs ${nom} ${nom}.svg)`);
    check(`${nom} : porté par l'option ${valeur === '0.01' ? '1' : Number(valeur) * 100} %`,
      new RegExp(`<option value="${valeur.replace('.', '\\.')}"[^>]*data-icon="\\$\\{${nom === 'guepard' ? 'guepard' : nom}IconUri\\}"`).test(html),
      'la face lit `data-icon` de l\'option choisie');
    // Le dessin doit tenir DANS son viewBox : un groupe Inkscape posé à la main
    // porte sa propre matrice, que getBBox() ignore — le recadrage tombait à
    // côté et le bouton restait vide (constaté au rendu).
    const svg = readFileSync(join(root, 'media', `${nom}.svg`), 'utf8');
    const vb = (/viewBox="([-\d. ]+)"/.exec(svg) ?? [])[1] ?? '';
    const [, , w, h] = vb.split(' ').map(Number);
    check(`${nom} : recadré sur son dessin (viewBox non vide)`,
      w > 1 && h > 1 && w < 400 && h < 400, `viewBox « ${vb} »`);
  }
  check('la face du bouton est une IMAGE, plus un caractère emoji',
    /<img id="speed-face"[^>]*src="\$\{lapinIconUri\}"/.test(html)
    && /speedFace\.src = icone/.test(sim),
    'demande de Frank : « utilise les images ajoutées dans icones.svg »');
}

// Anti-clignotement : le démarrage (JIT du moteur, premier rendu, police des
// afficheurs) fait toujours une première seconde lente. La logique du badge est
// rejouée ici telle qu'elle est écrite dans sim.mts, sur des scénarios de mesures.
{
  const src = /const SPEED_WARMUP_WINDOWS = (\d+);[\s\S]*?const SPEED_SLOW_STREAK = (\d+);/.exec(sim);
  const [warmup, streakMin] = src ? [Number(src[1]), Number(src[2])] : [0, 1];
  /** Rejoue une suite de fenêtres (true = lente) et rend les états du badge. */
  const rejoue = (fenetres) => {
    let windows = 0;
    let streak = 0;
    return fenetres.map((slow) => {
      windows++;
      if (windows > warmup) streak = slow ? streak + 1 : 0;
      return slow && streak >= streakMin;
    });
  };
  check(
    'démarrage lent une seconde puis normal : le badge ne s\'allume jamais',
    rejoue([true, false, false, false]).every((v) => v === false),
    'c\'est exactement le cas relevé par Frank (0,77× pendant 1 s au lancement)',
  );
  check(
    'démarrage lent DEUX secondes puis normal : toujours rien',
    rejoue([true, true, false, false]).every((v) => v === false),
  );
  check(
    'ralenti durable : le badge finit par s\'allumer (et le reste)',
    rejoue([true, true, true, true, true]).slice(-2).every((v) => v === true),
  );
  check(
    'une seule fenêtre rapide suffit à éteindre le badge',
    rejoue([true, true, true, true, false]).at(-1) === false,
  );
  check(
    'schéma sain : le badge ne s\'allume pas',
    rejoue([false, false, false, false]).every((v) => v === false),
  );
}
check(
  'la fenêtre d\'échauffement et la série sont remises à zéro au lancement',
  /function resetSpeedBadge\(\): void \{[\s\S]{0,300}speedWindows = 0;[\s\S]{0,100}speedSlowStreak = 0;/.test(sim),
);
check(
  'l\'infobulle du badge donne la répartition moteur / rendu / navigateur',
  /simSpeedEl\.title =[\s\S]{0,400}t\('Engine'\)[\s\S]{0,200}t\('Rendering'\)[\s\S]{0,200}t\('Browser'\)/.test(sim)
    && /refreshAccum \+= performance\.now\(\) - t0;/.test(sim),
  'sans elle, impossible de savoir si le retard vient du moteur ou du rendu',
);

// --- Compteurs du canvas : chrono + vitesse (v2026.8.21) ---------------------
// Demande de Frank : « affiche le temps écoulé (min:sec:mil) et le pourcentage de
// vitesse en haut à droite de la simulation juste en dessous de la barre de
// dessin (fixe et non zoomable) avec 2 icônes (pas de texte) ».
{
  check('les compteurs existent dans le canvas, masqués au repos',
    /<div id="sim-gauge" class="sim-gauge" hidden>/.test(html));
  check('deux valeurs : le chrono et la vitesse',
    /id="sim-elapsed"[^>]*>00:00:000</.test(html) && /id="sim-rate"[^>]*>—</.test(html));
  check('deux icônes SEULES, sans texte à côté (demande de Frank)',
    (html.match(/class="sim-gauge__icon"/g) ?? []).length === 2
    && !/sim-gauge__icon"[^>]*>[^<]*<\/span>\s*<span[^>]*>[A-Za-zÀ-ÿ]/.test(html),
    'un libellé écrit à côté de l\'icône reprendrait la place que Frank veut libre');
  check('chaque compteur s\'explique dans son infobulle',
    /class="sim-gauge__item" title="\$\{l10n\.t\('Elapsed simulated time \(min:s:ms\)'\)\}"/.test(html)
    && /class="sim-gauge__item" title="\$\{l10n\.t\('Actual speed/.test(html),
    'sans texte visible, l\'infobulle est la seule explication');
  // Non zoomable : le calque transformé (.canvas__world) est monté en JS par
  // l'éditeur ; les compteurs, eux, sont dans le HTML statique du canvas — donc
  // frères du calque, jamais dedans. Ils ne suivent ni le zoom ni la translation.
  const dansCanvas = /<div id="canvas" class="canvas">([\s\S]*?)\n {6}<\/div>/.exec(html)?.[1] ?? '';
  const editeur = readFileSync(join(root, 'src/webview/diagram/editor.mts'), 'utf8');
  check('les compteurs sont HORS du calque zoomé (fixes à l\'écran)',
    /id="sim-gauge"/.test(dansCanvas)
    && /this\.world\.className = 'canvas__world';/.test(editeur)
    && /position:\s*relative/.test(/\.canvas \{([^}]*)\}/.exec(css)?.[1] ?? ''),
    'placés dans le calque transformé, ils suivraient le zoom et la translation');

  const gauge = /\.sim-gauge \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const barre = /\.canvas-controls \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const hautBarre = Number(/top:\s*(\d+)px/.exec(barre)?.[1] ?? 8);
  const hautGauge = Number(/top:\s*(\d+)px/.exec(gauge)?.[1] ?? 0);
  check('en haut à DROITE, sous la barre d\'outils',
    /position:\s*absolute/.test(gauge) && /right:\s*8px/.test(gauge) && hautGauge > hautBarre + 28,
    `top ${hautGauge}px pour une barre à ${hautBarre}px + 28 px de boutons`);
  check('les compteurs se masquent avec l\'attribut hidden', /\.sim-gauge\[hidden\] \{\s*display: none;/.test(css));
  check('les chiffres ne dansent pas (chasse fixe)',
    /font-variant-numeric:\s*tabular-nums/.test(/\.sim-gauge__value \{([^}]*)\}/.exec(css)?.[1] ?? ''),
    'sans tabular-nums, les millisecondes font vibrer toute la ligne');

  // Le formatage est celui de la PRODUCTION : la fonction est extraite de sim.mts
  // et exécutée telle quelle (recopiée dans le banc, elle ne prouverait rien).
  const src = /function formatElapsed\(ms: number\): string \{([\s\S]*?)\n\}/.exec(sim)?.[1] ?? '';
  const formatElapsed = new Function('ms', src.replace(/: (number|string)/g, ''));
  const cas = [[0, '00:00:000'], [7, '00:00:007'], [1234, '00:01:234'], [65432, '01:05:432'],
    [3600000, '60:00:000'], [-5, '00:00:000']];
  for (const [ms, attendu] of cas) {
    check(`${ms} ms → ${attendu}`, formatElapsed(ms) === attendu, `obtenu « ${formatElapsed(ms)} »`);
  }
  check('la boucle de rendu met à jour les compteurs à chaque image',
    /updateSpeedBadge\(\);\s*updateSimGauge\(\);/.test(sim));
  check('lancement : chrono à zéro et compteurs affichés',
    /engine\.start\(\);[\s\S]{0,200}resetSimGauge\(true\);/.test(sim));
  check('arrêt : plus de compteurs à l\'écran',
    /stopRenderLoop\(\);[\s\S]{0,200}resetSimGauge\(false\);/.test(sim));
  check('en pause, la fenêtre de mesure repart de zéro',
    /function updateSimGauge\(\): void \{[\s\S]{0,600}if \(engine\.paused\) \{\s*gaugeWallStart = 0;/.test(sim),
    'sinon la reprise afficherait 0 % pendant toute la durée de la pause');
  check('la vitesse est un pourcentage entier, mesuré sur une fenêtre courte',
    /const GAUGE_WINDOW_MS = (\d+);/.test(sim)
    && Number(/const GAUGE_WINDOW_MS = (\d+);/.exec(sim)[1]) <= 1000
    && /simRateEl\.textContent = `\$\{Math\.round\(gaugeRate \* 100\)\} %`;/.test(sim),
    'une fenêtre longue rendrait l\'affichage mou, un ratio brut serait illisible');
  check('avant la première mesure, la vitesse affiche « — » (pas 0 %)',
    /function resetSimGauge\(visible: boolean\): void \{[\s\S]{0,300}simRateEl\.textContent = '—';/.test(sim),
    '0 % au démarrage ferait croire à une simulation figée');

  const fr = JSON.parse(readFileSync(join(root, 'l10n/bundle.l10n.fr.json'), 'utf8'));
  check('les deux infobulles sont traduites en français',
    typeof fr['Elapsed simulated time (min:s:ms)'] === 'string'
    && typeof fr['Actual speed: simulated time over real time (100% = on time)'] === 'string');
}

const i18n = readFileSync(join(root, 'src/webview/i18n.mts'), 'utf8');
check(
  'les deux messages sont traduits en français',
  /'Slowed down: \{0\}× real time':/.test(i18n) && /'The page cannot keep up with the simulation\.':/.test(i18n),
);
check(
  'les postes de l\'infobulle sont traduits',
  /'Engine': 'Moteur'/.test(i18n) && /'Rendering': 'Rendu'/.test(i18n) && /'Browser': 'Navigateur'/.test(i18n),
);

console.log(failures === 0 ? '\n✅ vitesse de simulation : OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
