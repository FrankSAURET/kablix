// Vérifie la simulation des condensateurs :
//   1. le modèle : rappel interne à 65 kΩ (doc RP2040 : 50-80 kΩ) → RC = 65 ms
//      pour 1 µF, et pont diviseur classique avec une résistance extérieure ;
//   2. l'échantillonnage à l'instant de la CONVERSION (setAnalogSampler) : sans
//      lui, un sketch qui lit l'ADC plus vite que l'affichage relit la même
//      valeur plusieurs fois de suite — l'exponentielle monte en escalier.
// Le moteur AVR est exécuté avec le firmware de démo du Mega, qui appelle
// analogRead(A8) en boucle et publie « a8=… » sur Serial1.
import esbuild from 'esbuild';
import { avrInstruction } from 'avr8js';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MEGA_PWM345 } from '../src/webview/programs/mega-pwm345.mjs';
import { PICO_BLINK } from '../src/webview/programs/pico-blink.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const tmp = mkdtempSync(join(tmpdir(), 'kx-condo-'));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function bundle(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const model = await bundle('src/webview/diagram/model.mts', 'model.mjs');
const { AvrEngine } = await bundle('src/webview/engines/avr.mts', 'avr.mjs');
const { PicoEngine } = await bundle('src/webview/engines/pico.mts', 'pico.mjs');

// --- 1. Modèle : constante de temps -----------------------------------------
console.log('Modèle RC :');
{
  const wire = (id, a, ap, b, bp) => ({ id, a: { partId: a, pin: ap }, b: { partId: b, pin: bp }, points: [] });
  // Condensateur 1 µF entre GP15 et la masse, mesuré sur GP26 : la seule source
  // est le rappel interne de GP15 → RC = 65 kΩ × 1 µF.
  const pull = {
    parts: [
      { id: 'mcu1', type: 'pico', x: 0, y: 0 },
      { id: 'c1', type: 'condo-p-2', x: 300, y: 0, attrs: { ctype: 'chem', value: '1e-6', vmax: '16' } },
    ],
    wires: [
      wire('w1', 'c1', '1', 'mcu1', 'GP15'),
      wire('w2', 'c1', '2', 'mcu1', 'GND.5'),
      wire('w3', 'c1', '1', 'mcu1', 'GP26'),
    ],
  };
  const up = model.capacitorNodes(pull, 3.3, (p) => (p === 'GP15' ? 'pullup' : 'hiz'))[0];
  check(`charge par le rappel interne : RC = 65 ms (${(up.tau * 1000).toFixed(1)} ms)`,
    Math.abs(up.tau - 0.065) < 0.001 && Math.abs(up.target - 3.3) < 0.01);
  const down = model.capacitorNodes(pull, 3.3, (p) => (p === 'GP15' ? 'pulldown' : 'hiz'))[0];
  check(`décharge par le même rappel : 0 V, RC = 65 ms (${(down.tau * 1000).toFixed(1)} ms)`,
    Math.abs(down.tau - 0.065) < 0.001 && Math.abs(down.target) < 0.01);
  check('la broche de mesure observe le nœud', up.mcuPins.includes('GP26'), JSON.stringify(up.mcuPins));

  // Résistance extérieure : 10 kΩ + 10 µF = 100 ms, cas de l'exemple Arduino.
  const rc = {
    parts: [
      { id: 'mcu1', type: 'uno', x: 0, y: 0 },
      { id: 'r1', type: 'resistor', x: 200, y: 0, attrs: { value: '10000' } },
      { id: 'c1', type: 'condo-np', x: 300, y: 0, attrs: { ctype: 'np', value: '1e-5', vmax: '400' } },
    ],
    wires: [
      wire('w1', 'r1', '1', 'mcu1', '8'),
      wire('w2', 'r1', '2', 'c1', '1'),
      wire('w3', 'c1', '1', 'mcu1', 'A0'),
      wire('w4', 'c1', '2', 'mcu1', 'GND.1'),
    ],
  };
  const node = model.capacitorNodes(rc, 5, (p) => (p === '8' ? 'high' : 'hiz'))[0];
  check(`10 kΩ + 10 µF : RC = 100 ms (${(node.tau * 1000).toFixed(1)} ms)`,
    Math.abs(node.tau - 0.1) / 0.1 < 0.05 && Math.abs(node.target - 5) < 0.1);
}

// --- 1 bis. Antirebond RC : le bouton doit décharger le condensateur ---------
// Montage du TP ComLedRGB (Frank) : bouton entre D7 et la masse, 100 nF en
// parallèle. La broche restait à 5 V en permanence — l'appui n'était pas vu.
console.log('Bouton + condensateur d’antirebond :');
{
  const wire = (id, a, ap, b, bp) => ({ id, a: { partId: a, pin: ap }, b: { partId: b, pin: bp }, points: [] });
  const bp = {
    parts: [
      { id: 'mcu1', type: 'uno', x: 0, y: 0 },
      { id: 'b1', type: 'button-6mm', x: 200, y: 0, attrs: { color: 'red' } },
      { id: 'c1', type: 'condo-np', x: 300, y: 0, attrs: { ctype: 'np', value: '1e-7', vmax: '400' } },
    ],
    wires: [
      wire('w1', 'b1', '1.l', 'mcu1', '7'),
      wire('w2', 'b1', '2.l', 'mcu1', 'GND.1'),
      wire('w3', 'c1', '1', 'mcu1', '7'),
      wire('w4', 'c1', '2', 'mcu1', 'GND.1'),
    ],
  };
  const drive = (p) => (p === '7' ? 'pullup' : 'hiz');
  model.setActiveBridges([]);
  const relache = model.capacitorNodes(bp, 5, drive)[0];
  check(`relâché : la pull-up charge à 5 V, RC = 6,5 ms (${relache.target.toFixed(2)} V, ${(relache.tau * 1000).toFixed(1)} ms)`,
    Math.abs(relache.target - 5) < 0.01 && Math.abs(relache.tau - 0.0065) < 0.0005);
  check('la broche 7 observe le nœud', relache.mcuPins.includes('7'), JSON.stringify(relache.mcuPins));

  const contacts = model.manualContacts(bp, { pressed: (id) => id === 'b1' });
  check(`appui : le contact du bouton est fermé (${contacts.length})`,
    contacts.length === 1 && contacts[0].a === '1.l' && contacts[0].b === '2.l');
  model.setActiveBridges(contacts);
  const appuye = model.capacitorNodes(bp, 5, drive)[0];
  check(`appuyé : le condensateur se vide dans le bouton (${appuye.target.toFixed(3)} V, ${(appuye.tau * 1e6).toFixed(1)} µs)`,
    appuye.target < 0.1 && appuye.tau < 0.001);
  check('relâché : aucun contact fermé', model.manualContacts(bp, { pressed: () => false }).length === 0);
  model.setActiveBridges([]);
}

// --- 2. Échantillonnage à l'instant de la conversion (AVR) -------------------
console.log('Charge lue par l’ADC (Mega, analogRead en boucle) :');
{
  const VREF = 5;
  const TAU = 0.1; // 10 kΩ × 10 µF, comme le test condo-uno
  const volts = (ms) => VREF * (1 - Math.exp(-ms / 1000 / TAU));

  const engine = new AvrEngine(MEGA_PWM345.slice(), null, 'avr2560');
  let serial = '';
  engine.onSerial = (chunk) => { serial += chunk; };
  const samples = []; // instants (ms simulées) où l'ADC a demandé la tension
  engine.setAnalogSampler('A8', () => {
    const t = engine.simulatedMs();
    samples.push(t);
    return volts(t) / VREF;
  });
  // Exécution directe (la boucle du moteur est cadencée sur le temps réel) :
  // ~1,2 s simulée à 16 MHz, soit une charge complète (12 RC).
  const cpu = engine.cpu;
  const until = 16_000_000 * 1.2;
  while (cpu.cycles < until) {
    avrInstruction(cpu);
    cpu.tick();
  }
  const lus = [...serial.matchAll(/a8=(\d+)/g)].map((m) => Number(m[1]));
  check(`l'ADC a demandé la tension ${samples.length} fois`, samples.length >= 10);
  check(`le sketch a lu ${lus.length} valeurs`, lus.length >= 10);
  // Continuité : aucune valeur répétée (l'escalier venait de là), et progression
  // monotone jusqu'au palier de 1023.
  const plateaux = lus.filter((v, i) => i > 0 && v === lus[i - 1] && v < 1000).length;
  check(`aucun palier avant la charge pleine (${plateaux})`, plateaux === 0, lus.slice(0, 12).join(' '));
  check('montée strictement croissante', lus.every((v, i) => i === 0 || v >= lus[i - 1]), lus.slice(0, 12).join(' '));
  // Chaque valeur lue doit tomber sur l'exponentielle à l'instant de SA
  // conversion : c'est la définition d'une courbe continue.
  let ecartMax = 0;
  for (let i = 0; i < lus.length && i < samples.length; i++) {
    const attendu = Math.round((volts(samples[i]) / VREF) * 1023);
    ecartMax = Math.max(ecartMax, Math.abs(lus[i] - attendu));
  }
  check(`valeurs sur l'exponentielle (écart max ${ecartMax} LSB)`, ecartMax <= 2);
}

// --- 3. Le même point d'entrée côté RP2040 ----------------------------------
console.log('Échantillonneur RP2040 :');
{
  const engine = new PicoEngine({ kind: 'ram', image: PICO_BLINK.slice() });
  engine.setAnalogSampler('GP26', () => 0.25);
  engine.mcu.adc.onADCRead(0); // conversion demandée par le programme simulé
  check(`canal 0 relu à la conversion (${engine.mcu.adc.channelValues[0]}/4095)`,
    Math.abs(engine.mcu.adc.channelValues[0] - 1024) <= 1);
  engine.setAnalogSampler('GP26', null);
  engine.mcu.adc.channelValues[0] = 0;
  engine.mcu.adc.onADCRead(0);
  check('échantillonneur retiré : la valeur posée par setAnalog est conservée',
    engine.mcu.adc.channelValues[0] === 0);
  engine.dispose();
}

// --- 4. Géométrie dans l'éditeur : changer `ctype` change de DESSIN ----------
// Le film fait 30×50 (pattes à y = 40), les deux polarisés 30×70 (pattes à
// y = 60) : sans re-rendu du composant, les pastilles restaient à la hauteur de
// l'ancien habillage — au MILIEU du corps du tantale (bug signalé par Frank).
// Dans les trois habillages, le bout des pattes est à 10 px du bas du dessin.
console.log('Géométrie dans l’éditeur (Chrome headless) :');
{
  const CACHE = join(ROOT, 'node_modules', '.cache-condo-geom');
  const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/capacitor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
async function run() {
  const editor = new Editor(
    document.getElementById('canvas'), document.getElementById('palette'),
    document.getElementById('wires'), document.getElementById('inspector'));
  // Dessin rendu et pastilles, exprimés dans le repère du SVG du composant.
  const geo = () => {
    const cont = [...document.querySelectorAll('.part')].pop();
    const el = cont.querySelector('.part__body').firstElementChild;
    const sr = el.shadowRoot.querySelector('svg').getBoundingClientRect();
    const pins = [...cont.querySelectorAll('.pin')].map((d) => {
      const r = d.getBoundingClientRect();
      return { x: +(r.left + r.width / 2 - sr.left).toFixed(1), y: +(r.top + r.height / 2 - sr.top).toFixed(1) };
    });
    return { w: Math.round(sr.width), h: Math.round(sr.height), pins };
  };
  const fmt = (g) => g.w + 'x' + g.h + ' pastilles ' + g.pins.map((p) => p.x + ',' + p.y).join(' ');
  const bout = (g) => g.pins.length === 2 && g.pins.every((p) => Math.abs(g.h - p.y - 10) <= 1);

  const part = editor.addPart('condo-np', 200, 200);
  await wait(120);
  const np = geo();
  ok('film : dessin 30×50, pastilles au bout des pattes', np.w === 30 && np.h === 50 && bout(np), fmt(np));

  editor.updatePartAttr(part.id, 'ctype', 'p');
  await wait(120);
  const tantale = geo();
  ok('tantale : dessin 30×70 et pastilles suivies jusqu’au bout des pattes',
    tantale.w === 30 && tantale.h === 70 && bout(tantale), fmt(tantale));

  editor.updatePartAttr(part.id, 'ctype', 'chem');
  await wait(120);
  const chimique = geo();
  ok('chimique : dessin 30×70, pastilles au bout des pattes',
    chimique.w === 30 && chimique.h === 70 && bout(chimique), fmt(chimique));

  editor.updatePartAttr(part.id, 'ctype', 'np');
  await wait(120);
  const retour = geo();
  ok('retour au film : dessin 30×50, pastilles au bout des pattes',
    retour.w === 30 && retour.h === 50 && bout(retour), fmt(retour));

  // La TENSION MAX suit le type (v2026.7.251) : les trois condensateurs sortent
  // d'une seule entrée de palette, un plastique passé en chimique gardait donc
  // ses 400 V — une tension que le composant réel ne tient pas, et que la
  // nomenclature recopiait.
  const vmax = () => editor.rendered.get(part.id).part.attrs.vmax;
  ok('tension max : 400 V sur le plastique', vmax() === '400', vmax());
  editor.updatePartAttr(part.id, 'ctype', 'p');
  await wait(60);
  ok('tension max : le tantale retombe à 16 V', vmax() === '16', vmax());
  editor.updatePartAttr(part.id, 'ctype', 'np');
  await wait(60);
  ok('tension max : le retour au plastique reprend 400 V', vmax() === '400', vmax());
  // Une tension SAISIE est un choix : elle survit au changement de type.
  editor.updatePartAttr(part.id, 'vmax', '63');
  editor.updatePartAttr(part.id, 'ctype', 'chem');
  await wait(60);
  ok('tension max : une valeur saisie à la main est conservée', vmax() === '63', vmax());

  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify(checks);
  document.body.appendChild(out);
}
run().catch((e) => {
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
  document.body.appendChild(out);
});
`;
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, 'e.mjs'), entry);
  const b = await esbuild.build({
    entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
    loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
  });
  const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
  writeFileSync(join(CACHE, 'p.html'),
    `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
    `<div class="workshop"><aside id="palette" class="palette"></aside>` +
    `<div id="canvas" class="canvas" style="width:800px;height:600px"><svg id="wires" class="wires"></svg></div>` +
    `<aside id="inspector" class="inspector"></aside></div>` +
    `<script>${b.outputFiles[0].text}</script></body>`);
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
  if (!chrome) {
    console.log('  – Chrome introuvable, géométrie non vérifiée');
  } else {
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom',
      `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
    if (!m) check('mesures relevées', false, 'aucune mesure dans le DOM');
    else for (const r of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))) {
      check(r.name, r.ok, r.detail);
    }
  }
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
