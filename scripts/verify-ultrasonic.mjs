// Banc du capteur ultrason HC-SR04 : la TEMPÉRATURE de l'air change la vitesse
// du son, donc la durée de l'écho pour une même distance.
//
// 4 parties :
//   A. physique pure (module engines/ultrasonic.mts) exécutée en Node ;
//   B. câblage statique (moteurs, sim.mts, catalogue, i18n, composant) ;
//   C. rendu du composant en Chrome headless : deux curseurs en simulation,
//      la température émet `input`, la valeur est bornée ;
//   D. bout en bout SUR LE VRAI MOTEUR Pico + firmware MicroPython : un script
//      mesure l'écho avec time_pulse_us, le banc change la température entre
//      deux mesures et vérifie que la durée suit la vitesse du son.
//      (sauté si test-assets/RPI_PICO-*.uf2 est absent)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { firmwarePico } from './_firmware.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');
const CACHE = join(ROOT, 'node_modules', '.cache-ultrasonic');
mkdirSync(CACHE, { recursive: true });

let ok = 0;
const fails = [];
const check = (cond, label) => {
  if (cond) {
    ok++;
  } else {
    fails.push(label);
    console.log(`  ✗ ${label}`);
  }
};
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- A. physique
const modOut = join(CACHE, 'ultrasonic.mjs');
await esbuild({
  entryPoints: [join(ROOT, 'src/webview/engines/ultrasonic.mts')],
  outfile: modOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const phys = await import(pathToFileURL(modOut).href + `?t=${Date.now()}`);
const { soundSpeedMs, echoUsPerCm, clampAirTemp, DEFAULT_AIR_TEMP_C, AIR_TEMP_MIN_C, AIR_TEMP_MAX_C } = phys;

check(DEFAULT_AIR_TEMP_C === 20, 'température par défaut = 20 °C');
check(AIR_TEMP_MIN_C === -20 && AIR_TEMP_MAX_C === 60, 'plage réglable −20…60 °C');
check(near(soundSpeedMs(20), 343.42, 0.01), `c(20 °C) ≈ 343,4 m/s (obtenu ${soundSpeedMs(20).toFixed(2)})`);
check(near(soundSpeedMs(0), 331.3, 0.01), `c(0 °C) = 331,3 m/s (obtenu ${soundSpeedMs(0).toFixed(2)})`);
check(near(soundSpeedMs(-20), 319.18, 0.01), `c(−20 °C) ≈ 319,2 m/s (obtenu ${soundSpeedMs(-20).toFixed(2)})`);
check(soundSpeedMs(60) > soundSpeedMs(20) && soundSpeedMs(20) > soundSpeedMs(-20), 'c croît avec la température');
// La constante 58 µs/cm des exemples Arduino doit tomber à ~20 °C, pas ailleurs.
check(near(echoUsPerCm(20), 58.24, 0.01), `58 µs/cm retrouvés à 20 °C (obtenu ${echoUsPerCm(20).toFixed(2)})`);
check(Math.abs(echoUsPerCm(20) - 58) < 0.3, 'écart < 0,3 µs/cm avec la constante 58 à 20 °C');
check(echoUsPerCm(-20) > echoUsPerCm(20) * 1.05, 'air froid → écho notablement PLUS long (> +5 %)');
check(echoUsPerCm(60) < echoUsPerCm(20) * 0.96, 'air chaud → écho PLUS court (> −4 %)');
// Aller-retour : 100 cm à 20 °C = 5824 µs (2 m parcourus à 343,4 m/s).
check(near(100 * echoUsPerCm(20), 5824, 2), `100 cm à 20 °C → ${(100 * echoUsPerCm(20)).toFixed(0)} µs (aller-retour)`);
check(clampAirTemp(999) === AIR_TEMP_MAX_C && clampAirTemp(-999) === AIR_TEMP_MIN_C, 'températures hors plage recalées');
check(clampAirTemp(Number.NaN) === DEFAULT_AIR_TEMP_C, 'température non numérique → 20 °C');
check(clampAirTemp(37) === 37, 'température dans la plage inchangée');

// -------------------------------------------------------- B. câblage statique
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const avr = read('src/webview/engines/avr.mts');
const pico = read('src/webview/engines/pico.mts');
const simTs = read('src/webview/sim.mts');
const catalog = read('src/webview/diagram/catalog.mts');
const i18n = read('src/webview/i18n.mts');
const types = read('src/webview/engines/types.mts');
const elem = read('src/webview/composants/hc-sr04-element.mts');

for (const [name, src] of [['avr.mts', avr], ['pico.mts', pico]]) {
  check(/echoUsPerCm\(s\.temperatureC \?\? DEFAULT_AIR_TEMP_C\)/.test(src), `${name} : largeur d'écho calculée par echoUsPerCm(température)`);
  check(/from '\.\/ultrasonic\.mjs'/.test(src), `${name} : importe le module de physique`);
  check(!/cm \* 58 \*/.test(src), `${name} : plus de constante 58 µs/cm en dur`);
}
check(/temperatureC\?: number/.test(types), 'types.mts : UltrasonicSensor porte temperatureC');
check(/sensor\.temperatureC = clampAirTemp\(Number\(el\.temperature/.test(simTs), 'sim.mts : le curseur de température mute le sensor');
check(/el\.temperature = temp/.test(simTs), 'sim.mts : curseur synchronisé avec la température de départ');
check(/attrs\?\.temperature \?\? DEFAULT_AIR_TEMP_C/.test(simTs), "sim.mts : température de départ lue dans l'attribut du composant");
check(/temperature: '20'/.test(catalog), 'catalog.mts : attribut temperature = 20 par défaut');
check(/attr: 'temperature', label: 'Air temperature \(°C\)'/.test(catalog), "catalog.mts : propriété d'inspecteur ajoutée");
check(/min: -20, max: 60/.test(catalog), 'catalog.mts : inspecteur borné −20…60 °C');
check(/'Air temperature \(°C\)': 'Température de l’air \(°C\)'/.test(i18n), 'i18n : libellé FR de la température');
check(/temperature: \{ type: Number \}/.test(elem), 'composant : propriété temperature déclarée');
check(/from '\.\.\/engines\/ultrasonic\.mjs'/.test(elem), 'composant : même module de physique que les moteurs (pas de formule dupliquée)');
check(!/331\.3/.test(elem), 'composant : aucune formule de vitesse du son recopiée');

// ------------------------------------------ C. rendu du composant en headless
const CHROME =
  process.env.CHROME_PATH ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(
    (p) => existsSync(p)
  );

const entry = `
import '${SRC}/composants/hc-sr04-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const el = document.createElement('kablix-hc-sr04');
  document.body.appendChild(el);
  await el.updateComplete;
  const idle = el.renderRoot.querySelectorAll('input[type=range]').length;
  el.simulating = true;
  await el.updateComplete;
  await wait(20);
  const ranges = [...el.renderRoot.querySelectorAll('input[type=range]')];
  const temp = el.renderRoot.querySelector('input.temp');
  const row = temp ? temp.closest('.row') : null;
  let events = 0;
  el.addEventListener('input', () => events++);
  temp.value = '-5';
  temp.dispatchEvent(new Event('input'));
  await el.updateComplete;
  const afterCold = el.temperature;
  const coldLabel = row ? row.querySelector('.val').textContent.trim() : '';
  const coldTitle = row ? row.getAttribute('title') : '';
  // Distance intacte quand on ne touche qu'à la température.
  const distanceKept = el.distance;
  // Bornage : une valeur au-delà de la plage est recalée.
  temp.value = '900';
  temp.dispatchEvent(new Event('input'));
  await el.updateComplete;
  const clamped = el.temperature;
  const out = {
    idle, ranges: ranges.length, hasTemp: !!temp, events,
    afterCold, coldLabel, coldTitle, distanceKept, clamped,
    defaultTemp: 20,
  };
  const pre = document.createElement('pre');
  pre.id = 'measures';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
}
run();
`;
const entryFile = join(CACHE, 'entry.mjs');
writeFileSync(entryFile, entry);
const bundle = join(CACHE, 'bundle.js');
await esbuild({
  entryPoints: [entryFile],
  outfile: bundle,
  bundle: true,
  format: 'iife',
  loader: { '.svg': 'text', '.webp': 'dataurl' },
  logLevel: 'silent',
});
const page = join(CACHE, 'page.html');
writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><script>${readFileSync(bundle, 'utf8')}</script></body>`);

if (!CHROME) {
  console.log('  SKIP rendu : Chrome introuvable (CHROME_PATH).');
} else {
  const url = 'file:///' + page.replace(/\\/g, '/');
  const dom = execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const m = dom.match(/<pre id="measures">([\s\S]*?)<\/pre>/);
  if (!m) {
    check(false, 'rendu : mesures absentes (le composant n’a pas rendu)');
  } else {
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    check(r.idle === 0, 'hors simulation : aucun curseur');
    check(r.ranges === 2, `en simulation : DEUX curseurs (distance + température), obtenu ${r.ranges}`);
    check(r.hasTemp, 'curseur de température présent (input.temp)');
    check(r.events >= 1, 'bouger la température émet un event input (relu par sim.mts)');
    check(r.afterCold === -5, `température appliquée au composant (obtenu ${r.afterCold})`);
    check(/-5\s*°C/.test(r.coldLabel), `valeur affichée en °C (obtenu ${JSON.stringify(r.coldLabel)})`);
    // c(−5 °C) = 331,3 − 0,606 × 5 = 328,3 m/s
    check(/328\.3 m\/s/.test(r.coldTitle), `bulle : vitesse du son à −5 °C (obtenu ${JSON.stringify(r.coldTitle)})`);
    check(r.distanceKept === 20, 'régler la température ne touche pas la distance');
    check(r.clamped === 60, `température bornée à 60 °C (obtenu ${r.clamped})`);
  }
}

// --------------------------------- D. bout en bout sur le vrai moteur Pico
const fw = firmwarePico();
if (!fw) {
  console.log('  SKIP moteur : firmware MicroPython absent (test-assets/RPI_PICO-*.uf2).');
} else {
  const tmp = mkdtempSync(join(tmpdir(), 'kablix-us-'));
  const load = async (rel, name) => {
    const out = join(tmp, name);
    await esbuild({
      entryPoints: [join(ROOT, rel)],
      outfile: out,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    });
    return import(pathToFileURL(out).href);
  };
  const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
  const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
  const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

  // Le script mesure DEUX fois le même obstacle ; le banc refroidit l'air entre
  // les deux (mutation de l'objet sensor, la référence est partagée avec le moteur).
  const script = [
    'from machine import Pin, time_pulse_us',
    'import time',
    'trig = Pin(15, Pin.OUT)',
    'echo = Pin(14, Pin.IN)',
    'def mesure():',
    '    trig.value(0)',
    '    time.sleep_us(5)',
    '    trig.value(1)',
    '    time.sleep_us(10)',
    '    trig.value(0)',
    '    return time_pulse_us(echo, 1, 30000)',
    "print('US1', mesure())",
    'time.sleep_ms(600)',
    "print('US2', mesure())",
    '',
  ].join('\n');

  const sensor = { trig: 'GP15', echo: 'GP14', distanceCm: 100, temperatureC: 20 };
  const engine = new PicoEngine({ kind: 'flash', segments, script });
  engine.setUltrasonic([sensor]);
  let serial = '';
  let cooled = false;
  engine.onSerial = (chunk) => {
    serial += chunk;
    // Dès la première mesure imprimée : air refroidi à −20 °C pour la seconde.
    if (!cooled && /US1 \d+/.test(serial)) {
      cooled = true;
      sensor.temperatureC = -20;
    }
  };
  console.log('  … mesure sur le vrai moteur Pico (max 120 s)');
  engine.start();
  const started = Date.now();
  const result = await new Promise((resolve) => {
    const timer = setInterval(() => {
      const done = /US1 (\d+)[\s\S]*US2 (\d+)/.exec(serial);
      if (done) {
        clearInterval(timer);
        engine.dispose();
        resolve({ warm: Number(done[1]), cold: Number(done[2]), secs: (Date.now() - started) / 1000 });
      } else if ((Date.now() - started) / 1000 > 120) {
        clearInterval(timer);
        engine.dispose();
        resolve(null);
      }
    }, 250);
  });
  if (!result) {
    check(false, `moteur : délai dépassé (série reçue : ${JSON.stringify(serial.slice(-200))})`);
  } else {
    const expWarm = 100 * echoUsPerCm(20); // 5824 µs
    const expCold = 100 * echoUsPerCm(-20); // 6266 µs
    console.log(`  … US1 = ${result.warm} µs (attendu ${expWarm.toFixed(0)}), US2 = ${result.cold} µs (attendu ${expCold.toFixed(0)}) en ${result.secs.toFixed(1)} s`);
    check(near(result.warm, expWarm, 60), `écho à 20 °C ≈ ${expWarm.toFixed(0)} µs (obtenu ${result.warm})`);
    check(near(result.cold, expCold, 60), `écho à −20 °C ≈ ${expCold.toFixed(0)} µs (obtenu ${result.cold})`);
    check(result.cold > result.warm + 300, "l'air froid allonge nettement l'écho (obstacle immobile)");
    // Ce que verra le programme utilisateur qui divise par 58 : une distance FAUSSE.
    const seen = result.cold / 58;
    check(seen > 105, `programme non compensé : 100 cm lus ${seen.toFixed(0)} cm à −20 °C (erreur visible)`);
  }
}

if (fails.length) {
  console.log(`\nultrasonic : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\nultrasonic : ${ok} contrôles OK — la température de l'air pilote la vitesse du son et la durée de l'écho.`);
process.exit(0); // le moteur Pico laisse des minuteries actives : sortir explicitement
