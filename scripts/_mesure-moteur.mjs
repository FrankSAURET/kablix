// Mesure jetable : DÉBIT BRUT du moteur AVR (millions d'instructions simulées par
// seconde réelle), et ce que coûte chaque couche empilée par AvrEngine. Objectif :
// savoir si les 96 % d'occupation CPU sur horloge-uno viennent du CPU émulé
// lui-même, de cpu.tick(), des timers, ou des écouteurs de ports.
// 16 MHz simulés « à l'heure » = il faut soutenir ~16 M instructions/s.
import esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(root, 'package.json'));
const avr8js = require('avr8js'); // build CJS : importable tel quel depuis Node

const tmp = mkdtempSync(join(tmpdir(), 'kablix-moteur-'));
const buildMod = async (entry, name) => {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: out,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
};
const { compile, detectToolchain } = await buildMod('src/compiler.ts', 'compiler.mjs');

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

const ino = join(root, 'testkablix/horloge-uno/horloge-uno.ino');
const res = await compile('uno', ino, root);
const program = Uint16Array.from(res.payload.bytes);
console.log(`horloge-uno.ino compilé : ${program.length} mots\n`);

const CLOCK_HZ = 16e6;
const {
  CPU, AVRIOPort, AVRTimer, AVRUSART,
  portBConfig, portCConfig, portDConfig,
  timer0Config, timer1Config, timer2Config, usart0Config,
  avrInstruction,
} = avr8js;

// Chaque variante construit une machine et la fait tourner N instructions en
// boucle serrée (aucun cadencement) : le débit obtenu est le plafond du moteur.
const N = 40e6;
const mesure = (label, make) => {
  const { cpu, step } = make();
  for (let i = 0; i < 2e6; i++) step(); // chauffe le JIT
  const c0 = cpu.cycles;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) step();
  const dt = (performance.now() - t0) / 1000;
  const cycles = cpu.cycles - c0;
  const mips = N / dt / 1e6;
  // Ratio = temps simulé produit ÷ temps réel consommé, à plein régime.
  const ratio = (cycles / CLOCK_HZ) / dt;
  console.log(
    `${label} : ${mips.toFixed(1)} Mips · plafond ${ratio.toFixed(2)}× le temps réel`
  );
  return ratio;
};

const neuf = () => new CPU(program.slice());

mesure('CPU seul (avrInstruction)         ', () => {
  const cpu = neuf();
  return { cpu, step: () => avrInstruction(cpu) };
});

mesure('+ cpu.tick()                      ', () => {
  const cpu = neuf();
  return { cpu, step: () => { avrInstruction(cpu); cpu.tick(); } };
});

mesure('+ 3 timers                        ', () => {
  const cpu = neuf();
  new AVRTimer(cpu, timer0Config);
  new AVRTimer(cpu, timer1Config);
  new AVRTimer(cpu, timer2Config);
  return { cpu, step: () => { avrInstruction(cpu); cpu.tick(); } };
});

const machineKablix = () => {
  const cpu = neuf();
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

mesure('+ 3 ports + USART (config Kablix) ', () => {
  const cpu = machineKablix();
  return { cpu, step: () => { avrInstruction(cpu); cpu.tick(); } };
});

// Variante : tick() n'est appelé que s'il a quelque chose à faire. tick() ne fait
// rien d'autre que (a) tirer l'événement d'horloge échu et (b) servir une
// interruption en attente : quand ni l'un ni l'autre n'est vrai — l'écrasante
// majorité des instructions — l'appel est pur surcoût.
mesure('  idem, tick() seulement si utile ', () => {
  const cpu = machineKablix();
  return {
    cpu,
    step: () => {
      avrInstruction(cpu);
      const ev = cpu.nextClockEvent;
      if ((ev !== null && ev.cycles <= cpu.cycles) || cpu.nextInterrupt >= 0) cpu.tick();
    },
  };
});
