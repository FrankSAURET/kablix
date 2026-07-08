// Rendu screenshot du servo à plusieurs angles.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';

const ROOT = 'h:/OneDrive/4 Programation/- VS Code/Extensions/Kablix';
const SCRATCH = 'V:/Temp/claude/h--OneDrive-4-Programation---VS-Code-Extensions-Kablix/4399a11b-7840-485c-9d88-83dc00070382/scratchpad';

const entry = `
import '${ROOT}/src/webview/composants/servo-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const angles = [0, 45, 90, 135, 180];
  for (const a of angles) {
    const el = document.createElement('kablix-servo');
    el.angle = a;
    document.body.querySelector('#row').appendChild(el);
    try { if (el.updateComplete) await el.updateComplete; } catch (e) {}
  }
  await wait(120);
  // force le updated (angle) une 2e fois car le fill peut n'être trouvé qu'après 1er rendu
  for (const el of document.querySelectorAll('kablix-servo')) el.requestUpdate();
  await wait(120);
  document.getElementById('ready').textContent = 'OK';
}
run();
`;

const entryPath = join(SCRATCH, 'entry-servo.mjs');
writeFileSync(entryPath, entry);

const bundle = await esbuild({
  entryPoints: [entryPath], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text' }, absWorkingDir: ROOT,
});
const js = bundle.outputFiles[0].text;

const htmlPath = join(SCRATCH, 'page-servo.html');
writeFileSync(htmlPath,
  `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#eee}#row{display:flex;gap:8px}kablix-servo{outline:1px solid red;background:#fff}</style><body><span id="ready"></span><div id="row"></div><script>${js}</script></body>`
);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const shot = join(SCRATCH, 'servo.png');
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=8000', '--window-size=1000,220',
  `--screenshot=${shot}`, `file:///${htmlPath.replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
console.log('shot OK');
