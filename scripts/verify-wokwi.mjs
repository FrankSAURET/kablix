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
    { id: 'led1', type: 'led', x: 120, y: -40, rotation: 90, flipH: true, attrs: { color: 'red' } },
    { id: 'btn1', type: 'button', x: 60, y: 120, flipV: true, attrs: { color: 'green' } },
  ],
  wires: [
    {
      id: 'w1',
      a: { partId: 'led1', pin: 'A' },
      b: { partId: 'uno', pin: '13' },
      color: 'green',
      points: [{ x: 130, y: 10 }, { x: 80, y: 10 }],
    },
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
check('chemin Wokwi standard vide (coudes hors extension)', Array.isArray(w.connections[0][3]) && w.connections[0][3].length === 0);
check('extension kablix présente', !!w.kablix && w.kablix.version === 1);
check('retournements exportés (flipH led, flipV bouton)', w.kablix?.parts?.led1?.flipH === true && w.kablix?.parts?.btn1?.flipV === true, JSON.stringify(w.kablix?.parts));
check('coudes du fil w1 exportés (index 0)', w.kablix?.wires?.[0]?.i === 0 && w.kablix.wires[0].points.length === 2, JSON.stringify(w.kablix?.wires));

console.log('\nRé-import Wokkwi → Kablix :');
const back = fromWokwiDiagram(w);
check('3 composants', back.parts.length === 3, String(back.parts.length));
const led2 = back.parts.find((p) => p.id === 'led1');
check('LED retrouvée (type interne led)', led2?.type === 'led' && led2?.x === 120 && led2?.y === -40);
check('rotation réimportée', led2?.rotation === 90);
check('retournement réimporté (flipH led, flipV bouton)', led2?.flipH === true && back.parts.find((p) => p.id === 'btn1')?.flipV === true);
check('2 fils réimportés', back.wires.length === 2, String(back.wires.length));
check('couleur de fil conservée', back.wires.find((x) => x.a.pin === 'C')?.color === 'black');
const w1back = back.wires.find((x) => x.a.pin === 'A');
check('coudes réimportés (2 points conservés)', w1back?.points?.length === 2 && w1back.points[0].x === 130 && w1back.points[1].y === 10, JSON.stringify(w1back?.points));

console.log('\nNoms de cartes Pico (Wokwi actuel + rétrocompatibilité) :');
const wp = toWokwiDiagram({ parts: [{ id: 'p', type: 'picow', x: 0, y: 0 }], wires: [] });
check('export Pico W → board-pi-pico-w', wp.parts[0].type === 'board-pi-pico-w', wp.parts[0].type);
const wpico = toWokwiDiagram({ parts: [{ id: 'p', type: 'pico', x: 0, y: 0 }], wires: [] });
check('export Pico → board-pi-pico', wpico.parts[0].type === 'board-pi-pico', wpico.parts[0].type);
check('import nom actuel board-pi-pico-w → picow', fromWokwiDiagram(wp).parts[0]?.type === 'picow');
const oldNames = { version: 1, parts: [{ type: 'wokwi-pi-pico-w', id: 'a', left: 0, top: 0, attrs: {} }, { type: 'wokwi-pi-pico', id: 'b', left: 0, top: 0, attrs: {} }], connections: [] };
const oldBack = fromWokwiDiagram(oldNames);
check('import ancien wokwi-pi-pico-w → picow', oldBack.parts.find((p) => p.id === 'a')?.type === 'picow');
check('import ancien wokwi-pi-pico → pico', oldBack.parts.find((p) => p.id === 'b')?.type === 'pico');

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
