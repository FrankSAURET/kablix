// Vérifie le régulateur linéaire L78SxxCV (kind 'psu' + bloc `regulator`) :
//  - tension réglée tenue quand l'entrée a la marge de 2 V ;
//  - marge insuffisante : sortie = entrée − 2 V ;
//  - entrée en l'air : 0 V ;
//  - cascade de deux régulateurs ;
//  - courant max dépassé : la tension s'effondre (U × Imax / I) ;
//  - la LED en aval lit la tension régulée (ledPowerCircuit).
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-regulateur-'));
await esbuild.build({
  stdin: {
    contents: "export * as model from './src/webview/diagram/model.mts';\nexport * as catalog from './src/webview/diagram/catalog.mts';\n",
    resolveDir: root, loader: 'ts',
  },
  outfile: join(tmp, 'b.mjs'), bundle: true, platform: 'node', format: 'esm',
  loader: { '.svg': 'text', '.webp': 'dataurl' }, logLevel: 'silent',
});
const { model, catalog } = await import(pathToFileURL(join(tmp, 'b.mjs')).href);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 0.02) => Number.isFinite(a) && Math.abs(a - b) < eps;

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90" viewBox="0 0 60 90"/>';
const pin = (name, x) => ({ name, x, y: 80 });
catalog.registerCustomPart({
  type: 'l78sxxcv', label: 'L78SxxCV', kind: 'psu', svg, category: 'Integrated circuits',
  pins: [pin('IN', 20), pin('GND', 30), pin('OUT', 40)],
  pinRoles: { 'V+': 'OUT', GND: 'GND' },
  attrs: { voltage: '5', maxcurrent: '2' },
  regulator: { in: 'IN', dropout: 2, voltages: [5, 6, 8, 8.5, 9, 12, 15, 18, 24] },
});

const def = catalog.partDef('l78sxxcv');
check('catalogue : propriété tension en liste fermée',
  def.props?.find((p) => p.attr === 'voltage')?.options?.join(',') === '5,6,8,8.5,9,12,15,18,24');
check('catalogue : propriété courant max', def.props?.some((p) => p.attr === 'maxcurrent'));
check('catalogue : catégorie Circuits intégrés', catalog.partCategory?.('l78sxxcv') === 'Integrated circuits' || def.custom?.category === 'Integrated circuits');

const alim = (id, volts, extra = {}) => ({ id, type: 'alim', x: 0, y: 0, attrs: { voltage: String(volts), maxcurrent: '10', ...extra } });
const reg = (id, volts, imax = 2) => ({ id, type: 'l78sxxcv', x: 0, y: 0, attrs: { voltage: String(volts), maxcurrent: String(imax) } });
const w = (n, a, ap, b, bp) => ({ id: `w${n}`, a: { partId: a, pin: ap }, b: { partId: b, pin: bp } });
const resistor = (id, ohms) => ({ id, type: 'resistor', x: 0, y: 0, attrs: { value: String(ohms) } });
const led = (id) => ({ id, type: 'led', x: 0, y: 0, attrs: { color: 'red' } });
const volts = (d, id) => model.psuOutVolts(d, d.parts.find((p) => p.id === id));

// Alim 12 V → L78S05 : 5 V.
const base = (vin, vset, imax) => ({
  parts: [alim('P1', vin), reg('Reg1', vset, imax)],
  wires: [w(1, 'P1', 'V+', 'Reg1', 'IN'), w(2, 'P1', 'GND', 'Reg1', 'GND')],
});
check('12 V → 5 V : sortie 5 V', near(volts(base(12, 5), 'Reg1'), 5), String(volts(base(12, 5), 'Reg1')));
check('7 V → 5 V : juste la marge, 5 V', near(volts(base(7, 5), 'Reg1'), 5));
check('6 V → 5 V : marge insuffisante, 4 V', near(volts(base(6, 5), 'Reg1'), 4), String(volts(base(6, 5), 'Reg1')));
check('1,5 V → 5 V : sous la marge, 0 V', near(volts(base(1.5, 5), 'Reg1'), 0));
check('9,5 V → 12 V : 7,5 V', near(volts(base(9.5, 12), 'Reg1'), 7.5));
check('30 V → 24 V : 24 V', near(volts(base(30, 24), 'Reg1'), 24));

const air = { parts: [reg('Reg1', 5)], wires: [] };
check('entrée en l\'air : 0 V', near(volts(air, 'Reg1'), 0));

// Cascade : 24 V → L78S12 → L78S05.
const cascade = {
  parts: [alim('P1', 24), reg('Reg1', 12), reg('Reg2', 5)],
  wires: [
    w(1, 'P1', 'V+', 'Reg1', 'IN'), w(2, 'P1', 'GND', 'Reg1', 'GND'),
    w(3, 'Reg1', 'OUT', 'Reg2', 'IN'), w(4, 'Reg1', 'GND', 'Reg2', 'GND'),
  ],
};
check('cascade 24 → 12 → 5 : 12 V puis 5 V', near(volts(cascade, 'Reg1'), 12) && near(volts(cascade, 'Reg2'), 5),
  `${volts(cascade, 'Reg1')} / ${volts(cascade, 'Reg2')}`);

// Charge : 5 V sur 1 Ω = 5 A, au-dessus de 2 A → effondrement à 5 × 2 / 5 = 2 V.
const charge = (ohms, imax = 2) => {
  const d = base(12, 5, imax);
  d.parts.push(resistor('R1', ohms));
  d.wires.push(w(5, 'Reg1', 'OUT', 'R1', '1'), w(6, 'R1', '2', 'Reg1', 'GND'));
  return d;
};
check('charge 10 Ω (0,5 A) : 5 V tenus', near(volts(charge(10), 'Reg1'), 5), String(volts(charge(10), 'Reg1')));
check('charge 2,5 Ω (2 A pile) : 5 V tenus', near(volts(charge(2.5), 'Reg1'), 5), String(volts(charge(2.5), 'Reg1')));
check('charge 1 Ω (5 A) : tension effondrée à 2 V', near(volts(charge(1), 'Reg1'), 2), String(volts(charge(1), 'Reg1')));
check('courant max 6 A : 1 Ω tient 5 V', near(volts(charge(1, 6), 'Reg1'), 5), String(volts(charge(1, 6), 'Reg1')));

// LED en aval : ledPowerCircuit lit la tension régulée.
const avecLed = base(12, 5);
avecLed.parts.push(resistor('R1', 220), led('L1'));
avecLed.wires.push(w(5, 'Reg1', 'OUT', 'R1', '1'), w(6, 'R1', '2', 'L1', 'A'), w(7, 'L1', 'C', 'Reg1', 'GND'));
const circ = model.ledPowerCircuit(avecLed, 'L1');
check('LED derrière le régulateur : alimentée sous 5 V', near(circ.supplyVolts, 5), JSON.stringify(circ));

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
