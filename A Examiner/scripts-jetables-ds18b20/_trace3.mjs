// Que voit l'automate, exactement, autour du premier SEARCH ROM ?
// On journalise CHAQUE appel effectif a frontDescendant/frontMontant, avec
// tenuJusqua, pour savoir lesquels sont des fantomes.
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kablix-trace3-'));
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
const log = [];
const fd = auto.frontDescendant.bind(auto), fm = auto.frontMontant.bind(auto);
let desc = null;
auto.frontDescendant = (c) => {
  desc = c;
  const av = { ph: auto.phase, bit: auto.chercheBit, et: auto.chercheEtape };
  const r = fd(c);
  log.push({ t: c / CPU_US, k: 'v', av, ap: { ph: auto.phase, bit: auto.chercheBit, et: auto.chercheEtape }, imp: r ? (r.fin - r.debut) / CPU_US : null, tenu: (engine.ds18b20[0]?.tenuJusqua ?? 0) / CPU_US });
  return r;
};
auto.frontMontant = (c) => {
  const dur = desc === null ? null : (c - desc) / CPU_US;
  const av = { ph: auto.phase, bit: auto.chercheBit, et: auto.chercheEtape };
  const r = fm(c);
  log.push({ t: c / CPU_US, k: '^', dur, av, ap: { ph: auto.phase, bit: auto.chercheBit, et: auto.chercheEtape }, imp: r ? (r.fin - r.debut) / CPU_US : null, tenu: (engine.ds18b20[0]?.tenuJusqua ?? 0) / CPU_US });
  return r;
};

let serial = '';
engine.onSerial = (ch) => { serial += ch; };
engine.start();
await new Promise((r) => setTimeout(r, 20000));
engine.stop();

console.log('SERIE:', JSON.stringify(serial));
console.log('\n--- appels a l automate (40 premiers apres le 1er reset) ---');
const i0 = log.findIndex((e) => e.k === '^' && e.dur !== null && e.dur > 400);
for (const e of log.slice(i0, i0 + 40)) {
  const d1 = `${e.av.ph}/b${e.av.bit}/e${e.av.et}`;
  const d2 = `${e.ap.ph}/b${e.ap.bit}/e${e.ap.et}`;
  const bas = typeof e.dur === 'number' ? e.dur.toFixed(2).padStart(7) : '   -   ';
  const tenu = typeof e.tenu === 'number' ? e.tenu.toFixed(2).padStart(9) : '    ?    ';
  console.log(`  ${e.k} t=${e.t.toFixed(2)} bas=${bas} tenu=${tenu} ${d1.padEnd(22)} -> ${d2.padEnd(22)} imp=${e.imp ?? '-'}`);
}
