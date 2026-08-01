// Vérifie l'intégralité de testkablix/ :
//   1. chaque .projix : archive valide, manifeste cohérent, composants connus,
//      extrémités de fils valides, et câblage résolu par le moteur (bindings
//      de src/webview/diagram/model.mts — mêmes fonctions que la simulation) ;
//   2. chaque .ino : compilation réelle via arduino-cli (src/compiler.ts) ;
//   3. chaque .py : compilation syntaxique via python -m py_compile ;
//   4. bout en bout : blink-uno et blink-mega exécutés dans avr8js (LED D13),
//      led-pico.py exécuté dans PicoEngine avec le vrai firmware MicroPython.
//   node testkablix/_verify.mjs [--quick] [nom…]
//   --quick : saute compilations + bout en bout ; les noms limitent le contrôle
//   aux tests cités (les .projix du dépôt ne sont pas tous régénérés).
import esbuild from 'esbuild';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TESTS as ALL_TESTS, PART_PINS } from './_spec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const QUICK = process.argv.includes('--quick');
// Noms passés en argument : ne contrôler que ces tests-là.
const ONLY = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));
const tmp = mkdtempSync(join(tmpdir(), 'kx-testkablix-'));

let failures = 0;
let checks = 0;
function check(label, ok, detail = '') {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function bundle(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const TESTS = ONLY.size > 0 ? ALL_TESTS.filter((t) => ONLY.has(t.name)) : ALL_TESTS;

const model = await bundle('src/webview/diagram/model.mts', 'model.mjs');
const catalog = await bundle('src/webview/diagram/catalog.mjs', 'catalog.mjs');

/**
 * Point fixe des ponts commandés (transistor saturé, contact de relais fermé) :
 * un pont ferme un circuit, ce qui change des niveaux, donc l'état des autres
 * ponts. Même boucle que sim.mts — trois tours suffisent largement.
 */
function resolveBridges(diagram, read, vcc) {
  model.setActiveBridges([]);
  let signature = model.bridgeSignature([]);
  for (let pass = 0; pass < 3; pass++) {
    const list = model.commandedBridges(diagram, read, vcc);
    const next = model.bridgeSignature(list);
    model.setActiveBridges(list);
    if (next === signature) break;
    signature = next;
  }
}

// --- 1. Validation des .projix ------------------------------------------------
console.log(`--- Validation des ${TESTS.length} .projix (structure + câblage) ---`);
for (const t of TESTS) {
  const file = t.ext === 'ino'
    ? join(HERE, t.name, `${t.name}.projix`)
    : join(HERE, `${t.name}.projix`);
  let diagram;
  try {
    const zip = await JSZip.loadAsync(readFileSync(file));
    const manifest = JSON.parse(await zip.file('kablix.json').async('string'));
    diagram = JSON.parse(await zip.file('diagram.json').async('string'));
    check(`${t.name} : manifeste`, manifest.format === 'projix' && manifest.board === t.board,
      `format=${manifest.format} board=${manifest.board}`);
    check(`${t.name} : codeFile`, typeof manifest.codeFile === 'string' && manifest.codeFile.length > 0);
  } catch (err) {
    check(`${t.name} : archive lisible`, false, String(err));
    continue;
  }

  // Composants connus du catalogue.
  for (const p of diagram.parts) {
    try {
      catalog.partDef(p.type);
    } catch {
      check(`${t.name} : type ${p.type}`, false, 'type inconnu du catalogue');
    }
  }

  // Extrémités de fils : composant existant + broche valide.
  const partById = new Map(diagram.parts.map((p) => [p.id, p]));
  const mcuPinSet = new Set(catalog.mcuPins(t.board));
  for (const wire of diagram.wires) {
    for (const ep of [wire.a, wire.b]) {
      const part = partById.get(ep.partId);
      if (!part) {
        check(`${t.name} : fil ${wire.id}`, false, `composant ${ep.partId} absent`);
        continue;
      }
      const def = catalog.partDef(part.type);
      const valid = def.kind === 'mcu'
        ? mcuPinSet.has(ep.pin)
        : (PART_PINS[part.type] ?? []).includes(ep.pin);
      check(`${t.name} : fil ${wire.id} → ${part.type}/${ep.pin}`, valid, 'broche inconnue');
    }
  }

  // Câblage résolu comme le ferait la simulation (bindings du modèle).
  const e = t.expect;
  switch (e.kind) {
    case 'board-only':
      check(`${t.name} : carte seule`, diagram.parts.length === 1 && diagram.parts[0].type === t.board);
      break;
    case 'led':
      check(`${t.name} : LED pilotée par ${e.mcuPin}`, model.ledMcuPin(diagram, e.partId) === e.mcuPin,
        `résolu=${model.ledMcuPin(diagram, e.partId)}`);
      break;
    case 'rgb-led': {
      const [b] = model.rgbLedBindings(diagram);
      check(`${t.name} : canaux R/G/B`, b && b.r === e.r && b.g === e.g && b.b === e.b, JSON.stringify(b));
      break;
    }
    case 'button': {
      const b = model.buttonBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : bouton → ${e.mcuPin}`, b?.mcuPin === e.mcuPin, JSON.stringify(b));
      break;
    }
    case 'buzzer': {
      const b = model.buzzerBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : buzzer → ${e.mcuPin}`, b?.mcuPin === e.mcuPin, JSON.stringify(b));
      break;
    }
    case 'pot': {
      const b = model.potBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : curseur → ${e.mcuPin}`, b?.mcuPin === e.mcuPin && b?.inverted === false, JSON.stringify(b));
      break;
    }
    case '7seg': {
      const [b] = model.sevenSegmentBindings(diagram);
      const ok = b && Object.entries(e.segments).every(([seg, pin]) => b.segments[seg] === pin);
      check(`${t.name} : 8 segments câblés`, !!ok, JSON.stringify(b?.segments));
      break;
    }
    case 'led-bar': {
      const state = model.ledBarState(diagram, e.partId, (n) => n === e.firstPin);
      check(`${t.name} : LED1 s'allume via ${e.firstPin}`,
        state[0] === 1 && state.slice(1).every((v) => v === 0), JSON.stringify(state));
      break;
    }
    case 'slide-switch': {
      const bs = model.slideSwitchBindings(diagram).filter((x) => x.partId === e.partId);
      const ok = [1, 3].every((side) => bs.find((b) => b.side === side)?.mcuPin === e.sides[side]);
      check(`${t.name} : côtés 1 et 3 résolus`, ok, JSON.stringify(bs));
      break;
    }
    case 'dip-switch': {
      const bs = model.dipSwitchBindings(diagram).filter((x) => x.partId === e.partId);
      check(`${t.name} : ${e.channels} canaux résolus`, bs.length === e.channels, `${bs.length} canaux`);
      break;
    }
    case 'joystick': {
      const [b] = model.joystickBindings(diagram);
      check(`${t.name} : VERT/HORZ/SEL`, b && b.vert === e.vert && b.horz === e.horz && b.sel === e.sel,
        JSON.stringify(b));
      break;
    }
    case 'ao-do': {
      const b = model.aoDoSensorBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : AO=${e.analog} DO=${e.digital}`,
        b?.analogPin === e.analog && b?.digitalPin === e.digital, JSON.stringify(b));
      break;
    }
    case 'digital-source': {
      const b = model.digitalSourceBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : sortie → ${e.mcuPin}`, b?.mcuPin === e.mcuPin, JSON.stringify(b));
      break;
    }
    case 'analog-source': {
      const b = model.analogSourceBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : sortie → ${e.mcuPin}`, b?.mcuPin === e.mcuPin, JSON.stringify(b));
      break;
    }
    case 'servo': {
      const b = model.servoBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : PWM → ${e.mcuPin}`, b?.mcuPin === e.mcuPin, JSON.stringify(b));
      break;
    }
    case 'ultrasonic': {
      const b = model.ultrasonicBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : TRIG=${e.trig} ECHO=${e.echo}`, b?.trig === e.trig && b?.echo === e.echo,
        JSON.stringify(b));
      break;
    }
    case 'dht22': {
      const b = model.dht22Bindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : DATA → ${e.mcuPin}`, b?.pin === e.mcuPin, JSON.stringify(b));
      if (e.model) {
        check(`${t.name} : modèle ${e.model}`, b?.model === e.model, JSON.stringify(b));
      }
      break;
    }
    case 'diode': {
      // Les deux broches sont au niveau haut : seule la branche dont la diode
      // est dans le bon sens (A → K) laisse passer le courant.
      const haut = () => true;
      check(`${t.name} : diode passante → LED allumée`, model.ledOn(diagram, e.ledOn, haut));
      check(`${t.name} : diode inversée → LED éteinte`, !model.ledOn(diagram, e.ledOff, haut));
      const circ = model.ledPowerCircuit(diagram, e.ledOn);
      check(`${t.name} : seuil de ${e.drop} V compté dans le circuit`,
        Math.abs((circ.diodeDrop ?? 0) - e.drop) < 1e-6, JSON.stringify(circ));
      const bloque = model.ledPowerCircuit(diagram, e.ledOff);
      check(`${t.name} : circuit ouvert côté diode inversée`, bloque.ohms === null, JSON.stringify(bloque));
      break;
    }
    case 'capacitor': {
      // Équivalent de Thévenin vu par l'armature chaude : c'est lui qui fixe la
      // tension d'équilibre et la constante de temps du transitoire. Plusieurs
      // branches RC peuvent partager la MÊME broche de commande : chacune est un
      // nœud indépendant (un condensateur n'est pas une arête résistive, le
      // chemin d'une branche ne peut donc pas passer par la voisine).
      const nodes = model.capacitorNodes(diagram, e.volts, (p) => (p === e.drivePin ? e.drive : 'hiz'));
      for (const c of e.caps) {
        const n = nodes.find((x) => x.partId === c.partId);
        check(`${t.name} : nœud RC ${c.partId} trouvé`, !!n, JSON.stringify(nodes));
        if (!n) continue;
        check(`${t.name} : ${c.partId} tension d'équilibre ${c.target} V`,
          Math.abs(n.target - c.target) < 0.05, `cible=${n.target}`);
        check(`${t.name} : ${c.partId} constante de temps ${c.tau} s`,
          Math.abs(n.tau - c.tau) / c.tau < 0.05, `tau=${n.tau}`);
        check(`${t.name} : ${c.partId} broches de mesure ${c.mcuPins.join(',')}`,
          c.mcuPins.every((p) => n.mcuPins.includes(p)), JSON.stringify(n.mcuPins));
      }
      break;
    }
    case 'fan': {
      const vcc = t.board === 'pico' || t.board === 'picow' ? 3.3 : 5;
      const tourne = model.fanSpeed(model.fanCircuit(diagram, e.spins, vcc), 5, 0.85, 1);
      check(`${t.name} : ventilateur sur l'alim tourne`,
        tourne.speed > 0.9 && !tourne.starved, JSON.stringify(tourne));
      const cale = model.fanSpeed(model.fanCircuit(diagram, e.starved, vcc), 5, 0.85, 1);
      check(`${t.name} : ventilateur sur broche = courant insuffisant`,
        cale.speed === 0 && cale.starved, JSON.stringify(cale));
      break;
    }
    case 'transistor': {
      const vcc = t.board === 'pico' || t.board === 'picow' ? 3.3 : 5;
      for (const s of e.steps) {
        const hauts = s.high ?? [];
        const read = (p) => hauts.includes(p);
        const etat = hauts.length ? `[${hauts.join(',')} haut]` : '[tout bas]';
        resolveBridges(diagram, read, vcc);
        const states = model.transistorStates(diagram, read, vcc);
        for (const [id, ic] of Object.entries(s.on ?? {})) {
          const st = states.find((x) => x.partId === id);
          check(`${t.name} ${etat} : ${id} conduit, Ic max ${(ic * 1000).toFixed(1)} mA`,
            !!st && st.on && Math.abs(st.maxCollectorAmps - ic) / ic < 0.02, JSON.stringify(st));
        }
        for (const id of s.off ?? []) {
          const st = states.find((x) => x.partId === id);
          check(`${t.name} ${etat} : ${id} bloqué`, !!st && !st.on, JSON.stringify(st));
        }
        for (const id of s.ledOn ?? []) {
          check(`${t.name} ${etat} : ${id} allumée`, model.ledOn(diagram, id, read));
        }
        for (const id of s.ledOff ?? []) {
          check(`${t.name} ${etat} : ${id} éteinte`, !model.ledOn(diagram, id, read));
        }
        for (const id of s.fanSpins ?? []) {
          const r = model.fanSpeed(model.fanCircuit(diagram, id, vcc), 5, s.fanAmps, 1);
          check(`${t.name} ${etat} : ${id} tourne`, r.speed > 0.9 && !r.starved, JSON.stringify(r));
        }
        for (const id of s.fanStalls ?? []) {
          const r = model.fanSpeed(model.fanCircuit(diagram, id, vcc), 5, s.fanAmps, 1);
          check(`${t.name} ${etat} : ${id} cale`, r.speed === 0, JSON.stringify(r));
        }
      }
      model.setActiveBridges([]); // pas de fuite d'état d'un test au suivant
      break;
    }
    case 'relay': {
      const vcc = t.board === 'pico' || t.board === 'picow' ? 3.3 : 5;
      for (const s of e.steps) {
        const hauts = s.high ?? [];
        const read = (p) => hauts.includes(p);
        const etat = hauts.length ? `[${hauts.join(',')} haut]` : '[tout bas]';
        resolveBridges(diagram, read, vcc);
        const states = model.relayStates(diagram, read, vcc);
        for (const [id, want] of Object.entries(s.relays ?? {})) {
          const st = states.find((x) => x.partId === id);
          const ok = !!st && Object.entries(want).every(([k, v]) => st[k] === v);
          check(`${t.name} ${etat} : ${id} → ${JSON.stringify(want)}`, ok, JSON.stringify(st));
        }
        for (const id of s.ledOn ?? []) {
          check(`${t.name} ${etat} : ${id} allumée`, model.ledOn(diagram, id, read));
        }
        for (const id of s.ledOff ?? []) {
          check(`${t.name} ${etat} : ${id} éteinte`, !model.ledOn(diagram, id, read));
        }
      }
      model.setActiveBridges([]);
      break;
    }
    case 'keypad': {
      const b = model.keypadBindings(diagram).find((x) => x.partId === e.partId);
      const ok = b && e.rows.every((p, i) => b.rows[i] === p) && e.cols.every((p, i) => b.cols[i] === p);
      check(`${t.name} : lignes/colonnes résolues`, !!ok, JSON.stringify(b));
      break;
    }
    case 'neopixel': {
      const b = model.neopixelBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : DIN → ${e.mcuPin}, ${e.count} px`,
        b?.mcuPin === e.mcuPin && b?.count === e.count, JSON.stringify(b));
      break;
    }
    case 'spi-device': {
      const b = model.spiDeviceBindings(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : D/C=${e.dcPin} CS=${e.csPin}`,
        b?.dcPin === e.dcPin && b?.csPin === e.csPin, JSON.stringify(b));
      break;
    }
    case 'i2c-part': {
      // Les périphériques I²C sont instanciés par la présence du composant
      // (bus global) : on vérifie le composant + son adresse/attributs.
      const part = diagram.parts.find((p) => p.id === e.partId);
      check(`${t.name} : composant I²C présent`, !!part && (part.attrs?.pins ?? 'i2c') === 'i2c');
      break;
    }
    case 'pca9685': {
      const b = model.pca9685Bindings(diagram).find((x) => x.partId === e.partId);
      const ch = b?.channels.find((c) => c.ch === e.channel);
      check(`${t.name} : canal ${e.channel} → ${e.targetId}`,
        ch?.targetId === e.targetId, JSON.stringify(b?.channels));
      const p = model.pca9685PowerState(diagram).find((x) => x.partId === e.partId);
      check(`${t.name} : alim servo ${e.powered ? 'OK' : 'absente'} (bornier V+/GND.2)`,
        p?.ok === e.powered, JSON.stringify(p));
      break;
    }
    default:
      check(`${t.name} : attente inconnue`, false, e.kind);
  }
}
console.log(`Projix : ${checks} contrôles, ${failures} échec(s).`);

if (QUICK) {
  console.log(failures === 0 ? '\nRESULTAT: OK (mode --quick)' : `\nRESULTAT: ECHEC (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

// --- 2. Compilation des .ino (arduino-cli via src/compiler.ts) -----------------
const { compile, detectToolchain } = await bundle('src/compiler.ts', 'compiler.mjs');
const tools = detectToolchain();
const compiled = new Map(); // nom du test → payload (pour la partie e2e)
if (!tools.arduinoCli) {
  console.log('\nSKIP compilation .ino : arduino-cli introuvable.');
} else {
  const inoTests = TESTS.filter((t) => t.ext === 'ino');
  console.log(`\n--- Compilation de ${inoTests.length} sketchs .ino (arduino-cli) ---`);
  for (const t of inoTests) {
    const file = join(HERE, t.name, `${t.name}.ino`);
    const before = failures;
    try {
      const res = compile(t.board, file, ROOT);
      compiled.set(t.name, res.payload);
      check(`${t.name}.ino compile`, res.payload.bytes.length > 0);
    } catch (err) {
      check(`${t.name}.ino compile`, false, String(err).split('\n')[0]);
    }
    if (failures === before) console.log(`  ✓ ${t.name}.ino`);
  }
}

// --- 3. Vérification syntaxique des .py ----------------------------------------
// ast.parse (et non py_compile) : aucun bytecode écrit, pas de __pycache__.
console.log('\n--- Vérification syntaxique des .py (python ast.parse) ---');
const PY_CHECK = 'import ast, sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())';
let pythonOk = true;
try {
  execFileSync('python', ['--version'], { stdio: 'ignore' });
} catch {
  pythonOk = false;
  console.log('SKIP : python introuvable.');
}
if (pythonOk) {
  for (const t of TESTS.filter((x) => x.ext === 'py')) {
    const file = join(HERE, `${t.name}.py`);
    try {
      execFileSync('python', ['-c', PY_CHECK, file], { stdio: ['ignore', 'pipe', 'pipe'] });
      console.log(`  ✓ ${t.name}.py`);
      checks++;
    } catch (err) {
      check(`${t.name}.py : syntaxe`, false, String(err.stderr ?? err).split('\n').slice(-3).join(' '));
    }
  }
}

// --- 4. Bout en bout : AVR (avr8js) puis Pico (PicoEngine + firmware) ----------
console.log('\n--- Exécution de bout en bout ---');
const avr8js = await import('avr8js');

/** Exécute un payload AVR et compte les bascules d'une broche de port. */
function runAvr(payload, { mega = false, port = 'B', pin = 5, cycles = 32_000_000 }) {
  const { CPU, avrInstruction, AVRIOPort, AVRTimer, portBConfig, timer0Config, PinState } = avr8js;
  const cpu = mega ? new CPU(Uint16Array.from(payload.bytes), 0x2200) : new CPU(Uint16Array.from(payload.bytes));
  if (mega) cpu.pc22Bits = true;
  const portB = new AVRIOPort(cpu, portBConfig);
  const timerCfg = mega
    ? { ...timer0Config, compAInterrupt: 0x2a, compBInterrupt: 0x2c, ovfInterrupt: 0x2e }
    : timer0Config;
  new AVRTimer(cpu, timerCfg);
  let toggles = 0;
  let last = PinState.Input;
  portB.addListener(() => {
    const s = portB.pinState(pin);
    if (s !== last) { toggles++; last = s; }
  });
  for (let i = 0; i < cycles && toggles < 6; i++) {
    avrInstruction(cpu);
    cpu.tick();
  }
  return toggles;
}

if (compiled.has('blink-uno')) {
  const toggles = runAvr(compiled.get('blink-uno'), { port: 'B', pin: 5 });
  check('e2e blink-uno : LED D13 clignote (avr8js)', toggles >= 4, `${toggles} bascules`);
  if (toggles >= 4) console.log(`  ✓ blink-uno : D13 clignote (${toggles} bascules)`);
}
if (compiled.has('blink-mega')) {
  const toggles = runAvr(compiled.get('blink-mega'), { mega: true, port: 'B', pin: 7 });
  check('e2e blink-mega : LED D13 clignote (avr8js)', toggles >= 4, `${toggles} bascules`);
  if (toggles >= 4) console.log(`  ✓ blink-mega : D13 clignote (${toggles} bascules)`);
}

// Pico : vrai firmware MicroPython + script led-pico.py, LED externe sur GP15.
const fw = join(ROOT, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (!existsSync(fw)) {
  console.log('SKIP e2e Pico : firmware MicroPython absent (test-assets).');
} else {
  const { parseUf2 } = await bundle('src/shared/uf2.ts', 'uf2.mjs');
  const { PicoEngine } = await bundle('src/webview/engines/pico.mts', 'pico.mjs');
  const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
  const script = readFileSync(join(HERE, 'led-pico.py'), 'utf8');
  const engine = new PicoEngine({ kind: 'flash', segments, script });

  let serial = '';
  let gp15Toggles = 0;
  let lastGp15 = false;
  engine.onSerial = (chunk) => { serial += chunk; };
  engine.onUpdate = () => {
    const v = engine.readDigital('GP15');
    if (v !== lastGp15) { gp15Toggles++; lastGp15 = v; }
  };
  console.log('e2e led-pico : démarrage de MicroPython dans le simulateur (max 120 s)…');
  const started = Date.now();
  engine.start();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const done = gp15Toggles >= 4 && serial.includes('LED');
      if (done || elapsed > 120) {
        clearInterval(timer);
        engine.dispose();
        check('e2e led-pico : LED GP15 clignote (PicoEngine + firmware)', done,
          `${gp15Toggles} bascules en ${elapsed.toFixed(0)} s, série=${JSON.stringify(serial.slice(-80))}`);
        if (done) console.log(`  ✓ led-pico : GP15 clignote (${gp15Toggles} bascules en ${elapsed.toFixed(1)} s)`);
        resolve();
      }
    }, 500);
  });
}

console.log(`\n${checks} contrôles au total.`);
console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
