// TEMP — zoom sur le bouton de tension : 0 / 7,5 / 15 / 30 V côte à côte. À supprimer.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-alim');

const entry = `
import '../../src/webview/composants/alim-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	for (const v of [0, 7.5, 15, 30]) {
		const el = document.createElement('kablix-alim');
		el.setAttribute('voltage', String(v));
		// Cadre décalé pour ne voir que le quart droit (bouton) : clip via wrapper.
		const w = document.createElement('div');
		w.style.cssText = 'display:inline-block;overflow:hidden;width:90px;height:110px;margin:4px;vertical-align:top;border:1px solid #ccc';
		const inner = document.createElement('div');
		inner.style.cssText = 'margin-left:-190px;width:280px;height:110px';
		inner.appendChild(el);
		w.appendChild(inner);
		document.body.appendChild(w);
	}
	await wait(200);
}
run();
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'k.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'k.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
writeFileSync(
	join(CACHE, 'k.html'),
	`<!doctype html><meta charset=utf8><body style="margin:0;background:#fff"><script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', `--user-data-dir=${process.env.TEMP}\\kbx-chrome`, '--virtual-time-budget=8000', '--window-size=1700,520', '--force-device-scale-factor=4', `--screenshot=${join(CACHE, 'knob.png')}`, `file:///${join(CACHE, 'k.html').replace(/\\/g, '/')}`], { stdio: 'ignore' });
console.log('Capture :', join(CACHE, 'knob.png'));
