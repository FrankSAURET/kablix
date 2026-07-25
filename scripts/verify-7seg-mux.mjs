// Régression 7 segments MULTIPLEXÉ (v2026.7.179) : le latch d'affichage doit
// suivre le nombre courant même quand chaque chiffre n'est éclairé que ~2 ms par
// le balayage MicroPython. Le latch est alimenté à CHAQUE front GPIO
// (engine.onUpdate) — cf. sampleSevenSegLatches dans sim.mts — et non au seul
// rythme du rendu (~16 ms), sinon la plupart des chiffres sont ratés et
// l'affichage défile chiffre par chiffre (bug signalé sur 7seg-pico2.projix).
//
// Le test pilote le VRAI PicoEngine avec le script de multiplexage réel
// (testkablix/7seg-pico.py, forcé à 4 chiffres), échantillonne le latch comme le
// fait sim.mts et décode le nombre affiché. Il exige que le latch corresponde au
// dernier `print(nombre)` du script (au déphasage d'affichage près), et fait la
// contre-épreuve : au seul rythme du rendu, le décodage échoue.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fw = join(root, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (!existsSync(fw)) {
  console.log('SKIP : firmware MicroPython absent (test-assets/RPI_PICO-20230426-v1.20.0.uf2).');
  process.exit(0);
}
const tmp = mkdtempSync(join(tmpdir(), 'kablix-7seg-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({ entryPoints: [join(root, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

const NB = 4;
const source = readFileSync(join(root, 'testkablix', '7seg-pico.py'), 'utf8');
// Le script de test est paramétré à la volée : nombre de chiffres et durée
// d'affichage d'un même nombre (DELAIS, en ms). Frank signale que l'affichage
// « ne suit pas du tout » à DELAIS court → on teste 100 ms ET 50 ms.
const scriptFor = (delais) => source
  .replace(/NB_DIGITS = \d+/, `NB_DIGITS = ${NB}`)
  .replace(/DELAIS=\d+/, `DELAIS=${delais}`);

// Câblage 7seg-pico(.py) : A..G = GP2..GP8, DIG1..DIG4 = GP10..GP13, cathode commune.
const SEG_GP = [2, 3, 4, 5, 6, 7, 8];
const DIG_GP = [10, 11, 12, 13];
const COMMON_ANODE = false;
const CHIFFRES = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F];
const SEG_TO_DIGIT = new Map(CHIFFRES.map((m, d) => [m, d]));

// Reproduit la logique de latch de sim.mts (sampleSevenSegLatches / case 7segment).
function makeLatch(engine) {
  const latch = Array.from({ length: NB }, () => new Array(7).fill(0));
  const sample = () => {
    for (let d = 0; d < NB; d++) {
      const common = engine.readDigital('GP' + DIG_GP[d]) ? 1 : 0;
      const active = COMMON_ANODE ? common === 1 : common === 0;
      if (!active) continue;
      for (let s = 0; s < 7; s++) {
        const seg = engine.readDigital('GP' + SEG_GP[s]) ? 1 : 0;
        latch[d][s] = COMMON_ANODE ? (seg === 0 && common === 1 ? 1 : 0) : (seg === 1 && common === 0 ? 1 : 0);
      }
    }
  };
  const toNumber = () => {
    let n = 0;
    for (let d = 0; d < NB; d++) {
      let motif = 0;
      for (let s = 0; s < 7; s++) if (latch[d][s]) motif |= (1 << s);
      const digit = SEG_TO_DIGIT.get(motif);
      if (digit === undefined) return null;
      n = n * 10 + digit;
    }
    return n;
  };
  return { sample, toNumber };
}

// Un run de RUN_MS ms avec un échantillonnage donné ('hf' = onUpdate, 'raf' = 16 ms).
async function run(mode, RUN_MS, DELAIS = 100) {
  const engine = new PicoEngine({ kind: 'flash', segments, script: scriptFor(DELAIS) });
  const { sample, toNumber } = makeLatch(engine);
  let printed = null;
  let prints = 0;
  let buf = '';
  engine.onSerial = (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (/^\d+$/.test(line)) { printed = Number(line); prints++; }
    }
  };
  let rafTimer = null;
  if (mode === 'hf') engine.onUpdate = () => sample();
  else { engine.onUpdate = () => {}; rafTimer = setInterval(sample, 16); }

  const m = { total: 0, ok: 0, undecoded: 0 };
  const lim = 10 ** NB;
  const cmp = setInterval(() => {
    if (printed === null) return;
    const n = toNumber();
    m.total++;
    if (n === null) m.undecoded++;
    else if (n === printed || n === (printed + 1) % lim) m.ok++;
  }, 30);

  engine.start();
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, RUN_MS));
  const elapsed = Date.now() - t0;
  clearInterval(cmp);
  if (rafTimer) clearInterval(rafTimer);
  engine.dispose();
  // Cadence réelle : le script imprime un nombre tous les DELAIS ms SIMULÉS.
  // prints/s réel ÷ (1000/DELAIS) = facteur de vitesse par rapport au temps réel.
  const speed = prints / (elapsed / 1000) / (1000 / DELAIS);
  return { ...m, printed, prints, speed, pctOk: m.total ? 100 * m.ok / m.total : 0 };
}

const checks = [];
const ok = (name, cond, detail = '') => { checks.push({ name, ok: !!cond, detail: String(detail) }); };

console.log('Banc 7 segments multiplexé (max ~40 s)…');
const hf = await run('hf', 6000, 100);
ok('multiplexage : le script a bien tourné (nombre imprimé)', hf.printed !== null && hf.printed > 0, 'dernier print=' + hf.printed);
ok('multiplexage : chiffres captés (latch décodable, ≤5 % de motifs invalides)',
  hf.total > 0 && hf.undecoded / hf.total <= 0.05, `undecoded ${hf.undecoded}/${hf.total}`);
ok('multiplexage : le latch SUIT le nombre affiché (≥ 80 % de correspondance)',
  hf.pctOk >= 80, `ok ${hf.ok}/${hf.total} = ${hf.pctOk.toFixed(1)} %`);
// Cadence : la simulation doit tenir le temps réel (Frank : « affichage très
// lent »). Marge large — Node en CI est plus lent que la webview.
ok('cadence : la simulation tourne à ≥ 50 % du temps réel',
  hf.speed >= 0.5, `${(hf.speed * 100).toFixed(0)} % (${hf.prints} nombres)`);

// DELAIS court (50 ms) : cas signalé « l'affichage ne suit pas du tout ».
const fast = await run('hf', 6000, 50);
ok('DELAIS court (50 ms) : le latch suit toujours (≥ 80 %)',
  fast.pctOk >= 80, `ok ${fast.ok}/${fast.total} = ${fast.pctOk.toFixed(1)} %`);

// Contre-épreuve : au seul rythme du rendu, le latch ne suit PAS (chiffres ratés).
const raf = await run('raf', 6000, 100);
ok('contre-épreuve : au seul rythme du rendu, le latch NE suit PAS (< 60 %)',
  raf.pctOk < 60, `rendu-seul ok = ${raf.pctOk.toFixed(1)} % (${raf.ok}/${raf.total})`);

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `7seg-mux : ${fail} échec(s).` : `7seg-mux : ${checks.length} contrôles OK — le latch multiplexé suit le nombre affiché.`);
process.exit(fail ? 1 : 0);
