// Zoom sur l'inter à bascule du multimètre, dans les deux modes.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = join(ROOT, 'node_modules', '.cache-diag');
mkdirSync(SCRATCH, { recursive: true });
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((c) => existsSync(c));

const entry = `
import '../../src/webview/composants/multimetre-element.mjs';
for (const mode of ['current', 'voltage']) {
  const box = document.createElement('div');
  box.style.cssText = 'width:340px;height:280px;overflow:hidden;display:inline-block;border:1px solid #555';
  const el = document.createElement('kablix-multimetre');
  el.setAttribute('mode', mode);
  el.style.cssText = 'display:block;transform:scale(6);transform-origin:0 0;margin-left:-1290px;margin-top:-30px';
  el.reading = mode === 'current' ? 0.0499 : 5;
  box.appendChild(el);
  document.body.appendChild(box);
}
`;
const entryPath = join(SCRATCH, 'entry-lev.mjs');
writeFileSync(entryPath, entry);
const bundle = await esbuild({ entryPoints: [entryPath], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' } });
const htmlPath = join(SCRATCH, 'levier.html');
writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#333}</style><body><script>${bundle.outputFiles[0].text}</script></body>`);
const shot = join(SCRATCH, 'levier.png');
execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--virtual-time-budget=6000', `--screenshot=${shot}`, '--window-size=700,290',
  `file:///${htmlPath.replace(/\\/g, '/')}`], { stdio: 'ignore' });
console.log('capture:', shot);
