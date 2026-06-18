// Tests unitaires des décodeurs de périphériques I²C (LCD HD44780 via PCF8574,
// PCA9685). Pas de firmware ni de toolchain : on rejoue les octets I²C qu'un
// pilote enverrait et on vérifie l'état décodé.
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kx-i2c-'));
const out = join(tmp, 'i2c.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/engines/i2c-devices.mts')],
  outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { Lcd1602Device, Pca9685Device, Ssd1306Device, Ili9341Device, SdCardSpiDevice, selectSpiDevice } =
  await import(pathToFileURL(out).href);
const wsOut = join(tmp, 'ws2812.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/engines/ws2812.mts')],
  outfile: wsOut, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { Ws2812Decoder } = await import(pathToFileURL(wsOut).href);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// --- LCD : reproduit l'écriture d'un octet en 4 bits (comme LiquidCrystal_I2C) ---
const BL = 0x08, E = 0x04;
function lcdSendByte(lcd, value, rs) {
  for (const nib of [(value >> 4) & 0x0f, value & 0x0f]) {
    const base = (nib << 4) | (rs ? 0x01 : 0) | BL;
    lcd.write(base | E); // E haut (donnée présente)
    lcd.write(base);     // E bas → verrouillage
  }
}

console.log('LCD HD44780 (PCF8574) :');
{
  const lcd = new Lcd1602Device(0x27, 16, 2);
  lcdSendByte(lcd, 0x01, 0); // clear
  for (const c of 'HELLO') lcdSendByte(lcd, c.charCodeAt(0), 1);
  lcdSendByte(lcd, 0xc0, 0); // set DDRAM 0x40 → ligne 1
  for (const c of 'KABLIX') lcdSendByte(lcd, c.charCodeAt(0), 1);
  check('ligne 0 = "HELLO"', lcd.text[0].startsWith('HELLO'), JSON.stringify(lcd.text[0]));
  check('ligne 1 = "KABLIX"', lcd.text[1].startsWith('KABLIX'), JSON.stringify(lcd.text[1]));
  lcdSendByte(lcd, 0x01, 0); // clear
  check('clear vide l\'écran', lcd.text[0].trim() === '' && lcd.text[1].trim() === '');
}

console.log('PCA9685 :');
{
  const pca = new Pca9685Device(0x40);
  // Écrit le canal 0 : pointeur 0x06 puis ON=0 (L,H) et OFF=2048 (L,H).
  pca.onStart();
  for (const b of [0x06, 0x00, 0x00, 0x00, 0x08]) pca.write(b);
  check('canal 0 → rapport cyclique 0,5', Math.abs(pca.channelDuty(0) - 0.5) < 0.01, String(pca.channelDuty(0)));
  // Canal 3 plein ON (bit 4 de ON_H).
  pca.onStart();
  for (const b of [0x06 + 4 * 3, 0x00, 0x10, 0x00, 0x00]) pca.write(b);
  check('canal 3 → plein ON (1,0)', pca.channelDuty(3) === 1);
  check('canal 1 inutilisé → 0', pca.channelDuty(1) === 0);
}

console.log('SSD1306 OLED :');
{
  // Style Adafruit : flux de commandes (contrôle 0x00) puis flux de données (0x40).
  const oled = new Ssd1306Device(0x3c, 128, 64);
  oled.onStart();
  for (const b of [0x00, 0x21, 0, 127, 0x22, 0, 7]) oled.write(b); // col 0..127, page 0..7
  oled.onStart();
  oled.write(0x40); // mode données
  oled.write(0xff); // colonne 0, page 0 → 8 px verticaux allumés
  oled.write(0x01); // colonne 1 → seul le pixel du haut
  check('colonne 0 entièrement allumée', [0, 1, 2, 3, 4, 5, 6, 7].every((y) => oled.pixelOn(0, y)));
  check('colonne 1 : seul (1,0) allumé', oled.pixelOn(1, 0) && !oled.pixelOn(1, 1));

  // Style MicroPython : une commande par transaction (contrôle 0x80).
  const o2 = new Ssd1306Device(0x3c, 128, 64);
  for (const cmd of [0x21, 0, 127, 0x22, 0, 7]) {
    o2.onStart();
    o2.write(0x80);
    o2.write(cmd);
  }
  o2.onStart();
  o2.write(0x40);
  o2.write(0xaa); // page 0, col 0 : pixels pairs (0,2,4,6)
  check('MicroPython : adressage multi-transaction', o2.pixelOn(0, 1) && !o2.pixelOn(0, 0));

  // Mode SPI : transfer(octet, dc) — dc=0 commande, dc=1 donnée.
  const spi = new Ssd1306Device(0x3c, 128, 64);
  for (const c of [0x21, 0, 127, 0x22, 0, 7]) spi.transfer(c, false); // commandes
  spi.transfer(0xff, true); // donnée col 0
  spi.transfer(0x01, true); // donnée col 1
  check('SPI : col 0 allumée, (1,0) seul', spi.pixelOn(0, 0) && spi.pixelOn(1, 0) && !spi.pixelOn(1, 1));
}

console.log('NeoPixel (WS2812) :');
{
  // Rejoue des fronts (cycles, niveau) : « 1 » = HAUT long+BAS court, « 0 » l'inverse.
  const dec = new Ws2812Decoder(2, 16);
  let cyc = 1000;
  const sendBit = (bit) => {
    const high = bit ? 17 : 11;
    const low = bit ? 12 : 18;
    dec.edge(cyc, true);
    dec.edge(cyc + high, false);
    cyc += high + low;
  };
  const sendByte = (v) => { for (let i = 7; i >= 0; i--) sendBit((v >> i) & 1); };
  // LED0 vert (G=0xFF,R=0,B=0), LED1 rouge (G=0,R=0xFF,B=0).
  for (const b of [0xff, 0x00, 0x00, 0x00, 0xff, 0x00]) sendByte(b);
  dec.flush(); // fin de trame : classe le dernier bit (pas de front suivant)
  const px = dec.colors.map((c) => ({ r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) }));
  check('LED0 = vert', px[0].g > 200 && px[0].r < 40, JSON.stringify(px[0]));
  check('LED1 = rouge', px[1].r > 200 && px[1].g < 40, JSON.stringify(px[1]));
}

console.log('ILI9341 TFT (SPI) :');
{
  const tft = new Ili9341Device();
  const cmd = (c) => tft.transfer(c, false);
  const data = (d) => tft.transfer(d, true);
  cmd(0x2a); [0, 0, 0, 0].forEach(data); // CASET : x0=0, x1=0
  cmd(0x2b); [0, 0, 0, 0].forEach(data); // RASET : y0=0, y1=0
  cmd(0x2c); // RAMWR
  data(0xf8); data(0x00); // RGB565 0xF800 = rouge
  check('pixel (0,0) rouge', tft.data[0] === 255 && tft.data[1] === 0 && tft.data[2] === 0);
}

console.log('microSD (SPI) :');
{
  const sd = new SdCardSpiDevice();
  const send = (bytes) => { let last = 0xff; for (const b of bytes) last = sd.transfer(b); return last; };
  const clock = () => sd.transfer(0xff);
  check('CMD0 → idle (0x01)', send([0x40, 0, 0, 0, 0, 0x95]) === 0x01);
  send([0x77, 0, 0, 0, 0, 0x01]); // CMD55
  check('ACMD41 → prêt (0x00)', send([0x69, 0x40, 0, 0, 0, 0x01]) === 0x00);
  // Écrit le bloc 0 : R1, jeton 0xFE, 512 o (0..),  2 CRC → réponse 0x05.
  send([0x58, 0, 0, 0, 0, 0x01]); // CMD24 (write block 0)
  sd.transfer(0xfe);
  for (let i = 0; i < 512; i++) sd.transfer(i === 0 ? 0xab : 0x00);
  sd.transfer(0xff); const wr = sd.transfer(0xff); // CRC + réponse data
  check('écriture bloc → data response 0x05', wr === 0x05 || sd.transfer(0xff) === 0x05);
  // Relit le bloc 0 : R1, attendre le jeton 0xFE puis lire le 1er octet.
  send([0x51, 0, 0, 0, 0, 0x01]); // CMD17 (read block 0)
  let g = 0; while (clock() !== 0xfe && g++ < 8) { /* attend le jeton */ }
  check('relecture bloc → 1er octet 0xAB', clock() === 0xab);
}

console.log('Sélection SPI par CS :');
{
  const a = { csPin: '10', transfer: () => 0xa1 };
  const b = { csPin: '9', transfer: () => 0xb2 };
  const low = new Set(['9']); // seul CS 9 est actif (bas)
  const sel = selectSpiDevice([a, b], (p) => !low.has(p));
  check('CS actif (bas) sélectionne le bon esclave', sel === b);
}

console.log(failures === 0 ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
