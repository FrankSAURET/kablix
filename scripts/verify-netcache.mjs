// Vérifie le cache de FRAME de la netlist (beginModelFrame/endModelFrame) :
//  - correction : dans la fenêtre, les helpers rendent EXACTEMENT les mêmes
//    résultats que sans cache (netlist, niveaux, ohms série, bindings) ;
//  - étanchéité : une modification du schéma APRÈS fermeture de la fenêtre est
//    bien vue (pas de netlist périmée), et une fenêtre laissée ouverte par une
//    exception est refermée par le `finally` de sim.mts ;
//  - gain : coût d'une « frame » (les helpers appelés par refreshVisuals sur
//    chaque composant) avec et sans cache, sur un schéma chargé.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'kablix-netcache-')), 'model.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/model.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const m = await import(pathToFileURL(out).href);

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

// --- Schéma d'essai : Uno + 3 LED sur résistances + bouton + platine ---------
const W = (id, a, b) => ({ id, a, b });
const pin = (partId, p) => ({ partId, pin: p });
const parts = [
  { id: 'uno', type: 'uno', x: 0, y: 0 },
  { id: 'bb', type: 'breadboard', x: 0, y: 0 },
  { id: 'btn', type: 'button', x: 0, y: 0 },
];
const wires = [];
for (let i = 0; i < 3; i++) {
  parts.push({ id: `led${i}`, type: 'led', x: 0, y: 0, attrs: { color: 'red' } });
  parts.push({ id: `r${i}`, type: 'resistor', x: 0, y: 0, attrs: { value: '220' } });
  wires.push(W(`wa${i}`, pin('uno', String(9 + i)), pin(`r${i}`, '1')));
  wires.push(W(`wb${i}`, pin(`r${i}`, '2'), pin(`led${i}`, 'A')));
  wires.push(W(`wc${i}`, pin(`led${i}`, 'C'), pin('uno', 'GND.1')));
}
const diagram = { parts, wires };

const read = (name) => name === '9'; // seule la broche 9 est haute

// Photographie complète de ce qu'une frame lit du modèle.
const snapshot = (d) => ({
  on: [0, 1, 2].map((i) => m.ledOn(d, `led${i}`, read)),
  mcu: [0, 1, 2].map((i) => m.ledMcuPin(d, `led${i}`)),
  ohms: [0, 1, 2].map((i) => m.ledSeriesOhms(d, `led${i}`)),
  circ: [0, 1, 2].map((i) => JSON.stringify(m.ledPowerCircuit(d, `led${i}`))),
  nets: d.wires.map((w) => m.buildNets(d).netOf(w.a)),
  eqp: JSON.stringify(d.wires.map((w) => m.nameEquipotentials(d).nameOfWire(w.id))),
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sansCache = snapshot(diagram);
m.beginModelFrame(diagram);
const avecCache = snapshot(diagram);
m.endModelFrame();
check('résultats identiques avec et sans cache de frame', same(sansCache, avecCache));

// La netlist mise en cache est bien PARTAGÉE dans la fenêtre (même objet).
m.beginModelFrame(diagram);
const n1 = m.buildNets(diagram);
const n2 = m.buildNets(diagram);
const n3 = m.buildNets(diagram, false); // joinResistors différent : autre netlist
m.endModelFrame();
check('une seule netlist par (schéma, joinResistors) dans la fenêtre', n1 === n2 && n1 !== n3);
check('hors fenêtre, chaque appel reconstruit', m.buildNets(diagram) !== m.buildNets(diagram));

// Étanchéité : un fil coupé APRÈS la fenêtre doit être vu tout de suite.
m.beginModelFrame(diagram);
m.ledOn(diagram, 'led0', read);
m.endModelFrame();
const coupe = { parts, wires: wires.filter((w) => w.id !== 'wa0') };
check('schéma modifié après la fenêtre : netlist recalculée', m.ledSeriesOhms(coupe, 'led0') === null);

// Un autre schéma dans la fenêtre d'un premier n'utilise jamais son cache.
m.beginModelFrame(diagram);
const ohmsAutre = m.ledSeriesOhms(coupe, 'led0');
m.endModelFrame();
check('autre schéma dans la fenêtre : pas de cache croisé', ohmsAutre === null);

// Le graphe résistif dépend du callback `liveOhms` : une entrée par callback.
// Alim 5 V chargée par une résistance de 1 kΩ, dont la valeur LIVE est 100 Ω :
// dans la même fenêtre, ledSeriesOhms (sans liveOhms) et psuLoadAmps (avec) ne
// doivent PAS se partager le même graphe.
const psu = { id: 'alim', type: 'alim', x: 0, y: 0, attrs: { voltage: '5' } };
const charge = { id: 'rp', type: 'resistor', x: 0, y: 0, attrs: { value: '1000' } };
const avecPsu = {
  parts: [...parts, psu, charge],
  wires: [
    ...wires,
    W('wp1', pin('alim', 'V+'), pin('rp', '1')),
    W('wp2', pin('rp', '2'), pin('alim', 'GND')),
  ],
};
m.beginModelFrame(avecPsu);
const ohmsLed = m.ledSeriesOhms(avecPsu, 'led0');
const ampsLive = m.psuLoadAmps(avecPsu, 'alim', 5, (p) => (p.id === 'rp' ? 100 : null));
m.endModelFrame();
check(
  'graphe résistif mis en cache par callback liveOhms',
  ohmsLed === 220 && Math.abs(ampsLive - 0.05) < 1e-9
);

// --- Gain mesuré -------------------------------------------------------------
// Une frame de refreshVisuals ≈ par LED : ledOn + ledMcuPin + ledPowerCircuit.
const frame = (cache) => {
  if (cache) m.beginModelFrame(diagram);
  for (let i = 0; i < 3; i++) {
    m.ledOn(diagram, `led${i}`, read);
    m.ledMcuPin(diagram, `led${i}`);
    m.ledPowerCircuit(diagram, `led${i}`);
  }
  if (cache) m.endModelFrame();
};
const mesure = (cache) => {
  for (let i = 0; i < 50; i++) frame(cache);
  const t0 = performance.now();
  const N = 300;
  for (let i = 0; i < N; i++) frame(cache);
  return (performance.now() - t0) / N;
};
const avant = mesure(false);
const apres = mesure(true);
console.log(`ℹ️ frame (${parts.length} composants, 3 LED) : ${avant.toFixed(3)} ms → ${apres.toFixed(3)} ms (${(avant / apres).toFixed(1)}×)`);
check('le cache accélère la frame d’au moins 2×', avant / apres >= 2);

// --- Garde-fou de câblage côté sim.mts ---------------------------------------
const sim = readFileSync(join(root, 'src/webview/sim.mts'), 'utf8');
check(
  'refreshVisuals ouvre et referme la fenêtre (finally)',
  /function refreshVisuals\(\)[^]*?beginModelFrame\(editor\.diagram\)[^]*?refreshVisualsInner\(\)[^]*?finally[^]*?endModelFrame\(\)/.test(sim)
);
check(
  'rebind ouvre et referme la fenêtre (finally)',
  /function rebind\(\)[^]*?beginModelFrame\(editor\.diagram\)[^]*?bindInputs\(\)[^]*?finally[^]*?endModelFrame\(\)/.test(sim)
);

console.log(failures === 0 ? '\nTout est bon.' : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
