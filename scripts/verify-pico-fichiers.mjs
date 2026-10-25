// Banc du système de fichiers MicroPython sur Pico (puce flash émulée) :
//   node scripts/verify-pico-fichiers.mjs [--target=rp2040|rp2350] [--uf2=chemin]
// Sans puce flash derrière le contrôleur QSPI, rp2.Flash() perdait ses
// écritures : LittleFS ne formatait pas, `open(..., 'w')` levait ENODEV.
// Contrôle : statvfs non nul, fichier écrit puis relu, blocs bruts relus,
// fichier encore là après un soft reset.
//
// Firmware : --uf2=…, sinon test-assets/RPI_PICO-*.uf2 / RPI_PICO2-*.uf2
// (dossier ignoré par git, test sauté s'il manque).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (nom) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const cible = arg('target') ?? 'rp2040';
const motif = cible === 'rp2350' ? /^RPI_PICO2-(?!RISCV).*\.uf2$/ : /^RPI_PICO-.*\.uf2$/;
const dossier = join(root, 'test-assets');
let fichier = arg('uf2');
if (!fichier) {
  const nom = existsSync(dossier) ? readdirSync(dossier).find((f) => motif.test(f)) : null;
  if (!nom) {
    console.log(`SKIP : firmware MicroPython absent (test-assets/${motif.source}).`);
    process.exit(0);
  }
  fichier = join(dossier, nom);
}

const GARDE = 300;
const tmp = mkdtempSync(join(tmpdir(), 'kablix-fichiers-'));
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
const segments = parseUf2(new Uint8Array(readFileSync(fichier))).map((s) => ({ addr: s.addr, data: s.data }));

const script = [
  'import os, rp2',
  "print('STATVFS', os.statvfs('/'))",
  'bdev = rp2.Flash()',
  "print('BLOCS', bdev.ioctl(4, 0), bdev.ioctl(5, 0))",
  "with open('etalonnage.json', 'w') as f:",
  "    f.write('{\"k\": 42}')",
  "print('LISTE', os.listdir())",
  "print('RELU', open('etalonnage.json').read())",
  // Blocs bruts : le dernier bloc, hors des blocs que LittleFS a pu toucher.
  'n = bdev.ioctl(4, 0) - 1',
  'buf = bytearray(4096)',
  'for i in range(len(buf)):',
  '    buf[i] = i & 0xff',
  'bdev.ioctl(6, n)',
  'bdev.writeblocks(n, buf)',
  'lu = bytearray(4096)',
  'bdev.readblocks(n, lu)',
  "print('BRUT', lu == buf)",
  'bdev.ioctl(6, n)',
  'bdev.readblocks(n, lu)',
  "print('EFFACE', all(b == 0xff for b in lu))",
  "print('KABLIX_FICHIERS_OK')",
  '',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script }, cible);
let serial = '';
engine.onSerial = (chunk) => {
  serial += chunk;
  process.stdout.write(chunk);
};
console.log(`Firmware ${fichier} sur ${cible} (max ${GARDE} s)…`);
const debut = Date.now();
engine.start();

const fin = (bon) => {
  engine.dispose();
  console.log(bon ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
  process.exit(bon ? 0 : 1);
};

// Phase 2 : le script fini, Ctrl-D au REPL (soft reset), puis relecture du
// fichier. La flash ne doit rien perdre au redémarrage logiciel.
let phase2 = false;
const timer = setInterval(() => {
  const finScript = serial.indexOf('KABLIX_FICHIERS_OK');
  if (!phase2 && finScript >= 0 && serial.indexOf('>>> ', finScript) >= 0) {
    phase2 = true;
    engine.writeSerial('\x04');
    setTimeout(() => engine.writeSerial("print('APRES', open('etalonnage.json').read())\r\n"), 3000);
    return;
  }
  if (serial.includes('APRES {"k": 42}') || /Traceback|Error/.test(serial)) {
    clearInterval(timer);
    const statvfs = (serial.match(/STATVFS \((\d+), \d+, (\d+), (\d+)/) ?? []).slice(1).map(Number);
    const controles = [
      [`statvfs non nul (${statvfs.join(', ')})`, statvfs.length === 3 && statvfs[0] > 0 && statvfs[1] > 0 && statvfs[2] > 0],
      ['fichier listé', /LISTE \[.*'etalonnage\.json'.*\]/.test(serial)],
      ['fichier relu', serial.includes('RELU {"k": 42}')],
      ['bloc brut relu', serial.includes('BRUT True')],
      ['bloc effacé', serial.includes('EFFACE True')],
      ['fichier relu après soft reset', serial.includes('APRES {"k": 42}')],
    ];
    let bon = true;
    console.log('');
    for (const [nom, ok] of controles) {
      console.log(`${ok ? 'OK ' : 'KO '} ${nom}`);
      bon &&= ok;
    }
    fin(bon);
  } else if ((Date.now() - debut) / 1000 > GARDE) {
    clearInterval(timer);
    console.log('Délai de garde dépassé.');
    fin(false);
  }
}, 500);
