// Banc de la console-terminal du Pico simulé (frappes brutes, comme une vraie carte) :
//   node scripts/verify-pico-console.mjs [--target=rp2040|rp2350] [--uf2=chemin]
// Le programme est injecté par le raw REPL : une frappe mêlée au protocole le
// cassait. Le moteur retient donc les frappes tant qu'il tient le CDC, puis les
// rend au programme. Contrôles :
//   - lancement : bannière MicroPython en couleur, puis `>>>`, puis la sortie ;
//   - « abc⏎ » tapé PENDANT le démarrage du firmware arrive à input() ;
//   - fin : bannière en couleur, ligne « Type "help()"… » masquée ;
//   - Ctrl-C arrête le programme et rend l'invite `>>>`, sans l'invite « > »
//     du raw REPL qu'une vraie carte ne montre pas ;
//   - une commande tapée ensuite s'exécute au REPL (un Ctrl-E, réservé au
//     débogueur, est tapé avant : il ne doit rien casser).
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
  const nom = existsSync(dossier)
    ? readdirSync(dossier).filter((f) => motif.test(f)).sort().at(-1)
    : null;
  if (!nom) {
    console.log(`SKIP : firmware MicroPython absent (test-assets/${motif.source}).`);
    process.exit(0);
  }
  fichier = join(dossier, nom);
}

const GARDE = 300;
const tmp = mkdtempSync(join(tmpdir(), 'kablix-console-'));
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
  "print('DEBUT')",
  "s = input('? ')",
  "print('LU', repr(s))",
  'import time',
  'n = 0',
  'while True:',
  '    n += 1',
  '    time.sleep_ms(20)',
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
// Tapé tout de suite : le firmware démarre à peine, le script n'est pas injecté.
engine.writeSerial('abc\r');

const fin = (bon) => {
  engine.dispose();
  console.log(bon ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
  process.exit(bon ? 0 : 1);
};

const controles = [];
let etape = 'lecture';
let marque = 0;
const timer = setInterval(() => {
  if (etape === 'lecture' && serial.includes('LU ')) {
    controles.push(["« abc⏎ » tapé au démarrage reçu par input()", serial.includes("LU 'abc'")]);
    controles.push([
      'lancement : bannière en couleur, puis >>> avant la sortie',
      /^\x1b\[36mMicroPython [^\r\n\x1b]+\x1b\[0m\r\n>>> \r\nDEBUT/.test(serial),
    ]);
    // Ctrl-E au milieu du programme : sans filtre, le script le prendrait pour
    // une demande de pause du débogueur (ici sans effet visible, mais il ne
    // doit pas non plus atteindre stdin) ; puis Ctrl-C.
    engine.writeSerial('\x05');
    setTimeout(() => {
      marque = serial.length;
      engine.writeSerial('\x03');
    }, 500);
    etape = 'interruption';
    return;
  }
  if (etape === 'interruption' && marque > 0 && serial.indexOf('>>> ', marque) >= 0) {
    const apres = serial.slice(marque);
    controles.push(['Ctrl-C : KeyboardInterrupt', apres.includes('KeyboardInterrupt')]);
    controles.push(['Ctrl-C : invite >>> rendue', apres.includes('>>> ')]);
    controles.push(['pas d\'invite « > » du raw REPL affichée', !/(^|\n)>\r?\n/.test(apres)]);
    controles.push(['fin : bannière en couleur, sans la ligne help()', /\x1b\[36mMicroPython /.test(apres) && !serial.includes('help()')]);
    marque = serial.length;
    engine.writeSerial('print(6*7)\r');
    etape = 'repl';
    return;
  }
  if (etape === 'repl' && /\r?\n42\r?\n/.test(serial.slice(marque))) {
    controles.push(['commande tapée au REPL exécutée', true]);
    clearInterval(timer);
    bilan();
    return;
  }
  if ((Date.now() - debut) / 1000 > GARDE) {
    clearInterval(timer);
    console.log(`\nDélai de garde dépassé (étape ${etape}).`);
    controles.push([`étape « ${etape} » atteinte à temps`, false]);
    bilan();
  }
}, 250);

function bilan() {
  let bon = controles.length === 7;
  console.log('');
  for (const [nom, ok] of controles) {
    console.log(`${ok ? 'OK ' : 'KO '} ${nom}`);
    bon &&= ok;
  }
  fin(bon);
}
