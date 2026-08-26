// Régression NeoPixel sur Pico/MicroPython (bug v2026.7.82, corrigé
// v2026.7.86) : machine.bitstream (bit-bang SIO, busy-wait sur SysTick) via
// le module neopixel officiel d'un vrai firmware. Avant correctif, SYST_CVR
// restait gelé pendant les lots d'instructions de KablixSimulator (clock.tick
// une seule fois par lot) : durées HAUT toutes identiques, zéro couleur.
// Attendu : les 4 couleurs ressortent exactement du Ws2812Decoder.
//
// Joué sur LES DEUX CARTES : aucun banc de composant ne connaissait le Pico 2,
// et onze projets y restaient muets sans qu'un seul banc ne rougisse.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwareAbsent, firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const tmp = mkdtempSync(join(tmpdir(), 'kablix-npx-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const expected = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 10, g: 20, b: 30 },
];

const script = [
  'from machine import Pin',
  'import neopixel',
  'np = neopixel.NeoPixel(Pin(15), 4)',
  'np[0] = (255, 0, 0)',
  'np[1] = (0, 255, 0)',
  'np[2] = (0, 0, 255)',
  'np[3] = (10, 20, 30)',
  'np.write()',
  "print('KX_DONE')",
  '',
].join('\n');

/** Allume les 4 pixels sur une carte et relit ce que le décodeur a vu. */
async function essai(carte) {
  console.log(`\n--- ${carte.nom}`);
  const fw = firmwarePico(carte.prefixe);
  if (!fw) {
    console.log(`  SKIP : ${firmwareAbsent(carte.prefixe)}`);
    return true;
  }
  const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({
    addr: s.addr,
    data: s.data,
  }));

  const engine = new PicoEngine({ kind: 'flash', segments, script }, carte.famille);
  engine.setNeopixels([{ pin: 'GP15', count: 4 }]);

  let serial = '';
  engine.onSerial = (chunk) => {
    serial += chunk;
    process.stdout.write(chunk);
  };

  console.log('Démarrage (max 60 s)…');
  const started = Date.now();
  engine.start();

  return await new Promise((resolve) => {
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const done = serial.includes('KX_DONE');
      if (!done && elapsed <= 60) return;
      clearInterval(timer);
      engine.dispose();
      const colors = engine.readNeopixel('GP15');
      console.log(`\n--- ${elapsed.toFixed(1)} s ---`);
      // readNeopixel rend des fractions de 255 : on les remet sur 0..255 pour
      // que les deux lignes se comparent à l'oeil sans calcul mental.
      const sur255 = colors.map((c) => ({
        r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255),
      }));
      console.log('couleurs décodées :', JSON.stringify(sur255));
      console.log('couleurs attendues :', JSON.stringify(expected));
      // readNeopixel renvoie des composantes normalisées 0..1 (fraction de 255)
      const ok =
        done &&
        colors.length === 4 &&
        colors.every(
          (c, i) =>
            Math.round(c.r * 255) === expected[i].r &&
            Math.round(c.g * 255) === expected[i].g &&
            Math.round(c.b * 255) === expected[i].b
        );
      resolve(ok);
    }, 500);
  });
}

let echecs = 0;
for (const carte of CARTES_PICO) {
  if (!(await essai(carte))) echecs++;
}
console.log(echecs ? `\nRESULTAT: ECHEC (${echecs} carte(s))` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
