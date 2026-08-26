// Régression unitaire (sans firmware) du blocage SPI+DMA corrigé en
// v2026.7.86 (patch rp2040js : alarmes simultanées en FIFO) : rejoue la
// séquence de registres de machine_spi.c (MicroPython) — deux canaux DMA
// (TX vers SSPDR, RX depuis SSPDR paced par DREQ) + RPSPI en complétion
// synchrone (comme le onTransmit de Kablix). Attendu matériel : les deux
// canaux finissent (BUSY=0, 128 octets transmis, 128 reçus, zéro overrun).
//
// Joué sur LES DEUX PUCES : au-delà de 16 octets MicroPython passe par le DMA,
// et un `spi.write(bytes(64))` ne revenait jamais sur Pico 2 — les projets
// ili9341 et microsd restaient muets. Les bases et les numéros de DREQ ne sont
// pas les mêmes d'une puce à l'autre (le RP2350 a un PIO de plus devant).
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RP2040 } from 'rp2040js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-spidma-'));

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

const { RP2350 } = await load('vendor/rp2350js/src/rp2350.ts', 'rp2350.mjs');

const DMA = 0x50000000;
const CH = (n, reg) => DMA + n * 0x40 + reg;
const CTRL_AL1 = 0x010; // écrit le ctrl SANS déclencher

const LEN = 128;
const SRC = 0x20000000;
const DEVNULL = 0x20001000;

// Une puce, ses adresses, ses numéros de DREQ, ses bits de CTRL. Rien de tout
// cela n'est au même endroit d'une puce à l'autre : le RP2350 a deux jeux d'IRQ
// DMA de plus (MULTI_CHAN_TRIGGER passe de 0x430 à 0x450), un PIO de plus devant
// (DREQ du SPI 16/17 -> 24/25) et deux sens de parcours de plus dans CTRL, qui
// poussent TREQ_SEL de 15 à 17, CHAIN_TO de 11 à 13 et BUSY de 24 à 26.
const PUCES = [
  { nom: 'RP2040', creer: () => new RP2040(), spi0: 0x4003c000, dreqTx: 16, dreqRx: 17,
    trigger: 0x430, treq: 15, chain: 11, busy: 1 << 24 },
  { nom: 'RP2350', creer: () => new RP2350({ coreArch: 'arm' }), spi0: 0x40080000, dreqTx: 24, dreqRx: 25,
    trigger: 0x450, treq: 17, chain: 13, busy: 1 << 26 },
];

let echecs = 0;
for (const puce of PUCES) {
  const SPI0 = puce.spi0;
  const SSPDR = SPI0 + 0x008;
  const SSPSR = SPI0 + 0x00c;
  const SSPRIS = SPI0 + 0x018;

  const mcu = puce.creer();

  // SPI0 : 8 bits, prescale 2, activé (équivalent spi_init 10 MHz)
  mcu.writeUint32(SPI0 + 0x000, 7); // SSPCR0 : DSS=7 -> 8 bits
  mcu.writeUint32(SPI0 + 0x010, 2); // SSPCPSR
  mcu.writeUint32(SPI0 + 0x004, 1 << 1); // SSPCR1 : SSE

  let sent = 0;
  mcu.spi[0].onTransmit = (mosi) => {
    sent++;
    mcu.spi[0].completeTransmit(0x5a); // synchrone, comme Kablix
  };

  for (let i = 0; i < LEN; i++) mcu.writeUint8(SRC + i, i);

  // ch0 = TX (RAM -> SSPDR, incr read), ch1 = RX (SSPDR -> devnull, incr write)
  const EN = 1, INCR_READ = 1 << 4;
  mcu.writeUint32(CH(0, 0x000), SRC);
  mcu.writeUint32(CH(0, 0x004), SSPDR);
  mcu.writeUint32(CH(0, 0x008), LEN);
  mcu.writeUint32(CH(0, CTRL_AL1), EN | INCR_READ | (puce.dreqTx << puce.treq) | (0 << puce.chain));
  mcu.writeUint32(CH(1, 0x000), SSPDR);
  mcu.writeUint32(CH(1, 0x004), DEVNULL);
  mcu.writeUint32(CH(1, 0x008), LEN);
  mcu.writeUint32(CH(1, CTRL_AL1), EN | (puce.dreqRx << puce.treq) | (1 << puce.chain));

  mcu.writeUint32(DMA + puce.trigger, 0b11); // dma_start_channel_mask

  // 10 ms simulées : très large pour 128 octets à 10 MHz (~102 µs réels)
  mcu.clock.tick(10e6);

  const txBusy = !!(mcu.readUint32(CH(0, 0x00c)) & puce.busy);
  const rxBusy = !!(mcu.readUint32(CH(1, 0x00c)) & puce.busy);
  const txRemain = mcu.readUint32(CH(0, 0x008));
  const rxRemain = mcu.readUint32(CH(1, 0x008));
  const overrun = !!(mcu.readUint32(SSPRIS) & 1); // SSPRORINTR
  console.log(`--- ${puce.nom}`);
  console.log(`octets transmis au device : ${sent}/${LEN}`);
  console.log(`canal TX : busy=${txBusy} restant=${txRemain}`);
  console.log(`canal RX : busy=${rxBusy} restant=${rxRemain}`);
  console.log(`overrun RX FIFO (SSPRORINTR) : ${overrun}`);
  console.log(`SSPSR = 0x${mcu.readUint32(SSPSR).toString(16)}`);
  if (txBusy || rxBusy || sent !== LEN || overrun) echecs++;
}

console.log(echecs ? `RESULTAT: ECHEC (${echecs} puce(s))` : 'RESULTAT: OK');
process.exit(echecs ? 1 : 0);
