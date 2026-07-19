// TEMP — zoom ×7 sur l'interrupteur du Grove Shield dans ses deux positions.
import { writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-grove');

const entry = `
import '../../src/webview/composants/grove-shield-element.mjs';
for (const lab of ['5v', '3v3']) {
	const el = document.createElement('kablix-grove-pico');
	el.setAttribute('pwr', lab);
	const w = document.createElement('div');
	w.style.cssText = 'display:inline-block;width:390px;height:330px;overflow:hidden;vertical-align:top';
	const z = document.createElement('div');
	z.style.cssText = 'transform:scale(7);transform-origin:0 0';
	z.appendChild(el);
	w.appendChild(z);
	document.body.appendChild(w);
}
`;
writeFileSync(join(CACHE, 'sw.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'sw.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
writeFileSync(join(CACHE, 'sw2.html'), `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', `--user-data-dir=${process.env.TEMP}\\kbx-chrome`, '--virtual-time-budget=6000', '--window-size=850,360', `--screenshot=${join(CACHE, 'sw2.png')}`, `file:///${join(CACHE, 'sw2.html').replace(/\\/g, '/')}`], { stdio: 'inherit' });
console.log('ok');
