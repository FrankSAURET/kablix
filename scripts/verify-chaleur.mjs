// Banc de la dégradation thermique (feuille de route n°5) : une résistance
// rougit PROGRESSIVEMENT avant de griller. Deux parties :
//   A. `resistorHeat` (modèle pur) : 0 sous la moitié de la puissance admissible,
//      1 à la limite, linéaire entre les deux, jamais hors de [0, 1] ;
//   B. câblage : l'élément porte `heat`, le rendu colore, la page l'alimente et
//      refroidit à l'arrêt.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-chaleur');
mkdirSync(CACHE, { recursive: true });

let ok = 0;
const fails = [];
const check = (cond, label) => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}`);
  }
};
const proche = (a, b) => Math.abs(a - b) < 1e-9;

const out = join(CACHE, 'model.mjs');
await esbuild({
  entryPoints: [join(ROOT, 'src/webview/diagram/model.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const m = await import(pathToFileURL(out).href + `?t=${Date.now()}`);

// ------------------------------------------------------------- A. le modèle
const h = m.resistorHeat;
check(typeof h === 'function', 'resistorHeat exporté');
if (typeof h === 'function') {
  check(h(0, 0.25) === 0, 'à froid : 0');
  check(h(0.1, 0.25) === 0, '40 % de la limite : encore 0');
  check(h(0.125, 0.25) === 0, 'pile 50 % : 0 (le seuil)');
  check(proche(h(0.1875, 0.25), 0.5), '75 % : mi-chemin (0,5)');
  check(h(0.25, 0.25) === 1, 'à la limite : 1');
  check(h(5, 0.25) === 1, 'au-delà : plafonné à 1');
  check(h(5, 10) === 0.0 || h(5, 10) === 0, 'boîtier 10 W à 5 W : seuil, 0');
  check(proche(h(0.2, 0.25), 0.6), '0,2 W sur ¼ W : 0,6');
  check(h(0.2, 10) === 0, 'la même 0,2 W sur la 10 W : froide (seuil par boîtier)');
  check(h(1, 0) === 0 && h(NaN, 1) === 0 && h(-1, 1) === 0, 'valeurs absurdes : 0');
}

// ------------------------------------------------------------- B. câblage
const el = readFileSync(join(ROOT, 'src/webview/composants/resistor-element.mts'), 'utf8');
const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
const mod = readFileSync(join(ROOT, 'src/webview/diagram/model.mts'), 'utf8');
check(/heat: \{ type: Number \}/.test(el) && /this\.heat = 0;/.test(el), "la résistance déclare `heat` (0 par défaut)");
check(/sepia\(/.test(el) && /drop-shadow\(/.test(el), 'le rendu colore le corps et ajoute un halo');
check(/this\.burned \? 0 :/.test(el), 'grillée : plus de teinte (l\'explosion prend le relais)');
check(/heat: resistorHeat\(w, rating\)/.test(mod), 'resistorPowers renvoie `heat`');
check(/el\.heat = p\.heat;/.test(sim), 'la page alimente `heat` à chaque frame');
check(/function refroidirResistances\(/.test(sim) && /function stopRun\(\): void \{\s+refroidirResistances\(\);/.test(sim), 'les résistances refroidissent à l\'arrêt');

console.log(`verify:chaleur — ${ok} contrôles OK, ${fails.length} échec(s)`);
process.exit(fails.length ? 1 : 0);
