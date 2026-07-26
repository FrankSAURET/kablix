// Capteur DHT22 sur carte AVR : la réponse doit se rejouer à CHAQUE lecture, pas
// seulement à la première (repro Frank : « dht22 ne marche que la première fois,
// après il relit toujours la même valeur »). Le banc joue le rôle du MCU — il
// écrit vraiment DDRD/PORTD comme le fait la bibliothèque Arduino, laisse tourner
// le temps simulé, puis DÉCODE la trame vue sur la broche. Aucun sketch compilé
// n'est nécessaire : c'est le protocole 1-wire qui est mis à l'épreuve.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');
const { dht22Bytes } = await load('src/webview/engines/dht22.mts', 'dht22.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// ATmega328P : D2 = PORTD bit 2.
const PIND = 0x29, DDRD = 0x2a, PORTD = 0x2b, BIT = 2, CYCLES_PER_US = 16;

/** Avance le temps simulé sans exécuter d'instruction, en servant les actions
 *  programmées comme le fait la boucle du moteur (fireScheduled à chaque pas). */
function advance(eng, us, onSample) {
  const cpu = eng.cpu;
  const steps = Math.round((us * CYCLES_PER_US) / 2);
  for (let i = 0; i < steps; i++) {
    cpu.cycles += 2;
    eng.fireScheduled();
    onSample?.(cpu.cycles, (cpu.data[PIND] >> BIT) & 1 ? true : false);
  }
}

/** Une lecture complète côté MCU : signal de départ puis écoute de la réponse.
 *  Reproduit la séquence de la bibliothèque Arduino (INPUT_PULLUP → OUTPUT LOW
 *  ~1,1 ms → INPUT_PULLUP), y compris le bref état HAUT au passage en sortie. */
function readSensor(eng, listenUs = 6000, jog = null) {
  const cpu = eng.cpu;
  const set = (addr, on) => cpu.writeData(addr, on ? cpu.data[addr] | (1 << BIT) : cpu.data[addr] & ~(1 << BIT));
  set(PORTD, true);  // pinMode(INPUT_PULLUP)
  set(DDRD, false);
  advance(eng, 250);
  set(DDRD, true);   // pinMode(OUTPUT) — PORT vaut encore 1
  set(PORTD, false); // digitalWrite(LOW) : signal de départ
  advance(eng, 1100);
  set(PORTD, true);  // relâche : pinMode(INPUT_PULLUP)
  set(DDRD, false);
  const edges = [];
  let last = (((cpu.data[PIND] >> BIT) & 1) === 1); // état de départ : pas de faux front à t0
  const watch = (cycle, high) => {
    if (high !== last) {
      edges.push({ us: cycle / CYCLES_PER_US, high });
      last = high;
    }
  };
  // `jog` : geste de l'utilisateur (curseur du composant) EN PLEINE trame.
  if (jog) {
    advance(eng, jog.atUs, watch);
    jog.fn();
    advance(eng, listenUs - jog.atUs, watch);
  } else {
    advance(eng, listenUs, watch);
  }
  return edges;
}

/** Décode la trame : on ignore l'accusé (première impulsion HAUTE) puis chaque
 *  état HAUT long (> 50 µs) vaut 1, court vaut 0. */
function decode(edges) {
  const pulses = [];
  for (let i = 0; i < edges.length - 1; i++) {
    if (edges[i].high && !edges[i + 1].high) pulses.push(edges[i + 1].us - edges[i].us);
  }
  const bits = pulses.slice(1).map((w) => (w > 50 ? 1 : 0)); // [0] = accusé de 80 µs
  if (bits.length < 40) return { bits, bytes: null };
  const bytes = [];
  for (let b = 0; b < 5; b++) {
    let v = 0;
    for (let i = 0; i < 8; i++) v = (v << 1) | bits[b * 8 + i];
    bytes.push(v);
  }
  return { bits, bytes };
}

const values = (bytes) => {
  if (!bytes) return null;
  const rh = ((bytes[0] << 8) | bytes[1]) / 10;
  const raw = (bytes[2] << 8) | bytes[3];
  const t = (raw & 0x8000 ? -(raw & 0x7fff) : raw) / 10;
  const sum = (bytes[0] + bytes[1] + bytes[2] + bytes[3]) & 0xff;
  return { rh, t, ok: sum === bytes[4] };
};

const mk = (t, h) => {
  const eng = new AvrEngine(new Uint16Array(4096), null, 'avr328');
  eng.setDht22([{ pin: '2', temperatureC: t, humidity: h }]);
  return eng;
};

// --- 1. Première lecture : la trame sort et vaut ce qu'affiche le curseur -----
const eng = mk(24.5, 60);
const r1 = values(decode(readSensor(eng)).bytes);
check('1re lecture : la trame complète (40 bits) est reçue', r1 !== null, 'trame incomplète');
check('1re lecture : température et humidité conformes au curseur',
  r1 !== null && r1.t === 24.5 && r1.rh === 60 && r1.ok, JSON.stringify(r1));

// --- 2. Lectures suivantes : c'est là que ça cassait --------------------------
advance(eng, 2_000_000); // 2 s, l'intervalle minimal des bibliothèques DHT
const r2 = values(decode(readSensor(eng)).bytes);
check('2e lecture (2 s plus tard) : le capteur répond ENCORE',
  r2 !== null, 'aucune trame : le capteur est resté muet après la 1re lecture');
check('2e lecture : mêmes valeurs, checksum bon', r2 !== null && r2.t === 24.5 && r2.rh === 60 && r2.ok,
  JSON.stringify(r2));

advance(eng, 2_000_000);
const r3 = values(decode(readSensor(eng)).bytes);
check('3e lecture : toujours une réponse', r3 !== null && r3.ok, JSON.stringify(r3));

// --- 3. Le curseur bougé entre deux lectures change la valeur lue -------------
advance(eng, 2_000_000);
eng.setDht22([{ pin: '2', temperatureC: -12.3, humidity: 88.8 }]);
const r4 = values(decode(readSensor(eng)).bytes);
check('curseur déplacé : la lecture suivante renvoie la NOUVELLE valeur (négatif compris)',
  r4 !== null && r4.t === -12.3 && Math.abs(r4.rh - 88.8) < 0.05 && r4.ok, JSON.stringify(r4));

// --- 4. Deux lectures qui s'enchaînent sans pause -----------------------------
// Une relecture pendant que la réponse est en cours doit être ignorée (le vrai
// capteur est occupé), mais dès la trame finie une nouvelle lecture repart.
const eng2 = mk(30, 45);
readSensor(eng2, 6000);
const r5 = values(decode(readSensor(eng2)).bytes);
check('deux lectures consécutives sans temporisation : la seconde répond aussi',
  r5 !== null && r5.t === 30 && r5.rh === 45 && r5.ok, JSON.stringify(r5));

// --- 4 bis. Curseur bougé PENDANT la trame : la lecture en cours survit -------
// `setDht22` est repoussé au moteur à chaque `input` des curseurs. S'il remet à
// zéro l'état de la broche, il coupe la trame en train d'être émise : la lecture
// échoue et le sketch garde la valeur précédente (« il relit toujours la même »).
const eng3 = mk(21, 55);
const mid = values(decode(readSensor(eng3, 6000, {
  atUs: 2000, // ~au milieu des 40 bits
  fn: () => eng3.setDht22([{ pin: '2', temperatureC: 21, humidity: 55 }]),
})).bytes);
check('curseur bougé EN PLEINE trame : la lecture en cours n est pas cassée',
  mid !== null && mid.t === 21 && mid.rh === 55 && mid.ok, JSON.stringify(mid));
// …et la lecture suivante repart normalement avec la nouvelle valeur.
advance(eng3, 2_000_000);
eng3.setDht22([{ pin: '2', temperatureC: 33.3, humidity: 70 }]);
const after = values(decode(readSensor(eng3)).bytes);
check('après ce geste, la lecture suivante donne bien la nouvelle valeur',
  after !== null && after.t === 33.3 && after.rh === 70 && after.ok, JSON.stringify(after));

// --- 5. Ligne au repos : HAUT une fois la trame terminée ----------------------
const idle = (eng2.cpu.data[PIND] >> BIT) & 1;
check('après la trame, la ligne est relâchée (repos HAUT)', idle === 1, String(idle));

// --- 6. Les deux moteurs préservent l'état du capteur entre deux réglages -----
const avrSrc = readFileSync(join(root, 'src/webview/engines/avr.mts'), 'utf8');
const picoSrc = readFileSync(join(root, 'src/webview/engines/pico.mts'), 'utf8');
for (const [name, src] of [['avr', avrSrc], ['pico', picoSrc]]) {
  check(`${name} : setDht22 met à jour le moniteur existant au lieu de le recréer`,
    /setDht22\([\s\S]{0,1400}?const prev = before\.find\(\(d\) => d\.pin === s\.pin\);[\s\S]{0,300}?prev\.tempC = s\.temperatureC;/.test(src),
    'reprise du moniteur introuvable');
}
check('avr : la ligne n est reforcée à HAUT que pour un capteur NOUVEAU',
  /if \(!before\.includes\(d\)\) this\.setInput\(d\.pin, true\)/.test(avrSrc), 'garde-fou absent');

// --- 7. Le sketch de test attend bien les 2 s du capteur ---------------------
const ino = readFileSync(join(root, 'testkablix/dht22-uno/dht22-uno.ino'), 'utf8');
const wait = /^\s*delay\((\d+)\)/m.exec(ino);
check('sketch de test : une temporisation ≥ 2 s sépare deux lectures',
  !!wait && Number(wait[1]) >= 2000, wait ? wait[1] : 'aucun delay actif');

// --- 8. Encodage : cohérence avec le décodeur du banc ------------------------
const enc = dht22Bytes(24.5, 60);
check('encodage : octets DHT22 conformes (humidité×10, température×10, checksum)',
  JSON.stringify(enc) === JSON.stringify([2, 88, 0, 245, 79]), JSON.stringify(enc));

console.log(failures ? `dht22 : ${failures} échec(s).` : 'dht22 : tous les contrôles passent — le capteur répond à chaque lecture.');
process.exit(failures ? 1 : 0);
