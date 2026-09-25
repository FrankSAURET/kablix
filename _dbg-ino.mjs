// Essai temporaire : compile un .ino via le VRAI arduino-cli et affiche les infos de débogage.
import esbuild from 'esbuild';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'kablix-ino-'));
const out = join(tmp, 'compiler.mjs');
await esbuild.build({ entryPoints: [join(root, 'src/compiler.ts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { compile } = await import(pathToFileURL(out).href);

const cli = process.env.APPDATA + '/Code/User/globalStorage/electropol-fr.arduino-vscode-ide/arduino-cli/arduino-cli.exe';
const src = process.argv[2];
let srcPath = src;
if (!src) {
  const dir = join(tmp, 'KxDbg');
  mkdirSync(dir);
  srcPath = join(dir, 'KxDbg.ino');
  writeFileSync(srcPath, [
    'int compteur;',
    'float seuil = 3.14;',
    'void setup() { pinMode(13, OUTPUT); }',
    'void loop() {',
    '  static int memo = 0;',
    '  int travail = 3;',
    '  compteur++;',
    '  memo += travail;',
    '  delay(5);',
    '}',
  ].join('\n'));
}
const t0 = Date.now();
const res = await compile('uno', srcPath, root, { arduinoCli: cli });
console.log('durée', Date.now() - t0, 'ms');
console.log(res.log);
const d = res.payload.debug;
console.log('debug:', d ? `${d.lines.length} lignes, globals=${JSON.stringify(d.globals)}, locals=${JSON.stringify(d.locals)}` : 'ABSENT');
