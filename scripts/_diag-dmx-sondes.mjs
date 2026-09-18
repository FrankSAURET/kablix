// Diagnostic item 1.1 : « sur dmx-pico, je ne vois toujours rien ».
// On ouvre le .projix (archive zip) et on regarde ce que les sondes pincent
// réellement : accrochage, voie, et le nœud où mène le fil éventuel.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichier = join(ROOT, 'testkablix', 'dmx-pico.projix');

// Lecture zip minimale : on cherche les entrées stockées/déflatées par leur
// en-tête local, sans dépendance — le projet n'embarque pas de lecteur zip.
const buf = readFileSync(fichier);
const entrees = [];
for (let i = 0; i + 30 < buf.length; i++) {
	if (buf.readUInt32LE(i) !== 0x04034b50) continue;
	const methode = buf.readUInt16LE(i + 8);
	const tailleC = buf.readUInt32LE(i + 18);
	const tailleD = buf.readUInt32LE(i + 22);
	const lgNom = buf.readUInt16LE(i + 26);
	const lgExtra = buf.readUInt16LE(i + 28);
	const nom = buf.subarray(i + 30, i + 30 + lgNom).toString('utf8');
	const debut = i + 30 + lgNom + lgExtra;
	if (!tailleC) continue;
	const brut = buf.subarray(debut, debut + tailleC);
	let contenu = null;
	// Dans un zip, le contenu déflaté est un flux BRUT (sans en-tête zlib).
	try { contenu = methode === 0 ? brut : inflateRawSync(brut); } catch { /* entrée illisible */ }
	if (contenu) entrees.push({ nom, taille: tailleD, contenu });
}
console.log('entrées : ' + entrees.map((e) => e.nom).join(', '));

// Le schéma est dans `diagram.json` ; `kablix.json` ne porte que les métadonnées.
const json = entrees.find((e) => e.nom.endsWith('diagram.json'));
if (!json) { console.log('aucun schéma JSON trouvé'); process.exit(0); }
const d = JSON.parse(json.contenu.toString('utf8'));

const sondes = (d.parts ?? []).filter((p) => p.type === 'sonde-logique');
console.log(`\n${sondes.length} sonde(s) :`);
for (const s of sondes) {
	console.log(`  ${s.id} @${s.x},${s.y} accroche="${s.attrs?.accroche ?? ''}" voie="${s.attrs?.voie ?? ''}"`);
}

console.log(`\n${(d.wires ?? []).length} fil(s) touchant une sonde :`);
for (const w of d.wires ?? []) {
	const pts = [w.from, w.to].map((e) => `${e?.partId ?? '?'}/${e?.pin ?? '?'}`);
	if (pts.some((p) => sondes.some((s) => p.startsWith(s.id + '/')))) console.log('  ' + pts.join('  ↔  '));
}

console.log('\ncomposants : ' + (d.parts ?? []).map((p) => `${p.id}:${p.type}`).join(', '));

// Tous les fils, pour situer Mod1/SIG par rapport aux broches du Pico.
// La forme exacte d'un fil n'est pas supposée : on l'imprime telle quelle.
console.log('\ntous les fils :');
for (const w of d.wires ?? []) {
	console.log('  ' + JSON.stringify(w));
}
