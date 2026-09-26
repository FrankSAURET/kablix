// Reproduit le pas à pas sur une COPIE de dmx-uno-lib.ino (fichier de Frank intact).
import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'kx-dmxpas-'));
const build = async (entry, name) => {
	const out = join(tmp, name);
	await esbuild.build({ entryPoints: [join(root, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(out).href);
};
const { compile } = await build('src/compiler.ts', 'compiler.mjs');
const { AvrEngine } = await build('src/webview/engines/avr.mts', 'avr.mjs');

const dir = join(tmp, 'dmxpas');
mkdirSync(dir);
const src = join(dir, 'dmxpas.ino');
copyFileSync(process.argv[4] ?? join(root, 'testkablix/Arduino/dmx-uno-lib/dmx-uno-lib.ino'), src);
const res = await compile('uno', src, root, { arduinoCli: join(process.env.APPDATA, 'Code/User/globalStorage/electropol-fr.arduino-vscode-ide/arduino-cli/arduino-cli.exe') });
console.log(res.log);
const dbg = res.payload.debug;
console.log('lignes :', dbg.lines.length, 'fonctions :', JSON.stringify(dbg.functions));
for (const e of dbg.lines) console.log(`  0x${e.addr.toString(16)} -> ${e.line}`);

const engine = new AvrEngine(Uint16Array.from(res.payload.bytes), dbg);
let waiting = null;
engine.onDebugPause = (s) => waiting?.(s);
const nextPause = (ms = 20000) => new Promise((resolve) => {
	const t = setTimeout(() => { waiting = null; resolve(null); }, ms);
	waiting = (s) => { clearTimeout(t); waiting = null; resolve(s); };
});
const bp = Number(process.argv[2] ?? 7);
engine.setBreakpoints([{ line: bp }]);
engine.start();
let s = await nextPause();
console.log('arrêt sur', s?.line, 'SP', engine.cpu?.SP);
engine.setBreakpoints([]);
const vus = [];
for (let i = 0; i < Number(process.argv[3] ?? 30); i++) {
	engine.step();
	s = await nextPause();
	if (!s) { console.log('pas perdu'); break; }
	vus.push(s.line);
	console.log(`pas ${i + 1} : ligne ${s.line}  pc=0x${(engine.cpu.pc * 2).toString(16)} SP=0x${engine.cpu.SP.toString(16)}`);
}
engine.stop();
console.log(vus.join(' '));
process.exit(0);
