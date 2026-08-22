// Vérifie le pont réseau Pico W de bout en bout : un script MicroPython fait
// import network / urequests, se « connecte », puis urequests.get(...). Le shim
// injecté (NET_PREAMBLE) tunnelle la requête via stdout (\x1bNT…) ; ce test joue
// le rôle de l'hôte (onNetRequest → sendNetResponse) et vérifie que la vraie
// réponse revient bien dans le script.
// Nécessite un firmware Pico (test-assets/RPI_PICO-*.uf2 ou le cache de
// l'extension) ; sauté sinon.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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

/** Premier firmware Pico (RP2040) trouvé, ou undefined. */
function trouverFirmware() {
  const dirs = [
    join(root, 'test-assets'),
    join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((n) => /^RPI_PICO-.*\.uf2$/.test(n));
    if (hit) return join(dir, hit);
  }
  return undefined;
}
const fw = trouverFirmware();
if (!fw) {
  console.log('SKIP : firmware Pico introuvable (RPI_PICO-*.uf2).');
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
  // Deuxième moitié du pont : le script fait le SERVEUR (point d'accès + page
  // web). C'est l'hôte qui tient la vraie prise TCP ; ici, ce banc la joue.
  'import socket',
  'ap = network.WLAN(network.AP_IF)',
  "ap.config(essid='Kablix-Pico', password='kablix2026')",
  'ap.active(True)',
  "print('AP', ap.ifconfig()[0])",
  'srv = socket.socket()',
  'srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)',
  "srv.bind(socket.getaddrinfo('0.0.0.0', 80)[0][-1])",
  'srv.listen(1)',
  'cl, peer = srv.accept()',
  'requete = cl.recv(1024)',
  "print('REQ', requete.split(b'\\r\\n')[0].decode())",
  "cl.send('HTTP/1.1 200 OK\\r\\n\\r\\nLED-ALLUMEE')",
  'cl.close()',
  "print('SERVED')",
  '',
].join('\n');

const script = NET_PREAMBLE + '\n' + instrumentPython(userScript);
const engine = new PicoEngine({ kind: 'flash', segments, script });

let serial = '';
const requests = [];
engine.onSerial = (c) => { serial += c; };
// Hôte simulé : répond à chaque requête réseau du script — requête HTTP
// sortante (urequests) comme opérations de prise TCP entrante (socket serveur).
const REQUETE_CLIENT = 'GET /on HTTP/1.1\r\nHost: 192.168.1.166\r\n\r\n';
const hexa = (s) => Buffer.from(s, 'utf8').toString('hex');
const envois = [];
engine.onNetRequest = (req) => {
  requests.push(req);
  const repondre = (r) => engine.sendNetResponse({ id: req.id, ...r });
  switch (req.op) {
    case undefined:
      repondre({ status: 200, reason: 'OK', body: 'HELLO-KABLIX' });
      return;
    case 'listen':
    case 'apinfo':
      // Le port 80 demandé n'est pas obtenu : l'hôte annonce celui de repli.
      repondre({ ip: '192.168.1.166', port: 8080 });
      return;
    case 'accept':
      // Une seule connexion : les suivantes attendraient pour toujours, comme
      // sur une vraie carte.
      repondre({ cid: 1, peer: '192.168.1.30', data: hexa(REQUETE_CLIENT) });
      return;
    case 'recv':
      repondre({ cid: req.cid, data: '' });
      return;
    case 'send':
      envois.push(Buffer.from(req.data ?? '', 'hex').toString('utf8'));
      repondre({ n: (req.data ?? '').length / 2 });
      return;
    default:
      repondre({});
  }
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

  // Moitié serveur : point d'accès, prise à l'écoute, connexion acceptée.
  await waitFor(() => serial.includes('AP '), 60000, "'AP' (point d'accès)");
  check('point d\'accès : ifconfig rend l\'adresse de l\'hôte', /AP 192\.168\.1\.166/.test(serial));
  await waitFor(() => requests.some((r) => r.op === 'listen'), 60000, 'ouverture du port');
  check('port demandé transmis à l\'hôte (listen 80)', requests.find((r) => r.op === 'listen')?.port === 80);
  await waitFor(() => serial.includes('SERVED'), 60000, 'fin du service');
  check('requête du client relue par le script', /REQ GET \/on HTTP\/1\.1/.test(serial));
  check('réponse HTTP écrite dans la prise', envois.join('').includes('HTTP/1.1 200 OK\r\n\r\nLED-ALLUMEE'), envois.join('|'));
  check('prise refermée par le script', requests.some((r) => r.op === 'close' && r.cid === 1));
} catch (e) {
  check('exécution', false, e.message);
  console.log('--- requêtes ---\n' + requests.map((r) => r.op ?? r.m).join(', '));
  console.log('--- série ---\n' + serial.slice(-500));
} finally {
  engine.dispose();
}

console.log(failures === 0 ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
