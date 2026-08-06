// La LED embarquée du Pico W doit clignoter avec le code que tout le monde
// écrit : `Pin("LED", Pin.OUT)`.
//
// Sur une vraie carte, cette LED n'est PAS sur un GPIO du RP2040 : elle est
// câblée sur la puce Wi-Fi CYW43439, que rp2040js n'émule pas. Deux symptômes
// remontés par Frank sur blink-pico :
//   - la LED restait figée alors que le programme imprimait bien ON puis OFF ;
//   - « [CYW43] Failed to start CYW43 » défilait à chaque écriture — un simple
//     MESSAGE, pas une exception, donc le `try/except` habituel ne basculait
//     jamais sur le repli GP25.
// La rustine `machine` de src/compiler.ts redirige Pin("LED") vers GP25, que
// Kablix affiche comme LED embarquée, et le pilote Wi-Fi n'est plus sollicité.
//
// Le sketch contrôlé est le VRAI testkablix/blink-picow.py, joué dans les
// conditions par défaut de l'extension : pont réseau Pico W activé.
// Nécessite le firmware Pico W (test sauté sinon) : cherché dans test-assets/
// puis dans le stockage global de l'extension installée.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Premier firmware Pico W trouvé, ou undefined. */
function findPicoWFirmware() {
  const dirs = [
    join(root, 'test-assets'),
    join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
    join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((n) => n.startsWith('RPI_PICO_W') && n.endsWith('.uf2'));
    if (hit) return join(dir, hit);
  }
  return undefined;
}

const fw = findPicoWFirmware();
if (!fw) {
  console.log('SKIP : firmware Pico W introuvable (RPI_PICO_W-*.uf2).');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-picowled-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm',
    external: ['vscode'], logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

let failures = 0;
let checks = 0;
function ok(label, cond, detail = '') {
  checks++;
  if (cond) console.log(`✅ ${label}`);
  else { failures++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const SKETCH = readFileSync(tk('blink-picow.py'), 'utf8');
console.log(`Firmware : ${fw.split(/[\\/]/).pop()}`);

ok('blink-picow.py s adresse bien à la LED PAR SON NOM (le cas qui échouait)',
  /Pin\(\s*"LED"/.test(SKETCH), JSON.stringify(SKETCH.slice(0, 120)));

/**
 * Fait tourner un sketch dans le simulateur et relève les bascules de GP25 et
 * le journal série. `net` = pont réseau Pico W (activé par défaut chez
 * l'utilisateur : c'est la condition à reproduire).
 */
async function run(source, { net = true, maxMs = 120_000 } = {}) {
  const program = loadPythonProgram(fw, source, net);
  const engine = new PicoEngine({
    kind: 'flash',
    segments: program.payload.segments.map((s) => ({
      addr: s.addr,
      data: new Uint8Array(Buffer.from(s.b64, 'base64')),
    })),
    script: program.payload.script,
  });
  let serial = '';
  let toggles = 0;
  let last = null;
  engine.onSerial = (chunk) => { serial += chunk; };
  engine.onUpdate = () => {
    const v = engine.readDigital('GP25');
    if (last !== null && v !== last) toggles++;
    last = v;
  };
  engine.start();
  const started = Date.now();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if (toggles >= 4 || Date.now() - started > maxMs) { clearInterval(timer); resolve(); }
    }, 100);
  });
  engine.stop?.();
  return { toggles, serial, seconds: ((Date.now() - started) / 1000).toFixed(1) };
}

const r = await run(SKETCH);
console.log(`(${r.seconds} s, ${r.toggles} bascules de GP25)`);

ok('le programme tourne (le moniteur série reçoit les états)',
  /LED (ON|OFF)/.test(r.serial), JSON.stringify(r.serial.slice(-200)));
ok('la LED embarquée BASCULE vraiment sur GP25 (elle ne reste plus figée)',
  r.toggles >= 4, `${r.toggles} bascules`);
ok('la LED s ÉTEINT aussi (des OFF sont imprimés, pas seulement des ON)',
  /LED OFF/.test(r.serial));
ok('le pilote Wi-Fi n est plus sollicité (aucun « Failed to start CYW43 »)',
  !/Failed to start CYW43/.test(r.serial),
  `${(r.serial.match(/Failed to start CYW43/g) ?? []).length} occurrence(s)`);

// Contre-épreuve : la rustine est neutralisée juste après avoir été posée.
// PIÈGE — `import machine as _m` ne rend PAS le module natif : il rend ce que
// sys.modules contient, donc la rustine elle-même, et la « neutralisation » la
// réinstallait. Il faut EFFACER l'entrée : le prochain `from machine import`
// recharge alors le vrai module natif. Pin("LED") repart vers la puce Wi-Fi
// absente et le programme ne pilote plus rien.
const SANS_RUSTINE = [
  'import sys as _s',
  'try:',
  '    del _s.modules["machine"]',
  'except Exception:',
  '    pass',
  '',
].join('\n') + SKETCH;
// Symptôme exact du bug : `toggle()` part vers la puce absente, la LED n'est
// donc JAMAIS vue allumée (le programme n'imprime que des « LED OFF ») et le
// pilote Wi-Fi crache son échec à chaque écriture.
// À NE PAS confondre avec les bascules de GP25 : sur Pico W, GP25 est aussi le
// CS du bus SPI vers la puce Wi-Fi. Le pilote le fait donc remuer en boucle en
// essayant de la joindre — ce n'est pas la LED qui clignote.
const c = await run(SANS_RUSTINE, { maxMs: 30_000 });
ok('contre-épreuve : sans la redirection, la LED n est JAMAIS vue allumée',
  /LED OFF/.test(c.serial) && !/LED ON/.test(c.serial),
  `série ${JSON.stringify(c.serial.slice(-160))}`);
ok('contre-épreuve : sans la redirection, le pilote Wi-Fi absent se plaint',
  /Failed to start CYW43/.test(c.serial), `série ${JSON.stringify(c.serial.slice(-160))}`);

console.log(`\npicow-led : ${checks} contrôles, ${failures} échec(s).`);
console.log(failures === 0 ? 'RESULTAT: OK' : 'RESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
