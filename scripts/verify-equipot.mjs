// Vérifie l'ÉQUIPOTENTIALITÉ des rails internes des cartes MCU : toutes les
// broches de masse (GND.1..GND.n) d'un Pico/Mega/Uno/Nano sont un même net (le
// PCB les relie), de même que les broches 5 V multiples du Mega (5V/5V.1/5V.2).
// Les rails de tensions DIFFÉRENTES (3V3 vs VBUS vs VSYS ; 3.3V vs 5V vs VIN)
// restent SÉPARÉS. Régression v2026.7.165 : deux composants câblés sur des
// masses DIFFÉRENTES de la même carte ne se voyaient pas en simulation.
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-equipot-'));
const buildTo = async (entry, outfile) => {
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: join(tmp, outfile),
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.svg': 'text' },
    logLevel: 'silent',
  });
  return import(pathToFileURL(join(tmp, outfile)).href);
};
const { buildNets } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
const { mcuInternalStrips } = await buildTo('src/webview/diagram/catalog.mts', 'catalog.mjs');

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

// Un schéma d'une seule carte, sans fil : on interroge directement les nets.
const only = (type) => ({ parts: [{ id: 'b', type, x: 0, y: 0 }], wires: [] });
const net = (nets, pin) => nets.netOf({ partId: 'b', pin });
const same = (type, a, b) => {
  const nets = buildNets(only(type));
  return net(nets, a) === net(nets, b);
};
const diff = (type, a, b) => !same(type, a, b);

console.log('Masses communes (GND.n = même équipotentielle) :');
check('Pico : GND.1 = GND.4 = GND.8', same('pico', 'GND.1', 'GND.4') && same('pico', 'GND.1', 'GND.8'));
check('Mega : GND.1 = GND.5', same('mega', 'GND.1', 'GND.5'));
check('Uno  : GND.1 = GND.3', same('uno', 'GND.1', 'GND.3'));
check('Nano : GND.1 = GND.2', same('nano', 'GND.1', 'GND.2'));
check('Pico W : GND.2 = GND.7', same('picow', 'GND.2', 'GND.7'));

console.log('Rail 5 V multiple du Mega (5V/5V.1/5V.2 = même rail) :');
check('Mega : 5V = 5V.1 = 5V.2', same('mega', '5V', '5V.1') && same('mega', '5V', '5V.2'));

console.log('Rails de TENSIONS DIFFÉRENTES restés séparés :');
check('Pico : 3V3 ≠ VBUS ≠ VSYS', diff('pico', '3V3', 'VBUS') && diff('pico', '3V3', 'VSYS') && diff('pico', 'VBUS', 'VSYS'));
check('Pico : GND ≠ 3V3', diff('pico', 'GND.1', '3V3'));
check('Mega : 5V ≠ 3.3V ≠ VIN', diff('mega', '5V', '3.3V') && diff('mega', '5V', 'VIN'));
check('Mega : GND ≠ 5V', diff('mega', 'GND.1', '5V'));
check('Uno  : 5V ≠ 3.3V ≠ VIN', diff('uno', '5V', '3.3V') && diff('uno', '5V', 'VIN'));

console.log('Broches distinctes NON fusionnées (GP différents, broches numériques) :');
check('Pico : GP0 ≠ GP1', diff('pico', 'GP0', 'GP1'));
check('Mega : broche 2 ≠ broche 3', diff('mega', '2', '3'));

console.log('mcuInternalStrips : contenu attendu :');
const picoStrips = mcuInternalStrips('pico');
check('Pico : 1 strip (masses uniquement, pas de 5V multiple)', picoStrips.length === 1 && picoStrips[0].every((p) => p.startsWith('GND')));
const megaStrips = mcuInternalStrips('mega');
check('Mega : 2 strips (masses + rail 5V)', megaStrips.length === 2);

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
