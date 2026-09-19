// Test de bout en bout du DS18B20 en MicroPython réel : vrai firmware, modules
// `onewire` et `ds18x20` du firmware, capteur branché côté moteur (setDs18b20).
//
// CE QU'IL AJOUTE AUX DEUX AUTRES BANCS. `verify-ds18b20.mjs` éprouve le module
// de protocole seul, `verify-ds18b20-moteur.mjs` son branchement au moteur AVR.
// Ni l'un ni l'autre ne fait tourner `onewire.OneWire(...).scan()` — le code que
// l'utilisateur écrit vraiment — et c'est là que le capteur se comptait à ZÉRO
// alors que les deux bancs restaient verts.
//
// LE SCAN EST LE POINT DUR. Il ne suffit pas de répondre au RESET : `scan()`
// lance un SEARCH ROM (0xF0), qui n'est pas un échange d'octets ordinaire. Pour
// CHACUN des 64 bits d'adresse, le maître ouvre DEUX créneaux de lecture — le
// bit puis son complément — et écrit ensuite le bit qu'il retient. Un capteur
// qui sait répondre à READ ROM mais pas à SEARCH ROM donne exactement le défaut
// constaté : présence détectée, scan vide, « capteurs trouves : 0 ».
//
// Joué sur LES DEUX CARTES, comme verify-dht-e2e.mjs.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwareAbsent, firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-ds18-e2e-'));
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

/** Le capteur du schéma de test `ds18b20-pico.projix` : sonde étanche sur GP14. */
const GP = 14;
const TEMP = 23.5;
/** Un demi-degré pile : codé exactement en 12 bits, aucune tolérance à prévoir. */
const ATTENDU = '23.5';

/**
 * Le programme, décalqué de `testkablix/ds18b20-pico.py`.
 *
 * Trois passes : la première mesure a le droit de tomber pendant que la ligne
 * s'établit, les suivantes non.
 */
const SCRIPT = [
  'from machine import Pin',
  'import onewire',
  'import ds18x20',
  'import time',
  '',
  `fil = onewire.OneWire(Pin(${GP}))`,
  'capteurs = ds18x20.DS18X20(fil)',
  'adresses = capteurs.scan()',
  "print('TROUVES', len(adresses))",
  'for a in adresses:',
  "    print('ADRESSE', ''.join('%02x' % o for o in a))",
  'for i in range(3):',
  '    try:',
  '        capteurs.convert_temp()',
  '        time.sleep(0.8)',
  '        for a in adresses:',
  "            print('T', capteurs.read_temp(a))",
  '    except Exception as e:',
  "        print('RATEE', e)",
  "print('KX_DONE')",
  '',
].join('\n');

/** Joue le programme sur une carte et contrôle ce qui sort du port série. */
async function essai(carte) {
  console.log(`\n--- ${carte.nom} / DS18B20 sur GP${GP}`);
  const fw = firmwarePico(carte.prefixe);
  if (!fw) {
    console.log(`  SKIP : ${firmwareAbsent(carte.prefixe)}`);
    return true;
  }
  const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({
    addr: s.addr,
    data: s.data,
  }));
  const engine = new PicoEngine({ kind: 'flash', segments, script: SCRIPT }, carte.famille);
  engine.setDs18b20([{ id: 'Capt1', pin: `GP${GP}`, temperatureC: TEMP }]);

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
      if (!fini && elapsed <= 180) return;
      clearInterval(timer);
      engine.dispose();
      // Le code famille 0x28 ouvre la ROM d'un DS18B20 : une adresse qui ne
      // commence pas par lui n'est pas celle d'un capteur de ce type.
      const adresse = /ADRESSE ([0-9a-f]{16})/.exec(serial)?.[1];
      const controles = [
        ['le scan 1-Wire trouve UN capteur', /TROUVES 1\b/.test(serial)],
        ['son adresse commence par le code famille 28', !!adresse && adresse.startsWith('28')],
        [`la température lue est ${ATTENDU} °C`, serial.includes(`T ${ATTENDU}`)],
        ['aucune lecture ratée', !serial.includes('RATEE')],
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
  if (!(await essai(carte))) echecs++;
}
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs} cas)` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
