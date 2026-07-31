// LED embarquées des cartes, en Chrome headless sur les VRAIS forks.
//
// Régression relevée par Frank : `blink-mega` (et `blink-uno`, `blink-nano`) ne
// montrait rien — la LED L de la carte ne s'allumait jamais. Cause : le rendu de
// simulation ne pilotait QUE le Pico (`ledPower` sur GP25) ; `led13` et la LED
// verte « ON » des cartes AVR n'étaient écrites nulle part, alors que les trois
// forks savent les dessiner depuis toujours.
//
// Ce banc rend chaque carte, pose les propriétés, et compte les cercles de LED
// RÉELLEMENT dessinés (pas une lecture de la source) ; puis il contrôle que
// sim.mts écrit bien ces propriétés à chaque rafraîchissement.
//
// Usage : node scripts/verify-boardleds.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-boardleds');
mkdirSync(CACHE, { recursive: true });
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// --- 1. Rendu : la LED L (D13) et la LED ON s'allument vraiment --------------
const entry = `
import '${SRC}/composants/arduino-uno-element.mjs';
import '${SRC}/composants/arduino-mega-element.mjs';
import '${SRC}/composants/arduino-nano-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Cercles de LED dessinés par-dessus le dessin de la carte, par couleur. */
function leds(el) {
  const out = {};
  for (const c of el.renderRoot.querySelectorAll('circle[fill]')) {
    const f = c.getAttribute('fill').toLowerCase();
    out[f] = (out[f] ?? 0) + 1;
  }
  return out;
}
async function run() {
  const res = {};
  for (const tag of ['kablix-arduino-uno', 'kablix-arduino-mega', 'kablix-arduino-nano']) {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await el.updateComplete;
    await wait(20);
    const off = leds(el);
    el.led13 = true;
    el.ledPower = true;
    await el.updateComplete;
    const on = leds(el);
    el.led13 = false;
    await el.updateComplete;
    const back = leds(el);
    res[tag] = { off, on, back };
  }
  const pre = document.createElement('pre'); pre.id = 'm';
  pre.textContent = JSON.stringify(res); document.body.appendChild(pre);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: join(ROOT, 'scripts'), logLevel: 'silent',
});
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body><script>${b.outputFiles[0].text}</script>`);

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (chrome) {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=20000', '--dump-dom',
    `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const raw = dom.match(/<pre id="m">([\s\S]*?)<\/pre>/);
  const R = raw ? JSON.parse(raw[1].replace(/&quot;/g, '"')) : null;
  check('rendu : les trois cartes se rendent en Chrome headless', !!R);
  // Couleur du pastille de la LED L selon la carte : rouge sur Uno et Mega,
  // JAUNE sur le Nano (couleur du dessin d'origine). La LED ON est verte partout.
  const L13 = { uno: '#ff8080', mega: '#ff8080', nano: '#ffff80' };
  const ON = '#80ff80';
  for (const [tag, r] of Object.entries(R ?? {})) {
    const name = tag.replace('kablix-arduino-', '');
    const l = L13[name];
    // Le nombre de cercles allumés compte : les forks ne les dessinent que quand
    // la propriété correspondante est vraie (LED éteinte = aucun cercle).
    check(`${name} : aucune LED allumée au repos`,
      !r.off[l] && !r.off[ON], JSON.stringify(r.off));
    check(`${name} : led13 → la LED L s'allume`, (r.on[l] ?? 0) >= 1, JSON.stringify(r.on));
    check(`${name} : ledPower → la LED ON (verte) s'allume`, (r.on[ON] ?? 0) >= 1, JSON.stringify(r.on));
    // Sur le Nano la LED ON est verte elle aussi : après extinction de la L, il
    // doit rester exactement les cercles verts (donc un de moins qu'allumées).
    check(`${name} : led13 retombe → la LED L s'éteint, la verte reste`,
      (r.back[l] ?? 0) === (l === ON ? 1 : 0) && (r.back[ON] ?? 0) >= 1, JSON.stringify(r.back));
  }
} else {
  console.log('Chrome introuvable — contrôles de rendu sautés');
}

// --- 2. Câblage : sim.mts pilote ces propriétés à chaque rafraîchissement ----
const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
const mcu = sim.match(/case 'mcu':[\s\S]{0,900}?\n\s*break;/);
check('sim : le cas « mcu » du rafraîchissement existe', !!mcu);
check('sim : LED L des cartes AVR pilotée par la broche 13 (LED_BUILTIN)',
  !!mcu && /led13 = engine\.readDigital\('13'\)/.test(mcu[0]),
  mcu ? mcu[0].replace(/\s+/g, ' ').slice(0, 160) : '');
check('sim : LED verte « ON » allumée tant que la carte AVR tourne',
  !!mcu && /ledPower = true/.test(mcu[0]));
check('sim : le Pico garde sa LED embarquée GP25 (aucune régression)',
  !!mcu && /rp2040'\) \{[\s\S]{0,120}?ledPower = engine\.readDigital\('GP25'\)/.test(mcu[0]));

// --- 3. Les broches 13 existent bien dans les deux tables du moteur AVR ------
const avr = readFileSync(join(ROOT, 'src/webview/engines/avr.mts'), 'utf8');
for (const [board, table] of [['Uno / Nano', 'UNO_PINS'], ['Mega', 'MEGA_PINS']]) {
  const t = avr.match(new RegExp(`const ${table}[\\s\\S]*?\\n\\};`));
  check(`moteur : la broche 13 est déclarée pour ${board}`,
    !!t && /'13': \['[A-L]', \d+\]/.test(t[0]));
}

// --- 4. L'aide dit ce que montrent ces LED ----------------------------------
for (const [lang, needles] of [
  ['fr', ['led_builtin', 'd13', 'gp25']],
  ['en', ['led_builtin', 'd13', 'gp25']],
]) {
  const doc = readFileSync(join(ROOT, `docs/${lang}/USAGE.md`), 'utf8').toLowerCase();
  const absent = needles.filter((n) => !doc.includes(n));
  check(`aide ${lang.toUpperCase()} : la LED embarquée des cartes est documentée`,
    absent.length === 0, 'manque : ' + absent.join(' · '));
}

console.log(failures
  ? `boardleds : ${failures} échec(s).`
  : 'boardleds : tout est vert — LED L (D13) et LED ON animées sur Uno, Mega et Nano.');
process.exit(failures ? 1 : 0);
