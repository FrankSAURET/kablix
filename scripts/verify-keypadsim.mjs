// Clavier matriciel 4×4 sur carte AVR : appuyer sur une touche doit se VOIR côté
// firmware (repro Frank : « Keypad-uno ne marche pas »). Le banc joue le rôle du
// MCU comme le fait la bibliothèque Keypad d'Arduino — colonnes en INPUT_PULLUP,
// lignes balayées une par une en sortie BASSE, lecture des colonnes — sur le
// VRAI `.projix` de test, avec les broches déduites du câblage.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-kp-'));

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
const { keypadBindings } = await load('src/webview/diagram/model.mts', 'model.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// ATmega328P : D0..D7 = PORTD bits 0..7, D8..D13 = PORTB bits 0..5.
const PINB = 0x23, DDRB = 0x24, PORTB = 0x25;
const PIND = 0x29, DDRD = 0x2a, PORTD = 0x2b;
const CYCLES_PER_US = 16;
const regs = (pin) => {
  const n = Number(pin);
  return n < 8 ? { pin: PIND, ddr: DDRD, port: PORTD, bit: n } : { pin: PINB, ddr: DDRB, port: PORTB, bit: n - 8 };
};

/** Avance le temps simulé en servant les actions programmées, sans exécuter de code. */
function advance(eng, us) {
  const steps = Math.round((us * CYCLES_PER_US) / 2);
  for (let i = 0; i < steps; i++) {
    eng.cpu.cycles += 2;
    eng.fireScheduled();
  }
}

/** Écrit un bit d'un registre PAR LE CPU (writeData) : c'est ce qui réveille les
 *  écouteurs de port du moteur, comme le ferait un digitalWrite du firmware. */
function setBit(cpu, addr, bit, on) {
  cpu.writeData(addr, on ? cpu.data[addr] | (1 << bit) : cpu.data[addr] & ~(1 << bit));
}

/** Bibliothèque Keypad : colonnes en INPUT_PULLUP, lignes relâchées (entrées). */
function initPins(eng, rows, cols) {
  const cpu = eng.cpu;
  for (const c of cols) {
    const r = regs(c);
    setBit(cpu, r.ddr, r.bit, false);
    setBit(cpu, r.port, r.bit, true); // pull-up
  }
  for (const row of rows) {
    const r = regs(row);
    setBit(cpu, r.ddr, r.bit, false);
    setBit(cpu, r.port, r.bit, false);
  }
  advance(eng, 100);
}

/**
 * Un balayage complet, comme `Keypad::scanKeys()` : chaque ligne passe en sortie
 * BASSE à son tour, on lit les colonnes, puis la ligne repasse en entrée.
 * Renvoie la matrice des touches vues (true = contact détecté).
 */
function scan(eng, rows, cols, { pauseUs = 50 } = {}) {
  const cpu = eng.cpu;
  const seen = rows.map(() => cols.map(() => false));
  for (let r = 0; r < rows.length; r++) {
    const row = regs(rows[r]);
    setBit(cpu, row.ddr, row.bit, true); // OUTPUT
    setBit(cpu, row.port, row.bit, false); // LOW
    advance(eng, pauseUs);
    for (let c = 0; c < cols.length; c++) {
      const col = regs(cols[c]);
      seen[r][c] = ((cpu.data[col.pin] >> col.bit) & 1) === 0; // LOW = touche
    }
    setBit(cpu, row.ddr, row.bit, false); // retour en entrée haute impédance
    advance(eng, pauseUs);
  }
  return seen;
}

const pressedKeys = (seen) => {
  const out = [];
  for (let r = 0; r < seen.length; r++) for (let c = 0; c < seen[r].length; c++) if (seen[r][c]) out.push(`${r},${c}`);
  return out;
};

// ------------------------------------------------- câblage du vrai projet ----

const projix = join(root, 'testkablix/keypad-uno/keypad-uno.projix');
let rows = ['2', '3', '4', '5'];
let cols = ['6', '7', '8', '9'];
if (!existsSync(projix)) {
  check('testkablix/keypad-uno/keypad-uno.projix présent', false, 'fichier absent');
} else {
  const zip = await JSZip.loadAsync(readFileSync(projix));
  const diagram = JSON.parse(await zip.files['diagram.json'].async('string'));
  const binds = keypadBindings(diagram);
  check('le clavier du .projix est reconnu', binds.length === 1, `${binds.length} clavier(s)`);
  if (binds.length === 1) {
    rows = binds[0].rows;
    cols = binds[0].cols;
    check(
      `lignes câblées sur ${rows.join(', ')}`,
      rows.every((p) => p !== null) && rows.length === 4,
      JSON.stringify(rows),
    );
    check(
      `colonnes câblées sur ${cols.join(', ')}`,
      cols.every((p) => p !== null) && cols.length === 4,
      JSON.stringify(cols),
    );
  }
  // Le sketch de test déclare 2,3,4,5 / 6,7,8,9 : le câblage doit correspondre.
  const ino = readFileSync(join(root, 'testkablix/keypad-uno/keypad-uno.ino'), 'utf8');
  const nums = (re) => (ino.match(re)?.[1] ?? '').match(/\d+/g) ?? [];
  check(
    'les broches du sketch de test sont celles du schéma',
    nums(/brochesLignes\[[^\]]*\]\s*=\s*\{([^}]*)\}/).join(',') === rows.join(',') &&
      nums(/brochesColonnes\[[^\]]*\]\s*=\s*\{([^}]*)\}/).join(',') === cols.join(','),
    `sketch ${nums(/brochesLignes\[[^\]]*\]\s*=\s*\{([^}]*)\}/)} / ${nums(/brochesColonnes\[[^\]]*\]\s*=\s*\{([^}]*)\}/)}`,
  );
}

// ------------------------------------------------------ balayage firmware ----

const NOMS = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['*', '0', '#', 'D'],
];

/** Moteur + clavier câblé, prêt à balayer. `pressed` est le Set vivant de sim.mts. */
function bench() {
  const eng = new AvrEngine(new Uint16Array(1024), null, 'avr328');
  const pressed = new Set();
  eng.setKeypads([{ partId: 'kp1', rows, cols, pressed }]);
  initPins(eng, rows, cols);
  return { eng, pressed };
}

{
  const { eng } = bench();
  check('aucune touche : toutes les colonnes restent HAUTES', pressedKeys(scan(eng, rows, cols)).length === 0);
}

{
  // Touche « 5 » (ligne 1, colonne 1) maintenue : vue une seule fois, au bon endroit.
  const { eng, pressed } = bench();
  pressed.add('1,1');
  const seen = pressedKeys(scan(eng, rows, cols));
  check(`touche « ${NOMS[1][1]} » enfoncée : détectée`, seen.length === 1 && seen[0] === '1,1', JSON.stringify(seen));
}

{
  // Les 16 touches, une par une : chacune doit se voir à SA place.
  const { eng, pressed } = bench();
  const rates = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      pressed.clear();
      pressed.add(`${r},${c}`);
      const seen = pressedKeys(scan(eng, rows, cols));
      if (seen.length !== 1 || seen[0] !== `${r},${c}`) rates.push(`${NOMS[r][c]}→${JSON.stringify(seen)}`);
    }
  }
  check('les 16 touches se détectent chacune à sa place', rates.length === 0, rates.join(' '));
}

{
  // Relâchement : la colonne remonte, plus rien n'est vu.
  const { eng, pressed } = bench();
  pressed.add('2,3');
  scan(eng, rows, cols);
  pressed.delete('2,3');
  check('touche relâchée : plus rien de détecté', pressedKeys(scan(eng, rows, cols)).length === 0);
}

{
  // Appui SURVENANT alors que la ligne est déjà tirée à LOW (clic souris en plein
  // balayage, ou simulation figée en pas à pas) : rien ne bouge sur les broches,
  // donc aucun écouteur ne se déclenche. `syncKeypads()` est le seul moyen de voir
  // le contact — c'est ce que sim.mts appelle à chaque appui/relâchement.
  const { eng, pressed } = bench();
  const cpu = eng.cpu;
  const row = regs(rows[0]);
  const col = regs(cols[2]);
  setBit(cpu, row.ddr, row.bit, true);
  setBit(cpu, row.port, row.bit, false); // ligne 0 maintenue basse
  advance(eng, 50);
  pressed.add('0,2');
  advance(eng, 50);
  check(
    'sans réévaluation, un appui hors front reste invisible (le bug)',
    ((cpu.data[col.pin] >> col.bit) & 1) === 1,
    'la colonne est descendue toute seule : le contrôle suivant ne prouverait rien',
  );
  eng.syncKeypads();
  advance(eng, 50);
  check(
    'appui pendant que la ligne est déjà basse : contact vu après syncKeypads()',
    ((cpu.data[col.pin] >> col.bit) & 1) === 0,
    'la colonne est restée haute',
  );
  // Relâchement dans la même situation : la colonne doit remonter aussitôt.
  pressed.delete('0,2');
  eng.syncKeypads();
  advance(eng, 50);
  check(
    'relâchement hors front : la colonne remonte après syncKeypads()',
    ((cpu.data[col.pin] >> col.bit) & 1) === 1,
    'la colonne est restée basse',
  );
}

{
  // Deux touches sur des lignes différentes (pas de fantôme sur les autres).
  const { eng, pressed } = bench();
  pressed.add('0,0');
  pressed.add('3,3');
  const seen = pressedKeys(scan(eng, rows, cols)).sort();
  check('deux touches éloignées : les deux, et rien d\'autre', seen.join(' ') === '0,0 3,3', JSON.stringify(seen));
}

{
  // Deux touches de la MÊME colonne : chacune sur sa ligne, pas de bavure.
  const { eng, pressed } = bench();
  pressed.add('0,2');
  pressed.add('2,2');
  const seen = pressedKeys(scan(eng, rows, cols)).sort();
  check('deux touches d\'une même colonne : chacune sur sa ligne', seen.join(' ') === '0,2 2,2', JSON.stringify(seen));
}

{
  // Balayage serré (la bibliothèque Keypad relit toutes les 10 ms) : le contact
  // ne doit pas « s'user » au fil des passages.
  const { eng, pressed } = bench();
  pressed.add('1,2');
  let ok = true;
  for (let i = 0; i < 20; i++) {
    const seen = pressedKeys(scan(eng, rows, cols));
    if (seen.length !== 1 || seen[0] !== '1,2') ok = false;
  }
  check('20 balayages d\'affilée : la touche reste vue', ok);
}

// --------------------------------- balayage de la bibliothèque Keypad -------
// La bibliothèque Keypad d'Arduino (Mark Stanley, celle du sketch de test) fait
// l'INVERSE du balayage ci-dessus : `initializePins` met les LIGNES en
// INPUT_PULLUP et `scanKeys` pulse chaque COLONNE en sortie BASSE, puis lit les
// lignes. Un contact doit donc se voir dans les deux sens — sinon le sketch ne
// détecte jamais rien (repro Frank : « Keypad-uno ne marche pas »).

/** Comme initializePins() de la bibliothèque : lignes en INPUT_PULLUP. */
function initPinsLib(eng, rows, cols) {
  const cpu = eng.cpu;
  for (const row of rows) {
    const r = regs(row);
    setBit(cpu, r.ddr, r.bit, false);
    setBit(cpu, r.port, r.bit, true); // pull-up
  }
  for (const c of cols) {
    const r = regs(c);
    setBit(cpu, r.ddr, r.bit, false);
    setBit(cpu, r.port, r.bit, true);
  }
  advance(eng, 100);
}

/** Comme scanKeys() : chaque colonne pulsée à LOW, lecture des lignes. */
function scanLib(eng, rows, cols, pauseUs = 50) {
  const cpu = eng.cpu;
  const seen = rows.map(() => cols.map(() => false));
  for (let c = 0; c < cols.length; c++) {
    const col = regs(cols[c]);
    setBit(cpu, col.ddr, col.bit, true); // OUTPUT
    setBit(cpu, col.port, col.bit, false); // LOW : impulsion de colonne
    advance(eng, pauseUs);
    for (let r = 0; r < rows.length; r++) {
      const row = regs(rows[r]);
      seen[r][c] = ((cpu.data[row.pin] >> row.bit) & 1) === 0;
    }
    setBit(cpu, col.port, col.bit, true); // fin d'impulsion
    setBit(cpu, col.ddr, col.bit, false); // haute impédance
    advance(eng, pauseUs);
  }
  return seen;
}

{
  const { eng } = bench();
  initPinsLib(eng, rows, cols);
  check(
    'bibliothèque Keypad, aucune touche : les lignes restent HAUTES',
    pressedKeys(scanLib(eng, rows, cols)).length === 0,
  );
}

{
  const { eng, pressed } = bench();
  initPinsLib(eng, rows, cols);
  pressed.add('1,1');
  const seen = pressedKeys(scanLib(eng, rows, cols));
  check(
    `bibliothèque Keypad : touche « ${NOMS[1][1]} » détectée`,
    seen.length === 1 && seen[0] === '1,1',
    JSON.stringify(seen),
  );
}

{
  const { eng, pressed } = bench();
  initPinsLib(eng, rows, cols);
  const rates = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      pressed.clear();
      pressed.add(`${r},${c}`);
      const seen = pressedKeys(scanLib(eng, rows, cols));
      if (seen.length !== 1 || seen[0] !== `${r},${c}`) rates.push(`${NOMS[r][c]}→${JSON.stringify(seen)}`);
    }
  }
  check('bibliothèque Keypad : les 16 touches à leur place', rates.length === 0, rates.join(' '));
}

{
  const { eng, pressed } = bench();
  initPinsLib(eng, rows, cols);
  pressed.add('3,0');
  scanLib(eng, rows, cols);
  pressed.delete('3,0');
  check(
    'bibliothèque Keypad : touche relâchée, plus rien',
    pressedKeys(scanLib(eng, rows, cols)).length === 0,
  );
}

// --------------------------------- le Pico partage la même règle --------------
// Le moteur Pico avait le même défaut ; il doit rester symétrique lui aussi.
for (const [nom, fichier] of [
  ['AVR', 'src/webview/engines/avr.mts'],
  ['Pico', 'src/webview/engines/pico.mts'],
]) {
  const src = readFileSync(join(root, fichier), 'utf8');
  check(
    `${nom} : contact tiré dans les deux sens (ligne↔colonne)`,
    /if \(this\.pinDrivenLow\(row\)\) low\.add\(col\);/.test(src) &&
      /if \(this\.pinDrivenLow\(col\)\) low\.add\(row\);/.test(src),
  );
  check(
    `${nom} : lignes ET colonnes au repos à HAUT`,
    /for \(const row of kp\.rows\) if \(row\) this\.setInput\(row, true\);/.test(src) &&
      /for \(const col of kp\.cols\) if \(col\) this\.setInput\(col, true\);/.test(src),
  );
  check(`${nom} : plus de cache réservé aux colonnes`, !/keypadColLevel/.test(src));
  check(
    `${nom} : réévaluation à la demande (syncKeypads)`,
    /syncKeypads\(\): void \{\s*this\.applyKeypads\(\);/.test(src),
  );
}

// sim.mts doit RÉELLEMENT appeler cette réévaluation : `pressed` est partagé par
// référence, mais sans appel le moteur ne le relit qu'au prochain front de broche
// — jamais en pas à pas, où plus rien ne bouge entre deux pas (retour Frank :
// « si je bloque une touche en position appuyée, en pas à pas elle n'est jamais
// vue comme appuyée »).
{
  const sim = readFileSync(join(root, 'src/webview/sim.mts'), 'utf8');
  const bloc = sim.slice(sim.indexOf('const keypads: KeypadConfig[] = []'), sim.indexOf('engine.setKeypads?.(keypads)'));
  const appels = (bloc.match(/engine\?\.syncKeypads\?\.\(\)/g) ?? []).length;
  check(
    'sim.mts réévalue le clavier à chaque appui/relâchement',
    appels >= 2,
    `${appels} appel(s) à syncKeypads dans le branchement du clavier`,
  );
}

console.log(failures === 0 ? '\n✅ clavier matriciel en simulation : OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
