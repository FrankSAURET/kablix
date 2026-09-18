// Diagnostic item 1.1 : ce que `logicProbeVoies` rend VRAIMENT sur dmx-pico.
// On charge le schéma du .projix et on le passe au modèle réel, sans le
// reconstruire à la main : c'est la seule façon de savoir si le silence vient
// du montage ou du code.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-dmx');
mkdirSync(CACHE, { recursive: true });

// --- le schéma, extrait du .projix (zip) ------------------------------------
const buf = readFileSync(join(ROOT, 'testkablix', 'dmx-pico.projix'));
let diagram = null;
for (let i = 0; i + 30 < buf.length; i++) {
	if (buf.readUInt32LE(i) !== 0x04034b50) continue;
	const methode = buf.readUInt16LE(i + 8);
	const tailleC = buf.readUInt32LE(i + 18);
	const lgNom = buf.readUInt16LE(i + 26);
	const lgExtra = buf.readUInt16LE(i + 28);
	const nom = buf.subarray(i + 30, i + 30 + lgNom).toString('utf8');
	if (!nom.endsWith('diagram.json') || !tailleC) continue;
	const brut = buf.subarray(i + 30 + lgNom + lgExtra, i + 30 + lgNom + lgExtra + tailleC);
	diagram = JSON.parse((methode === 0 ? brut : inflateRawSync(brut)).toString('utf8'));
	break;
}
if (!diagram) { console.log('schéma introuvable'); process.exit(1); }

// --- le modèle réel, empaqueté --------------------------------------------
const b = await esbuild({
	stdin: {
		contents: `
			import { logicProbeVoies, buildNets } from '../../src/webview/diagram/model.mjs';
			export { logicProbeVoies, buildNets };
		`,
		resolveDir: CACHE,
		loader: 'js',
	},
	bundle: true, format: 'esm', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' }, absWorkingDir: ROOT,
});
writeFileSync(join(CACHE, 'm.mjs'), b.outputFiles[0].text);
const { logicProbeVoies, buildNets } = await import('file:///' + join(CACHE, 'm.mjs').replace(/\\/g, '/'));

console.log('voies rendues par le modèle :');
for (const v of logicProbeVoies(diagram)) {
	console.log(`  ${v.partId} voie=${v.voie} pin=${v.pin ?? '—'} suivi=${v.suivi ?? false}` +
		` analogique=${v.analogique ?? false} probleme=${v.probleme ?? '—'} accroche="${v.accroche ?? ''}"`);
}

// Le nœud de Mod1/SIG et celui de U1/GP0 doivent être le MÊME : le fil w-3 les
// relie. S'ils diffèrent, c'est la construction des nœuds qu'il faut regarder,
// pas la sonde.
const nets = buildNets(diagram, false);
console.log('\nnœuds :');
for (const p of [['Mod1', 'SIG'], ['U1', 'GP0'], ['Mod1', '-'], ['Mod1', '+'], ['U1', '3V3']]) {
	console.log(`  ${p[0]}/${p[1]} → ${String(nets.netOf({ partId: p[0], pin: p[1] }))}`);
}
