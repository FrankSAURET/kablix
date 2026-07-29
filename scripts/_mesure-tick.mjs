// Mesure jetable A/B : cpu.tick() inconditionnel vs appelé seulement quand il a
// quelque chose à faire. Les deux variantes sont mesurées EN ALTERNANCE, plusieurs
// fois, et on garde le MEILLEUR passage de chacune : la machine est bruitée
// (thermique, autres processus) et deux exécutions successives d'un même bench
// varient de 25 %, ce qui noie un écart réel.
import esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(root, 'package.json'));
const avr8js = require('avr8js');

const tmp = mkdtempSync(join(tmpdir(), 'kablix-tick-'));
const out = join(tmp, 'compiler.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/compiler.ts')], outfile: out,
  bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { compile, detectToolchain } = await import(pathToFileURL(out).href);

let tools = detectToolchain();
if (!tools.arduinoCli && !tools.avrGcc) {
  const gccRoot = process.env.LOCALAPPDATA
    && join(process.env.LOCALAPPDATA, 'Arduino15', 'packages', 'arduino', 'tools', 'avr-gcc');
  if (gccRoot && existsSync(gccRoot)) {
    for (const v of readdirSync(gccRoot)) process.env.PATH = join(gccRoot, v, 'bin') + delimiter + process.env.PATH;
  }
  tools = detectToolchain();
}
if (!tools.arduinoCli && !tools.avrGcc) {
  console.log('toolchain absente, mesure impossible');
  process.exit(0);
}

const CLOCK_HZ = 16e6;
const {
  CPU, AVRIOPort, AVRTimer, AVRUSART,
  portBConfig, portCConfig, portDConfig,
  timer0Config, timer1Config, timer2Config, usart0Config,
  avrInstruction,
} = avr8js;

const machine = (program) => {
  const cpu = new CPU(program.slice());
  new AVRTimer(cpu, timer0Config);
  new AVRTimer(cpu, timer1Config);
  new AVRTimer(cpu, timer2Config);
  const ports = [
    new AVRIOPort(cpu, portBConfig),
    new AVRIOPort(cpu, portCConfig),
    new AVRIOPort(cpu, portDConfig),
  ];
  new AVRUSART(cpu, usart0Config, CLOCK_HZ);
  let fronts = 0;
  for (const p of ports) p.addListener(() => { fronts++; });
  return cpu;
};

const variantes = {
  'tick() à chaque instruction': (cpu) => { avrInstruction(cpu); cpu.tick(); },
  'tick() seulement si utile  ': (cpu) => {
    avrInstruction(cpu);
    const ev = cpu.nextClockEvent;
    if ((ev !== null && ev.cycles <= cpu.cycles) || cpu.nextInterrupt >= 0) cpu.tick();
  },
};

const N = 20e6;
const passe = (program, step) => {
  const cpu = machine(program);
  for (let i = 0; i < 1e6; i++) step(cpu);
  const c0 = cpu.cycles;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) step(cpu);
  const dt = (performance.now() - t0) / 1000;
  return { mips: N / dt / 1e6, ratio: ((cpu.cycles - c0) / CLOCK_HZ) / dt };
};

for (const sketch of ['testkablix/horloge-uno/horloge-uno.ino']) {
  const res = await compile('uno', join(root, sketch), root);
  const program = Uint16Array.from(res.payload.bytes);
  console.log(`\n${sketch} (${program.length} mots)`);
  const best = {};
  for (let tour = 0; tour < 5; tour++) {
    for (const [label, step] of Object.entries(variantes)) {
      const r = passe(program, step);
      if (!best[label] || r.mips > best[label].mips) best[label] = r;
    }
  }
  for (const [label, r] of Object.entries(best)) {
    console.log(`  ${label} : ${r.mips.toFixed(1)} Mips · plafond ${r.ratio.toFixed(2)}× le temps réel`);
  }
}
