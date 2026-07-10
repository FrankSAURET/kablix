// Vérifie l'intégralité de testkablix/ :
//   1. chaque .projix : archive valide, manifeste cohérent, composants connus,
//      extrémités de fils valides, et câblage résolu par le moteur (bindings
//      de src/webview/diagram/model.mts — mêmes fonctions que la simulation) ;
//   2. chaque .ino : compilation réelle via arduino-cli (src/compiler.ts) ;
//   3. chaque .py : compilation syntaxique via python -m py_compile ;
//   4. bout en bout : blink-uno et blink-mega exécutés dans avr8js (LED D13),
//      led-pico.py exécuté dans PicoEngine avec le vrai firmware MicroPython.
//   node testkablix/_verify.mjs [--quick]   (--quick : saute compilations + e2e)
import esbuild from 'esbuild';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TESTS, PART_PINS } from './_spec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const QUICK = process.argv.includes('--quick');
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

const model = await bundle('src/webview/diagram/model.mts', 'model.mjs');
const catalog = await bundle('src/webview/diagram/catalog.mjs', 'catalog.mjs');

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
console.log('\n--- Vérification syntaxique des .py (python -m py_compile) ---');
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
      execFileSync('python', ['-m', 'py_compile', file], { stdio: ['ignore', 'pipe', 'pipe'] });
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
