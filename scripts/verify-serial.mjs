// Moniteur série : le texte reçu du firmware doit être TAMPONNÉ en JavaScript et
// porté dans le DOM une fois par frame. Avant (v205), chaque octet relisait puis
// réécrivait `textContent` en entier et lisait `scrollHeight` (reflow forcé) —
// coût O(taille de la console) PAR CARACTÈRE. Comme `onSerial` est appelé depuis
// la boucle d'exécution du microcontrôleur, ce temps était pris sur la simulation
// : mesuré à ~36 SECONDES pour 18 000 octets, d'où les sketches bavards (HC-SR04,
// capteurs) qui tournaient des dizaines de fois trop lentement.
//
// Trois volets : la logique du tampon (Node), le coût réel dans un navigateur
// (Chrome headless) et le câblage de sim.mts (contrôle statique).
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-serial-'));

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// ---------------------------------------------------------------- logique ----

/** Nœud texte minimal : `flush` teste `instanceof Text` et appelle `appendData`. */
class FakeText {
  constructor(data) {
    this.data = data;
  }
  appendData(s) {
    this.data += s;
  }
}
globalThis.Text = FakeText;

/** Élément console minimal : retient le nombre d'écritures COMPLÈTES du texte. */
class FakeEl {
  constructor() {
    this.childNodes = [];
    this.scrollTop = 0;
    this.scrollHeight = 42;
    this.rewrites = 0;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get textContent() {
    return this.childNodes.map((n) => n.data).join('');
  }
  set textContent(v) {
    this.rewrites++;
    this.childNodes = v === '' ? [] : [new FakeText(v)];
  }
}

const out = join(tmp, 'serialbuffer.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/serialbuffer.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { SerialConsole, SERIAL_MAX_CHARS } = await import(pathToFileURL(out).href);

{
  const c = new SerialConsole();
  c.write('distance = 12 cm\n');
  check('texte simple conservé', c.value === 'distance = 12 cm\n', JSON.stringify(c.value));
}

{
  // CR avalé : en `white-space: pre-wrap` le CRLF ferait un double saut de ligne.
  const c = new SerialConsole();
  c.write('a\r\nb\r\n');
  check('CR avalé, LF gardé', c.value === 'a\nb\n', JSON.stringify(c.value));
}

{
  const c = new SerialConsole();
  c.write('abc\b\bZ');
  check('backspace efface un caractère', c.value === 'aZ', JSON.stringify(c.value));
  const d = new SerialConsole();
  d.write('abc\x7f');
  check('DEL efface un caractère', d.value === 'ab', JSON.stringify(d.value));
}

{
  // Séquences ANSI (couleurs, effacement de ligne) : ignorées jusqu'à leur lettre.
  const c = new SerialConsole();
  c.write('\x1b[31mrouge\x1b[0m\x1b[K!');
  check('séquences ANSI ignorées', c.value === 'rouge!', JSON.stringify(c.value));
}

{
  // Une séquence coupée entre deux chunks doit rester avalée.
  const c = new SerialConsole();
  c.write('x\x1b[3');
  c.write('1mok');
  check('ANSI à cheval sur deux chunks', c.value === 'xok', JSON.stringify(c.value));
}

{
  const c = new SerialConsole();
  const el = new FakeEl();
  c.write('bonjour');
  c.flush(el);
  check('premier flush écrit le texte', el.textContent === 'bonjour', el.textContent);
  const r0 = el.rewrites;
  for (let i = 0; i < 50; i++) {
    c.write(` ${i}`);
    c.flush(el);
  }
  check(
    'croissance = ajout du delta, sans réécriture',
    el.rewrites === r0 && el.textContent === c.value,
    `rewrites ${el.rewrites} (départ ${r0})`,
  );
  check('flush sans nouveauté ne touche pas le DOM', (c.flush(el), el.rewrites === r0));
  check('défilement en bas', el.scrollTop === el.scrollHeight);
}

{
  // Un backspace retire du texte : l'ajout simple ne suffit plus, il faut réécrire.
  const c = new SerialConsole();
  const el = new FakeEl();
  c.write('abc');
  c.flush(el);
  const r0 = el.rewrites;
  c.write('\bZ');
  c.flush(el);
  check(
    'backspace force la réécriture complète',
    el.rewrites === r0 + 1 && el.textContent === 'abZ',
    `${el.rewrites - r0} réécriture(s), « ${el.textContent} »`,
  );
}

{
  const c = new SerialConsole();
  const el = new FakeEl();
  c.write('plein de texte');
  c.flush(el);
  c.clear();
  c.flush(el);
  check('clear vide la console', c.value === '' && el.textContent === '', el.textContent);
}

{
  // Plafond : au-delà, le DÉBUT est oublié (sinon la page enfle sans fin).
  const c = new SerialConsole();
  const el = new FakeEl();
  c.write('x'.repeat(SERIAL_MAX_CHARS + 5_000));
  check('plafond respecté', c.value.length === SERIAL_MAX_CHARS, `${c.value.length} caractères`);
  c.write('FIN');
  c.flush(el);
  check(
    'la fin du texte est conservée',
    el.textContent.endsWith('FIN') && el.textContent.length === SERIAL_MAX_CHARS,
    `${el.textContent.length} caractères`,
  );
}

// ------------------------------------------------------------- câblage UI ----

const sim = readFileSync(join(root, 'src/webview/sim.mts'), 'utf8');
check("sim.mts utilise SerialConsole", /new SerialConsole\(\)/.test(sim));
check(
  'le flush est coalescé par requestAnimationFrame',
  /serialFlushQueued\s*=\s*true;\s*\n\s*requestAnimationFrame\(flushSerial\)/.test(sim),
);
check(
  "plus d'écriture directe du DOM par octet",
  !/serialEl\.textContent\s*=/.test(sim) && !/serialEl\.scrollTop/.test(sim),
  'sim.mts touche encore serialEl à chaque octet',
);

// -------------------------------------------------------- coût réel (DOM) ----

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH ?? '',
].find((p) => p && existsSync(p));

if (!chrome) {
  console.log('ℹ️  Chrome introuvable : mesure du coût DOM ignorée');
} else {
  const OCTETS = 20_000;
  const entry = `
import { SerialConsole } from '${(root + 'src/webview/serialbuffer.mjs').replace(/\\/g, '/')}';
const el = document.createElement('pre');
el.style.cssText = 'white-space:pre-wrap;height:200px;overflow:auto;font:12px monospace';
document.body.appendChild(el);
const ligne = 'distance = 200 cm\\n';
const c = new SerialConsole();
const t0 = performance.now();
let n = 0;
// Le firmware transmet OCTET PAR OCTET ; le DOM n'est touché qu'une fois par frame.
while (n < ${OCTETS}) {
  for (const ch of ligne) { c.write(ch); n++; }
  if (n % 512 < ligne.length) c.flush(el);
}
c.flush(el);
const ms = performance.now() - t0;
const pre = document.createElement('pre'); pre.id = 'm';
pre.textContent = JSON.stringify({ octets: n, ms: Math.round(ms), caracteres: c.value.length });
document.body.appendChild(pre);
`;
  writeFileSync(join(tmp, 'e.mjs'), entry);
  const bundle = await esbuild.build({
    entryPoints: [join(tmp, 'e.mjs')],
    bundle: true,
    format: 'iife',
    write: false,
    absWorkingDir: join(root, 'scripts'),
    logLevel: 'silent',
  });
  const page = join(tmp, 'p.html');
  writeFileSync(page, `<!doctype html><meta charset=utf8><body><script>${bundle.outputFiles[0].text}</script>`);
  const dom = execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=60000',
      '--dump-dom',
      `file:///${page.replace(/\\/g, '/')}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const m = dom.match(/<pre id="m">([\s\S]*?)<\/pre>/);
  if (!m) {
    check('mesure du coût DOM', false, 'pas de résultat rendu');
  } else {
    const r = JSON.parse(m[1]);
    // Repère : la méthode « un textContent par octet » demandait ~36 000 ms pour
    // 18 000 octets. Seuil très large : on garde seulement l'ordre de grandeur.
    check(
      `${r.octets} octets écrits en ${r.ms} ms (seuil 2000 ms)`,
      r.ms < 2000,
      'le moniteur série repasse en coût quadratique',
    );
    check('tout le texte est arrivé', r.caracteres === r.octets, `${r.caracteres} caractères`);
  }
}

console.log(failures === 0 ? '\n✅ moniteur série : OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
