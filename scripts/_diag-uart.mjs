// Où l'UART se bloque-t-il ? Le programme annonce chaque étape ; la dernière
// lettre imprimée dit quelle instruction n'est jamais revenue.
//
// Le projet dmx n'imprimait RIEN sur Pico 2 alors qu'il tourne sur Pico 1 : il
// envoie 513 octets à 250 kbauds précédés d'un BREAK.
//
//   node scripts/_diag-uart.mjs [rp2350|rp2040] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-uart-'));
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

// Une lettre par étape. La taille des envois grandit, et le BREAK arrive à part :
// c'est la trame DMX complète, décomposée pas à pas.
const script = [
	'import time',
	// Un sommeil après chaque étape : sans lui, les lignes déjà imprimées
	// dorment dans le tampon USB et on accuse la mauvaise instruction.
	'def dire(x):',
	'    print(x)',
	'    time.sleep_ms(200)',
	"dire('0 le programme demarre')",
	'from machine import Pin, UART',
	"dire('A machine importe')",
	'uart = UART(0, baudrate=250000, bits=8, parity=None, stop=2, tx=Pin(0))',
	"dire('B objet cree')",
	"uart.write(b'\x01')",
	"dire('C un octet')",
	'uart.write(bytes(8))',
	"dire('D huit octets')",
	'uart.sendbreak()',
	"dire('E break')",
	'uart.write(bytes(513))',
	"dire('F cinq cent treize')",
	't0 = time.ticks_us()',
	'for _ in range(5):',
	'    uart.sendbreak()',
	'    uart.write(bytes(513))',
	"dire('G cinq trames en %d us simulees' % time.ticks_diff(time.ticks_us(), t0))",
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
	// Les octets envoyés sur la ligne UART atterrissent aussi sur la console :
	// on ne garde que les caractères lisibles pour ne pas noyer les lettres.
	const propre = [...sortie].filter((c) => c === '\n' || (c >= ' ' && c <= '~')).join('');
	console.log(propre || '(rien)');
	process.exit(0);
}, SECONDES * 1000);
