// Régression SPI multi-octets sur Pico/MicroPython (bug v2026.7.84, corrigé
// v2026.7.86) : vrai firmware + machine.SPI en écriture 1, 4 puis 128 octets
// (le chemin 128 octets passe par le DMA du firmware, seuil 32). Avant
// correctif, l'ordre LIFO des alarmes simultanées de SimulationClock affamait
// le canal DMA RX (rxFIFO en overrun) et le firmware bloquait à jamais sur
// dma_channel_is_busy. Un device espion vérifie chaque octet reçu.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fw = join(root, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (!existsSync(fw)) {
  console.log('SKIP : firmware absent.');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-spi-'));
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

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({
  addr: s.addr,
  data: s.data,
}));

const script = [
  'from machine import Pin, SPI',
  'cs = Pin(17, Pin.OUT, value=1)',
  'dc = Pin(20, Pin.OUT, value=0)',
  'spi = SPI(0, baudrate=10000000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))',
  "print('KX_STEP1')",
  'cs.value(0)',
  'spi.write(bytes([0x2A]))',
  'cs.value(1)',
  "print('KX_STEP2')",
  'cs.value(0)',
  'spi.write(bytes([0x00, 0x01, 0x00, 0x7F]))',
  'cs.value(1)',
  "print('KX_STEP3')",
  'dc.value(1)',
  'cs.value(0)',
  'spi.write(bytes([i & 0xFF for i in range(128)]))',
  'cs.value(1)',
  "print('KX_DONE')",
  '',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script });

const transfers = [];
engine.setSpiDevices([
  {
    csPin: 'GP17',
    dcPin: 'GP20',
    transfer(mosi, dc) {
      transfers.push({ mosi, dc });
      if (transfers.length <= 20 || transfers.length % 32 === 0) {
        console.log(`  [spi] #${transfers.length} mosi=0x${mosi.toString(16).padStart(2, '0')} dc=${dc}`);
      }
      return 0x00;
    },
  },
]);

let serial = '';
engine.onSerial = (chunk) => {
  serial += chunk;
  process.stdout.write(chunk);
};

console.log('Démarrage (max 60 s)…');
const started = Date.now();
engine.start();

const timer = setInterval(() => {
  const elapsed = (Date.now() - started) / 1000;
  const done = serial.includes('KX_DONE');
  if (done || elapsed > 60) {
    clearInterval(timer);
    engine.dispose();
    console.log(`\n--- ${elapsed.toFixed(1)} s, ${transfers.length} transferts ---`);
    const bytes = transfers.map((t) => t.mosi);
    console.log('20 premiers octets :', bytes.slice(0, 20).map((b) => '0x' + b.toString(16)).join(' '));
    console.log('20 derniers octets :', bytes.slice(-20).map((b) => '0x' + b.toString(16)).join(' '));
    const steps = ['KX_STEP1', 'KX_STEP2', 'KX_STEP3', 'KX_DONE'].map(
      (s) => `${s}=${serial.includes(s) ? 'oui' : 'NON'}`
    );
    console.log('Étapes atteintes :', steps.join(' '));
    // Attendu si tout va bien : 1 + 4 + 128 = 133 transferts, KX_DONE atteint.
    const ok = done && transfers.length === 133;
    console.log(ok ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
    process.exit(ok ? 0 : 1);
  }
}, 500);
