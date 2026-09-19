// Qui tient le fil bas ? On trace le niveau du fil ET ce que le MCU pilote,
// autour du premier SEARCH ROM du vrai sketch Uno.
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kablix-trace2-'));
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

const artefact = loadArtifact(join(root, 'testkablix/.build/ds18b20-uno.ino.hex'));
const engine = new AvrEngine(Uint16Array.from(artefact.payload.bytes), null, 'avr328');
engine.setDs18b20([{ id: 'Capt1', pin: '2', temperatureC: 23.5 }]);

const CPU_US = 16;
const d = engine.ds18b20[0];
const auto = d.auto;

// On journalise chaque impulsion posée par l'automate, avec sa fenêtre.
const poses = [];
const fd = auto.frontDescendant.bind(auto), fm = auto.frontMontant.bind(auto);
auto.frontDescendant = (c) => { const r = fd(c); if (r) poses.push({ t: c / CPU_US, r, ou: 'v' }); return r; };
auto.frontMontant = (c) => { const r = fm(c); if (r) poses.push({ t: c / CPU_US, r, ou: '^' }); return r; };

// Et chaque transition vue par le listener, avec tenuJusqua au moment du test.
const vus = [];
const orig = Object.getPrototypeOf(engine).sampleDs18b20;
let dernier = null;
Object.getPrototypeOf(engine).sampleDs18b20 = function () {
  const now = this.cpu.cycles;
  const map = this.pinMap['2'];
  const st = this.ports[map[0]]?.pinState(map[1]);
  if (st !== dernier) {
    vus.push({ t: now / CPU_US, st, tenu: d.tenuJusqua / CPU_US, etaitBas: d.etaitBas });
    dernier = st;
  }
  return orig.call(this);
};

let serial = '';
engine.onSerial = (ch) => { serial += ch; };
engine.start();
await new Promise((r) => setTimeout(r, 20000));
engine.stop();

console.log('SERIE:', JSON.stringify(serial));
console.log('\n--- impulsions posees par l automate (10 premieres) ---');
for (const p of poses.slice(0, 10)) {
  console.log(`  ${p.ou} t=${p.t.toFixed(2)}us -> tient bas de ${(p.r.debut / CPU_US).toFixed(2)} a ${(p.r.fin / CPU_US).toFixed(2)} us (duree ${((p.r.fin - p.r.debut) / CPU_US).toFixed(2)})`);
}
console.log('\n--- transitions du fil autour du 1er SEARCH ROM ---');
// PinState : 0=Low 1=High 2=InputLow? On imprime le brut.
const debut = poses.length ? poses[0].t : 0;
for (const v of vus.filter((v) => v.t > debut - 100 && v.t < debut + 1600).slice(0, 80)) {
  console.log(`  t=${v.t.toFixed(2)}us  pinState=${v.st}  tenuJusqua=${v.tenu.toFixed(2)}  etaitBas=${v.etaitBas}`);
}
