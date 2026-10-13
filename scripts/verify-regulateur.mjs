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

// Diode en série à l’entrée : 12 V − 0,6 V − 2 V de marge → 5 V tenus ; 7,3 V → 4,7 V.
const diode = (id, vf = 0.6) => ({ id, type: 'diode', x: 0, y: 0, attrs: { vf: String(vf) } });
const viaDiode = (vin, vset) => {
  const d = { parts: [alim('P1', vin), diode('D1'), reg('Reg1', vset)], wires: [
    w(1, 'P1', 'V+', 'D1', 'A'), w(2, 'D1', 'K', 'Reg1', 'IN'), w(3, 'P1', 'GND', 'Reg1', 'GND')] };
  return d;
};
check('diode à l’entrée : 12 V → 5 V tenus', near(volts(viaDiode(12, 5), 'Reg1'), 5), String(volts(viaDiode(12, 5), 'Reg1')));
check('diode à l’entrée : 7,3 V − 0,6 V − 2 V = 4,7 V', near(volts(viaDiode(7.3, 5), 'Reg1'), 4.7), String(volts(viaDiode(7.3, 5), 'Reg1')));
// Diode montée à l’envers : rien n'arrive.
const inverse = viaDiode(12, 5);
inverse.wires[0] = w(1, 'P1', 'V+', 'D1', 'K'); inverse.wires[1] = w(2, 'D1', 'A', 'Reg1', 'IN');
check('diode à l’envers : 0 V', near(volts(inverse, 'Reg1'), 0), String(volts(inverse, 'Reg1')));

// Résistance en série à l’entrée : 10 Ω, charge 10 Ω sur 5 V = 0,5 A → 5 V perdus dans la résistance.
const viaR = (vin, ohmsEntree, charge) => {
  const d = { parts: [alim('P1', vin), resistor('Re', ohmsEntree), reg('Reg1', 5), resistor('R1', charge)], wires: [
    w(1, 'P1', 'V+', 'Re', '1'), w(2, 'Re', '2', 'Reg1', 'IN'), w(3, 'P1', 'GND', 'Reg1', 'GND'),
    w(4, 'Reg1', 'OUT', 'R1', '1'), w(5, 'R1', '2', 'Reg1', 'GND')] };
  return d;
};
check('résistance 4 Ω à l’entrée, 0,5 A : 12 − 2 − 2 = 8 V → 5 V tenus', near(volts(viaR(12, 4, 10), 'Reg1'), 5), String(volts(viaR(12, 4, 10), 'Reg1')));
check('résistance 10 Ω à l’entrée, 0,5 A : 12 − 5 − 2 = 5 V → 5 V juste', near(volts(viaR(12, 10, 10), 'Reg1'), 5), String(volts(viaR(12, 10, 10), 'Reg1')));
check('résistance 14 Ω à l’entrée, 0,5 A : 12 − 7 − 2 = 3 V', near(volts(viaR(12, 14, 10), 'Reg1'), 3, 0.1), String(volts(viaR(12, 14, 10), 'Reg1')));

// Courant reporté sur la source : 5 V sur 10 Ω = 0,5 A sortent du régulateur, 0,5 A sortent de l’alim.
const dCharge = charge(10);
const aSource = model.psuLoadAmps(dCharge, 'P1', 12);
check('courant du régulateur reporté sur sa source : 0,5 A', near(aSource, 0.5, 0.01), String(aSource));
const cas = { ...cascade, parts: [...cascade.parts, resistor('R1', 10)], wires: [...cascade.wires, w(5, 'Reg2', 'OUT', 'R1', '1'), w(6, 'R1', '2', 'Reg2', 'GND')] };
check('cascade : 0,5 A remonte jusqu’à l’alim', near(model.psuLoadAmps(cas, 'P1', 24), 0.5, 0.01), String(model.psuLoadAmps(cas, 'P1', 24)));
// Régulateur en surcharge : l’alim ne débite que le courant limité (2 A).
const dSurcharge = charge(1);
check('surcharge : l’alim débite 2 A (courant max)', near(model.psuLoadAmps(dSurcharge, 'P1', 12), 2, 0.05), String(model.psuLoadAmps(dSurcharge, 'P1', 12)));

// LM35A : alimentation minimale 4 V (tension lue sur Vs, diodes et résistances déduites).
catalog.registerCustomPart({
  type: 'lm35a', label: 'LM35A', kind: 'analog-source', svg, category: 'Sensors',
  pins: [pin('Vs', 20), pin('Vout', 30), pin('GND', 40)],
  pinRoles: { AO: 'Vout' },
  minSupply: { vcc: 'Vs', gnd: 'GND', volts: 4 },
  control: { type: 'slider', label: 'T', unit: '°C', min: -55, max: 150, step: 0.5, expr: 'x * 0.01' },
});
check('LM35A : alimentation minimale déclarée', catalog.partDef('lm35a').custom?.minSupply?.volts === 4);
const lm = { id: 'T1', type: 'lm35a', x: 0, y: 0, attrs: {} };
const alimente = (vin, entre = []) => {
  const d = { parts: [alim('P1', vin), lm, ...entre.map((e) => e.part)], wires: [] };
  return d;
};
const sup = (d) => model.partSupplyVolts(d, 'T1', 'Vs', 'GND', 5);
const direct = (vin) => { const d = alimente(vin); d.wires.push(w(1, 'P1', 'V+', 'T1', 'Vs'), w(2, 'P1', 'GND', 'T1', 'GND')); return d; };
check('LM35A sur 5 V : 5 V', near(sup(direct(5)), 5), String(sup(direct(5))));
check('LM35A sur 3,3 V : 3,3 V (< 4 V)', near(sup(direct(3.3)), 3.3), String(sup(direct(3.3))));
const nonCable = { parts: [alim('P1', 5), lm], wires: [] };
check('LM35A non câblé : null', sup(nonCable) === null, String(sup(nonCable)));
const sansMasse = { parts: [alim('P1', 5), lm], wires: [w(1, 'P1', 'V+', 'T1', 'Vs')] };
check('LM35A sans masse : null', sup(sansMasse) === null, String(sup(sansMasse)));
const dioded = { parts: [alim('P1', 5), diode('D1'), lm], wires: [w(1, 'P1', 'V+', 'D1', 'A'), w(2, 'D1', 'K', 'T1', 'Vs'), w(3, 'P1', 'GND', 'T1', 'GND')] };
check('LM35A derrière une diode : 4,4 V', near(sup(dioded), 4.4), String(sup(dioded)));
const regule = { parts: [alim('P1', 12), reg('Reg1', 5), lm], wires: [w(1, 'P1', 'V+', 'Reg1', 'IN'), w(2, 'P1', 'GND', 'Reg1', 'GND'), w(3, 'Reg1', 'OUT', 'T1', 'Vs'), w(4, 'Reg1', 'GND', 'T1', 'GND')] };
check('LM35A derrière un régulateur 5 V : 5 V', near(sup(regule), 5), String(sup(regule)));

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
