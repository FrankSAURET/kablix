// Test de bout en bout des condensateurs en MicroPython réel : vrai firmware,
// trois circuits RC lus sur ADC0/1/2 comme le projet `condo`.
//
// Ce que ça éprouve, c'est la chaîne complète : `machine.ADC(Pin(26)).read_u16()`
// doit rendre la tension que le moteur pose sur la broche, et la poser à
// l'instant EXACT de la conversion (setAnalogSampler) — pas la valeur d'avant.
// Trois tensions bien séparées, une par canal : personne ne peut lire un canal
// pour un autre.
//
// Joué sur LES DEUX CARTES : le projet condo a sa version Pico 2, et le
// diagnostic hors éditeur (`_diag-projix`) ne branche AUCUN composant — il
// affichait donc 0,00 V sur les trois canaux, ce qui ne prouvait rien du tout.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwareAbsent, firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-condo-'));
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

const VREF = 3.3;
// La broche de commande (GP15 dans le projet) fait basculer les trois RC : le
// moteur ne simule pas la charge ici, il pose directement le PALIER que le
// condensateur aurait atteint — ce qui est mesuré, c'est le chemin de lecture.
const CANAUX = [
  { gp: 26, bas: 0.10, haut: 2.90 },
  { gp: 27, bas: 0.50, haut: 2.00 },
  { gp: 28, bas: 1.65, haut: 1.65 }, // celui-ci ne bouge pas : témoin
];

const script = [
  'from machine import ADC, Pin',
  'import time',
  'charge = Pin(15, Pin.OUT, value=0)',
  'mesure = [ADC(Pin(26)), ADC(Pin(27)), ADC(Pin(28))]',
  'def lire(nom):',
  '    time.sleep_ms(300)',
  '    print(nom, " ".join("%.2f" % (a.read_u16() * 3.3 / 65535) for a in mesure))',
  '    time.sleep_ms(200)',
  "lire('BAS')",
  'charge.value(1)',
  "lire('HAUT')",
  'charge.value(0)',
  "lire('BAS')",
  "print('KX_DONE')",
  '',
].join('\n');

/** Rejoue le projet sur une carte et contrôle les trois tensions relues. */
async function essai(carte) {
  console.log(`\n--- ${carte.nom}`);
  const fw = firmwarePico(carte.prefixe);
  if (!fw) {
    console.log(`  SKIP : ${firmwareAbsent(carte.prefixe)}`);
    return true;
  }
  const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({
    addr: s.addr,
    data: s.data,
  }));
  const engine = new PicoEngine({ kind: 'flash', segments, script }, carte.famille);

  // L'échantillonneur relit l'état RÉEL de GP15 au moment de la conversion :
  // c'est le condensateur qui suit la commande, pas le banc qui devine.
  let conversions = 0;
  for (const c of CANAUX) {
    engine.setAnalogSampler(`GP${c.gp}`, () => {
      conversions++;
      // `value` rend un ETAT (Low/High/Input...), pas un booleen : c'est la
      // sortie elle-meme qu'il faut lire, et seulement si la broche pilote.
      const broche = engine.mcu.gpio[15];
      const commande = broche.outputEnable && broche.outputValue;
      return (commande ? c.haut : c.bas) / VREF;
    });
  }

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
      const ligne = (nom, champ) => `${nom} ${CANAUX.map((c) => c[champ].toFixed(2)).join(' ')}`;
      const bas = ligne('BAS', 'bas');
      const haut = ligne('HAUT', 'haut');
      const controles = [
        [`commande à 0 : ${bas}`, serial.includes(bas)],
        [`commande à 1 : ${haut}`, serial.includes(haut)],
        ['retour à 0 : la lecture redescend', serial.split(bas).length >= 3],
        [`conversion échantillonnée (${conversions} lectures)`, conversions >= 9],
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
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs} carte(s))` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
