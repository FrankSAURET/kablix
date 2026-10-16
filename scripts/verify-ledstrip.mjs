// Banc du ruban de LED en spirale (kablix-led-strip) en Chrome headless.
// Attendu : nombre de LED = propriété (1 mini, aucun maxi), protocole → 3 ou 4 broches,
// broches sur la grille de 10 px et dans la feuille, spirale sans chevauchement, entrée à
// l'extérieur, allumage/extinction comme l'anneau NeoPixel.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-ledstrip');
mkdirSync(CACHE, { recursive: true });
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');

const entry = `
import '${SRC}/composants/led-strip-element.mjs';
import { stripGeometry } from '${SRC}/composants/led-strip-element.mjs';
async function make(attrs) {
  const el = document.createElement('kablix-led-strip');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}
async function run() {
  const res = {};
  const def = await make({});
  res.defCount = def.renderRoot.querySelectorAll('rect.pixel').length;
  res.defPins = def.pinInfo.map((p) => p.name);
  const spi = await make({ leds: '30', protocol: 'apa102' });
  res.spiCount = spi.renderRoot.querySelectorAll('rect.pixel').length;
  res.spiPins = spi.pinInfo.map((p) => p.name);
  res.w11Pins = (await make({ protocol: 'ws2811' })).pinInfo.map((p) => p.name);
  const one = await make({ leds: '1' });
  res.oneCount = one.renderRoot.querySelectorAll('rect.pixel').length;
  const bad = await make({ leds: '0', protocol: 'zzz' });
  res.badCount = bad.renderRoot.querySelectorAll('rect.pixel').length;
  res.badPins = bad.pinInfo.length;
  const big = await make({ leds: '300', protocol: 'ws2801' });
  res.bigCount = big.renderRoot.querySelectorAll('rect.pixel').length;
  // Changement de propriété : le dessin suit.
  def.leds = 25; def.protocol = 'ws2801';
  await def.updateComplete;
  res.changed = [def.renderRoot.querySelectorAll('rect.pixel').length, def.pinInfo.length];
  // Géométrie
  res.geo = [];
  for (const n of [1, 2, 5, 10, 60, 144, 300]) {
    for (const proto of ['ws2811', 'ws2812', 'apa102', 'ws2801']) {
      const g = stripGeometry(n, proto);
      let minGap = Infinity;
      for (let i = 0; i < g.leds.length; i++) for (let j = i + 2; j < g.leds.length; j++) {
        minGap = Math.min(minGap, Math.hypot(g.leds[i].x - g.leds[j].x, g.leds[i].y - g.leds[j].y));
      }
      const inside = g.leds.every((l) => l.x >= 6 && l.y >= 6 && l.x <= g.width - 6 && l.y <= g.height - 6);
      const dists = g.leds.map((l) => Math.hypot(l.x - g.cx, l.y - g.cy));
      res.geo.push({
        n, proto, w: g.width, h: g.height, minGap, inside,
        pinsGrid: g.pins.every((p) => p.x % 10 === 0 && p.y % 10 === 0),
        pinsIn: g.pins.every((p) => p.x >= 0 && p.x <= g.width && p.y <= g.height),
        pinCount: g.pins.length,
        entryOutermost: dists[0] >= Math.max(...dists) - 0.01,
        endInnermost: dists[dists.length - 1] <= Math.min(...dists) + 0.01,
        step: g.leds.length > 1 ? Math.hypot(g.leds[0].x - g.leds[1].x, g.leds[0].y - g.leds[1].y) : 0,
        aboveSpiral: g.pins.every((p) => p.y < g.cy - g.outer),
        pins: g.pins.map((p) => [p.x, p.y]),
        centre: (g.pins[0].x + g.pins[g.pins.length - 1].x) / 2 - g.cx,
        pinY: g.pins[0].y,
      });
    }
  }
  // Allumage
  const px = (i) => def.renderRoot.querySelectorAll('rect.pixel')[i];
  const st = (i) => { const s = getComputedStyle(px(i)); return { fill: s.fill, filter: s.filter }; };
  def.setPixel(3, { r: 1, g: 0, b: 0 });
  res.lit = st(3);
  def.setPixel(3, { r: 0, g: 0, b: 0 });
  res.off = st(3);
  def.setPixel(3, { r: 0, g: 1, b: 0 });
  def.reset();
  res.reset = st(3);
  def.setPixel(9999, { r: 1, g: 1, b: 1 }); // hors plage : sans effet ni erreur
  const pre = document.createElement('pre'); pre.id = 'm'; pre.textContent = JSON.stringify(res); document.body.appendChild(pre);
}
run().catch((e) => { const pre = document.createElement('pre'); pre.id = 'e'; pre.textContent = String((e && e.stack) || e); document.body.appendChild(pre); });
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: join(ROOT, 'scripts'), logLevel: 'silent',
});
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body><script>${b.outputFiles[0].text}</script>`);

const chrome = [
  process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✅' : '❌'} ${label}`); if (!ok) failures++; };

if (!chrome) {
  console.log('(Chrome introuvable : banc ruban sauté)');
} else {
  const url = 'file:///' + join(CACHE, 'p.html').replace(/\\/g, '/');
  const dom = execFileSync(chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="m"[^>]*>([^<]+)<\/pre>/);
  const e = dom.match(/<pre id="e"[^>]*>([^<]+)<\/pre>/);
  if (e) console.log(e[1]);
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
  check('rendu sans erreur', !!r);
  if (r) {
    check('10 LED par défaut', r.defCount === 10);
    check('un fil : 3 broches GND, 5V, DIN', r.defPins.join() === 'GND,5V,DIN');
    check('WS2811 : 3 broches GND, 5V, DIN', r.w11Pins.join() === 'GND,5V,DIN');
    check('SPI : 30 LED et 4 broches GND, 5V, DI, CI', r.spiCount === 30 && r.spiPins.join() === 'GND,5V,DI,CI');
    check('minimum 1 LED', r.oneCount === 1);
    check('valeur 0 / protocole inconnu : 10 LED, un fil', r.badCount === 10 && r.badPins === 3);
    check('300 LED (aucun maximum)', r.bigCount === 300);
    check('changer leds/protocol redessine (25 LED, 4 broches)', r.changed[0] === 25 && r.changed[1] === 4);
    for (const g of r.geo) {
      const tag = `${g.n} LED ${g.proto}`;
      check(`${tag} : broches sur la grille de 10 px et dans la feuille`, g.pinsGrid && g.pinsIn);
      const unFil = g.proto === 'ws2811' || g.proto === 'ws2812';
      check(`${tag} : ${unFil ? 3 : 4} broches`, g.pinCount === (unFil ? 3 : 4));
      check(`${tag} : LED dans la feuille`, g.inside);
      check(`${tag} : entrée à l'extérieur, bout au centre`, g.entryOutermost && g.endInnermost);
      check(`${tag} : connectique au-dessus de la spirale`, g.aboveSpiral);
      // Connectique centrée sur l'axe de la spirale (à 5 px près) et toujours à la même hauteur.
      // (Son immobilité sur le schéma vient du recalage `stripShift` de l'éditeur.)
      const ref = r.geo.find((o) => o.proto === g.proto && o.n === 1);
      check(`${tag} : connectique centrée sur la spirale, même hauteur`, Math.abs(g.centre) <= 5 && g.pinY === ref.pinY);
      if (g.n >= 10) check(`${tag} : LED non voisines à ≥ 12 px (spirale sans chevauchement)`, g.minGap >= 12);
      if (g.n > 1) check(`${tag} : pas du ruban ≈ 12 px`, Math.abs(g.step - 12) < 0.6);
    }
    check('LED allumée : rouge + halo', r.lit.fill === 'rgb(255, 0, 0)' && /drop-shadow/.test(r.lit.filter));
    check('LED éteinte : blanche sans halo', r.off.fill === 'rgb(255, 255, 255)' && !/drop-shadow/.test(r.off.filter));
    check('reset() : blanche sans halo', r.reset.fill === 'rgb(255, 255, 255)' && !/drop-shadow/.test(r.reset.filter));
  }
}
console.log(failures ? `Ruban LED : ${failures} échec(s).` : 'Ruban LED : tous les contrôles passent.');
process.exit(failures ? 1 : 0);
