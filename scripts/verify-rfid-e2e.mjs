// Banc de bout en bout du LECTEUR DE BADGES sur une vraie Pico : firmware
// MicroPython réel, impulsions Wiegand posées par le composant, numéro relu par
// le programme.
//
// C'est le seul composant de la bibliothèque qui PARLE au microcontrôleur : ses
// impulsions ne durent que 50 µs, mille fois moins qu'une image d'écran. Elles
// ne sont donc pas posées une par une depuis la page mais datées en temps
// SIMULÉ (`emitPulses`), et rien d'autre qu'un vrai firmware ne peut prouver
// qu'elles arrivent au bon moment : ici, MicroPython les compte par interruption
// et doit retrouver le numéro de départ, à la barre près.
//
// Pourquoi le Wiegand seulement : sur une Pico émulée, la liaison série
// MATÉRIELLE ne relit pas l'état des broches — le mode UART du lecteur est donc
// muet côté Pico (il marche sur Arduino, par liaison série logicielle, qui elle
// lit bien la broche). Les deux cartes RP2040 et RP2350 sont éprouvées.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwareAbsent, firmwarePico } from './_firmware.mjs';
import { lireKompix } from './_lire-kompix.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-rfid-e2e-'));
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
const { frontsWiegand } = await load('src/webview/diagram/rfid.mts', 'rfid.mjs');

// Le contrat vient du PAQUET, pas d'une copie : si Frank change les numéros de
// badge ou la durée des impulsions, le banc suit tout seul.
const part = await lireKompix('grove-rfid');
const wiegand = (part.rfid?.modes ?? []).find((m) => m.proto === 'wiegand');
if (!wiegand) {
  console.log('RESULTAT: ECHEC (le paquet grove-rfid n’a plus de mode Wiegand)');
  process.exit(1);
}
const BADGES = wiegand.codes.slice(0, 2);
const D0 = 16; // le fil « Tx » du module porte les zéros
const D1 = 17; // le fil « Rx » porte les uns

/** Le programme de lecture : les impulsions se comptent par INTERRUPTION. */
const SCRIPT = [
  'from machine import Pin',
  'import time',
  'BITS = 26',
  `d0 = Pin(${D0}, Pin.IN)`,
  `d1 = Pin(${D1}, Pin.IN)`,
  'recus = []',
  'def front0(p):',
  '    recus.append(0)',
  'def front1(p):',
  '    recus.append(1)',
  'd0.irq(trigger=Pin.IRQ_FALLING, handler=front0)',
  'd1.irq(trigger=Pin.IRQ_FALLING, handler=front1)',
  "print('KX_PRET')",
  'lus = 0',
  'for i in range(400):',
  '    if len(recus) >= BITS:',
  '        mot = 0',
  '        for b in recus[:BITS]:',
  '            mot = (mot << 1) | b',
  '        del recus[:BITS]',
  "        print('BADGE {:07X}'.format(mot))",
  '        lus += 1',
  `        if lus >= ${BADGES.length}:`,
  '            break',
  '    time.sleep_ms(50)',
  "print('KX_DONE')",
  '',
].join('\n');

/** Passe les badges devant le lecteur d'une carte et contrôle ce qui est lu. */
async function essai(carte) {
  console.log(`\n--- ${carte.nom} / Wiegand 26 bits`);
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
  // Repos : les deux fils d'un lecteur qui ne parle pas sont HAUTS. Sans cette
  // pose, la première descente passerait inaperçue.
  engine.setInput(`GP${D0}`, true);
  engine.setInput(`GP${D1}`, true);

  let serial = '';
  let arme = false;
  engine.onSerial = (chunk) => {
    serial += chunk;
    process.stdout.write(chunk);
    if (arme || !serial.includes('KX_PRET')) return;
    arme = true;
    // Les badges se présentent l'un après l'autre, au rythme du vrai module.
    BADGES.forEach((code, i) => {
      setTimeout(() => {
        const trame = frontsWiegand(code, { pulseUs: wiegand.pulseUs, gapUs: wiegand.gapUs });
        engine.emitPulses(`GP${D0}`, trame.data);
        engine.emitPulses(`GP${D1}`, trame.data1);
      }, 1000 + i * 2000);
    });
  };

  const debut = Date.now();
  engine.start();

  return await new Promise((resolve) => {
    const timer = setInterval(() => {
      const secondes = (Date.now() - debut) / 1000;
      const fini = serial.includes('KX_DONE');
      if (!fini && secondes <= 180) return;
      clearInterval(timer);
      engine.dispose();
      const controles = BADGES.map((code) => [
        `badge ${code} relu bit à bit`,
        serial.includes(`BADGE ${code.toUpperCase()}`),
      ]);
      controles.push(['programme allé au bout', fini]);
      console.log(`\n  --- ${secondes.toFixed(1)} s ---`);
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
