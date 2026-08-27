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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
const { frontsUart, frontsWiegand } = await load('src/webview/diagram/rfid.mts', 'rfid.mjs');

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

/**
 * Bout en bout ARDUINO : le VRAI sketch de test, avec la VRAIE bibliotheque.
 *
 * Ce controle-la manquait, et c'est par ce trou qu'un defaut est passe :
 * SoftwareSerial fabrique ses delais de bit en comptant les instructions
 * executees. Compilee sans optimisation — le jeu d'options du pas a pas fidele —
 * elle derive de plus de 10 % et saute un bit sur six : le numero de badge
 * arrivait illisible, et rien ne se passait a l'ecran. Les bancs d'avant
 * relisaient les fronts avec leur propre decodeur, jamais avec la bibliotheque
 * compilee : ils voyaient tout juste. Ici, c'est le sketch de l'eleve qui lit.
 */
async function essaiArduino() {
  console.log('\n--- Arduino Uno / UART 9600 (SoftwareSerial compilee)');
  const uart = (part.rfid?.modes ?? []).find((m) => m.proto === 'uart');
  const ino = join(root, 'testkablix', 'Arduino', 'grove-rfid-uno', 'grove-rfid-uno.ino');
  if (!uart || !existsSync(ino)) {
    console.log('  SKIP : mode UART ou sketch de test absent.');
    return true;
  }
  const { compile, detectToolchain } = await load('src/compiler.ts', 'compiler.mjs');
  if (!detectToolchain().arduinoCli) {
    console.log('  SKIP : arduino-cli absent.');
    return true;
  }

  // Le programme compile est garde d'un banc a l'autre. La cle tient compte du
  // SKETCH et de compiler.ts : changer la strategie de compilation doit refaire
  // la compilation, sinon la regression passerait inapercue.
  const cache = join(root, 'node_modules', '.cache-rfid-e2e');
  mkdirSync(cache, { recursive: true });
  const cle = createHash('sha1')
    .update(readFileSync(ino))
    .update(readFileSync(join(root, 'src', 'compiler.ts')))
    .digest('hex')
    .slice(0, 12);
  const fichier = join(cache, `grove-rfid-uno-${cle}.json`);
  let mots;
  let journal = '';
  if (existsSync(fichier)) {
    const garde = JSON.parse(readFileSync(fichier, 'utf8'));
    mots = garde.mots;
    journal = garde.log ?? '';
  } else {
    console.log('  compilation du sketch…');
    const res = await compile('uno', ino, root);
    mots = Array.from(res.payload.bytes);
    journal = res.log ?? '';
    writeFileSync(fichier, JSON.stringify({ mots, log: journal }));
  }

  const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');
  const engine = new AvrEngine(Uint16Array.from(mots), null, 'avr328');
  let serial = '';
  engine.onSerial = (chunk) => {
    serial += chunk;
  };
  engine.setInput('2', true);   // repos : le fil d'un lecteur muet est HAUT
  engine.start();
  await new Promise((r) => setTimeout(r, 1500));   // le temps du setup()
  const code = uart.codes[0];
  engine.emitPulses('2', frontsUart(code, uart.baud));
  await new Promise((r) => setTimeout(r, 2500));
  engine.dispose?.();

  const controles = [
    ['la bibliotheque chronometree est compilee optimisee', /standard \(-Os\)/.test(journal) || journal === ''],
    ['le programme a demarre (invite sur le moniteur)', /Approchez un badge/.test(serial)],
    [`badge ${code} relu par SoftwareSerial`, serial.includes(`badge = ${code}`)],
  ];
  for (const [nom, bon] of controles) console.log(`  ${bon ? '\u2713' : '\u2717'} ${nom}`);
  if (!controles[2][1]) console.log(`    moniteur : ${JSON.stringify(serial.slice(0, 200))}`);
  return controles.every(([, c]) => c);
}

let echecs = 0;
for (const carte of CARTES_PICO) {
  if (!(await essai(carte))) echecs++;
}
if (!(await essaiArduino())) echecs++;
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs} carte(s))` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
