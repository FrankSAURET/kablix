// Test de bout en bout des capteurs DHT11 et DHT22 en MicroPython réel : vrai
// firmware, module `dht` du firmware, capteur branché côté moteur (setDht22).
// Le module bit-bang la ligne de données au microseconde près : il mesure donc
// aussi, indirectement, l'horloge de la puce.
//
// Un capteur PAR moteur, comme dans les projets : le DHT11 tient la ligne basse
// 18 ms au départ, le DHT22 seulement 1 ms, et les deux ensemble masquaient
// lequel des deux ne répondait pas.
//
// Joué sur LES DEUX CARTES : les projets dht11 et dht22 ont leur version Pico 2
// et personne ne les éprouvait — aucun banc de composant ne connaissait cette
// carte, et onze projets y restaient muets sans qu'un seul banc ne rougisse.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwareAbsent, firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-dht-'));
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

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

// Le DHT22 code des dixièmes, le DHT11 des entiers : deux jeux de valeurs bien
// distincts pour que personne ne puisse lire l'un à la place de l'autre.
const MODELES = [
  { modele: 'dht22', classe: 'DHT22', gp: 14, temp: 23.4, hum: 56.7, repos: 2.2 },
  { modele: 'dht11', classe: 'DHT11', gp: 22, temp: 25, hum: 60, repos: 1.2 },
];

/** Le programme de lecture, quatre tentatives : la première a le droit de rater. */
function scriptPour(m) {
  return [
    'from machine import Pin',
    'import dht',
    'import time',
    `capteur = dht.${m.classe}(Pin(${m.gp}))`,
    'for i in range(4):',
    `    time.sleep(${m.repos})`,
    '    try:',
    '        capteur.measure()',
    "        print('LU', capteur.temperature(), capteur.humidity())",
    '    except OSError as e:',
    "        print('RATEE', e)",
    "print('KX_DONE')",
    '',
  ].join('\n');
}

/** Lit un capteur sur une carte et contrôle les valeurs rendues. */
async function essai(carte, m) {
  console.log(`\n--- ${carte.nom} / ${m.classe}`);
  const fw = firmwarePico(carte.prefixe);
  if (!fw) {
    console.log(`  SKIP : ${firmwareAbsent(carte.prefixe)}`);
    return true;
  }
  const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({
    addr: s.addr,
    data: s.data,
  }));
  const engine = new PicoEngine({ kind: 'flash', segments, script: scriptPour(m) }, carte.famille);
  engine.setDht22([{ pin: `GP${m.gp}`, temperatureC: m.temp, humidity: m.hum, model: m.modele }]);

  let serial = '';
  engine.onSerial = (chunk) => {
    serial += chunk;
    process.stdout.write(chunk);
  };

  const started = Date.now();
  engine.start();

  return await new Promise((resolve) => {
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const fini = serial.includes('KX_DONE');
      if (!fini && elapsed <= 120) return;
      clearInterval(timer);
      engine.dispose();
      const controles = [
        [`lu à ${m.temp} °C / ${m.hum} %`, serial.includes(`LU ${m.temp} ${m.hum}`)],
        ['programme allé au bout', fini],
      ];
      console.log(`\n  --- ${elapsed.toFixed(1)} s ---`);
      for (const [nom, bon] of controles) console.log(`  ${bon ? '✓' : '✗'} ${nom}`);
      resolve(controles.every(([, c]) => c));
    }, 500);
  });
}

let echecs = 0;
for (const carte of CARTES_PICO) {
  for (const m of MODELES) {
    if (!(await essai(carte, m))) echecs++;
  }
}
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs} cas)` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
