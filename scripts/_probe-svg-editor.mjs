// Diagnostic : quel éditeur SVG Kablix trouve-t-il sur CETTE machine ?
//
// « Ouvrir dans l'éditeur SVG » du créateur de composants ne demande plus rien
// tant qu'il peut trouver : cet outil montre ce qu'il trouve, sans lancer
// VS Code. Usage : node scripts/_probe-svg-editor.mjs
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-svged');
mkdirSync(CACHE, { recursive: true });
await build({
	entryPoints: [join(ROOT, 'src', 'svgEditorDetect.ts')],
	bundle: true,
	format: 'esm',
	platform: 'node',
	external: ['node:*'],
	outfile: join(CACHE, 'detect.mjs'),
});
const m = await import(pathToFileURL(join(CACHE, 'detect.mjs')).href);

const found = await m.detectSvgEditor();
console.log(`système           : ${process.platform}`);
console.log(`éditeur trouvé    : ${found ?? '(aucun — Kablix ouvrira la fenêtre de choix)'}`);
if (found) {
	const { cmd, args } = m.svgEditorLaunch(found, join(CACHE, 'exemple.svg'));
	console.log(`lancement         : ${cmd} ${args.join(' ')}`);
}
console.log(`dossier des applis: ${m.defaultAppsDirPath() ?? '(introuvable)'}`);
console.log(`chemins connus    :`);
for (const p of m.knownSvgEditorPaths()) console.log(`  - ${p}`);
