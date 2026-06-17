// Vérifie le pont réseau Pico W de bout en bout : un script MicroPython fait
// import network / urequests, se « connecte », puis urequests.get(...). Le shim
// injecté (NET_PREAMBLE) tunnelle la requête via stdout (\x1bNT…) ; ce test joue
// le rôle de l'hôte (onNetRequest → sendNetResponse) et vérifie que la vraie
// réponse revient bien dans le script.
// Nécessite test-assets/RPI_PICO-20230426-v1.20.0.uf2 (sauté sinon).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-net-'));
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: out,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const fw = join(root, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (!existsSync(fw)) {
  console.log('SKIP : firmware absent (test-assets/RPI_PICO-20230426-v1.20.0.uf2).');
  console.log('RESULTAT: OK');
  process.exit(0);
}

const { instrumentPython } = await load('src/shared/pydebug.ts', 'pydebug.mjs');
const { NET_PREAMBLE } = await load('src/shared/pynet.ts', 'pynet.mjs');
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

const userScript = [
  'import network',
  'import urequests',
  'wlan = network.WLAN(network.STA_IF)',
  'wlan.active(True)',
  "wlan.connect('box', 'secret')",
  "print('CONN', wlan.isconnected(), wlan.ifconfig()[0])",
  "r = urequests.get('http://kablix.test/api')",
  "print('GOT', r.status_code, r.text)",
  'r.close()',
  "print('DONE')",
  '',
].join('\n');

const script = NET_PREAMBLE + '\n' + instrumentPython(userScript);
const engine = new PicoEngine({ kind: 'flash', segments, script });

let serial = '';
const requests = [];
engine.onSerial = (c) => { serial += c; };
// Hôte simulé : répond à chaque requête réseau du script.
engine.onNetRequest = (req) => {
  requests.push(req);
  engine.sendNetResponse({ id: req.id, status: 200, reason: 'OK', body: 'HELLO-KABLIX' });
};

const waitFor = (pred, ms, label) => {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const it = setInterval(() => {
      if (pred()) { clearInterval(it); res(); }
      else if (Date.now() - t0 > ms) { clearInterval(it); rej(new Error(`délai dépassé : ${label}`)); }
    }, 100);
  });
};

console.log('Pont réseau Pico W (bout en bout) :');
console.log('  Démarrage de MicroPython dans le simulateur (max 300 s)…');
const t0 = Date.now();
engine.start();
try {
  await waitFor(() => serial.includes('CONN'), 300000, "'CONN' (WLAN factice)");
  check(`WLAN factice « connecté » en ${((Date.now() - t0) / 1000).toFixed(1)} s`, /CONN True 192\.168\.1\.50/.test(serial));
  await waitFor(() => requests.length >= 1, 60000, 'requête réseau tunnelée');
  check('requête tunnelée vers l\'hôte (GET kablix.test/api)', requests[0]?.m === 'GET' && /kablix\.test\/api/.test(requests[0]?.url));
  await waitFor(() => serial.includes('DONE'), 60000, 'fin du script');
  check('réponse réinjectée dans le script (status + body)', /GOT 200 HELLO-KABLIX/.test(serial));
} catch (e) {
  check('exécution', false, e.message);
  console.log('--- série ---\n' + serial.slice(-500));
} finally {
  engine.dispose();
}

console.log(failures === 0 ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
