// LES PINCES POSÉES SUR SDA / SCL VOIENT LE BUS I²C.
//
// LE DÉFAUT (Frank, 07/10/2026, « 16 servo + alim-pico2 ») : trois sondes sur
// GP8/GP9, l'analyseur « en attente du front de déclenchement » pour toujours.
// Cause : dans les deux émulateurs, le contrôleur I²C matériel ne pilote jamais
// ses broches — START, octets et STOP partent droit aux esclaves simulés. Le
// correctif rejoue le bus en fronts (src/webview/engines/i2c-fronts.mts).
//
// CE QUE CE BANC PROUVE : un vrai échange — registres TWI écrits comme le fait
// Wire sur l'Uno, MicroPython réel sur Pico et Pico 2 — produit des fronts que
// le DÉCODEUR I²C de l'analyseur relit : adresse, sens, octets, ACK, STOP.
// Une broche du même contrôleur restée en GPIO (GP0) ne reçoit rien.
//
// CONTRE-ÉPREUVE : `git stash` des moteurs, relancer — zéro front, le banc
// échoue.
//
// Usage : node scripts/verify-analyseur-i2c.mjs
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';
import { CARTES_PICO, firmwareAbsent, firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-i2cfronts-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

const { decoder } = await load('src/webview/analyseur-decodage.mts', 'decodage.mjs');
const { Pca9685Device } = await load('src/webview/engines/i2c-devices.mts', 'devices.mjs');

/** Accumule les journaux drainés, broche par broche. */
function collecteur(eng) {
  const logs = {};
  return {
    logs,
    recolter() {
      for (const [pin, log] of Object.entries(eng.drainScopeEdges())) {
        (logs[pin] ??= []).push(...log);
      }
    },
  };
}

/** Journal [ms, niveau…] → voie de l'analyseur (niveau initial déduit comme sim.mts). */
function voieDe(log, voie, pin) {
  const fronts = [];
  for (let i = 0; i < log.length; i += 2) fronts.push({ t: log[i], niveau: log[i + 1] });
  return { voie, pin, nom: pin, fronts, niveauInitial: fronts.length ? (fronts[0].niveau === 1 ? 0 : 1) : null };
}

/** Décode SDA/SCL et rend le texte des annotations, dans l'ordre. */
function decoder2(logs, sda, scl) {
  const voies = [voieDe(logs[sda] ?? [], 0, sda), voieDe(logs[scl] ?? [], 1, scl)];
  return decoder(voies, { protocole: 'i2c', donnees: 0, horloge: 1 }).map((a) => a.texte);
}

/** Les fronts d'une broche sont-ils dans l'ordre du temps ? */
const ordonne = (log) => {
  for (let i = 2; i < log.length; i += 2) if (log[i] < log[i - 2]) return false;
  return true;
};

// =============================================================================
// 1. UNO — registres TWI pilotés comme Wire, PCA9685 à 0x40, pinces A4 / A5
// =============================================================================
{
  const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');
  const eng = new AvrEngine(new Uint16Array(4096), null, 'avr328');
  eng.setI2cDevices([new Pca9685Device(0x40)]);
  eng.setLogicProbes(['A4', 'A5']);
  const cpu = eng.cpu;
  const col = collecteur(eng);
  const TWBR = 0xb8, TWSR = 0xb9, TWDR = 0xbb, TWCR = 0xbc;
  const TWINT = 0x80, TWEA = 0x40, TWSTA = 0x20, TWSTO = 0x10, TWEN = 0x04;
  // Les événements TWI sont des « clock events » d'avr8js : un tick les déclenche.
  const avancer = (us) => {
    for (let i = 0; i < us * 8; i++) {
      cpu.cycles += 2;
      cpu.tick();
    }
    col.recolter();
  };
  const twcr = (v) => {
    cpu.writeData(TWCR, v);
    avancer(200);
  };
  cpu.writeData(TWBR, 72); // 16 MHz / (16 + 2×72) = 100 kHz
  cpu.writeData(TWSR, 0);
  // Écriture : START, 0x40 W, registre MODE1 (0x00), valeur 0x21, STOP.
  twcr(TWINT | TWSTA | TWEN);
  cpu.writeData(TWDR, 0x40 << 1);
  twcr(TWINT | TWEN);
  cpu.writeData(TWDR, 0x00);
  twcr(TWINT | TWEN);
  cpu.writeData(TWDR, 0x21);
  twcr(TWINT | TWEN);
  twcr(TWINT | TWSTO | TWEN);
  // Adresse absente : START, 0x41 W, NAK, STOP.
  twcr(TWINT | TWSTA | TWEN);
  cpu.writeData(TWDR, 0x41 << 1);
  twcr(TWINT | TWEN);
  twcr(TWINT | TWSTO | TWEN);
  // Lecture : START, 0x40 R, un octet lu avec NAK du maître, STOP.
  twcr(TWINT | TWSTA | TWEN);
  cpu.writeData(TWDR, (0x40 << 1) | 1);
  twcr(TWINT | TWEN);
  twcr(TWINT | TWEN | (0 & TWEA));
  twcr(TWINT | TWSTO | TWEN);

  const sda = col.logs.A4 ?? [];
  const scl = col.logs.A5 ?? [];
  check('Uno : SDA (A4) a des fronts', sda.length > 0, 'journal vide');
  check('Uno : SCL (A5) a des fronts', scl.length > 0, 'journal vide');
  check('Uno : fronts dans l\'ordre du temps', ordonne(sda) && ordonne(scl));
  // 100 kHz : une impulsion d'horloge toutes les 10 µs.
  const montees = [];
  for (let i = 0; i < scl.length; i += 2) if (scl[i + 1] === 1) montees.push(scl[i]);
  const ecart = montees.length > 2 ? (montees[2] - montees[1]) * 1000 : 0;
  check('Uno : horloge à 100 kHz (TWBR = 72)', Math.abs(ecart - 10) < 0.01, `${ecart.toFixed(3)} µs`);
  const textes = decoder2(col.logs, 'A4', 'A5');
  console.log('   Uno décodé :', textes.join(' | '));
  const joint = textes.join(' ');
  check('Uno : START puis STOP décodés', textes.filter((x) => x === 'START').length === 3 && textes.filter((x) => x === 'STOP').length === 3, joint);
  check('Uno : adresse 0x40 en écriture', /0x40.*W|W.*0x40/i.test(joint), joint);
  check('Uno : octets 0x00 et 0x21', /0x00/.test(joint) && /0x21/.test(joint), joint);
  const i41 = textes.indexOf('addr 0x41 W');
  check('Uno : adresse absente 0x41 en NACK', i41 >= 0 && textes[i41 + 1] === 'NACK' && textes[i41 + 2] === 'STOP', joint);
  check('Uno : lecture 0x40 R', /0x40.*R|R.*0x40/.test(joint), joint);
}

// =============================================================================
// 2. PICO et PICO 2 — MicroPython réel, carte Grove 16 servos à 0x7F, GP8/GP9
// =============================================================================
const lib = tk('grove_16_channels_pwm.py');
if (!existsSync(lib)) {
  console.log('SKIP Pico : lib grove_16_channels_pwm.py absente de testkablix/.');
} else {
  const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
  const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
  const sketchSrc = [
    'from machine import I2C, Pin',
    'from grove_16_channels_pwm import Grove16PWM',
    'import time',
    'i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=100_000)',
    'pwm = Grove16PWM(i2c)',
    'pwm.servo_angle(0, 90)',
    "print('I2C_FIN')",
    'time.sleep(0.5)',
    '',
  ].join('\n');
  const sketchPath = join(dirname(lib), '_i2c_fronts_tmp.py');
  writeFileSync(sketchPath, sketchSrc, 'utf8');
  for (const carte of CARTES_PICO) {
    const fw = firmwarePico(carte.prefixe);
    if (!fw) {
      console.log(`SKIP ${carte.nom} : ${firmwareAbsent(carte.prefixe)}`);
      continue;
    }
    const program = loadPythonProgram(fw, sketchSrc, false, sketchPath);
    const eng = new PicoEngine({
      kind: 'flash',
      segments: program.payload.segments.map((s) => ({ addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')) })),
      script: program.payload.script,
    }, carte.famille);
    eng.setI2cDevices([new Pca9685Device(0x7f)]);
    // GP0 : même contrôleur (I2C0, SDA) mais laissée en GPIO — elle ne doit rien recevoir.
    eng.setLogicProbes(['GP8', 'GP9', 'GP0']);
    eng.setPulseMonitors(['GP8', 'GP9', 'GP0']);
    const col = collecteur(eng);
    let serial = '';
    eng.onSerial = (c) => { serial += c; };
    eng.start();
    const debut = Date.now();
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        col.recolter();
        if (serial.includes('I2C_FIN') || /Error/.test(serial) || Date.now() - debut > 120_000) {
          clearInterval(timer);
          setTimeout(() => { col.recolter(); resolve(); }, 300);
        }
      }, 100);
    });
    eng.dispose();
    check(`${carte.nom} : le programme va au bout`, serial.includes('I2C_FIN'), JSON.stringify(serial.slice(-300)));
    const sda = col.logs.GP8 ?? [];
    const scl = col.logs.GP9 ?? [];
    check(`${carte.nom} : SDA (GP8) a des fronts`, sda.length > 0, 'journal vide');
    check(`${carte.nom} : SCL (GP9) a des fronts`, scl.length > 0, 'journal vide');
    check(`${carte.nom} : fronts dans l'ordre du temps`, ordonne(sda) && ordonne(scl));
    // freq=100_000 : le débit vient des registres SCL_HCNT/LCNT écrits par MicroPython.
    const montees = [];
    for (let i = 0; i < scl.length; i += 2) if (scl[i + 1] === 1) montees.push(scl[i]);
    const ecart = montees.length > 3 ? (montees[3] - montees[2]) * 1000 : 0;
    check(`${carte.nom} : horloge vers 100 kHz`, ecart > 9 && ecart < 11.5, `${ecart.toFixed(3)} µs`);
    check(`${carte.nom} : GP0 (restée GPIO) ne reçoit pas le bus`, (col.logs.GP0 ?? []).length <= 2, `${(col.logs.GP0 ?? []).length / 2} fronts`);
    const textes = decoder2(col.logs, 'GP8', 'GP9');
    console.log(`   ${carte.nom} décodé (début) :`, textes.slice(0, 16).join(' | '));
    const joint = textes.join(' ');
    check(`${carte.nom} : START et STOP décodés`, textes.includes('START') && textes.includes('STOP'), joint.slice(0, 300));
    check(`${carte.nom} : adresse 0x7F décodée`, /0x7F/i.test(joint), joint.slice(0, 300));
    check(`${carte.nom} : aucune erreur de décodage`, !textes.some((x) => /truncated|tronqu/i.test(x)), joint.slice(0, 300));
  }
  try { unlinkSync(sketchPath); } catch {}
}

console.log(failures ? `\nRESULTAT: ECHEC (${failures})` : '\nRESULTAT: OK');
process.exit(failures ? 1 : 0);
