// Retire le calque de REPÈRES DE RETOUCHE des schémas internes de clavier.
// Ce calque (une pastille rouge #ee0000 `pin-<nom>` par broche, surmontée de son
// étiquette #aa0000) sert à caler la géométrie dans Inkscape ; livré avec le
// dessin, il pique 7 ou 8 points rouges sur le schéma superposé au composant.
// Même correctif que v2026.7.129 côté dessins externes, ici côté schémas internes.
// Usage : node scripts/_strip-keypad-schema-marks.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'src/webview/composants/interne');
const FILES = [
	'keypad-3col-schema.svg',
	'keypad-3col-touche.schema.svg',
	'keypad-4col-touche.schema.svg',
	'keypad-4col.schema.svg',
];
const check = process.argv.includes('--check');

/** Découpe le <g> ouvert à `open` en respectant les groupes imbriqués. */
function groupAt(s, open) {
	let i = open;
	let depth = 0;
	while (i < s.length) {
		const g = s.indexOf('<g', i);
		const end = s.indexOf('</g>', i);
		if (end < 0) return null;
		if (g >= 0 && g < end) {
			depth++;
			i = g + 2;
		} else {
			depth--;
			if (depth === 0) return { start: open, end: end + 4 };
			i = end + 4;
		}
	}
	return null;
}

let changed = 0;
for (const name of FILES) {
	const p = join(DIR, name);
	let s = readFileSync(p, 'utf8');
	const marks = (t) => (t.match(/#ee0000|#aa0000/g) || []).length;
	if (!marks(s)) {
		console.log(`✅ ${name} — déjà sans repères`);
		continue;
	}
	if (check) {
		console.log(`❌ ${name} — repères encore présents (${marks(s)})`);
		changed++;
		continue;
	}
	let cut = 0;
	// Les repères sont tantôt réunis dans un groupe dédié, tantôt laissés en vrac
	// à la racine du calque (selon le fichier) : on retire d'abord tout groupe
	// qui n'est QUE des repères, puis les pastilles et étiquettes esseulées.
	for (;;) {
		const anchor = s.search(/id="pin-[RC]\d"/);
		if (anchor < 0) break;
		const open = s.lastIndexOf('<g', anchor);
		const span = open >= 0 ? groupAt(s, open) : null;
		const block = span ? s.slice(span.start, span.end) : '';
		const onlyMarks =
			span &&
			block.includes('id="pin-') &&
			!block.replace(/<g\b[^>]*>|<\/g>|<circle\b[^>]*\/>|<text\b[^>]*>[^<]*<\/text>|\s+/g, '');
		if (onlyMarks) {
			cut += (block.match(/<circle/g) || []).length;
			s = s.slice(0, span.start) + s.slice(span.end);
			continue;
		}
		// Pastille esseulée : la retirer seule, avec l'étiquette qui la suit.
		const cs = s.lastIndexOf('<circle', anchor);
		const ce = s.indexOf('/>', anchor);
		if (cs < 0 || ce < 0) throw new Error(`${name} : pastille de repère non délimitée`);
		s = s.slice(0, cs) + s.slice(ce + 2);
		cut++;
	}
	// Étiquettes de nom restées seules (texte #aa0000 : R1, C4…).
	s = s.replace(/\s*<text\b[^>]*fill="#aa0000"[^>]*>[^<]*<\/text>/g, '');
	if (marks(s)) throw new Error(`${name} : repères résiduels (${marks(s)})`);
	writeFileSync(p, s);
	console.log(`✂️  ${name} — ${cut} repères retirés`);
	changed++;
}
if (check && changed) process.exit(1);
