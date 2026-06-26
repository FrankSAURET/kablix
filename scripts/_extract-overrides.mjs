// TEMP — lit les positions retouchées des pastilles `id="pin-*"` dans
// « svg retouche/*.edit*.svg » et calcule la surcharge éditeur correspondante :
//   surcharge = abs(pastille, repère viewBox) − origine_grille_inkscape − 20
// (20 = marge build-retouche ; l'origine de grille inkscape compense le recadrage).
// Résout les transforms imbriqués via getCTM (Chrome headless). À supprimer.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'svg retouche');
const SCRATCH = join(ROOT, 'node_modules', '.cache-retouche');
mkdirSync(SCRATCH, { recursive: true });

const files = readdirSync(DIR).filter((f) => /\.edit.*\.svg$/i.test(f));

// Origine de grille inkscape (document units) — sinon (0,0).
function gridOrigin(svgText) {
  const ox = /originx="(-?[0-9.]+)"/.exec(svgText);
  const oy = /originy="(-?[0-9.]+)"/.exec(svgText);
  return { x: ox ? parseFloat(ox[1]) : 0, y: oy ? parseFloat(oy[1]) : 0 };
}

// Page HTML : chaque SVG dans un conteneur ; JS lit getCTM de chaque pin-*.
let bodies = '';
for (const f of files) {
  let svg = readFileSync(join(DIR, f), 'utf8').replace(/<\?xml[^>]*\?>/, '');
  bodies += `<div class="wrap" data-name="${f}">${svg}</div>`;
}
const script = `
try {
const out = [];
for (const wrap of document.querySelectorAll('.wrap')) {
  const svg = wrap.querySelector('svg');
  const vb = svg ? svg.getAttribute('viewBox') : null;
  const pins = [];
  for (const c of wrap.querySelectorAll('circle[id^="pin-"],ellipse[id^="pin-"]')) {
    const m = c.getCTM();
    if (!m) continue; // élément hors flux (defs) — ignoré
    const cx = parseFloat(c.getAttribute('cx') || '0');
    const cy = parseFloat(c.getAttribute('cy') || '0');
    const x = m.a*cx + m.c*cy + m.e;
    const y = m.b*cx + m.d*cy + m.f;
    pins.push({ name: c.id.replace(/^pin-/, ''), x, y });
  }
  out.push({ name: wrap.dataset.name, viewBox: vb, pins });
}
document.getElementById('result').textContent = JSON.stringify(out);
} catch (e) {
document.getElementById('result').textContent = 'ERR:' + (e && e.stack || e);
}
`;
const htmlPath = join(SCRATCH, 'extract.html');
writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><body>${bodies}<pre id="result"></pre><script>${script}</script></body>`);

const cand = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chrome = cand.find((c) => existsSync(c));
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const i = dom.indexOf('<pre id="result">'), j = dom.indexOf('</pre>', i);
const raw = dom.slice(i + 17, j).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (raw.startsWith('ERR:') || !raw.trim()) { console.error('Echec navigateur:', raw.slice(0, 2000) || '(vide)'); process.exit(1); }
const results = JSON.parse(raw);

const MARGIN = 20;
const r2 = (n) => Math.round(n * 100) / 100;

// Fichier → clé d'override. Exclus : *.OK/*.ok (rien à changer), keypad*.PB
// (déjà géré), uno (non recalé sur grille), 7seg-2dig (non calé). Les variantes
// 7 seg/lcd ont une clé dédiée (résolue par overridesFor).
const MAP = {
  '7seg.edit.svg': '7seg-1dig',
  '7seg-2dig.edit.svg': '7seg-2dig',
  '7seg-4dig.edit.svg': '7seg-4dig',
  'uno.edit.svg': 'uno',
  'button.edit.svg': 'button',
  'button-6mm.edit.svg': 'button-6mm',
  'buzzer.edit.svg': 'buzzer',
  'dht22.edit.svg': 'dht22',
  'dip-switch.edit.svg': 'dip-switch',
  'gas-sensor.edit.svg': 'gas-sensor',
  'hcsr04.edit.svg': 'hcsr04',
  'heartbeat.edit.svg': 'heartbeat',
  'lcd-i2c.edit.svg': 'lcd-i2c',
  'led-bar.edit.svg': 'led-bar',
  'led.edit.svg': 'led',
  'mega.edit.svg': 'mega',
  'microsd.edit.svg': 'microsd',
  'neopixel.edit.svg': 'neopixel',
  'ntc-temp.edit.svg': 'ntc-temp',
  'oled-ssd1306.edit.svg': 'oled-ssd1306',
  'photoresistor.edit.svg': 'photoresistor',
  'pir.edit.svg': 'pir',
  'resistor.edit.svg': 'resistor',
  'rgb-led.edit.svg': 'rgb-led',
  'servo.edit.svg': 'servo',
  'slide-switch.edit.svg': 'slide-switch',
  'sound.edit.svg': 'sound',
  'tilt.edit.svg': 'tilt',
};

const blocks = [];
for (const r of results) {
  const key = MAP[r.name];
  if (!key) { console.error(`(ignoré) ${r.name}`); continue; }
  const svgText = readFileSync(join(DIR, r.name), 'utf8');
  const g = gridOrigin(svgText);
  if (r.pins.length === 0) { console.error(`!! ${r.name} : 0 broche`); continue; }
  const entries = [];
  let flagged = 0;
  for (const p of r.pins) {
    const ovx = p.x - g.x - MARGIN, ovy = p.y - g.y - MARGIN;
    const rx = Math.round(ovx / 10) * 10, ry = Math.round(ovy / 10) * 10;
    if (Math.abs(ovx - rx) > 1.5 || Math.abs(ovy - ry) > 1.5) flagged++;
    entries.push(`    '${p.name}': { x: ${rx}, y: ${ry} },`);
  }
  if (flagged) console.error(`!! ${r.name} : ${flagged} broche(s) hors grille — VÉRIFIER`);
  blocks.push(`  '${key}': {\n${entries.join('\n')}\n  },`);
}
const tsPath = join(SCRATCH, 'overrides-block.txt');
writeFileSync(tsPath, blocks.join('\n'));
console.log(`\nÉcrit : ${tsPath}\n${blocks.length} composants.`);
