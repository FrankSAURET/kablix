// Pose ponctuelle d'une quatrième sonde sur Mod1/SIG dans testkablix/dmx-pico.projix.
// Écrit le .projix EN PLACE, sans passer par _generate.mjs — celui-ci écrase
// les .projix sans les filtrer et effacerait les trois pinces que Frank a
// posées à la main (dégât déjà payé au lot .91).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const cible = join(root, 'testkablix', 'dmx-pico.projix');
const zip = await JSZip.loadAsync(readFileSync(cible));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

if (diagram.parts.some((p) => p.id === 'SD4')) {
	console.log('SD4 déjà posée — rien à faire.');
} else {
	// Mod1 est en (330,470) et sa patte SIG en (30,70) dans son repère ; la
	// pastille de la sonde est en (10,70) dans le sien. Recouvrement exact :
	// 330+30-10 = 350 et 470+70-70 = 470.
	diagram.parts.push({
		id: 'SD4', type: 'sonde-logique', x: 350, y: 470,
		attrs: { voie: '3', accroche: 'Mod1/SIG', etiquette: 'DMX' },
	});
	// JSON COMPACT et zip DÉFLATÉ, comme l'écrit l'extension : indenter et
	// stocker à plat ferait passer le fichier de 23 Ko à 98 Ko.
	zip.file('diagram.json', JSON.stringify(diagram));
	writeFileSync(cible, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
	console.log('SD4 posée sur Mod1/SIG (350,470).');
}
