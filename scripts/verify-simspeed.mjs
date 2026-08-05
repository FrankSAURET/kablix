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
import { mkdtempSync, readFileSync } from 'node:fs';
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

// ------------------------------------------------------------- sources ----

const pico = readFileSync(join(root, 'src/webview/engines/pico.mts'), 'utf8');
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
check(
  'la boucle de rendu met à jour la vitesse affichée',
  /refreshVisuals\(\);\s*updateSpeedBadge\(\);/.test(sim),
);
check(
  'le badge compare au ralenti VOLONTAIRE (menu 🐢), pas à 1×',
  /const wanted = Number\(speedSelect\.value\) \|\| 1;/.test(sim) && /ratio < SPEED_WARN \* wanted/.test(sim),
);
check(
  'le badge disparaît à l\'arrêt de la simulation',
  /stopRenderLoop\(\);[\s\S]{0,120}resetSpeedBadge\(\);/.test(sim),
);
check('la fenêtre de mesure repart à chaque lancement', /engine\.start\(\);\s*resetSpeedBadge\(\);/.test(sim));

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
  // (Mesuré en navigateur : l'ENCRE d'un emoji fait la taille de sa police —
  // c'est sa boîte d'avance, plus large, qui déborde, d'où l'overflow rogné.)
  const px = Number(taille(face, 'font-size'));
  const vise = Number(taille(std, 'height')) - 4;
  check('l\'animal occupe le bouton en pleine taille (1 px de la bordure)',
    px === vise, `${px} px de police pour ${vise} px visés`);
  check('rien ne sort du cadre arrondi', /overflow:\s*hidden/.test(bouton));
  check('la liste native est transparente et étalée sur tout le bouton',
    /position:\s*absolute/.test(liste) && /inset:\s*0/.test(liste) && /opacity:\s*0/.test(liste));
  check('les pourcentages restent dans la liste déroulante',
    /<option value="1"[^>]*>[^<]*100 %/.test(html) && /<option value="0.1">[^<]*10 %/.test(html)
    && /<option value="0.01">[^<]*1 %/.test(html));
  check('la face du bouton reprend l\'animal de l\'option choisie',
    /id="speed-face"/.test(html) && /function updateSpeedFace\(\)/.test(sim)
    && /speedSelect\.addEventListener\('change'[\s\S]{0,160}updateSpeedFace\(\)/.test(sim));
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
