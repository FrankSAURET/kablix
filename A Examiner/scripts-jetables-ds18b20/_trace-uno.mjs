// Instrumente l'automate DS18B20 pendant le VRAI sketch Uno : on veut la
// durée exacte de chaque bas vu par le capteur, et la phase interne.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kablix-trace-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: out,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');
const { loadArtifact } = await load('src/compiler.ts', 'compiler.mjs');

const HEX = join(root, 'testkablix/.build/ds18b20-uno.ino.hex');
const artefact = loadArtifact(HEX);
const engine = new AvrEngine(Uint16Array.from(artefact.payload.bytes), null, 'avr328');
engine.setDs18b20([{ id: 'Capt1', pin: '2', temperatureC: 23.5 }]);

const CPU_US = 16;
const evts = [];
const d = engine.ds18b20[0];
const auto = d.auto;
const fd = auto.frontDescendant.bind(auto), fm = auto.frontMontant.bind(auto);
let descente = null;
auto.frontDescendant = (c) => { descente = c; const r = fd(c); evts.push({ t: c / CPU_US, k: 'v', ph: auto.phase }); return r; };
auto.frontMontant = (c) => {
  const dur = descente === null ? null : (c - descente) / CPU_US;
  const r = fm(c);
  evts.push({ t: c / CPU_US, k: '^', dur, ph: auto.phase, imp: !!r });
  return r;
};

let serial = '';
engine.onSerial = (ch) => { serial += ch; };
engine.start();

await new Promise((r) => setTimeout(r, 25000));
engine.stop();

console.log('SERIE:', JSON.stringify(serial));
console.log('evenements:', evts.length);
// Les 60 premiers fronts montants avec leur durée de bas.
const montants = evts.filter((e) => e.k === '^');
for (const e of montants.slice(0, 60)) {
  console.log(`  ^ t=${e.t.toFixed(1)}us  bas=${e.dur === null ? '?' : e.dur.toFixed(3) + 'us'}  phase=${e.ph}  impulsion=${e.imp}`);
}
console.log('--- resume des durees de bas ---');
const par = new Map();
for (const e of montants) {
  if (e.dur === null) continue;
  const k = e.dur < 2 ? '<2' : e.dur < 10 ? '2-10' : e.dur < 70 ? '10-70' : e.dur < 400 ? '70-400' : e.dur < 480 ? '400-480' : '>=480';
  par.set(k, (par.get(k) ?? 0) + 1);
}
for (const [k, v] of par) console.log(`  ${k} us : ${v}`);
