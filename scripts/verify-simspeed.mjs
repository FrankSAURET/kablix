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
  // Page occupée pour de bon (60 % du temps volé) : la mesure doit DÉCROCHER,
  // sinon le badge ne se déclencherait jamais quand la page rame.
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  eng.start();
  await sleep(150);
  const timer = setInterval(() => bloque(60), 100);
  const t0 = performance.now();
  const s0 = eng.simulatedMs();
  await sleep(600);
  const ratio = (eng.simulatedMs() - s0) / (performance.now() - t0);
  clearInterval(timer);
  eng.stop();
  eng.dispose();
  check(
    `page occupée 60 % : mesure ${ratio.toFixed(2)}× — un décrochage est visible`,
    ratio < 0.95,
    'la mesure reste à 1 alors que la page est saturée',
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

const types = readFileSync(join(root, 'src/webview/engines/types.mts'), 'utf8');
check('simulatedMs est au contrat SimEngine', /simulatedMs\?\(\): number;/.test(types));

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

const i18n = readFileSync(join(root, 'src/webview/i18n.mts'), 'utf8');
check(
  'les deux messages sont traduits en français',
  /'Slowed down: \{0\}× real time':/.test(i18n) && /'The page cannot keep up with the simulation\.':/.test(i18n),
);

console.log(failures === 0 ? '\n✅ vitesse de simulation : OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
