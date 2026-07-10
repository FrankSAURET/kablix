// Régression unitaire (sans firmware) du blocage SPI+DMA corrigé en
// v2026.7.86 (patch rp2040js : alarmes simultanées en FIFO) : rejoue la
// séquence de registres de machine_spi.c (MicroPython) — deux canaux DMA
// (TX vers SSPDR, RX depuis SSPDR paced par DREQ) + RPSPI en complétion
// synchrone (comme le onTransmit de Kablix). Attendu matériel : les deux
// canaux finissent (BUSY=0, 128 octets transmis, 128 reçus, zéro overrun).
import { RP2040 } from 'rp2040js';

const SPI0 = 0x4003c000;
const SSPDR = SPI0 + 0x008;
const SSPSR = SPI0 + 0x00c;
const SSPRIS = SPI0 + 0x018;
const DMA = 0x50000000;
const CH = (n, reg) => DMA + n * 0x40 + reg;
const CTRL_AL1 = 0x010; // écrit le ctrl SANS déclencher
const MULTI_CHAN_TRIGGER = DMA + 0x430;

const LEN = 128;
const SRC = 0x20000000;
const DEVNULL = 0x20001000;

const mcu = new RP2040();

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

// ch0 = TX (RAM -> SSPDR, DREQ_SPI0_TX=16, incr read), ch1 = RX (SSPDR -> devnull, DREQ_SPI0_RX=17)
const EN = 1, INCR_READ = 1 << 4;
mcu.writeUint32(CH(0, 0x000), SRC);
mcu.writeUint32(CH(0, 0x004), SSPDR);
mcu.writeUint32(CH(0, 0x008), LEN);
mcu.writeUint32(CH(0, CTRL_AL1), EN | INCR_READ | (16 << 15) | (0 << 11));
mcu.writeUint32(CH(1, 0x000), SSPDR);
mcu.writeUint32(CH(1, 0x004), DEVNULL);
mcu.writeUint32(CH(1, 0x008), LEN);
mcu.writeUint32(CH(1, CTRL_AL1), EN | (17 << 15) | (1 << 11));

mcu.writeUint32(MULTI_CHAN_TRIGGER, 0b11); // dma_start_channel_mask

// 10 ms simulées : très large pour 128 octets à 10 MHz (~102 µs réels)
mcu.clock.tick(10e6);

const BUSY = 1 << 24;
const txBusy = !!(mcu.readUint32(CH(0, 0x00c)) & BUSY);
const rxBusy = !!(mcu.readUint32(CH(1, 0x00c)) & BUSY);
const txRemain = mcu.readUint32(CH(0, 0x008));
const rxRemain = mcu.readUint32(CH(1, 0x008));
const overrun = !!(mcu.readUint32(SSPRIS) & 1); // SSPRORINTR
console.log(`octets transmis au device : ${sent}/${LEN}`);
console.log(`canal TX : busy=${txBusy} restant=${txRemain}`);
console.log(`canal RX : busy=${rxBusy} restant=${rxRemain}`);
console.log(`overrun RX FIFO (SSPRORINTR) : ${overrun}`);
console.log(`SSPSR = 0x${mcu.readUint32(SSPSR).toString(16)}`);
const ok = !txBusy && !rxBusy && sent === LEN && !overrun;
console.log(ok ? 'RESULTAT: OK' : 'RESULTAT: ECHEC');
process.exit(ok ? 0 : 1);
