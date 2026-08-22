// Mesure jetable : le moteur Pico face à une page occupée (repeinture). Le
// rapport temps simulé/temps réel est bon thread libre ; on vérifie ici ce qu'il
// devient quand le rendu vole le thread, comme dans la webview.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = process.env.KABLIX_ROOT ?? fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-mes-'));

async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
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

const fw = firmwarePico();
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Occupe le thread pendant `ms`, exactement comme une repeinture de la page. */
const bloque = (ms) => {
  const fin = performance.now() + ms;
  while (performance.now() < fin) {
    /* vol de thread */
  }
};

async function mesure(nom, script, brancher, { dureeMs = 3000, blocageMs = 0, periodeMs = 100 } = {}) {
  const engine = new PicoEngine({ kind: 'flash', segments, script });
  let serial = '';
  engine.onSerial = (c) => {
    serial += c;
  };
  brancher?.(engine);
  engine.start();

  const t0 = Date.now();
  while (!serial.includes('KX_GO') && Date.now() - t0 < 90000) await sleep(200);
  if (!serial.includes('KX_GO')) {
    engine.dispose();
    console.log(`❌ ${nom} : script jamais démarré.`);
    return;
  }
  await sleep(300);
  const clk = engine.mcu.clkSys || 125_000_000;
  const timer = blocageMs > 0 ? setInterval(() => bloque(blocageMs), periodeMs) : null;
  const c0 = engine.mcu.core.cycles;
  const w0 = performance.now();
  await sleep(dureeMs);
  const simMs = ((engine.mcu.core.cycles - c0) / clk) * 1000;
  const reelMs = performance.now() - w0;
  if (timer) clearInterval(timer);
  engine.dispose();
  console.log(`${nom} : ${(simMs / reelMs).toFixed(2)}× temps réel (${simMs.toFixed(0)}/${reelMs.toFixed(0)} ms)`);
}

const lire = (f) =>
  readFileSync(join(ROOT, 'testkablix', f), 'utf8').replace('while True:', "print('KX_GO')\nwhile True:");
const ring = lire('Neopixel-ring-pico.py');
const nu = "from time import sleep_ms\nprint('KX_GO')\nwhile True:\n    sleep_ms(40)\n";

await mesure('témoin, thread libre', nu, null);
await mesure('témoin, page occupée 30 %', nu, null, { blocageMs: 30, periodeMs: 100 });
await mesure('témoin, page occupée 50 %', nu, null, { blocageMs: 50, periodeMs: 100 });
await mesure('anneau, thread libre', ring, (e) => e.setNeopixels([{ pin: 'GP26', count: 16 }]));
await mesure('anneau, page occupée 30 %', ring, (e) => e.setNeopixels([{ pin: 'GP26', count: 16 }]), {
  blocageMs: 30,
  periodeMs: 100,
});
