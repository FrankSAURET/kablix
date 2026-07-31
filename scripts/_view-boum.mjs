// Aperçu du feu des composants grillés (utils/boum.webp) sur les VRAIS forks,
// fond clair puis sombre. Sert à juger le détourage et la taille de l'overlay.
// Usage : node scripts/_view-boum.mjs [dossier de sortie]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-boumview');
const OUT = process.argv[2] ?? CACHE;
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const PARTS = [
  { module: 'led-element.mjs', tag: 'kablix-led', attrs: { color: 'red' } },
  { module: 'rgb-led-element.mjs', tag: 'kablix-rgb-led' },
  { module: '7segment-element.mjs', tag: 'kablix-7segment' },
  { module: 'led-bar-graph-element.mjs', tag: 'kablix-led-bar-graph' },
];

const entry = `
${PARTS.map((p) => `import '../../src/webview/composants/${p.module}';`).join('\n')}
const parts = ${JSON.stringify(PARTS)};
for (const p of parts) {
  const box = document.createElement('div');
  box.className = 'box';
  const el = document.createElement(p.tag);
  for (const [k, v] of Object.entries(p.attrs ?? {})) el.setAttribute(k, v);
  el.burned = true;
  box.appendChild(el);
  document.body.appendChild(box);
}
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: join(ROOT, 'scripts'),
  logLevel: 'silent',
});

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find(existsSync);
if (!chrome) throw new Error('Chrome introuvable (définir CHROME_PATH)');

for (const [tag, bg] of [['clair', '#f5f5f5'], ['sombre', '#1f1f24']]) {
  const page = join(CACHE, `p-${tag}.html`);
  writeFileSync(page, `<!doctype html><meta charset=utf8><style>
    body { background: ${bg}; margin: 0; display: flex; align-items: center;
           gap: 40px; padding: 30px; height: 200px; }
    /* boumOverlay exige un conteneur position:relative (comme les forks). */
    .box { position: relative; display: inline-flex; }
  </style><body><script>${b.outputFiles[0].text}</script>`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--virtual-time-budget=3000', '--window-size=700,260',
    `--screenshot=${join(OUT, `boum-${tag}.png`)}`,
    'file:///' + page.replace(/\\/g, '/')], { stdio: 'ignore' });
  console.log(`  ✓ ${join(OUT, `boum-${tag}.png`)}`);
}
