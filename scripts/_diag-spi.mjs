// Où le SPI se bloque-t-il ? Le programme annonce chaque étape ; la dernière
// lettre imprimée dit quelle instruction n'est jamais revenue.
//
// Les projets ili9341 et microsd n'imprimaient RIEN sur Pico 2 alors qu'ils
// tournent sur Pico 1 : il fallait un programme qui parle avant de mourir.
//
//   node scripts/_diag-spi.mjs [rp2350|rp2040] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-spi-'));
const famille = process.argv[2] ?? 'rp2350';
const SECONDES = Number(process.argv[3] ?? 20);

async function load(entry, name) {
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: join(tmp, name), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(join(tmp, name)).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const fw = firmwarePico(famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-');
if (!fw) { console.log('firmware absent'); process.exit(1); }
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

// Une lettre par étape. La taille des envois grandit : MicroPython bascule sur
// le DMA au-delà d'un certain nombre d'octets, et c'est justement là que les
// deux cartes peuvent diverger.
const script = [
	'import time',
	// Un sommeil après chaque étape : sans lui, les lignes déjà imprimées
	// dorment dans le tampon USB et on accuse la mauvaise instruction.
	'def dire(x):',
	'    print(x)',
	'    time.sleep_ms(200)',
	"dire('0 le programme demarre')",
	'from machine import Pin, SPI',
	"dire('A machine importe')",
	'spi = SPI(0, baudrate=1_000_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))',
	"dire('B objet cree')",
	"spi.write(b'\\x01')",
	"dire('C un octet')",
	'spi.write(bytes(8))',
	"dire('D huit octets')",
	'spi.write(bytes(64))',
	"dire('E soixante-quatre')",
	'spi.write(bytes(1024))',
	"dire('F mille')",
	't0 = time.ticks_us()',
	'for _ in range(100):',
	'    spi.write(bytes(64))',
	"dire('G cent envois en %d us simulees' % time.ticks_diff(time.ticks_us(), t0))",
	'',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script }, famille);
let sortie = '';
engine.onSerial = (c) => { sortie += c; };
const t0 = performance.now();
engine.start();
setTimeout(() => {
	const mur = (performance.now() - t0) / 1000;
	console.log(`${famille} — ${mur.toFixed(1)} s de montre, ${engine.simulatedMs?.() ?? '?'} ms simulées`);
	// Les octets nuls envoyes sur le peripherique atterrissent aussi sur la
	// console : on les ote pour garder les lettres lisibles.
	const propre = [...sortie].filter((c) => c.charCodeAt(0) !== 0).join('');
	console.log(propre || '(rien)');
	process.exit(0);
}, SECONDES * 1000);
