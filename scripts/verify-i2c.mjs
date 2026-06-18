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
const { Lcd1602Device, Pca9685Device } = await import(pathToFileURL(out).href);

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

console.log(failures === 0 ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
