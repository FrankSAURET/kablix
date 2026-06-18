// Vérifie l'interopérabilité Wokwi (wokwi.mts) : conversion schéma Kablix →
// diagram.json, ré-import, et tolérance aux types inconnus.
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'kablix-wokwi-')), 'wokwi.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/wokwi.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { toWokwiDiagram, fromWokwiDiagram } = await import(pathToFileURL(out).href);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// Schéma Kablix : Uno + LED (tournée) + bouton, deux fils.
const diagram = {
  parts: [
    { id: 'uno', type: 'uno', x: 0, y: 0 },
    { id: 'led1', type: 'led', x: 120, y: -40, rotation: 90, attrs: { color: 'red' } },
    { id: 'btn1', type: 'button', x: 60, y: 120, attrs: { color: 'green' } },
  ],
  wires: [
    { id: 'w1', a: { partId: 'led1', pin: 'A' }, b: { partId: 'uno', pin: '13' }, color: 'green' },
    { id: 'w2', a: { partId: 'led1', pin: 'C' }, b: { partId: 'uno', pin: 'GND.1' }, color: 'black' },
    // Fil implicite d'enfichage : ne doit PAS être exporté.
    { id: 'wa', a: { partId: 'btn1', pin: '1.l' }, b: { partId: 'uno', pin: '2' }, auto: true },
  ],
};

console.log('Export Kablix → Wokwi (diagram.json) :');
const w = toWokwiDiagram(diagram);
check('version 1 + editor', w.version === 1 && typeof w.editor === 'string');
const led = w.parts.find((p) => p.id === 'led1');
check('type LED mappé sur wokwi-led', led?.type === 'wokwi-led', led?.type);
check('position left=x / top=y', led?.left === 120 && led?.top === -40, JSON.stringify(led));
check('rotation conservée', led?.rotate === 90);
check('carte Uno → wokwi-arduino-uno', w.parts.find((p) => p.id === 'uno')?.type === 'wokwi-arduino-uno');
check('2 connexions (fil auto exclu)', w.connections.length === 2, String(w.connections.length));
check(
  'connexion au format "id:pin" + couleur',
  w.connections[0][0] === 'led1:A' && w.connections[0][1] === 'uno:13' && w.connections[0][2] === 'green',
  JSON.stringify(w.connections[0])
);

console.log('\nRé-import Wokkwi → Kablix :');
const back = fromWokwiDiagram(w);
check('3 composants', back.parts.length === 3, String(back.parts.length));
const led2 = back.parts.find((p) => p.id === 'led1');
check('LED retrouvée (type interne led)', led2?.type === 'led' && led2?.x === 120 && led2?.y === -40);
check('rotation réimportée', led2?.rotation === 90);
check('2 fils réimportés', back.wires.length === 2, String(back.wires.length));
check('couleur de fil conservée', back.wires.find((x) => x.a.pin === 'C')?.color === 'black');

console.log('\nTolérance aux types inconnus :');
const foreign = {
  version: 1,
  parts: [
    { type: 'wokwi-led', id: 'l', left: 0, top: 0, attrs: {} },
    { type: 'wokwi-dht22', id: 'x', left: 50, top: 50, attrs: {} },
  ],
  connections: [['x:SDA', 'l:A', 'green', []]],
};
const r = fromWokwiDiagram(foreign);
check('composant connu importé, inconnu ignoré', r.parts.length === 1 && r.parts[0].id === 'l');
check('type inconnu signalé', r.skipped.includes('wokwi-dht22'), JSON.stringify(r.skipped));
check('fil vers un composant ignoré écarté', r.wires.length === 0, String(r.wires.length));

console.log(failures === 0 ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
