// Vérifie le régulateur linéaire L78SxxCV (kind 'psu' + bloc `regulator`) :
//  - tension réglée tenue quand l'entrée a la marge de 2 V ;
//  - marge insuffisante : sortie = entrée − 2 V ;
//  - entrée en l'air : 0 V ;
//  - cascade de deux régulateurs ;
//  - courant max dépassé : la tension s'effondre (U × Imax / I) ;
//  - la LED en aval lit la tension régulée (ledPowerCircuit) ;
//  - courant de repos reporté sur la source ;
//  - échauffement (P = (Vin − Vout) × I + Vin × Iq), radiateur, alerte, coupure ;
//  - rail négatif d'un LM35A (negativeRailFrom).
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
  regulator: {
    in: 'IN', dropout: 2, voltages: [5, 6, 8, 8.5, 9, 12, 15, 18, 24],
    quiescentMilliamps: 5, thermal: { rthJA: 50, rthJC: 3, tjMax: 125, shutdown: 150 },
  },
});

const def = catalog.partDef('l78sxxcv');
check('catalogue : propriété tension en liste fermée',
  def.props?.find((p) => p.attr === 'voltage')?.options?.join(',') === '5,6,8,8.5,9,12,15,18,24');
check('catalogue : propriété courant max', def.props?.some((p) => p.attr === 'maxcurrent'));
check('catalogue : propriété radiateur', def.props?.some((p) => p.attr === 'heatsink'));
check('catalogue : catégorie Circuits intégrés', catalog.partCategory?.('l78sxxcv') === 'Integrated circuits' || def.custom?.category === 'Integrated circuits');

const alim = (id, volts, extra = {}) => ({ id, type: 'alim', x: 0, y: 0, attrs: { voltage: String(volts), maxcurrent: '10', ...extra } });
const reg = (id, volts, imax = 2, heatsink = 0) => ({ id, type: 'l78sxxcv', x: 0, y: 0, attrs: { voltage: String(volts), maxcurrent: String(imax), heatsink: String(heatsink) } });
const w = (n, a, ap, b, bp) => ({ id: `w${n}`, a: { partId: a, pin: ap }, b: { partId: b, pin: bp } });
const resistor = (id, ohms) => ({ id, type: 'resistor', x: 0, y: 0, attrs: { value: String(ohms) } });
const led = (id) => ({ id, type: 'led', x: 0, y: 0, attrs: { color: 'red' } });
const volts = (d, id) => model.psuOutVolts(d, d.parts.find((p) => p.id === id));

// Alim 12 V → L78S05 : 5 V.
const base = (vin, vset, imax, heatsink = 0.1) => ({
  parts: [alim('P1', vin), reg('Reg1', vset, imax, heatsink)],
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
  parts: [alim('P1', 24), reg('Reg1', 12, 2, 0.1), reg('Reg2', 5, 2, 0.1)],
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
  const d = { parts: [alim('P1', vin), diode('D1'), reg('Reg1', vset, 2, 1)], wires: [
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
  const d = { parts: [alim('P1', vin), resistor('Re', ohmsEntree), reg('Reg1', 5, 2, 1), resistor('R1', charge)], wires: [
    w(1, 'P1', 'V+', 'Re', '1'), w(2, 'Re', '2', 'Reg1', 'IN'), w(3, 'P1', 'GND', 'Reg1', 'GND'),
    w(4, 'Reg1', 'OUT', 'R1', '1'), w(5, 'R1', '2', 'Reg1', 'GND')] };
  return d;
};
check('résistance 4 Ω à l’entrée, 0,5 A : 12 − 2 − 2 = 8 V → 5 V tenus', near(volts(viaR(12, 4, 10), 'Reg1'), 5), String(volts(viaR(12, 4, 10), 'Reg1')));
check('résistance 10 Ω à l’entrée, 0,5 A (+ 5 mA de repos) : 4,95 V', near(volts(viaR(12, 10, 10), 'Reg1'), 4.95), String(volts(viaR(12, 10, 10), 'Reg1')));
check('résistance 14 Ω à l’entrée, 0,5 A : 12 − 7 − 2 = 3 V', near(volts(viaR(12, 14, 10), 'Reg1'), 3, 0.1), String(volts(viaR(12, 14, 10), 'Reg1')));

// Courant reporté sur la source : 5 V sur 10 Ω = 0,5 A sortent du régulateur, 0,5 A sortent de l’alim.
const dCharge = charge(10);
const aSource = model.psuLoadAmps(dCharge, 'P1', 12);
check('courant du régulateur reporté sur sa source : 0,5 A', near(aSource, 0.5, 0.01), String(aSource));
const cas = { ...cascade, parts: [...cascade.parts, resistor('R1', 10)], wires: [...cascade.wires, w(5, 'Reg2', 'OUT', 'R1', '1'), w(6, 'R1', '2', 'Reg2', 'GND')] };
check('cascade : 0,5 A + 2 × 5 mA de repos remontent jusqu’à l’alim', near(model.psuLoadAmps(cas, 'P1', 24), 0.51, 0.003), String(model.psuLoadAmps(cas, 'P1', 24)));
// Régulateur en surcharge : l’alim ne débite que le courant limité (2 A).
const dSurcharge = charge(1);
check('surcharge : l’alim débite 2 A (courant max)', near(model.psuLoadAmps(dSurcharge, 'P1', 12), 2, 0.05), String(model.psuLoadAmps(dSurcharge, 'P1', 12)));

// Courant de repos : 5 mA tirés sur l'entrée même sans charge.
const repos = base(12, 5);
check('repos : sans charge, l’alim débite 5 mA', near(model.psuLoadAmps(repos, 'P1', 12), 0.005, 0.0005), String(model.psuLoadAmps(repos, 'P1', 12)));
check('repos : avec 0,5 A de charge, 0,505 A', near(model.psuLoadAmps(charge(10), 'P1', 12), 0.505, 0.002), String(model.psuLoadAmps(charge(10), 'P1', 12)));
// Chute dans une résistance d'entrée avec le repos : 1 kΩ × 5 mA = 5 V perdus à vide.
const viaRepos = { parts: [alim('P1', 12), resistor('Re', 1000), reg('Reg1', 5, 2, 1)], wires: [
  w(1, 'P1', 'V+', 'Re', '1'), w(2, 'Re', '2', 'Reg1', 'IN'), w(3, 'P1', 'GND', 'Reg1', 'GND')] };
check('repos : 1 kΩ à l’entrée à vide, 12 − 5 − 2 = 5 V', near(volts(viaRepos, 'Reg1'), 5, 0.05), String(volts(viaRepos, 'Reg1')));

// Échauffement : P = (Vin − Vout) × I + Vin × Iq ; Tj = 25 + P × Rth.
const chaud = (vin, heatsink, ohms = 10) => {
  const d = base(vin, 5, 2, heatsink);
  d.parts.push(resistor('R1', ohms));
  d.wires.push(w(5, 'Reg1', 'OUT', 'R1', '1'), w(6, 'R1', '2', 'Reg1', 'GND'));
  return d;
};
const th = (d) => model.regulatorThermal(d, d.parts.find((p) => p.id === 'Reg1'));
const t7 = th(chaud(7, 0));
check('échauffement 7 V → 5 V, 0,5 A : ~1,04 W, Tj ~77 °C, sans alerte', t7 && near(t7.watts, 1.035, 0.05) && near(t7.tj, 76.8, 2) && !t7.hot && !t7.cut, JSON.stringify(t7));
const t9 = th(chaud(9, 0));
check('échauffement 9 V → 5 V, 0,5 A : Tj ~127 °C, trop chaud mais sortie tenue', t9 && t9.hot && !t9.cut && near(volts(chaud(9, 0), 'Reg1'), 5), JSON.stringify(t9));
const t12 = th(chaud(12, 0));
check('échauffement 12 V → 5 V, 0,5 A sans radiateur : coupure thermique', t12 && t12.cut, JSON.stringify(t12));
check('coupure thermique : la sortie tombe à 0 V', near(volts(chaud(12, 0), 'Reg1'), 0), String(volts(chaud(12, 0), 'Reg1')));
const t12r = th(chaud(12, 5));
check('radiateur 5 °C/W : 12 V → 5 V, 0,5 A tient (Tj ~53 °C)', t12r && !t12r.cut && !t12r.hot && near(t12r.tj, 53, 3) && near(volts(chaud(12, 5), 'Reg1'), 5), JSON.stringify(t12r));
check('à vide le repos chauffe à peine', (() => { const r = th(base(12, 5, 2, 0)); return r && near(r.watts, 0.06, 0.01) && !r.hot; })());

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
const regule = { parts: [alim('P1', 12), reg('Reg1', 5, 2, 1), lm], wires: [w(1, 'P1', 'V+', 'Reg1', 'IN'), w(2, 'P1', 'GND', 'Reg1', 'GND'), w(3, 'Reg1', 'OUT', 'T1', 'Vs'), w(4, 'Reg1', 'GND', 'T1', 'GND')] };
check('LM35A derrière un régulateur 5 V : 5 V', near(sup(regule), 5), String(sup(regule)));

// Rail négatif du LM35A : une 2e alim dont le + est sur la masse de la carte
// et le − sur Vout à travers une résistance (R = −Vs / 50 µA).
const lmNeg = (avecRail) => {
  const d = {
    parts: [alim('P1', 5), { id: 'U1', type: 'uno', x: 0, y: 0, attrs: {} }, lm, resistor('Rn', 100000), alim('P2', 5)],
    wires: [
      w(1, 'P1', 'V+', 'T1', 'Vs'), w(2, 'P1', 'GND', 'T1', 'GND'), w(3, 'P1', 'GND', 'U1', 'GND.1'),
      w(4, 'Rn', '1', 'T1', 'Vout'),
    ],
  };
  if (avecRail) d.wires.push(w(5, 'P2', 'V+', 'U1', 'GND.1'), w(6, 'P2', 'GND', 'Rn', '2'));
  return d;
};
const rail = model.negativeRailFrom(lmNeg(true), 'T1', 'Vout');
check('rail négatif LM35A : −5 V à travers 100 kΩ', rail && near(rail.volts, -5) && near(rail.ohms, 100000, 1), JSON.stringify(rail));
check('sans alim négative : pas de rail', model.negativeRailFrom(lmNeg(false), 'T1', 'Vout') === null);
check('alim ordinaire (− à la masse) : jamais prise pour un rail négatif', model.negativeRailFrom(direct(5), 'T1', 'Vout') === null);

// Inscription du boîtier : 78 + tension sur deux chiffres.
check('inscription : 5 → 05, 12 → 12, 8,5 → 85, 24 → 24',
  ['5', '12', '8.5', '24'].map((v) => catalog.regulatorVoltCode(Number(v))).join(',') === '05,12,85,24');

// Deux alims EMPILÉES (montage symétrique, test lm35a-uno de Frank) : Alim1 GND
// → Capt2 GND, Alim1 V+ → Alim2 GND (point milieu), Alim2 V+ → Capt2 Vs.
const pile = () => ({
  parts: [
    alim('A1', 5), alim('A2', 5), { id: 'T2', type: 'lm35a', x: 0, y: 0, attrs: {} },
    { id: 'M1', type: 'multimetre', x: 0, y: 0, attrs: { mode: 'voltage' } },
  ],
  wires: [
    w(1, 'A1', 'GND', 'T2', 'GND'), w(2, 'A1', 'V+', 'A2', 'GND'), w(3, 'A2', 'V+', 'T2', 'Vs'),
    w(4, 'M1', '+', 'T2', 'Vout'), w(5, 'M1', 'GND', 'A1', 'V+'),
  ],
});
check('alims empilées : pas de court-circuit annoncé sur A1', model.psuCourtCircuit(pile(), 'A1') === false);
check('alims empilées : pas de court-circuit annoncé sur A2', model.psuCourtCircuit(pile(), 'A2') === false);
check('alims empilées : A1 ne débite rien (pas de « courant limite »)', near(model.psuLoadAmps(pile(), 'A1', 5), 0, 0.01), String(model.psuLoadAmps(pile(), 'A1', 5)));
check('alims empilées : LM35A alimenté sous 10 V (Vs → GND)', near(model.partSupplyVolts(pile(), 'T2', 'Vs', 'GND', 5), 10), String(model.partSupplyVolts(pile(), 'T2', 'Vs', 'GND', 5)));
const lu = model.meterReadings(pile(), 5, () => 'hiz', undefined, undefined, undefined, undefined, (id) => (id === 'T2' ? 0.25 : null));
check('alims empilées : voltmètre entre Vout et le milieu = −5 + 0,25 = −4,75 V', lu[0] && near(lu[0].value, -4.75, 0.05), JSON.stringify(lu));

// Alim / régulateur sur une entrée ADC : l'ADC lisait 0 (aucun code ne posait la
// tension de la source sur la broche).
const mcu = (type) => ({ id: 'U1', type, x: 0, y: 0 });
const niveau = (d, vcc, pinName) => model.psuAdcLevels(d, vcc).find((l) => l.mcuPin === pinName)?.level;
const adcUno = {
  parts: [mcu('uno'), alim('P1', 9.5), reg('Reg1', 5)],
  wires: [w(1, 'P1', 'V+', 'Reg1', 'IN'), w(2, 'P1', 'GND', 'Reg1', 'GND'), w(3, 'P1', 'GND', 'U1', 'GND.1'), w(4, 'Reg1', 'OUT', 'U1', 'A0')],
};
check('ADC Uno : 78xx 5 V sur A0 = 1,00 de VCC', near(niveau(adcUno, 5, 'A0'), 1), String(niveau(adcUno, 5, 'A0')));
const adcPico = {
  parts: [mcu('pico'), alim('P1', 9.5), reg('Reg1', 5), resistor('R1', 20000), resistor('R2', 10000)],
  wires: [
    w(1, 'P1', 'V+', 'Reg1', 'IN'), w(2, 'P1', 'GND', 'Reg1', 'GND'), w(3, 'P1', 'GND', 'U1', 'GND.7'),
    w(4, 'Reg1', 'OUT', 'R1', '1'), w(5, 'R1', '2', 'R2', '1'), w(6, 'R1', '2', 'U1', 'GP27'), w(7, 'R2', '2', 'U1', 'GND.7'),
  ],
};
check('ADC Pico : pont 20 k / 10 k sur 5 V = 1,67 V, soit 0,505 de 3,3 V', near(niveau(adcPico, 3.3, 'GP27'), 5 / 3 / 3.3, 0.01), String(niveau(adcPico, 3.3, 'GP27')));
const adcSans = { parts: [mcu('uno'), reg('Reg1', 5)], wires: [w(1, 'Reg1', 'OUT', 'U1', 'A0')] };
check('ADC : régulateur sans entrée, rien à poser', niveau(adcSans, 5, 'A0') === undefined || near(niveau(adcSans, 5, 'A0'), 0));

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
