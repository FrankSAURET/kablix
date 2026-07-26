// Cadencement de la simulation AVR : le sketch doit s'exécuter à la vitesse d'une
// VRAIE carte, même quand la page est occupée ailleurs (repeinture, moniteur
// série, layout). L'ancienne boucle repartait de l'instant courant à chaque
// tranche : tout le temps volé à la boucle était du temps SIMULÉ PERDU, jamais
// rattrapé — un `delay(100)` pouvait durer plusieurs secondes à l'écran. La
// boucle s'ancre désormais sur le temps mur (comme le moteur Pico) et rattrape
// son retard, dans la limite de MAX_DEBT_MS.
//
// Le banc mesure le rapport temps simulé / temps réel du VRAI moteur, avec et
// sans charge concurrente qui bloque le thread.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-rt-'));

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

const CLOCK_HZ = 16_000_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Occupe le thread pendant `ms` (comme une repeinture de la page). */
const bloque = (ms) => {
  const fin = performance.now() + ms;
  while (performance.now() < fin) {
    /* rien : on vole le thread, exactement comme le rendu du navigateur */
  }
};

/**
 * Lance le moteur, laisse tourner `dureeMs` de temps RÉEL en exécutant `charge`
 * (facultative) toutes les `periodeMs`, et renvoie le rapport temps simulé /
 * temps réel : 1 = à l'heure, 0,1 = dix fois trop lent.
 */
async function facteur({ dureeMs, blocageMs = 0, periodeMs = 100, speed = 1, prechauffeMs = 150 }) {
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  eng.setSpeed(speed);
  eng.start();
  await sleep(prechauffeMs); // le temps que le pacing s'établisse
  const timer = blocageMs > 0 ? setInterval(() => bloque(blocageMs), periodeMs) : null;
  const c0 = eng.cpu.cycles;
  const t0 = performance.now();
  await sleep(dureeMs);
  const simMs = ((eng.cpu.cycles - c0) / CLOCK_HZ) * 1000;
  const reelMs = performance.now() - t0;
  if (timer) clearInterval(timer);
  eng.stop();
  eng.dispose();
  return { ratio: simMs / reelMs, simMs, reelMs };
}

// 1. Thread libre : à l'heure, et JAMAIS plus vite qu'une vraie carte.
{
  const r = await facteur({ dureeMs: 600 });
  check(
    `thread libre : ${r.ratio.toFixed(2)}× le temps réel`,
    r.ratio > 0.85 && r.ratio < 1.15,
    `${r.simMs.toFixed(0)} ms simulées en ${r.reelMs.toFixed(0)} ms réelles`,
  );
}

// 2. Page occupée 30 % du temps (repeinture) : le retard doit se RATTRAPER.
//    Avec l'ancienne boucle, chaque blocage était perdu sec.
{
  const r = await facteur({ dureeMs: 900, blocageMs: 30, periodeMs: 100 });
  check(
    `page occupée 30 % : ${r.ratio.toFixed(2)}× le temps réel (seuil 0,75)`,
    r.ratio > 0.75,
    `${r.simMs.toFixed(0)} ms simulées en ${r.reelMs.toFixed(0)} ms réelles`,
  );
}

// 3. Blocage isolé de 200 ms (une grosse frame) : entièrement rattrapé.
{
  const r = await facteur({ dureeMs: 900, blocageMs: 200, periodeMs: 800 });
  check(
    `blocage isolé de 200 ms : ${r.ratio.toFixed(2)}× le temps réel (seuil 0,75)`,
    r.ratio > 0.75,
    `${r.simMs.toFixed(0)} ms simulées en ${r.reelMs.toFixed(0)} ms réelles`,
  );
}

// 4. Blocage énorme (au-delà de la dette rattrapable) : la simulation reprend à
//    l'heure SANS s'emballer — sinon les delay() suivants seraient escamotés.
{
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  eng.start();
  await sleep(150);
  bloque(700); // > MAX_DEBT_MS : la dette est abandonnée
  await sleep(50);
  const c0 = eng.cpu.cycles;
  const t0 = performance.now();
  await sleep(400);
  const ratio = (((eng.cpu.cycles - c0) / CLOCK_HZ) * 1000) / (performance.now() - t0);
  eng.stop();
  eng.dispose();
  check(
    `après un blocage de 700 ms : ${ratio.toFixed(2)}× le temps réel, pas d'emballement`,
    ratio > 0.8 && ratio < 1.3,
    'la simulation rattrape une dette qu\'elle aurait dû abandonner',
  );
}

// 5. Ralenti volontaire (menu 🐢 10 %) : toujours respecté.
{
  const r = await facteur({ dureeMs: 700, speed: 0.1 });
  check(
    `ralenti 10 % : ${r.ratio.toFixed(2)}× le temps réel`,
    r.ratio > 0.06 && r.ratio < 0.16,
    `${r.simMs.toFixed(0)} ms simulées en ${r.reelMs.toFixed(0)} ms réelles`,
  );
}

// 6. Pause : plus rien n'avance, et la reprise repart à l'heure (ancre remise).
{
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  eng.start();
  await sleep(150);
  eng.pause();
  await sleep(50);
  const cPause = eng.cpu.cycles;
  await sleep(250);
  const fige = eng.cpu.cycles === cPause;
  eng.resume();
  await sleep(50);
  const c0 = eng.cpu.cycles;
  const t0 = performance.now();
  await sleep(400);
  const ratio = (((eng.cpu.cycles - c0) / CLOCK_HZ) * 1000) / (performance.now() - t0);
  eng.stop();
  eng.dispose();
  check('en pause, le temps simulé ne bouge plus', fige, `${eng.cpu.cycles - cPause} cycles de trop`);
  check(
    `reprise après pause : ${ratio.toFixed(2)}× le temps réel (pas de rattrapage de la pause)`,
    ratio > 0.8 && ratio < 1.3,
  );
}

// 7. Arrêt : la boucle ne se replanifie plus (ni timer, ni MessageChannel).
{
  const eng = new AvrEngine(UNO_DEMO, null, 'avr328');
  eng.start();
  await sleep(120);
  eng.stop();
  const c0 = eng.cpu.cycles;
  await sleep(200);
  check('après stop, plus aucun cycle', eng.cpu.cycles === c0, `${eng.cpu.cycles - c0} cycles`);
  eng.dispose();
}

// ------------------------------------------------------------- source ----

const src = readFileSync(join(root, 'src/webview/engines/avr.mts'), 'utf8');
check("l'ancre temps mur ↔ temps simulé existe", /paceWall/.test(src) && /paceCycles/.test(src));
check('la dette rattrapable est bornée', /MAX_DEBT_MS\s*=\s*\d+/.test(src));
check(
  'le yield passe par MessageChannel (setTimeout(0) est bridé à ~4 ms)',
  /new MessageChannel\(\)/.test(src) && /postMessage\(this\.yieldGen\)/.test(src),
);
check(
  "plus de cadencement sur le seul « dt depuis la tranche précédente »",
  !/lastTickMs/.test(src),
  'lastTickMs est encore là',
);

console.log(failures === 0 ? '\n✅ cadencement temps réel : OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
