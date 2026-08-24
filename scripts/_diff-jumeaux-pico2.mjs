// Compare chaque jumeau Pico 2 du DISQUE à ce que `_spec.mjs` produirait :
// composants déplacés, fils ajoutés/retirés, tracés différents, codeFile.
// Sert avant toute régénération — `_generate.mjs` écrase, et plusieurs bancs
// ont été redisposés à la main.
//   node scripts/_diff-jumeaux-pico2.mjs            (tous)
//   node scripts/_diff-jumeaux-pico2.mjs led-pico2  (ceux-là seulement)
import JSZip from 'jszip';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { testCodeRef, testProjix } from '../testkablix/_paths.mjs';
import { TESTS } from '../testkablix/_spec.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const only = new Set(process.argv.slice(2));

/** Signature comparable d'un composant : type, place, réglages. */
const sigPart = (p) => JSON.stringify({ id: p.id, type: p.type, x: p.x, y: p.y, rotate: p.rotate ?? 0, attrs: p.attrs ?? {} });
/** Signature d'un fil : ses deux extrémités, sa couleur, ses points de passage. */
const cle = (w) => `${w.a.partId}/${w.a.pin}—${w.b.partId}/${w.b.pin}`;

let differents = 0;
for (const t of TESTS.filter((x) => /-pico2w?$/.test(x.name))) {
	if (only.size > 0 && !only.has(t.name)) continue;
	const fichier = testProjix(t);
	if (!existsSync(fichier)) {
		console.log(`${t.name} : ABSENT du disque`);
		differents++;
		continue;
	}
	const zip = await JSZip.loadAsync(readFileSync(fichier));
	const disque = JSON.parse(await zip.file('diagram.json').async('string'));
	const manifest = JSON.parse(await zip.file('kablix.json').async('string'));
	const ecarts = [];

	// Composants : par id, pour nommer celui qui a bougé.
	const aParts = new Map(disque.parts.map((p) => [p.id, p]));
	const bParts = new Map(t.parts.map((p) => [p.id, p]));
	for (const [id, p] of bParts) {
		const q = aParts.get(id);
		if (!q) ecarts.push(`+${id} (spec seule)`);
		else if (sigPart(p) !== sigPart(q)) ecarts.push(`${id} ${q.x},${q.y} ≠ spec ${p.x},${p.y}`);
	}
	for (const id of aParts.keys()) if (!bParts.has(id)) ecarts.push(`-${id} (disque seul)`);

	// Fils : présence, puis tracé.
	const aFils = new Map(disque.wires.map((w) => [cle(w), w]));
	const bFils = new Map(t.wires.map((w) => [cle(w), w]));
	for (const k of bFils.keys()) if (!aFils.has(k)) ecarts.push(`fil manquant ${k}`);
	for (const k of aFils.keys()) if (!bFils.has(k)) ecarts.push(`fil en trop ${k}`);
	let traces = 0;
	for (const [k, w] of bFils) {
		const q = aFils.get(k);
		if (q && JSON.stringify(q.points ?? []) !== JSON.stringify(w.points ?? [])) traces++;
	}
	if (traces) ecarts.push(`${traces} tracé(s) différent(s)`);

	// codeFile : résolu comme l'extension le fait (dossier du .projix, puis
	// racine du dépôt, puis nom seul). Un chemin mort n'ouvre aucun programme.
	const ref = manifest.codeFile;
	const attendu = testCodeRef(t);
	if (!ref) ecarts.push('codeFile ABSENT');
	else {
		const dossier = fichier.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
		const candidats = [`${dossier}/${ref}`, `${ROOT}/${ref}`, `${dossier}/${ref.split('/').pop()}`];
		if (!candidats.some(existsSync)) ecarts.push(`codeFile MORT « ${ref} » (attendu ${attendu})`);
	}

	if (ecarts.length) {
		differents++;
		console.log(`${t.name} : ${ecarts.join(' | ')}`);
	}
}
console.log(`\n${differents} jumeau(x) divergent(s).`);
