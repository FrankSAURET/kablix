// Repositionne UNE sonde d'un .projix : accroche et coordonnées.
//
// Le lot .98 a recalé les quatre sondes de sonde-logique-pico ; au passage SD4 a
// changé d'accroche (U1/GP26 → R1/1), ce qui n'était PAS demandé et contredit le
// `expect` de _spec.mjs (« pin: GP26 », le cas de l'entrée analogique). Aucun
// banc ne relit ce .projix, d'où une dérive passée inaperçue — c'est aussi ce
// qui motive le contrôle ajouté à verify-testkablix.
//
// Usage : node scripts/_remet-sd4.mjs <projix> <id> <accroche> <x> <y> [rotate]
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const [cible, id, accroche, x, y, rotate] = process.argv.slice(2);
const zip = await JSZip.loadAsync(readFileSync(cible));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

for (const p of diagram.parts) {
	if (p.id !== id) continue;
	console.log('avant :', JSON.stringify({ x: p.x, y: p.y, rotate: p.rotate, attrs: p.attrs }));
	p.attrs.accroche = accroche;
	p.x = Number(x);
	p.y = Number(y);
	delete p.rotate; // champ parasite d'une première version de ce script
	// Le champ est `rotation`, pas `rotate` : c'est le nom que lisent l'éditeur
	// et _diag-cale-sondes.mjs. Écrire `rotate` ne fait rien du tout, en silence.
	if (rotate !== undefined) p.rotation = Number(rotate);
	console.log('après :', JSON.stringify({ x: p.x, y: p.y, rotation: p.rotation, attrs: p.attrs }));
}
zip.file('diagram.json', JSON.stringify(diagram, null, 2));
writeFileSync(cible, await zip.generateAsync({ type: 'nodebuffer' }));
console.log('écrit :', cible);
